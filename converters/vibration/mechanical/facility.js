import { evaluateEiAviffMechanicalBaselineCandidate } from '../masters/ei-aviff-appendix-b-evaluator.js';
import {
  EI_MECHANICAL_EXCITATION_ROWS,
  EI_SHARED_SUPPORT_TRANSFER_RULE,
} from '../masters/ei-aviff-appendix-b-data.js';

const AUTHORITY = Object.freeze({
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  masterDataAuthority: false,
});

const LABELS = Object.freeze({
  RECIP_PD_COMPRESSOR_OR_PUMP: 'Reciprocating / PD compressor or pump',
  DIESEL_OR_GAS_ENGINE_DRIVE: 'Diesel / gas engine drive',
  SCREW_COMPRESSOR_OR_PUMP: 'Screw compressor / pump',
  CENTRIFUGAL_PUMP: 'Centrifugal pump',
  ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW: 'Electric motor / alternator ≥ 15 kW',
  ELECTRIC_MOTOR_OR_ALTERNATOR_LT_15KW: 'Electric motor / alternator < 15 kW',
  CENTRIFUGAL_COMPRESSOR: 'Centrifugal compressor',
  GAS_TURBINE: 'Gas turbine',
  FAN_OR_BLOWER: 'Fan / blower',
  PIPEWORK_SHARING_SUPPORTS_WITH_LINE_LOF_GE_0_50: 'Shared supports with adjacent line LOF ≥ 0.50',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredText(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(code);
  return text;
}

function encoded(value) {
  return encodeURIComponent(String(value));
}

export function mechanicalFacilityScopeId(row = {}) {
  const line = requiredText(row.line, 'MECHANICAL_FACILITY_LINE_REQUIRED');
  const canonicalId = requiredText(row.canonicalId, 'MECHANICAL_FACILITY_CANONICAL_ID_REQUIRED');
  const caseId = row.caseId === null || row.caseId === undefined ? '-' : requiredText(
    row.caseId, 'MECHANICAL_FACILITY_CASE_ID_INVALID',
  );
  return `MECHANICAL-FACILITY/${encoded(line)}/${encoded(caseId)}/${encoded(canonicalId)}`;
}

export function mechanicalFacilityScope(row = {}) {
  return deepFreeze({
    schema: 'MechanicalFacilityScope.v1',
    scopeId: mechanicalFacilityScopeId(row),
    line: requiredText(row.line, 'MECHANICAL_FACILITY_LINE_REQUIRED'),
    caseId: row.caseId ?? null,
    canonicalId: requiredText(row.canonicalId, 'MECHANICAL_FACILITY_CANONICAL_ID_REQUIRED'),
  });
}

export const MECHANICAL_T23_SOURCE_OPTIONS = deepFreeze([
  ...EI_MECHANICAL_EXCITATION_ROWS.map((row) => ({
    sourceKey: row.sourceKey,
    label: LABELS[row.sourceKey] ?? row.sourceKey,
    baselineLof: row.baselineLof,
    qualificationGate: row.qualificationGate,
    directBaselineAvailable: true,
  })),
  {
    sourceKey: EI_SHARED_SUPPORT_TRANSFER_RULE.sourceKey,
    label: LABELS[EI_SHARED_SUPPORT_TRANSFER_RULE.sourceKey],
    baselineLof: null,
    qualificationGate: EI_SHARED_SUPPORT_TRANSFER_RULE.qualificationGate,
    directBaselineAvailable: false,
    reason: 'Requires explicit adjacent-line LOF; not a fixed T2.3 baseline.',
  },
]);

function normalizeSourceKeys(sourceKeys) {
  if (!Array.isArray(sourceKeys)) throw new TypeError('MECHANICAL_T23_SOURCE_KEYS_INVALID');
  const keys = [...new Set(sourceKeys.map((value) => requiredText(
    value, 'MECHANICAL_T23_SOURCE_KEY_INVALID',
  )))];
  if (!keys.length) throw new TypeError('MECHANICAL_T23_SOURCE_SELECTION_REQUIRED');
  const known = new Set(MECHANICAL_T23_SOURCE_OPTIONS.map((item) => item.sourceKey));
  const unknown = keys.find((key) => !known.has(key));
  if (unknown) throw new Error(`MECHANICAL_T23_SOURCE_UNKNOWN:${unknown}`);
  if (keys.includes(EI_SHARED_SUPPORT_TRANSFER_RULE.sourceKey)) {
    throw new Error('MECHANICAL_T23_SHARED_SUPPORT_REQUIRES_ADJACENT_LOF');
  }
  return keys;
}

export async function evaluateMechanicalFacilityCandidate(row, sourceKeys) {
  const scope = mechanicalFacilityScope(row);
  const normalizedSourceKeys = normalizeSourceKeys(sourceKeys);
  const evaluated = await evaluateEiAviffMechanicalBaselineCandidate(normalizedSourceKeys);
  return deepFreeze({
    schema: 'MechanicalFacilityCandidate.v1',
    status: 'CALCULATED_MASTER_CANDIDATE',
    scope,
    sourceKeys: normalizedSourceKeys,
    governingLof: evaluated.governingLof,
    governingSourceKey: evaluated.governingSourceKey,
    rows: evaluated.rows,
    provenance: evaluated.provenance,
    usagePolicy: evaluated.usagePolicy,
    authority: AUTHORITY,
  });
}

export function inspectMechanicalFacilityCandidate(row, candidate = null) {
  const scope = mechanicalFacilityScope(row);
  if (!candidate) return deepFreeze({ ok: false, status: 'NOT_EVALUATED', scope, candidate: null });
  if (candidate.schema !== 'MechanicalFacilityCandidate.v1') {
    return deepFreeze({ ok: false, status: 'INVALID_CANDIDATE_SCHEMA', scope, candidate: null });
  }
  if (candidate.scope?.scopeId !== scope.scopeId) {
    return deepFreeze({ ok: false, status: 'FACILITY_SCOPE_MISMATCH', scope, candidate: null });
  }
  if (!Number.isFinite(Number(candidate.governingLof))) {
    return deepFreeze({ ok: false, status: 'INVALID_CANDIDATE_LOF', scope, candidate: null });
  }
  return deepFreeze({ ok: true, status: 'CURRENT_CANDIDATE', scope, candidate });
}
