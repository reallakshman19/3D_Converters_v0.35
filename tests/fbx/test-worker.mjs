import assert from 'node:assert/strict';
import { parseFbxInWorker } from '../../tabs/model-converters/converters/fbx/parser-client.js';
import { handleFbxWorkerMessage } from '../../tabs/model-converters/converters/fbx/parser-worker.js';
import {
  FBX_WORKER_ERROR_CODES,
  FBX_WORKER_STAGES,
  FBX_WORKER_TYPES,
  FbxWorkerRuntimeError,
  makeAccepted,
  makeProgress,
  makeWorkerError,
} from '../../tabs/model-converters/converters/fbx/worker-protocol.js';

const invalidMessages = [];
await handleFbxWorkerMessage({ type: 'parse' }, (message) => invalidMessages.push(message));
assert.equal(invalidMessages.length, 1);
assert.equal(invalidMessages[0].type, FBX_WORKER_TYPES.ERROR);
assert.equal(invalidMessages[0].code, FBX_WORKER_ERROR_CODES.JOB_INVALID);
assert.deepEqual(invalidMessages[0].progressStages, []);

const rejectedMessages = [];
await handleFbxWorkerMessage({
  schema: 'FbxWorkerJob.v1', operation: 'PARSE_SOURCE_GRAPH', jobId: 'parse-rejection',
  inputByteLength: 1, bytes: new ArrayBuffer(1),
}, (message) => rejectedMessages.push(message), {
  preflight() {},
  async parse(_bytes, { onStage }) {
    for (const stage of FBX_WORKER_STAGES.slice(1, 4)) onStage(stage);
    throw new FbxWorkerRuntimeError(
      FBX_WORKER_ERROR_CODES.PARSE_REJECTED,
      'The FBX parser rejected the input.',
      { stage: 'parsing-fbx', detail: 'ufbx-proof' },
    );
  },
});
assert.equal(rejectedMessages.at(-1).code, FBX_WORKER_ERROR_CODES.PARSE_REJECTED);
assert.deepEqual(rejectedMessages.at(-1).progressStages, FBX_WORKER_STAGES.slice(0, 4));
assert.equal(rejectedMessages.at(-1).detail, 'ufbx-proof');

async function injectedFailure(code, emittedStages) {
  const messages = [];
  await handleFbxWorkerMessage({
    schema: 'FbxWorkerJob.v1', operation: 'PARSE_SOURCE_GRAPH', jobId: `failure-${code}`,
    inputByteLength: 1, bytes: new ArrayBuffer(1),
  }, (message) => messages.push(message), {
    preflight() {},
    async parse(_bytes, { onStage }) {
      for (const stage of emittedStages) onStage(stage);
      throw new FbxWorkerRuntimeError(code, `failure-${code}`, {
        stage: emittedStages.at(-1), detail: `detail-${code}`,
      });
    },
  });
  return messages.at(-1);
}

const wasmFailure = await injectedFailure(
  FBX_WORKER_ERROR_CODES.WASM_LOAD_FAILED,
  ['loading-wasm'],
);
assert.equal(wasmFailure.code, FBX_WORKER_ERROR_CODES.WASM_LOAD_FAILED);
assert.deepEqual(wasmFailure.progressStages, ['preflight', 'loading-wasm']);

const decodeFailure = await injectedFailure(
  FBX_WORKER_ERROR_CODES.RESULT_DECODE_FAILED,
  ['loading-wasm', 'copying-input', 'parsing-fbx', 'decoding-result'],
);
assert.equal(decodeFailure.code, FBX_WORKER_ERROR_CODES.RESULT_DECODE_FAILED);
assert.deepEqual(decodeFailure.progressStages, FBX_WORKER_STAGES.slice(0, 5));

const policyMessages = [];
await handleFbxWorkerMessage({
  schema: 'FbxWorkerJob.v1', operation: 'PARSE_SOURCE_GRAPH', jobId: 'policy-failure',
  inputByteLength: 1, bytes: new ArrayBuffer(1),
}, (message) => policyMessages.push(message), {
  preflight() {},
  async parse(_bytes, { onStage }) {
    for (const stage of FBX_WORKER_STAGES.slice(1, 5)) onStage(stage);
    return { schema: 'FbxSourceGraph.v2' };
  },
  enforce() { throw new Error('policy-proof'); },
});
assert.equal(policyMessages.at(-1).code, FBX_WORKER_ERROR_CODES.SOURCE_GRAPH_POLICY_FAILED);
assert.match(policyMessages.at(-1).detail, /policy-proof/);

function errorWorker() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage(job) {
      queueMicrotask(() => {
        this.onmessage?.({ data: makeAccepted(job) });
        const progress = [];
        for (const [ordinal, stage] of FBX_WORKER_STAGES.slice(0, 4).entries()) {
          progress.push(stage);
          this.onmessage?.({ data: makeProgress(job.jobId, stage, ordinal) });
        }
        const failure = new FbxWorkerRuntimeError(
          FBX_WORKER_ERROR_CODES.PARSE_REJECTED,
          'The FBX parser rejected the input.',
          { stage: 'parsing-fbx', detail: 'parser-error-proof' },
        );
        this.onmessage?.({ data: makeWorkerError(job.jobId, failure, progress, {}) });
      });
    },
  };
}
await assert.rejects(
  () => parseFbxInWorker(new Uint8Array([1]), { workerFactory: errorWorker, timeoutMs: 100 }),
  (error) => error.code === FBX_WORKER_ERROR_CODES.PARSE_REJECTED
    && error.detail === 'parser-error-proof',
);

function invalidJobWorker() {
  return {
    onmessage: null, onerror: null, onmessageerror: null,
    terminate() {},
    postMessage(job) {
      const failure = new FbxWorkerRuntimeError(
        FBX_WORKER_ERROR_CODES.JOB_INVALID,
        'The FBX worker job is invalid.',
        { detail: 'job-invalid-proof' },
      );
      queueMicrotask(() => this.onmessage?.({ data: makeWorkerError(job.jobId, failure, [], {}) }));
    },
  };
}
await assert.rejects(
  () => parseFbxInWorker(new Uint8Array([1]), { workerFactory: invalidJobWorker, timeoutMs: 100 }),
  (error) => error.code === FBX_WORKER_ERROR_CODES.JOB_INVALID
    && error.detail === 'job-invalid-proof',
);

console.log('test-worker: PASS');
