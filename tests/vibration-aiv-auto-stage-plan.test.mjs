import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_DEFAULT_ASSUMPTION_PROFILE,
  updateAivAssumptionProfile,
} from '../converters/vibration/aiv/aiv-assumption-profile.js';
import {
  AIV_AUTO_STAGE_STATUS,
  buildAivAutoStagePlan,
} from '../converters/vibration/aiv/aiv-auto-stage-plan.js';

function productPathPass() {
  return {
    schema: 'AivProductPathBenchmarkParityReceipt.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    status: 'PASS',
  };
}

function exactHeadPass() {
  return {
    schema: 'AivReleaseValidationReceipt.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    status: 'PASS',
  };
}

const unreleased = Object.freeze({ benchmarkOnlyReleased: false, screeningReleased: false });

test('AUTO default state records the completed assessment-level SCREENING release', () => {
  const plan = buildAivAutoStagePlan();
  assert.equal(plan.mode, 'AUTO');
  assert.equal(plan.humanEvidenceRequired, false);
  assert.equal(plan.configuration.status, 'PASS');
  assert.equal(plan.stages.every((stage) => stage.status === AIV_AUTO_STAGE_STATUS.COMPLETE), true);
  assert.equal(plan.nextStageId, null);
  assert.equal(plan.nextAction, null);
  assert.equal(plan.releaseProgramStatus, 'SCREENING_RELEASED');
  assert.equal(plan.authority.currentCalculationState, 'IMPLEMENTED');
  assert.equal(plan.authority.currentQualificationState, 'SCREENING');
  assert.equal(plan.authority.screeningAuthority, 'AUTHORIZED');
  assert.equal(plan.authority.screeningResultScope, 'ASSESSMENT');
  assert.equal(plan.authority.lineCaseSummaryAuthoritativeForScreening, false);
  assert.equal(plan.authority.designAuthority, false);
});

test('invalid assumption configuration remains visible even after release and never creates a human gate', () => {
  const profile = updateAivAssumptionProfile(AIV_DEFAULT_ASSUMPTION_PROFILE, 'benchmark.publishedB', 'invalid');
  const plan = buildAivAutoStagePlan({ assumptionProfile: profile });
  assert.equal(plan.configuration.status, 'INVALID_ASSUMPTION_PROFILE');
  assert.equal(plan.stages.find((stage) => stage.stageId === '16B.2').status, AIV_AUTO_STAGE_STATUS.BLOCKED_INVALID_CONFIGURATION);
  assert.equal(plan.stages.find((stage) => stage.stageId === '16B.3').status, AIV_AUTO_STAGE_STATUS.BLOCKED_BY_PREVIOUS_STAGE);
  assert.equal(plan.stopConditions.includes('HUMAN_REVIEW_REQUIRED'), false);
});

test('stages 8–10 can still be explicitly marked incomplete for regression and rollback checks', () => {
  const plan = buildAivAutoStagePlan({ ...unreleased, stages8To10Implemented: false });
  assert.equal(plan.nextStageId, '16B.3');
  assert.equal(plan.nextAction, 'IMPLEMENT_STAGES_8_TO_10');
});

test('pre-release product-path parity plus wired result/export advances AUTO to exact-head validation', () => {
  const plan = buildAivAutoStagePlan({
    ...unreleased,
    productPathBenchmarkParity: productPathPass(),
  });
  assert.equal(plan.stages.find((stage) => stage.stageId === '17').status, AIV_AUTO_STAGE_STATUS.COMPLETE);
  assert.equal(plan.stages.find((stage) => stage.stageId === '18').status, AIV_AUTO_STAGE_STATUS.COMPLETE);
  assert.equal(plan.nextStageId, '19');
  assert.equal(plan.nextAction, 'RUN_EXACT_HEAD_NODE_AND_BROWSER_VALIDATION');
});

test('pre-release result/export rollback blocks Stage 19', () => {
  const plan = buildAivAutoStagePlan({
    ...unreleased,
    productPathBenchmarkParity: productPathPass(),
    resultExportWired: false,
  });
  assert.equal(plan.stages.find((stage) => stage.stageId === '18').status, AIV_AUTO_STAGE_STATUS.NEXT);
  assert.equal(plan.stages.find((stage) => stage.stageId === '19').status, AIV_AUTO_STAGE_STATUS.BLOCKED_BY_PREVIOUS_STAGE);
  assert.equal(plan.nextStageId, '18');
});

test('pre-release exact-head pass makes BENCHMARK_ONLY transition ready without human recommendation', () => {
  const plan = buildAivAutoStagePlan({
    ...unreleased,
    productPathBenchmarkParity: productPathPass(),
    exactHeadReleaseValidation: exactHeadPass(),
  });
  const release = plan.stages.find((stage) => stage.stageId === '19');
  assert.equal(release.status, AIV_AUTO_STAGE_STATUS.READY);
  assert.equal(release.autoAction, 'APPLY_BENCHMARK_ONLY_AUTHORITY_TRANSITION');
  assert.equal(plan.humanEvidenceRequired, false);
});

test('BENCHMARK_ONLY-only state advances to Stage 20 screening qualification', () => {
  const plan = buildAivAutoStagePlan({ benchmarkOnlyReleased: true, screeningReleased: false });
  assert.equal(plan.stages.find((stage) => stage.stageId === '19').status, AIV_AUTO_STAGE_STATUS.COMPLETE);
  assert.equal(plan.stages.find((stage) => stage.stageId === '20').status, AIV_AUTO_STAGE_STATUS.NEXT);
  assert.equal(plan.nextStageId, '20');
  assert.equal(plan.authority.currentQualificationState, 'BENCHMARK_ONLY');
  assert.equal(plan.authority.screeningAuthority, 'NOT_AUTHORIZED');
});
