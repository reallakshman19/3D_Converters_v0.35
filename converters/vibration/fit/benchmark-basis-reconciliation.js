export const FIT_BENCHMARK_BASIS_RECONCILIATION_SCHEMA = 'FitBenchmarkEngineeringBasisReconciliation.v1';
export const FIT_BENCHMARK_BASIS_RECONCILIATION_STATE_SCHEMA = 'FitBenchmarkEngineeringBasisReconciliationState.v1';

export const FIT_BENCHMARK_BASIS_SOURCE_REFS = Object.freeze({
  traceabilityRecord: Object.freeze({
    repository: 'reallaksh19/3D_Converters',
    commit: '2e4ffa0fa19e22aaa949434dc42244c7546636e0',
    path: 'docs/vibration/FIT-EI-Worked-Example-Traceability-v1.md',
    blob: 'a2e43e8d16f89ea41b6f1901a3fec2d8fd387a49',
    authority: 'CURRENT_AUTHORITY_TRACEABILITY',
  }),
  sourceBasisRecord: Object.freeze({
    repository: 'reallaksh19/3D_Converters',
    commit: '2e4ffa0fa19e22aaa949434dc42244c7546636e0',
    path: 'docs/vibration/FIT-Source-Basis-Evidence-v1.md',
    blob: '4f7590b9f08a81db0aa6081b9606469c72aec2a5',
    authority: 'CURRENT_AUTHORITY_SOURCE_BASIS',
  }),
  corroboratingMarkdown: Object.freeze({
    repository: 'reallaksh19/Advanced_Analysis',
    commit: '04328852dced9f5c4827da8afe8a82aeb8b1a1d3',
    path: 'docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md',
    blob: 'c050cd90802c27241c510c6f0ac43bfaf7a89e9d',
    authority: 'CORROBORATING_TRANSCRIPTION_ONLY',
  }),
  publishedExamples: Object.freeze({
    repository: 'reallaksh19/Common',
    commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
    path: 'EI - AVIFF Guidelines 2nd Edition_Examples.pdf',
    blob: '3e2517d0df527a051084fc02e69cb7afa31f8d47',
    authority: 'PUBLISHED_BENCHMARK_SOURCE',
    directReconciliation: 'NOT_RUN_BINARY_SOURCE',
  }),
  qualificationAnchor: Object.freeze({
    repository: 'reallaksh19/Common',
    commit: '7bfead910f6bca91b10748ead009e40f20c82219',
    path: 'Energy-Institute-AVIFF---Worked-Examples.doc.docx',
    blob: 'ceee15ed5f7f320045d5f3979024e2e8664613f2',
    authority: 'OWNER_QUALIFICATION_ANCHOR',
    directReconciliation: 'NOT_RUN_BINARY_SOURCE',
  }),
});

const SOURCE_AUTHORITY = 'CORROBORATED_PENDING_HIGHER_SOURCE';
const UNRESOLVED = 'UNRESOLVED_SOURCE_AUTHORITY';
const EXPECTED_IDS = Object.freeze([
  'EI-D2-FIT-STREAM-4-SUPPLY-COOLER-14IN',
  'EI-D2-FIT-STREAM-5-SUCTION-SCRUBBER-14IN',
  'EI-D2-FIT-STREAM-6-COMPRESSOR-SUCTION-14IN',
  'EI-D2-FIT-STREAM-7-COMPRESSOR-DISCHARGE-8IN',
  'EI-D2-FIT-RECYCLE-DISCHARGE-8IN',
  'EI-D2-FIT-RECYCLE-SUCTION-6IN',
  'EI-D2-FIT-RELIEF-UPSTREAM-4IN',
  'EI-D2-FIT-RELIEF-DOWNSTREAM-6IN',
  'EI-D4-FIT-SEPARATOR-INLET-20IN',
  'EI-D4-FIT-PRODUCED-WATER-10IN',
]);
const FORBIDDEN_KEYS = Object.freeze(['expected', 'tolerance', 'standardLof', 'standardFv', 'outputs']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function d2(id, processDisposition, scenario = 'NORMAL_FULL_FLOW') {
  return {
    schema: FIT_BENCHMARK_BASIS_RECONCILIATION_SCHEMA,
    id,
    reconciliationState: UNRESOLVED,
    wall: { basis: null, sourceAuthority: SOURCE_AUTHORITY },
    support: {
      evidenceStatus: 'METHOD_ACCEPTED_PROJECT_STANDARD',
      spanDeterminationMethod: 'PROJECT_PIPING_STANDARD',
      sourceAuthority: SOURCE_AUTHORITY,
    },
    process: {
      referenceConditionBasis: 'ACTUAL',
      evidenceDisposition: processDisposition,
      sourceAuthority: SOURCE_AUTHORITY,
    },
    scenario: { identity: scenario, coherent: true, sourceAuthority: SOURCE_AUTHORITY },
  };
}

function d4(id, processDisposition) {
  return {
    schema: FIT_BENCHMARK_BASIS_RECONCILIATION_SCHEMA,
    id,
    reconciliationState: UNRESOLVED,
    wall: { basis: null, sourceAuthority: SOURCE_AUTHORITY },
    support: {
      evidenceStatus: 'EFFECTIVE_SUPPORTS_CONFIRMED',
      spanDeterminationMethod: 'LINE_WALK_EFFECTIVE_SUPPORTS',
      sourceAuthority: SOURCE_AUTHORITY,
    },
    process: {
      referenceConditionBasis: 'ACTUAL',
      evidenceDisposition: processDisposition,
      sourceAuthority: SOURCE_AUTHORITY,
    },
    scenario: {
      identity: 'REVISED_INCREASED_WATER_CUT', coherent: true, sourceAuthority: SOURCE_AUTHORITY,
    },
  };
}

export const FIT_BENCHMARK_BASIS_RECONCILIATION = deepFreeze([
  d2('EI-D2-FIT-STREAM-4-SUPPLY-COOLER-14IN', 'SOURCE_DIRECT_NORMAL_FULL_FLOW'),
  d2('EI-D2-FIT-STREAM-5-SUCTION-SCRUBBER-14IN', 'SOURCE_DIRECT_NORMAL_FULL_FLOW'),
  d2('EI-D2-FIT-STREAM-6-COMPRESSOR-SUCTION-14IN', 'SOURCE_DIRECT_NORMAL_FULL_FLOW'),
  d2('EI-D2-FIT-STREAM-7-COMPRESSOR-DISCHARGE-8IN', 'SOURCE_DIRECT_NORMAL_FULL_FLOW'),
  d2('EI-D2-FIT-RECYCLE-DISCHARGE-8IN', 'METHOD_CONSERVATIVE_MAX_DISCHARGE_FLOW', 'RECYCLE_OPERATION'),
  d2('EI-D2-FIT-RECYCLE-SUCTION-6IN', 'METHOD_CONSERVATIVE_FLOW_AND_DENSITY_ASSUMPTION', 'RECYCLE_OPERATION'),
  d2('EI-D2-FIT-RELIEF-UPSTREAM-4IN', 'VALVE_DATASHEET_REQUIRED_CAPACITY', 'RELIEF_OPERATION'),
  d2('EI-D2-FIT-RELIEF-DOWNSTREAM-6IN', 'PROCESS_SIMULATION_DENSITY_PLUS_RELIEF_CAPACITY', 'RELIEF_OPERATION'),
  d4('EI-D4-FIT-SEPARATOR-INLET-20IN', 'CALCULATED_AGGREGATE_EFFECTIVE_REVISED_SCENARIO'),
  d4('EI-D4-FIT-PRODUCED-WATER-10IN', 'SOURCE_DIRECT_REVISED_SCENARIO'),
]);

const RECONCILIATION_AUTHORITY = deepFreeze({
  authority: 'SOURCE_RECONCILIATION_ONLY',
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  productionExecutionAllowed: false,
});

function reconciliationError(code, message) {
  const error = new Error(message);
  error.name = 'FitBenchmarkBasisReconciliationError';
  error.code = code;
  return error;
}

function assertNoOracleKeys(value, path = 'registry') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) throw reconciliationError(
      'FIT_BENCHMARK_BASIS_ORACLE_FIELD_FORBIDDEN', `${path}.${key} is not source-basis custody.`,
    );
    assertNoOracleKeys(child, `${path}.${key}`);
  }
}

function validSupport(entry) {
  const support = entry.support;
  if (support.evidenceStatus === 'METHOD_ACCEPTED_PROJECT_STANDARD') {
    return support.spanDeterminationMethod === 'PROJECT_PIPING_STANDARD';
  }
  return support.evidenceStatus === 'EFFECTIVE_SUPPORTS_CONFIRMED'
    && support.spanDeterminationMethod === 'LINE_WALK_EFFECTIVE_SUPPORTS';
}

export function validateFitBenchmarkBasisReconciliation() {
  const ids = FIT_BENCHMARK_BASIS_RECONCILIATION.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw reconciliationError(
    'FIT_BENCHMARK_BASIS_DUPLICATE_ID', 'Benchmark basis reconciliation contains a duplicate id.',
  );
  if (ids.length !== EXPECTED_IDS.length || EXPECTED_IDS.some((id) => !ids.includes(id))) {
    throw reconciliationError('FIT_BENCHMARK_BASIS_UNIVERSE_MISMATCH', 'Benchmark basis reconciliation must cover the controlled ten-case FIT universe exactly.');
  }
  for (const entry of FIT_BENCHMARK_BASIS_RECONCILIATION) {
    if (entry.schema !== FIT_BENCHMARK_BASIS_RECONCILIATION_SCHEMA || !validSupport(entry)) {
      throw reconciliationError('FIT_BENCHMARK_BASIS_ENTRY_INVALID', `Invalid source-basis entry ${entry.id}.`);
    }
    if (!['UNRESOLVED_SOURCE_AUTHORITY', 'RECONCILED_HIGHER_SOURCE'].includes(entry.reconciliationState)) {
      throw reconciliationError('FIT_BENCHMARK_BASIS_STATE_INVALID', `Invalid reconciliation state for ${entry.id}.`);
    }
  }
  assertNoOracleKeys(FIT_BENCHMARK_BASIS_RECONCILIATION);
  return true;
}

export function evaluateFitBenchmarkBasisReconciliation() {
  validateFitBenchmarkBasisReconciliation();
  const unresolved = FIT_BENCHMARK_BASIS_RECONCILIATION
    .filter((entry) => entry.reconciliationState !== 'RECONCILED_HIGHER_SOURCE')
    .map((entry) => entry.id);
  return deepFreeze({
    schema: FIT_BENCHMARK_BASIS_RECONCILIATION_STATE_SCHEMA,
    state: unresolved.length ? 'BLOCKED_SOURCE_BASIS' : 'READY',
    blocker: unresolved.length ? 'FIT_CONTROLLED_BENCHMARK_FACILITY_M5_METADATA' : null,
    unresolved,
    authority: RECONCILIATION_AUTHORITY,
  });
}
