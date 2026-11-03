import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIV_PROMOTION_GATE_STATUS,
  AIV_PROMOTION_READINESS_SCHEMA,
  buildAivQualificationPromotionReadiness,
} from '../converters/vibration/aiv/aiv-promotion-readiness.js';

const HASH = `sha256:${'a'.repeat(64)}`;

function evidence(verification) {
  return { artifactSha256: HASH, verification };
}

function fullEvidence() {
  return {
    t27Reconciliation: evidence({
      schema: 'AivT27ReconciliationVerification.v1', methodId: 'VIB.AIV.ACOUSTIC',
      reconciliationComplete: true, reviewedTraceCount: 9, productionEquationAuthorized: false,
    }),
    d23Flm1Reconciliation: evidence({
      schema: 'AivD23Flm1ReconciliationVerification.v1', methodId: 'VIB.AIV.ACOUSTIC',
      reconciliationComplete: true, benchmarkExpectedFlm1: 1.2133, benchmarkToleranceAbs: 0.003,
      productionEquationAuthorized: false,
    }),
    workedExampleResultScope: evidence({
      schema: 'AivWorkedExampleResultScopeReviewVerification.v1', methodId: 'VIB.AIV.ACOUSTIC',
      reviewComplete: true, scopeSeparationAccepted: true,
      lineAggregationImplementationAuthorized: false, productionEquationAuthorized: false,
    }),
    independentBenchmarks: evidence({
      schema: 'AivIndependentBenchmarkReviewVerification.v1', methodId: 'VIB.AIV.ACOUSTIC',
      reviewComplete: true, sonicSff6BenchmarkAccepted: true, multiSourceBenchmarksAccepted: true,
      productionEquationAuthorized: false,
    }),
    workbookReconciliation: evidence({
      schema: 'AivWorkbookReconciliationVerification.v1', methodId: 'VIB.AIV.ACOUSTIC',
      reconciliationComplete: true, workbookFormulasRemainMigrationEvidenceOnly: true,
      productionEquationAuthorized: false,
    }),
  };
}

test('empty promotion input reports all prerequisites incomplete and authority remains blocked', () => {
  const plan = buildAivQualificationPromotionReadiness({});
  assert.equal(plan.schema, AIV_PROMOTION_READINESS_SCHEMA);
  assert.equal(plan.status, 'PROMOTION_PREREQUISITES_INCOMPLETE');
  assert.equal(plan.counts.prerequisiteGates, 6);
  assert.equal(plan.counts.satisfied, 0);
  assert.equal(plan.counts.unsatisfied, 6);
  assert.equal(plan.eligibleForAuthorityReview, false);
  assert.equal(plan.authorityPromotionAuthorized, false);
  assert.equal(plan.authority.productionEquationAuthorized, false);
  assert.equal(plan.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(plan.authority.designAuthority, false);
});

test('all prerequisite verification artifacts only make method eligible for independent authority review', () => {
  const plan = buildAivQualificationPromotionReadiness(fullEvidence());
  assert.equal(plan.status, 'READY_FOR_INDEPENDENT_AUTHORITY_REVIEW');
  assert.equal(plan.counts.satisfied, 6);
  assert.equal(plan.counts.unsatisfied, 0);
  assert.equal(plan.counts.invalidEvidence, 0);
  assert.equal(plan.eligibleForAuthorityReview, true);
  assert.equal(plan.authorityPromotionAuthorized, false);
  const finalGate = plan.gates.find((gate) => gate.gateId === 'INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW');
  assert.equal(finalGate.status, AIV_PROMOTION_GATE_STATUS.UNSATISFIED);
  assert.equal(finalGate.finalHumanAuthorityGate, true);
});

test('bare booleans are invalid evidence rather than satisfied promotion gates', () => {
  const input = fullEvidence();
  input.t27Reconciliation = true;
  const plan = buildAivQualificationPromotionReadiness(input);
  const gate = plan.gates.find((item) => item.gateId === 'CONTROLLED_T2_7_HUMAN_RECONCILIATION');
  assert.equal(gate.status, AIV_PROMOTION_GATE_STATUS.INVALID_EVIDENCE);
  assert.equal(plan.eligibleForAuthorityReview, false);
  assert.equal(plan.status, 'INVALID_EVIDENCE');
});

test('verification artifacts require explicit SHA-256 identity', () => {
  const input = fullEvidence();
  input.workbookReconciliation = { verification: input.workbookReconciliation.verification };
  const plan = buildAivQualificationPromotionReadiness(input);
  const gate = plan.gates.find((item) => item.gateId === 'RETAINED_WORKBOOK_RECONCILIATION');
  assert.equal(gate.status, AIV_PROMOTION_GATE_STATUS.INVALID_EVIDENCE);
  assert.equal(gate.issue.code, 'AIV_PROMOTION_EVIDENCE_HASH_REQUIRED');
});

test('authority-tainted verification artifact is invalid even if completion flags are true', () => {
  const input = fullEvidence();
  input.independentBenchmarks = evidence({
    ...input.independentBenchmarks.verification,
    productionEquationAuthorized: true,
  });
  const plan = buildAivQualificationPromotionReadiness(input);
  const sonic = plan.gates.find((item) => item.gateId === 'INDEPENDENT_SONIC_SFF6_BENCHMARK');
  const multi = plan.gates.find((item) => item.gateId === 'INDEPENDENT_MULTI_SOURCE_BENCHMARK');
  assert.equal(sonic.status, AIV_PROMOTION_GATE_STATUS.INVALID_EVIDENCE);
  assert.equal(multi.status, AIV_PROMOTION_GATE_STATUS.INVALID_EVIDENCE);
  assert.equal(plan.authorityPromotionAuthorized, false);
});

test('one shared benchmark review artifact independently closes sonic and multi-source prerequisites', () => {
  const plan = buildAivQualificationPromotionReadiness(fullEvidence());
  const sonic = plan.gates.find((item) => item.gateId === 'INDEPENDENT_SONIC_SFF6_BENCHMARK');
  const multi = plan.gates.find((item) => item.gateId === 'INDEPENDENT_MULTI_SOURCE_BENCHMARK');
  assert.equal(sonic.status, AIV_PROMOTION_GATE_STATUS.SATISFIED);
  assert.equal(multi.status, AIV_PROMOTION_GATE_STATUS.SATISFIED);
  assert.equal(sonic.evidenceSha256, HASH);
  assert.equal(multi.evidenceSha256, HASH);
});
