import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  resolveStandaloneWeightReviewRating,
  standaloneWeightReviewRatingInfo,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-weight-rating-authority.js';

test('manual override remains authoritative', () => {
  const result = resolveStandaloneWeightReviewRating(
    { branchName: '/A/B1', rating: '900', dtxr: 'FLANGE 150#' },
    { overrides: { rating: { '/A/B1': '600' } } },
  );
  assert.equal(result.rating, '600');
  assert.equal(result.resolvedSource, 'override');
  assert.equal(result.conflict, true);
});

test('resolved Preview rating is used without re-derivation', () => {
  const result = resolveStandaloneWeightReviewRating(
    { branchName: '/A/B1', rating: '900', dtxr: 'FLANGE 150#' },
    {},
  );
  assert.equal(result.rating, '900');
  assert.equal(result.resolvedSource, 'resolved-preview');
  assert.equal(result.dtxrRating, '150');
});

test('DTXR-only evidence does not populate normal run-review Rating', () => {
  const result = resolveStandaloneWeightReviewRating(
    { branchName: '/A/B1', dtxr: 'BALL VALVE 900#' },
    {},
  );
  assert.equal(result.rating, '');
  assert.equal(result.dtxrRating, '900');
  assert.equal(result.needsReview, true);
});

test('configured default Rating is ignored', () => {
  const result = resolveStandaloneWeightReviewRating(
    { branchName: '/A/B1', dtxr: '' },
    { rating: { defaultRating: '150' }, defaultRating: '300' },
  );
  assert.equal(result.rating, '');
  assert.equal(result.resolvedSource, 'none');
});

test('explicit and raw DTXR disagreement is exposed', () => {
  const result = resolveStandaloneWeightReviewRating(
    { rating: '900', dtxrRating: '600', dtxr: 'FLANGE 900#' },
    {},
  );
  assert.deepEqual(result.dtxrRatings.sort(), ['600', '900']);
  assert.equal(result.conflict, true);
});

test('display evidence never substitutes DTXR for missing shown Rating', () => {
  const info = standaloneWeightReviewRatingInfo({ rating: '', dtxr: 'VALVE 900#' });
  assert.equal(info.shownRating, '');
  assert.equal(info.dtxrRating, '900');
  assert.equal(info.missingWithDtxr, true);
});

test('run review delegates normalization without restoring DTXR/default fallback', async () => {
  const source = await readFile(
    new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /resolveStandaloneWeightReviewRating/);
  assert.match(source, /standaloneWeightReviewRatingInfo/);
  assert.match(source, /standaloneRunReviewRatingFromConfig/);
  assert.match(source, /DTXR Rating is comparison evidence only/);
  assert.doesNotMatch(source, /function normalizeRatingText/);
  assert.doesNotMatch(source, /extractXmlCiiRatingFromDtxr/);
  assert.doesNotMatch(source, /defaultRating/);
});
