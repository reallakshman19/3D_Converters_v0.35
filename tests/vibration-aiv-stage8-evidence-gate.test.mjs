import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  updateAivAssumptionProfile,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';
import {
  AIV_STAGE8_GATE_STATUS,
  buildAivDiscontinuityStage8EvidenceGate,
} from '../converters/vibration/aiv/aiv-stage8-evidence-gate.js';

test('default configurable benchmark assumptions make stage 8 implementable without human evidence', () => {
  const gate = buildAivDiscontinuityStage8EvidenceGate();
  assert.equal(gate.status, AIV_STAGE8_GATE_STATUS.READY_FOR_CANDIDATE_IMPLEMENTATION);
  assert.equal(gate.readyForCandidateImplementation, true);
  assert.equal(gate.humanEvidenceRequired, false);
  assert.equal(gate.configuredBenchmarkModel.A, 0.93989);
  assert.equal(gate.configuredBenchmarkModel.S, 68.229);
  assert.equal(gate.configuredBenchmarkModel.B, 152.207);
  assert.equal(gate.configuredBenchmarkModel.flm1, 1.2133);
  assert.equal(gate.configuredBenchmarkModel.flm2, 0.2009);
  assert.equal(gate.configuredBenchmarkModel.lossFactor, 0.31);
  assert.equal(gate.authority.productionEquationAuthorized, false);
});

test('user can switch FLM1 assumption from published to recalculated value', () => {
  const profile = updateAivAssumptionProfile(AIV_DEFAULT_ASSUMPTION_PROFILE, 'benchmark.flm1Mode', 'RECALCULATED');
  const gate = buildAivDiscontinuityStage8EvidenceGate({ assumptionProfile: profile });
  assert.equal(gate.status, AIV_STAGE8_GATE_STATUS.READY_FOR_CANDIDATE_IMPLEMENTATION);
  assert.equal(gate.configuredBenchmarkModel.flm1Mode, 'RECALCULATED');
  assert.equal(gate.configuredBenchmarkModel.flm1, 1.2109758194311824);
});

test('invalid assumption profile blocks stage 8 rather than requesting human review', () => {
  const profile = updateAivAssumptionProfile(AIV_DEFAULT_ASSUMPTION_PROFILE, 'benchmark.publishedB', 'invalid');
  const gate = buildAivDiscontinuityStage8EvidenceGate({ assumptionProfile: profile });
  assert.equal(gate.status, AIV_STAGE8_GATE_STATUS.BLOCKED_INVALID_ASSUMPTION_PROFILE);
  assert.equal(gate.readyForCandidateImplementation, false);
  assert.equal(gate.humanEvidenceRequired, false);
});

test('stage 8 remains benchmark-only and does not claim screening/design authority', () => {
  const gate = buildAivDiscontinuityStage8EvidenceGate();
  assert.equal(gate.implementationBoundary.benchmarkOnlyParameterization, true);
  assert.equal(gate.implementationBoundary.assumptionsAreUserConfigurable, true);
  assert.equal(gate.implementationBoundary.hiddenDefaultsForbidden, true);
  assert.equal(gate.implementationBoundary.genericScreeningEquationAuthorityClaimed, false);
  assert.equal(gate.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(gate.authority.designAuthority, false);
});
