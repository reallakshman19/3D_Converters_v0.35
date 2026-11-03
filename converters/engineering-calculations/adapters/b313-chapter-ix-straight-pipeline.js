import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';
import { calculateChapterIxStraightPressureFromBasis } from '../../b313-chapter-ix/straight-pipe-pipeline.js';

const REASONS = Object.freeze([
  'GOVERNED_MASTER_PIPELINE_REFERENCE_ONLY',
  'MASTER_SOURCE_STATE_PROPAGATES_WITHOUT_AUTHORITY_PROMOTION',
  'LICENSED_B313_AND_CLASS_E_QUALIFICATION_REQUIRED_FOR_DESIGN_AUTHORITY',
]);

function qualification() {
  return composeEngineeringQualification({
    method: 'BENCHMARK_ONLY',
    data: 'BENCHMARK_ONLY',
    designAuthority: false,
    reasons: REASONS,
  });
}

function blocked(mode) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      'ENGINEERING_METHOD_NOT_QUALIFIED',
      'Chapter IX governed straight-pressure pipeline requires qualificationMode=benchmark.',
      { allowedQualificationModes: ['benchmark'], received: mode ?? null },
    )],
    qualification: qualification(),
    provenance: { engineeringAuthority: 'GOVERNED_PIPELINE_REFERENCE_ONLY' },
  };
}

function failed(result) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      result.code || 'CALCULATION_FAILED',
      result.message || 'Chapter IX governed straight-pressure pipeline failed.',
      result.details ?? {},
    )],
    qualification: qualification(),
    provenance: { engineeringAuthority: 'GOVERNED_PIPELINE_REFERENCE_ONLY' },
    evidence: { pipelineResult: result },
  };
}

function resultOutputs(result) {
  const p = result.pressure;
  return {
    resolverState: result.resolverState,
    pressureDesignThicknessMm: p.pressureDesignThicknessMm,
    requiredMinimumThicknessMm: p.requiredMinimumThicknessMm,
    requiredNominalThicknessMm: p.requiredNominalThicknessMm,
    minimumAsManufacturedThicknessMm: p.minimumAsManufacturedThicknessMm,
    effectiveNetWallMm: p.effectiveNetWallMm,
    pressureRatingMpa: p.pressureRatingMpa,
    pressureRatingMargin: p.pressureRatingMargin,
    minimumWallMarginMm: p.minimumWallMarginMm,
    staticReferencePass: p.staticPass,
  };
}

function calculate(input, runtime = {}) {
  const mode = runtime.options?.qualificationMode;
  if (mode !== 'benchmark') return blocked(mode);
  const result = calculateChapterIxStraightPressureFromBasis({
    basisPackage: input.basisPackage,
    designPressureMpa: input.designPressure,
    internalAllowanceMm: input.internalAllowance,
    externalAllowanceMm: input.externalAllowance,
  });
  if (!result.ok) return failed(result);
  return {
    ok: true,
    outputs: resultOutputs(result),
    intermediates: {
      basisQuery: result.basis.query,
      materialInterpolation: result.basis.material.interpolation,
      basisIssues: result.basis.issues,
    },
    checks: [],
    assessment: {
      status: result.referenceStatus,
      pass: null,
      authority: 'GOVERNED_PIPELINE_REFERENCE_ONLY',
      canUseForDesignAuthority: false,
    },
    qualification: qualification(),
    warnings: [{
      code: result.resolverState === 'SOURCE_PENDING' ? 'MASTER_SOURCE_PENDING' : 'REFERENCE_ONLY',
      message: result.resolverState === 'SOURCE_PENDING'
        ? 'Calculation used traceable source-pending masters; result is not design authority.'
        : 'Calculation used independently checked resolver masters but remains benchmark-only.',
    }],
    applicability: {
      applicable: true,
      limitations: [
        'Straight-pipe internal-pressure reference only.',
        'No fatigue, component, B31J, FEA or system-load qualification.',
      ],
    },
    provenance: {
      engineeringAuthority: 'GOVERNED_PIPELINE_REFERENCE_ONLY',
      codeCompliance: false,
      basis: {
        material: result.basis.material.provenance,
        product: result.basis.product.provenance,
      },
      pressureFormulation: result.pressure.formulation,
    },
    evidence: { pipelineResult: result },
  };
}

export const B313_CHAPTER_IX_STRAIGHT_PIPELINE_ENGINEERING_CALCULATION_DEFINITION = Object.freeze({
  contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
  id: 'PIPE.B313.CH9.STRAIGHT_PRESSURE_FROM_BASIS',
  family: 'PIPE',
  name: 'B31.3 Chapter IX Governed Basis to Straight Pressure — Reference',
  shortName: 'B31.3 Ch IX Governed Straight Pressure',
  methodRevision: 'governed-basis-straight-pressure-v1',
  purpose: 'Compose governed Chapter IX basis resolution with the bounded straight-pressure kernel without granting Code/design authority.',
  authority: {
    calculationState: 'IMPLEMENTED',
    qualificationState: 'BENCHMARK_ONLY',
    codeCompliance: false,
  },
  applicability: {
    description: 'Benchmark-only composition of governed basis data into the bounded Chapter IX straight-pipe pressure calculation.',
    limitations: ['No design authority.', 'No fatigue or component qualification.'],
  },
  ui: {
    requiredQualificationMode: 'benchmark',
    productSurface: 'ENGINEERING_CALCULATIONS',
  },
  inputs: [
    { key: 'basisPackage', label: 'Governed Chapter IX basis package', type: 'object', required: true },
    { key: 'designPressure', label: 'Design pressure', type: 'number', required: true, quantity: 'pressure', canonicalUnit: 'MPa', pressureReference: 'gauge', minExclusive: 0 },
    { key: 'internalAllowance', label: 'Internal allowance', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', min: 0 },
    { key: 'externalAllowance', label: 'External allowance', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', min: 0 },
  ],
  outputs: [
    { key: 'resolverState', label: 'Resolver state', type: 'string' },
    { key: 'requiredNominalThicknessMm', label: 'Required nominal thickness', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'pressureRatingMpa', label: 'Pressure rating', type: 'number', quantity: 'pressure', canonicalUnit: 'MPa' },
    { key: 'staticReferencePass', label: 'Static reference status', type: 'boolean' },
  ],
  calculate,
});
