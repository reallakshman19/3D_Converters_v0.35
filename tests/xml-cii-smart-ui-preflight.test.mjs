import assert from 'node:assert/strict';
import {
  applyRegexSuggestions,
  buildRegexSuggestionPreflight,
} from '../tabs/xml-cii-2019-standalone/xml-cii-regex-smart-suggestions.js';
import {
  buildRigidSmartFillPreflight,
  groupRatingPlan,
  smartFillWeightMap,
} from '../tabs/xml-cii-2019-standalone/xml-cii-rigid-smart-fill.js';

const regexConfig = {
  activeFormatIndex: 0,
  formats: [{
    tokenDelimiter: '-',
    lineKey: { tokenPosition: '' },
    pipingClass: { tokenPosition: '' },
    rating: { tokenPosition: '' },
    bore: { tokenPosition: '' },
  }, {}],
  ratingSequence: [['9', '900']],
};
const branchSamples = [
  { branchName: '/TWGA-1000-10"-P1110502-96620M0-01/B1' },
  { branchName: '/TWGA-1001-8"-P1110501-96620M0-02/B2' },
];
const masterContext = {
  lineRows: [{ lineKey: 'P1110502' }, { lineKey: 'P1110501' }],
  pipingClassRows: [{ pipingClass: '96620' }],
  rowCounts: { lineList: 2, pipingClass: 1 },
};

const regexReceipt = buildRegexSuggestionPreflight({
  branchSamples,
  extractionConfig: regexConfig,
  masterContext,
  currentResult: { matchedRows: [], rejectedRows: branchSamples },
});
assert.equal(regexReceipt.schema, 'regex-suggestion-preflight/v1');
assert.deepEqual(regexReceipt.suggestions.find((row) => row.role === 'bore')?.tokenPositions, [3]);
assert.deepEqual(regexReceipt.suggestions.find((row) => row.role === 'lineKey')?.tokenPositions, [4]);
assert.deepEqual(regexReceipt.suggestions.find((row) => row.role === 'pipingClass')?.tokenPositions, [5]);
const appliedRegex = applyRegexSuggestions(regexConfig, regexReceipt, { safeOnly: false });
assert.equal(appliedRegex.formats[0].bore.tokenPosition, '3');
assert.equal(appliedRegex.formats[0].lineKey.tokenPosition, '4');

const rigidRows = [
  {
    key: 'A', branchName: '/ASIM-1885-PL-8"-M8810123-01/B4', boreMm: 200,
    rating: '900', node: '1360', lengthMm: 112, manualWeight: '', ratingConflict: false,
    candidates: [{ suggestedWeight: 42.5, totalScore: .96, preferred: true, weightMethod: 'exact' }],
  },
  {
    key: 'B', branchName: '/ASIM-1885-PL-8"-M8810123-01/B4', boreMm: 200,
    rating: '900', node: '2010', lengthMm: 674.4, manualWeight: '', ratingConflict: false,
    candidates: [{ suggestedWeight: 168.2, totalScore: .87, weightMethod: 'length-interpolated', inferredWeight: true }],
  },
  {
    key: 'C', branchName: '/ASIM-1885-PL-8"-M8810123-01/B4', boreMm: 200,
    rating: '', node: '2050', lengthMm: 649, manualWeight: '', ratingConflict: false,
    candidates: [],
  },
];
const rigidReceipt = buildRigidSmartFillPreflight({ rows: rigidRows });
assert.equal(rigidReceipt.schema, 'rigid-weight-smart-fill-preflight/v1');
assert.equal(rigidReceipt.metrics.safeCount, 1);
assert.equal(rigidReceipt.metrics.reviewCount, 1);
assert.equal(rigidReceipt.metrics.blockedCount, 1);
assert.deepEqual(smartFillWeightMap(rigidReceipt), { A: 42.5 });
const ratingPlan = groupRatingPlan(rigidRows, '/ASIM-1885-PL-8"-M8810123-01|DN200', '900');
assert.equal(ratingPlan.status, 'READY_TO_APPLY');
assert.deepEqual(ratingPlan.updates, { C: '900' });

console.log('xml-cii smart UI preflight tests passed');
