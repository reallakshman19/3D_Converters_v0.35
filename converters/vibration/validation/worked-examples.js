import { calculateFit as productionCalculateFit } from '../fit/calculate.js';
import { calculateMechanicalExcitation } from '../mechanical/method.js';
import { calculateDeadlegStandard } from '../deadleg/method.js';
import { calculateDryGasRapidOpening } from '../transients/dry-gas-opening.js';

export const VIBRATION_WORKED_EXAMPLE_VALIDATION_SCHEMA = 'VibrationWorkedExampleValidationRecord.v1';

function numericStep(id, expected, actual, relativeTolerance = 0.015, mode = 'CALCULATION_PARITY') {
  const scale = Math.max(Math.abs(expected), Number.EPSILON);
  const relativeError = Math.abs(actual - expected) / scale;
  return Object.freeze({
    id, mode, expected, actual, relativeTolerance, relativeError,
    status: Number.isFinite(actual) && relativeError <= relativeTolerance ? 'PASS' : 'FAIL',
  });
}

function exactStep(id, expected, actual, mode = 'CALCULATION_PARITY') {
  return Object.freeze({ id, mode, expected, actual, status: Object.is(expected, actual) ? 'PASS' : 'FAIL' });
}

function sourceStep(id, expected, note) {
  return Object.freeze({ id, mode: 'SOURCE_REPLAY', expected, actual: null, status: 'NOT_RUN', note });
}

function statusFromSteps(steps, fallback = 'PASS') {
  if (steps.some((step) => step.status === 'FAIL')) return 'FAIL';
  if (steps.some((step) => step.status === 'REVIEW_REQUIRED')) return 'REVIEW_REQUIRED';
  if (steps.some((step) => step.status === 'BLOCKED')) return 'BLOCKED';
  if (steps.some((step) => step.status === 'NOT_RUN')) return 'PARTIAL';
  return fallback;
}

function result(caseData, steps, status = statusFromSteps(steps), details = {}) {
  return Object.freeze({
    caseId: caseData.id,
    mechanism: caseData.mechanism,
    validationMode: caseData.mode,
    sourceLocation: caseData.sourceLocation ?? null,
    status,
    steps: Object.freeze(steps),
    ...details,
  });
}

function validateFit(caseData, calculateFit) {
  const calculated = calculateFit(caseData.input);
  if (!calculated?.ok) {
    return result(caseData, [Object.freeze({
      id: 'FIT_EXECUTION', mode: 'CALCULATION_PARITY', expected: 'ok=true', actual: calculated?.ok ?? null,
      status: 'FAIL', errors: calculated?.errors ?? null,
    })]);
  }
  const p = caseData.published;
  const steps = [
    numericStep('rhoV2', p.rhoV2, calculated.excitation.rhoV2),
    numericStep('fluidViscosityFactor', p.fluidViscosityFactor, calculated.standard.fluidViscosityFactor),
    exactStep('supportStiffness', p.supportStiffness, calculated.support.stiffness),
    numericStep('standardFv', p.standardFv, calculated.standard.correlation.fv),
    numericStep('standardLof', p.standardLof, calculated.standard.lof),
  ];
  return result(caseData, steps, undefined, { methodId: 'VIB.FIV.FLOW_TURBULENCE' });
}

function validateMechanical(caseData) {
  const calculated = calculateMechanicalExcitation(caseData.input);
  const steps = calculated.items.map((item, index) => exactStep(
    `source.${index}.lof`, caseData.published.sourceLofs[index], item.lof,
  ));
  steps.push(exactStep('governingLof', caseData.published.governingLof, calculated.governingLof));
  return result(caseData, steps, undefined, { methodId: calculated.methodId });
}

function validateDeadleg(caseData) {
  const calculated = calculateDeadlegStandard(caseData.input);
  const p = caseData.published;
  const steps = [
    numericStep('excitationFrequencyHz', p.excitationFrequencyHz, calculated.excitationFrequencyHz, 0.015),
    numericStep('acousticNaturalFrequencyHz', p.acousticNaturalFrequencyHz, calculated.acousticNaturalFrequencyHz, 0.01),
    numericStep('frequencyRatio', p.frequencyRatio, calculated.frequencyRatio, 0.02),
    exactStep('standardLof', p.lof, calculated.lof),
  ];
  if (p.advancedNonResonantLof !== undefined) {
    steps.push(sourceStep('advancedNonResonantLof', p.advancedNonResonantLof,
      'Advanced deadleg method is not implemented/qualified by the simplified T2.6 calculator.'));
    steps.push(sourceStep('advancedResonantLof', p.advancedResonantLof,
      'Advanced deadleg method is retained source evidence only.'));
  }
  return result(caseData, steps, undefined, { methodId: calculated.methodId });
}

function validateExternalAiv(caseData) {
  const steps = [];
  const p = caseData.published;
  const external = caseData.external;
  if (p.effectivePwlDb !== undefined) {
    steps.push(numericStep('effectivePwlDb', p.effectivePwlDb, external.observedEffectivePwlDb, 0.001, 'EXTERNAL_ACTIVE_PR'));
  }
  if (p.rawPwlDb !== undefined) {
    steps.push(numericStep('rawPwlDb', p.rawPwlDb, external.observedRawPwlDb, 0.001, 'EXTERNAL_ACTIVE_PR'));
  }
  steps.push(exactStep('externalValidationReceipt', 'PASS', external.validationReceiptStatus, 'EXTERNAL_ACTIVE_PR'));
  const expectedLof = p.lof ?? p.lineCaseLof;
  if (external.observedLineCaseLof !== undefined) {
    steps.push(numericStep('lof', expectedLof, external.observedLineCaseLof, 0.001, 'EXTERNAL_ACTIVE_PR'));
  } else {
    steps.push(sourceStep('lof', expectedLof,
      `AIV LOF product-path evidence for this exact line/case is not present in the pinned #${external.pr} receipt.`));
  }
  return result(caseData, steps, undefined, {
    externalPr: external.pr,
    externalHead: external.head,
    validatedCodeCommit: external.validatedCodeCommit ?? null,
    validationRecordBlob: external.validationRecordBlob ?? null,
  });
}

function validateDryGasTransient(caseData) {
  const calculated = calculateDryGasRapidOpening(caseData.input);
  const p = caseData.published;
  return result(caseData, [
    numericStep('peakForceKn', p.peakForceKn, calculated.peakForceKn, 0.005),
    numericStep('limitForceKn', p.limitForceKn, calculated.limitForceKn, 0.01),
    numericStep('lof', p.lof, calculated.lof, 0.01),
  ], undefined, { methodId: calculated.methodId });
}

function validateLiquidClosureDiscrepancy(caseData) {
  const i = caseData.input;
  const p = caseData.publishedPdf;
  const c = 1 / Math.sqrt(i.densityKgM3 * (1 / i.bulkModulusPa
    + (i.outsideDiameterMm / i.wallThicknessMm) / i.youngsModulusPa));
  const pmax = i.densityKgM3 * c * i.velocityMS;
  const initialForce = pmax * Math.PI * i.insideDiameterMm ** 2 / 4e9;
  const phi = -2.266 / i.closureTimeS - 0.32;
  const omega = i.densityKgM3 * i.velocityMS * i.upstreamLengthM * phi / i.upstreamPressurePa;
  const correctedForce = p.closureAdjustedSurgePa * Math.PI * i.insideDiameterMm ** 2 / 4e9;
  const dryGasCompatibleLimit = calculateDryGasRapidOpening({
    massFlowKgS: 1,
    gamma: 1.4,
    upstreamTemperatureK: 300,
    molecularWeightKgPerKmol: 28,
    outsideDiameterMm: i.outsideDiameterMm,
    insideDiameterMm: i.insideDiameterMm,
    wallThicknessMm: i.wallThicknessMm,
    schedule40ThicknessMm: i.schedule40ThicknessMm,
    supportStiffness: i.supportStiffness,
  }).limitForceKn;
  const steps = [
    numericStep('speedOfSoundMS', p.speedOfSoundMS, c, 0.005, 'STEP_ARITHMETIC_PARITY'),
    numericStep('initialPressureSurgePa', p.initialPressureSurgePa, pmax, 0.005, 'STEP_ARITHMETIC_PARITY'),
    numericStep('initialForceKn', p.initialForceKn, initialForce, 0.005, 'STEP_ARITHMETIC_PARITY'),
    numericStep('phi', p.phi, phi, 0.0005, 'STEP_ARITHMETIC_PARITY'),
    numericStep('omega', p.omega, omega, 0.01, 'STEP_ARITHMETIC_PARITY'),
    sourceStep('closureAdjustedSurgePa', p.closureAdjustedSurgePa,
      'Full liquid-closure Psurge equation is not promoted to production until transcription is unambiguous.'),
    numericStep('closureAdjustedForceKn', p.closureAdjustedForceKn, correctedForce, 0.01, 'STEP_ARITHMETIC_PARITY'),
    numericStep('limitForceKn', p.limitForceKn, dryGasCompatibleLimit, 0.01, 'STEP_ARITHMETIC_PARITY'),
    Object.freeze({
      id: 'sourceLofDiscrepancy', mode: 'SOURCE_RECONCILIATION', expected: p.lof,
      actual: caseData.retainedDocx.lof, status: 'REVIEW_REQUIRED',
      note: 'Governing EI D.4.2 publishes 0.70; retained DOCX line listing records 0.06.',
    }),
  ];
  return result(caseData, steps, 'REVIEW_REQUIRED');
}

function validateThermowell(caseData) {
  const i = caseData.input;
  const p = caseData.published;
  const reynolds = i.densityKgM3 * i.velocityMS * i.characteristicDiameterM / i.dynamicViscosityPaS;
  const vortexFrequencyHz = i.strouhal * i.velocityMS / i.characteristicDiameterM;
  const steps = [
    numericStep('reynolds', p.reynolds, reynolds, 0.001, 'STEP_ARITHMETIC_PARITY'),
    numericStep('vortexFrequencyHz', p.vortexFrequencyHz, vortexFrequencyHz, 0.002, 'STEP_ARITHMETIC_PARITY'),
    sourceStep('inSituResonantFrequencyHz', p.inSituResonantFrequencyHz,
      'Retained ASME PTC 19.3 TW-2016 structural-frequency method is not implemented in this PR.'),
    sourceStep('lof', p.lof, 'Retained thermowell LOF/PASS is source evidence, not calculator qualification.'),
  ];
  return result(caseData, steps);
}

function validateSbc(caseData) {
  const i = caseData.input;
  const p = caseData.published;
  const geometryLof = i.geometryScores.reduce((sum, value) => sum + value, 0) / i.geometryScores.length;
  const modifier = Math.min(geometryLof, i.locationLof);
  const lof = Math.min(i.mainlineLof * i.mainlineMultiplier, modifier);
  return result(caseData, [
    numericStep('geometryLof', p.geometryLof, geometryLof, 1e-12, 'STEP_ARITHMETIC_PARITY'),
    numericStep('sbcModifier', p.sbcModifier, modifier, 1e-12, 'STEP_ARITHMETIC_PARITY'),
    numericStep('lof', p.lof, lof, 1e-12, 'STEP_ARITHMETIC_PARITY'),
    sourceStep('geometryScoreSelection', i.geometryScores,
      'Individual fitting/length/valve/schedule/diameter score selection is retained source evidence; full TM-03 scoring tables are not implemented here.'),
  ]);
}

function validateDeferred(caseData) {
  return result(caseData, [Object.freeze({
    id: 'retainedExampleCoverage', mode: 'NO_RETAINED_EXAMPLE', expected: 'POPULATED_CONTROLLED_EXAMPLE',
    actual: null, status: 'BLOCKED', note: 'Empty retained headings are not qualification evidence.',
  })], 'DEFERRED');
}

export function validateVibrationWorkedExampleCase(caseData, dependencies = {}) {
  const calculateFit = dependencies.calculateFit ?? productionCalculateFit;
  switch (caseData.mode) {
    case 'FIT_CALCULATION_PARITY': return validateFit(caseData, calculateFit);
    case 'MECHANICAL_T23_CALCULATION_PARITY': return validateMechanical(caseData);
    case 'DEADLEG_T26_CALCULATION_PARITY': return validateDeadleg(caseData);
    case 'EXTERNAL_ACTIVE_PR': return validateExternalAiv(caseData);
    case 'DRY_GAS_T28_CALCULATION_PARITY': return validateDryGasTransient(caseData);
    case 'LIQUID_CLOSURE_SOURCE_DISCREPANCY': return validateLiquidClosureDiscrepancy(caseData);
    case 'THERMOWELL_STEP_ARITHMETIC': return validateThermowell(caseData);
    case 'SBC_D5_STEP_ARITHMETIC': return validateSbc(caseData);
    case 'NO_RETAINED_EXAMPLE': return validateDeferred(caseData);
    default: throw new RangeError(`Unsupported worked-example validation mode: ${caseData.mode}.`);
  }
}

export function buildVibrationWorkedExampleValidationRecord(catalogue, dependencies = {}) {
  if (!catalogue?.benchmarkSetId || !Array.isArray(catalogue.cases)) {
    throw new TypeError('Worked-example catalogue must define benchmarkSetId and cases.');
  }
  const cases = catalogue.cases.map((caseData) => validateVibrationWorkedExampleCase(caseData, dependencies));
  const statusCounts = cases.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
  return Object.freeze({
    schema: VIBRATION_WORKED_EXAMPLE_VALIDATION_SCHEMA,
    benchmarkSetId: catalogue.benchmarkSetId,
    source: catalogue.source,
    authority: Object.freeze({
      engineeringAuthority: 'NONE', screeningAuthority: 'NOT_AUTHORIZED', designAuthority: false,
    }),
    summary: Object.freeze({ totalCases: cases.length, statusCounts: Object.freeze(statusCounts) }),
    cases: Object.freeze(cases),
  });
}
