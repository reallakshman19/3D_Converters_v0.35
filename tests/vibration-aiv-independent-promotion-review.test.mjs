import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  AIV_INDEPENDENT_PROMOTION_REVIEW_SCHEMA,
  assertAivIndependentPromotionReviewComplete,
  createAivIndependentPromotionReviewTemplate,
} from '../converters/vibration/aiv/aiv-independent-promotion-review.js';
import { buildAivQualificationPromotionReadiness } from '../converters/vibration/aiv/aiv-promotion-readiness.js';
import { buildAivIndependentReviewPackage } from '../tabs/vibration-aiv-independent-review-package.js';

const HASH = `sha256:${'b'.repeat(64)}`;
const PLAN_HASH = `sha256:${'c'.repeat(64)}`;

function evidence(verification) {
  return { artifactSha256: HASH, verification };
}

function readyPlan() {
  return buildAivQualificationPromotionReadiness({
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
  });
}

function completedReview(template) {
  return {
    ...template,
    review: {
      state: 'REVIEWED',
      reviewerType: 'HUMAN_VIBRATION_ENGINEER',
      reviewer: 'Independent Reviewer',
      reviewerOrganization: 'Independent Engineering Organization',
      reviewerRole: 'Vibration Technical Authority',
      reviewDate: '2026-08-12',
      recommendation: 'RECOMMEND_BENCHMARK_ONLY_PROMOTION',
      recommendedAuthorityTarget: 'BENCHMARK_ONLY',
      rationale: 'Prerequisite qualification evidence is complete for a separate BENCHMARK_ONLY authority transition review.',
      conditions: ['No screening or design use.'],
    },
    attestations: {
      independentFromImplementation: true,
      controlledSourceEvidenceReviewed: true,
      qualificationEvidenceReviewed: true,
      benchmarkLimitationsAccepted: true,
      screeningAndDesignRemainUnauthorized: true,
    },
  };
}

test('independent review template cannot be created before prerequisite readiness', () => {
  assert.throws(
    () => createAivIndependentPromotionReviewTemplate(buildAivQualificationPromotionReadiness({}), {
      promotionReadinessArtifactSha256: PLAN_HASH,
    }),
    /AIV_INDEPENDENT_REVIEW_PREREQUISITES_INCOMPLETE/u,
  );
});

test('ready prerequisite plan produces a PENDING SHA-bound human review template', () => {
  const plan = readyPlan();
  const template = createAivIndependentPromotionReviewTemplate(plan, { promotionReadinessArtifactSha256: PLAN_HASH });
  assert.equal(template.schema, AIV_INDEPENDENT_PROMOTION_REVIEW_SCHEMA);
  assert.equal(template.review.state, 'PENDING');
  assert.equal(template.source.promotionReadinessArtifactSha256, PLAN_HASH);
  assert.equal(template.source.prerequisiteEvidence.length, 6);
  assert.equal(template.authority.authorityTransitionApplied, false);
  assert.equal(template.authority.productionEquationAuthorized, false);
  assert.equal(template.authority.screeningAuthority, 'NOT_AUTHORIZED');
});

test('completed independent engineer recommendation still does not mutate authority', () => {
  const plan = readyPlan();
  const template = createAivIndependentPromotionReviewTemplate(plan, { promotionReadinessArtifactSha256: PLAN_HASH });
  const verification = assertAivIndependentPromotionReviewComplete(plan, completedReview(template), {
    promotionReadinessArtifactSha256: PLAN_HASH,
  });
  assert.equal(verification.reviewComplete, true);
  assert.equal(verification.recommendation, 'RECOMMEND_BENCHMARK_ONLY_PROMOTION');
  assert.equal(verification.recommendedAuthorityTarget, 'BENCHMARK_ONLY');
  assert.equal(verification.authorityTransitionApplied, false);
  assert.equal(verification.productionEquationAuthorized, false);
  assert.equal(verification.nextAction, 'SEPARATE_REVIEWED_AUTHORITY_TRANSITION_CHANGE_REQUIRED');
});

test('review artifact that tries to self-apply authority transition fails closed', () => {
  const plan = readyPlan();
  const template = createAivIndependentPromotionReviewTemplate(plan, { promotionReadinessArtifactSha256: PLAN_HASH });
  const review = completedReview(template);
  review.authority = { ...review.authority, authorityTransitionApplied: true, qualificationState: 'BENCHMARK_ONLY' };
  assert.throws(
    () => assertAivIndependentPromotionReviewComplete(plan, review, { promotionReadinessArtifactSha256: PLAN_HASH }),
    /AIV_INDEPENDENT_REVIEW_AUTHORITY_MUTATION_FORBIDDEN/u,
  );
});

test('browser handoff package hashes the exact exported promotion-readiness bytes', async () => {
  const plan = readyPlan();
  const reviewPackage = await buildAivIndependentReviewPackage(plan);
  const expected = `sha256:${createHash('sha256').update(reviewPackage.promotionReadiness.text, 'utf8').digest('hex')}`;
  assert.equal(reviewPackage.promotionReadiness.sha256, expected);
  assert.equal(reviewPackage.authorityTransitionApplied, false);
  const template = JSON.parse(reviewPackage.independentReviewTemplate.text);
  assert.equal(template.source.promotionReadinessArtifactSha256, expected);
  assert.equal(template.review.state, 'PENDING');
});
