import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const toolbar = await readFile(new URL(
  'tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js', root), 'utf8');
const analyse = await readFile(new URL(
  'tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js', root), 'utf8');
const wireframe = await readFile(new URL(
  'tabs/model-converters/converters/fbx/zone-geometry/wireframe-preview.js', root), 'utf8');

assert.match(toolbar, /_3DModelConv_overlayStp\(wireframe\.members\)/);
assert.match(toolbar, /buildFbxZoneWireframeMetaText/);
assert.match(toolbar, /Geometry wireframe\/evidence is available/);
assert.match(toolbar, /controller\.renderer = renderer \|\| controller\.renderer/);
assert.match(analyse, /buildFbxZoneWireframeData/);
assert.match(analyse, /wireframePreview/);
assert.match(wireframe, /polygon-offsets/);
assert.match(wireframe, /polygon-vertex-indices/);
assert.doesNotMatch(wireframe, /triang/i);
assert.doesNotMatch(wireframe, /snap|average/i);
console.log('PASS test-zone-wireframe-ui-static');
