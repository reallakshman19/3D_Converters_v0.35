// Run FBX attribute parsing in a managed worker and validate transferred evidence.
// Inputs are copied bytes/options; every terminal path terminates the worker without fallback.
import { deepFreeze } from './canonical-json.js';
import { validateFbxGeometryBundle } from './geometry-bundle.js';
import { loadFbxParserIdentity } from './parser-wasm.js';
import { sha256Hex } from './sha256.js';
import { validateFbxVertexAttributeBundle } from './vertex-attribute-bundle.js';
import { preflightFbxInput } from './worker-preflight.js';
import { FBX_WORKER_ERROR_CODES, FbxWorkerRuntimeError } from './worker-protocol.js';
import {
  FBX_ATTRIBUTE_WORKER_JOB_SCHEMA,
  FBX_ATTRIBUTE_WORKER_OPERATION,
  FBX_ATTRIBUTE_WORKER_TYPES,
  assertFbxAttributeAccepted,
  assertFbxAttributeComplete,
  assertFbxAttributeError,
  assertFbxAttributeWorkerEnvelope,
} from './vertex-attribute-worker-protocol.js';

const DEFAULT_TIMEOUT_MS = 120000;
let requestCounter = 0;

function defaultWorkerFactory() {
  return new Worker(new URL('./vertex-attribute-worker.js', import.meta.url), { type: 'module' });
}

function byteView(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

function parserIdentityEqual(left, right) {
  return left?.provenanceSchema === right?.provenanceSchema
    && left?.upstreamRevision === right?.upstreamRevision
    && left?.sourceSha256 === right?.sourceSha256
    && left?.wasmSha256 === right?.wasmSha256;
}

function sourceIdentityEqual(left, right) {
  return left?.sha256 === right?.sha256 && left?.byteLength === right?.byteLength
    && left?.fbxVersion === right?.fbxVersion;
}

function freezeBundle(bundle) {
  deepFreeze(bundle.manifest);
  for (const item of bundle.buffers) Object.freeze(item);
  Object.freeze(bundle.buffers);
  return Object.freeze(bundle);
}

function localError(code, message, stage, detail = null) {
  return new FbxWorkerRuntimeError(code, message, { stage, detail });
}

function timeoutValue(value) {
  const timeout = value === undefined ? DEFAULT_TIMEOUT_MS : value;
  if (timeout === null || timeout === false || timeout === 0) return 0;
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new TypeError('FBX attribute worker timeoutMs must be non-negative.');
  }
  return timeout;
}

async function validateCompletion(message, sourceIdentity, parserIdentity) {
  await assertFbxAttributeComplete(message);
  await validateFbxGeometryBundle(message.geometryBundle);
  await validateFbxVertexAttributeBundle(message.attributeBundle);
  if (!sourceIdentityEqual(message.geometryBundle.manifest.sourceIdentity, sourceIdentity)
    || !parserIdentityEqual(message.geometryBundle.manifest.parserIdentity, parserIdentity)) {
    throw localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
      'The FBX attribute worker completion identity differs.', 'validating-result',
      'completion-identity-mismatch');
  }
  return Object.freeze({
    geometryBundle: freezeBundle(message.geometryBundle),
    attributeBundle: freezeBundle(message.attributeBundle),
  });
}

async function handleJobMessage(event, job, status, settle, identities) {
  try {
    const message = assertFbxAttributeWorkerEnvelope(event?.data, job.jobId);
    if (message.type === FBX_ATTRIBUTE_WORKER_TYPES.ACCEPTED) {
      if (status.accepted) throw localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
        'The FBX attribute worker accepted twice.', null, 'duplicate-acceptance');
      assertFbxAttributeAccepted(message, job.inputByteLength);
      status.accepted = true;
      return;
    }
    if (!status.accepted) throw localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
      'The FBX attribute worker completed before acceptance.', null,
      'terminal-before-acceptance');
    if (message.type === FBX_ATTRIBUTE_WORKER_TYPES.ERROR) {
      assertFbxAttributeError(message);
      settle('ERROR', new FbxWorkerRuntimeError(message.code, message.message, message));
      return;
    }
    status.state = 'VALIDATING';
    settle('SUCCESS', await validateCompletion(
      message, identities.sourceIdentity, identities.parserIdentity));
  } catch (error) {
    settle('ERROR', error instanceof FbxWorkerRuntimeError ? error
      : localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
        'The FBX attribute worker protocol failed.', 'validating-result', String(error)));
  }
}

function runJob({ worker, job, signal, timeoutMs, sourceIdentity, parserIdentity }) {
  return new Promise((resolve, reject) => {
    const status = { state: 'PENDING', accepted: false };
    let timeoutHandle = null, terminated = false;
    const cleanup = () => {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      timeoutHandle = null;
      signal?.removeEventListener('abort', abort);
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
      if (!terminated) { terminated = true; try { worker.terminate(); } catch { /* settled */ } }
    };
    const settle = (next, value) => {
      if (status.state !== 'PENDING' && status.state !== 'VALIDATING') return false;
      status.state = next; cleanup();
      if (next === 'SUCCESS') resolve(value); else reject(value);
      return true;
    };
    const abort = () => settle('ABORTED', localError(FBX_WORKER_ERROR_CODES.ABORTED,
      'FBX attribute parsing was cancelled.', status.accepted ? 'worker' : null));
    worker.onerror = (event) => settle('ERROR', localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
      'The FBX attribute worker runtime failed.', status.accepted ? 'worker' : null,
      event?.message || null));
    worker.onmessageerror = () => settle('ERROR', localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
      'The FBX attribute worker returned an unreadable message.', status.accepted ? 'worker' : null,
      'message-deserialization-failed'));
    worker.onmessage = (event) => {
      void handleJobMessage(
        event, job, status, settle, { sourceIdentity, parserIdentity });
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    if (timeoutMs > 0) timeoutHandle = setTimeout(() => settle('TIMEOUT',
      localError(FBX_WORKER_ERROR_CODES.TIMEOUT, 'FBX attribute parsing timed out.',
        status.accepted ? 'worker' : null, `timeoutMs=${timeoutMs}`)), timeoutMs);
    try { worker.postMessage(job, [job.bytes]); }
    catch (error) { settle('ERROR', localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
      'The FBX attribute worker job could not be dispatched.', null,
      error instanceof Error ? error.message : String(error))); }
  });
}

export async function parseFbxVertexAttributeBundleInWorker(bytes, options = {}) {
  const copy = byteView(bytes).slice(), inputByteLength = copy.byteLength;
  const preflight = preflightFbxInput(copy, inputByteLength);
  const sourceIdentity = Object.freeze({
    sha256: await sha256Hex(copy), byteLength: inputByteLength, fbxVersion: preflight.version,
  });
  const parserIdentity = structuredClone(await loadFbxParserIdentity());
  if (options.parserIdentity && !parserIdentityEqual(options.parserIdentity, parserIdentity)) {
    throw localError(FBX_WORKER_ERROR_CODES.WASM_LOAD_FAILED,
      'The FBX attribute worker parser identity differs.', 'loading-wasm',
      'parser-identity-mismatch');
  }
  const jobId = `fbx-attributes-${++requestCounter}`;
  const job = { schema: FBX_ATTRIBUTE_WORKER_JOB_SCHEMA,
    operation: FBX_ATTRIBUTE_WORKER_OPERATION, jobId, inputByteLength,
    bytes: copy.buffer, sourceIdentity, parserIdentity };
  let worker;
  try { worker = (options.workerFactory || defaultWorkerFactory)(); }
  catch (error) { throw localError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
    'The FBX attribute worker could not be created.', null,
    error instanceof Error ? error.message : String(error)); }
  return runJob({ worker, job, signal: options.signal,
    timeoutMs: timeoutValue(options.timeoutMs), sourceIdentity, parserIdentity });
}
