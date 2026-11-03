export const FIT_PROCESS_BASIS_AUTHORITY_SCHEMA = 'FitProcessBasisAuthority.v1';
export const FIT_PROCESS_BASIS_AUTHORITY_STATE_SCHEMA = 'FitProcessBasisAuthorityState.v1';

const BLOCKED_STATE = 'BLOCKED_PROCESS_ACTUALIZATION_AUTHORITY';
const BLOCKER = 'PROCESS_ACTUALIZATION_METHOD_NOT_AUTHORIZED';
const RULE_ID = 'FIT-M5-PROCESS-REFERENCE-ACTUALIZATION';
const BLOCKED_FIELDS = Object.freeze([
  'referenceConditions',
  'conversionModel',
  'compressibilityModel',
  'gasConstant',
  'atmosphericPressure',
  'pressureReferenceRule',
  'invariantQuantityRule',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function invalid(message, details = {}) {
  const error = new Error(message);
  error.name = 'FitProcessBasisAuthorityError';
  error.code = 'FIT_PROCESS_BASIS_AUTHORITY_INVALID';
  error.details = Object.freeze({ ...details });
  return error;
}

const SOURCE_PINS = deepFreeze({
  familyGovernance: {
    repository: 'reallaksh19/3D_Converters',
    issue: 429,
    section: '4 Canonical engineering-data rules / Process-property basis',
    requirement: 'STANDARD_NORMAL_TO_ACTUAL_EXPLICIT_TRACEABLE_RESOLUTION',
  },
  engineeringBasis: {
    repository: 'reallaksh19/3D_Converters',
    path: 'converters/vibration/facility/fit-engineering-basis.js',
    blob: 'bc673ad368f2b88d0228ca31437adfde9700b962',
    currentBehavior: 'NON_ACTUAL_PROCESS_BASIS_FAILS_CLOSED',
  },
  datasetSchema: {
    repository: 'reallaksh19/3D_Converters',
    path: 'converters/vibration/dataset/schema.js',
    blob: 'cf893f3c7f6defba0f2e8d4f5162656361ee1182',
  },
  datasetRecords: {
    repository: 'reallaksh19/3D_Converters',
    path: 'converters/vibration/dataset/records.js',
    blob: '2f3ad7fd9e75974d67992e6ae4339eac1a554122',
  },
  fitMethod: {
    repository: 'reallaksh19/3D_Converters',
    path: 'docs/vibration/FIT-Engineering-Method-Specification-v1.md',
    blob: '31942bb400ff2cc065a4afa3423d23d05aa685a6',
    methodRevision: 'ei-aviff2-fit-screening-v1',
    demandRule: 'rhoV2 = resolved density * resolved velocity^2',
  },
});

const FOREIGN_AUTHORITIES = deepFreeze([
  {
    id: 'ENGINEERING_UNIT_CONVERSION',
    path: 'converters/engineering-calculations/units.js',
    blob: 'bbc788f5da22ac39d6b694ccf9fbadb57078ee1e',
    purpose: 'DIMENSIONAL_UNIT_CONVERSION_ONLY',
    adopted: false,
  },
  {
    id: 'VIBRATION_UI_UNIT_EDITING',
    path: 'tabs/vibration-integrity-input-units.js',
    blob: 'bee61c8d38201b8f4aa047fc1dfc6a35a6e8100d',
    purpose: 'VISIBLE_VALUE_UNIT_EDITING_ONLY',
    adopted: false,
  },
  {
    id: 'FIT_WORKED_EXAMPLE_ACTUAL_VECTORS',
    path: 'Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json',
    purpose: 'ACTUAL_CONDITION_BENCHMARK_INPUTS_NOT_CONVERSION_ORACLE',
    adopted: false,
  },
]);

const AUTHORITY = deepFreeze({
  authority: 'PROCESS_REFERENCE_CONVERSION_ONLY',
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  codeCompliance: false,
});

export const FIT_PROCESS_BASIS_AUTHORITY = deepFreeze({
  schema: FIT_PROCESS_BASIS_AUTHORITY_SCHEMA,
  ruleId: RULE_ID,
  revision: 'VIB-M5-PROCESS-BASIS-AUTHORITY-2026-08-17',
  state: BLOCKED_STATE,
  sourceBases: ['STANDARD', 'NORMAL'],
  targetBasis: 'ACTUAL',
  referenceConditions: null,
  conversionModel: null,
  compressibilityModel: null,
  gasConstant: null,
  atmosphericPressure: null,
  pressureReferenceRule: null,
  invariantQuantityRule: null,
  sourcePins: SOURCE_PINS,
  foreignAuthorities: FOREIGN_AUTHORITIES,
  authority: AUTHORITY,
  productionExecutionAllowed: false,
});

function assertIdentity(record) {
  if (record?.schema !== FIT_PROCESS_BASIS_AUTHORITY_SCHEMA) {
    throw invalid('FIT process-basis authority schema mismatch.');
  }
  if (record.ruleId !== RULE_ID || record.state !== BLOCKED_STATE || record.targetBasis !== 'ACTUAL') {
    throw invalid('FIT process-basis authority must retain the blocked actualization identity.');
  }
  if (!Array.isArray(record.sourceBases)
      || record.sourceBases.length !== 2
      || record.sourceBases[0] !== 'STANDARD'
      || record.sourceBases[1] !== 'NORMAL') {
    throw invalid('STANDARD and NORMAL must remain distinct blocked source bases.');
  }
}

function assertBlockedSemantics(record) {
  for (const field of BLOCKED_FIELDS) {
    if (record[field] !== null) {
      throw invalid(`Blocked process-basis authority must not contain ${field}.`, { field });
    }
  }
  if (record.productionExecutionAllowed !== false) {
    throw invalid('Blocked process actualization authority cannot allow production conversion.');
  }
}

function assertAuthority(record) {
  const authority = record.authority ?? {};
  if (authority.authority !== 'PROCESS_REFERENCE_CONVERSION_ONLY'
      || authority.engineeringAuthority !== 'NONE'
      || authority.screeningAuthority !== 'NOT_AUTHORIZED'
      || authority.designAuthority !== false) {
    throw invalid('FIT process-basis authority boundary is invalid.');
  }
}

function assertForeignAuthorities(record) {
  if (!Array.isArray(record.foreignAuthorities) || record.foreignAuthorities.length !== 3) {
    throw invalid('FIT process-basis foreign-authority inventory is incomplete.');
  }
  if (record.foreignAuthorities.some((row) => row?.adopted !== false)) {
    throw invalid('Foreign process/reference utilities cannot be silently adopted.');
  }
}

export function validateFitProcessBasisAuthority(record = FIT_PROCESS_BASIS_AUTHORITY) {
  assertIdentity(record);
  assertBlockedSemantics(record);
  assertAuthority(record);
  assertForeignAuthorities(record);
  return record;
}

function directActualState() {
  return deepFreeze({
    schema: FIT_PROCESS_BASIS_AUTHORITY_STATE_SCHEMA,
    ruleId: RULE_ID,
    sourceBasis: 'ACTUAL',
    targetBasis: 'ACTUAL',
    state: 'DIRECT_ACTUAL_BASIS',
    conversionRequired: false,
    productionExecutionAllowed: true,
    authorityCreatedByConversion: false,
  });
}

function blockedConversionState(sourceBasis) {
  return deepFreeze({
    schema: FIT_PROCESS_BASIS_AUTHORITY_STATE_SCHEMA,
    ruleId: RULE_ID,
    sourceBasis,
    targetBasis: 'ACTUAL',
    state: 'BLOCKED_SOURCE_AUTHORITY',
    blocker: BLOCKER,
    conversionRequired: true,
    productionExecutionAllowed: false,
    engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  });
}

export function evaluateFitProcessBasisAuthority(sourceBasis, record = FIT_PROCESS_BASIS_AUTHORITY) {
  validateFitProcessBasisAuthority(record);
  const basis = typeof sourceBasis === 'string' ? sourceBasis.trim().toUpperCase() : '';
  if (basis === 'ACTUAL') return directActualState();
  if (record.sourceBases.includes(basis)) return blockedConversionState(basis);
  throw invalid('Unsupported FIT process reference basis.', { sourceBasis });
}
