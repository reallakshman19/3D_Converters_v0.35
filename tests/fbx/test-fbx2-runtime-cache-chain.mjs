import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeSelectedZonePreviewDetail,
} from '../../tabs/model-converters/fbx-selected-zone-preview-bridge.js';

const root = new URL('../../', import.meta.url);
const shellKey = '20260815-aiv-pf01-cache-1';
const key = '20260804-fbx-multifamily-release-1';
const obsoleteKeys = [
  '20260802-fbx-live-ui-3',
  '20260804-fbx-secondary-preview-1',
];
const read = (path) => readFile(new URL(path, root), 'utf8');
const paths = [
  'index.html',
  'main-rhbg-fitguard.js',
  'core/app.js',
  'tabs/model-converters-tab.js',
  'tabs/model-converters/index.js',
  'tabs/model-converters/ModelConvertersTab-fbx2-managed-reference.js',
  'tabs/model-converters/fbx-review-ui-addon.js',
  'tabs/model-converters/fbx-live-runner-addon.js',
  'tabs/model-converters/fbx-multifamily-release-addon.js',
  'tabs/model-converters/fbx-selected-zone-preview-bridge.js',
  'tabs/model-converters/fbx-preview-zone-selector.js',
  'tabs/model-converters/fbx-staged-json-zone-export.js',
  'tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-output.js',
  'tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-capture.js',
  'tabs/model-converters/converters/fbx/zone-geometry/zone-downloads.js',
  'tabs/model-converters/converters/fbx/zone-geometry/zone-review-panels.js',
  'tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js',
];
const files = Object.fromEntries(await Promise.all(
  paths.map(async (path) => [path, await read(path)]),
));

function requires(path, fragment) {
  assert.equal(files[path].includes(fragment), true, `${path} lacks ${fragment}`);
}

requires('index.html', `main-rhbg-fitguard.js?v=${shellKey}`);
requires('main-rhbg-fitguard.js', `core/app.js?v=${shellKey}`);
requires('core/app.js', `app-standalone-runtime.js?v=${key}`);
requires('core/app.js', `model-converters-tab.js?v=${key}`);
requires('tabs/model-converters-tab.js', `model-converters/index.js?v=${key}`);
requires('tabs/model-converters/index.js', `ModelConvertersTab-fbx2-managed-reference.js?v=${key}`);

const wrapper = files['tabs/model-converters/ModelConvertersTab-fbx2-managed-reference.js'];
for (const dependency of [
  'fbx-review-ui-addon.js',
  'fbx-live-runner-addon.js',
  'fbx-multifamily-release-addon.js',
  'fbx-preview-zone-selector.js',
  'fbx-selected-zone-preview-bridge.js',
  'zone-toolbar.js',
]) assert.equal(wrapper.includes(`${dependency}?v=${key}`), true, `wrapper lacks live ${dependency}`);

assert.equal(
  wrapper.includes('import { renderModelConvertersTab as renderBaseModelConvertersTab }'),
  false,
  'base renderer must not be statically imported before the FBX input contract is installed',
);
const installerFragments = [
  'installFbxReviewUiAddon();',
  'installFbxLiveRunnerAddon();',
  'installFbxMultiFamilyReleaseAddon();',
  'installFbxPreviewZoneSelector(container);',
  'installFbxSelectedZonePreviewBridge();',
  'installFbxZoneGeometryToolbar(container);',
];
const installerIndexes = installerFragments.map((fragment) => wrapper.indexOf(fragment));
assert.equal(installerIndexes.every((index) => index >= 0), true, 'live installer call is missing');
assert.deepEqual(
  [...installerIndexes].sort((a, b) => a - b),
  installerIndexes,
  'live installers are out of order',
);
requires(
  'tabs/model-converters/ModelConvertersTab-fbx2-managed-reference.js',
  `import('./ModelConvertersTab.js?v=${key}')`,
);
const renderFunctionStart = wrapper.indexOf('export function renderModelConvertersTab(container, ctx)');
const installCallIndex = wrapper.indexOf('installFbxLiveUi(container);', renderFunctionStart);
const loadCallIndex = wrapper.indexOf('return loadBaseModelConvertersTab()', renderFunctionStart);
const renderCallIndex = wrapper.indexOf('renderBaseModelConvertersTab(container, ctx)', loadCallIndex);
assert.ok(renderFunctionStart >= 0, 'exported renderer is missing');
assert.ok(installCallIndex > renderFunctionStart, 'FBX live UI installation is missing from renderer');
assert.ok(loadCallIndex > installCallIndex, 'base module is requested before FBX input installation');
assert.ok(renderCallIndex > loadCallIndex, 'base renderer invocation precedes module loading');

requires('tabs/model-converters/fbx-review-ui-addon.js', 'synchronizeInput');
requires('tabs/model-converters/fbx-review-ui-addon.js', "const SECONDARY_ACCEPT = '.fbxmap.json,.json,.JSON,.zip,.ZIP'");
requires('tabs/model-converters/fbx-review-ui-addon.js', "synchronizeInput(converter, 'secondary'");
requires('tabs/model-converters/fbx-live-runner-addon.js', `FBX_LIVE_UI_ACTIVE:${key}`);
requires('tabs/model-converters/fbx-live-runner-addon.js', 'FBX_SECONDARY_INPUT:');
requires('tabs/model-converters/fbx-live-runner-addon.js', 'FBX_PREVIEW_AUTHORITY:');
requires('tabs/model-converters/fbx-multifamily-release-addon.js', 'SELECTED_ZONE_RELEASE:MANAGED_MULTI_FAMILY');
requires('tabs/model-converters/fbx-multifamily-release-addon.js', 'APPROVED_MANAGED_STAGE');
requires('tabs/model-converters/fbx-multifamily-release-addon.js', 'BLOCKED_MANAGED_MULTI_FAMILY_RELEASE');
requires('tabs/model-converters/fbx-selected-zone-preview-bridge.js', 'STAGEDJSON_SELECTED_ZONE_PASS');
requires('tabs/model-converters/fbx-selected-zone-preview-bridge.js', 'selectedZoneRelease?.authority');
requires('tabs/model-converters/fbx-preview-zone-selector.js', 'Selected-zone workspace');
requires('tabs/model-converters/fbx-preview-zone-selector.js', 'Download StagedJSON');
requires('tabs/model-converters/fbx-preview-zone-selector.js', 'choosePreferredFbxStagedRun');
requires('tabs/model-converters/fbx-preview-zone-selector.js', 'APPROVED_MANAGED_STAGE');
requires('tabs/model-converters/fbx-preview-zone-selector.js', 'INTERNAL_PIPE_ONLY');
requires('tabs/model-converters/fbx-staged-json-zone-export.js', 'generationProvenance');
requires('tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-output.js', 'STAGEDJSON_SELECTED_ZONE_PASS');
requires('tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-output.js', '/\\.selected-zone\\.json$/i');
requires('tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-capture.js', 'mappedStageAuthority: mapped.authority');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-downloads.js', 'pipe-only-inference.staged.json');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-review-panels.js', 'Detailed fitting, connectivity and generated-component evidence');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', 'Geometry &amp; topology analysis');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', 'Analyze geometry');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', 'mappedAnalysisRelease');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', 'buildFbxStagedJsonZoneExport');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', 'mappedStageAuthority');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', 'PIPE inference');
requires('tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', 'buildFbxZoneWireframeMetaText');

for (const path of paths) {
  for (const obsolete of obsoleteKeys) {
    assert.equal(files[path].includes(obsolete), false, `${path} still exposes obsolete cache key ${obsolete}`);
  }
}

const selectedOutput = {
  name: 'sample.zone.selected-zone.json',
  text: '[{"type":"BRANCH","children":[{"type":"PIPE"},{"type":"ELBO"}]}]',
};
const normalized = normalizeSelectedZonePreviewDetail({
  conversionStatus: 'STAGEDJSON_SELECTED_ZONE_PASS',
  selectedZoneRelease: {
    authority: 'APPROVED_MANAGED_STAGE',
    status: 'MANAGED_MULTI_FAMILY_STAGEDJSON_PASS',
  },
  outputs: [selectedOutput, { name: 'sample.fbx-conversion-report.json', text: '{}' }],
});
assert.equal(normalized.conversionStatus, 'STAGEDJSON_PASS');
assert.equal(normalized.originalConversionStatus, 'STAGEDJSON_SELECTED_ZONE_PASS');
assert.equal(normalized.outputs[0].name, 'sample.zone.staged.json');
assert.equal(normalized.authority, 'APPROVED_MANAGED_STAGE');
assert.equal(normalized.releaseStatus, 'MANAGED_MULTI_FAMILY_STAGEDJSON_PASS');
assert.equal(normalizeSelectedZonePreviewDetail({ conversionStatus: 'BLOCKED' }), null);

console.log('test-fbx2-runtime-cache-chain: PASS');
