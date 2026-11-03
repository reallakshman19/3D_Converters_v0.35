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
let terminateCount = 0;
let savedOnMessage;
let savedJob;
const stalledWorker = {
  onmessage: null, onerror: null, onmessageerror: null,
  terminate() { terminateCount += 1; },
  postMessage(job) {
    savedJob = job;
    savedOnMessage = this.onmessage;
    this.onmessage?.({ data: makeAccepted(job) });
    this.onmessage?.({ data: makeProgress(job.jobId, 'preflight', 0) });
  },
};
const pending = parseFbxInWorker(new Uint8Array([1]), {
  workerFactory: () => stalledWorker,
  timeoutMs: 5,
});
await assert.rejects(
  () => pending,
  (error) => error.code === FBX_WORKER_ERROR_CODES.TIMEOUT
    && error.progressStages.join(',') === 'preflight',
);
assert.equal(terminateCount, 1);

for (const [ordinal, stage] of FBX_WORKER_STAGES.slice(1, -1).entries()) {
  savedOnMessage?.({ data: makeProgress(savedJob.jobId, stage, ordinal + 1) });
}
savedOnMessage?.({ data: makeComplete(savedJob.jobId, graph, {}) });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(terminateCount, 1);

const freshWorker = {
  onmessage: null, onerror: null, onmessageerror: null,
  terminate() {},
  postMessage(job) {
    queueMicrotask(() => {
      this.onmessage?.({ data: makeAccepted(job) });
      FBX_WORKER_STAGES.slice(0, -1).forEach((stage, ordinal) => {
        this.onmessage?.({ data: makeProgress(job.jobId, stage, ordinal) });
      });
      this.onmessage?.({ data: makeComplete(job.jobId, graph, {}) });
    });
  },
};
assert.equal(await parseFbxInWorker(new Uint8Array([1]), {
  workerFactory: () => freshWorker,
  timeoutMs: 100,
}), graph);

console.log('test-worker-timeout: PASS');
