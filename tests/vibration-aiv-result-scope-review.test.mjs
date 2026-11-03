import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIV_WORKED_EXAMPLE_RESULT_SCOPE_REVIEW_SCHEMA,
  assertAivWorkedExampleResultScopeReviewComplete,
  createAivWorkedExampleResultScopeReviewTemplate,
} from '../scripts/verify-aiv-worked-example-result-scope.mjs';

function completedReview() {
  const review = createAivWorkedExampleResultScopeReviewTemplate();
  review.review = {
    state: 'REVIEWED',
    reviewerType: 'HUMAN_ENGINEER',
    reviewer: 'Qualification Engineer',
    reviewDate: '2026-08-12',
    sourceResultDisposition: 'RAW_EFFECTIVE_SOURCE_PWL_BELONG_TO_SOURCE_RESULT',
    assessmentResultDisposition: 'FIRST_DISCONTINUITY_POINT_PWL_AND_LOF_BELONG_TO_ASSESSMENT_RESULT',
    lineCaseSummaryDisposition: 'DERIVED_REPORT_LINE_LOF_BELONGS_TO_LINE_CASE_SUMMARY',
    lineAggregationDisposition: 'NOT_DERIVED_FROM_SINGLE_FIRST_DISCONTINUITY_RESULT',
    implementationDisposition: 'KEEP_SOURCE_ASSESSMENT_AND_LINE_SCOPES_SEPARATE',
    rationale: 'The controlled worked-example report and the D.2.3 first-discontinuity chain are different result scopes.',
    implementationNote: 'Keep Source, Assessment and Line/Case result contracts distinct.',
  };
  return review;
}

test('result-scope template binds controlled Markdown line result and D.2.3 assessment result without authority', () => {
  const template = createAivWorkedExampleResultScopeReviewTemplate();
  assert.equal(template.schema, AIV_WORKED_EXAMPLE_RESULT_SCOPE_REVIEW_SCHEMA);
  assert.equal(template.review.state, 'PENDING');
  assert.equal(template.evidence.readableSource.gitBlob, '9f22d92eba8bdf3b67adc25a4c77a7f7d7211da8');
  assert.equal(template.evidence.reliefDownstreamLineReport.reportedPwlDb, 164.69);
  assert.equal(template.evidence.reliefDownstreamLineReport.reportedLof, 1.48);
  assert.equal(template.evidence.reliefDownstreamLineReport.proposedResultScope, 'LINE_CASE_SUMMARY');
  assert.equal(template.evidence.d23FirstDiscontinuity.assessmentPwlDb, 164.4);
  assert.equal(template.evidence.d23FirstDiscontinuity.reportedLof, 0.29);
  assert.equal(template.evidence.d23FirstDiscontinuity.proposedResultScope, 'ASSESSMENT');
  assert.equal(template.authority.productionEquationAuthorized, false);
  assert.equal(template.authority.lineAggregationImplementationAuthorized, false);
});

test('named human result-scope review can close interpretation gate without authorizing aggregation or equations', () => {
  const verification = assertAivWorkedExampleResultScopeReviewComplete(completedReview());
  assert.equal(verification.schema, 'AivWorkedExampleResultScopeReviewVerification.v1');
  assert.equal(verification.reviewComplete, true);
  assert.equal(verification.scopeSeparationAccepted, true);
  assert.equal(verification.productionEquationAuthorized, false);
  assert.equal(verification.lineAggregationImplementationAuthorized, false);
});

test('AI/non-human reviewer cannot close the worked-example result-scope gate', () => {
  const review = completedReview();
  review.review.reviewerType = 'AI';
  assert.throws(
    () => assertAivWorkedExampleResultScopeReviewComplete(review),
    (error) => error?.code === 'AIV_RESULT_SCOPE_HUMAN_REVIEW_REQUIRED',
  );
});

test('tampered result-scope evidence fails closed', () => {
  const review = completedReview();
  review.evidence.reliefDownstreamLineReport.reportedLof = 0.29;
  assert.throws(
    () => assertAivWorkedExampleResultScopeReviewComplete(review),
    (error) => error?.code === 'AIV_RESULT_SCOPE_REVIEW_EVIDENCE_MISMATCH',
  );
});

test('human review cannot collapse line summary into first-discontinuity assessment semantics', () => {
  const review = completedReview();
  review.review.lineAggregationDisposition = 'FIRST_DISCONTINUITY_CONTROLS_LINE';
  assert.throws(
    () => assertAivWorkedExampleResultScopeReviewComplete(review),
    (error) => error?.code === 'AIV_RESULT_SCOPE_AGGREGATION_DISPOSITION_REQUIRED',
  );
});
