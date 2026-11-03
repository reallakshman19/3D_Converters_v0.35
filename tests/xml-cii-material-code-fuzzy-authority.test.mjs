import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  resolveXmlCiiMaterialCodeFromMap,
  scoreXmlCiiMaterialMapCandidate,
} from '../converters/xml-cii2019-core/material-code-fuzzy-resolver.js';
import {
  applyPreviewMaterialCodeAuthority,
  resolvePreviewMaterialCodeAuthority,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-material-authority.js';

const rows = [
  { code: '193', material: 'A358-304CL1' },
  { code: '337', material: 'A789-S32803' },
  { code: '338', material: 'A790-S32803' },
  { code: '163', material: 'A312-TP316' },
];

const config = {
  material: { mapRows: rows },
  overrides: { materialCode: { 'PC:93834': '193' } },
};

const baseRow = {
  branchName: '=134234934/18061',
  lineKey: 'P4110001',
  pipingClass: '93834',
  sizeMm: 50,
  material: 'ASTM A790 UNS S31803',
  materialCode: '193',
  materialCodeKey: 'PC:93834',
};

test('known S32803 master typo resolves engineering S31803 to A790 code 338', () => {
  const result = resolveXmlCiiMaterialCodeFromMap('ASTM A790 UNS S31803', rows);
  assert.equal(result.materialCode, '338');
  assert.equal(result.method, 'known-alias');
  assert(result.confidence >= 0.98);
  assert.equal(result.needsReview, false);
});

test('specification disambiguates A790 from A789 for the same duplex grade', () => {
  assert.equal(resolveXmlCiiMaterialCodeFromMap('ASTM A789 UNS S31803', rows).materialCode, '337');
});

test('normal exact material remains exact', () => {
  const result = resolveXmlCiiMaterialCodeFromMap('ASTM A312-TP316', rows);
  assert.equal(result.materialCode, '163');
  assert.equal(result.method, 'exact');
  assert.equal(result.confidence, 1);
});

test('same-spec one-character grade drift can resolve only with a strong unique candidate', () => {
  const score = scoreXmlCiiMaterialMapCandidate('ASTM A790 S32761', 'A790-S32760');
  assert.equal(score.method, 'grade-edit-distance-1');
  assert.equal(score.score, 0.9);
});

test('unrelated material is not guessed', () => {
  const result = resolveXmlCiiMaterialCodeFromMap('UNKNOWN POLYMER XYZ', rows);
  assert.equal(result.materialCode, '');
  assert.equal(result.needsReview, true);
});

test('stale class-scoped code override is corrected by strong explicit material evidence', () => {
  const result = resolvePreviewMaterialCodeAuthority(baseRow, config);
  assert.equal(result.materialCode, '338');
  assert.equal(result.materialCodeSource, 'material-evidence-corrected');
  assert.equal(result.materialCodeMethod, 'exact');
  assert.equal(result.materialCodeNeedsReview, false);
  assert.deepEqual(result.materialCodeConflict, {
    overrideCode: '193',
    resolvedCode: '338',
    overrideKey: 'PC:93834',
  });
});

test('material-scoped code override remains authoritative', () => {
  const pinned = {
    ...config,
    overrides: { materialCode: { 'ASTM A790 UNS S31803': '777' } },
  };
  const result = resolvePreviewMaterialCodeAuthority({ ...baseRow, materialCodeKey: 'ASTM A790 UNS S31803' }, pinned);
  assert.equal(result.materialCode, '777');
  assert.equal(result.materialCodeSource, 'material-scoped-override-conflict');
  assert.equal(result.materialCodeNeedsReview, true);
});

test('consistent override remains consistent', () => {
  const consistent = { ...config, overrides: { materialCode: { 'PC:93834': '338' } } };
  const result = resolvePreviewMaterialCodeAuthority({ ...baseRow, materialCode: '338' }, consistent);
  assert.equal(result.materialCode, '338');
  assert.equal(result.materialCodeNeedsReview, false);
  assert.equal(result.materialCodeConflict, null);
});

test('authority applies to all Preview branch rows without changing node rows', () => {
  const nodeRows = [{ nodeNumber: 20 }];
  const result = applyPreviewMaterialCodeAuthority({ config, result: { branchRows: [baseRow], nodeRows } });
  assert.equal(result.branchRows[0].materialCode, '338');
  assert.equal(result.nodeRows, nodeRows);
});

test('Preview wrapper chains Material Code authority before Rating authority', async () => {
  const source = await readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js', import.meta.url), 'utf8');
  assert.match(source, /applyPreviewMaterialCodeAuthority/);
  assert.match(source, /result: wallResult/);
  assert.match(source, /result: materialResult/);
  assert(source.indexOf('applyPreviewMaterialCodeAuthority') < source.lastIndexOf('applyPreviewRatingAuthority'));
});
