import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [addon, tab, controller, analysis, liveInput] = await Promise.all([
  read('tabs/model-converters/fbx-zone-package-export.js'),
  read('tabs/model-converters/ModelConvertersTab.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/analysis-controller.js'),
  read('tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js'),
  read('tabs/model-converters/converters/fbx/zone-package/live-input.js'),
]);

assert.match(addon, /export function installFbxZonePackageExport/);
assert.match(addon, /buildSelectedZonePackage/);
assert.match(addon, /buildPackageArchive/);
assert.match(addon, /buildSupportAssemblyReviewModel/);
assert.match(addon, /supportAssemblySummaryText/);
assert.match(addon, /URL\.createObjectURL/);
assert.match(addon, /URL\.revokeObjectURL/);
assert.match(addon, /Download zone package/);
assert.match(addon, /model-converters:fbx-zone-package-inputs/);
assert.match(addon, /data-fbx-support-host-policy/);
assert.match(addon, /title="\$\{POLICY_TEXT\}"/,
  'the support and assembly policy must be visible through icon hover');
assert.match(addon, /No nearest-pipe fallback/);
assert.match(addon, /Sibling candidates are not grouped/);
assert.match(addon, /support hosts proved/);
assert.match(addon, /generic support assemblies proved/);
assert.match(addon, /button\.disabled = !latestInputs/,
  'the package control must remain disabled until live analysis inputs exist');
assert.match(addon, /inputs \|\| latestInputs/,
  'a legacy null provider must not bypass live package inputs');
assert.doesNotMatch(addon, /new Worker\(|OffscreenCanvas|getContext\(['"]webgl/,
  'package export must not touch a Worker or canvas');
assert.doesNotMatch(addon, /parser-wasm|parser-worker|staged-writer/,
  'package export must not touch the parser or Writer');

assert.match(tab, /installFbxZonePackageExport/);
assert.match(tab, /fbx-zone-package-export\.js\?v=/);
assert.match(controller, /zonePackageInputs/);
assert.match(controller, /fbx-zone-package-inputs/);
assert.match(analysis, /buildLiveZonePackageInputs/);
assert.match(analysis, /pipeClassifications: pipeEvidence\.autoPipe\.classificationDispositions/);
assert.match(analysis, /zonePackageInputs/);
assert.match(liveInput, /buildLiveZonePackageInputs/);
assert.match(liveInput, /buildSelectedZoneGeometryManifest/);
assert.match(liveInput, /buildSupportHostAssociationEvidence/);
assert.match(liveInput, /buildSupportAssemblyEvidence/);
assert.match(liveInput, /getFloat64\(offset, true\)/);
assert.match(liveInput, /getUint32\(offset, true\)/);

console.log('test-zone-package-export-static: PASS');
