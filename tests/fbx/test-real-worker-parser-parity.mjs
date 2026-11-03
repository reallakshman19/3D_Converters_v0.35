import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { parseFbxInWorker } from '../../tabs/model-converters/converters/fbx/parser-client.js';
import {
  parseFbxBytesNode,
  parseFbxGeometryBundleNode,
  parseFbxVertexAttributeBundleNode,
} from '../../tabs/model-converters/converters/fbx/parser-node.js';
import {
  parseFbxVertexAttributeBundleInWorker,
} from '../../tabs/model-converters/converters/fbx/vertex-attribute-transport.js';

class NodeWorkerAdapter {
  static created = 0;
  static terminated = 0;

  constructor(url, options) {
    NodeWorkerAdapter.created += 1;
    this.worker = new ThreadWorker(url, options);
    this._onmessage = null;
    this._onerror = null;
    this._onmessageerror = null;
    this.worker.on('message', (data) => this._onmessage?.({ data }));
    this.worker.on('error', (error) => this._onerror?.({ message: error.message, error }));
    this.worker.on('messageerror', (error) => this._onmessageerror?.({ error }));
  }

  set onmessage(value) { this._onmessage = value; }
  get onmessage() { return this._onmessage; }
  set onerror(value) { this._onerror = value; }
  get onerror() { return this._onerror; }
  set onmessageerror(value) { this._onmessageerror = value; }
  get onmessageerror() { return this._onmessageerror; }

  postMessage(value, transfer) { this.worker.postMessage(value, transfer); }
  terminate() {
    NodeWorkerAdapter.terminated += 1;
    return this.worker.terminate();
  }
}

globalThis.Worker = NodeWorkerAdapter;
const root = new URL('../fixtures/fbx/', import.meta.url);
const fixtureNames = [
  'two-pipes.fbx', 'axis-geometric.fbx', 'all-categories.fbx',
  'component-families.fbx', 'runtime-004-attributes.fbx',
];

function bytesOf(bundle) {
  return bundle.buffers.map((item) => ({ bufferId: item.bufferId,
    bytes: [...new Uint8Array(item.bytes)] }));
}

function comparableSuccess(graph, geometryBundle, attributeBundle) {
  return {
    graph: canonicalJson(graph),
    geometry: canonicalJson(geometryBundle.manifest),
    geometryBuffers: bytesOf(geometryBundle),
    attributes: canonicalJson(attributeBundle.manifest),
    attributeBuffers: bytesOf(attributeBundle),
  };
}

async function direct(bytes) {
  const graph = await parseFbxBytesNode(bytes);
  const geometryBundle = await parseFbxGeometryBundleNode(bytes);
  const attributeBundle = await parseFbxVertexAttributeBundleNode(bytes, { geometryBundle });
  return comparableSuccess(graph, geometryBundle, attributeBundle);
}

async function managed(bytes) {
  const graph = await parseFbxInWorker(bytes, { timeoutMs: 120000 });
  const { geometryBundle, attributeBundle } =
    await parseFbxVertexAttributeBundleInWorker(bytes, { timeoutMs: 120000 });
  return comparableSuccess(graph, geometryBundle, attributeBundle);
}

let attributeEvidence = null;
for (const name of fixtureNames) {
  const bytes = new Uint8Array(await readFile(new URL(name, root)));
  const before = bytes.slice();
  const directOne = await direct(bytes), directTwo = await direct(bytes);
  const workerOne = await managed(bytes), workerTwo = await managed(bytes);
  assert.deepEqual(bytes, before, `${name}: caller bytes changed`);
  assert.deepEqual(directTwo, directOne, `${name}: direct repeat differs`);
  assert.deepEqual(workerTwo, workerOne, `${name}: worker repeat differs`);
  assert.deepEqual(workerOne, directOne, `${name}: direct/worker evidence differs`);
  if (name === 'runtime-004-attributes.fbx') attributeEvidence = directOne;
}

assert.ok(attributeEvidence, 'attribute fixture was not executed');
const graph = JSON.parse(attributeEvidence.graph);
assert.ok(graph.warnings.length > 0, 'attribute fixture must retain a parser warning');
assert.ok(graph.sourceObjects.some((item) => item.sourceObjectId === '9007199254740993'),
  'large uint64 source ID was not preserved');
const attributes = JSON.parse(attributeEvidence.attributes);
const geometry = attributes.geometries[0];
assert.equal(geometry.normalOrigin, 'source');
assert.ok(geometry.normal);
assert.deepEqual(geometry.uvSets.map((item) => item.name), ['', 'shared', 'shared']);
assert.equal(geometry.colorSets.length, 1);
assert.ok(geometry.faceMaterialSlots);
assert.ok(attributeEvidence.attributeBuffers.length > 0);

function failure(error) {
  return { code: error?.code || null, stage: error?.stage || null,
    detail: error?.detail || null };
}

async function rejected(call) {
  try { await call(); }
  catch (error) { return failure(error); }
  assert.fail('Expected parser rejection.');
}

const limit = new Uint8Array(await readFile(new URL('runtime-004-attribute-limit.fbx', root)));
const directLimit = await rejected(() => parseFbxVertexAttributeBundleNode(limit));
const workerLimit = await rejected(() => parseFbxVertexAttributeBundleInWorker(limit));
assert.deepEqual(workerLimit, directLimit, 'resource-limit error parity differs');
assert.match(directLimit.detail, /limit exceeded/i);

const source = new Uint8Array(await readFile(new URL('runtime-004-attributes.fbx', root)));
const truncated = source.slice(0, 96);
const directTruncated = await rejected(() => parseFbxBytesNode(truncated));
const workerTruncated = await rejected(() => parseFbxInWorker(truncated));
assert.deepEqual(workerTruncated, directTruncated, 'truncated source error parity differs');
const directAttributeTruncated = await rejected(() => parseFbxVertexAttributeBundleNode(truncated));
const workerAttributeTruncated = await rejected(
  () => parseFbxVertexAttributeBundleInWorker(truncated));
assert.deepEqual(workerAttributeTruncated, directAttributeTruncated,
  'truncated attribute error parity differs');

assert.equal(NodeWorkerAdapter.created, NodeWorkerAdapter.terminated,
  'Every actual worker must be terminated.');
console.log('test-real-worker-parser-parity: PASS');
