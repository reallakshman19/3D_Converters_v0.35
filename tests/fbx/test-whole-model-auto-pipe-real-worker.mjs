// End-to-end proof that the whole-model auto-pipe orchestrator wires
// correctly to the real Worker-based parser and geometry-bundle transport
// (not just injected fakes). two-pipes.fbx's synthetic geometry does not
// satisfy real cylindrical PIPE admission, so every zone is expected to
// block — this proves the mechanism runs end-to-end and falls back safely,
// not that any particular source model produces StagedJSON.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker as ThreadWorker } from 'node:worker_threads';

class NodeWorkerAdapter {
  constructor(url, options) {
    this.worker = new ThreadWorker(url, options);
    this._onmessage = null; this._onerror = null; this._onmessageerror = null;
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
  terminate() { return this.worker.terminate(); }
}

globalThis.Worker = NodeWorkerAdapter;

const { parseFbxInWorker } = await import('../../tabs/model-converters/converters/fbx/parser-client.js');
const { parseFbxGeometryBundleInWorker } = await import('../../tabs/model-converters/converters/fbx/geometry-transport.js');
const { runFbxWholeModelAutoPipe } = await import('../../tabs/model-converters/converters/fbx/zone-geometry/whole-model-auto-pipe.js');

const bytes = new Uint8Array(await readFile(new URL('../fixtures/fbx/two-pipes.fbx', import.meta.url)));
const sourceGraph = await parseFbxInWorker(bytes, { timeoutMs: 60000 });
const geometryBundle = await parseFbxGeometryBundleInWorker(bytes, { timeoutMs: 60000 });

const result = await runFbxWholeModelAutoPipe({ sourceGraph, geometryBundle });
assert.ok(result.counts.totalZones >= 2, 'two-pipes.fbx must expose at least its two occurrence zones');
assert.equal(result.conversionStatus, 'BLOCKED_WHOLE_MODEL_AUTO_PIPE', 'synthetic two-pipes.fbx geometry does not satisfy real cylindrical PIPE admission');
assert.equal(result.stagedJsonText, null);
for (const zone of result.zoneReports) {
  assert.equal(zone.status, 'BLOCKED_AUTO_PIPE_CLASSIFICATION');
  assert.equal(zone.error, null);
}

console.log('test-whole-model-auto-pipe-real-worker: PASS');
