import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';
import { calculateChapterIxWallState } from '../../b313-chapter-ix/wall-state.js';

const QUALIFICATION_REASONS = Object.freeze([
  'WALL_STATE_INPUT_CUSTODY_ONLY',
  'CALLER_SUPPLIED_TOLERANCE_AND_ALLOWANCES',
  'GOVERNED_PRODUCT_AND_CORROSION_MASTERS_REQUIRED_FOR_DESIGN_AUTHORITY',
  'NO_CODE_ACCEPTANCE_OR_FATIGUE_QUALIFICATION',
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
      'Chapter IX wall-state execution requires explicit qualificationMode=benchmark until governed product/tolerance/corrosion masters are qualified.',
      { allowedQualificationModes: ['benchmark'], received: mode ?? null },
    )],
    qualification: qualification(),
    provenance: { engineeringAuthority: 'INPUT_CUSTODY_ONLY' },
  };
}

function domainInput(input) {
  return {
    nominalWallMm: input.nominalWall,
    minusTolerancePct: input.minusTolerancePct,
    internalServiceAllowanceMm: input.internalServiceAllowance,
    externalServiceAllowanceMm: input.externalServiceAllowance,
    ...(input.measuredCurrentWall !== undefined ? {
      measuredCurrentWallMm: input.measuredCurrentWall,
    } : {}),
    ...(input.futureInternalLoss !== undefined ? {
      futureInternalLossMm: input.futureInternalLoss,
    } : {}),
    ...(input.futureExternalLoss !== undefined ? {
      futureExternalLossMm: input.futureExternalLoss,
    } : {}),
  };
}

function domainFailure(result) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      result.code || 'CALCULATION_FAILED',
      result.message || 'Chapter IX wall-state calculation failed.',
      { domainDetails: result.details ?? {} },
      result.details?.field ?? null,
    )],
    qualification: qualification(),
    provenance: { engineeringAuthority: 'INPUT_CUSTODY_ONLY' },
    evidence: { domainResult: result },
  };
}

function outputs(result) {
  return {
    nominalWallMm: result.nominalWallMm,
    minimumAsManufacturedWallMm: result.minimumAsManufacturedWallMm,
    beginOfLifeConservativeWallMm: result.beginOfLifeConservativeWallMm,
    reservedServiceLossMm: result.reservedServiceLossMm,
    endOfLifeEffectiveWallMm: result.endOfLifeEffectiveWallMm,
    ...(result.measuredCurrentWallMm !== undefined ? {
      measuredCurrentWallMm: result.measuredCurrentWallMm,
      futureServiceLossMm: result.futureServiceLossMm,
      projectedEndOfLifeWallMm: result.projectedEndOfLifeWallMm,
    } : {}),
  };
}

function calculate(input, runtime = {}) {
  const mode = runtime.options?.qualificationMode;
  if (mode !== 'benchmark') return blockedByMode(mode);
  const result = calculateChapterIxWallState(domainInput(input));
  if (!result.ok) return domainFailure(result);
  return {
    ok: true,
    outputs: outputs(result),
    intermediates: {
      toleranceFactor: result.toleranceFactor,
      wallStateContract: result.wallStateContract,
    },
    checks: [],
    assessment: {
      status: 'TRACE_ONLY',
      pass: null,
      authority: 'INPUT_CUSTODY_ONLY',
    },
    qualification: qualification(),
    warnings: [{
      code: 'BENCHMARK_REFERENCE_ONLY',
      message: 'Wall states are calculated from explicit caller-supplied tolerance and allowance/loss values; governed product and corrosion masters remain required for design authority.',
    }],
    applicability: {
      applicable: true,
      limitations: [
        'Arithmetic wall-state custody only; no Code pressure-acceptance decision.',
        'No localized corrosion, statistical inspection, erosion model, or remaining-life rate calculation.',
      ],
    },
    provenance: {
      domainApi: 'calculateChapterIxWallState',
      engineeringAuthority: 'INPUT_CUSTODY_ONLY',
      codeCompliance: false,
    },
    evidence: { domainResult: result },
  };
}

export const B313_CHAPTER_IX_WALL_STATE_ENGINEERING_CALCULATION_DEFINITION = Object.freeze({
  contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
  id: 'PIPE.B313.CH9.WALL_STATE',
  family: 'PIPE',
  name: 'B31.3 Chapter IX Wall-State Custody — Software Regression',
  shortName: 'B31.3 Ch IX Wall State',
  methodRevision: 'wall-state-custody-v1',
  purpose: 'Make nominal, minimum-as-manufactured, beginning-of-life, end-of-life, and optional measured-current wall states explicit without promoting master or Code authority.',
  authority: {
    calculationState: 'IMPLEMENTED',
    qualificationState: 'BENCHMARK_ONLY',
    codeCompliance: false,
  },
  applicability: {
    description: 'Straight-pipe wall-state arithmetic from explicit engineering inputs.',
    limitations: [
      'Governed manufacturing tolerance and corrosion/erosion inputs are required before design use.',
      'No localized-corrosion or inspection-statistics model is included.',
    ],
  },
  ui: {
    requiredQualificationMode: 'benchmark',
    productSurface: 'ENGINEERING_CALCULATIONS',
  },
  inputs: [
    { key: 'nominalWall', label: 'Nominal wall', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
    { key: 'minusTolerancePct', label: 'Minus manufacturing tolerance', type: 'number', required: true, quantity: 'dimensionless', canonicalUnit: null, min: 0 },
    { key: 'internalServiceAllowance', label: 'Internal reserved service loss', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', min: 0 },
    { key: 'externalServiceAllowance', label: 'External reserved service loss', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', min: 0 },
    { key: 'measuredCurrentWall', label: 'Measured current wall', type: 'number', quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
    { key: 'futureInternalLoss', label: 'Future internal loss', type: 'number', quantity: 'length', canonicalUnit: 'mm', min: 0 },
    { key: 'futureExternalLoss', label: 'Future external loss', type: 'number', quantity: 'length', canonicalUnit: 'mm', min: 0 },
  ],
  outputs: [
    { key: 'minimumAsManufacturedWallMm', label: 'Minimum as-manufactured wall', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'beginOfLifeConservativeWallMm', label: 'Beginning-of-life conservative wall', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'endOfLifeEffectiveWallMm', label: 'End-of-life effective wall', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'projectedEndOfLifeWallMm', label: 'Projected end-of-life wall from measured current wall', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
  ],
  calculate,
});
