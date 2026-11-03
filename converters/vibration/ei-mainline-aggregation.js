import { ACTIVE_ENGINEERING_CALCULATION_DEFINITIONS } from '../engineering-calculations/default-registry.js';
import { evaluateVibrationBenchmarkRegistry } from './benchmark-registry.js';
import { evaluateVibrationCoverageAndCompleteness } from './mechanisms/coverage.js';
import { VIBRATION_MECHANISM_IDS, VIBRATION_MECHANISM_REGISTRY } from './mechanisms/registry.js';

export const EI_MAIN_LINE_AGGREGATION_SCHEMA = 'EiMainLineAggregation.v1';
export const EI_MAIN_LINE_AGGREGATION_POLICY_SCHEMA = 'EiMainLineAggregationPolicy.v1';
export const EI_MAIN_LINE_AGGREGATION_POLICY_REVISION = 'EI-AVIFF2-MAINLINE-2026-08-17';

export const EI_MAIN_LINE_MECHANISM_IDS = Object.freeze([
  'fit',
  'mechanicalExcitation',
  'reciprocatingPulsation',
  'rotatingStall',
  'deadlegPulsation',
  'aiv',
  'valveTransients',
  'cavitationFlashing',
]);

const EXCLUDED_MECHANISMS = Object.freeze([
  Object.freeze({ mechanismId: 'corrugationPulsation', reason: 'OUTSIDE_CURRENT_429_T2_AGGREGATION_LIST' }),
  Object.freeze({ mechanismId: 'slugFlow', reason: 'SPECIALIST_ROUTE_OUTSIDE_CURRENT_429_T2_AGGREGATE' }),
  Object.freeze({ mechanismId: 'thermowells', reason: 'T4_INTRUSIVE_ELEMENT_CONTINUATION' }),
  Object.freeze({ mechanismId: 'smallBoreConnections', reason: 'T3_SBC_CONTINUATION' }),
]);

const AGGREGATION_AUTHORITY = Object.freeze({
  authorityPromotion: false,
  contributorQualificationRequired: 'SCREENING',
  designAuthority: false,
  codeCompliance: false,
  fullVibrationAssessmentComplete: false,
  productFreezeImplied: false,
});

const POLICY_SOURCE = Object.freeze([
  'ISSUE#429:VIB-INV-003',
  'ISSUE#429:SECTION-3-EI-MECHANISM-MAP',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string.`);
  return value.trim();
}

function scopeValue(scope = {}) {
  return {
    line: requiredText(scope.line, 'scope.line'),
    caseId: scope.caseId == null ? null : requiredText(scope.caseId, 'scope.caseId'),
    canonicalId: requiredText(scope.canonicalId, 'scope.canonicalId'),
  };
}

function sameScope(left, right) {
  return left?.line === right.line
    && (left?.caseId ?? null) === right.caseId
    && left?.canonicalId === right.canonicalId;
}

function policyShape(policy = {}) {
  return [
    EI_MAIN_LINE_AGGREGATION_POLICY_SCHEMA,
    EI_MAIN_LINE_AGGREGATION_POLICY_REVISION,
    VIBRATION_MECHANISM_REGISTRY.revision,
    VIBRATION_MECHANISM_REGISTRY.fingerprint,
    policy.includedMechanismIds ?? EI_MAIN_LINE_MECHANISM_IDS,
    (policy.excludedMechanisms ?? EXCLUDED_MECHANISMS).map((item) => [item.mechanismId, item.reason]),
    policy.sourceAuthority ?? POLICY_SOURCE,
  ];
}

export function eiMainLineAggregationPolicyFingerprint(policy = {}) {
  return JSON.stringify(policyShape(policy));
}

function validatePolicyCoverage(included, excluded) {
  const allIds = [...included, ...excluded.map((item) => item.mechanismId)];
  if (new Set(allIds).size !== allIds.length) throw new Error('EI_MAINLINE_POLICY_DUPLICATE_MECHANISM');
  if (allIds.some((id) => !VIBRATION_MECHANISM_IDS.includes(id))) throw new Error('EI_MAINLINE_POLICY_UNKNOWN_MECHANISM');
  if (VIBRATION_MECHANISM_IDS.some((id) => !allIds.includes(id))) throw new Error('EI_MAINLINE_POLICY_UNCLASSIFIED_MECHANISM');
}

validatePolicyCoverage(EI_MAIN_LINE_MECHANISM_IDS, EXCLUDED_MECHANISMS);

export const EI_MAIN_LINE_AGGREGATION_POLICY = deepFreeze({
  schema: EI_MAIN_LINE_AGGREGATION_POLICY_SCHEMA,
  revision: EI_MAIN_LINE_AGGREGATION_POLICY_REVISION,
  mechanismRegistryRevision: VIBRATION_MECHANISM_REGISTRY.revision,
  mechanismRegistryFingerprint: VIBRATION_MECHANISM_REGISTRY.fingerprint,
  includedMechanismIds: EI_MAIN_LINE_MECHANISM_IDS,
  excludedMechanisms: EXCLUDED_MECHANISMS,
  sourceAuthority: POLICY_SOURCE,
  aggregationRule: 'MAX_APPLICABLE_QUALIFIED_EI_MAINLINE_GOVERNING_LOF',
  conservativeSubstitutionSupported: false,
  fingerprint: eiMainLineAggregationPolicyFingerprint(),
  authority: AGGREGATION_AUTHORITY,
});

const POLICY_OVERRIDE_KEYS = Object.freeze([
  'mainLineMechanismIds', 'includedMechanismIds', 'excludedMechanismIds', 'policy',
  'benchmarkCompliance', 'benchmarkRegistry', 'activeCapabilityIds',
]);

function rejectPolicyOverrides(input) {
  for (const key of POLICY_OVERRIDE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      throw new Error(`CALLER_MAINLINE_POLICY_OVERRIDE_FORBIDDEN:${key}`);
    }
  }
}

function assertEvidenceScope(input, targetScope) {
  const identifications = input.identifications ?? [];
  const assessmentSets = input.assessmentSets ?? [];
  if (!Array.isArray(identifications)) throw new TypeError('identifications must be an array.');
  if (!Array.isArray(assessmentSets)) throw new TypeError('assessmentSets must be an array.');
  for (const record of identifications) {
    if (!VIBRATION_MECHANISM_IDS.includes(record?.mechanismId)) throw new Error(`UNKNOWN_VIBRATION_MECHANISM:${record?.mechanismId ?? 'UNKNOWN'}`);
    if (!sameScope(record.scope, targetScope)) throw new Error(`EI_MAINLINE_SCOPE_MISMATCH:${record.mechanismId}`);
  }
  for (const set of assessmentSets) {
    if (!VIBRATION_MECHANISM_IDS.includes(set?.mechanismId)) throw new Error(`UNKNOWN_VIBRATION_MECHANISM:${set?.mechanismId ?? 'UNKNOWN'}`);
    if (!sameScope(set.scope, targetScope)) throw new Error(`EI_MAINLINE_SCOPE_MISMATCH:${set.mechanismId}`);
  }
}

function currentActiveVibCapabilityIds() {
  return ACTIVE_ENGINEERING_CALCULATION_DEFINITIONS
    .map((definition) => definition.id)
    .filter((id) => String(id).startsWith('VIB.'));
}

function benchmarkCompliance() {
  return evaluateVibrationBenchmarkRegistry({ activeCapabilityIds: currentActiveVibCapabilityIds() });
}

function mainLineEvidence(input) {
  const included = new Set(EI_MAIN_LINE_MECHANISM_IDS);
  return {
    identifications: (input.identifications ?? []).filter((item) => included.has(item.mechanismId)),
    assessmentSets: (input.assessmentSets ?? []).filter((item) => included.has(item.mechanismId)),
  };
}

function completenessReasons(completeness) {
  const reasons = [];
  if (completeness.missingIdentificationCount > 0) reasons.push('MISSING_MAINLINE_IDENTIFICATION');
  if (completeness.unresolvedIdentificationCount > 0) reasons.push('UNRESOLVED_MAINLINE_IDENTIFICATION');
  reasons.push(...completeness.reasons.map((reason) => `MAINLINE_COVERAGE:${reason}`));
  return [...new Set(reasons)];
}

function setMap(sets) {
  return new Map(sets.map((set) => [set.setId, set]));
}

function contributorReason(item, mechanismId) {
  if (item.implementationState !== 'IMPLEMENTED_SCREENING' || item.qualification?.effective !== 'SCREENING') {
    return `SCREENING_QUALIFICATION_REQUIRED:${mechanismId}:${item.itemId}`;
  }
  if (item.assessmentState !== 'CALCULATED' || item.resultState !== 'CURRENT_RESULT') {
    return `CURRENT_SCREENING_RESULT_REQUIRED:${mechanismId}:${item.itemId}`;
  }
  const lof = item.result?.governingLof;
  if (typeof lof !== 'number' || !Number.isFinite(lof) || lof < 0) {
    return `VALID_GOVERNING_LOF_REQUIRED:${mechanismId}:${item.itemId}`;
  }
  return null;
}

function collectContributors(coverageState, sets, benchmarks) {
  const reasons = [];
  const contributors = [];
  const coverageByMechanism = new Map(coverageState.coverage.required.map((item) => [item.mechanismId, item]));
  const setsById = setMap(sets);
  const benchmarkByMechanism = new Map(benchmarks.mechanisms.map((item) => [item.mechanismId, item]));
  for (const mechanismId of EI_MAIN_LINE_MECHANISM_IDS) {
    const requirement = coverageByMechanism.get(mechanismId);
    if (!requirement) continue;
    if (benchmarkByMechanism.get(mechanismId)?.state !== 'READY') {
      reasons.push(`BENCHMARK_NOT_READY:${mechanismId}`);
      continue;
    }
    const set = setsById.get(requirement.assessmentId);
    for (const item of set?.items ?? []) {
      const reason = contributorReason(item, mechanismId);
      if (reason) reasons.push(reason);
      else contributors.push(deepFreeze({
        mechanismId, assessmentId: requirement.assessmentId, itemId: item.itemId,
        childKey: item.child?.key ?? null, lof: item.result.governingLof,
      }));
    }
  }
  return { contributors, reasons };
}

function governingContributor(contributors) {
  if (!contributors.length) return null;
  return contributors.reduce((governing, item) => (item.lof > governing.lof ? item : governing));
}

function output({ scope, state, coverageState, benchmarks, contributors = [], reasons = [] }) {
  const governing = state === 'COMPLETE' ? governingContributor(contributors) : null;
  return deepFreeze({
    schema: EI_MAIN_LINE_AGGREGATION_SCHEMA,
    policyRevision: EI_MAIN_LINE_AGGREGATION_POLICY.revision,
    policyFingerprint: EI_MAIN_LINE_AGGREGATION_POLICY.fingerprint,
    scope,
    state,
    eiMainLineLof: governing?.lof ?? null,
    governingContributor: governing,
    contributors: state === 'COMPLETE' ? contributors : [],
    requiredAssessmentSet: coverageState.requiredAssessmentSet,
    mainLineCoverage: coverageState.coverage,
    mainLineCompleteness: coverageState.completeness,
    benchmarkRegistryRevision: benchmarks.registryRevision,
    benchmarkRegistryFingerprint: benchmarks.registryFingerprint,
    excludedMechanisms: EI_MAIN_LINE_AGGREGATION_POLICY.excludedMechanisms,
    reasons: [...new Set(reasons)],
    authority: AGGREGATION_AUTHORITY,
  });
}

export function evaluateEiMainLineAggregation(input = {}) {
  rejectPolicyOverrides(input);
  const scope = scopeValue(input.scope);
  assertEvidenceScope(input, scope);
  const evidence = mainLineEvidence(input);
  const coverageState = evaluateVibrationCoverageAndCompleteness({
    identifications: evidence.identifications,
    knownMechanismIds: EI_MAIN_LINE_MECHANISM_IDS,
    assessmentSets: evidence.assessmentSets,
  });
  const benchmarks = benchmarkCompliance();
  if (benchmarks.state !== 'READY') {
    return output({ scope, state: 'INCOMPLETE', coverageState, benchmarks,
      reasons: ['VIB_BENCHMARK_REGISTRY_BLOCKED', ...completenessReasons(coverageState.completeness)] });
  }
  if (coverageState.completeness.state === 'NOT_APPLICABLE') {
    return output({ scope, state: 'NOT_APPLICABLE', coverageState, benchmarks });
  }
  if (coverageState.completeness.state !== 'COMPLETE') {
    return output({ scope, state: 'INCOMPLETE', coverageState, benchmarks,
      reasons: completenessReasons(coverageState.completeness) });
  }
  const collected = collectContributors(coverageState, evidence.assessmentSets, benchmarks);
  if (collected.reasons.length || collected.contributors.length === 0) {
    const reasons = collected.contributors.length === 0 ? [...collected.reasons, 'NO_QUALIFIED_MAINLINE_LOF_CONTRIBUTOR'] : collected.reasons;
    return output({ scope, state: 'INCOMPLETE', coverageState, benchmarks, reasons });
  }
  return output({ scope, state: 'COMPLETE', coverageState, benchmarks, contributors: collected.contributors });
}
