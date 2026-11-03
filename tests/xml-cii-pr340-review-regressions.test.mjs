import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  branchLineMapRowState,
  resolveBranchLineKeySuggestion,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-line-map-panel.js';
import {
  XML_CII_PREVIEW_LEGACY_CACHE_KEY,
  clearPreviewCacheBridge,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-cache-v7.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cache v7 bridge follows renderer v8-dtxr payload key and clears v6 residue', () => {
  assert.equal(XML_CII_PREVIEW_LEGACY_CACHE_KEY, 'xml-cii-pv-cache-v8-dtxr');
  const renderer = fs.readFileSync(
    path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer.js'),
    'utf8',
  );
  assert.match(renderer, /const PV_CACHE_KEY = 'xml-cii-pv-cache-v8-dtxr'/);

  const values = new Map([
    ['xml-cii-pv-cache-v8-dtxr', 'new'],
    ['xml-cii-pv-cache-v6', 'old'],
    ['xml-cii-pv-cache-v2', 'older'],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  clearPreviewCacheBridge(storage);
  assert.equal(values.size, 0);
});

test('resolver-mapped branches remain mapped without creating an explicit override', () => {
  const state = branchLineMapRowState({
    branchName: '/AREA-10-S8810105-01/B1',
    lineKey: 'S8810105',
    lineMiss: false,
  }, {});
  assert.deepEqual(state, {
    branchName: '/AREA-10-S8810105-01/B1',
    value: 'S8810105',
    status: 'resolved',
    mapped: true,
    explicit: false,
    resolvedValue: 'S8810105',
  });
});

test('explicit branch mapping remains authoritative over resolver output', () => {
  const state = branchLineMapRowState({
    branchName: '/AREA-10-S8810105-01/B1',
    lineKey: 'S8810105',
    lineMiss: false,
  }, {
    '/AREA-10-S8810105-01/B1': 'S8810999',
  });
  assert.equal(state.status, 'override');
  assert.equal(state.value, 'S8810999');
  assert.equal(state.resolvedValue, 'S8810105');
});

test('auto-suggest chooses the boundary-safe longest overlapping key', () => {
  const result = resolveBranchLineKeySuggestion(
    '/AREA-10-S8810105-01/B1',
    ['S88101', 'S8810105'],
  );
  assert.deepEqual(result, {
    status: 'match',
    key: 'S8810105',
    candidates: ['S8810105'],
  });
  assert.equal(
    resolveBranchLineKeySuggestion('/AREA-10-S8810105-01/B1', ['S88101']).status,
    'none',
    'a shorter embedded prefix must not be treated as a boundary-safe match',
  );
});

test('equally ranked line keys are blocked as ambiguous', () => {
  const result = resolveBranchLineKeySuggestion(
    '/AREA-S8810105-D8810105/B1',
    ['S8810105', 'D8810105'],
  );
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates, ['D8810105', 'S8810105']);
  assert.equal(result.key, '');
});

test('pattern and auto-suggest mutation paths target genuinely unmapped rows only', () => {
  const source = fs.readFileSync(
    path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-branch-line-map-panel.js'),
    'utf8',
  );
  const unmappedSelectorMatches = source.match(/\.bulk-map-tr\[data-mapping-source=\\?"unmapped\\?"\]/g) || [];
  assert.ok(unmappedSelectorMatches.length >= 2, 'pattern and auto-suggest must both target unresolved rows');
  assert.match(source, /source === 'resolved' && !hadExplicitOverride && !overrideEnabled/);
  assert.match(source, /bulk-enable-override-btn/);
});
