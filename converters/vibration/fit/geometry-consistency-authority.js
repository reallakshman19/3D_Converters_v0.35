export const FIT_GEOMETRY_CONSISTENCY_AUTHORITY_SCHEMA = 'FitGeometryConsistencyAuthority.v1';
export const FIT_GEOMETRY_CONSISTENCY_AUTHORITY_STATE_SCHEMA = 'FitGeometryConsistencyAuthorityState.v1';

const BLOCKED_STATE = 'BLOCKED_TOLERANCE_AUTHORITY';
const BLOCKER = 'GEOMETRY_CONSISTENCY_TOLERANCE_NOT_AUTHORIZED';
const RULE_ID = 'FIT-M5-OD-WALL-ID-CONSISTENCY';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function invalid(message, details = {}) {
  const error = new Error(message);
  error.name = 'FitGeometryConsistencyAuthorityError';
  error.code = 'FIT_GEOMETRY_CONSISTENCY_AUTHORITY_INVALID';
  error.details = Object.freeze({ ...details });
  return error;
}

const SOURCE_PINS = deepFreeze({
  familyGovernance: {
    repository: 'reallaksh19/3D_Converters',
    issue: 429,
    section: '4 Canonical engineering-data rules / Geometry',
    requirement: 'OD_WALL_ID_CONSISTENCY_WITH_CONTROLLED_TOLERANCE',
  },
  fitMethod: {
    repository: 'reallaksh19/3D_Converters',
    path: 'docs/vibration/FIT-Engineering-Method-Specification-v1.md',
    blob: '31942bb400ff2cc065a4afa3423d23d05aa685a6',
    methodRevision: 'ei-aviff2-fit-screening-v1',
    inputRule: 'insideDiameterM optional authoritative; otherwise OD - 2T',
  },
});

const FOREIGN_AUTHORITIES = deepFreeze([
  {
    id: 'PIPE_WALL_MASTER_EPSILON_MM',
    path: 'converters/pipe-wall-master/pipe-wall-master.js',
    blob: '6aa991042d40ba9a36c0797c8707eea5c0de5b85',
    purpose: 'MASTER_ROW_NUMERICAL_EQUALITY_EPSILON',
    adopted: false,
  },
  {
    id: 'PIPE_WALL_MASTER_OD_PARITY',
    path: 'converters/pipe-wall-master/pipe-wall-master.js',
    blob: '6aa991042d40ba9a36c0797c8707eea5c0de5b85',
    purpose: 'SOURCE_INCH_MM_OD_PARITY_WARNING',
    adopted: false,
  },
  {
    id: 'B313_NEGATIVE_MILL_TOLERANCE',
    path: 'converters/b313-thickness/b313-tolerance.js',
    blob: '99da357e4f6c9c84c53702b5f2f2878e09df4343',
    purpose: 'B313_MANUFACTURING_WALL_THICKNESS_BASIS',
    adopted: false,
  },
  {
    id: 'FIT_BENCHMARK_RECONCILIATION_TOLERANCE',
    path: 'Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json',
    blob: '92c589d4f347f59abd29c059b13462802f436deb',
    purpose: 'BENCHMARK_OUTPUT_RECONCILIATION_ONLY',
    adopted: false,
  },
]);

const AUTHORITY = deepFreeze({
  authority: 'GEOMETRY_DATA_CONSISTENCY_ONLY',
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  codeCompliance: false,
});

export const FIT_GEOMETRY_CONSISTENCY_AUTHORITY = deepFreeze({
  schema: FIT_GEOMETRY_CONSISTENCY_AUTHORITY_SCHEMA,
  ruleId: RULE_ID,
  revision: 'VIB-M5-GEOMETRY-CONSISTENCY-AUTHORITY-2026-08-17',
  state: BLOCKED_STATE,
  comparisonEquation: 'insideDiameter vs outsideDiameter - 2 * wallThickness',
  tolerance: null,
  sourcePins: SOURCE_PINS,
  foreignAuthorities: FOREIGN_AUTHORITIES,
  authority: AUTHORITY,
  productionExecutionAllowed: false,
});

function assertIdentity(record) {
  if (record?.schema !== FIT_GEOMETRY_CONSISTENCY_AUTHORITY_SCHEMA) {
    throw invalid('Geometry consistency authority schema mismatch.');
  }
  if (record.ruleId !== RULE_ID || record.state !== BLOCKED_STATE) {
    throw invalid('Geometry consistency authority must retain the blocked rule identity.');
  }
}

function assertBlockedNumerics(record) {
  if (record.tolerance !== null) {
    throw invalid('Blocked geometry consistency authority must not contain a tolerance.');
  }
  for (const key of ['toleranceValue', 'toleranceMm', 'epsilon']) {
    if (Object.hasOwn(record, key)) {
      throw invalid(`Blocked geometry consistency authority must not contain ${key}.`, { key });
    }
  }
  if (record.productionExecutionAllowed !== false) {
    throw invalid('Blocked geometry consistency authority cannot allow production execution.');
  }
}

function assertAuthority(record) {
  const authority = record.authority ?? {};
  if (authority.authority !== 'GEOMETRY_DATA_CONSISTENCY_ONLY'
      || authority.engineeringAuthority !== 'NONE'
      || authority.screeningAuthority !== 'NOT_AUTHORIZED'
      || authority.designAuthority !== false) {
    throw invalid('Geometry consistency authority boundary is invalid.');
  }
}

function assertForeignAuthorities(record) {
  if (!Array.isArray(record.foreignAuthorities) || record.foreignAuthorities.length !== 4) {
    throw invalid('Geometry consistency foreign-authority inventory is incomplete.');
  }
  if (record.foreignAuthorities.some((row) => row?.adopted !== false)) {
    throw invalid('Foreign tolerance authority cannot be silently adopted.');
  }
}

export function validateFitGeometryConsistencyAuthority(record = FIT_GEOMETRY_CONSISTENCY_AUTHORITY) {
  assertIdentity(record);
  assertBlockedNumerics(record);
  assertAuthority(record);
  assertForeignAuthorities(record);
  return record;
}

export function evaluateFitGeometryConsistencyAuthority(record = FIT_GEOMETRY_CONSISTENCY_AUTHORITY) {
  validateFitGeometryConsistencyAuthority(record);
  return deepFreeze({
    schema: FIT_GEOMETRY_CONSISTENCY_AUTHORITY_STATE_SCHEMA,
    ruleId: RULE_ID,
    state: 'BLOCKED_SOURCE_AUTHORITY',
    blocker: BLOCKER,
    productionExecutionAllowed: false,
    engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  });
}
