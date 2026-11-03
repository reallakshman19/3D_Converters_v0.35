import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveXmlCiiWallThicknessFromDtxr,
  xmlCiiDtxrDirectWallText,
} from '../converters/xml-cii2019-core/dtxr-wall-thickness-resolver.js';
import {
  findExactClassWall,
  resolveBranchNominalBore,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-wall-evidence.js';

test('10-inch branch name outranks a DN100 first-node fallback', () => {
  assert.equal(
    resolveBranchNominalBore('/TWGA-1000-10"-P1110501-1006520P5-01/B1', 100),
    250,
  );
});

test('direct Wth 40.0 flange evidence outranks OLET Sch 40S', () => {
  const result = resolveXmlCiiWallThicknessFromDtxr({
    boreMm: 250,
    dtxrValues: [
      { componentType: 'OLET', boreMm: 250, dtxr: 'Branch Outlet BW Sch 40S' },
      { componentType: 'FLAN', boreMm: 250, dtxr: 'WELDING NECK FLANGE, Wth 40.0 API 6A RTJ 10000#' },
    ],
  });
  assert.equal(result.wallThicknessMm, 40);
  assert.equal(result.evidenceKind, 'DIRECT_WALL');
  assert.equal(result.componentType, 'FLAN');
  assert.equal(xmlCiiDtxrDirectWallText('Wth 40.0 API 6A'), 40);
});

test('same-bore PIPE Sch 80 outranks OLET Sch 40S', () => {
  const result = resolveXmlCiiWallThicknessFromDtxr({
    boreMm: 250,
    dtxrValues: [
      { componentType: 'OLET', boreMm: 250, dtxr: 'Branch Outlet BW Sch 40S' },
      { componentType: 'PIPE', boreMm: 250, dtxr: 'PIPE NPS 10 SCH 80' },
    ],
  });
  assert.equal(result.wallThicknessMm, 15.09);
  assert.equal(result.schedule, '80');
  assert.equal(result.componentType, 'PIPE');
});

test('mismatched-bore branch fitting cannot set carrier wall', () => {
  const result = resolveXmlCiiWallThicknessFromDtxr({
    boreMm: 250,
    dtxrValues: [
      { componentType: 'OLET', boreMm: 50, dtxr: 'Branch Outlet BW Sch 40S' },
      { componentType: 'FLAN', boreMm: 250, dtxr: 'WELDING NECK FLANGE, Wth 40.0' },
    ],
  });
  assert.equal(result.wallThicknessMm, 40);
  assert.equal(result.evidenceBoreMm, 250);
});

test('96620 DN250 uses the explicit benchmark correction', () => {
  const config = {
    pipingClass: {
      masterRows: [{
        'Piping Class': '96620',
        Size: '10',
        SCH: '100',
        'Wall thickness': '18.2626',
        convertedBore: 250,
      }],
    },
  };
  const result = findExactClassWall(config, '96620', 250);
  assert.equal(result.wallThicknessMm, 15.09);
  assert.equal(result.schedule, '80');
  assert.equal(result.source, 'benchmark-correction');
});
