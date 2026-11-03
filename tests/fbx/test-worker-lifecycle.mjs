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

function trackingSignal() {
  let listener = null;
  return {
    aborted: false,
    addCount: 0,
    removeCount: 0,
    addEventListener(_name, value) { this.addCount += 1; listener = value; },
    removeEventListener(_name, value) { if (listener === value) listener = null; this.removeCount += 1; },
    abort() { this.aborted = true; listener?.(); },
  };
}

const signal = trackingSignal();
let terminateCount = 0;
let lateHandler;
const successWorker = {
  onmessage: null, onerror: null, onmessageerror: null,
  terminate() { terminateCount += 1; },
  postMessage(job) {
    lateHandler = this.onmessage;
    queueMicrotask(() => {
      this.onmessage?.({ data: makeAccepted(job) });
      FBX_WORKER_STAGES.slice(0, -1).forEach((stage, ordinal) => {
        this.onmessage?.({ data: makeProgress(job.jobId, stage, ordinal) });
      });
      this.onmessage?.({ data: makeComplete(job.jobId, graph, {}) });
      lateHandler?.({ data: makeComplete(job.jobId, { schema: 'FbxSourceGraph.v2', late: true }, {}) });
    });
  },
};
assert.equal(await parseFbxInWorker(new Uint8Array([1]), {
  signal,
  workerFactory: () => successWorker,
  timeoutMs: 100,
}), graph);
assert.equal(terminateCount, 1);
assert.equal(signal.addCount, 1);
assert.equal(signal.removeCount, 1);
assert.equal(successWorker.onmessage, null);
assert.equal(successWorker.onerror, null);
assert.equal(successWorker.onmessageerror, null);

function malformedCompletionWorker() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage(job) {
      queueMicrotask(() => {
        this.onmessage?.({ data: makeAccepted(job) });
        FBX_WORKER_STAGES.slice(0, -1).forEach((stage, ordinal) => {
          this.onmessage?.({ data: makeProgress(job.jobId, stage, ordinal) });
        });
        this.onmessage?.({ data: makeComplete(job.jobId, { schema: 'FbxSourceGraph.v2' }, {}) });
      });
    },
  };
}
await assert.rejects(
  () => parseFbxInWorker(new Uint8Array([1]), { workerFactory: malformedCompletionWorker, timeoutMs: 100 }),
  (error) => error.code === FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
);

function wrongIdWorker() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage(job) {
      queueMicrotask(() => this.onmessage?.({ data: { ...makeAccepted(job), jobId: 'wrong-id' } }));
    },
  };
}
await assert.rejects(
  () => parseFbxInWorker(new Uint8Array([1]), { workerFactory: wrongIdWorker, timeoutMs: 100 }),
  (error) => error.code === FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
);

function runtimeErrorWorker() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage() { queueMicrotask(() => this.onerror?.({ message: 'worker-error-proof' })); },
  };
}
await assert.rejects(
  () => parseFbxInWorker(new Uint8Array([1]), { workerFactory: runtimeErrorWorker, timeoutMs: 100 }),
  (error) => error.code === FBX_WORKER_ERROR_CODES.RUNTIME_ERROR && /worker/i.test(error.message),
);

function messageErrorWorker() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage() { queueMicrotask(() => this.onmessageerror?.({})); },
  };
}
await assert.rejects(
  () => parseFbxInWorker(new Uint8Array([1]), { workerFactory: messageErrorWorker, timeoutMs: 100 }),
  (error) => error.code === FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
);

console.log('test-worker-lifecycle: PASS');
