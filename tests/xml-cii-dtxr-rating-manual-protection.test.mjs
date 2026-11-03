import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPreviewDtxrRatingOverrides } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-rating-fetch.js';

test('manual edit of a fetched Rating survives later DTXR refresh', () => {
  const config = {
    overrides: {
      rating: { '/A/B1': '600' },
      __dtxrRatingKeys: { '/A/B1': true },
      __previewFillDown: {
        rating: { '/A/B1': { fillState: 'manual', fillSource: null } },
      },
      processData: {},
    },
  };
  const result = applyPreviewDtxrRatingOverrides(config, [
    { branchName: '/A/B1', ratingDtxr: '900', ratingDtxrRatings: ['900'] },
  ]);
  assert.equal(result.manualProtected, 1);
  assert.equal(result.applied, 0);
  assert.equal(config.overrides.rating['/A/B1'], '600');
  assert.equal(config.overrides.__dtxrRatingKeys['/A/B1'], undefined);
});
