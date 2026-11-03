import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';
import { resolveChapterIxBasis } from '../../b313-chapter-ix/basis-resolver.js';

const QUALIFICATION_REASONS = Object.freeze([
  'GOVERNED_MASTER_RESOLUTION_TRACE_ONLY',
  'SOURCE_PENDING_AND_INDEPENDENTLY_CHECKED_RECORDS_REMAIN_NON_AUTHORIZING',
  'NO_CODE_ACCEPTANCE_OR_DESIGN_AUTHORITY',
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
      'Chapter IX governed-basis resolution requires explicit qualificationMode=benchmark until production masters and licensed evidence are authorized.',
      { allowedQualificationModes: ['benchmark'], received: mode ?? null },
    )],
    qualification: qualification(),
    provenance: { engineeringAuthority: 'MASTER_RESOLUTION_TRACE_ONLY' },
  };
}

function domainFailure(result) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      result.code || 'MASTER_RECORD_NOT_QUALIFIED',
      result.message || 'Chapter IX governed-basis resolution failed.',
      { resolverState: result.resolverState ?? null, ...(result.details ?? {}) },
    )],
    qualification: qualification(),
    provenance: { engineeringAuthority: 'MASTER_RESOLUTION_TRACE_ONLY' },
    evidence: { resolverResult: result },
  };
}

function warning(result) {
  if (result.resolverState === 'SOURCE_PENDING') {
    return {
      code: 'MASTER_SOURCE_PENDING',
      message: 'Basis values are traceable but at least one master/source record lacks independent qualification custody; design authority remains false.',
    };
  }
  return {
    code: 'RESOLVED_NOT_AUTHORIZED',
    message: 'Master records are independently checked under the resolver contract, but this calculation still has no Code/design authority.',
  };
}

function calculate(input, runtime = {}) {
  const mode = runtime.options?.qualificationMode;
  if (mode !== 'benchmark') return blockedByMode(mode);
  const result = resolveChapterIxBasis(input.basisPackage);
  if (!result.ok) return domainFailure(result);
  return {
    ok: true,
    outputs: {
      resolverState: result.resolverState,
      allowableStressMpa: result.resolved.allowableStressMpa,
      outsideDiameterMm: result.resolved.outsideDiameterMm,
      nominalWallMm: result.resolved.nominalWallMm,
      minusTolerancePct: result.resolved.minusTolerancePct,
      minimumAsManufacturedWallMm: result.resolved.minimumAsManufacturedWallMm,
    },
    intermediates: {
      query: result.query,
      materialInterpolation: result.material.interpolation,
      materialIssues: result.material.issues,
      productIssues: result.product.issues,
    },
    checks: [],
    assessment: {
      status: result.resolverState,
      pass: null,
      authority: 'MASTER_RESOLUTION_TRACE_ONLY',
      canUseForDesignAuthority: false,
    },
    qualification: qualification(),
    warnings: [warning(result)],
    applicability: {
      applicable: true,
      limitations: [
        'Master-resolution trace only; no ASME design acceptance decision.',
        'Allowable-stress extrapolation is prohibited.',
        'Dimensions and manufacturing tolerance require separate governed provenance.',
      ],
    },
    provenance: {
      engineeringAuthority: 'MASTER_RESOLUTION_TRACE_ONLY',
      codeCompliance: false,
      material: result.material.provenance,
      product: result.product.provenance,
    },
    evidence: { resolverResult: result },
  };
}

export const B313_CHAPTER_IX_BASIS_ENGINEERING_CALCULATION_DEFINITION = Object.freeze({
  contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
  id: 'PIPE.B313.CH9.RESOLVE_BASIS',
  family: 'PIPE',
  name: 'B31.3 Chapter IX Governed Basis Resolver — Trace Only',
  shortName: 'B31.3 Ch IX Resolve Basis',
  methodRevision: 'governed-basis-resolver-v1',
  purpose: 'Resolve material allowable stress and pipe product dimensions/tolerance through provenance-separated master contracts without promoting Code or design authority.',
  authority: {
    calculationState: 'IMPLEMENTED',
    qualificationState: 'BENCHMARK_ONLY',
    codeCompliance: false,
  },
  applicability: {
    description: 'Canonical SI basis-package resolution for Chapter IX straight-pipe R1 calculations.',
    limitations: [
      'Production master authority is not established by this definition.',
      'Section II-D mechanical properties are not accepted as B31.3 allowable-stress authority.',
      'Legacy product rows with collapsed tolerance provenance are not accepted.',
    ],
  },
  ui: {
    requiredQualificationMode: 'benchmark',
    productSurface: 'ENGINEERING_CALCULATIONS',
  },
  inputs: [
    { key: 'basisPackage', label: 'Governed Chapter IX basis package', type: 'object', required: true },
  ],
  outputs: [
    { key: 'resolverState', label: 'Resolver state', type: 'string' },
    { key: 'allowableStressMpa', label: 'Resolved B31.3 allowable stress', type: 'number', quantity: 'stress', canonicalUnit: 'MPa' },
    { key: 'outsideDiameterMm', label: 'Resolved outside diameter', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'nominalWallMm', label: 'Resolved nominal wall', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
    { key: 'minusTolerancePct', label: 'Resolved manufacturing minus tolerance', type: 'number', quantity: 'dimensionless', canonicalUnit: null },
    { key: 'minimumAsManufacturedWallMm', label: 'Minimum as-manufactured wall', type: 'number', quantity: 'length', canonicalUnit: 'mm' },
  ],
  calculate,
});
