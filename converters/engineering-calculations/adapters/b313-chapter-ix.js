import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';
import { calculateChapterIxStraightPressure } from '../../b313-chapter-ix/straight-pipe.js';

const QUALIFICATION_REASONS = Object.freeze([
  'SOFTWARE_REGRESSION_ONLY',
  'LICENSED_B313_CHAPTER_IX_VERIFICATION_REQUIRED',
  'CALLER_SUPPLIED_ENGINEERING_VALUES',
  'NO_FATIGUE_OR_COMPONENT_QUALIFICATION',
]);

function qualification() {
  return composeEngineeringQualification({
    method: 'BENCHMARK_ONLY',
    data: 'BENCHMARK_ONLY',
    designAuthority: false,
    reasons: QUALIFICATION_REASONS,
  });
}

function blockedByMode(mode) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      'ENGINEERING_METHOD_NOT_QUALIFIED',
      'Chapter IX straight-pipe execution requires explicit qualificationMode=benchmark until licensed Code verification is complete.',
      { allowedQualificationModes: ['benchmark'], received: mode ?? null },
    )],
    qualification: qualification(),
    provenance: { engineeringAuthority: 'SOFTWARE_REGRESSION_ONLY' },
  };
}

function domainInput(input) {
  return {
    outsideDiameterMm: input.outsideDiameter,
    designPressureMpa: input.designPressure,
    allowableStressMpa: input.allowableStress,
    internalAllowanceMm: input.internalAllowance,
    externalAllowanceMm: input.externalAllowance,
    minusTolerancePct: input.minusTolerancePct,
    ...(input.providedNominalThickness !== undefined
      ? { providedNominalThicknessMm: input.providedNominalThickness }
      : {}),
  };
}

function domainFailure(result) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      result.code || 'CALCULATION_FAILED',
      result.message || 'Chapter IX straight-pipe calculation failed.',
      { domainDetails: result.details ?? {} },
      result.details?.field ?? null,
    )],
    qualification: qualification(),
    provenance: { engineeringAuthority: 'SOFTWARE_REGRESSION_ONLY' },
    evidence: { domainResult: result },
  };
}

function outputs(result) {
  return {
    pressureDesignThicknessMm: result.pressureDesignThicknessMm,
    requiredMinimumThicknessMm: result.requiredMinimumThicknessMm,
    requiredNominalThicknessMm: result.requiredNominalThicknessMm,
    ...(result.minimumAsManufacturedThicknessMm !== undefined ? {
      minimumAsManufacturedThicknessMm: result.minimumAsManufacturedThicknessMm,
      effectiveNetWallMm: result.effectiveNetWallMm,
      pressureRatingMpa: result.pressureRatingMpa,
      pressureRatingMargin: result.pressureRatingMargin,
      minimumWallMarginMm: result.minimumWallMarginMm,
      staticPass: result.staticPass,
    } : {}),
  };
}

function checks(result) {
  if (result.minimumAsManufacturedThicknessMm === undefined) return [];
  return [
    {
      id: 'B313.CH9.MINIMUM_WALL',
      label: 'Minimum manufactured wall vs required minimum wall',
      actual: result.minimumAsManufacturedThicknessMm,
      allowable: result.requiredMinimumThicknessMm,
      comparator: '>=',
      status: result.minimumAsManufacturedThicknessMm >= result.requiredMinimumThicknessMm ? 'PASS' : 'FAIL',
      authority: 'SOFTWARE_REGRESSION_ONLY',
    },
    {
      id: 'B313.CH9.PRESSURE_RATING',
      label: 'Calculated pressure rating vs design pressure',
      actual: result.pressureRatingMpa,
      allowable: null,
      comparator: '>= design pressure',
      utilization: 1 / result.pressureRatingMargin,
      status: result.pressureRatingMargin >= 1 ? 'PASS' : 'FAIL',
      authority: 'SOFTWARE_REGRESSION_ONLY',
    },
  ];
}

function calculate(input, runtime = {}) {
  const mode = runtime.options?.qualificationMode;
  if (mode !== 'benchmark') return blockedByMode(mode);
  const result = calculateChapterIxStraightPressure(domainInput(input));
  if (!result.ok) return domainFailure(result);
  return {
    ok: true,
    outputs: outputs(result),
    intermediates: {
      toleranceFactor: result.toleranceFactor,
      formulation: result.formulation,
    },
    checks: checks(result),
    assessment: result.staticPass === undefined ? null : {
      status: result.staticPass ? 'REFERENCE_PASS' : 'REFERENCE_FAIL',
      pass: result.staticPass,
      authority: 'SOFTWARE_REGRESSION_ONLY',
    },
    qualification: qualification(),
    warnings: [{
      code: 'BENCHMARK_REFERENCE_ONLY',
      message: 'Result reproduces the merged Chapter IX straight-pipe software formulation only; licensed Code verification and governed master resolution remain required for design authority.',
    }],
    applicability: {
      applicable: true,
      limitations: [
        'Uniform straight pipe under internal pressure only.',
        'No routed-system, thermal/displacement, KD fatigue, component, FEA, or HCF qualification.',
      ],
    },
    provenance: {
      domainApi: 'calculateChapterIxStraightPressure',
      regressionBasis: 'engineering/hp-class-standardization/app.js merged formulation',
      engineeringAuthority: 'SOFTWARE_REGRESSION_ONLY',
      codeCompliance: false,
    },
    evidence: { domainResult: result },
  };
}

export const B313_CHAPTER_IX_ENGINEERING_CALCULATION_DEFINITION = Object.freeze({
  contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
  id: 'PIPE.B313.CH9.STRAIGHT_PRESSURE',
  family: 'PIPE',
  name: 'ASME B31.3 Chapter IX Straight-Pipe Pressure — Software Regression',
  shortName: 'B31.3 Ch IX Straight Pressure',
  methodRevision: 'merged-hp-static-regression-v1',
  purpose: 'Expose the merged bounded Chapter IX straight-pipe pressure/static formulation through the central calculation API without promoting Code or design authority.',
  authority: {
    calculationState: 'IMPLEMENTED',
    qualificationState: 'BENCHMARK_ONLY',
    codeCompliance: false,
  },
  applicability: {
    description: 'Uniform straight pipe, internal pressure, caller-supplied engineering values.',
    limitations: [
      'Licensed B31.3 Chapter IX verification is required before design authority.',
      'No fatigue, component, routed-system, FEA, or vibration qualification.',
    ],
  },
  ui: {
    requiredQualificationMode: 'benchmark',
    productSurface: 'ENGINEERING_CALCULATIONS',
  },
  inputs: [
    { key: 'outsideDiameter', label: 'Design outside diameter D', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
    { key: 'designPressure', label: 'Design pressure P', type: 'number', required: true, quantity: 'pressure', canonicalUnit: 'MPa', pressureReference: 'gauge', minExclusive: 0 },
    { key: 'allowableStress', label: 'Allowable stress S', type: 'number', required: true, quantity: 'stress', canonicalUnit: 'MPa', minExclusive: 0 },
    { key: 'internalAllowance', label: 'Internal allowance ci', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', min: 0 },
    { key: 'externalAllowance', label: 'External allowance co', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', min: 0 },
    { key: 'minusTolerancePct', label: 'Minus manufacturing tolerance', type: 'number', required: true, quantity: 'dimensionless', canonicalUnit: null, min: 0 },
    { key: 'providedNominalThickness', label: 'Provided nominal wall', type: 'number', quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
  ],
  outputs: [
    { key: 'pressureDesignThicknessMm', label: 'Pressure-design thickness', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'requiredMinimumThicknessMm', label: 'Required minimum thickness', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'requiredNominalThicknessMm', label: 'Required nominal thickness', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'pressureRatingMpa', label: 'Calculated pressure rating', type: 'number', quantity: 'pressure', canonicalUnit: 'MPa' },
  ],
  calculate,
});
