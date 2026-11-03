import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { Worker as NodeWorker } from 'node:worker_threads';
import { analyseFbxZoneGeometry } from '../../tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js';
import { createZoneAnalysisController } from '../../tabs/model-converters/converters/fbx/zone-geometry/analysis-controller.js';
import { ZONE_GEOMETRY_STATUS } from '../../tabs/model-converters/converters/fbx/zone-geometry/constants.js';
import { buildFixture } from './test-zone-geometry-evidence.mjs';

function nodeWorkerFactory(workerUrl) {
  return () => {
    const native = new NodeWorker(workerUrl, { type: 'module' });
    const adapter = {
      onmessage: null, onerror: null, onmessageerror: null,
      postMessage(value, transfer) { native.postMessage(value, transfer); },
      terminate() { return native.terminate(); },
    };
    native.on('message', (data) => adapter.onmessage?.({ data }));
    native.on('error', (error) => adapter.onerror?.({ message: error.message, error }));
    native.on('messageerror', (error) => adapter.onmessageerror?.(error));
    return adapter;
  };
}

function pendingWorkerProbe() {
  const state = { terminated: 0, posted: 0, message: null, error: null, messageError: null };
  const worker = { postMessage() { state.posted += 1; }, terminate() { state.terminated += 1; } };
  for (const [property, key] of [['onmessage', 'message'], ['onerror', 'error'],
    ['onmessageerror', 'messageError']]) Object.defineProperty(worker, property, {
    get: () => state[key], set: (value) => { state[key] = value; }, enumerable: true,
  });
  return { worker, state };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function assertRealWorkerDirectParity() {
  const wasmUrl = new URL('../../third_party/ufbx/fbx_parser.wasm', import.meta.url);
  await access(wasmUrl);
  const [{ parseFbxBytesNode, parseFbxGeometryBundleNode },
    { parseFbxGeometryBundleInWorker }, { listFbxSourceGraphPreviewZones },
    { fixtureBytes }] = await Promise.all([
      import('../../tabs/model-converters/converters/fbx/parser-node.js'),
      import('../../tabs/model-converters/converters/fbx/geometry-transport.js'),
      import('../../tabs/model-converters/fbx-source-graph-preview.js'),
      import('./helpers.mjs'),
    ]);
  const bytes = await fixtureBytes(), before = bytes.slice();
  const graph = await parseFbxBytesNode(bytes);
  const directBundle = await parseFbxGeometryBundleNode(bytes);
  const workerUrl = new URL('../../tabs/model-converters/converters/fbx/parser-worker.js', import.meta.url);
  const workerBundle = await parseFbxGeometryBundleInWorker(bytes, {
    workerFactory: nodeWorkerFactory(workerUrl), timeoutMs: 120000,
  });
  const zone = listFbxSourceGraphPreviewZones(graph)
    .find((item) => item.zoneId !== 'preview-zone:unowned');
  assert.ok(zone, 'real fixture must expose a selected preview zone');
  const directResult = await analyseFbxZoneGeometry({ sourceGraph: graph,
    geometryBundle: directBundle, zoneId: zone.zoneId });
  const workerResult = await analyseFbxZoneGeometry({ sourceGraph: graph,
    geometryBundle: workerBundle, zoneId: zone.zoneId });
  assert.deepEqual(bytes, before);
  assert.equal(workerResult.zoneGeometryJson, directResult.zoneGeometryJson);
  assert.equal(workerResult.derivedPortJson, directResult.derivedPortJson);
}

async function assertTransportCleanup(bytes) {
  const { parseFbxGeometryBundleInWorker } = await import(
    '../../tabs/model-converters/converters/fbx/geometry-transport.js');
  const abortProbe = pendingWorkerProbe(), created = deferred();
  const abortController = new AbortController();
  const aborted = parseFbxGeometryBundleInWorker(bytes, {
    signal: abortController.signal,
    workerFactory: () => { created.resolve(); return abortProbe.worker; },
    timeoutMs: 120000,
  });
  await created.promise; abortController.abort();
  await assert.rejects(aborted, (error) => error?.code === 'FBX_WORKER_ABORTED');
  assert.equal(abortProbe.state.posted, 1);
  assert.equal(abortProbe.state.terminated, 1);
  assert.equal(abortProbe.state.message, null);
  assert.equal(abortProbe.state.error, null);
  assert.equal(abortProbe.state.messageError, null);

  const timeoutProbe = pendingWorkerProbe();
  await assert.rejects(() => parseFbxGeometryBundleInWorker(bytes, {
    workerFactory: () => timeoutProbe.worker, timeoutMs: 1,
  }), (error) => error?.code === 'FBX_WORKER_TIMEOUT');
  assert.equal(timeoutProbe.state.posted, 1);
  assert.equal(timeoutProbe.state.terminated, 1);
  assert.equal(timeoutProbe.state.message, null);
  assert.equal(timeoutProbe.state.error, null);
  assert.equal(timeoutProbe.state.messageError, null);
}

const fixture = await buildFixture();
const sourceBefore = [...fixture.sourceBytes];
const direct = await analyseFbxZoneGeometry({ sourceGraph: fixture.graph,
  geometryBundle: fixture.bundle, zoneId: 'occ:3' });
const parityController = createZoneAnalysisController({
  parseBundle: async (bytes, options) => { options.onProgress?.('preflight'); return fixture.bundle; },
  analyse: analyseFbxZoneGeometry,
});
const worker = await parityController.run({ bytes: fixture.sourceBytes,
  sourceGraph: fixture.graph, zoneId: 'occ:3' });
assert.equal(worker.zoneGeometryJson, direct.zoneGeometryJson);
assert.equal(worker.derivedPortJson, direct.derivedPortJson);
assert.deepEqual([...fixture.sourceBytes], sourceBefore);

let cancelledSignal = null;
const cancellationController = createZoneAnalysisController({
  parseBundle: (bytes, options) => new Promise((resolve, reject) => {
    cancelledSignal = options.signal;
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'),
      { code: 'FBX_WORKER_ABORTED' })), { once: true });
  }),
  analyse: analyseFbxZoneGeometry,
});
const cancelledRun = cancellationController.run({ bytes: fixture.sourceBytes,
  sourceGraph: fixture.graph, zoneId: 'occ:3' });
cancellationController.invalidate('zone changed');
assert.equal((await cancelledRun).stale, true);
assert.equal(cancelledSignal.aborted, true);
assert.equal(cancellationController.snapshot().zoneGeometryJson, null);
assert.equal(cancellationController.snapshot().derivedPortJson, null);
assert.equal(cancellationController.snapshot().phase, 'cancelled');
assert.equal(cancellationController.snapshot().status, ZONE_GEOMETRY_STATUS.CANCELLED);

const timeoutController = createZoneAnalysisController({
  parseBundle: async () => { throw Object.assign(new Error('timed out'), { code: 'FBX_WORKER_TIMEOUT' }); },
  analyse: analyseFbxZoneGeometry,
});
await assert.rejects(() => timeoutController.run({ bytes: fixture.sourceBytes,
  sourceGraph: fixture.graph, zoneId: 'occ:3' }), (error) => error.code === ZONE_GEOMETRY_STATUS.RESOURCE);
assert.equal(timeoutController.snapshot().zoneGeometryJson, null);
assert.equal(timeoutController.snapshot().derivedPortJson, null);

const firstParse = deferred(), secondParse = deferred();
let calls = 0;
const staleController = createZoneAnalysisController({
  parseBundle: () => (++calls === 1 ? firstParse.promise : secondParse.promise),
  analyse: analyseFbxZoneGeometry,
});
const firstRun = staleController.run({ bytes: fixture.sourceBytes,
  sourceGraph: fixture.graph, zoneId: 'occ:3' });
const secondRun = staleController.run({ bytes: fixture.sourceBytes,
  sourceGraph: fixture.graph, zoneId: 'occ:3' });
secondParse.resolve(fixture.bundle);
const secondResult = await secondRun;
firstParse.resolve(fixture.bundle);
assert.equal((await firstRun).stale, true);
assert.equal(staleController.snapshot().zoneGeometryJson, secondResult.zoneGeometryJson);
assert.equal(staleController.snapshot().phase, 'complete');

await assertRealWorkerDirectParity();
const { fixtureBytes } = await import('./helpers.mjs');
await assertTransportCleanup(await fixtureBytes());
console.log('test-zone-geometry-worker: PASS (real managed-worker parity: pass)');
