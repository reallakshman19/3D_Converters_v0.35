// Validate transform-aware FBX preview generation against a real governed FBX fixture.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFbxSourceGraphPreviewProject } from
  '../../tabs/model-converters/fbx-source-graph-preview.js';
import { parseFbxBytesNode } from
  '../../tabs/model-converters/converters/fbx/parser-node.js';

const fixture = new URL('../fixtures/fbx/runtime-004-attributes.fbx', import.meta.url);
const bytes = new Uint8Array(await readFile(fixture));
const graph = await parseFbxBytesNode(bytes);
const complete = buildFbxSourceGraphPreviewProject(graph, 'runtime-004-attributes.json', 1000);
const bounded = buildFbxSourceGraphPreviewProject(graph, 'runtime-004-attributes.json', 2);

assert.equal(complete.sourcePointCount, 4);
assert.equal(complete.displayedPointCount, 4);
assert.equal(complete.truncated, false);
assert.ok(complete.points.every((point) => (
  Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
)));
assert.equal(bounded.sourcePointCount, 4);
assert.equal(bounded.displayedPointCount, 2);
assert.equal(bounded.truncated, true);
assert.deepEqual(
  buildFbxSourceGraphPreviewProject({ schema: 'Other' }, 'other.json', 2),
  null,
);

console.log('test-fbx-source-graph-preview: PASS');
