import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  calculateEngineering,
  calculateEngineeringBatch,
  createEngineeringCalculationEngine,
  createEngineeringCalculationRegistry,
  getEngineeringCalculationDefinition,
  getEngineeringCalculationQualification,
  listEngineeringCalculationFamilies,
  listEngineeringCalculations,
  resolveEngineeringCalculationInputs,
  validateEngineeringCalculationInput,
} from '../converters/engineering-calculations/index.js';
import { convertEngineeringUnit } from '../converters/engineering-calculations/units.js';

const B313_BENCHMARK_INPUT = Object.freeze({
  designPressure: 51.1,
  outsideDiameter: 273,
  allowableStress: 116.79184583043917,
  qualityFactorE: 1,
  weldStrengthReductionW: 1,
  coefficientY: 0.4,
  corrosionAllowance: 6,
  negativeMillTolerance: Object.freeze({ basis: 'percent', value: 12.5 }),
  providedNominalThickness: 12.7,
});

const empiricalInput = Object.freeze({
  target: 'BW KG',
  typeDesc: 'Flanged Gate Valve',
  ns: 10,
  rating: 900,
  approach: 'FINAL',
});

function fitGasRequest(qualificationMode = 'benchmark') {
  return {
    calculationId: 'VIB.FIV.FLOW_TURBULENCE',
    inputs: {
      phase: 'GAS',
      outsideDiameter: 168.3,
      wallThickness: 21.9456,
      insideDiameter: 124.3838,
      maximumUnsupportedSpan: 4000,
      density: 5,
      massFlow: 20000,
      gasDynamicViscosity: 0.02,
    },
    inputUnits: {
      outsideDiameter: 'mm',
      wallThickness: 'mm',
      insideDiameter: 'mm',
      maximumUnsupportedSpan: 'mm',
      density: 'kg/m3',
      massFlow: 'kg/h',
      gasDynamicViscosity: 'cP',
    },
    options: { qualificationMode, includeEvidence: true },
  };
}

function nearlyEqual(actual, expected, tolerance = 1e-12) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('registry accepts the canonical calculator grammar without obsolete definition fields', () => {
  const definition = {
    contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
    id: 'ESTIMATION.TEST.MINIMAL',
    family: 'ESTIMATION',
    name: 'Minimal canonical definition',
    methodRevision: 'test-v1',
    purpose: 'Prove the production registry no longer requires legacy definition fields.',
    authority: {
      calculationState: 'IMPLEMENTED',
      qualificationState: 'BENCHMARK_ONLY',
      codeCompliance: false,
    },
    inputs: [],
    outputs: [],
    validateInput() { return { ok: true, errors: [] }; },
    calculate() {
      return {
        outputs: { sample: 1 },
        checks: [],
        assessment: { status: 'REFERENCE_ONLY' },
        qualification: { method: 'BENCHMARK_ONLY', data: 'BENCHMARK_ONLY', designAuthority: false },
      };
    },
  };
  const registry = createEngineeringCalculationRegistry([definition]);
  const engine = createEngineeringCalculationEngine({ registry });
  assert.equal(registry.get(definition.id).domainModel, undefined);
  assert.equal(registry.get(definition.id).separationOfConcerns, undefined);
  assert.equal(registry.get(definition.id).expectedFailureModes, undefined);
  const result = engine.calculate({ calculationId: definition.id, inputs: {} });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.outputs.sample, 1);
});

test('default catalogue exposes 8 executable definitions and 18 qualification-blocked placeholders', () => {
  const all = listEngineeringCalculations();
  const available = listEngineeringCalculations({ availableOnly: true });
  assert.equal(all.length, 26);
  assert.equal(available.length, 8);
  assert.deepEqual(available.map((row) => row.id).sort(), [
    'ESTIMATION.WEIGHT.EMPIRICAL',
    'PIPE.B313.CH9.RESOLVE_BASIS',
    'PIPE.B313.CH9.STRAIGHT_PRESSURE',
    'PIPE.B313.CH9.STRAIGHT_PRESSURE_FROM_BASIS',
    'PIPE.B313.CH9.WALL_STATE',
    'PIPE.B313.MATERIAL_DESIGN',
    'PIPE.B313.THICKNESS',
    'VIB.FIV.FLOW_TURBULENCE',
  ]);
  const families = listEngineeringCalculationFamilies();
  assert.equal(families.reduce((sum, family) => sum + family.count, 0), 26);
  assert.equal(families.find((family) => family.id === 'VIB')?.count, 6);
  const externalPressure = getEngineeringCalculationDefinition('PIPE.EXTERNAL_PRESSURE.CHECK');
  assert.equal(externalPressure.authority.qualificationState, 'BLOCKED');
  assert.equal(externalPressure.qualificationIssue, 428);
  const shellIndentation = getEngineeringCalculationDefinition('PIPE.SHELL_INDENTATION');
  assert.equal(shellIndentation.id, 'PIPE.SHELL_INDENTATION');
  assert.equal(shellIndentation.authority.qualificationState, 'BLOCKED');
  assert.equal(shellIndentation.qualificationIssue, 428);
  assert(Object.isFrozen(all));
  assert(Object.isFrozen(getEngineeringCalculationDefinition('PIPE.B313.THICKNESS')));
});

test('B31.3 benchmark direct-factor path survives centralized API dispatch', () => {
  const result = calculateEngineering({
    contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
    calculationId: 'PIPE.B313.THICKNESS',
    inputs: B313_BENCHMARK_INPUT,
    inputUnits: {
      designPressure: 'barg',
      outsideDiameter: 'mm',
      allowableStress: 'MPa',
      corrosionAllowance: 'mm',
      providedNominalThickness: 'mm',
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.outputs.requiredNominalThicknessMm, 12.27709479782594);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].status, 'PASS');
  assert.equal(result.assessment.pass, true);
  assert.equal(result.qualification.method, 'IMPLEMENTED');
  assert.equal(result.qualification.designAuthority, false);
});

test('empirical documented sample remains available through the centralized API', () => {
  const result = calculateEngineering({ calculationId: 'ESTIMATION.WEIGHT.EMPIRICAL', inputs: empiricalInput });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.outputs.weightKg, 3175);
  assert.equal(result.outputs.approach, 'FINAL');
  assert.equal(result.outputs.confidence, 1);
  assert.equal(result.outputs.modelId, null);
  assert.equal(result.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(result.qualification.designAuthority, false);
});

test('qualification-gated placeholder definitions keep the frozen calculation IDs in order', () => {
  const blocked = listEngineeringCalculations().filter((row) => (
    row.authority?.qualificationState ?? row.authority?.calculationState
  ) === 'BLOCKED');
  assert.deepEqual(blocked.map((row) => row.id), [
    'EQUIP.API610.NOZZLE_LOADS',
    'EQUIP.API617.LOAD_CHECK',
    'EQUIP.NEMA_SM23.LOAD_CHECK',
    'FLANGE.GRE.CHECK',
    'FLANGE.LEAKAGE.CHECK',
    'HAZARD.BLAST.SCREENING',
    'PIPE.BRANCH.REINFORCEMENT',
    'PIPE.EXTERNAL_PRESSURE.CHECK',
    'PIPE.SHELL_INDENTATION',
    'RELIEF.GAS.REACTION_FORCE',
    'RELIEF.LIQUID.REACTION_FORCE',
    'SUPPORT.TRUNNION.LOCAL_STRESS',
    'SUPPORT.WELDED_SHOE.CHECK',
    'VIB.AIV.ACOUSTIC',
    'VIB.CAVITATION.FLASHING',
    'VIB.SBC.SMALL_BORE',
    'VIB.SLUG.TIME_HISTORY',
    'VIB.SURGE.MOMENTUM',
  ]);
});

test('non-implemented states fail closed before numerical output', () => {
  const blocked = calculateEngineering({
    calculationId: 'VIB.AIV.ACOUSTIC',
    inputs: { madeUp: 1 },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0].code, 'ENGINEERING_METHOD_BLOCKED');
  assert.equal(blocked.errors[0].details.qualificationState, 'BLOCKED');
  assert.equal(Object.hasOwn(blocked, 'outputs'), false);
});

test('central unit resolver normalizes explicit gauge pressure and geometric inputs', () => {
  assert.equal(convertEngineeringUnit(10, 'pressure', 'barg', 'MPa'), 1);
  const resolved = resolveEngineeringCalculationInputs(
    'PIPE.B313.THICKNESS',
    {
      designPressure: 10, outsideDiameter: 10, allowableStress: 20,
      qualityFactorE: 1, weldStrengthReductionW: 1, coefficientY: 0.4,
      negativeMillTolerance: { basis: 'percent', value: 12.5 },
    }, {},
    { inputUnits: { designPressure: 'barg', outsideDiameter: 'in', allowableStress: 'ksi' } },
  );
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert(Math.abs(resolved.canonicalInput.designPressure - 1) < 1e-12);
  assert(Math.abs(resolved.canonicalInput.outsideDiameter - 254) < 1e-12);
  assert(Math.abs(resolved.canonicalInput.allowableStress - 137.89514586336722) < 1e-9);
});

test('validation and resolution remain independently callable and fail closed', () => {
  const invalid = validateEngineeringCalculationInput('PIPE.B313.THICKNESS', {});
  assert.equal(invalid.ok, false);
  assert(invalid.errors.some((error) => error.code === 'INPUT_REQUIRED'));

  const resolved = resolveEngineeringCalculationInputs(
    'PIPE.B313.THICKNESS',
    {
      designPressure: 10, outsideDiameter: 10, allowableStress: 20,
      qualityFactorE: 1, weldStrengthReductionW: 1, coefficientY: 0.4,
      negativeMillTolerance: { basis: 'percent', value: 12.5 },
    }, {},
    { inputUnits: { designPressure: 'psig', outsideDiameter: 'in', allowableStress: 'ksi' } },
  );
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert(Math.abs(resolved.canonicalInput.designPressure - 0.0689475728) < 1e-12);
});

test('FIT is active only as benchmark-only workbook reference and retains issue #429', () => {
  const definition = getEngineeringCalculationDefinition('VIB.FIV.FLOW_TURBULENCE');
  const qualification = getEngineeringCalculationQualification(definition.id);
  assert.equal(definition.id, 'VIB.FIV.FLOW_TURBULENCE');
  assert.equal(definition.name, 'Flow-Induced Vibration Screening — FIT Workbook Reference');
  assert.equal(definition.shortName, 'Flow-Induced Vibration Screening');
  assert.equal(definition.methodRevision, 'ei-aviff2-fit-reference-v2');
  assert.equal(definition.authority.calculationState, 'IMPLEMENTED');
  assert.equal(definition.authority.qualificationState, 'BENCHMARK_ONLY');
  assert.equal(definition.authority.codeCompliance, false);
  assert.equal(definition.qualificationIssue, 429);
  assert.equal(qualification.qualificationIssue, 429);
  assert.equal(definition.ui.requiredQualificationMode, 'benchmark');
  assert.equal(definition.ui.productSurface, 'VIBRATION_INTEGRITY_TABLE_WORKSPACE');
  assert(definition.inputs.every((field) => field.engineeringDefault === undefined));
});

test('FIT strict and screening execution fail closed while benchmark mode reproduces retained gas reference', () => {
  for (const mode of ['strict', 'screening']) {
    const blocked = calculateEngineering(fitGasRequest(mode));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.errors[0].code, 'ENGINEERING_METHOD_NOT_QUALIFIED');
    assert.equal(blocked.qualification.effective, 'BENCHMARK_ONLY');
    assert.equal(Object.hasOwn(blocked, 'outputs'), false);
  }
  const result = calculateEngineering(fitGasRequest('benchmark'));
  assert.equal(result.ok, true, JSON.stringify(result));
  nearlyEqual(result.outputs.standardLof, 0.06111973374777248, 1e-12);
  nearlyEqual(result.outputs.standardFv, 96734.96621707715, 1e-8);
  assert.equal(result.outputs.refinedLof, null);
  assert.equal(result.outputs.referenceBand, 'LOF_LT_0_3');
  assert.equal(result.assessment.status, 'REFERENCE_BELOW_THRESHOLD');
  assert.equal(Object.hasOwn(result.assessment, 'pass'), false);
  assert.equal(result.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(result.qualification.designAuthority, false);
  assert.equal(result.provenance.engineeringAuthority, 'WORKBOOK_REFERENCE_ONLY');
  assert.equal(result.provenance.sourceWorkbook.gitBlob, 'd7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e');
});

test('FIT central Resolve normalizes native workbook units including dynamic viscosity', () => {
  const request = fitGasRequest('benchmark');
  const resolved = resolveEngineeringCalculationInputs(
    request.calculationId, request.inputs, {},
    { inputUnits: request.inputUnits, qualificationMode: 'benchmark' },
  );
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  nearlyEqual(resolved.canonicalInput.outsideDiameter, 0.1683);
  nearlyEqual(resolved.canonicalInput.wallThickness, 0.0219456);
  nearlyEqual(resolved.canonicalInput.insideDiameter, 0.1243838);
  nearlyEqual(resolved.canonicalInput.maximumUnsupportedSpan, 4);
  nearlyEqual(resolved.canonicalInput.massFlow, 20000 / 3600);
  nearlyEqual(resolved.canonicalInput.gasDynamicViscosity, 0.00002);
  assert.equal(resolved.resolvedInputs.massFlow.transformation, 'kg/h->kg/s');
  assert.equal(resolved.resolvedInputs.gasDynamicViscosity.transformation, 'cP->Pa*s');
});

test('FIT validation fails closed on missing gas viscosity and unresolved manual-diameter family', () => {
  const missingViscosity = fitGasRequest('benchmark');
  delete missingViscosity.inputs.gasDynamicViscosity;
  delete missingViscosity.inputUnits.gasDynamicViscosity;
  const missing = validateEngineeringCalculationInput(
    missingViscosity.calculationId, missingViscosity.inputs,
    { inputUnits: missingViscosity.inputUnits, qualificationMode: 'benchmark' },
  );
  assert.equal(missing.ok, false);
  assert(missing.errors.some((error) => error.field === 'gasDynamicViscosity'));

  const gap = calculateEngineering({
    calculationId: 'VIB.FIV.FLOW_TURBULENCE',
    inputs: {
      phase: 'LIQUID', outsideDiameter: 250, wallThickness: 10,
      maximumUnsupportedSpan: 20, density: 900, massFlow: 36000,
    },
    inputUnits: {
      outsideDiameter: 'mm', wallThickness: 'mm', maximumUnsupportedSpan: 'm',
      density: 'kg/m3', massFlow: 'kg/h',
    },
    options: { qualificationMode: 'benchmark' },
  });
  assert.equal(gap.ok, false);
  assert.equal(gap.errors[0].code, 'INPUT_OUTSIDE_APPLICABILITY');
});

test('other vibration mechanisms remain qualification-blocked', () => {
  const definition = getEngineeringCalculationDefinition('VIB.AIV.ACOUSTIC');
  assert.equal(definition.authority.qualificationState, 'BLOCKED');
  assert.deepEqual(definition.inputs, []);
  const result = calculateEngineering({ calculationId: definition.id, inputs: {} });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'ENGINEERING_METHOD_BLOCKED');
  assert.equal(Object.hasOwn(result, 'outputs'), false);
});

test('batch execution preserves result isolation and immutability', () => {
  const batch = calculateEngineeringBatch({
    contractVersion: 'engineering-calculation-batch/v1',
    requests: [
      { calculationId: 'PIPE.B313.THICKNESS', inputs: B313_BENCHMARK_INPUT },
      { calculationId: 'ESTIMATION.WEIGHT.EMPIRICAL', inputs: empiricalInput },
      { calculationId: 'VIB.AIV.ACOUSTIC', inputs: {} },
    ],
  });
  assert.equal(batch.ok, false);
  assert.equal(batch.total, 3);
  assert.equal(batch.succeeded, 2);
  assert.equal(batch.failed, 1);
  assert.equal(batch.results[0].ok, true);
  assert.equal(batch.results[1].ok, true);
  assert.equal(batch.results[2].errors[0].code, 'ENGINEERING_METHOD_BLOCKED');
  assert(Object.isFrozen(batch));
});

test('mixed batch preserves benchmark FIT, successful empirical, and blocked AIV results independently', () => {
  const batch = calculateEngineeringBatch({
    contractVersion: 'engineering-calculation-batch/v1',
    requests: [
      fitGasRequest('benchmark'),
      { calculationId: 'ESTIMATION.WEIGHT.EMPIRICAL', inputs: empiricalInput },
      { calculationId: 'VIB.AIV.ACOUSTIC', inputs: {} },
    ],
  });
  assert.equal(batch.ok, false);
  assert.equal(batch.total, 3);
  assert.equal(batch.succeeded, 2);
  assert.equal(batch.failed, 1);
  assert.equal(batch.results[0].qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(batch.results[1].ok, true);
  assert.equal(batch.results[2].errors[0].code, 'ENGINEERING_METHOD_BLOCKED');
  assert(Object.isFrozen(batch));
});