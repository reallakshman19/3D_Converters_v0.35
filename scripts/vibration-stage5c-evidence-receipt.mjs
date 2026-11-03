import {
  CONTROLLED_EI_SOURCE,
  assertControlledEiSource,
} from './vibration-stage5c-targets.mjs';

export const VIBRATION_STAGE5C_DECISION_SCHEMA = 'VibrationStage5cSourceTargetDecision.v1';
export const VIBRATION_STAGE5C_AUTHORITY = Object.freeze({
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
});

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const DECISION_STATES = new Set(['accepted', 'review_required', 'blocked', 'not_found']);
const STATE_RANK = Object.freeze({ accepted: 0, not_found: 1, review_required: 2, blocked: 3 });

export function buildStage5cSourceBinding(source) {
  assertControlledEiSource(source);
  return {
    expectedRepository: CONTROLLED_EI_SOURCE.repository,
    expectedCommit: CONTROLLED_EI_SOURCE.commit,
    expectedPath: CONTROLLED_EI_SOURCE.path,
    expectedGitBlobSha1: CONTROLLED_EI_SOURCE.gitBlobSha1,
    expectedSizeBytes: CONTROLLED_EI_SOURCE.sizeBytes,
    runtimeSourceSha256: source.sha256,
    runtimeLogicalPath: source.logicalPath,
    runtimeSizeBytes: source.sizeBytes,
    providerReportedGitIdentity: source.git ?? null,
    gitBlobRuntimeRecomputed: false,
    bindingStatement: 'GIT_OBJECT_VERIFIED_SEPARATELY_RUNTIME_BOUND_BY_PATH_SIZE_AND_SOURCE_SHA256',
  };
}

function candidateId(table) {
  const id = table?.candidate?.candidateId;
  if (typeof id !== 'string' || !id) {
    throw new Error('VIBRATION_STAGE5C_TABLE_CANDIDATE_ID_REQUIRED');
  }
  return id;
}

function assertTableCell(cell) {
  const valid = typeof cell?.cellId === 'string'
    && Number.isInteger(cell?.rowIndex) && cell.rowIndex >= 0
    && Number.isInteger(cell?.columnIndex) && cell.columnIndex >= 0
    && cell?.geometry && typeof cell.geometry === 'object'
    && Array.isArray(cell?.observationHashes) && cell.observationHashes.length > 0
    && cell.observationHashes.every((hash) => SHA256.test(String(hash || '')));
  if (!valid) throw new Error('VIBRATION_STAGE5C_TABLE_PASS_CELL_EVIDENCE_INVALID');
}

function assertTablePass(tablePass, table, sourceHash) {
  const valid = tablePass?.schema === 'TablePass.v1'
    && tablePass?.sourceHash === sourceHash
    && tablePass?.tableCandidateId === candidateId(table)
    && SHA256.test(String(tablePass?.tablePassHash || ''))
    && SHA256.test(String(tablePass?.surfaceHash || ''))
    && typeof tablePass?.tablePassId === 'string'
    && typeof tablePass?.passId === 'string'
    && typeof tablePass?.surfaceId === 'string'
    && Array.isArray(tablePass?.cells);
  if (!valid) throw new Error('VIBRATION_STAGE5C_TABLE_PASS_INVALID');
  tablePass.cells.forEach(assertTableCell);
}

function assertTableEvidence(table, sourceHash) {
  candidateId(table);
  if (!Array.isArray(table?.observations) || !Array.isArray(table?.cellDecisions)) {
    throw new Error('VIBRATION_STAGE5C_TABLE_EVIDENCE_INVALID');
  }
  const invalidObservation = table.observations.some((item) => (
    item?.schema !== 'Observation.v1'
    || item?.sourceHash !== sourceHash
    || !SHA256.test(String(item?.observationHash || ''))
  ));
  if (invalidObservation) throw new Error('VIBRATION_STAGE5C_TABLE_OBSERVATION_INVALID');
  assertTablePass(table.tablePass, table, sourceHash);
}

function chooseCandidateEvidence(selection, tables) {
  if (selection.candidateIds.length === 0) {
    if (tables.length === 0) return { state: 'not_found', tables: [], codes: ['TABLE_CANDIDATE_NOT_FOUND'] };
    if (tables.length > 1) {
      return {
        state: 'review_required', tables,
        codes: ['MULTIPLE_TABLE_CANDIDATES_REQUIRE_EXPLICIT_SELECTION'],
      };
    }
    return { state: 'accepted', tables, codes: [] };
  }
  const byId = new Map(tables.map((table) => [candidateId(table), table]));
  const missing = selection.candidateIds.filter((id) => !byId.has(id));
  const selected = selection.candidateIds.filter((id) => byId.has(id)).map((id) => byId.get(id));
  if (missing.length) {
    return {
      state: 'blocked', tables: selected,
      codes: ['TABLE_CANDIDATE_NOT_FOUND'], missingCandidateIds: missing,
    };
  }
  return { state: 'accepted', tables: selected, codes: [] };
}

function validateDecision(decision) {
  const hashes = decision?.observationHashes;
  const validShape = decision?.schema === 'EvidenceDecision.v1'
    && DECISION_STATES.has(decision?.state)
    && Array.isArray(hashes)
    && Array.isArray(decision?.diagnosticCodes)
    && hashes.every((hash) => SHA256.test(String(hash || '')));
  if (!validShape) return { state: 'blocked', code: 'EVIDENCE_DECISION_INVALID' };
  if (decision.state === 'accepted') {
    const selected = decision.selectedObservationHash;
    if (!SHA256.test(String(selected || '')) || !hashes.includes(selected)) {
      return { state: 'blocked', code: 'EVIDENCE_DECISION_SELECTION_REQUIRED' };
    }
  }
  const hasEffective = Object.hasOwn(decision, 'effectiveText')
    || Object.hasOwn(decision, 'effectiveNumericValue');
  if (decision.state !== 'accepted' && hasEffective) {
    return { state: 'blocked', code: 'EVIDENCE_DECISION_EFFECTIVE_VALUE_FORBIDDEN' };
  }
  return { state: decision.state, code: null };
}

function cellDecisionState(tables) {
  const decisions = tables.flatMap(({ cellDecisions }) => cellDecisions);
  if (!decisions.length) {
    return { state: 'review_required', codes: ['TABLE_CELL_DECISIONS_REQUIRED'] };
  }
  let state = 'accepted';
  const codes = new Set();
  for (const decision of decisions) {
    const checked = validateDecision(decision);
    if (STATE_RANK[checked.state] > STATE_RANK[state]) state = checked.state;
    if (checked.code) codes.add(checked.code);
    for (const code of decision?.diagnosticCodes || []) codes.add(code);
  }
  return { state, codes: [...codes].sort() };
}

function blockingExtractionDiagnostics(diagnostics) {
  return (diagnostics || [])
    .filter((item) => item?.blocksTrustedUse === true)
    .map((item) => item.code || 'EXTRACTION_DIAGNOSTIC_BLOCKED_TRUSTED_USE');
}

function combineState(...states) {
  return states.reduce((current, state) => (
    STATE_RANK[state] > STATE_RANK[current] ? state : current
  ), 'accepted');
}

export function buildStage5cSourceTargetDecision(selection, extraction) {
  extraction.tables.forEach((table) => assertTableEvidence(table, extraction.sourceHash));
  const choice = chooseCandidateEvidence(selection, extraction.tables);
  const cells = choice.tables.length
    ? cellDecisionState(choice.tables)
    : { state: choice.state, codes: [] };
  const blockingCodes = blockingExtractionDiagnostics(extraction.diagnostics);
  const evidenceDecision = combineState(
    choice.state,
    cells.state,
    blockingCodes.length ? 'blocked' : 'accepted',
  );
  const diagnosticCodes = [...new Set([
    ...choice.codes,
    ...cells.codes,
    ...blockingCodes,
  ])].sort();
  return {
    schema: VIBRATION_STAGE5C_DECISION_SCHEMA,
    selectionId: selection.selectionId,
    masterId: selection.masterId,
    mechanismId: selection.mechanismId,
    sourceKind: selection.sourceKind,
    source: extraction.source,
    sourceBinding: buildStage5cSourceBinding(extraction.source),
    pages: selection.pages,
    sourceLocator: selection.sourceLocator,
    selectedCandidateIds: choice.tables.map(candidateId),
    ...(choice.missingCandidateIds ? { missingCandidateIds: choice.missingCandidateIds } : {}),
    evidenceDecision,
    publicationState: evidenceDecision === 'accepted' ? 'CANDIDATE' : 'BLOCKED',
    diagnosticCodes,
    extractionDiagnostics: extraction.diagnostics,
    candidateEvidence: choice.tables,
    masterValuesPublished: false,
    authority: VIBRATION_STAGE5C_AUTHORITY,
  };
}
