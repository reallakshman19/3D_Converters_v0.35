// Prove that real accepted attribute evidence fails closed after contract or byte tampering.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseFbxVertexAttributeBundleNode,
} from '../../tabs/model-converters/converters/fbx/parser-node.js';
import {
  FBX_ATTRIBUTE_ERROR_CODES,
  FbxVertexAttributeContractError,
  validateFbxVertexAttributeBundle,
} from '../../tabs/model-converters/converters/fbx/vertex-attribute-bundle.js';

const fixture = new URL('../fixtures/fbx/runtime-004-attributes.fbx', import.meta.url);
const bytes = new Uint8Array(await readFile(fixture));
const accepted = await parseFbxVertexAttributeBundleNode(bytes);

async function rejects(bundle, code) {
  await assert.rejects(
    validateFbxVertexAttributeBundle(bundle),
    (error) => error instanceof FbxVertexAttributeContractError
      && error.code === code,
  );
}

const extraField = structuredClone(accepted);
extraField.manifest.untracked = true;
await rejects(extraField, FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID);

const missingBuffer = structuredClone(accepted);
missingBuffer.buffers.pop();
await rejects(missingBuffer, FBX_ATTRIBUTE_ERROR_CODES.BUFFER_INVALID);

const changedBytes = structuredClone(accepted);
new Uint8Array(changedBytes.buffers[0].bytes)[0] ^= 1;
await rejects(changedBytes, FBX_ATTRIBUTE_ERROR_CODES.DIGEST_MISMATCH);

const changedManifest = structuredClone(accepted);
changedManifest.manifest.geometries[0].normalOrigin = 'absent';
await rejects(changedManifest, FBX_ATTRIBUTE_ERROR_CODES.BUNDLE_INVALID);

const changedDigest = structuredClone(accepted);
changedDigest.manifest.bundleDigest = '0'.repeat(64);
await rejects(changedDigest, FBX_ATTRIBUTE_ERROR_CODES.DIGEST_MISMATCH);

console.log('test-vertex-attribute-bundle-failures: PASS');
