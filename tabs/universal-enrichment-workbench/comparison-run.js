import { deepFreezeArtifact, findJsonSafetyErrors } from './extraction-rule.js';
import { sha256Hex } from './source-envelope.js';
import { createComparisonIdentity, graphComparisonIdentity, canonicalComparisonJson } from './comparison-identity.js';
import { createMasterAttachmentSetIdentity, validateMasterFieldBindingConfig } from './comparison-binding.js';
import { normalizeComparisonValue } from './comparison-normalize.js';
import { buildMasterColumnIndex } from './comparison-index.js';

export const COMPARISON_LIMITS = Object.freeze({
  candidateEntries: 20000, indexedRows: 100000, matchesPerResult: 10000, comparisonResults: 50000,
});

export class CandidateComparisonBuildError extends Error {
  constructor(code, message) { super(message); this.name = 'CandidateComparisonBuildError'; this.code = code; }
}

function fail(code, message) { throw new CandidateComparisonBuildError(code, message); }
function registryMap(registry) { return new Map((registry?.datasets || []).map((item) => [item.datasetId, item])); }

function candidateRows(ledger) {
  const rows = [];
  for (const entry of ledger?.entries || []) {
    if (entry.status !== 'candidate') continue;
    for (const candidate of entry.candidates || []) rows.push({ entry, candidate });
  }
  return rows;
}

function enforcePreflight(candidates, bindings, datasets) {
  if (candidates.length > COMPARISON_LIMITS.candidateEntries) fail('CANDIDATE_LIMIT', `Candidate limit ${COMPARISON_LIMITS.candidateEntries} exceeded.`);
  let indexedRows = 0; let resultCount = 0;
  for (const binding of bindings) indexedRows += (datasets.get(binding.datasetId)?.rows || []).length;
  for (const row of candidates) resultCount += bindings.filter((binding) => binding.fieldKey === row.entry.fieldKey).length || 0;
  if (indexedRows > COMPARISON_LIMITS.indexedRows) fail('INDEXED_ROW_LIMIT', `Indexed-row limit ${COMPARISON_LIMITS.indexedRows} exceeded.`);
  if (resultCount > COMPARISON_LIMITS.comparisonResults) fail('RESULT_LIMIT', `Comparison-result limit ${COMPARISON_LIMITS.comparisonResults} exceeded.`);
}

async function createMatch(resultId, binding, evidence, hashText) {
  const matchId = await createComparisonIdentity('candidate-master-match', {
    comparisonResultId: resultId, datasetId: binding.datasetId, rowId: evidence.rowId,
    columnId: binding.columnId, masterValue: evidence.masterValue, normalizedMasterValue: evidence.normalizedMasterValue,
  }, hashText);
  return { matchId, ...evidence };
}

export async function compareFieldCandidate(entry, candidate, binding, index, sourceOrder, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const normalized = normalizeComparisonValue(candidate.value, binding.comparisonMode, binding.normalization);
  if (!normalized.valid) fail('INVALID_CANDIDATE', `Candidate ${candidate.candidateId}: ${normalized.error}`);
  const evidence = index.get(normalized.indexKey) || [];
  if (evidence.length > COMPARISON_LIMITS.matchesPerResult) fail('MATCH_LIMIT', `Match limit ${COMPARISON_LIMITS.matchesPerResult} exceeded.`);
  const comparisonResultId = await createComparisonIdentity('candidate-comparison-result', {
    entryId: entry.entryId, candidateId: candidate.candidateId, bindingId: binding.bindingId,
  }, hashText);
  const matches = [];
  for (const row of evidence) matches.push(await createMatch(comparisonResultId, binding, row, hashText));
  const status = matches.length === 0 ? 'unmatched' : matches.length === 1 ? 'unique-match' : 'multiple-match';
  return {
    comparisonResultId, sourceOrder, entryId: entry.entryId, candidateId: candidate.candidateId,
    entityId: entry.entityId, fieldKey: entry.fieldKey, bindingId: binding.bindingId,
    datasetId: binding.datasetId, columnId: binding.columnId, candidateValue: candidate.value,
    normalizedCandidate: normalized.normalizedValue, status, matches,
  };
}

function unboundRow(entry, candidate, sourceOrder) {
  return {
    sourceOrder, entryId: entry.entryId, candidateId: candidate.candidateId,
    entityId: entry.entityId, fieldKey: entry.fieldKey,
    reason: 'No enabled binding exists for this field key.',
  };
}

export function summarizeCandidateComparisonRun(run) {
  const results = run?.results || []; const unbound = run?.unbound || [];
  return {
    candidateCount: new Set([...results.map((row) => row.candidateId), ...unbound.map((row) => row.candidateId)]).size,
    comparisonCount: results.length,
    uniqueMatchCount: results.filter((row) => row.status === 'unique-match').length,
    multipleMatchCount: results.filter((row) => row.status === 'multiple-match').length,
    unmatchedCount: results.filter((row) => row.status === 'unmatched').length,
    unboundCandidateCount: unbound.length,
    matchedRowCount: results.reduce((sum, row) => sum + row.matches.length, 0),
  };
}

async function buildRun(graph, ledger, config, attachmentSet, registry, dependencies) {
  const hashText = dependencies.hashText || sha256Hex; const datasets = registryMap(registry);
  const candidates = candidateRows(ledger); const bindings = config.bindings.filter((binding) => binding.enabled);
  enforcePreflight(candidates, bindings, datasets); const indexes = new Map();
  for (const binding of bindings) indexes.set(binding.bindingId, buildMasterColumnIndex(datasets.get(binding.datasetId), binding.columnId, binding));
  const results = []; const unbound = [];
  for (const row of candidates) {
    const matches = bindings.filter((binding) => binding.fieldKey === row.entry.fieldKey);
    if (!matches.length) { unbound.push(unboundRow(row.entry, row.candidate, unbound.length)); continue; }
    for (const binding of matches) results.push(await compareFieldCandidate(row.entry, row.candidate, binding, indexes.get(binding.bindingId), results.length, { hashText }));
  }
  const attachmentSetIdentity = await createMasterAttachmentSetIdentity(graph, attachmentSet, hashText);
  const run = {
    schema: 'CandidateComparisonRun.v1', comparisonRunId: '', ...graphComparisonIdentity(graph),
    ledgerId: ledger.ledgerId, bindingConfigId: config.bindingConfigId, attachmentSetIdentity,
    results, unbound, summary: null, validation: { ok: false, errors: [], warnings: [] },
  };
  run.summary = summarizeCandidateComparisonRun(run);
  run.comparisonRunId = await createComparisonIdentity('candidate-comparison-run', {
    graph: graphComparisonIdentity(graph), ledgerId: run.ledgerId, bindingConfigId: run.bindingConfigId,
    attachmentSetIdentity, results, unbound,
  }, hashText);
  return run;
}

function comparisonAuthorityErrors(graph, ledger, config, attachmentSet) {
  const errors = [];
  if (graph?.schema !== 'UniversalSourceGraph.v1' || !graph?.validation?.ok) errors.push('A valid UniversalSourceGraph.v1 is required.');
  if (ledger?.schema !== 'FieldCandidateLedger.v1' || !ledger?.validation?.ok) errors.push('A valid FieldCandidateLedger.v1 is required.');
  if (config?.schema !== 'MasterFieldBindingConfig.v1' || !config?.validation?.ok) errors.push('A valid MasterFieldBindingConfig.v1 is required.');
  if (attachmentSet?.schema !== 'MasterAttachmentSet.v1' || !attachmentSet?.validation?.ok) errors.push('A valid MasterAttachmentSet.v1 is required.');
  return errors;
}

export async function validateCandidateComparisonRun(run, graph, ledger, config, attachmentSet, registry, dependencies = {}) {
  const errors = [...comparisonAuthorityErrors(graph, ledger, config, attachmentSet), ...findJsonSafetyErrors(run, 'Comparison run')];
  if (run?.schema !== 'CandidateComparisonRun.v1') errors.push('Comparison run schema must be CandidateComparisonRun.v1.');
  try {
    const expected = await buildRun(graph, ledger, config, attachmentSet, registry, dependencies);
    const actualEvidence = { ...run, validation: undefined }; const expectedEvidence = { ...expected, validation: undefined };
    if (canonicalComparisonJson(actualEvidence) !== canonicalComparisonJson(expectedEvidence)) errors.push('Comparison run does not match complete authoritative projection.');
  } catch (error) { errors.push(`${error.code || 'BUILD_ERROR'}: ${error.message}`); }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [] };
}

export async function createCandidateComparisonRun(graph, ledger, config, attachmentSet, registry, dependencies = {}) {
  const configValidation = await validateMasterFieldBindingConfig(config, graph, ledger, attachmentSet, registry, dependencies);
  if (!configValidation.ok) fail('INVALID_CONFIG', configValidation.errors.join(' '));
  const run = await buildRun(graph, ledger, config, attachmentSet, registry, dependencies);
  run.validation = await validateCandidateComparisonRun(run, graph, ledger, config, attachmentSet, registry, dependencies);
  return deepFreezeArtifact(run);
}

export function serializeCandidateComparisonRun(run) {
  return `${JSON.stringify(run, null, 2)}\n`;
}
