import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';
import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  validateAivAssumptionProfile,
} from '../../vibration/aiv/aiv-assumption-profile.js';
import { calculateAiv } from '../../vibration/aiv/aiv-calculator.js';

const SCREENING_REASONS = Object.freeze([
  'EI_D2_3_PRODUCT_PATH_22_OF_22_PASS',
  'BENCHMARK_ONLY_EXACT_HEAD_RELEASE_VALIDATION_PASS',
  'SCREENING_EIGHT_GROUP_MACHINE_QUALIFICATION_PASS',
  'VISIBLE_USER_CONFIGURABLE_ASSUMPTIONS',
  'ASSESSMENT_SCOPE_SCREENING_ONLY',
  'DESIGN_AUTHORITY_FALSE',
]);

function qualification(mode) {
  const screening = mode === 'screening';
  return composeEngineeringQualification({
    method: screening ? 'SCREENING' : 'BENCHMARK_ONLY',
    data: screening ? 'SCREENING' : 'BENCHMARK_ONLY',
    designAuthority: false,
    reasons: SCREENING_REASONS,
  });
}

function validateInput(input) {
  const errors = [];
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    errors.push(createEngineeringCalculationError('INPUT_REQUIRED', 'AIV sources table requires at least one source.', {}, 'sources'));
  }
  if (!Array.isArray(input.assessments) || input.assessments.length === 0) {
    errors.push(createEngineeringCalculationError('INPUT_REQUIRED', 'AIV assessments table requires at least one assessment.', {}, 'assessments'));
  }
  if (!Array.isArray(input.relationships) || input.relationships.length === 0) {
    errors.push(createEngineeringCalculationError('INPUT_REQUIRED', 'AIV source-to-assessment table requires at least one relationship.', {}, 'relationships'));
  }
  if (!input.topology || typeof input.topology !== 'object') {
    errors.push(createEngineeringCalculationError('INPUT_REQUIRED', 'AIV topology exchange is required.', {}, 'topology'));
  }
  const profile = input.assumptionProfile ?? AIV_DEFAULT_ASSUMPTION_PROFILE;
  const validation = validateAivAssumptionProfile(profile);
  if (!validation.valid) {
    errors.push(createEngineeringCalculationError(
      'INPUT_INVALID',
      'AIV assumption profile is invalid.',
      { missing: validation.missing, invalidNumeric: validation.invalidNumeric },
      'assumptionProfile',
    ));
  }
  return {
    ok: errors.length === 0,
    errors,
    applicability: {
      applicable: errors.length === 0,
      limitations: [
        'Assessment-level LOF is the qualified screening result scope.',
        'Configured line/case LOF is retained for traceability but is not authoritative for screening.',
        'Missing engineering inputs may be filled only by the visible/exported user-configurable assumption profile.',
        'designAuthority=false.',
      ],
    },
  };
}

function calculate(input, runtime = {}) {
  const mode = runtime.options?.qualificationMode;
  if (!['benchmark', 'screening'].includes(mode)) {
    return {
      ok: false,
      errors: [createEngineeringCalculationError(
        'ENGINEERING_METHOD_NOT_QUALIFIED',
        'AIV execution requires explicit qualificationMode=benchmark or qualificationMode=screening.',
        { allowedQualificationModes: ['benchmark', 'screening'], qualificationIssue: 441 },
      )],
      qualification: qualification('screening'),
    };
  }
  const result = calculateAiv({
    sources: input.sources,
    assessments: input.assessments,
    relationships: input.relationships,
    exchange: input.topology,
    assumptionProfile: input.assumptionProfile ?? AIV_DEFAULT_ASSUMPTION_PROFILE,
    qualificationMode: mode,
  });
  const screening = mode === 'screening';
  return {
    ok: true,
    outputs: {
      sourceResults: result.sourceResults,
      assessmentResults: result.assessmentResults,
      lineCaseSummaries: result.lineCaseSummaries,
      screeningResultScope: result.screeningResultScope,
      completeKernelStageCount: result.implementedStageCount,
    },
    intermediates: {
      stageOrder: result.stageOrder,
      profileValidation: result.profileValidation,
    },
    checks: [],
    assessment: {
      resultScope: screening ? 'ASSESSMENT_SCREENING' : 'BENCHMARK',
      screeningAuthority: screening ? 'AUTHORIZED' : 'NOT_AUTHORIZED',
      lineCaseSummaryAuthoritativeForScreening: false,
      designAuthority: false,
    },
    qualification: qualification(mode),
    applicability: {
      applicable: true,
      limitations: [
        screening ? 'Assessment-level screening authority only.' : 'Benchmark execution only.',
        'Line/case summary remains a configured reference and is not authoritative for screening.',
        'Result does not provide design approval.',
      ],
    },
    provenance: {
      domainApi: 'calculateAiv',
      methodId: 'VIB.AIV.ACOUSTIC',
      assumptionProfileSchema: result.assumptionProfile.schema,
      humanEvidenceRequired: false,
      screeningQualificationReceipt: 'AIV-SCREENING-ReleaseValidationReceipt-v1.json',
    },
    evidence: {
      domainResult: result,
      stageOrder: result.stageOrder,
    },
    warnings: screening ? [{
      code: 'SCREENING_ONLY_NOT_DESIGN_AUTHORITY',
      message: 'AIV assessment result is qualified for screening only; design authority remains false and the configured line summary is not a screening result.',
    }] : [{
      code: 'BENCHMARK_REFERENCE_ONLY',
      message: 'AIV result is running in benchmark mode and does not carry screening authority.',
    }],
  };
}

const inputs = Object.freeze([
  { key: 'sources', label: 'AIV Sources', type: 'table', required: true },
  { key: 'assessments', label: 'AIV Assessments', type: 'table', required: true },
  { key: 'relationships', label: 'AIV Source to Assessment', type: 'table', required: true },
  { key: 'topology', label: 'Topology exchange', type: 'object', required: true },
  { key: 'assumptionProfile', label: 'AIV assumption profile', type: 'object' },
]);

export const VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION = Object.freeze({
  contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
  id: 'VIB.AIV.ACOUSTIC',
  family: 'VIB',
  name: 'Acoustic-Induced Vibration Screening',
  shortName: 'Acoustic-Induced Vibration',
  methodRevision: 'ei-aviff2-aiv-auto-screening-v1',
  purpose: 'Execute the traceable 10-stage AIV method for assessment-level screening with visible user-configurable assumptions.',
  authority: {
    calculationState: 'IMPLEMENTED',
    qualificationState: 'SCREENING',
    codeCompliance: false,
  },
  applicability: {
    description: 'Gas-phase pressure-reducing AIV source-to-welded-discontinuity assessment screening with explicit source/path/geometry evidence and visible assumptions.',
    limitations: [
      'Assessment-level screening authority only; no design authority.',
      'Configured line/case LOF is non-authoritative for screening.',
      'All assumed values must remain visible, editable and exported.',
      'Project application outside the qualified input/model envelope remains the user’s responsibility to review.',
    ],
  },
  inputs,
  outputs: [
    { key: 'sourceResults', label: 'Source results', type: 'table' },
    { key: 'assessmentResults', label: 'Assessment screening results', type: 'table' },
    { key: 'lineCaseSummaries', label: 'Non-authoritative line / case summaries', type: 'table' },
    { key: 'screeningResultScope', label: 'Screening result scope', type: 'string' },
    { key: 'completeKernelStageCount', label: 'Kernel stage count', type: 'integer', quantity: 'dimensionless', canonicalUnit: null },
  ],
  qualificationIssue: 441,
  ui: {
    visible: true,
    executionModes: ['single', 'sandbox', 'batch'],
    minimumQualificationToShow: 'SCREENING',
    requiredQualificationMode: 'screening',
    productSurface: 'VIBRATION_AIV_QUALIFICATION_WORKSPACE',
    warning: 'SCREENING ONLY — assessment scope; not design authority.',
  },
  validateInput,
  calculate,
});
