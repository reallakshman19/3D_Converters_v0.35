import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPipingClassIndex,
  findBestPipingClassRow,
  resolveApproximatePipingClass,
} from '../converters/xml-cii2019-core/piping-class-resolver.js';
import {
  resolveXmlCiiBoreMmFromNps,
  normalizeXmlCiiPipingClassMasterRow,
} from '../converters/xml-cii2019-core/nps-bore-resolver.js';
import {
  deriveXmlCiiPipingClassFromBranchName,
  selectXmlCiiRequestedPipingClass,
} from '../converters/xml-cii2019-core/piping-class-source-resolver.js';
import {
  resolveXmlCiiAutomaticRating,
  resolveXmlCiiRatingAuthority,
} from '../converters/xml-cii2019-core/dtxr-rating-resolver.js';
import {
  applyPreviewDtxrRatingOverrides,
  isPreviewDtxrRatingOverride,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-rating-fetch.js';

test('NPS is table-converted to nominal bore millimetres', () => {
  assert.equal(resolveXmlCiiBoreMmFromNps('20'), 500);
  assert.equal(resolveXmlCiiBoreMmFromNps('3/4"'), 20);
  assert.deepEqual(
    normalizeXmlCiiPipingClassMasterRow({ pipingClass: '93842', NPS: '20' }),
    {
      pipingClass: '93842',
      NPS: '20',
      nps: '20',
      convertedBore: 500,
      boreMm: 500,
      boreSource: 'nps-master-table',
    },
  );
});

test('20 inch piping-class row cannot match a 20 mm branch', () => {
  const index = buildPipingClassIndex([
    { pipingClass: '93842', nps: '20', rating: '900', wallThickness: '20.6248' },
  ]);
  const match = findBestPipingClassRow({
    pipingClass: '93842',
    boreMm: 20,
    componentType: 'PIPE',
    pipingClassIndex: index,
  });
  assert.equal(match.row, null);
  assert.match(match.reasons.join('|'), /bore-mismatch/);
});

test('same class selects 3/4 inch row for a 20 mm branch', () => {
  const index = buildPipingClassIndex([
    { pipingClass: '93842', nps: '20', rating: '900', wallThickness: '20.6248' },
    { pipingClass: '93842', nps: '0.75', rating: '900', wallThickness: '3.9116' },
  ]);
  const match = findBestPipingClassRow({
    pipingClass: '93842',
    boreMm: 20,
    componentType: 'PIPE',
    pipingClassIndex: index,
  });
  assert.equal(match.row.nps, '0.75');
  assert.equal(match.row.convertedBore, 20);
  assert.equal(match.row.wallThickness, '3.9116');
});

test('numeric class approximation follows longest available family prefix', () => {
  const index = buildPipingClassIndex([
    { pipingClass: '13421', convertedBore: 100 },
    { pipingClass: '93842', convertedBore: 100 },
    { pipingClass: '93111', convertedBore: 100 },
    { pipingClass: '90001', convertedBore: 100 },
  ]);
  assert.equal(resolveApproximatePipingClass({ requestedClass: '93833', pipingClassIndex: index }).pipingClass, '93842');
  assert.equal(resolveApproximatePipingClass({ requestedClass: '93777', knownClasses: ['13421', '93111', '90001'] }).pipingClass, '93111');
  assert.equal(resolveApproximatePipingClass({ requestedClass: '98777', knownClasses: ['13421', '90001'] }).pipingClass, '90001');
  assert.equal(resolveApproximatePipingClass({ requestedClass: '93833', knownClasses: ['13421'] }).pipingClass, '');
});

test('branch token outranks unrelated Line List piping class', () => {
  const branchName = '/GLRD-1000-4"-P4110003-93833-01/B1';
  const config = { rating: { tokenDelimiter: '-', pipingClassTokenIndex: 4 } };
  assert.equal(deriveXmlCiiPipingClassFromBranchName(branchName, config), '93833');
  assert.deepEqual(
    selectXmlCiiRequestedPipingClass({ branchName, lineListPipingClass: '13421', config }),
    {
      requestedPipingClass: '93833',
      branchPipingClass: '93833',
      lineListPipingClass: '13421',
      source: 'branch-name',
    },
  );
});

test('normal Rating uses class master then Regex, never Line List or DTXR', () => {
  const classResult = resolveXmlCiiRatingAuthority({
    lineListRating: '163',
    pipingClassRating: '900',
    dtxrValues: ['FLANGE 150#'],
  });
  assert.equal(classResult.rating, '900');
  assert.equal(classResult.source, 'piping-class-master');

  const regexResult = resolveXmlCiiAutomaticRating({
    branchName: '/AREA-LINE-PC-CL600-01',
    config: { rating: { ratingRegex: 'CL(\\d+)', ratingGroup: 1 } },
  });
  assert.equal(regexResult.rating, '600');
  assert.equal(regexResult.source, 'rating-regex');
});

test('DTXR Rating button writes branch-scoped overrides and skips conflicts', () => {
  const config = { overrides: { rating: { MANUAL: '150' } } };
  const result = applyPreviewDtxrRatingOverrides(config, [
    { branchName: '/A/B1', lineKey: 'L1', ratingDtxr: '900', ratingDtxrRatings: ['900'] },
    { branchName: '/B/B1', lineKey: 'L2', ratingDtxrRatings: ['150', '900'] },
    { branchName: '/C/B1', lineKey: 'L3', ratingDtxrRatings: [] },
  ]);
  assert.equal(result.applied, 1);
  assert.equal(result.conflicts, 1);
  assert.equal(result.missing, 1);
  assert.equal(config.overrides.rating.MANUAL, '150');
  assert.equal(config.overrides.rating['/A/B1'], '900');
  assert.equal(config.overrides.rating.L1, undefined);
  assert.equal(isPreviewDtxrRatingOverride(config, '/A/B1'), true);
});

test('re-fetch clears stale fetched DTXR Rating overrides only', () => {
  const config = {
    overrides: {
      rating: { '/OLD/B1': '600', MANUAL: '150' },
      __dtxrRatingKeys: { '/OLD/B1': true },
      processData: {},
    },
  };
  const result = applyPreviewDtxrRatingOverrides(config, []);
  assert.equal(result.cleared, 1);
  assert.equal(config.overrides.rating['/OLD/B1'], undefined);
  assert.equal(config.overrides.rating.MANUAL, '150');
});
