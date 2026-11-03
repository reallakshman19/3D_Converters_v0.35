import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectXmlCiiDtxrRatingEvidence,
  extractXmlCiiRatingFromDtxr,
  resolveXmlCiiRatingAuthority,
} from '../converters/xml-cii2019-core/dtxr-rating-resolver.js';

test('extracts explicit DTXR rating forms only', () => {
  assert.equal(extractXmlCiiRatingFromDtxr('WELDING NECK FLANGE SCH 80 300#'), '300');
  assert.equal(extractXmlCiiRatingFromDtxr('VALVE CLASS 900 RF'), '900');
  assert.equal(extractXmlCiiRatingFromDtxr('FLANGE CL150'), '150');
  assert.equal(extractXmlCiiRatingFromDtxr('PIPE SCH 80 WTH 15.09'), '');
});

test('normal authority does not auto-populate Rating from DTXR', () => {
  const result = resolveXmlCiiRatingAuthority({ dtxrValues: ['FLANGE 900#'] });
  assert.equal(result.rating, '');
  assert.equal(result.source, 'none');
  assert.equal(result.dtxrRating, '900');
  assert.equal(result.needsReview, true);
});

test('explicit compatibility flag may consume unambiguous DTXR evidence', () => {
  const result = resolveXmlCiiRatingAuthority({ dtxrValues: ['FLANGE 900#'], allowDtxrFallback: true });
  assert.equal(result.rating, '900');
  assert.equal(result.source, 'dtxr-rating');
});

test('piping class rating remains authoritative over DTXR evidence', () => {
  const result = resolveXmlCiiRatingAuthority({ pipingClassRating: '900', dtxrValues: ['FLANGE 150#'] });
  assert.equal(result.rating, '900');
  assert.equal(result.source, 'piping-class-master');
  assert.equal(result.dtxrConflict, true);
  assert.equal(result.conflict, false);
});

test('conflicting DTXR ratings remain evidence-only in normal execution', () => {
  const evidence = collectXmlCiiDtxrRatingEvidence(['FLANGE 150#', 'VALVE CLASS 900']);
  assert.deepEqual(evidence.ratings, ['150', '900']);
  const result = resolveXmlCiiRatingAuthority({ dtxrValues: evidence.evidence });
  assert.equal(result.rating, '');
  assert.equal(result.dtxrConflict, true);
  assert.equal(result.conflict, false);
});
