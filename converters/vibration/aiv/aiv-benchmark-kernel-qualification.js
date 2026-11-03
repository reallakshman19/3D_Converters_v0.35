import { AIV_DEFAULT_ASSUMPTION_PROFILE } from './aiv-assumption-profile.js';
import { buildAivPostDiscontinuityEvidenceGate } from './aiv-post-discontinuity-evidence-gate.js';
import { buildAivDiscontinuityStage8EvidenceGate } from './aiv-stage8-evidence-gate.js';

export const AIV_BENCHMARK_KERNEL_QUALIFICATION_SCHEMA = 'AivBenchmarkKernelQualification.v2';
export const AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS = Object.freeze({
  NOT_READY: 'NOT_READY',
  READY_FOR_STAGES_8_TO_10_IMPLEMENTATION: 'READY_FOR_STAGES_8_TO_10_IMPLEMENTATION',
  INVALID_EVIDENCE: 'INVALID_EVIDENCE',
  PASS: 'PASS',
});

const ALL_STAGES = Object.freeze([
  'VALIDATE_INPUT',
  'RESOLVE_INPUT',
  'EVALUATE_APPLICABILITY',
  'CALCULATE_SOURCE_PWL',
  'APPLY_SOURCE_MODIFIERS',
  'CALCULATE_POINT_ATTENUATION',
  'COMBINE_SIMULTANEOUS_SOURCES',
  'CALCULATE_DISCONTINUITY_RESULT',
  'AGGREGATE_LINE_CASE_RESULT',
  'ASSESS_RESULT',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256Value(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? '').trim().toLowerCase());
}

function artifactOf(value) {
  if (!value) return null;
  if (value.document && typeof value.document === 'object') {
    return { document: value.document, artifactSha256: value.artifactSha256 ?? null };
  }
  return { document: value, artifactSha256: null };
}

function validateCandidateParity(artifact) {
  const doc = artifact?.document;
  return sha256Value(artifact?.artifactSha256)
    && doc?.schema === 'AivKernelCandidateParity.v1'
    && doc.methodId === 'VIB.AIV.ACOUSTIC'
    && doc.status === 'CANDIDATE_PARITY_PASS'
    && doc.counts?.total === 8
    && doc.counts?.passed === 8
    && doc.counts?.failed === 0
    && Array.isArray(doc.candidateStatus?.implementedStages)
    && doc.candidateStatus.implementedStages.length === 7
    && doc.authority?.productionEquationAuthorized === false
    && doc.authority?.screeningAuthority === 'NOT_AUTHORIZED'
    && doc.authority?.designAuthority === false;
}

function validateCompleteProductPath(artifact) {
  const doc = artifact?.document;
  return sha256Value(artifact?.artifactSha256)
    && doc?.schema === 'AivProductPathBenchmarkParityReceipt.v1'
    && doc.methodId === 'VIB.AIV.ACOUSTIC'
    && doc.status === 'PASS'
    && doc.releaseTarget === 'BENCHMARK_ONLY'
    && doc.completeKernelStageCount === 10
    && doc.resultContractsValidated === true
    && doc.sourceAssessmentLineScopesValidated === true
    && doc.authorityTransitionApplied === false
    && doc.screeningAuthority === 'NOT_AUTHORIZED'
    && doc.designAuthority === false;
}

function stageRows(candidateParityValid, stage8Ready, postReady, completeProductPathValid) {
  return ALL_STAGES.map((stageId, index) => {
    let status = 'PENDING';
    let basis = null;
    if (index < 7 && candidateParityValid) {
      status = 'QUALIFICATION_PARITY_PASS';
      basis = 'AivKernelCandidateParity.v1';
    } else if (index === 7 && stage8Ready) {
      status = 'READY_FOR_CANDIDATE_IMPLEMENTATION';
      basis = 'AivDiscontinuityStage8EvidenceGate.v2';
    } else if (index >= 8 && postReady) {
      status = 'READY_FOR_CANDIDATE_IMPLEMENTATION';
      basis = 'AivPostDiscontinuityEvidenceGate.v2';
    }
    if (completeProductPathValid) {
      status = 'PRODUCT_PATH_PARITY_PASS';
      basis = 'AivProductPathBenchmarkParityReceipt.v1';
    }
    return { sequence: index + 1, stageId, status, basis };
  });
}

export function buildAivBenchmarkKernelQualification({
  candidateParity: candidateParityInput = null,
  productPathBenchmarkParity: productPathInput = null,
  assumptionProfile = AIV_DEFAULT_ASSUMPTION_PROFILE,
} = {}) {
  const candidateParity = artifactOf(candidateParityInput);
  const productPath = artifactOf(productPathInput);
  const candidateParityValid = validateCandidateParity(candidateParity);
  const stage8Gate = buildAivDiscontinuityStage8EvidenceGate({ assumptionProfile });
  const postGate = buildAivPostDiscontinuityEvidenceGate({ assumptionProfile });
  const stage8Ready = stage8Gate.readyForCandidateImplementation === true;
  const postReady = postGate.readyForCandidateImplementation === true;
  const productPathValid = productPath ? validateCompleteProductPath(productPath) : false;
  const invalidEvidence = Boolean(candidateParityInput && !candidateParityValid)
    || Boolean(productPathInput && !productPathValid)
    || !stage8Ready
    || !postReady;

  let status = AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.NOT_READY;
  if (invalidEvidence) status = AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.INVALID_EVIDENCE;
  else if (candidateParityValid && productPathValid) status = AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.PASS;
  else if (candidateParityValid && stage8Ready && postReady) {
    status = AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.READY_FOR_STAGES_8_TO_10_IMPLEMENTATION;
  }

  const stages = stageRows(candidateParityValid, stage8Ready, postReady, productPathValid);
  return deepFreeze({
    schema: AIV_BENCHMARK_KERNEL_QUALIFICATION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    releaseTarget: 'BENCHMARK_ONLY',
    status,
    humanEvidenceRequired: false,
    releaseGateSatisfied: status === AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.PASS,
    evidence: {
      candidateParity: candidateParity ? {
        status: candidateParityValid ? 'SATISFIED' : 'INVALID_EVIDENCE',
        artifactSha256: candidateParity.artifactSha256,
        observedSchema: candidateParity.document?.schema ?? null,
      } : { status: 'PENDING', artifactSha256: null, observedSchema: null },
      assumptionProfile: {
        status: stage8Ready && postReady ? 'SATISFIED' : 'INVALID_EVIDENCE',
        schema: assumptionProfile?.schema ?? null,
        stage8Status: stage8Gate.status,
        postDiscontinuityStatus: postGate.status,
      },
      productPathBenchmarkParity: productPath ? {
        status: productPathValid ? 'SATISFIED' : 'INVALID_EVIDENCE',
        artifactSha256: productPath.artifactSha256,
        observedSchema: productPath.document?.schema ?? null,
      } : { status: 'PENDING', artifactSha256: null, observedSchema: null },
    },
    stages,
    counts: {
      totalStages: stages.length,
      productPathQualifiedStages: stages.filter((row) => row.status === 'PRODUCT_PATH_PARITY_PASS').length,
      candidateParityStages: stages.filter((row) => row.status === 'QUALIFICATION_PARITY_PASS').length,
      readyForImplementationStages: stages.filter((row) => row.status === 'READY_FOR_CANDIDATE_IMPLEMENTATION').length,
      pendingStages: stages.filter((row) => row.status === 'PENDING').length,
    },
    configuredAssumptions: {
      stage8: stage8Gate.configuredBenchmarkModel,
      postDiscontinuity: stage8Ready ? postGate.scopeBoundary : null,
    },
    authority: {
      authorityTransitionApplied: false,
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      engineeringAuthority: 'NONE',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    nextAction: status === AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.PASS
      ? 'USE_AS_BENCHMARK_RELEASE_EVIDENCE_ONLY'
      : status === AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.READY_FOR_STAGES_8_TO_10_IMPLEMENTATION
        ? 'IMPLEMENT_STAGES_8_TO_10_FROM_CONFIGURED_BENCHMARK_ASSUMPTIONS_AND_QUALIFY_PRODUCT_PATH'
        : candidateParityInput ? 'REPAIR_INVALID_MACHINE_OR_ASSUMPTION_EVIDENCE' : 'PRODUCE_CANDIDATE_STAGES_1_TO_7_PARITY_ARTIFACT',
    notes: [
      'Human review artifacts are not prerequisites.',
      'Missing engineering inputs are resolved by the user-configurable AIV assumption profile and must remain visible/exported.',
      'A complete AivProductPathBenchmarkParityReceipt.v1 is still required before BENCHMARK_ONLY kernel qualification can PASS.',
      'This qualification object never registers the kernel, enables UI execution, or changes engineering authority.',
    ],
  });
}
