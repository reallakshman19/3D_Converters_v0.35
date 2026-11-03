import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPipingClassIndex } from '../converters/xml-cii2019-core/piping-class-resolver.js';
import { resolvePreviewPipingClassRating } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-rating-authority.js';

const config = {
  pipingClass: {
    masterRows: [
      { 'Piping Class': '13421', convertedBore: 100, Rating: '150', 'Wall thickness': '3.048' },
      { 'Piping Class': '93834', convertedBore: 50, Rating: '900', 'Wall thickness': '3.9116' },
      { 'Piping Class': '93834', convertedBore: 100, Rating: '900', 'Wall thickness': '6.0198' },
    ],
  },
  overrides: {},
};
const index = buildPipingClassIndex(config.pipingClass.masterRows);

test('known class 13421 DN100 resolves rating 150', () => {
  assert.equal(resolvePreviewPipingClassRating({ pipingClass: '13421', sizeMm: 100 }, index, config), '150');
});

test('known class 93834 resolves rating 900 after effective class selection', () => {
  assert.equal(resolvePreviewPipingClassRating({ pipingClass: '93834', pipingClassDerived: '13421', sizeMm: 50 }, index, config), '900');
});

test('wrong bore does not borrow another class row rating', () => {
  assert.equal(resolvePreviewPipingClassRating({ pipingClass: '13421', sizeMm: 50 }, index, config), '');
});
