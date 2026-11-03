import { validateFbxGeometryBundle } from './geometry-bundle.js';
import { validateFbxVertexAttributeBundle } from './vertex-attribute-bundle.js';
import { FBX_WORKER_ERROR_CODES, FbxWorkerRuntimeError } from './worker-protocol.js';

export const FBX_ATTRIBUTE_WORKER_JOB_SCHEMA = 'FbxWorkerJob.v3';
export const FBX_ATTRIBUTE_WORKER_MESSAGE_SCHEMA = 'FbxWorkerMessage.v3';
export const FBX_ATTRIBUTE_WORKER_OPERATION = 'PARSE_VERTEX_ATTRIBUTE_BUNDLE';
export const FBX_ATTRIBUTE_WORKER_TYPES = Object.freeze({
  ACCEPTED: 'FBX_WORKER_ACCEPTED',
  COMPLETE: 'FBX_WORKER_VERTEX_ATTRIBUTES_COMPLETE',
  ERROR: 'FBX_WORKER_ERROR',
});

const HASH = /^[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;
const TYPES = new Set(Object.values(FBX_ATTRIBUTE_WORKER_TYPES));

function record(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys) {
  return record(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function validSourceIdentity(value, length) {
  return exact(value, ['sha256', 'byteLength', 'fbxVersion'])
    && HASH.test(value.sha256) && value.byteLength === length
    && Number.isInteger(value.fbxVersion)
    && value.fbxVersion >= 3000 && value.fbxVersion <= 7700;
}

function validParserIdentity(value) {
  return exact(value, ['provenanceSchema', 'upstreamRevision', 'sourceSha256', 'wasmSha256'])
    && value.provenanceSchema === 'UfbxWasmProvenance.v1'
    && REVISION.test(value.upstreamRevision)
    && HASH.test(value.sourceSha256) && HASH.test(value.wasmSha256);
}

function fail(message) {
  throw new FbxWorkerRuntimeError(FBX_WORKER_ERROR_CODES.RUNTIME_ERROR, message, {
    stage: null, detail: 'attribute-worker-protocol-invalid',
  });
}

export function assertFbxAttributeWorkerJob(value) {
  const keys = ['schema', 'operation', 'jobId', 'inputByteLength', 'bytes',
    'sourceIdentity', 'parserIdentity'];
  if (!exact(value, keys) || value.schema !== FBX_ATTRIBUTE_WORKER_JOB_SCHEMA
    || value.operation !== FBX_ATTRIBUTE_WORKER_OPERATION
    || typeof value.jobId !== 'string' || !value.jobId
    || !(value.bytes instanceof ArrayBuffer)
    || !Number.isSafeInteger(value.inputByteLength) || value.inputByteLength < 0
    || !validSourceIdentity(value.sourceIdentity, value.inputByteLength)
    || !validParserIdentity(value.parserIdentity)) fail('The FBX attribute worker job is invalid.');
  return value;
}

export function assertFbxAttributeWorkerEnvelope(value, jobId) {
  if (!record(value) || value.schema !== FBX_ATTRIBUTE_WORKER_MESSAGE_SCHEMA
    || !TYPES.has(value.type) || value.jobId !== jobId) {
    fail('The FBX attribute worker message envelope is invalid.');
  }
  return value;
}

export function assertFbxAttributeAccepted(value, length) {
  if (!exact(value, ['schema', 'type', 'jobId', 'operation', 'inputByteLength'])
    || value.type !== FBX_ATTRIBUTE_WORKER_TYPES.ACCEPTED
    || value.operation !== FBX_ATTRIBUTE_WORKER_OPERATION
    || value.inputByteLength !== length) fail('The FBX attribute accepted message is invalid.');
  return value;
}

export async function assertFbxAttributeComplete(value) {
  if (!exact(value, ['schema', 'type', 'jobId', 'geometryBundle', 'attributeBundle'])
    || value.type !== FBX_ATTRIBUTE_WORKER_TYPES.COMPLETE) {
    fail('The FBX attribute completion message is invalid.');
  }
  await validateFbxGeometryBundle(value.geometryBundle);
  await validateFbxVertexAttributeBundle(value.attributeBundle);
  if (value.attributeBundle.manifest.geometryBundleDigest
    !== value.geometryBundle.manifest.bundleDigest) {
    fail('The FBX attribute completion bundles are not bound.');
  }
  return value;
}

export function assertFbxAttributeError(value) {
  if (!exact(value, ['schema', 'type', 'jobId', 'code', 'stage', 'message', 'detail'])
    || value.type !== FBX_ATTRIBUTE_WORKER_TYPES.ERROR
    || typeof value.code !== 'string' || !value.code
    || (value.stage !== null && typeof value.stage !== 'string')
    || typeof value.message !== 'string'
    || (value.detail !== null && typeof value.detail !== 'string')) {
    fail('The FBX attribute worker error message is invalid.');
  }
  return value;
}

function message(type, jobId, body) {
  return { schema: FBX_ATTRIBUTE_WORKER_MESSAGE_SCHEMA, type, jobId, ...body };
}

export function makeFbxAttributeAccepted(job) {
  return message(FBX_ATTRIBUTE_WORKER_TYPES.ACCEPTED, job.jobId, {
    operation: job.operation, inputByteLength: job.inputByteLength,
  });
}

export function makeFbxAttributeComplete(jobId, geometryBundle, attributeBundle) {
  return message(FBX_ATTRIBUTE_WORKER_TYPES.COMPLETE, jobId, {
    geometryBundle, attributeBundle,
  });
}

export function makeFbxAttributeError(jobId, error) {
  const detail = typeof error?.detail === 'string'
    ? error.detail : error instanceof Error ? error.message : String(error);
  return message(FBX_ATTRIBUTE_WORKER_TYPES.ERROR, jobId, {
    code: typeof error?.code === 'string' ? error.code : FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
    stage: typeof error?.stage === 'string' ? error.stage : null,
    message: error instanceof Error ? error.message : 'The FBX attribute worker failed.',
    detail: detail || null,
  });
}
