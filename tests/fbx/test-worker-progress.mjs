import assert from 'node:assert/strict';
import { parseFbxInWorker } from '../../tabs/model-converters/converters/fbx/parser-client.js';
import { handleFbxWorkerMessage } from '../../tabs/model-converters/converters/fbx/parser-worker.js';
import {
  FBX_WORKER_MESSAGE_SCHEMA,
  FBX_WORKER_STAGES,
  FBX_WORKER_TYPES,
  FBX_WORKER_ERROR_CODES,
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

function successWorker() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage(job) {
      queueMicrotask(() => {
        this.onmessage?.({ data: makeAccepted(job) });
        FBX_WORKER_STAGES.slice(0, -1).forEach((stage, ordinal) => {
          this.onmessage?.({ data: makeProgress(job.jobId, stage, ordinal) });
        });
        this.onmessage?.({ data: makeComplete(job.jobId, graph, { progressStages: FBX_WORKER_STAGES.slice(0, -1) }) });
      });
    },
  };
}

const received = [];
const result = await parseFbxInWorker(new Uint8Array([1]), {
  workerFactory: successWorker,
  onProgress: (stage) => received.push(stage),
  timeoutMs: 100,
});
assert.equal(result, graph);
assert.deepEqual(received, FBX_WORKER_STAGES.slice(0, -1));

function invalidProgressWorker() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage(job) {
      queueMicrotask(() => {
        this.onmessage?.({ data: makeAccepted(job) });
        this.onmessage?.({ data: makeProgress(job.jobId, 'parsing-fbx', 0) });
      });
    },
  };
}
await assert.rejects(
  () => parseFbxInWorker(new Uint8Array([1]), { workerFactory: invalidProgressWorker, timeoutMs: 100 }),
  (error) => error.code === FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
);

const messages = [];
const bytes = new ArrayBuffer(1);
await handleFbxWorkerMessage({
  schema: 'FbxWorkerJob.v1', operation: 'PARSE_SOURCE_GRAPH', jobId: 'worker-progress',
  inputByteLength: 1, bytes,
}, (message) => messages.push(message), {
  preflight() {},
  async parse(_bytes, { onStage }) {
    for (const stage of FBX_WORKER_STAGES.slice(1, 5)) onStage(stage);
    return graph;
  },
  enforce(value) { return value; },
  freeze(value) { return value; },
});
assert.deepEqual(
  messages.map((message) => message.type),
  [
    FBX_WORKER_TYPES.ACCEPTED,
    ...FBX_WORKER_STAGES.slice(0, -1).map(() => FBX_WORKER_TYPES.PROGRESS),
    FBX_WORKER_TYPES.COMPLETE,
  ],
);
assert.deepEqual(
  messages.filter((message) => message.type === FBX_WORKER_TYPES.PROGRESS).map((message) => message.stage),
  FBX_WORKER_STAGES.slice(0, -1),
);
assert.ok(messages.every((message) => message.schema === FBX_WORKER_MESSAGE_SCHEMA));

console.log('test-worker-progress: PASS');
