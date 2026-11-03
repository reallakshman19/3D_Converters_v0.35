import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  VIBRATION_FACILITY_FIT_CALCULATION_ID,
  VIBRATION_FACILITY_FIT_PLAN_SCHEMA,
  buildVibrationFacilityFitPlan,
} from '../converters/vibration/facility/index.js';
import { VIBRATION_INTEGRITY_DATASET_SCHEMA } from '../converters/vibration/dataset/schema.js';

const P = FIT_FACILITY_ENRICHMENT_PROPERTIES;

function basisRows(canonicalId, span, caseIds, velocityCases = []) {
  return [
    { canonicalId, property: P.WALL_BASIS, value: 'NOMINAL', source: 'M5-MIGRATION' },
    { canonicalId, property: P.MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS, value: span, unit: 'm', source: 'FIELD-VERIFY' },
    { canonicalId, property: P.SPAN_DETERMINATION_METHOD, value: 'FIELD_VERIFIED_EFFECTIVE_SUPPORTS', source: 'FIELD-VERIFY' },
    { canonicalId, property: P.SUPPORT_EFFECTIVENESS_CONFIRMED, value: true, source: 'FIELD-VERIFY' },
    ...caseIds.flatMap((caseId) => [
      { canonicalId, caseId, property: P.DENSITY_BASIS, value: 'ACTUAL', source: 'HMB-BASIS' },
      { canonicalId, caseId, property: P.OPERATING_SCENARIO_COHERENT, value: true, source: 'HMB-BASIS' },
      ...(velocityCases.includes(caseId) ? [
        { canonicalId, caseId, property: P.VELOCITY_BASIS, value: 'ACTUAL', source: 'HMB-BASIS' },
      ] : []),
    ]),
  ];
}

function dataset(overrides = {}) {
  return {
    schema: VIBRATION_INTEGRITY_DATASET_SCHEMA,
    authority: 'DATA_ASSEMBLY_ONLY',
    engineeringAuthority: 'NONE',
    screeningAuthorized: false,
    exchangeIntegrityStatus: overrides.exchangeIntegrityStatus ?? 'DECLARED_NOT_REVERIFIED',
    lines: overrides.lines ?? [
      { line: 'L-100', elementCanonicalIds: ['CANON-001', 'CANON-002'] },
      { line: 'L-200', elementCanonicalIds: ['CANON-003'] },
      { line: 'L-300', elementCanonicalIds: ['CANON-005'] },
    ],
    unassignedElementCanonicalIds: overrides.unassignedElementCanonicalIds ?? ['CANON-004'],
    operatingCases: overrides.operatingCases ?? [
      {
        line: 'L-100', caseId: 'NORMAL', phase: 'GAS', source: 'HMB-100',
        massFlow: { value: 20000, unit: 'kg/h' },
        velocity: { value: 35, unit: 'm/s' },
        density: { value: 8.1, unit: 'kg/m3' },
        dynamicViscosity: { value: 0.019, unit: 'cP' },
      },
      {
        line: 'L-100', caseId: 'DESIGN', phase: 'GAS', source: 'HMB-100',
        massFlow: { value: 25000, unit: 'kg/h' },
        density: { value: 7.4, unit: 'kg/m3' },
        dynamicViscosity: { value: 0.02, unit: 'cP' },
      },
      {
        line: 'L-200', caseId: 'NORMAL', phase: 'LIQUID', source: 'HMB-200',
        massFlow: { value: 110, unit: 'kg/s' },
        density: { value: 980, unit: 'kg/m3' },
      },
      {
        line: 'L-300', caseId: 'NORMAL', phase: 'MULTIPHASE', source: 'HMB-300',
        massFlow: { value: 240, unit: 'kg/s' },
        density: { value: 136, unit: 'kg/m3' },
        velocity: { value: 9.3, unit: 'm/s' },
      },
    ],
    enrichment: overrides.enrichment ?? [
      { canonicalId: 'CANON-001', property: P.ASSESSMENT_POINT, value: true, source: 'VIB-REVIEW' },
      { canonicalId: 'CANON-001', property: P.OUTSIDE_DIAMETER, value: 168.3, unit: 'mm', source: 'PIPE-DATA' },
      { canonicalId: 'CANON-001', property: P.WALL_THICKNESS, value: 7.11, unit: 'mm', source: 'PIPE-DATA' },
      { canonicalId: 'CANON-001', property: P.INSIDE_DIAMETER, value: 154.1, unit: 'mm', source: 'PIPE-DATA' },
      { canonicalId: 'CANON-001', property: P.MAX_UNSUPPORTED_SPAN, value: 6.4, unit: 'm', source: 'LEGACY-SPAN' },
      ...basisRows('CANON-001', 6.4, ['NORMAL', 'DESIGN'], ['NORMAL']),
      { canonicalId: 'CANON-001', property: P.NATURAL_FREQUENCY, value: 2.5, unit: 'Hz', source: 'MODAL-BASE' },
      { canonicalId: 'CANON-001', caseId: 'DESIGN', property: P.NATURAL_FREQUENCY, value: 2.2, unit: 'Hz', source: 'MODAL-DESIGN' },

      { canonicalId: 'CANON-002', property: P.OUTSIDE_DIAMETER, value: 168.3, unit: 'mm', source: 'PIPE-DATA' },

      { canonicalId: 'CANON-003', property: P.ASSESSMENT_POINT, value: true, source: 'VIB-REVIEW' },
      { canonicalId: 'CANON-003', property: P.OUTSIDE_DIAMETER, value: 273, unit: 'mm', source: 'PIPE-DATA' },
      { canonicalId: 'CANON-003', property: P.WALL_THICKNESS, value: 9.271, unit: 'mm', source: 'PIPE-DATA' },
      { canonicalId: 'CANON-003', property: P.MAX_UNSUPPORTED_SPAN, value: 18, unit: 'm', source: 'LEGACY-SPAN' },
      ...basisRows('CANON-003', 18, ['NORMAL']),

      { canonicalId: 'CANON-005', property: P.ASSESSMENT_POINT, value: true, source: 'VIB-REVIEW' },
      { canonicalId: 'CANON-005', property: P.OUTSIDE_DIAMETER, value: 508, unit: 'mm', source: 'PIPE-DATA' },
      { canonicalId: 'CANON-005', property: P.WALL_THICKNESS, value: 9.525, unit: 'mm', source: 'PIPE-DATA' },
      { canonicalId: 'CANON-005', property: P.MAX_UNSUPPORTED_SPAN, value: 5, unit: 'm', source: 'LEGACY-SPAN' },
      ...basisRows('CANON-005', 5, ['NORMAL'], ['NORMAL']),
    ],
  };
}

function item(plan, canonicalId, caseId) {
  return plan.items.find((row) => row.canonicalId === canonicalId && row.caseId === caseId);
}

test('planner creates benchmark central requests only for explicitly marked assessment points', () => {
  const plan = buildVibrationFacilityFitPlan(dataset());
  assert.equal(plan.schema, VIBRATION_FACILITY_FIT_PLAN_SCHEMA);
  assert.equal(plan.calculationId, VIBRATION_FACILITY_FIT_CALCULATION_ID);
  assert.equal(plan.authority, 'REQUEST_PLANNING_ONLY');
  assert.equal(plan.engineeringAuthority, 'NONE');
  assert.equal(plan.screeningAuthorized, false);
  assert.equal(plan.qualificationMode, 'benchmark');
  assert.equal(plan.counts.assessmentPoints, 3);
  assert.equal(plan.counts.items, 4);
  assert.equal(plan.items.some((row) => row.canonicalId === 'CANON-002'), false);
  assert(Object.isFrozen(plan));
});

test('gas request preserves units and makes velocity override selection explicit', () => {
  const normal = item(buildVibrationFacilityFitPlan(dataset()), 'CANON-001', 'NORMAL');
  assert.equal(normal.status, 'READY', JSON.stringify(normal));
  assert.equal(normal.request.calculationId, VIBRATION_FACILITY_FIT_CALCULATION_ID);
  assert.equal(normal.request.options.qualificationMode, 'benchmark');
  assert.equal(normal.request.inputs.phase, 'GAS');
  assert.equal(normal.request.inputs.outsideDiameter, 168.3);
  assert.equal(normal.request.inputUnits.outsideDiameter, 'mm');
  assert.equal(normal.request.inputs.fluidVelocity, 35);
  assert.equal(normal.request.inputUnits.fluidVelocity, 'm/s');
  assert.equal(Object.hasOwn(normal.request.inputs, 'massFlow'), false);
  assert.equal(normal.request.inputs.gasDynamicViscosity, 0.019);
  assert.equal(normal.request.inputUnits.gasDynamicViscosity, 'cP');
  assert.equal(normal.sourceTrace.operatingCase.flowSelection, 'VELOCITY_OVERRIDE');
  assert.equal(normal.sourceTrace.operatingCase.alternateMassFlowPresent, true);
  assert.equal(normal.engineeringBasis.process.velocityBasis, 'ACTUAL');
});

test('mass-flow gas request and case-specific natural frequency preserve source selection', () => {
  const design = item(buildVibrationFacilityFitPlan(dataset()), 'CANON-001', 'DESIGN');
  assert.equal(design.status, 'READY', JSON.stringify(design));
  assert.equal(design.request.inputs.massFlow, 25000);
  assert.equal(design.request.inputUnits.massFlow, 'kg/h');
  assert.equal(Object.hasOwn(design.request.inputs, 'fluidVelocity'), false);
  assert.equal(design.sourceTrace.operatingCase.flowSelection, 'MASS_FLOW');
  assert.equal(design.request.inputs.naturalFrequency, 2.2);
  assert.equal(design.request.inputUnits.naturalFrequency, 'Hz');
  assert.equal(design.sourceTrace.geometry.naturalFrequency.selection, 'CASE_SPECIFIC');
  assert.equal(design.sourceTrace.geometry.naturalFrequency.source, 'MODAL-DESIGN');
});

test('liquid and aggregate multiphase requests use explicit process shape without hidden component data', () => {
  const plan = buildVibrationFacilityFitPlan(dataset());
  const liquid = item(plan, 'CANON-003', 'NORMAL');
  assert.equal(liquid.status, 'READY', JSON.stringify(liquid));
  assert.equal(liquid.request.inputs.phase, 'LIQUID');
  assert.equal(liquid.request.inputs.massFlow, 110);
  assert.equal(liquid.request.inputUnits.massFlow, 'kg/s');
  assert.equal(Object.hasOwn(liquid.request.inputs, 'gasDynamicViscosity'), false);

  const multiphase = item(plan, 'CANON-005', 'NORMAL');
  assert.equal(multiphase.status, 'READY', JSON.stringify(multiphase));
  assert.equal(multiphase.request.inputs.phase, 'MULTIPHASE');
  assert.equal(multiphase.request.inputs.multiphaseResolutionMode, 'AGGREGATE_EFFECTIVE');
  assert.equal(multiphase.request.inputs.fluidVelocity, 9.3);
  assert.equal(Object.hasOwn(multiphase.request.inputs, 'gasMassFlow'), false);
  assert.equal(Object.hasOwn(multiphase.request.inputs, 'liquidMassFlow'), false);
});

test('missing effective-support span or gas viscosity yields NOT_READY with no request object', () => {
  const base = dataset();
  const withoutSpan = {
    ...base,
    enrichment: base.enrichment.filter((row) => !(
      row.canonicalId === 'CANON-001'
      && row.property === P.MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS
    )),
  };
  const spanItem = item(buildVibrationFacilityFitPlan(withoutSpan), 'CANON-001', 'NORMAL');
  assert.equal(spanItem.status, 'NOT_READY');
  assert.equal(spanItem.request, null);
  assert(spanItem.missing.includes('maximumSpanBetweenEffectiveSupports'));

  const withoutViscosity = {
    ...base,
    operatingCases: base.operatingCases.map((row) => row.line === 'L-100'
      ? { ...row, dynamicViscosity: undefined }
      : row),
  };
  const gasItem = item(buildVibrationFacilityFitPlan(withoutViscosity), 'CANON-001', 'NORMAL');
  assert.equal(gasItem.status, 'NOT_READY');
  assert.equal(gasItem.request, null);
  assert(gasItem.missing.includes('dynamicViscosity'));
});

test('invalid enrichment quantity evidence is fail-closed rather than ignored', () => {
  const base = dataset();
  const invalid = {
    ...base,
    enrichment: base.enrichment.map((row) => row.canonicalId === 'CANON-003'
      && row.property === P.WALL_THICKNESS
      ? { ...row, unit: undefined }
      : row),
  };
  const result = item(buildVibrationFacilityFitPlan(invalid), 'CANON-003', 'NORMAL');
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.request, null);
  assert(result.invalid.includes('wallThickness'));
});

test('assessment point without line or operating cases remains visible as NOT_READY', () => {
  const base = dataset();
  const enriched = {
    ...base,
    enrichment: [
      ...base.enrichment,
      { canonicalId: 'CANON-004', property: P.ASSESSMENT_POINT, value: true, source: 'VIB-REVIEW' },
    ],
  };
  const plan = buildVibrationFacilityFitPlan(enriched);
  const row = item(plan, 'CANON-004', null);
  assert(row);
  assert.equal(row.status, 'NOT_READY');
  assert.equal(row.request, null);
  assert.deepEqual(row.missing, ['line', 'operatingCase']);
  assert(row.reasons.includes('ASSESSMENT_POINT_HAS_NO_LINE'));
});

test('no assessment point produces an empty plan with explicit warning', () => {
  const base = dataset();
  const noPoints = {
    ...base,
    enrichment: base.enrichment.filter((row) => row.property !== P.ASSESSMENT_POINT),
  };
  const plan = buildVibrationFacilityFitPlan(noPoints);
  assert.equal(plan.counts.assessmentPoints, 0);
  assert.equal(plan.items.length, 0);
  assert(plan.warnings.some((warning) => warning.code === 'NO_FIT_ASSESSMENT_POINTS'));
});

test('planner does not derive OD or wall thickness from upstream DN/schedule', () => {
  const base = dataset();
  const missingGeometry = {
    ...base,
    enrichment: base.enrichment.filter((row) => row.canonicalId !== 'CANON-003'
      || ![P.OUTSIDE_DIAMETER, P.WALL_THICKNESS].includes(row.property)),
  };
  const result = item(buildVibrationFacilityFitPlan(missingGeometry), 'CANON-003', 'NORMAL');
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.request, null);
  assert(result.missing.includes('outsideDiameter'));
  assert(result.missing.includes('wallThickness'));
});

test('limited-exchange provenance remains visible and never changes planner authority', () => {
  const plan = buildVibrationFacilityFitPlan(dataset({ exchangeIntegrityStatus: 'LIMITED_ELEMENTS_ONLY' }));
  assert(plan.warnings.some((warning) => warning.code === 'LIMITED_EXCHANGE_INPUT'));
  assert.equal(plan.screeningAuthorized, false);
  assert.equal(plan.engineeringAuthority, 'NONE');
});
