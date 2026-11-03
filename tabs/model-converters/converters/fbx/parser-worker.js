import { deepFreeze } from './canonical-json.js';
import { buildFbxGeometryBundle } from './geometry-bundle.js';
import { FBX_GEOMETRY_ERROR_CODES } from './mesh-topology.js';
import { parseFbxBytesWithWasm, parseFbxGeometryRawWithWasm } from './parser-wasm.js';
import { enforceSourceGraphPolicy } from './source-graph.js';
import { sha256Hex } from './sha256.js';
import { createWorkerDiagnostics } from './worker-diagnostics.js';
import { preflightFbxInput } from './worker-preflight.js';
import {
  FBX_WORKER_ERROR_CODES, FBX_WORKER_STAGES, FbxWorkerRuntimeError,
  assertFbxWorkerJob, makeAccepted, makeComplete, makeProgress, makeWorkerError,
  protocolError, trustedJobId,
} from './worker-protocol.js';
import {
  FBX_GEOMETRY_WORKER_ERROR_CODES, FBX_GEOMETRY_WORKER_JOB_SCHEMA,
  assertFbxGeometryWorkerJob, makeGeometryAccepted, makeGeometryComplete,
  makeGeometryProgress, makeGeometryWorkerError,
} from './geometry-worker-protocol.js';

function policyFailure(error, geometry = false) {
  if (error instanceof FbxWorkerRuntimeError) return error;
  const detail = error instanceof Error ? error.message : String(error);
  return new FbxWorkerRuntimeError(
    error?.code || (geometry ? FBX_GEOMETRY_WORKER_ERROR_CODES.BUNDLE_INVALID : FBX_WORKER_ERROR_CODES.SOURCE_GRAPH_POLICY_FAILED),
    geometry ? 'The parsed FBX geometry bundle failed validation.' : 'The parsed FBX source graph failed policy enforcement.',
    { stage: 'enforcing-source-policy', detail },
  );
}
function runtimeFailure(error, stage = null, geometry = false) {
  if (error instanceof FbxWorkerRuntimeError) return error;
  const detail = error instanceof Error ? error.message : String(error);
  return new FbxWorkerRuntimeError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
    geometry ? 'The FBX geometry worker runtime failed.' : 'The FBX worker runtime failed.',
    { stage, detail });
}
function createStageEmitter(jobId, post, progressStages, diagnostics, geometry) {
  return (stage) => {
    const ordinal = progressStages.length, expected = FBX_WORKER_STAGES[ordinal];
    if (stage !== expected || stage === 'complete') throw protocolError(`Worker attempted stage ${stage}; expected ${expected}.`, progressStages);
    diagnostics.markStage(stage); progressStages.push(stage);
    post(geometry ? makeGeometryProgress(jobId, stage, ordinal) : makeProgress(jobId, stage, ordinal));
  };
}
function defaultDependencies(overrides = {}) {
  return {
    parse: parseFbxBytesWithWasm, parseGeometry: parseFbxGeometryRawWithWasm,
    preflight: preflightFbxInput, enforce: enforceSourceGraphPolicy,
    bundle: buildFbxGeometryBundle, freeze: deepFreeze, hash: sha256Hex,
    diagnosticsFactory: createWorkerDiagnostics, ...overrides,
  };
}
async function handleSource(message, post, overrides) {
  const dependencies = defaultDependencies(overrides), progressStages = [];
  let terminalSent = false, jobId = trustedJobId(message?.jobId);
  let diagnostics = dependencies.diagnosticsFactory(message?.inputByteLength || 0);
  const sendTerminal = (value) => { if (terminalSent) return false; post(value); terminalSent = true; return true; };
  try {
    const job = assertFbxWorkerJob(message); jobId = job.jobId;
    diagnostics = dependencies.diagnosticsFactory(job.inputByteLength); post(makeAccepted(job));
    const emitStage = createStageEmitter(job.jobId, post, progressStages, diagnostics, false);
    emitStage('preflight'); const bytes = new Uint8Array(job.bytes);
    dependencies.preflight(bytes, job.inputByteLength);
    const parsed = await dependencies.parse(bytes, { onStage: emitStage });
    emitStage('enforcing-source-policy');
    let graph;
    try { graph = dependencies.freeze(dependencies.enforce(parsed)); }
    catch (error) { throw policyFailure(error); }
    emitStage('preparing-transfer');
    sendTerminal(makeComplete(job.jobId, graph, diagnostics.snapshot('FBX_WORKER_COMPLETE', graph)));
  } catch (error) {
    const failure = runtimeFailure(error, progressStages.at(-1) || null);
    sendTerminal(makeWorkerError(jobId, failure, progressStages, diagnostics.snapshot(failure.code)));
  }
}
function transferFailure(detail) {
  return new FbxWorkerRuntimeError(FBX_GEOMETRY_WORKER_ERROR_CODES.TRANSFER_FAILED,
    'The FBX geometry buffers could not be transferred.', { stage: 'preparing-transfer', detail });
}
function geometryTransferList(bundle) {
  if (!bundle || !Array.isArray(bundle.buffers) || bundle.buffers.length !== bundle.manifest?.buffers?.length) throw transferFailure('buffer-count-mismatch');
  const transfer = [], identities = new Set();
  for (let index = 0; index < bundle.buffers.length; index += 1) {
    const item = bundle.buffers[index], descriptor = bundle.manifest.buffers[index];
    if (!item || item.bufferId !== descriptor.bufferId || !(item.bytes instanceof ArrayBuffer)
      || (typeof SharedArrayBuffer !== 'undefined' && item.bytes instanceof SharedArrayBuffer)
      || item.bytes.byteLength !== descriptor.byteLength || identities.has(item.bytes)) throw transferFailure(`invalid-buffer-${index}`);
    identities.add(item.bytes); transfer.push(item.bytes);
  }
  return transfer;
}
function postGeometryComplete(post, jobId, bundle, diagnostics) {
  const transfer = geometryTransferList(bundle), envelope = makeGeometryComplete(jobId, bundle, diagnostics);
  try { post(envelope, transfer); }
  catch (error) { throw transferFailure(error instanceof Error ? error.message : String(error)); }
  if (transfer.some((item) => item.byteLength !== 0)) throw transferFailure('buffers-not-detached');
}
async function assertSourceDigest(job, bytes, dependencies) {
  const digest = await dependencies.hash(bytes);
  if (digest !== job.sourceIdentity.sha256) {
    throw new FbxWorkerRuntimeError(FBX_GEOMETRY_ERROR_CODES.DIGEST_MISMATCH,
      'The FBX source digest differs from the geometry worker job.', {
        stage: 'preflight', detail: 'source-identity-sha256-mismatch',
      });
  }
}
async function handleGeometry(message, post, overrides) {
  const dependencies = defaultDependencies(overrides), progressStages = [];
  let terminalSent = false, jobId = trustedJobId(message?.jobId);
  let diagnostics = dependencies.diagnosticsFactory(message?.inputByteLength || 0);
  const sendError = (value) => { if (terminalSent) return false; post(value); terminalSent = true; return true; };
  try {
    const job = assertFbxGeometryWorkerJob(message); jobId = job.jobId;
    diagnostics = dependencies.diagnosticsFactory(job.inputByteLength); post(makeGeometryAccepted(job));
    const emitStage = createStageEmitter(job.jobId, post, progressStages, diagnostics, true);
    emitStage('preflight'); const bytes = new Uint8Array(job.bytes);
    const preflight = dependencies.preflight(bytes, job.inputByteLength);
    if (preflight.version !== job.sourceIdentity.fbxVersion) throw new FbxWorkerRuntimeError(
      FBX_GEOMETRY_WORKER_ERROR_CODES.JOB_INVALID, 'The FBX geometry worker version evidence differs from the input.',
      { stage: 'preflight', detail: 'source-identity-version-mismatch' });
    await assertSourceDigest(job, bytes, dependencies);
    const parsed = await dependencies.parseGeometry(bytes, {
      onStage: emitStage, parserIdentity: job.parserIdentity,
    });
    emitStage('enforcing-source-policy');
    let bundle;
    try {
      bundle = await dependencies.bundle({
        rawTopology: parsed.rawTopology, buffers: parsed.buffers,
        sourceIdentity: job.sourceIdentity, parserIdentity: job.parserIdentity,
      });
    } catch (error) { throw policyFailure(error, true); }
    emitStage('preparing-transfer');
    const snapshot = diagnostics.snapshot('FBX_WORKER_GEOMETRY_COMPLETE', parsed.rawTopology?.sourceGraph);
    postGeometryComplete(post, job.jobId, bundle, snapshot); terminalSent = true;
  } catch (error) {
    const failure = runtimeFailure(error, progressStages.at(-1) || null, true);
    sendError(makeGeometryWorkerError(jobId, failure, progressStages, diagnostics.snapshot(failure.code)));
  }
}
export async function handleFbxWorkerMessage(message, post, overrides = {}) {
  return message?.schema === FBX_GEOMETRY_WORKER_JOB_SCHEMA
    ? handleGeometry(message, post, overrides) : handleSource(message, post, overrides);
}
let workerJobReceived = false;
function dispatchWorkerMessage(value, post) {
  if (workerJobReceived) {
    const geometry = value?.schema === FBX_GEOMETRY_WORKER_JOB_SCHEMA;
    const error = new FbxWorkerRuntimeError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
      'The FBX worker accepts only one job.', { detail: 'duplicate-worker-job' });
    post(geometry ? makeGeometryWorkerError(trustedJobId(value?.jobId), error, [])
      : makeWorkerError(trustedJobId(value?.jobId), error, []));
    return;
  }
  workerJobReceived = true; void handleFbxWorkerMessage(value, post);
}
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (event) => dispatchWorkerMessage(event.data,
    (value, transfer = []) => self.postMessage(value, transfer));
} else if (typeof process !== 'undefined' && process.versions?.node) {
  const { parentPort } = await import('node:worker_threads');
  parentPort?.on('message', (value) => dispatchWorkerMessage(value,
    (result, transfer = []) => parentPort.postMessage(result, transfer)));
}
