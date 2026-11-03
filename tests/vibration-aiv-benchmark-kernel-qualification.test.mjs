import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  updateAivAssumptionProfile,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';
import {
  AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS,
  buildAivBenchmarkKernelQualification,
} from '../converters/vibration/aiv/aiv-benchmark-kernel-qualification.js';

const SHA = `sha256:${'d'.repeat(64)}`;
function wrapped(document) { return { document, artifactSha256: SHA }; }

function candidateParity() {
  return wrapped({
    schema: 'AivKernelCandidateParity.v1', methodId: 'VIB.AIV.ACOUSTIC', status: 'CANDIDATE_PARITY_PASS',
    counts: { total: 8, passed: 8, failed: 0 },
    candidateStatus: { implementedStages: Array.from({ length: 7 }, (_, i) => `STAGE-${i + 1}`) },
    authority: { productionEquationAuthorized: false, screeningAuthority: 'NOT_AUTHORIZED', designAuthority: false },
  });
}

function completeProductPath() {
  return wrapped({
    schema: 'AivProductPathBenchmarkParityReceipt.v1', methodId: 'VIB.AIV.ACOUSTIC',
    releaseTarget: 'BENCHMARK_ONLY', status: 'PASS', completeKernelStageCount: 10,
    resultContractsValidated: true, sourceAssessmentLineScopesValidated: true,
    authorityTransitionApplied: false, screeningAuthority: 'NOT_AUTHORIZED', designAuthority: false,
  });
}

test('without candidate parity the kernel qualification is not ready even though assumptions are valid', () => {
  const result = buildAivBenchmarkKernelQualification();
  assert.equal(result.status, AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.NOT_READY);
  assert.equal(result.humanEvidenceRequired, false);
  assert.equal(result.evidence.assumptionProfile.status, 'SATISFIED');
  assert.equal(result.releaseGateSatisfied, false);
});

test('candidate stages 1 through 7 plus valid assumptions make stages 8 through 10 immediately implementable', () => {
  const result = buildAivBenchmarkKernelQualification({ candidateParity: candidateParity() });
  assert.equal(result.status, AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.READY_FOR_STAGES_8_TO_10_IMPLEMENTATION);
  assert.equal(result.counts.candidateParityStages, 7);
  assert.equal(result.counts.readyForImplementationStages, 3);
  assert.equal(result.counts.pendingStages, 0);
  assert.equal(result.releaseGateSatisfied, false);
  assert.equal(result.humanEvidenceRequired, false);
});

test('invalid user assumptions fail closed without creating a human-review requirement', () => {
  const invalidProfile = updateAivAssumptionProfile(AIV_DEFAULT_ASSUMPTION_PROFILE, 'benchmark.publishedA', 'not-a-number');
  const result = buildAivBenchmarkKernelQualification({
    candidateParity: candidateParity(),
    assumptionProfile: invalidProfile,
  });
  assert.equal(result.status, AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.INVALID_EVIDENCE);
  assert.equal(result.evidence.assumptionProfile.status, 'INVALID_EVIDENCE');
  assert.equal(result.humanEvidenceRequired, false);
});

test('only complete 10-stage product-path benchmark parity can satisfy the kernel release gate', () => {
  const result = buildAivBenchmarkKernelQualification({
    candidateParity: candidateParity(),
    productPathBenchmarkParity: completeProductPath(),
  });
  assert.equal(result.status, AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.PASS);
  assert.equal(result.releaseGateSatisfied, true);
  assert.equal(result.counts.productPathQualifiedStages, 10);
  assert.equal(result.authority.authorityTransitionApplied, false);
  assert.equal(result.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(result.authority.designAuthority, false);
});

test('unhashed candidate parity remains invalid release evidence', () => {
  const result = buildAivBenchmarkKernelQualification({ candidateParity: candidateParity().document });
  assert.equal(result.status, AIV_BENCHMARK_KERNEL_QUALIFICATION_STATUS.INVALID_EVIDENCE);
  assert.equal(result.releaseGateSatisfied, false);
});
