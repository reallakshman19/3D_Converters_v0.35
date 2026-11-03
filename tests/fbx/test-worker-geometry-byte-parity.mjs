import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { parseFbxGeometryBundleInWorker } from '../../tabs/model-converters/converters/fbx/geometry-transport.js';
import { parseFbxGeometryBundleNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { handleFbxWorkerMessage } from '../../tabs/model-converters/converters/fbx/parser-worker.js';
import { ALL_CATEGORY_URL, fixtureBytes } from './helpers.mjs';
import { familyFixtureBytes } from './family-helpers.mjs';

function workerFactory() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage(job, transfer) {
      const workerJob = structuredClone(job, { transfer });
      queueMicrotask(() => {
        void handleFbxWorkerMessage(workerJob, (message, outputTransfer = []) => {
          const delivered = structuredClone(message, { transfer: outputTransfer });
          queueMicrotask(() => this.onmessage?.({ data: delivered }));
        });
      });
    },
  };
}
function binaryBytes(bundle) {
  return bundle.buffers.map((item) => ({ bufferId: item.bufferId,
    bytes: [...new Uint8Array(item.bytes)] }));
}
async function assertParity(label, bytes) {
  const before = bytes.slice();
  const direct = await parseFbxGeometryBundleNode(bytes);
  const managed = await parseFbxGeometryBundleInWorker(bytes, {
    workerFactory, timeoutMs: 120000,
  });
  assert.deepEqual(bytes, before, `${label}: caller input changed`);
  assert.equal(canonicalJson(managed.manifest), canonicalJson(direct.manifest),
    `${label}: manifest bytes differ`);
  assert.deepEqual(binaryBytes(managed), binaryBytes(direct),
    `${label}: binary buffers differ`);
}

await assertParity('two-pipes', await fixtureBytes());
await assertParity('axis-geometric', new Uint8Array(await readFile(
  new URL('../fixtures/fbx/axis-geometric.fbx', import.meta.url))));
await assertParity('all-categories', await fixtureBytes(ALL_CATEGORY_URL));
await assertParity('component-families', await familyFixtureBytes());
console.log('test-worker-geometry-byte-parity: PASS');
