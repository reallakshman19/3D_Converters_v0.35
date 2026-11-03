import { validateFbxGeometryBundle } from './geometry-bundle.js';
import { FBX_GEOMETRY_ERROR_CODES } from './mesh-topology.js';
import {
  FBX_WORKER_ERROR_CODES, FBX_WORKER_STAGES, FbxWorkerRuntimeError,
  protocolError, trustedJobId,
} from './worker-protocol.js';

export const FBX_GEOMETRY_WORKER_JOB_SCHEMA = 'FbxWorkerJob.v2';
export const FBX_GEOMETRY_WORKER_MESSAGE_SCHEMA = 'FbxWorkerMessage.v2';
export const FBX_GEOMETRY_WORKER_OPERATION = 'PARSE_GEOMETRY_BUNDLE';
export const FBX_GEOMETRY_WORKER_TYPES = Object.freeze({
  ACCEPTED: 'FBX_WORKER_ACCEPTED',
  PROGRESS: 'FBX_WORKER_PROGRESS',
  COMPLETE: 'FBX_WORKER_GEOMETRY_COMPLETE',
  ERROR: 'FBX_WORKER_ERROR',
});
export const FBX_GEOMETRY_WORKER_ERROR_CODES = Object.freeze({
  JOB_INVALID: 'FBX_GEOMETRY_WORKER_JOB_INVALID',
  RESULT_DECODE_FAILED: 'FBX_GEOMETRY_RESULT_DECODE_FAILED',
  BUNDLE_INVALID: 'FBX_GEOMETRY_BUNDLE_INVALID',
  TRANSFER_FAILED: 'FBX_GEOMETRY_TRANSFER_FAILED',
});
const TYPES = new Set(Object.values(FBX_GEOMETRY_WORKER_TYPES));
const CODES = new Set([
  ...Object.values(FBX_WORKER_ERROR_CODES),
  ...Object.values(FBX_GEOMETRY_WORKER_ERROR_CODES),
  ...Object.values(FBX_GEOMETRY_ERROR_CODES),
]);
const STAGE_BY_CODE = Object.freeze({
  [FBX_WORKER_ERROR_CODES.PREFLIGHT_EMPTY_INPUT]: 'preflight',
  [FBX_WORKER_ERROR_CODES.PREFLIGHT_SIZE_MISMATCH]: 'preflight',
  [FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER]: 'preflight',
  [FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_VERSION]: 'preflight',
  [FBX_WORKER_ERROR_CODES.WASM_LOAD_FAILED]: 'loading-wasm',
  [FBX_WORKER_ERROR_CODES.PARSE_REJECTED]: 'parsing-fbx',
  [FBX_GEOMETRY_WORKER_ERROR_CODES.RESULT_DECODE_FAILED]: 'decoding-result',
  [FBX_GEOMETRY_WORKER_ERROR_CODES.BUNDLE_INVALID]: 'enforcing-source-policy',
  [FBX_GEOMETRY_WORKER_ERROR_CODES.TRANSFER_FAILED]: 'preparing-transfer',
});
const HASH = /^[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;
function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}
function text(value, max) { return typeof value === 'string' && value.length <= max; }
function sourceIdentity(value, length) {
  return exact(value, ['sha256', 'byteLength', 'fbxVersion']) && HASH.test(value.sha256)
    && value.byteLength === length && Number.isInteger(value.fbxVersion)
    && value.fbxVersion >= 3000 && value.fbxVersion <= 7700;
}
function parserIdentity(value) {
  return exact(value, ['provenanceSchema', 'upstreamRevision', 'sourceSha256', 'wasmSha256'])
    && value.provenanceSchema === 'UfbxWasmProvenance.v1'
    && REVISION.test(value.upstreamRevision) && HASH.test(value.sourceSha256)
    && HASH.test(value.wasmSha256);
}
function invalidJob(detail) {
  return new FbxWorkerRuntimeError(FBX_GEOMETRY_WORKER_ERROR_CODES.JOB_INVALID,
    'The FBX geometry worker job is invalid.', { detail });
}
export function assertFbxGeometryWorkerJob(value) {
  const keys = ['schema', 'operation', 'jobId', 'inputByteLength', 'bytes', 'sourceIdentity', 'parserIdentity'];
  if (!exact(value, keys) || value.schema !== FBX_GEOMETRY_WORKER_JOB_SCHEMA
    || value.operation !== FBX_GEOMETRY_WORKER_OPERATION || !trustedJobId(value.jobId)
    || !(value.bytes instanceof ArrayBuffer) || !Number.isSafeInteger(value.inputByteLength)
    || value.inputByteLength < 0 || !sourceIdentity(value.sourceIdentity, value.inputByteLength)
    || !parserIdentity(value.parserIdentity)) throw invalidJob('Geometry worker job fields are invalid.');
  return value;
}
export function assertGeometryWorkerEnvelope(value, expectedJobId) {
  if (!record(value) || value.schema !== FBX_GEOMETRY_WORKER_MESSAGE_SCHEMA
    || !TYPES.has(value.type) || value.jobId !== expectedJobId) throw protocolError('Geometry worker message envelope is invalid.');
  return value;
}
export function assertGeometryAcceptedMessage(value, expectedLength) {
  const keys = ['schema', 'type', 'jobId', 'operation', 'inputByteLength'];
  if (!exact(value, keys) || value.type !== FBX_GEOMETRY_WORKER_TYPES.ACCEPTED
    || value.operation !== FBX_GEOMETRY_WORKER_OPERATION
    || value.inputByteLength !== expectedLength) throw protocolError('Geometry accepted message is invalid.');
  return value;
}
export function assertGeometryProgressMessage(value, receivedStages) {
  const ordinal = receivedStages.length;
  if (!exact(value, ['schema', 'type', 'jobId', 'stage', 'ordinal'])
    || value.type !== FBX_GEOMETRY_WORKER_TYPES.PROGRESS
    || ordinal >= FBX_WORKER_STAGES.length - 1 || value.ordinal !== ordinal
    || value.stage !== FBX_WORKER_STAGES[ordinal]) throw protocolError('Geometry progress ordering is invalid.');
  return value;
}
function terminal(value, receivedStages) {
  if (value.stage !== 'complete' || receivedStages.length !== FBX_WORKER_STAGES.length - 1) {
    throw protocolError('Geometry completion arrived before all required stages.');
  }
}
export async function assertGeometryCompleteMessage(value, receivedStages) {
  const keys = ['schema', 'type', 'jobId', 'stage', 'manifest', 'buffers', 'diagnostics'];
  if (!exact(value, keys) || value.type !== FBX_GEOMETRY_WORKER_TYPES.COMPLETE
    || !record(value.diagnostics)) throw protocolError('Geometry completion fields are invalid.');
  terminal(value, receivedStages);
  await validateFbxGeometryBundle({ manifest: value.manifest, buffers: value.buffers });
  return value;
}
export function assertGeometryErrorMessage(value, receivedStages) {
  const keys = ['schema', 'type', 'jobId', 'code', 'stage', 'message', 'detail', 'progressStages', 'diagnostics'];
  if (!exact(value, keys) || value.type !== FBX_GEOMETRY_WORKER_TYPES.ERROR
    || !CODES.has(value.code) || !text(value.message, 2048)
    || (value.detail !== null && !text(value.detail, 4096))
    || (value.diagnostics !== null && !record(value.diagnostics))
    || !Array.isArray(value.progressStages)
    || value.progressStages.length !== receivedStages.length) throw protocolError('Geometry worker error is invalid.');
  for (let index = 0; index < receivedStages.length; index += 1) {
    if (value.progressStages[index] !== receivedStages[index]) throw protocolError('Geometry worker error history is inconsistent.');
  }
  const stage = receivedStages.at(-1) ?? null;
  if (value.stage !== stage || (STAGE_BY_CODE[value.code] && value.stage !== STAGE_BY_CODE[value.code])) {
    throw protocolError('Geometry worker error stage is inconsistent.');
  }
  return value;
}
function message(type, jobId, fields) {
  return { schema: FBX_GEOMETRY_WORKER_MESSAGE_SCHEMA, type, jobId, ...fields };
}
export function makeGeometryAccepted(job) {
  return message(FBX_GEOMETRY_WORKER_TYPES.ACCEPTED, job.jobId,
    { operation: job.operation, inputByteLength: job.inputByteLength });
}
export function makeGeometryProgress(jobId, stage, ordinal) {
  return message(FBX_GEOMETRY_WORKER_TYPES.PROGRESS, jobId, { stage, ordinal });
}
export function makeGeometryComplete(jobId, bundle, diagnostics) {
  return message(FBX_GEOMETRY_WORKER_TYPES.COMPLETE, jobId,
    { stage: 'complete', manifest: bundle.manifest, buffers: bundle.buffers, diagnostics });
}
export function makeGeometryWorkerError(jobId, error, progressStages, diagnostics = null) {
  const code = CODES.has(error?.code) ? error.code : FBX_GEOMETRY_WORKER_ERROR_CODES.BUNDLE_INVALID;
  const body = text(error?.message, 2048) ? error.message : 'The FBX geometry worker failed.';
  const detail = text(error?.detail, 4096) ? error.detail : text(error?.message, 4096) ? error.message : null;
  return message(FBX_GEOMETRY_WORKER_TYPES.ERROR, jobId, {
    code, stage: error?.stage ?? progressStages.at(-1) ?? null, message: body, detail,
    progressStages: [...progressStages], diagnostics,
  });
}
