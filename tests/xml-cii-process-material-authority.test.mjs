import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_MATERIAL_MAP_ROWS } from '../converters/xml-cii2019-core/default-material-map-rows.js';
import { resolveMaterialCodeFromLineMaterial } from '../converters/xml-cii2019-core/branch-process-resolver.js';
import {
  isolateXmlCiiPipingClassRatingPrefix,
  resolveConfiguredMaterialCode,
} from '../converters/xml-cii2019-core/piping-class-material-code-resolver.js';
import {
  resolvePreviewMaterialCodeAuthority,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-material-authority.js';

const ratingSequence = [
  ['200', '20000'],
  ['150', '15000'],
  ['100', '10000'],
  ['25', '2500'],
  ['15', '1500'],
  ['5', '5000'],
  ['1', '150'],
  ['3', '300'],
  ['6', '600'],
  ['9', '900'],
];

function fallbackConfig(extra = {}) {
  return {
    useDefaultPipingClassMaterialCodeMap: true,
    ratingSequence,
    pipingClassMaterialCodeMap: {
      enabled: true,
      confidenceThreshold: 80,
      normalizeClassSuffix: true,
    },
    material: { mapRows: DEFAULT_MATERIAL_MAP_ROWS },
    linelist: {
      fieldMap: {},
      masterRows: [
        { lineKey: 'L1', Material: 'ASTM A790 UNS S31803' },
        { lineKey: 'L2', Material: 'API 5L X52' },
        { lineKey: 'L3', Material: 'ASTM A333-6' },
        { lineKey: 'L4', Material: 'UNKNOWN MATERIAL XYZ' },
        { lineKey: 'L5', Material: '' },
      ],
    },
    overrides: {},
    ...extra,
  };
}

test('Rating prefix is isolated before Piping Class family fallback', () => {
  assert.deepEqual(
    isolateXmlCiiPipingClassRatingPrefix('61033M1', fallbackConfig()),
    {
      pipingClass: '61033M1',
      ratingPrefix: '6',
      rating: '600',
      prefixLength: 1,
      materialFamily: '1033M1',
    },
  );
});

test('one-character Rating prefix family fallbacks match supplied examples', () => {
  const config = fallbackConfig();
  const cases = [
    ['61033M1', '106', '6', '1033M1'],
    ['61234X2', '106', '6', '1234X2'],
    ['11504R1', '177', '1', '1504R1'],
  ];
  for (const [pipingClass, code, prefix, family] of cases) {
    const result = resolveConfiguredMaterialCode({ pipingClass, config });
    assert.equal(result.materialCode, code);
    assert.equal(result.method, 'rating-prefix-family-wildcard');
    assert.equal(result.ratingPrefix, prefix);
    assert.equal(result.materialFamily, family);
  }
});

test('two-character Rating prefix is preferred over a shorter prefix', () => {
  const result = resolveConfiguredMaterialCode({
    pipingClass: '151033M1',
    config: fallbackConfig(),
  });
  assert.equal(result.materialCode, '106');
  assert.equal(result.ratingPrefix, '15');
  assert.equal(result.materialFamily, '1033M1');
});

test('wildcard fallback is blocked when the leading token is not in Rating prefix mapping', () => {
  assert.equal(resolveConfiguredMaterialCode({
    pipingClass: '71033M1',
    config: fallbackConfig(),
  }), null);
});

test('Process Line List Material overrides conflicting Piping Class fallback', () => {
  const config = fallbackConfig({
    overrides: { materialCode: { 'PC:61033M1': '193' } },
  });
  const result = resolvePreviewMaterialCodeAuthority({
    branchName: '/B1',
    lineKey: 'L1',
    pipingClass: '61033M1',
    material: 'ASTM A106-B',
    materialSource: 'piping-class-config-map',
    materialCode: '193',
    materialCodeKey: 'PC:61033M1',
  }, config);
  assert.equal(result.material, 'ASTM A790 UNS S31803');
  assert.equal(result.materialSource, 'process-linelist-material');
  assert.equal(result.materialCode, '338');
  assert.equal(result.materialCodeSource, 'material-evidence-corrected');
  assert.equal(result.materialCodeNeedsReview, false);
});

test('Process Material maps independently of Piping Class family', () => {
  const config = fallbackConfig();
  const api = resolvePreviewMaterialCodeAuthority({
    lineKey: 'L2',
    pipingClass: '61234X2',
    materialCode: '106',
  }, config);
  assert.equal(api.material, 'API 5L X52');
  assert.equal(api.materialCode, '331');

  const ltcs = resolvePreviewMaterialCodeAuthority({
    lineKey: 'L3',
    pipingClass: '11504R1',
    materialCode: '177',
  }, config);
  assert.equal(ltcs.material, 'ASTM A333-6');
  assert.equal(ltcs.materialCode, '177');
});

test('unresolved nonblank Process Material blocks Piping Class fallback', () => {
  const config = fallbackConfig({
    overrides: { materialCode: { 'PC:61033M1': '106' } },
  });
  const result = resolvePreviewMaterialCodeAuthority({
    lineKey: 'L4',
    pipingClass: '61033M1',
    materialCode: '106',
    materialCodeKey: 'PC:61033M1',
  }, config);
  assert.equal(result.material, 'UNKNOWN MATERIAL XYZ');
  assert.equal(result.materialCode, '');
  assert.equal(result.materialCodeSource, 'process-material-unresolved');
  assert.equal(result.materialCodeNeedsReview, true);
  assert.equal(result.materialCodeConflict.overrideCode, '106');
});

test('Piping Class fallback is used only when Process Material is blank', () => {
  const result = resolvePreviewMaterialCodeAuthority({
    lineKey: 'L5',
    pipingClass: '61033M1',
    materialCode: '',
  }, fallbackConfig());
  assert.equal(result.material, 'ASTM A106-B');
  assert.equal(result.materialCode, '106');
  assert.equal(result.materialSource, 'piping-class-fallback');
  assert.equal(result.materialCodeSource, 'piping-class-fallback');
  assert.equal(result.materialCodeResolutionMethod, 'rating-prefix-family-wildcard');
  assert.equal(result.materialCodeNeedsReview, true);
});

test('shared resolver corrects a stale class-scoped code from Process Material', () => {
  const result = resolveMaterialCodeFromLineMaterial({
    lineRow: { Material: 'ASTM A790 UNS S31803' },
    materialMap: DEFAULT_MATERIAL_MAP_ROWS,
    pipingClassRow: { materialName: 'ASTM A106-B', materialCode: '106' },
    pipingClass: '61033M1',
    overrides: { materialCode: { 'PC:61033M1': '193' } },
    overrideKeys: ['PC:61033M1'],
    config: fallbackConfig(),
  });
  assert.equal(result.materialCode, '338');
  assert.equal(result.source, 'material-evidence-corrected');
  assert.equal(result.needsReview, false);
  assert.equal(result.conflict.overrideCode, '193');
});

test('shared resolver blocks class fallback for unresolved Process Material', () => {
  const result = resolveMaterialCodeFromLineMaterial({
    lineRow: { Material: 'UNKNOWN MATERIAL XYZ' },
    materialMap: DEFAULT_MATERIAL_MAP_ROWS,
    pipingClassRow: { materialName: 'ASTM A106-B', materialCode: '106' },
    pipingClass: '61033M1',
    overrides: { materialCode: { 'PC:61033M1': '106' } },
    overrideKeys: ['PC:61033M1'],
    config: fallbackConfig(),
  });
  assert.equal(result.materialCode, '');
  assert.equal(result.source, 'process-material-unresolved');
  assert.equal(result.needsReview, true);
});

test('shared resolver uses Rating-prefix class fallback only for blank Process Material', () => {
  const result = resolveMaterialCodeFromLineMaterial({
    lineRow: { Material: '' },
    materialMap: DEFAULT_MATERIAL_MAP_ROWS,
    pipingClassRow: null,
    pipingClass: '61033M1',
    overrides: {},
    overrideKeys: ['PC:61033M1'],
    config: fallbackConfig(),
  });
  assert.equal(result.materialCode, '106');
  assert.equal(result.source, 'piping-class-fallback');
  assert.equal(result.matchMethod, 'rating-prefix-family-wildcard');
  assert.equal(result.needsReview, true);
});
