import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  validateAivAssumptionProfile,
} from './aiv-assumption-profile.js';
import { buildAivPostDiscontinuityEvidenceGate } from './aiv-post-discontinuity-evidence-gate.js';
import { buildAivDiscontinuityStage8EvidenceGate } from './aiv-stage8-evidence-gate.js';

export const AIV_AUTO_STAGE_PLAN_SCHEMA = 'AivAutoStagePlan.v1';
export const AIV_AUTO_STAGE_STATUS = Object.freeze({
  COMPLETE: 'COMPLETE',
  READY: 'READY',
  NEXT: 'NEXT',
  BLOCKED_BY_PREVIOUS_STAGE: 'BLOCKED_BY_PREVIOUS_STAGE',
  BLOCKED_INVALID_CONFIGURATION: 'BLOCKED_INVALID_CONFIGURATION',
  FUTURE: 'FUTURE',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function completedArtifact(input, schema) {
  const doc = input?.document ?? input?.verification ?? input ?? null;
  return doc?.schema === schema && doc.status === 'PASS';
}

export function buildAivAutoStagePlan({
  assumptionProfile = AIV_DEFAULT_ASSUMPTION_PROFILE,
  stages1To7Implemented = true,
  stages8To10Implemented = true,
  productPathBenchmarkParity = null,
  resultExportWired = true,
  exactHeadReleaseValidation = null,
  benchmarkOnlyReleased = true,
  screeningReleased = true,
} = {}) {
  const profileValidation = validateAivAssumptionProfile(assumptionProfile);
  const stage8Gate = buildAivDiscontinuityStage8EvidenceGate({ assumptionProfile });
  const postGate = buildAivPostDiscontinuityEvidenceGate({ assumptionProfile });
  const configurationValid = profileValidation.valid
    && stage8Gate.readyForCandidateImplementation
    && postGate.readyForCandidateImplementation;
  const productPathPass = completedArtifact(productPathBenchmarkParity, 'AivProductPathBenchmarkParityReceipt.v1');
  const exactHeadPass = completedArtifact(exactHeadReleaseValidation, 'AivReleaseValidationReceipt.v1');
  const benchmarkProgramComplete = benchmarkOnlyReleased || screeningReleased;

  const stages = [];
  stages.push({
    stageId: '16B.1',
    label: 'Stages 1–7 product-shaped candidate',
    status: stages1To7Implemented ? AIV_AUTO_STAGE_STATUS.COMPLETE : AIV_AUTO_STAGE_STATUS.NEXT,
    autoAction: 'IMPLEMENT_OR_VERIFY_STAGES_1_TO_7',
  });
  stages.push({
    stageId: '16B.2',
    label: 'Resolve benchmark assumptions and stages 8–10 configuration',
    status: configurationValid
      ? AIV_AUTO_STAGE_STATUS.COMPLETE
      : AIV_AUTO_STAGE_STATUS.BLOCKED_INVALID_CONFIGURATION,
    autoAction: 'VALIDATE_AND_APPLY_AIV_ASSUMPTION_PROFILE',
  });
  stages.push({
    stageId: '16B.3',
    label: 'Stages 8–10 AUTO benchmark implementation',
    status: !configurationValid
      ? AIV_AUTO_STAGE_STATUS.BLOCKED_BY_PREVIOUS_STAGE
      : stages8To10Implemented
        ? AIV_AUTO_STAGE_STATUS.COMPLETE
        : AIV_AUTO_STAGE_STATUS.NEXT,
    autoAction: 'IMPLEMENT_STAGES_8_TO_10',
  });
  stages.push({
    stageId: '17',
    label: 'Run complete D.2.3 through Source / Assessment / Line result path',
    status: benchmarkProgramComplete || productPathPass
      ? AIV_AUTO_STAGE_STATUS.COMPLETE
      : !stages8To10Implemented
        ? AIV_AUTO_STAGE_STATUS.BLOCKED_BY_PREVIOUS_STAGE
        : AIV_AUTO_STAGE_STATUS.NEXT,
    autoAction: 'BUILD_PRODUCT_PATH_BENCHMARK_PARITY_RECEIPT',
  });
  stages.push({
    stageId: '18',
    label: 'Enable benchmark result detail, assumptions and export',
    status: benchmarkProgramComplete || (productPathPass && resultExportWired)
      ? AIV_AUTO_STAGE_STATUS.COMPLETE
      : !productPathPass
        ? AIV_AUTO_STAGE_STATUS.BLOCKED_BY_PREVIOUS_STAGE
        : AIV_AUTO_STAGE_STATUS.NEXT,
    autoAction: 'WIRE_BENCHMARK_RESULT_UI_AND_EXPORT',
  });
  stages.push({
    stageId: '19',
    label: 'Exact-head BENCHMARK_ONLY release validation and transition',
    status: benchmarkProgramComplete
      ? AIV_AUTO_STAGE_STATUS.COMPLETE
      : !productPathPass || !resultExportWired
        ? AIV_AUTO_STAGE_STATUS.BLOCKED_BY_PREVIOUS_STAGE
        : exactHeadPass
          ? AIV_AUTO_STAGE_STATUS.READY
          : AIV_AUTO_STAGE_STATUS.NEXT,
    autoAction: benchmarkProgramComplete
      ? 'BENCHMARK_ONLY_RELEASE_COMPLETE'
      : exactHeadPass
        ? 'APPLY_BENCHMARK_ONLY_AUTHORITY_TRANSITION'
        : 'RUN_EXACT_HEAD_NODE_AND_BROWSER_VALIDATION',
  });
  stages.push({
    stageId: '20',
    label: 'SCREENING qualification program',
    status: screeningReleased
      ? AIV_AUTO_STAGE_STATUS.COMPLETE
      : benchmarkOnlyReleased
        ? AIV_AUTO_STAGE_STATUS.NEXT
        : AIV_AUTO_STAGE_STATUS.FUTURE,
    autoAction: screeningReleased
      ? 'SCREENING_RELEASE_COMPLETE'
      : 'QUALIFY_SCREENING_DOMAIN_WITH_MACHINE_TESTS',
  });

  const next = stages.find((stage) => stage.status === AIV_AUTO_STAGE_STATUS.NEXT) ?? null;
  const currentQualificationState = screeningReleased
    ? 'SCREENING'
    : benchmarkOnlyReleased
      ? 'BENCHMARK_ONLY'
      : 'BLOCKED';
  return deepFreeze({
    schema: AIV_AUTO_STAGE_PLAN_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    mode: 'AUTO',
    humanEvidenceRequired: false,
    missingDataPolicy: 'ASSUME_FROM_VISIBLE_USER_CONFIGURABLE_PROFILE',
    implementationMode: 'CENTRAL_10_STAGE_AIV_CALCULATOR',
    configuration: {
      status: configurationValid ? 'PASS' : 'INVALID_ASSUMPTION_PROFILE',
      profileValidation,
      stage8GateStatus: stage8Gate.status,
      postDiscontinuityGateStatus: postGate.status,
    },
    stages,
    nextStageId: next?.stageId ?? null,
    nextAction: next?.autoAction ?? null,
    releaseProgramStatus: screeningReleased ? 'SCREENING_RELEASED' : benchmarkOnlyReleased ? 'BENCHMARK_ONLY_RELEASED' : 'IN_PROGRESS',
    stopConditions: [
      'INVALID_ASSUMPTION_PROFILE',
      'MACHINE_BENCHMARK_PARITY_FAILURE',
      'PRODUCT_PATH_BENCHMARK_PARITY_FAILURE',
      'EXACT_HEAD_VALIDATION_FAILURE',
    ],
    authority: {
      authorityTransitionApplied: benchmarkOnlyReleased || screeningReleased,
      currentCalculationState: benchmarkOnlyReleased || screeningReleased ? 'IMPLEMENTED' : 'BLOCKED',
      currentQualificationState,
      screeningAuthority: screeningReleased ? 'AUTHORIZED' : 'NOT_AUTHORIZED',
      screeningResultScope: screeningReleased ? 'ASSESSMENT' : null,
      lineCaseSummaryAuthoritativeForScreening: false,
      designAuthority: false,
    },
  });
}
