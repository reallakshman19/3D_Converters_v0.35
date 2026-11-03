import assert from 'node:assert/strict';
import { parseFbxInWorker } from '../../tabs/model-converters/converters/fbx/parser-client.js';
import {
  FBX_WORKER_ERROR_CODES,
  FBX_WORKER_STAGES,
  makeAccepted,
  makeComplete,
  makeProgress,
} from '../../tabs/model-converters/converters/fbx/worker-protocol.js';

const graph = {
  schema: 'FbxSourceGraph.v2',
  file: { version: 7400, ascii: false, creator: '' },
  documentMetadata: { originalApplication: '', latestApplication: '' },
  globalSettings: { unitMeters: 1, axes: { right: 0, up: 1, front: 2 } },
  sourceObjects: [], occurrences: [], geometries: [], hierarchyEdges: [],
  connectionEdges: [], warnings: [], unsupportedRecords: [], unresolvedReferences: [],
  duplicateSourceObjectIds: [],
};

let factoryCalls = 0;
const preAborted = new AbortController();
preAborted.abort();
await assert.rejects(
  () => parseFbxInWorker(new Uint8Array([1]), {
    signal: preAborted.signal,
    workerFactory() { factoryCalls += 1; return {}; },
  }),
  (error) => error.code === FBX_WORKER_ERROR_CODES.ABORTED,
);
assert.equal(factoryCalls, 0, 'already-aborted signals must not create workers');

let terminateCount = 0;
let savedOnMessage = null;
const worker = {
  onmessage: null, onerror: null, onmessageerror: null,
  terminate() { terminateCount += 1; },
  postMessage(job) {
    savedOnMessage = this.onmessage;
    this.onmessage?.({ data: makeAccepted(job) });
    this.onmessage?.({ data: makeProgress(job.jobId, 'preflight', 0) });
    this.job = job;
  },
};
const controller = new AbortController();
const observed = [];
const pending = parseFbxInWorker(new Uint8Array([1]), {
  signal: controller.signal,
  workerFactory: () => worker,
  timeoutMs: 100,
  onProgress: (stage) => observed.push(stage),
});
controller.abort();
await assert.rejects(
  () => pending,
  (error) => error.code === FBX_WORKER_ERROR_CODES.ABORTED
    && error.progressStages.join(',') === 'preflight',
);
assert.equal(terminateCount, 1);
assert.deepEqual(observed, ['preflight']);

for (const [ordinal, stage] of FBX_WORKER_STAGES.slice(1, -1).entries()) {
  savedOnMessage?.({ data: makeProgress(worker.job.jobId, stage, ordinal + 1) });
}
savedOnMessage?.({ data: makeComplete(worker.job.jobId, graph, {}) });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(terminateCount, 1, 'late completion must not trigger another terminal transition');
assert.deepEqual(observed, ['preflight'], 'late progress must not reach observers');

console.log('test-worker-cancellation: PASS');
