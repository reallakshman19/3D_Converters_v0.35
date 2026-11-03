import { deepFreeze } from './canonical-json.js';
import { loadFbxParserIdentity } from './parser-wasm.js';
import { sha256Hex } from './sha256.js';
import { preflightFbxInput } from './worker-preflight.js';
import { FBX_WORKER_ERROR_CODES, FbxWorkerRuntimeError, protocolError } from './worker-protocol.js';
import {
  FBX_GEOMETRY_WORKER_ERROR_CODES, FBX_GEOMETRY_WORKER_JOB_SCHEMA,
  FBX_GEOMETRY_WORKER_OPERATION, FBX_GEOMETRY_WORKER_TYPES,
  assertGeometryAcceptedMessage, assertGeometryCompleteMessage,
  assertGeometryErrorMessage, assertGeometryProgressMessage,
  assertGeometryWorkerEnvelope,
} from './geometry-worker-protocol.js';

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
    progressStages, stage: progressStages.at(-1) || null, ...options,
  });
}
function safeNotify(callback, ...args) {
  if (typeof callback !== 'function') return;
  try { callback(...args); } catch { /* Runtime observers cannot alter settlement. */ }
}
function normalizedTimeout(value) {
  const timeout = value === undefined ? DEFAULT_TIMEOUT_MS : value;
  if (timeout === null || timeout === false || timeout === 0) return 0;
  if (!Number.isFinite(timeout) || timeout < 0) throw new TypeError('FBX geometry worker timeoutMs must be non-negative.');
  return timeout;
}
function parserIdentitiesEqual(left, right) {
  return left?.provenanceSchema === right?.provenanceSchema
    && left?.upstreamRevision === right?.upstreamRevision
    && left?.sourceSha256 === right?.sourceSha256 && left?.wasmSha256 === right?.wasmSha256;
}
function sourceIdentitiesEqual(left, right) {
  return left?.sha256 === right?.sha256 && left?.byteLength === right?.byteLength
    && left?.fbxVersion === right?.fbxVersion;
}
function freezeBundle(message) {
  deepFreeze(message.manifest);
  for (const item of message.buffers) Object.freeze(item);
  return Object.freeze({ manifest: message.manifest, buffers: Object.freeze(message.buffers) });
}
function settleGeometryError(message, progressStages, settle, options) {
  assertGeometryErrorMessage(message, progressStages);
  const failure = new FbxWorkerRuntimeError(message.code, message.message, message);
  const settled = settle('SETTLED_ERROR', failure);
  if (settled) safeNotify(options.onDiagnostics, message.diagnostics);
}
async function handleWorkerMessage(context, event) {
  const { jobId, inputByteLength, sourceIdentity, parserIdentity, progressStages,
    accepted, markAccepted, beginValidation, isPending, settle, options } = context;
  if (!isPending()) return;
  try {
    const message = assertGeometryWorkerEnvelope(event?.data, jobId);
    if (message.type === FBX_GEOMETRY_WORKER_TYPES.ACCEPTED) {
      if (accepted() || progressStages.length) throw protocolError('Geometry worker accepted the job more than once.', progressStages);
      assertGeometryAcceptedMessage(message, inputByteLength); markAccepted(); return;
    }
    if (!accepted()) {
      if (message.type !== FBX_GEOMETRY_WORKER_TYPES.ERROR
        || message.code !== FBX_GEOMETRY_WORKER_ERROR_CODES.JOB_INVALID) throw protocolError('Geometry worker emitted a message before accepting the job.', progressStages);
      settleGeometryError(message, progressStages, settle, options); return;
    }
    if (message.type === FBX_GEOMETRY_WORKER_TYPES.PROGRESS) {
      assertGeometryProgressMessage(message, progressStages); progressStages.push(message.stage);
      safeNotify(options.onProgress, message.stage,
        Object.freeze({ ordinal: message.ordinal, progressStages: [...progressStages] }));
      return;
    }
    if (message.type === FBX_GEOMETRY_WORKER_TYPES.ERROR) {
      settleGeometryError(message, progressStages, settle, options); return;
    }
    beginValidation(); await assertGeometryCompleteMessage(message, progressStages);
    if (!sourceIdentitiesEqual(message.manifest.sourceIdentity, sourceIdentity)
      || !parserIdentitiesEqual(message.manifest.parserIdentity, parserIdentity)) throw protocolError('Geometry completion identity differs from the active job.', progressStages);
    const settled = settle('SETTLED_SUCCESS', freezeBundle(message));
    if (settled) safeNotify(options.onDiagnostics, message.diagnostics);
  } catch (error) {
    const failure = error instanceof FbxWorkerRuntimeError ? error
      : typeof error?.code === 'string' ? localError(error.code,
        'The FBX geometry worker completion failed validation.', progressStages,
        { detail: error instanceof Error ? error.message : String(error) })
        : localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
          'The FBX geometry worker protocol failed.', progressStages, { detail: String(error) });
    settle('SETTLED_ERROR', failure);
  }
}
function geometryJob(jobId, inputByteLength, bytes, sourceIdentity, parserIdentity) {
  return { schema: FBX_GEOMETRY_WORKER_JOB_SCHEMA, operation: FBX_GEOMETRY_WORKER_OPERATION,
    jobId, inputByteLength, bytes, sourceIdentity, parserIdentity };
}
function runWorkerJob(context) {
  const { worker, copy, inputByteLength, jobId, timeoutMs, signal, options, sourceIdentity, parserIdentity } = context;
  return new Promise((resolve, reject) => {
    let state = 'PENDING', accepted = false, terminated = false, timeoutHandle = null;
    const progressStages = [];
    const cleanup = () => {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle); timeoutHandle = null; signal?.removeEventListener('abort', abort);
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
      if (!terminated) { terminated = true; try { worker.terminate(); } catch { /* settlement remains authoritative */ } }
    };
    const settle = (terminalState, value) => {
      if (state.startsWith('SETTLED')) return false;
      state = terminalState; cleanup();
      if (terminalState === 'SETTLED_SUCCESS') resolve(value); else reject(value);
      return true;
    };
    const abort = () => settle('SETTLED_ABORT', localError(
      FBX_WORKER_ERROR_CODES.ABORTED, 'FBX geometry parsing was cancelled.', progressStages));
    const failRuntime = (message, detail) => settle('SETTLED_ERROR', localError(
      FBX_WORKER_ERROR_CODES.RUNTIME_ERROR, message, progressStages, { detail }));
    const messageContext = {
      jobId, inputByteLength, sourceIdentity, parserIdentity, progressStages,
      accepted: () => accepted, markAccepted: () => { accepted = true; },
      beginValidation: () => { if (state === 'PENDING') state = 'VALIDATING'; },
      isPending: () => state === 'PENDING', settle, options,
    };
    worker.onerror = (event) => failRuntime('The FBX geometry worker runtime failed.', event?.message || null);
    worker.onmessageerror = () => failRuntime('The FBX geometry worker returned an unreadable message.', 'message-deserialization-failed');
    worker.onmessage = (event) => { void handleWorkerMessage(messageContext, event); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    if (timeoutMs > 0) timeoutHandle = setTimeout(() => settle('SETTLED_TIMEOUT', localError(
      FBX_WORKER_ERROR_CODES.TIMEOUT, 'FBX geometry parsing timed out.', progressStages,
      { detail: `timeoutMs=${timeoutMs}` })), timeoutMs);
    try { worker.postMessage(geometryJob(jobId, inputByteLength, copy.buffer,
      sourceIdentity, parserIdentity), [copy.buffer]); }
    catch (error) { failRuntime('The FBX geometry worker job could not be dispatched.', error instanceof Error ? error.message : String(error)); }
  });
}
async function verifiedParserIdentity(requested) {
  const actual = await loadFbxParserIdentity();
  if (requested && !parserIdentitiesEqual(requested, actual)) throw localError(
    FBX_WORKER_ERROR_CODES.WASM_LOAD_FAILED,
    'The FBX parser identity differs from repository provenance.', [],
    { stage: 'loading-wasm', detail: 'parser-identity-mismatch' });
  return structuredClone(actual);
}
export async function parseFbxGeometryBundleInWorker(bytes, options = {}) {
  const signal = options.signal;
  if (signal?.aborted) throw localError(FBX_WORKER_ERROR_CODES.ABORTED, 'FBX geometry parsing was cancelled.', []);
  const copy = byteView(bytes).slice(), inputByteLength = copy.byteLength;
  const preflight = preflightFbxInput(copy, inputByteLength);
  const actualSourceIdentity = {
    sha256: await sha256Hex(copy), byteLength: inputByteLength, fbxVersion: preflight.version,
  };
  if (options.sourceIdentity && !sourceIdentitiesEqual(options.sourceIdentity, actualSourceIdentity)) throw localError(
    FBX_GEOMETRY_WORKER_ERROR_CODES.BUNDLE_INVALID,
    'The FBX source identity differs from the supplied bytes.', [],
    { stage: 'preflight', detail: 'source-identity-mismatch' });
  const parserIdentity = await verifiedParserIdentity(options.parserIdentity);
  if (signal?.aborted) throw localError(FBX_WORKER_ERROR_CODES.ABORTED, 'FBX geometry parsing was cancelled.', []);
  const jobId = `fbx-geometry-${++requestCounter}`, timeoutMs = normalizedTimeout(options.timeoutMs);
  let worker;
  try { worker = (options.workerFactory || defaultWorkerFactory)(); }
  catch (error) { throw localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
    'FBX geometry worker creation failed.', [], { detail: error instanceof Error ? error.message : String(error) }); }
  return runWorkerJob({ worker, copy, inputByteLength, jobId, timeoutMs, signal,
    options, sourceIdentity: actualSourceIdentity, parserIdentity });
}
