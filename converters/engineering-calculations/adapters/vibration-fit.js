import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';
import {
  FIT_MULTIPHASE_RESOLUTION_MODES,
  FIT_REFERENCE_AUTHORITY,
  FIT_WORKBOOK_SOURCE,
  assessFit,
  buildFitCorrelationTrace,
  calculateFit,
  evaluateFitApplicability,
} from '../../vibration/fit/index.js';

const QUALIFICATION_REASONS = Object.freeze([
  'CONTROLLED_EI_WORKED_EXAMPLE_PRODUCT_PATH_QUALIFICATION',
  'OWNER_WORKED_EXAMPLE_BENCHMARK_SUFFICIENT_POLICY',
  'BOUNDED_BRANCH_QUALIFICATION_EVIDENCE',
  'QST_003_DIAMETER_GAP_FAIL_CLOSED',
  'SCREENING_ONLY_DESIGN_AUTHORITY_FALSE',
]);

function qualification(mode) {
  const screening = mode === 'screening';
  return composeEngineeringQualification({
    method: screening ? 'SCREENING' : 'BENCHMARK_ONLY',
    data: screening ? 'SCREENING' : 'BENCHMARK_ONLY',
    designAuthority: false,
    reasons: QUALIFICATION_REASONS,
  });
}

function domainInput(input) {
  return {
    phase: input.phase,
    ...(input.multiphaseResolutionMode !== undefined ? { multiphaseResolutionMode: input.multiphaseResolutionMode } : {}),
    outsideDiameterM: input.outsideDiameter,
    wallThicknessM: input.wallThickness,
    ...(input.insideDiameter !== undefined ? { insideDiameterM: input.insideDiameter } : {}),
    maximumUnsupportedSpanM: input.maximumUnsupportedSpan,
    ...(input.massFlow !== undefined ? { massFlowKgS: input.massFlow } : {}),
    ...(input.density !== undefined ? { densityKgM3: input.density } : {}),
    ...(input.gasDynamicViscosity !== undefined ? { gasDynamicViscosityPaS: input.gasDynamicViscosity } : {}),
    ...(input.gasMassFlow !== undefined ? { gasMassFlowKgS: input.gasMassFlow } : {}),
    ...(input.gasDensity !== undefined ? { gasDensityKgM3: input.gasDensity } : {}),
    ...(input.liquidMassFlow !== undefined ? { liquidMassFlowKgS: input.liquidMassFlow } : {}),
    ...(input.liquidDensity !== undefined ? { liquidDensityKgM3: input.liquidDensity } : {}),
    ...(input.fluidVelocity !== undefined ? { fluidVelocityMS: input.fluidVelocity } : {}),
    ...(input.naturalFrequency !== undefined ? { naturalFrequencyHz: input.naturalFrequency } : {}),
  };
}

function engineeringError(error) {
  const outside = error.code === 'FIT_INPUT_OUTSIDE_APPLICABILITY'
    || error.code === 'FIT_SUPPORT_SIZE_FAMILY_UNRESOLVED';
  return createEngineeringCalculationError(
    outside ? 'INPUT_OUTSIDE_APPLICABILITY' : 'INPUT_INVALID',
    error.message,
    { fitCode: error.code, ...error.details },
    error.field ? error.field.replace(/(KgM3|KgS|PaS|MS|Hz|M)$/u, '') : null,
  );
}

function validateInput(input) {
  const result = evaluateFitApplicability(domainInput(input));
  return {
    ok: result.applicable,
    errors: result.errors.map(engineeringError),
    applicability: {
      applicable: result.applicable,
      limitations: result.limitations ?? [],
    },
  };
}

function blockedByMode(mode) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      'ENGINEERING_METHOD_NOT_QUALIFIED',
      'FIT execution requires explicit qualificationMode=benchmark or qualificationMode=screening.',
      { allowedQualificationModes: ['benchmark', 'screening'], qualificationIssue: 429, received: mode ?? null },
    )],
    qualification: qualification('screening'),
  };
}

function blockedScreening(result) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      'ENGINEERING_METHOD_NOT_QUALIFIED',
      'FIT input is outside the qualified bounded screening evidence envelope.',
      {
        screeningCandidateStatus: result.screeningCandidate?.status ?? null,
        reasons: result.screeningCandidate?.reasons ?? [],
      },
    )],
    qualification: qualification('screening'),
    applicability: { applicable: false, limitations: result.applicability?.limitations ?? [] },
  };
}

function outputValues(calculation, assessment) {
  return {
    standardFv: calculation.standard.correlation.fv,
    standardLof: calculation.standard.lof,
    refinedLof: calculation.advanced?.lof ?? null,
    governingReferenceLof: calculation.governingReferenceLof,
    referenceThreshold: assessment.referenceThreshold ?? 1,
    referenceThresholdExceeded: assessment.referenceThresholdExceeded,
    referenceBand: assessment.referenceBand,
  };
}

function fitIntermediates(result) {
  return {
    hydraulics: result.hydraulics,
    excitation: result.excitation,
    support: result.support,
    standard: {
      fluidViscosityFactor: result.standard.fluidViscosityFactor,
      demand: result.standard.demand,
      lof: result.standard.lof,
    },
    standardCorrelation: buildFitCorrelationTrace(result.standard.correlation, 'STANDARD'),
    advancedEligibility: result.advancedEligibility,
    advanced: result.advanced ? {
      lof: result.advanced.lof,
      naturalFrequencyHz: result.advanced.naturalFrequencyHz,
    } : null,
    advancedCorrelation: buildFitCorrelationTrace(result.advanced?.correlation ?? null, 'ADVANCED'),
  };
}

function correlationIds(intermediates) {
  return [
    intermediates.standardCorrelation?.correlationId,
    intermediates.advancedCorrelation?.correlationId,
  ].filter(Boolean);
}

function warning(mode) {
  return mode === 'screening' ? {
    code: 'SCREENING_ONLY_NOT_DESIGN_AUTHORITY',
    message: 'FIT result is qualified for bounded screening only; design authority remains false and declared exclusions remain fail-closed.',
  } : {
    code: 'BENCHMARK_REFERENCE_ONLY',
    message: 'FIT result is running in benchmark mode and does not carry screening or design authority.',
  };
}

function calculate(input, runtime = {}) {
  const mode = runtime.options?.qualificationMode;
  if (!['benchmark', 'screening'].includes(mode)) return blockedByMode(mode);
  const result = calculateFit(domainInput(input));
  const currentQualification = qualification(mode);
  if (!result.ok) {
    return {
      ok: false,
      errors: result.errors.map(engineeringError),
      qualification: currentQualification,
      applicability: { applicable: false, limitations: result.applicability?.limitations ?? [] },
      provenance: { sourceWorkbook: FIT_WORKBOOK_SOURCE },
    };
  }
  if (mode === 'screening' && result.screeningCandidate?.screeningAuthorized !== true) {
    return blockedScreening(result);
  }
  const assessment = assessFit(result);
  const intermediates = fitIntermediates(result);
  return {
    ok: true,
    outputs: outputValues(result, assessment),
    intermediates,
    checks: [],
    assessment: {
      ...assessment,
      screeningAuthority: mode === 'screening' ? 'AUTHORIZED_BOUNDED' : 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    qualification: currentQualification,
    applicability: { applicable: true, limitations: result.applicability.limitations },
    provenance: {
      domainApi: 'calculateFit',
      engineeringAuthority: mode === 'screening' ? 'SCREENING' : FIT_REFERENCE_AUTHORITY,
      sourceWorkbook: FIT_WORKBOOK_SOURCE,
      inputResolution: result.evidence.inputResolution,
      qualificationCoverageId: result.qualificationCoverage.coverageId,
      screeningCandidateScopeId: result.screeningCandidate.scopeId,
      qualificationBasis: result.qualificationCoverage.qualificationBasis ?? null,
    },
    evidence: {
      equationIds: result.evidence.equationIds,
      correlationIds: correlationIds(intermediates),
      inputResolution: result.evidence.inputResolution,
      qualificationCoverage: result.qualificationCoverage,
      screeningCandidate: result.screeningCandidate,
      sourceWorkbook: FIT_WORKBOOK_SOURCE,
      domainResult: result,
    },
    warnings: [warning(mode)],
  };
}

const inputs = Object.freeze([
  { key: 'phase', label: 'Fluid phase', type: 'enum', values: ['LIQUID', 'GAS', 'MULTIPHASE'], required: true },
  { key: 'multiphaseResolutionMode', label: 'Multiphase resolution mode', type: 'enum', values: FIT_MULTIPHASE_RESOLUTION_MODES },
  { key: 'outsideDiameter', label: 'Outside diameter', type: 'number', quantity: 'length', canonicalUnit: 'm', required: true, minExclusive: 0 },
  { key: 'wallThickness', label: 'Wall thickness', type: 'number', quantity: 'length', canonicalUnit: 'm', required: true, minExclusive: 0 },
  { key: 'insideDiameter', label: 'Inside diameter', type: 'number', quantity: 'length', canonicalUnit: 'm', minExclusive: 0 },
  { key: 'maximumUnsupportedSpan', label: 'Maximum unsupported span', type: 'number', quantity: 'length', canonicalUnit: 'm', required: true, minExclusive: 0 },
  { key: 'massFlow', label: 'Single-phase / aggregate mass flow', type: 'number', quantity: 'mass_flow', canonicalUnit: 'kg/s', min: 0 },
  { key: 'density', label: 'Single-phase / effective density', type: 'number', quantity: 'density', canonicalUnit: 'kg/m3', minExclusive: 0 },
  { key: 'gasDynamicViscosity', label: 'Gas dynamic viscosity', type: 'number', quantity: 'dynamic_viscosity', canonicalUnit: 'Pa*s', minExclusive: 0 },
  { key: 'gasMassFlow', label: 'Gas mass flow', type: 'number', quantity: 'mass_flow', canonicalUnit: 'kg/s', min: 0 },
  { key: 'gasDensity', label: 'Gas density', type: 'number', quantity: 'density', canonicalUnit: 'kg/m3', minExclusive: 0 },
  { key: 'liquidMassFlow', label: 'Liquid aggregate mass flow', type: 'number', quantity: 'mass_flow', canonicalUnit: 'kg/s', min: 0 },
  { key: 'liquidDensity', label: 'Liquid aggregate density', type: 'number', quantity: 'density', canonicalUnit: 'kg/m3', minExclusive: 0 },
  { key: 'fluidVelocity', label: 'Fluid / effective velocity override', type: 'number', quantity: 'velocity', canonicalUnit: 'm/s', min: 0 },
  { key: 'naturalFrequency', label: 'Actual natural frequency', type: 'number', quantity: 'frequency', canonicalUnit: 'Hz', minExclusive: 0 },
]);

export const VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION = Object.freeze({
  contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
  id: 'VIB.FIV.FLOW_TURBULENCE',
  family: 'VIB',
  name: 'Flow-Induced Vibration Screening — FIT',
  shortName: 'Flow-Induced Vibration Screening',
  methodRevision: 'ei-aviff2-fit-screening-v1',
  purpose: 'Execute the controlled EI/FIT method for bounded screening with explicit evidence, exclusions and reproducibility.',
  authority: {
    calculationState: 'IMPLEMENTED',
    qualificationState: 'SCREENING',
    codeCompliance: false,
  },
  applicability: {
    description: 'Bounded main-line FIT screening scope.',
    limitations: [
      'Screening authority only; designAuthority=false.',
      'Outside diameter 219.1 mm < Dext < 273 mm remains excluded and fail-closed.',
      'Advanced screening requires the declared flexible-family, LOF and 1 Hz < fn <= 3 Hz criteria.',
      'Mixed aggregate/component multiphase data require an explicit resolution mode.',
      'Project application outside the qualified bounded envelope requires separate engineering review.',
    ],
  },
  inputs,
  outputs: [
    { key: 'standardFv', label: 'Standard reference Fv', type: 'number', quantity: 'pressure', canonicalUnit: 'Pa' },
    { key: 'standardLof', label: 'Standard reference LOF', type: 'number', quantity: 'dimensionless', canonicalUnit: null },
    { key: 'refinedLof', label: 'Advanced reference LOF', type: 'number', quantity: 'dimensionless', canonicalUnit: null },
    { key: 'governingReferenceLof', label: 'Governing reference LOF', type: 'number', quantity: 'dimensionless', canonicalUnit: null },
    { key: 'referenceBand', label: 'EI reference LOF band', type: 'string' },
  ],
  qualificationIssue: 429,
  ui: {
    visible: true,
    executionModes: ['single', 'sandbox', 'batch'],
    minimumQualificationToShow: 'SCREENING',
    requiredQualificationMode: 'screening',
    productSurface: 'VIBRATION_INTEGRITY_TABLE_WORKSPACE',
    warning: 'SCREENING ONLY — bounded FIT scope; not design authority.',
  },
  validateInput,
  calculate,
});
