import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const releaseKey = '20260816-aiv-canvas-release-1';
const editorKey = '20260816-aiv-526-editor-3';
const spatialKey = '20260816-aiv-canvas-spatial-1';
const fieldsKey = '20260816-aiv-canvas-fields-1';
const supersededCanvasUiKey = '20260816-aiv-canvas-ui-1';
const read = (path) => readFile(new URL(path, root), 'utf8');

const paths = [
  'index.html',
  'main-rhbg-fitguard.js',
  'core/app.js',
  'core/engineering-tabs-extension.js',
  'tabs/engineering-workspace-tab.js',
  'tabs/engineering-calculations-tab.js',
  'tabs/vibration-aiv-qualification-tab.js',
  'tabs/vibration-aiv-qualification-view.js',
  'tabs/vibration-aiv-input-view.js',
  'tabs/vibration-aiv-unified-canvas-controller.js',
  'tabs/vibration-aiv-unified-canvas-view.js',
  'tabs/vibration-aiv-unified-canvas-author-view.js',
  'tabs/vibration-aiv-unified-canvas-inspector.js',
  'tabs/vibration-aiv-unified-canvas-editor-controller.js',
  'tabs/vibration-aiv-unified-canvas-editor-view.js',
  'tabs/vibration-aiv-unified-canvas-workflow.js',
  'tabs/vibration-aiv-unified-canvas-labels.js',
  'tabs/vibration-aiv-canvas-export-controller.js',
  'tabs/vibration-aiv-canvas-field-controller.js',
  'tabs/vibration-aiv-canvas-field-link.js',
  'tabs/vibration-aiv-canvas-field.js',
  'tabs/vibration-aiv-canvas-selection.js',
  'tabs/vibration-aiv-canvas-presentation.js',
  'tabs/vibration-aiv-canvas-spatial-dom.js',
  'tabs/vibration-aiv-workspace-browser.js',
  'tabs/vibration-aiv-qualification.css',
];

const files = Object.fromEntries(await Promise.all(
  paths.map(async (path) => [path, await read(path)]),
));

function requires(path, fragment) {
  assert.equal(files[path].includes(fragment), true, `${path} lacks ${fragment}`);
}
function forbids(path, fragment) {
  assert.equal(files[path].includes(fragment), false, `${path} still exposes ${fragment}`);
}

test('fresh AIV canvas release identity reaches the merged unified renderer', () => {
  requires('index.html', `main-rhbg-fitguard.js?v=${releaseKey}`);
  requires('main-rhbg-fitguard.js', `core/app.js?v=${releaseKey}`);
  requires('core/app.js', `engineering-tabs-extension.js?v=${releaseKey}`);
  requires('core/engineering-tabs-extension.js', `engineering-workspace-tab.js?v=${releaseKey}`);
  requires('tabs/engineering-workspace-tab.js', `engineering-calculations-tab.js?v=${releaseKey}`);
  requires('tabs/engineering-calculations-tab.js', `vibration-aiv-qualification-tab.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-qualification-tab.js', `vibration-aiv-qualification-view.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-qualification-view.js', `vibration-aiv-input-view.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-input-view.js', `vibration-aiv-unified-canvas-view.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-qualification-tab.js', `vibration-aiv-unified-canvas-controller.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-qualification-tab.js', `vibration-aiv-unified-canvas-inspector.js?v=${releaseKey}`);
});

test('all #534/#537 changed leaves reachable through the canvas are cache-addressed', () => {
  requires('tabs/vibration-aiv-qualification-tab.js', `vibration-aiv-canvas-export-controller.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-input-view.js', `vibration-aiv-canvas-field.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-unified-canvas-controller.js', `vibration-aiv-canvas-selection.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-unified-canvas-view.js', `vibration-aiv-unified-canvas-inspector.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-unified-canvas-view.js', `vibration-aiv-canvas-field-link.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-unified-canvas-inspector.js', `vibration-aiv-canvas-field.js?v=${releaseKey}`);
  requires('tabs/vibration-aiv-canvas-field-link.js', `vibration-aiv-canvas-field.js?v=${releaseKey}`);
});

test('unchanged leaf generations retain their qualified cache identities', () => {
  requires('tabs/vibration-aiv-unified-canvas-view.js', `vibration-aiv-unified-canvas-author-view.js?v=${editorKey}`);
  requires('tabs/vibration-aiv-unified-canvas-view.js', `vibration-aiv-unified-canvas-labels.js?v=${editorKey}`);
  requires('tabs/vibration-aiv-unified-canvas-view.js', `vibration-aiv-canvas-presentation.js?v=${spatialKey}`);
  requires('tabs/vibration-aiv-unified-canvas-controller.js', `vibration-aiv-canvas-field-controller.js?v=${fieldsKey}`);
  requires('tabs/vibration-aiv-unified-canvas-controller.js', `vibration-aiv-unified-canvas-author.js?v=${editorKey}`);
  requires('tabs/vibration-aiv-unified-canvas-controller.js', `vibration-aiv-unified-canvas-editor-controller.js?v=${editorKey}`);
  requires('tabs/vibration-aiv-unified-canvas-controller.js', `vibration-aiv-unified-canvas-labels.js?v=${editorKey}`);
  requires('tabs/vibration-aiv-unified-canvas-controller.js', `vibration-aiv-canvas-presentation.js?v=${spatialKey}`);
  requires('tabs/vibration-aiv-unified-canvas-controller.js', `vibration-aiv-canvas-spatial-dom.js?v=${spatialKey}`);
  requires('tabs/vibration-aiv-unified-canvas-inspector.js', `vibration-aiv-unified-canvas-editor-view.js?v=${fieldsKey}`);
  requires('tabs/vibration-aiv-unified-canvas-editor-view.js', `vibration-aiv-canvas-field.js?v=${fieldsKey}`);
  requires('tabs/vibration-aiv-canvas-export-controller.js', `vibration-aiv-canvas-presentation.js?v=${spatialKey}`);
  forbids('tabs/vibration-aiv-canvas-export-controller.js', supersededCanvasUiKey);
});

test('warm Stage-8 browser cannot remain on an editor-3 parent route', () => {
  forbids('index.html', `main-rhbg-fitguard.js?v=${editorKey}`);
  forbids('main-rhbg-fitguard.js', `core/app.js?v=${editorKey}`);
  forbids('core/app.js', `engineering-tabs-extension.js?v=${editorKey}`);
  forbids('core/engineering-tabs-extension.js', `engineering-workspace-tab.js?v=${editorKey}`);
  forbids('tabs/engineering-workspace-tab.js', `engineering-calculations-tab.js?v=${editorKey}`);
  forbids('tabs/engineering-calculations-tab.js', `vibration-aiv-qualification-tab.js?v=${editorKey}`);
  forbids('tabs/vibration-aiv-qualification-tab.js', `vibration-aiv-qualification-view.js?v=${editorKey}`);
  forbids('tabs/vibration-aiv-qualification-view.js', `vibration-aiv-input-view.js?v=${editorKey}`);
  forbids('tabs/vibration-aiv-input-view.js', `vibration-aiv-unified-canvas-view.js?v=${editorKey}`);
});

test('active qualification source exposes the post-#534/#537 canvas surface', () => {
  requires('tabs/vibration-aiv-qualification-tab.js', 'createAivUnifiedCanvasController');
  requires('tabs/vibration-aiv-input-view.js', 'renderAivUnifiedCanvasWorkspaceHtml');
  requires('tabs/vibration-aiv-unified-canvas-view.js', 'data-aiv-unified-canvas-svg="true"');
  requires('tabs/vibration-aiv-unified-canvas-view.js', 'AIV Network Canvas Editor');
  requires('tabs/vibration-aiv-unified-canvas-view.js', 'data-aiv-canvas-icon-only="true"');
  requires('tabs/vibration-aiv-unified-canvas-view.js', 'data-aiv-canvas-action="fit-network"');
  requires('tabs/vibration-aiv-unified-canvas-view.js', 'data-aiv-canvas-action="auto-tidy"');
  requires('tabs/vibration-aiv-unified-canvas-view.js', 'data-aiv-canvas-inspector-dock="true"');
  requires('tabs/vibration-aiv-unified-canvas-view.js', 'Field integration:');
  assert.equal((files['tabs/vibration-aiv-unified-canvas-view.js'].match(/data-aiv-unified-canvas-svg=/gu) ?? []).length, 1);
});

test('scratch-network and five label-mode contracts remain visible', () => {
  requires('tabs/vibration-aiv-unified-canvas-editor-controller.js', 'New flare network');
  requires('tabs/vibration-aiv-unified-canvas-editor-controller.js', 'Add RV + branch');
  requires('tabs/vibration-aiv-unified-canvas-editor-controller.js', 'Subheader junction');
  requires('tabs/vibration-aiv-unified-canvas-workflow.js', "source: 'AIV_FLARE_NETWORK_UI'");
  for (const mode of ['NORMAL', 'PROCESS', 'GEOMETRY', 'RESULTS', 'COMPLETENESS']) {
    requires('tabs/vibration-aiv-unified-canvas-labels.js', `${mode}: '${mode}'`);
    requires('tabs/vibration-aiv-unified-canvas-view.js', 'data-aiv-canvas-label-mode');
  }
  requires('tabs/vibration-aiv-unified-canvas-labels.js', 'Mass Flow');
  requires('tabs/vibration-aiv-unified-canvas-labels.js', 'Main Outside Diameter');
  requires('tabs/vibration-aiv-unified-canvas-labels.js', 'Results stale · rerun screening');
  assert.equal(files['tabs/vibration-aiv-unified-canvas-labels.js'].includes('Math.log'), false);
  assert.equal(files['tabs/vibration-aiv-unified-canvas-labels.js'].includes('Math.log10'), false);
});

test('shared engineering entrypoint preserves FIV and HP product identities', () => {
  requires('tabs/engineering-calculations-tab.js', 'vibration-integrity-tab.js?v=20260815-sbc-pf05-cache-1');
  requires('tabs/engineering-workspace-tab.js', 'hp-piping-class-tab.js?v=20260816-hp-i5-native-editors-1');
});

test('stylesheet and filter contracts remain unchanged by cache custody repair', async () => {
  requires('tabs/vibration-aiv-workspace-browser.js', 'vibration-aiv-qualification.css?v=aiv-qualification-15');
  requires('tabs/vibration-aiv-qualification.css', 'vibration-aiv-unified-canvas-editor.css?v=1');
  const filter = await read('tabs/vibration-aiv-canvas-filter.js');
  requires('tabs/vibration-aiv-unified-canvas-controller.js', "from './vibration-aiv-canvas-filter.js'");
  assert.equal(filter.includes('input = input ?? {};'), true);
});
