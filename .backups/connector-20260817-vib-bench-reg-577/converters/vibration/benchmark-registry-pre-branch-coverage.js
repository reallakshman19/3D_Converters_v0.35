import {
  VIBRATION_MECHANISM_IDS,
  VIBRATION_MECHANISM_REGISTRY,
} from './mechanisms/registry.js';

export const VIBRATION_BENCHMARK_REGISTRY_SCHEMA = 'VibrationBenchmarkRegistry.v1';
export const VIBRATION_BENCHMARK_COMPLIANCE_SCHEMA = 'VibrationBenchmarkCompliance.v1';
export const VIBRATION_BENCHMARK_REGISTRY_REVISION = 'VIB-BENCHMARK-CUSTODY-2026-08-17';

const EVIDENCE_CLASSES = Object.freeze(['B1', 'B2', 'B3', 'B4']);
const REGRESSION_ONLY_CLASSES = new Set(['B3', 'B4']);
const EXECUTION_REQUIREMENTS = Object.freeze(['EXECUTABLE', 'NOT_EXECUTABLE']);
const REGISTRY_AUTHORITY = Object.freeze({
  registryAuthority: 'BENCHMARK_CUSTODY_ONLY',
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  codeCompliance: false,
});

const FIT_D2_CASES = Object.freeze([
  'EI-D2-FIT-RECYCLE-SUCTION-6IN',
  'EI-D2-FIT-STREAM-4-SUPPLY-COOLER-14IN',
  'EI-D2-FIT-STREAM-5-SUCTION-SCRUBBER-14IN',
  'EI-D2-FIT-STREAM-6-COMPRESSOR-SUCTION-14IN',
  'EI-D2-FIT-STREAM-7-COMPRESSOR-DISCHARGE-8IN',
  'EI-D2-FIT-RECYCLE-DISCHARGE-8IN',
  'EI-D2-FIT-RELIEF-UPSTREAM-4IN',
  'EI-D2-FIT-RELIEF-DOWNSTREAM-6IN',
]);

const FIT_HAND_CASES = Object.freeze([
  'FIT-HAND-LIQ-STIFF-001',
  'FIT-HAND-GAS-MEDIUM-STIFF-002',
  'FIT-HAND-MULTIPHASE-MEDIUM-003',
  'FIT-HAND-LIQ-MEDIUM-SMALL-008',
  'FIT-HAND-FLEX-SMALL-LOF-105-FN2',
  'FIT-HAND-FLEX-LARGE-LOF-120-FN2-009',
  'FIT-HAND-SUPPORT-BOUNDARY-004',
  'FIT-HAND-GAS-UNIT-INVARIANCE-005',
  'FIT-HAND-GAP-FAIL-006',
  'FIT-HAND-FN4-NO-ADVANCED-007',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function family(input) {
  return deepFreeze({ ...input, artifactRefs: [...input.artifactRefs], caseIds: [...input.caseIds] });
}

function pendingMechanism(mechanismId) {
  return deepFreeze({
    mechanismId,
    capabilityId: null,
    executionRequirement: 'NOT_EXECUTABLE',
    benchmarkStatus: 'BENCHMARK_REQUIREMENT_PENDING',
    families: [],
  });
}

const FIT_FAMILIES = Object.freeze([
  family({
    familyId: 'FIT-EI-D2', evidenceClass: 'B1', countsTowardMinimum: true,
    engineeringExampleId: 'EI-AVIFF-D2-FIT', independenceBasis: 'CONTROLLED_PUBLISHED_EXAMPLE',
    artifactRefs: [{ path: 'Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json', role: 'CONTROLLED_BENCHMARK_SET' }],
    caseIds: FIT_D2_CASES, oracleCustody: 'CONTROLLED_PUBLISHED_ORACLE',
  }),
  family({
    familyId: 'FIT-EI-D4', evidenceClass: 'B1', countsTowardMinimum: true,
    engineeringExampleId: 'EI-AVIFF-D4-FIT', independenceBasis: 'CONTROLLED_PUBLISHED_EXAMPLE',
    artifactRefs: [{ path: 'Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json', role: 'CONTROLLED_BENCHMARK_SET' }],
    caseIds: ['EI-D4-FIT-SEPARATOR-INLET-20IN', 'EI-D4-FIT-PRODUCED-WATER-10IN'],
    oracleCustody: 'CONTROLLED_PUBLISHED_ORACLE',
  }),
  family({
    familyId: 'FIT-INDEPENDENT-HAND-V1', evidenceClass: 'B2', countsTowardMinimum: true,
    engineeringExampleId: 'FIT-INDEPENDENT-HAND-DERIVATIONS-V1', independenceBasis: 'INDEPENDENT_HAND_DERIVATION',
    artifactRefs: [{ path: 'Benchmarks/VibrationFIT/fit-independent-hand-benchmarks-v1.json', role: 'INDEPENDENT_BENCHMARK_SET' }],
    caseIds: FIT_HAND_CASES, oracleCustody: 'INDEPENDENT_HAND_ORACLE',
  }),
]);

const AIV_FAMILIES = Object.freeze([
  family({
    familyId: 'AIV-EI-D2.3', evidenceClass: 'B1', countsTowardMinimum: true,
    engineeringExampleId: 'EI-AVIFF-D2.3-AIV', independenceBasis: 'CONTROLLED_PUBLISHED_EXAMPLE',
    artifactRefs: [
      { path: 'docs/vibration/AIV-D2.3-Working-Table-Benchmark-v1.md', role: 'CONTROLLED_BENCHMARK_DOCUMENT' },
      { path: 'docs/vibration/validation/AIV-D2.3-Product-Path-Validation-v1.json', role: 'PRODUCT_PATH_VALIDATION_EVIDENCE' },
    ],
    caseIds: [], oracleCustody: 'CONTROLLED_PUBLISHED_ORACLE',
  }),
  family({
    familyId: 'AIV-INDEPENDENT-ANALYTICAL-V1', evidenceClass: 'B2', countsTowardMinimum: true,
    engineeringExampleId: 'AIV-INDEPENDENT-ANALYTICAL-VECTORS-V1', independenceBasis: 'INDEPENDENT_ANALYTICAL_DERIVATION',
    artifactRefs: [{ path: 'converters/vibration/aiv/aiv-independent-benchmark-evidence.js', role: 'INDEPENDENT_BENCHMARK_MODULE' }],
    caseIds: [
      'AIV-HAND-SONIC-SFF6-001',
      'AIV-HAND-MULTI-SOURCE-EQUAL-001',
      'AIV-HAND-MULTI-SOURCE-ASYM-001',
    ],
    oracleCustody: 'INDEPENDENT_ANALYTICAL_ORACLE',
  }),
]);

const EXECUTABLE = new Map([
  ['fit', { capabilityId: 'VIB.FIV.FLOW_TURBULENCE', families: FIT_FAMILIES }],
  ['aiv', { capabilityId: 'VIB.AIV.ACOUSTIC', families: AIV_FAMILIES }],
]);

const REGISTRY_MECHANISMS = VIBRATION_MECHANISM_IDS.map((mechanismId) => {
  const executable = EXECUTABLE.get(mechanismId);
  if (!executable) return pendingMechanism(mechanismId);
  return deepFreeze({
    mechanismId,
    capabilityId: executable.capabilityId,
    executionRequirement: 'EXECUTABLE',
    benchmarkStatus: 'FROZEN_CUSTODY',
    families: executable.families,
  });
});

function fingerprintFamily(item) {
  return [
    item.familyId, item.evidenceClass, item.countsTowardMinimum, item.engineeringExampleId,
    item.independenceBasis, item.artifactRefs, item.caseIds, item.oracleCustody,
  ];
}

export function vibrationBenchmarkRegistryFingerprint(mechanisms = REGISTRY_MECHANISMS) {
  return JSON.stringify([
    VIBRATION_BENCHMARK_REGISTRY_SCHEMA,
    VIBRATION_BENCHMARK_REGISTRY_REVISION,
    VIBRATION_MECHANISM_REGISTRY.fingerprint,
    mechanisms.map((item) => [
      item.mechanismId, item.capabilityId, item.executionRequirement, item.benchmarkStatus,
      item.families.map(fingerprintFamily),
    ]),
  ]);
}

export const VIBRATION_BENCHMARK_REGISTRY = deepFreeze({
  schema: VIBRATION_BENCHMARK_REGISTRY_SCHEMA,
  revision: VIBRATION_BENCHMARK_REGISTRY_REVISION,
  mechanismRegistryRevision: VIBRATION_MECHANISM_REGISTRY.revision,
  mechanismRegistryFingerprint: VIBRATION_MECHANISM_REGISTRY.fingerprint,
  fingerprint: vibrationBenchmarkRegistryFingerprint(REGISTRY_MECHANISMS),
  authority: REGISTRY_AUTHORITY,
  mechanisms: REGISTRY_MECHANISMS,
});

function forbiddenNumericalField(value, path = 'registry') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (['expected', 'tolerance', 'equation', 'equations', 'coefficient', 'coefficients'].includes(key)) {
      return `${path}.${key}`;
    }
    const nested = forbiddenNumericalField(child, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

function validateFamily(item, mechanismId, familyIds) {
  if (!item?.familyId) throw new TypeError(`benchmark familyId required for ${mechanismId}`);
  if (familyIds.has(item.familyId)) throw new Error(`DUPLICATE_BENCHMARK_FAMILY_ID:${mechanismId}:${item.familyId}`);
  familyIds.add(item.familyId);
  if (!EVIDENCE_CLASSES.includes(item.evidenceClass)) throw new Error(`UNKNOWN_BENCHMARK_EVIDENCE_CLASS:${item.evidenceClass}`);
  if (REGRESSION_ONLY_CLASSES.has(item.evidenceClass) && item.countsTowardMinimum) {
    throw new Error(`REGRESSION_FAMILY_CANNOT_COUNT:${item.familyId}`);
  }
  if (typeof item.countsTowardMinimum !== 'boolean' || !item.engineeringExampleId || !item.independenceBasis) {
    throw new TypeError(`MALFORMED_BENCHMARK_FAMILY:${item.familyId}`);
  }
  if (!Array.isArray(item.artifactRefs) || item.artifactRefs.length === 0 || !Array.isArray(item.caseIds)) {
    throw new TypeError(`MALFORMED_BENCHMARK_FAMILY:${item.familyId}`);
  }
  for (const ref of item.artifactRefs) {
    if (!ref?.path || !ref?.role) throw new TypeError(`MALFORMED_BENCHMARK_ARTIFACT_REF:${item.familyId}`);
    if (ref.role === 'EXPECTED_VALUE_SOURCE') throw new Error(`PRODUCTION_ORACLE_SOURCE_FORBIDDEN:${item.familyId}`);
  }
}

export function validateVibrationBenchmarkRegistry(registry = VIBRATION_BENCHMARK_REGISTRY) {
  if (registry?.schema !== VIBRATION_BENCHMARK_REGISTRY_SCHEMA) throw new Error('VIBRATION_BENCHMARK_REGISTRY_SCHEMA_INVALID');
  if (registry.mechanismRegistryRevision !== VIBRATION_MECHANISM_REGISTRY.revision
      || registry.mechanismRegistryFingerprint !== VIBRATION_MECHANISM_REGISTRY.fingerprint) {
    throw new Error('VIBRATION_MECHANISM_REGISTRY_BINDING_MISMATCH');
  }
  if (!Array.isArray(registry.mechanisms)) throw new TypeError('benchmark registry mechanisms must be an array.');
  const numericalField = forbiddenNumericalField(registry);
  if (numericalField) throw new Error(`NUMERICAL_ORACLE_FIELD_FORBIDDEN:${numericalField}`);
  const mechanismIds = new Set();
  for (const item of registry.mechanisms) {
    if (!VIBRATION_MECHANISM_IDS.includes(item.mechanismId)) throw new Error(`UNKNOWN_VIBRATION_MECHANISM:${item.mechanismId}`);
    if (mechanismIds.has(item.mechanismId)) throw new Error(`DUPLICATE_BENCHMARK_MECHANISM_ID:${item.mechanismId}`);
    mechanismIds.add(item.mechanismId);
    if (!EXECUTION_REQUIREMENTS.includes(item.executionRequirement)) throw new Error(`UNKNOWN_BENCHMARK_EXECUTION_REQUIREMENT:${item.mechanismId}`);
    if (item.executionRequirement === 'EXECUTABLE' && !item.capabilityId) throw new Error(`EXECUTABLE_CAPABILITY_ID_REQUIRED:${item.mechanismId}`);
    if (item.executionRequirement === 'NOT_EXECUTABLE' && item.capabilityId != null) throw new Error(`NON_EXECUTABLE_CAPABILITY_ID_FORBIDDEN:${item.mechanismId}`);
    const familyIds = new Set();
    for (const benchmarkFamily of item.families ?? []) validateFamily(benchmarkFamily, item.mechanismId, familyIds);
  }
  if (VIBRATION_MECHANISM_IDS.some((id) => !mechanismIds.has(id)) || mechanismIds.size !== VIBRATION_MECHANISM_IDS.length) {
    throw new Error('BENCHMARK_MECHANISM_UNIVERSE_MISMATCH');
  }
  if (JSON.stringify(registry.authority) !== JSON.stringify(REGISTRY_AUTHORITY)) throw new Error('BENCHMARK_REGISTRY_AUTHORITY_INVALID');
  return true;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicate = new Set();
  for (const value of values) (seen.has(value) ? duplicate : seen).add(value);
  return [...duplicate].sort();
}

function mechanismCompliance(item, activeSet) {
  if (item.executionRequirement !== 'EXECUTABLE') {
    return deepFreeze({ mechanismId: item.mechanismId, executable: false, state: 'NOT_REQUIRED', countableFamilyCount: 0, hasB1: false, hasB2: false, duplicateExampleIds: [], reasons: ['BENCHMARK_REQUIREMENT_PENDING'] });
  }
  const countable = item.families.filter((value) => value.countsTowardMinimum && ['B1', 'B2'].includes(value.evidenceClass));
  const duplicateExampleIds = duplicateValues(countable.map((value) => value.engineeringExampleId));
  const reasons = [];
  if (!activeSet.has(item.capabilityId)) reasons.push('DECLARED_EXECUTABLE_CAPABILITY_NOT_ACTIVE');
  if (new Set(countable.map((value) => value.engineeringExampleId)).size < 2) reasons.push('MINIMUM_INDEPENDENT_FAMILIES_NOT_MET');
  if (!countable.some((value) => value.evidenceClass === 'B1')) reasons.push('B1_CONTROLLED_FAMILY_MISSING');
  if (!countable.some((value) => value.evidenceClass === 'B2')) reasons.push('B2_INDEPENDENT_FAMILY_MISSING');
  if (duplicateExampleIds.length) reasons.push('DUPLICATE_COUNTABLE_ENGINEERING_EXAMPLE');
  return deepFreeze({
    mechanismId: item.mechanismId, executable: true, state: reasons.length ? 'BLOCKED' : 'READY',
    countableFamilyCount: new Set(countable.map((value) => value.engineeringExampleId)).size,
    hasB1: countable.some((value) => value.evidenceClass === 'B1'),
    hasB2: countable.some((value) => value.evidenceClass === 'B2'), duplicateExampleIds, reasons,
  });
}

export function evaluateVibrationBenchmarkRegistry({
  registry = VIBRATION_BENCHMARK_REGISTRY,
  activeCapabilityIds = [],
} = {}) {
  validateVibrationBenchmarkRegistry(registry);
  if (!Array.isArray(activeCapabilityIds)) throw new TypeError('activeCapabilityIds must be an array.');
  const activeVib = [...new Set(activeCapabilityIds.filter((id) => String(id).startsWith('VIB.')))].sort();
  const activeSet = new Set(activeVib);
  const mapped = new Set(registry.mechanisms.map((item) => item.capabilityId).filter(Boolean));
  const unmappedActiveCapabilityIds = activeVib.filter((id) => !mapped.has(id));
  const mechanisms = registry.mechanisms.map((item) => mechanismCompliance(item, activeSet));
  const reasons = [];
  if (unmappedActiveCapabilityIds.length) reasons.push('ACTIVE_VIB_CAPABILITY_UNMAPPED');
  if (mechanisms.some((item) => item.executable && item.state !== 'READY')) reasons.push('EXECUTABLE_MECHANISM_BENCHMARK_BLOCKED');
  return deepFreeze({
    schema: VIBRATION_BENCHMARK_COMPLIANCE_SCHEMA,
    registryRevision: registry.revision,
    registryFingerprint: vibrationBenchmarkRegistryFingerprint(registry.mechanisms),
    state: reasons.length ? 'BLOCKED' : 'READY',
    mechanisms, unmappedActiveCapabilityIds, reasons,
    authority: REGISTRY_AUTHORITY,
  });
}
