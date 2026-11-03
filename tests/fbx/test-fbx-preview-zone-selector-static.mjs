import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [addon, recommendation, sourceExporter, stagedExporter, shell, index, shim, runAll] = await Promise.all([
  read('tabs/model-converters/fbx-preview-zone-selector.js'),
  read('tabs/model-converters/fbx-preview-zone-recommendation.js'),
  read('tabs/model-converters/fbx-source-graph-zone-export.js'),
  read('tabs/model-converters/fbx-staged-json-zone-export.js'),
  read('tabs/model-converters/ModelConvertersTab.js'),
  read('tabs/model-converters/index.js'),
  read('tabs/model-converters-tab.js'),
  read('tests/fbx/run-all.mjs'),
]);

const rendererUrl = '../../converters/view/model-conv-preview-renderer.js?v=20260725-fbx-source-graph-preview-1';
const registryUrl = './converter-registry.js?v=20260617-basic-glb-3';
assert.match(addon, new RegExp(rendererUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(addon, new RegExp(registryUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(addon, /buildFbxSourceGraphPreviewProject/);
assert.match(addon, /buildFbxSourceGraphZoneExport/);
assert.match(addon, /buildFbxStagedJsonZoneExport/);
assert.match(addon, /Download zone StagedJSON/);
assert.match(addon, /Download zone source graph/);
assert.match(addon, /STAGEDJSON_PASS/);
assert.match(addon, /fbx_to_stagedjson/);
assert.match(addon, /extractFbxSelectedZoneRecommendation/);
assert.match(addon, /resolveFbxPreviewAutoSelection/);
assert.match(recommendation, /selected-zone-classification-report/);
assert.match(recommendation, /selectedZone/);
assert.match(recommendation, /SELECTED_ZONE_ID:/);
assert.match(addon, /AUTO_SELECTED_GRAPHS/);
assert.match(addon, /Auto-selected governed zone/);
assert.doesNotMatch(addon, /convertFbxToStagedJson|mapping-package|downloadOutput/);
assert.doesNotMatch(sourceExporter, /converter-registry|convertFbxToStagedJson|mapping-package|Blob|document\./);
assert.doesNotMatch(stagedExporter, /converter-registry|convertFbxToStagedJson|mapping-package|Blob|document\./);
assert.ok(shell.indexOf('installFbxPreviewZoneSelector(container)') < shell.indexOf('renderLegacyModelConvertersTab(container, ctx)'));
assert.match(shell, /fbx-preview-zone-selector\.js\?v=[^'"]+/);
assert.match(index, /ModelConvertersTab\.js\?v=[^'"]+/);
assert.match(shim, /model-converters\/index\.js\?v=[^'"]+/);
for (const test of [
  'test-fbx-source-graph-preview-zones.mjs',
  'test-fbx-source-graph-zone-export.mjs',
  'test-fbx-staged-json-zone-export.mjs',
  'test-fbx-preview-zone-staged-run.mjs',
  'test-fbx-preview-zone-selector-static.mjs',
  'test-fbx-preview-zone-recommendation.mjs',
]) {
  assert.equal(runAll.split(`'${test}'`).length - 1, 1, `${test} must be registered exactly once`);
}
console.log('test-fbx-preview-zone-selector-static: PASS');
