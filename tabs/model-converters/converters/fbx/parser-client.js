import {
  FBX_WORKER_JOB_SCHEMA,
  FBX_WORKER_OPERATION,
  FBX_WORKER_TYPES,
  FBX_WORKER_ERROR_CODES,
  FbxWorkerRuntimeError,
  assertAcceptedMessage,
  assertCompleteMessage,
  assertErrorMessage,
  assertProgressMessage,
  assertWorkerEnvelope,
  protocolError,
} from './worker-protocol.js';

const DEFAULT_TIMEOUT_MS = 120000;
let requestCounter = 0;

function defaultWorkerFactory() {
  return new Worker(new URL('./parser-worker.js', import.meta.url), { type: 'module' });
}

function byteView(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

function localError(code, message, progressStages, options = {}) {
  return new FbxWorkerRuntimeError(code, message, {
    progressStages,
    stage: progressStages.at(-1) || null,
    ...options,
  });
}

function safeNotify(callback, ...args) {
  if (typeof callback !== 'function') return;
  try {
    callback(...args);
  } catch {
    // Runtime observers are non-authoritative and cannot alter settlement.
  }
}

function normalizedTimeout(value) {
  const timeout = value === undefined ? DEFAULT_TIMEOUT_MS : value;
  if (timeout === null || timeout === false || timeout === 0) return 0;
  if (!Number.isFinite(timeout) || timeout < 0) throw new TypeError('FBX worker timeoutMs must be non-negative.');
  return timeout;
}

export function parseFbxInWorker(bytes, options = {}) {
  const signal = options.signal;
  if (signal?.aborted) {
    return Promise.reject(localError(FBX_WORKER_ERROR_CODES.ABORTED, 'FBX parsing was cancelled.', []));
  }
  const source = byteView(bytes);
  const copy = source.slice();
  const inputByteLength = copy.byteLength;
  const jobId = `fbx-parse-${++requestCounter}`;
  const timeoutMs = normalizedTimeout(options.timeoutMs);
  let worker;
  try {
    worker = (options.workerFactory || defaultWorkerFactory)();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return Promise.reject(localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR, 'FBX worker creation failed.', [], { detail }));
  }
  return runWorkerJob({ worker, copy, inputByteLength, jobId, timeoutMs, signal, options });
}

const runWorkerJob = (context) => {
  const { worker, copy, inputByteLength, jobId, timeoutMs, signal, options } = context;
  return new Promise((resolve, reject) => {
    let state = 'PENDING';
    let accepted = false;
    let terminated = false;
    let timeoutHandle = null;
    const progressStages = [];

    const cleanup = () => {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      timeoutHandle = null;
      signal?.removeEventListener('abort', abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      if (!terminated) {
        terminated = true;
        try { worker.terminate(); } catch { /* settlement remains authoritative */ }
      }
    };

    const settle = (terminalState, value) => {
      if (state !== 'PENDING') return false;
      state = terminalState;
      cleanup();
      if (terminalState === 'SETTLED_SUCCESS') resolve(value);
      else reject(value);
      return true;
    };

    const abort = () => settle('SETTLED_ABORT', localError(
      FBX_WORKER_ERROR_CODES.ABORTED,
      'FBX parsing was cancelled.',
      progressStages,
    ));

    const failRuntime = (message, detail) => settle('SETTLED_ERROR', localError(
      FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
      message,
      progressStages,
      { detail },
    ));

    worker.onerror = (event) => failRuntime('The FBX worker runtime failed.', event?.message || null);
    worker.onmessageerror = () => failRuntime('The FBX worker returned an unreadable message.', 'message-deserialization-failed');
    worker.onmessage = (event) => handleWorkerMessage({
      event, jobId, inputByteLength, progressStages, accepted: () => accepted,
      markAccepted: () => { accepted = true; }, isPending: () => state === 'PENDING', settle, options,
    });

    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    if (timeoutMs > 0) timeoutHandle = setTimeout(() => settle('SETTLED_TIMEOUT', localError(
      FBX_WORKER_ERROR_CODES.TIMEOUT,
      'FBX parsing timed out.',
      progressStages,
      { detail: `timeoutMs=${timeoutMs}` },
    )), timeoutMs);
    if (state !== 'PENDING') return;
    try {
      worker.postMessage({
        schema: FBX_WORKER_JOB_SCHEMA,
        operation: FBX_WORKER_OPERATION,
        jobId,
        inputByteLength,
        bytes: copy.buffer,
      }, [copy.buffer]);
    } catch (error) {
      failRuntime('The FBX worker job could not be dispatched.', error instanceof Error ? error.message : String(error));
    }
  });
};

function settleWorkerError(message, progressStages, settle, options) {
  assertErrorMessage(message, progressStages);
  const failure = new FbxWorkerRuntimeError(message.code, message.message, message);
  const settled = settle('SETTLED_ERROR', failure);
  if (settled) safeNotify(options.onDiagnostics, message.diagnostics);
}

function handleWorkerMessage(context) {
  const { event, jobId, inputByteLength, progressStages, accepted, markAccepted, isPending, settle, options } = context;
  if (!isPending()) return;
  try {
    const message = assertWorkerEnvelope(event?.data, jobId);
    if (message.type === FBX_WORKER_TYPES.ACCEPTED) {
      if (accepted() || progressStages.length) throw protocolError('Worker accepted the job more than once.', progressStages);
      assertAcceptedMessage(message, inputByteLength);
      markAccepted();
      return;
    }
    if (!accepted()) {
      if (message.type !== FBX_WORKER_TYPES.ERROR || message.code !== FBX_WORKER_ERROR_CODES.JOB_INVALID) {
        throw protocolError('Worker emitted a message before accepting the job.', progressStages);
      }
      settleWorkerError(message, progressStages, settle, options);
      return;
    }
    if (message.type === FBX_WORKER_TYPES.PROGRESS) {
      assertProgressMessage(message, progressStages);
      progressStages.push(message.stage);
      safeNotify(options.onProgress, message.stage, Object.freeze({ ordinal: message.ordinal, progressStages: [...progressStages] }));
      return;
    }
    if (message.type === FBX_WORKER_TYPES.COMPLETE) {
      assertCompleteMessage(message, progressStages);
      const settled = settle('SETTLED_SUCCESS', message.graph);
      if (settled) safeNotify(options.onDiagnostics, message.diagnostics);
      return;
    }
    settleWorkerError(message, progressStages, settle, options);
  } catch (error) {
    const failure = error instanceof FbxWorkerRuntimeError
      ? error
      : localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR, 'The FBX worker protocol failed.', progressStages, { detail: String(error) });
    settle('SETTLED_ERROR', failure);
  }
}
