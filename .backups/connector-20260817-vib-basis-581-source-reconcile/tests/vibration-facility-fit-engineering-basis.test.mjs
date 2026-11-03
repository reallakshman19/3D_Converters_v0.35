import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  buildVibrationFacilityFitPlan,
  runVibrationFacilityFitBenchmarkFromTables,
} from '../converters/vibration/facility/index.js';
import {
  FIT_FACILITY_PROCESS_BASES,
  FIT_FACILITY_WALL_BASES,
} from '../converters/vibration/facility/fit-engineering-basis.js';
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

function basisEnrichment(caseId = 'NORMAL') {
  return [
    row(P.WALL_BASIS, 'NOMINAL'),
    row(P.MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS, 6.1, { unit: 'm' }),
    row(P.SPAN_DETERMINATION_METHOD, 'FIELD_VERIFIED_EFFECTIVE_SUPPORTS'),
    row(P.SUPPORT_EFFECTIVENESS_CONFIRMED, true),
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

function completeLiquid() {
  return dataset({ enrichment: basisEnrichment() });
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

test('M5 vocab is closed to the #429 wall and process basis values', () => {
  assert.deepEqual(FIT_FACILITY_WALL_BASES, ['NOMINAL', 'MIN_SPEC', 'AS_BUILT', 'MEASURED_CURRENT']);
  assert.deepEqual(FIT_FACILITY_PROCESS_BASES, ['ACTUAL', 'STANDARD', 'NORMAL']);
});

test('legacy MAX_UNSUPPORTED_SPAN alone cannot establish M5 engineering basis', () => {
  const result = item(dataset());
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.request, null);
  assert.equal(result.engineeringBasis.status, 'NOT_READY');
  assert(result.engineeringBasis.missing.includes('wallBasis'));
  assert(result.engineeringBasis.missing.includes('maximumSpanBetweenEffectiveSupports'));
  assert(result.engineeringBasis.missing.includes('spanDeterminationMethod'));
  assert(result.engineeringBasis.missing.includes('supportEffectivenessConfirmed'));
  assert(result.engineeringBasis.missing.includes('densityBasis'));
  assert(result.engineeringBasis.missing.includes('operatingScenarioCoherent'));
});

test('complete explicit liquid basis makes the plan READY and maps effective-support span to FIT API', () => {
  const result = item(completeLiquid());
  assert.equal(result.status, 'READY', JSON.stringify(result));
  assert.equal(result.engineeringBasis.status, 'READY');
  assert.equal(result.engineeringBasis.geometry.wallBasis, 'NOMINAL');
  assert.equal(result.engineeringBasis.support.maximumSpanBetweenEffectiveSupports.value, 6.1);
  assert.equal(result.engineeringBasis.process.densityBasis, 'ACTUAL');
  assert.equal(result.engineeringBasis.scenario.coherent, true);
  assert.equal(result.request.inputs.maximumUnsupportedSpan, 6.1);
  assert.equal(result.request.inputUnits.maximumUnsupportedSpan, 'm');
  assert.equal(result.sourceTrace.geometry.maximumSpanBetweenEffectiveSupports.source, 'M5-EVIDENCE');
});

test('STANDARD or NORMAL density basis blocks execution rather than being treated as actual', () => {
  for (const basis of ['STANDARD', 'NORMAL']) {
    const enrichment = basisEnrichment().map((entry) => entry.property === P.DENSITY_BASIS
      ? { ...entry, value: basis }
      : entry);
    const result = item(dataset({ enrichment }));
    assert.equal(result.status, 'NOT_READY');
    assert.equal(result.request, null);
    assert(result.engineeringBasis.invalid.includes('densityBasis'));
    assert(result.engineeringBasis.reasons.includes('PROCESS_BASIS_CONVERSION_REQUIRED:densityBasis'));
  }
});

test('explicit velocity requires ACTUAL velocity basis', () => {
  const operatingCase = {
    line: 'L-100', caseId: 'NORMAL', phase: 'LIQUID', source: 'HMB-1',
    velocity: { value: 5.5, unit: 'm/s' }, density: { value: 900, unit: 'kg/m3' },
  };
  const missing = item(dataset({ operatingCase, enrichment: basisEnrichment() }));
  assert.equal(missing.status, 'NOT_READY');
  assert(missing.engineeringBasis.missing.includes('velocityBasis'));

  const ready = item(dataset({
    operatingCase,
    enrichment: [...basisEnrichment(), row(P.VELOCITY_BASIS, 'ACTUAL', { caseId: 'NORMAL' })],
  }));
  assert.equal(ready.status, 'READY', JSON.stringify(ready));
  assert.equal(ready.request.inputs.fluidVelocity, 5.5);
});

test('component-derived multiphase requires ACTUAL gas and liquid density bases', () => {
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
  assert.equal(blocked.status, 'NOT_READY');
  assert(blocked.engineeringBasis.missing.includes('gasDensityBasis'));
  assert(blocked.engineeringBasis.missing.includes('liquidDensityBasis'));

  const ready = item(dataset({
    operatingCase,
    enrichment: [
      ...base, ...componentRows,
      row(P.GAS_DENSITY_BASIS, 'ACTUAL', { caseId: 'NORMAL' }),
      row(P.LIQUID_DENSITY_BASIS, 'ACTUAL', { caseId: 'NORMAL' }),
    ],
  }));
  assert.equal(ready.status, 'READY', JSON.stringify(ready));
});

test('scenario coherence is exact-case evidence and cannot leak across cases', () => {
  const wrongCase = basisEnrichment('DESIGN');
  const result = item(dataset({ enrichment: wrongCase }));
  assert.equal(result.status, 'NOT_READY');
  assert(result.engineeringBasis.missing.includes('operatingScenarioCoherent'));
  assert(result.engineeringBasis.missing.includes('densityBasis'));
});

test('false support or scenario confirmation remains fail-closed', () => {
  const supportFalse = basisEnrichment().map((entry) => entry.property === P.SUPPORT_EFFECTIVENESS_CONFIRMED
    ? { ...entry, value: false }
    : entry);
  assert(item(dataset({ enrichment: supportFalse })).engineeringBasis.invalid.includes('supportEffectivenessConfirmed'));

  const scenarioFalse = basisEnrichment().map((entry) => entry.property === P.OPERATING_SCENARIO_COHERENT
    ? { ...entry, value: false }
    : entry);
  assert(item(dataset({ enrichment: scenarioFalse })).engineeringBasis.invalid.includes('operatingScenarioCoherent'));
});

test('existing blocker vocabulary exposes an explicit correction path for every new M5 basis field', () => {
  for (const field of [
    'MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS', 'WALL_BASIS', 'SPAN_DETERMINATION_METHOD',
    'SUPPORT_EFFECTIVENESS_CONFIRMED', 'DENSITY_BASIS', 'VELOCITY_BASIS',
    'GAS_DENSITY_BASIS', 'LIQUID_DENSITY_BASIS', 'OPERATING_SCENARIO_COHERENT',
  ]) {
    assert(VIBRATION_FIT_DATA_BLOCKER_FIELDS[field], `missing blocker field ${field}`);
  }
});

test('controlled FIT benchmark facility path stays blocked until M5 basis is source-reconciled', () => {
  const envelope = runVibrationFacilityFitBenchmarkFromTables(
    benchmarkTableInput('EI-D4-FIT-PRODUCED-WATER-10IN'),
    { allowLimitedExchange: true },
  );
  const planItem = envelope.workflow.plan.items[0];
  assert.equal(planItem.status, 'NOT_READY');
  assert.equal(planItem.request, null);
  for (const field of [
    'wallBasis', 'maximumSpanBetweenEffectiveSupports', 'spanDeterminationMethod',
    'supportEffectivenessConfirmed', 'densityBasis', 'velocityBasis', 'operatingScenarioCoherent',
  ]) {
    assert(planItem.missing.includes(field), `expected benchmark source-basis blocker ${field}`);
  }
  assert.equal(envelope.workflow.result.rows[0].status, 'NOT_ASSESSED_DATA_INCOMPLETE');
});
