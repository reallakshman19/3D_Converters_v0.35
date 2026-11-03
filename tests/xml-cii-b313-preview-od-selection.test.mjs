import assert from 'node:assert/strict';
import {
  inferPreviewDimensionStandard,
  resolvePreviewOutsideDiameter,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';

const dimension = inferPreviewDimensionStandard({ material: 'ASTM A106-B' }, {});
assert.equal(dimension.standard, 'ASME B36.10M');
assert.equal(dimension.source, 'material-family-inference');

const sourceXml = {
  byBranch: new Map([
    ['/TEST/B1', [
      { value: 26.7, field: 'OutsideDiameter', nodeNumber: '101', componentType: 'FLAN', componentRefNo: '=small-end' },
      { value: 60.3, field: 'OutsideDiameter', nodeNumber: '100', componentType: 'PIPE', componentRefNo: '=pipe' },
    ]],
  ]),
};

const selected = resolvePreviewOutsideDiameter(
  { branchName: '/TEST/B1', sizeMm: 50 },
  sourceXml,
  'ASME B36.10M',
);
assert.equal(selected.ok, true, JSON.stringify(selected, null, 2));
assert.equal(selected.outsideDiameterMm, 60.3);
assert.equal(selected.sourceNodeNumber, '100');
assert.ok(Math.abs(selected.referenceOdMm - 60) < 1e-9, 'Retained DN50 project master reference should be 60 mm.');
assert.ok(Math.abs(selected.parityDeltaMm - 0.3) < 1e-9);
assert.equal(selected.candidates[1].value, 26.7);

const unrelatedOnly = resolvePreviewOutsideDiameter(
  { branchName: '/TEST/B2', sizeMm: 50 },
  { byBranch: new Map([['/TEST/B2', [{ value: 26.7, field: 'OutsideDiameter' }]]]) },
  'ASME B36.10M',
);
assert.equal(unrelatedOnly.ok, false);
assert.equal(unrelatedOnly.code, 'B313_PREVIEW_ROW_OD_PARITY_MISMATCH');

console.log('XML/CII Preview B31.3 row OD custody checks passed.');
