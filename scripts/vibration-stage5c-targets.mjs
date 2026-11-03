import { normalizeExplicitPages } from './vibration-stage5c-document-evidence-client.mjs';

export const VIBRATION_STAGE5C_SELECTION_SCHEMA = 'VibrationStage5cSelection.v1';

export const CONTROLLED_EI_SOURCE = Object.freeze({
  repository: 'reallaksh19/Common',
  commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
  path: 'EI - AVIFF Guidelines 2nd Edition.pdf',
  apiSourcePath: '/Common/EI - AVIFF Guidelines 2nd Edition.pdf',
  gitBlobSha1: 'sha1:9d3eccc56429411e17c07a579bdebbd13cb0bdc5',
  sizeBytes: 10_348_594,
});

const tableTarget = (masterId, mechanismId, sourceKind = 'TABLE') => Object.freeze({
  masterId,
  mechanismId,
  sourceKind,
  evidenceMode: 'DOCUMENT_EVIDENCE_TABLE',
});

export const VIBRATION_STAGE5C_TABLE_TARGETS = Object.freeze([
  tableTarget('EI_AVIFF.T3.SBC.FITTING_SPAN_FACTORS.v1', 'smallBoreConnections'),
  tableTarget('EI_AVIFF.T3.SBC.FIRST_SPAN_LIMITS.v1', 'smallBoreConnections'),
  tableTarget('EI_AVIFF.T3.SBC.BETWEEN_MAIN_LINES_LIMITS.v1', 'smallBoreConnections'),
  tableTarget('EI_AVIFF.T2.8.VALVE_CLOSURE_CHARACTERISTICS.v1', 'valveTransients', 'TABLE_OR_EQUATION'),
  tableTarget('EI_AVIFF.T2.9.VALVE_RECOVERY_FACTORS.v1', 'cavitationFlashing'),
  tableTarget('EI_AVIFF.T4.WALL_MODIFIER.v1', 'thermowells'),
]);

export const VIBRATION_STAGE5C_NON_TABLE_TARGETS = Object.freeze([
  Object.freeze({
    masterId: 'EI_AVIFF.T3.SBC.GEOMETRY_SCORES.v1',
    mechanismId: 'smallBoreConnections',
    evidenceMode: 'NON_TABLE_RULE_EVIDENCE_REQUIRED',
  }),
  Object.freeze({
    masterId: 'EI_AVIFF.T3.SBC.LOCATION_SCORES.v1',
    mechanismId: 'smallBoreConnections',
    evidenceMode: 'NON_TABLE_RULE_EVIDENCE_REQUIRED',
  }),
]);

const TARGETS = new Map(VIBRATION_STAGE5C_TABLE_TARGETS.map((target) => [target.masterId, target]));
const NON_TABLE = new Set(VIBRATION_STAGE5C_NON_TABLE_TARGETS.map(({ masterId }) => masterId));
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function assertSourceHash(value) {
  if (!SHA256.test(String(value || ''))) {
    throw new TypeError('VIBRATION_STAGE5C_SELECTION_SOURCE_SHA256_INVALID');
  }
  return value;
}

function assertLocator(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('VIBRATION_STAGE5C_SOURCE_LOCATOR_REQUIRED');
  }
  if (typeof value.locator !== 'string' || !value.locator.trim()) {
    throw new TypeError('VIBRATION_STAGE5C_SOURCE_LOCATOR_REQUIRED');
  }
  if (value.printedPage !== undefined
    && (typeof value.printedPage !== 'string' || !value.printedPage.trim())) {
    throw new TypeError('VIBRATION_STAGE5C_PRINTED_PAGE_INVALID');
  }
  return {
    locator: value.locator.trim(),
    ...(value.printedPage === undefined ? {} : { printedPage: value.printedPage.trim() }),
    selectionBasis: 'EXPLICIT_REVIEWER_SELECTION',
  };
}

function assertCandidateIds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('VIBRATION_STAGE5C_CANDIDATE_IDS_INVALID');
  }
  const ids = value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new TypeError('VIBRATION_STAGE5C_CANDIDATE_ID_INVALID');
    }
    return item.trim();
  });
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('VIBRATION_STAGE5C_CANDIDATE_ID_DUPLICATE');
  }
  return ids;
}

function targetFor(masterId) {
  if (/^EI_AVIFF\.T3\.SBC\.FIGURE_T3_[1-4]\.v1$/u.test(String(masterId || ''))) {
    throw new TypeError(`VIBRATION_STAGE5C_CURVE_TARGET_OUT_OF_SCOPE: ${masterId}`);
  }
  if (NON_TABLE.has(masterId)) {
    throw new TypeError(`VIBRATION_STAGE5C_TARGET_REQUIRES_NON_TABLE_EVIDENCE: ${masterId}`);
  }
  const target = TARGETS.get(masterId);
  if (!target) throw new TypeError(`VIBRATION_STAGE5C_TARGET_UNSUPPORTED: ${masterId}`);
  return target;
}

export function validateStage5cSelection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('VIBRATION_STAGE5C_SELECTION_INVALID');
  }
  const target = targetFor(raw.masterId);
  const pages = normalizeExplicitPages(raw.pages);
  const sourceLocator = assertLocator(raw.sourceLocator);
  const candidateIds = assertCandidateIds(raw.candidateIds);
  const ocr = raw.ocr ?? 'never';
  if (!['never', 'always'].includes(ocr)) throw new TypeError('VIBRATION_STAGE5C_OCR_MODE_INVALID');
  const selectionId = raw.selectionId ?? raw.masterId;
  if (typeof selectionId !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(selectionId)) {
    throw new TypeError('VIBRATION_STAGE5C_SELECTION_ID_INVALID');
  }
  return {
    selectionId,
    masterId: target.masterId,
    mechanismId: target.mechanismId,
    sourceKind: target.sourceKind,
    pages,
    sourceLocator,
    candidateIds,
    ocr,
  };
}

export function validateStage5cSelectionDocument(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== VIBRATION_STAGE5C_SELECTION_SCHEMA) {
    throw new TypeError('VIBRATION_STAGE5C_SELECTION_DOCUMENT_INVALID');
  }
  const sourceHash = assertSourceHash(raw.sourceHash);
  if (!Array.isArray(raw.selections) || raw.selections.length === 0) {
    throw new TypeError('VIBRATION_STAGE5C_SELECTIONS_REQUIRED');
  }
  const selections = raw.selections.map(validateStage5cSelection);
  const ids = selections.map(({ selectionId }) => selectionId);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('VIBRATION_STAGE5C_SELECTION_DUPLICATE');
  }
  return { schema: VIBRATION_STAGE5C_SELECTION_SCHEMA, sourceHash, selections };
}

function gitIdentityMatches(source) {
  if (source?.git === undefined) return true;
  return source.git?.repository === CONTROLLED_EI_SOURCE.repository
    && source.git?.commit === CONTROLLED_EI_SOURCE.commit
    && source.git?.blobSha1 === CONTROLLED_EI_SOURCE.gitBlobSha1;
}

export function assertControlledEiSource(source) {
  const valid = source?.schema === 'SourceIdentity.v1'
    && source?.mediaType === 'application/pdf'
    && source?.sizeBytes === CONTROLLED_EI_SOURCE.sizeBytes
    && source?.logicalPath === CONTROLLED_EI_SOURCE.apiSourcePath
    && SHA256.test(String(source?.sha256 || ''))
    && gitIdentityMatches(source);
  if (!valid) throw new Error('VIBRATION_STAGE5C_CONTROLLED_SOURCE_IDENTITY_MISMATCH');
  return source;
}
