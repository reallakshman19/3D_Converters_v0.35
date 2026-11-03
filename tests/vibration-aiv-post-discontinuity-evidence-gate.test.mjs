import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  updateAivAssumptionProfile,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';
import {
  AIV_POST_DISCONTINUITY_GATE_STATUS,
  buildAivPostDiscontinuityEvidenceGate,
} from '../converters/vibration/aiv/aiv-post-discontinuity-evidence-gate.js';

test('default benchmark assumptions make stages 9 and 10 implementable without human evidence', () => {
  const gate = buildAivPostDiscontinuityEvidenceGate();
  assert.equal(gate.status, AIV_POST_DISCONTINUITY_GATE_STATUS.READY_FOR_POST_DISCONTINUITY_CANDIDATE_IMPLEMENTATION);
  assert.equal(gate.readyForCandidateImplementation, true);
  assert.equal(gate.humanEvidenceRequired, false);
  assert.equal(gate.scopeBoundary.lineAggregationMode, 'SEPARATE_RESULT_SCOPES');
  assert.equal(gate.scopeBoundary.assessmentMode, 'BENCHMARK_COMPARE_ONLY');
});

test('scope boundary keeps D.2.3 first-discontinuity and line-level LOF separate', () => {
  const gate = buildAivPostDiscontinuityEvidenceGate();
  assert.equal(gate.scopeBoundary.firstDiscontinuityScope, 'ASSESSMENT');
  assert.equal(gate.scopeBoundary.derivedReportScope, 'LINE_CASE_SUMMARY');
  assert.equal(gate.scopeBoundary.d23FirstDiscontinuityLof, 0.29);
  assert.equal(gate.scopeBoundary.workedExampleReliefLineLof, 1.48);
  assert.equal(gate.scopeBoundary.valuesAreNotInterchangeable, true);
  assert.equal(gate.scopeBoundary.aggregationMustNotBeInferredFromSingleFirstDiscontinuity, true);
});

test('invalid result-scope configuration blocks stages 9 and 10 without requesting human review', () => {
  const profile = updateAivAssumptionProfile(AIV_DEFAULT_ASSUMPTION_PROFILE, 'benchmark.lineAggregationMode', 'INVALID');
  const gate = buildAivPostDiscontinuityEvidenceGate({ assumptionProfile: profile });
  assert.equal(gate.status, AIV_POST_DISCONTINUITY_GATE_STATUS.BLOCKED_INVALID_ASSUMPTION_PROFILE);
  assert.equal(gate.readyForCandidateImplementation, false);
  assert.equal(gate.humanEvidenceRequired, false);
});

test('assessment remains benchmark-comparison only with no screening/design authority', () => {
  const gate = buildAivPostDiscontinuityEvidenceGate();
  assert.equal(gate.assessmentBoundary.benchmarkComparisonOnly, true);
  assert.equal(gate.assessmentBoundary.assumptionsAreUserConfigurable, true);
  assert.equal(gate.assessmentBoundary.genericScreeningAuthorityClaimed, false);
  assert.equal(gate.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(gate.authority.designAuthority, false);
});
