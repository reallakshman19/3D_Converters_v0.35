import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_INDEPENDENT_BENCHMARK_REVIEW_SCHEMA,
  assertAivIndependentBenchmarkReviewComplete,
  createAivIndependentBenchmarkReviewTemplate,
} from '../scripts/verify-aiv-independent-benchmarks.mjs';

const ROOT = new URL('../', import.meta.url);

function completed() {
  const review = createAivIndependentBenchmarkReviewTemplate();
  review.records = review.records.map((record, index) => ({
    ...record,
    traceTranscriptionSha256: Object.fromEntries(record.requiredTraceIds.map((traceId, traceIndex) => [
      traceId,
      `sha256:${(index + traceIndex + 10).toString(16).padStart(2, '0').repeat(32)}`,
    ])),
    reviewState: 'REVIEWED',
    reviewerType: 'HUMAN_ENGINEER',
    reviewer: 'Independent vibration engineer',
    reviewDate: '2026-08-12',
    independentCalculationSha256: `sha256:${(index + 20).toString(16).padStart(2, '0').repeat(32)}`,
    disposition: 'ACCEPTED_AS_INDEPENDENT_ANALYTICAL_BENCHMARK',
    toleranceDisposition: 'BENCHMARK_TOLERANCE_ACCEPTED_QUALIFICATION_ONLY',
    rationale: 'Independent calculation reproduced the analytical vector from the reviewed T2.7 transcription.',
    implementationNote: 'Use as qualification regression evidence only; do not treat this review as production authority.',
  }));
  return review;
}

test('review template covers sonic and two multi-source analytical vectors without auto-acceptance', () => {
  const template = createAivIndependentBenchmarkReviewTemplate();
  assert.equal(template.schema, AIV_INDEPENDENT_BENCHMARK_REVIEW_SCHEMA);
  assert.deepEqual(template.records.map((record) => record.benchmarkId), [
    'AIV-HAND-SONIC-SFF6-001',
    'AIV-HAND-MULTI-SOURCE-EQUAL-001',
    'AIV-HAND-MULTI-SOURCE-ASYM-001',
  ]);
  assert(template.records.every((record) => record.reviewState === 'PENDING'));
  assert.equal(template.authority.productionEquationAuthorized, false);
});

test('complete named human acceptance closes sonic and multi-source benchmark gates only', () => {
  const result = assertAivIndependentBenchmarkReviewComplete(completed());
  assert.equal(result.reviewComplete, true);
  assert.equal(result.acceptedBenchmarkCount, 3);
  assert.equal(result.sonicSff6BenchmarkAccepted, true);
  assert.equal(result.multiSourceBenchmarksAccepted, true);
  assert.equal(result.productionEquationAuthorized, false);
  assert(!result.remainingPromotionGates.includes('INDEPENDENT_SONIC_SFF6_BENCHMARK'));
  assert(!result.remainingPromotionGates.includes('INDEPENDENT_MULTI_SOURCE_BENCHMARK'));
  assert(result.remainingPromotionGates.includes('CONTROLLED_T2_7_HUMAN_RECONCILIATION'));
});

test('review cannot accept a vector without reviewed EI trace transcription hashes', () => {
  const review = completed();
  review.records[0].traceTranscriptionSha256['AIV-CONST-SFF-001'] = null;
  assert.throws(
    () => assertAivIndependentBenchmarkReviewComplete(review),
    /AIV_INDEPENDENT_BENCHMARK_TRACE_REVIEW_REQUIRED/u,
  );
});

test('AI-only review cannot close benchmark gaps', () => {
  const review = completed();
  review.records[0].reviewerType = 'AI_ASSISTED';
  assert.throws(
    () => assertAivIndependentBenchmarkReviewComplete(review),
    /AIV_INDEPENDENT_BENCHMARK_HUMAN_REVIEW_REQUIRED/u,
  );
});

test('review cannot silently change benchmark evidence or authority', () => {
  const review = completed();
  review.records[1].benchmarkSha256 = 'sha256:' + '0'.repeat(64);
  assert.throws(
    () => assertAivIndependentBenchmarkReviewComplete(review),
    /AIV_INDEPENDENT_BENCHMARK_HASH_MISMATCH/u,
  );
  const authorityReview = completed();
  authorityReview.authority.productionEquationAuthorized = true;
  assert.throws(
    () => assertAivIndependentBenchmarkReviewComplete(authorityReview),
    /AIV_INDEPENDENT_BENCHMARK_AUTHORITY_INVALID/u,
  );
});

test('package exposes independent benchmark review command', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('package.json', ROOT), 'utf8'));
  assert.equal(pkg.scripts['verify:aiv-independent-benchmarks'], 'node scripts/verify-aiv-independent-benchmarks.mjs');
});
