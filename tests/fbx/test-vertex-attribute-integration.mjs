// Exercise real WASM geometry-to-attribute integration and return deterministic immutable evidence.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  parseFbxGeometryBundleNode,
  parseFbxVertexAttributeBundleNode,
} from '../../tabs/model-converters/converters/fbx/parser-node.js';
import {
  validateFbxVertexAttributeBundle,
} from '../../tabs/model-converters/converters/fbx/vertex-attribute-bundle.js';

const fixture = new URL('../fixtures/fbx/runtime-004-attributes.fbx', import.meta.url);
const bytes = new Uint8Array(await readFile(fixture));
const before = bytes.slice();
const geometryBundle = await parseFbxGeometryBundleNode(bytes);
const supplied = await parseFbxVertexAttributeBundleNode(bytes, { geometryBundle });
const derived = await parseFbxVertexAttributeBundleNode(bytes);
const repeated = await parseFbxVertexAttributeBundleNode(bytes, { geometryBundle });

function bufferEvidence(bundle) {
  return bundle.buffers.map((item) => ({
    bufferId: item.bufferId,
    bytes: [...new Uint8Array(item.bytes)],
  }));
}

assert.deepEqual(bytes, before);
assert.equal(await validateFbxVertexAttributeBundle(supplied), true);
assert.equal(supplied.manifest.geometryBundleDigest, geometryBundle.manifest.bundleDigest);
assert.equal(canonicalJson(derived.manifest), canonicalJson(supplied.manifest));
assert.equal(canonicalJson(repeated.manifest), canonicalJson(supplied.manifest));
assert.deepEqual(bufferEvidence(derived), bufferEvidence(supplied));
assert.deepEqual(bufferEvidence(repeated), bufferEvidence(supplied));
assert.ok(supplied.manifest.geometries[0].normal);
assert.equal(supplied.manifest.geometries[0].uvSets.length, 3);
assert.equal(supplied.manifest.geometries[0].colorSets.length, 1);
assert.ok(supplied.buffers.every((item) => item.bytes instanceof ArrayBuffer));

console.log('test-vertex-attribute-integration: PASS');
