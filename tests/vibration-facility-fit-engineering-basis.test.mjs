import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  buildVibrationFacilityFitPlan,
  runVibrationFacilityFitBenchmarkFromTables,
} from '../converters/vibration/facility/index.js';
import {
  FIT_FACILITY_PROCESS_REFERENCE_BASES,
  FIT_FACILITY_SPAN_DETERMINATION_METHODS,
  FIT_FACILITY_SUPPORT_EVIDENCE_STATUSES,
  FIT_FACILITY_WALL_BASES,
} from '../converters/vibration/facility/fit-engineering-basis.js';
import {
  FIT_BENCHMARK_BASIS_RECONCILIATION,
  FIT_BENCHMARK_BASIS_SOURCE_REFS,
  evaluateFitBenchmarkBasisReconciliation,
} from '../converters/vibration/fit/benchmark-basis-reconciliation.js';
import { VIBRATION_INTEGRITY_DATASET_SCHEMA } from '../converters/vibration/dataset/schema.js';
import { VIBRATION_FIT_DATA_BLOCKER_FIELDS } from '../converters/vibration/tabular/fit-data-blockers.js';
import { buildVibrationFitUiBenchmarkCase } from '../tabs/vibration-integrity-benchmarks.js';
import { serializeVibrationIntegrityInputTable } from '../tabs/vibration-integrity-input-model.js';

const P = FIT_FACILITY_ENRICHMENT_PROPERTIES;

function row(property, value, options = {}) {
  return {
    canonicalId: 'CAN-1', property, value, source: options.source ?? 'M5-EVIDENCE',
    ...(options.caseId ? { caseId: options.caseId } : {}),
    ...(options.unit ? { unit: options.unit } : {}),
  };
}

function baseEnrichment() {
  return [
    row(P.ASSESSMENT_POINT, true),
    row(P.OUTSIDE_DIAMETER, 168.3, { unit: 'mm' }),
    row(P.WALL_THICKNESS, 7.11, { unit: 'mm' }),
    row(P.MAX_UNSUPPORTED_SPAN, 6.4, { unit: 'm', source: 'LEGACY-SPAN' }),
  ];
}

function basisEnrichment(caseId = 'NORMAL', options = {}) {
  return [
    row(P.WALL_BASIS, 'AS_BUILT'),
    row(P.MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS, 6.1, { unit: 'm' }),
    row(P.SPAN_DETERMINATION_METHOD, options.spanMethod ?? 'LINE_WALK_EFFECTIVE_SUPPORTS'),
    row(P.SUPPORT_EVIDENCE_STATUS, options.supportStatus ?? 'EFFECTIVE_SUPPORTS_CONFIRMED'),
    row(P.DENSITY_BASIS, 'ACTUAL', { caseId }),
    row(P.OPERATING_SCENARIO_COHERENT, true, { caseId }),
  ];
}

function dataset({ operatingCase, enrichment = [] } = {}) {
  return {
    schema: VIBRATION_INTEGRITY_DATASET_SCHEMA,
    authority: 'DATA_ASSEMBLY_ONLY', engineeringAuthority: 'NONE', screeningAuthorized: false,
    exchangeIntegrityStatus: 'DECLARED_NOT_REVERIFIED',
    lines: [{ line: 'L-100', elementCanonicalIds: ['CAN-1'] }],
    unassignedElementCanonicalIds: [],
    operatingCases: [operatingCase ?? {
      line: 'L-100', caseId: 'NORMAL', phase: 'LIQUID', source: 'HMB-1',
      massFlow: { value: 100, unit: 'kg/s' }, density: { value: 900, unit: 'kg/m3' },
    }],
    enrichment: [...baseEnrichment(), ...enrichment],
  };
}

function item(input) {
  return buildVibrationFacilityFitPlan(input).items[0];
}

function benchmarkTableInput(id) {
  const benchmark = buildVibrationFitUiBenchmarkCase(id);
  return {
    topology: {
      format: 'CSV_ELEMENTS_ONLY',
      data: serializeVibrationIntegrityInputTable(benchmark.tables.topology),
      sourceFileName: `${benchmark.id}.csv`,
    },
    operatingCaseCsv: serializeVibrationIntegrityInputTable(benchmark.tables.operating),
    enrichmentCsv: serializeVibrationIntegrityInputTable(benchmark.tables.enrichment),
    dataBlockerCsv: '',
  };
}

test('M5 vocab distinguishes wall, process reference condition, support status and span method', () => {
  assert.deepEqual(FIT_FACILITY_WALL_BASES, ['NOMINAL', 'MIN_SPEC', 'AS_BUILT', 'MEASURED_CURRENT']);
  assert.deepEqual(FIT_FACILITY_PROCESS_REFERENCE_BASES, ['ACTUAL', 'STANDARD', 'NORMAL']);
  assert.deepEqual(FIT_FACILITY_SUPPORT_EVIDENCE_STATUSES, [
    'EFFECTIVE_SUPPORTS_CONFIRMED', 'METHOD_ACCEPTED_PROJECT_STANDARD',
  ]);
  assert.deepEqual(FIT_FACILITY_SPAN_DETERMINATION_METHODS, [
    'LINE_WALK_EFFECTIVE_SUPPORTS', 'ISOMETRIC_EFFECTIVE_SUPPORTS', 'PROJECT_PIPING_STANDARD',
  ]);
});

test('legacy span and legacy support boolean cannot establish M5 support custody', () => {
  const result = item(dataset({ enrichment: [
    row(P.WALL_BASIS, 'AS_BUILT'),
    row(P.MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS, 6.1, { unit: 'm' }),
    row(P.SPAN_DETERMINATION_METHOD, 'LINE_WALK_EFFECTIVE_SUPPORTS'),
    row('SUPPORT_EFFECTIVENESS_CONFIRMED', true),
    row(P.DENSITY_BASIS, 'ACTUAL', { caseId: 'NORMAL' }),
    row(P.OPERATING_SCENARIO_COHERENT, true, { caseId: 'NORMAL' }),
  ] }));
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.request, null);
  assert(result.engineeringBasis.missing.includes('supportEvidenceStatus'));
});

test('physically confirmed effective supports make explicit liquid basis READY', () => {
  const result = item(dataset({ enrichment: basisEnrichment() }));
  assert.equal(result.status, 'READY', JSON.stringify(result));
  assert.equal(result.engineeringBasis.support.evidenceStatus, 'EFFECTIVE_SUPPORTS_CONFIRMED');
  assert.equal(result.engineeringBasis.support.spanDeterminationMethod, 'LINE_WALK_EFFECTIVE_SUPPORTS');
  assert.equal(result.engineeringBasis.process.densityReferenceBasis, 'ACTUAL');
  assert.equal(result.request.inputs.maximumUnsupportedSpan, 6.1);
});

test('D2-style project-standard span is valid without faking physical support confirmation', () => {
  const result = item(dataset({ enrichment: basisEnrichment('NORMAL', {
    supportStatus: 'METHOD_ACCEPTED_PROJECT_STANDARD',
    spanMethod: 'PROJECT_PIPING_STANDARD',
  }) }));
  assert.equal(result.status, 'READY', JSON.stringify(result));
  assert.equal(result.engineeringBasis.support.evidenceStatus, 'METHOD_ACCEPTED_PROJECT_STANDARD');
  assert.equal(result.engineeringBasis.support.spanDeterminationMethod, 'PROJECT_PIPING_STANDARD');
});

test('support status and span determination method must be mutually coherent', () => {
  const result = item(dataset({ enrichment: basisEnrichment('NORMAL', {
    supportStatus: 'METHOD_ACCEPTED_PROJECT_STANDARD',
    spanMethod: 'LINE_WALK_EFFECTIVE_SUPPORTS',
  }) }));
  assert.equal(result.status, 'NOT_READY');
  assert(result.engineeringBasis.invalid.includes('supportEvidenceStatus'));
  assert(result.engineeringBasis.reasons.includes('SUPPORT_EVIDENCE_METHOD_MISMATCH'));
});

test('STANDARD or NORMAL density reference basis blocks without conversion', () => {
  for (const basis of ['STANDARD', 'NORMAL']) {
    const enrichment = basisEnrichment().map((entry) => entry.property === P.DENSITY_BASIS
      ? { ...entry, value: basis } : entry);
    const result = item(dataset({ enrichment }));
    assert.equal(result.status, 'NOT_READY');
    assert(result.engineeringBasis.invalid.includes('densityReferenceBasis'));
    assert(result.engineeringBasis.reasons.includes('PROCESS_BASIS_CONVERSION_REQUIRED:densityReferenceBasis'));
  }
});

test('explicit velocity requires ACTUAL velocity reference basis', () => {
  const operatingCase = {
    line: 'L-100', caseId: 'NORMAL', phase: 'LIQUID', source: 'HMB-1',
    velocity: { value: 5.5, unit: 'm/s' }, density: { value: 900, unit: 'kg/m3' },
  };
  const missing = item(dataset({ operatingCase, enrichment: basisEnrichment() }));
  assert(missing.engineeringBasis.missing.includes('velocityReferenceBasis'));
  const ready = item(dataset({
    operatingCase,
    enrichment: [...basisEnrichment(), row(P.VELOCITY_BASIS, 'ACTUAL', { caseId: 'NORMAL' })],
  }));
  assert.equal(ready.status, 'READY', JSON.stringify(ready));
});

test('component-derived multiphase requires ACTUAL component density reference bases', () => {
  const operatingCase = { line: 'L-100', caseId: 'NORMAL', phase: 'MULTIPHASE', source: 'HMB-MP' };
  const componentRows = [
    row(P.MULTIPHASE_RESOLUTION_MODE, 'COMPONENT_DERIVED', { caseId: 'NORMAL' }),
    row(P.GAS_MASS_FLOW, 5, { caseId: 'NORMAL', unit: 'kg/s' }),
    row(P.GAS_DENSITY, 7, { caseId: 'NORMAL', unit: 'kg/m3' }),
    row(P.LIQUID_MASS_FLOW, 50, { caseId: 'NORMAL', unit: 'kg/s' }),
    row(P.LIQUID_DENSITY, 900, { caseId: 'NORMAL', unit: 'kg/m3' }),
  ];
  const base = basisEnrichment().filter((entry) => entry.property !== P.DENSITY_BASIS);
  const blocked = item(dataset({ operatingCase, enrichment: [...base, ...componentRows] }));
  assert(blocked.engineeringBasis.missing.includes('gasDensityReferenceBasis'));
  assert(blocked.engineeringBasis.missing.includes('liquidDensityReferenceBasis'));
  const ready = item(dataset({ operatingCase, enrichment: [
    ...base, ...componentRows,
    row(P.GAS_DENSITY_BASIS, 'ACTUAL', { caseId: 'NORMAL' }),
    row(P.LIQUID_DENSITY_BASIS, 'ACTUAL', { caseId: 'NORMAL' }),
  ] }));
  assert.equal(ready.status, 'READY', JSON.stringify(ready));
});

test('scenario coherence remains exact-case evidence', () => {
  const result = item(dataset({ enrichment: basisEnrichment('DESIGN') }));
  assert.equal(result.status, 'NOT_READY');
  assert(result.engineeringBasis.missing.includes('operatingScenarioCoherent'));
  assert(result.engineeringBasis.missing.includes('densityReferenceBasis'));
});

test('blocker vocabulary exposes new status and does not retain ambiguous support boolean', () => {
  assert(VIBRATION_FIT_DATA_BLOCKER_FIELDS.SUPPORT_EVIDENCE_STATUS);
  assert.equal(VIBRATION_FIT_DATA_BLOCKER_FIELDS.SUPPORT_EFFECTIVENESS_CONFIRMED, undefined);
  for (const field of [
    'MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS', 'WALL_BASIS', 'SPAN_DETERMINATION_METHOD',
    'DENSITY_BASIS', 'VELOCITY_BASIS', 'GAS_DENSITY_BASIS', 'LIQUID_DENSITY_BASIS',
    'OPERATING_SCENARIO_COHERENT',
  ]) assert(VIBRATION_FIT_DATA_BLOCKER_FIELDS[field], `missing blocker field ${field}`);
});

test('controlled benchmark remains blocked while reconciliation records source distinctions', () => {
  const state = evaluateFitBenchmarkBasisReconciliation();
  assert.equal(state.state, 'BLOCKED_SOURCE_BASIS');
  assert.equal(FIT_BENCHMARK_BASIS_RECONCILIATION.length, 10);
  assert(FIT_BENCHMARK_BASIS_RECONCILIATION.every((entry) => entry.reconciliationState === 'UNRESOLVED_SOURCE_AUTHORITY'));
  const d2 = FIT_BENCHMARK_BASIS_RECONCILIATION.find((entry) => entry.id === 'EI-D2-FIT-STREAM-4-SUPPLY-COOLER-14IN');
  const recycle = FIT_BENCHMARK_BASIS_RECONCILIATION.find((entry) => entry.id === 'EI-D2-FIT-RECYCLE-SUCTION-6IN');
  const d4 = FIT_BENCHMARK_BASIS_RECONCILIATION.find((entry) => entry.id === 'EI-D4-FIT-PRODUCED-WATER-10IN');
  assert.equal(d2.support.evidenceStatus, 'METHOD_ACCEPTED_PROJECT_STANDARD');
  assert.equal(d2.support.spanDeterminationMethod, 'PROJECT_PIPING_STANDARD');
  assert.match(recycle.process.evidenceDisposition, /CONSERVATIVE/u);
  assert.equal(d4.support.evidenceStatus, 'EFFECTIVE_SUPPORTS_CONFIRMED');
  assert.equal(d4.support.spanDeterminationMethod, 'LINE_WALK_EFFECTIVE_SUPPORTS');
  assert.equal(FIT_BENCHMARK_BASIS_SOURCE_REFS.corroboratingMarkdown.blob, 'c050cd90802c27241c510c6f0ac43bfaf7a89e9d');
  assert.doesNotMatch(JSON.stringify(FIT_BENCHMARK_BASIS_RECONCILIATION), /standardLof|tolerance|expected/iu);

  const envelope = runVibrationFacilityFitBenchmarkFromTables(
    benchmarkTableInput('EI-D4-FIT-PRODUCED-WATER-10IN'), { allowLimitedExchange: true },
  );
  assert.equal(envelope.workflow.plan.items[0].status, 'NOT_READY');
  assert(envelope.workflow.plan.items[0].missing.includes('supportEvidenceStatus'));
  assert.equal(envelope.workflow.result.rows[0].status, 'NOT_ASSESSED_DATA_INCOMPLETE');
});
