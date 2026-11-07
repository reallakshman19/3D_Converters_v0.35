import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRigidSmartFillReviewDialog } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-smart-fill-ui.js';

function dialog(...selectors) {
  const found = new Set(selectors);
  return { querySelector: (selector) => found.has(selector) ? { id: selector } : null };
}
const apply = '[data-rigid-review-apply]';
const input = '.mc-rigid-review-input';
const rating = '.mc-rigid-review-rating-input';

assert.equal(isRigidSmartFillReviewDialog(dialog(apply, input, rating)), true,
  'genuine unresolved-weight application dialog must retain Smart Fill');
assert.equal(isRigidSmartFillReviewDialog(dialog()), false, 'empty review is not a smart-fill target');
assert.equal(isRigidSmartFillReviewDialog(dialog(input, rating)), false,
  'no apply button means no Smart Fill eligibility');
assert.equal(isRigidSmartFillReviewDialog(dialog(apply, input)), false,
  'missing rating input means no Smart Fill eligibility');
assert.equal(isRigidSmartFillReviewDialog(dialog('[data-final-rigid-row]')), false,
  'final CII read-only inventory must not show BLOCKED: 0 safe/review/blocked');
assert.equal(isRigidSmartFillReviewDialog(dialog('[data-rigid-inventory-row]')), false,
  'source XML read-only inventory must not show synthetic Smart Fill status');
assert.equal(isRigidSmartFillReviewDialog(dialog('[data-mode-a-rigid-apply]')), false,
  'Mode A consolidated dialog continues using its independent batch review');
assert.equal(isRigidSmartFillReviewDialog(null), false);

const smartFillSource = readFileSync(
  new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-smart-fill-ui.js', import.meta.url),
  'utf8',
);
assert.match(smartFillSource, /!isRigidSmartFillReviewDialog\(dialog\)/,
  'Smart Fill observer must guard before creating status/toolbars');

const finalSource = readFileSync(
  new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js', import.meta.url),
  'utf8',
);
assert.match(finalSource, /data-final-rigid-assessment/);
assert.match(finalSource, /reference-based comparisons/);
assert.match(finalSource, /not assessed/);
assert.match(finalSource, /No output weights changed/);
assert.match(finalSource, /min="0.000001"/);
assert.doesNotMatch(finalSource, /data-rigid-review-apply/,
  'final read-only popup must not offer mass/override application');
console.log('Final CII Smart Fill popup isolation tests: PASS');