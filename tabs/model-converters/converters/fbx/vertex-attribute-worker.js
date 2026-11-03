import {
  parseFbxGeometryBundleWithWasm,
  parseFbxVertexAttributeBundleWithWasm,
} from './parser-wasm.js';
import { sha256Hex } from './sha256.js';
import { preflightFbxInput } from './worker-preflight.js';
import {
  assertFbxAttributeWorkerJob,
  makeFbxAttributeAccepted,
  makeFbxAttributeComplete,
  makeFbxAttributeError,
} from './vertex-attribute-worker-protocol.js';

function transferList(geometryBundle, attributeBundle) {
  const buffers = [
    ...geometryBundle.buffers.map((item) => item.bytes),
    ...attributeBundle.buffers.map((item) => item.bytes),
  ];
  const identities = new Set();
  for (const buffer of buffers) {
    if (!(buffer instanceof ArrayBuffer)
      || (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)
      || identities.has(buffer)) throw new Error('FBX_ATTRIBUTE_TRANSFER_INVALID');
    identities.add(buffer);
  }
  return buffers;
}

async function run(message, post) {
  let jobId = typeof message?.jobId === 'string' ? message.jobId : 'invalid-job';
  try {
    const job = assertFbxAttributeWorkerJob(message);
    jobId = job.jobId;
    post(makeFbxAttributeAccepted(job));
    const bytes = new Uint8Array(job.bytes);
    const preflight = preflightFbxInput(bytes, job.inputByteLength);
    if (preflight.version !== job.sourceIdentity.fbxVersion
      || await sha256Hex(bytes) !== job.sourceIdentity.sha256) {
      throw Object.assign(new Error('The FBX attribute worker source identity differs.'), {
        code: 'FBX_VERTEX_ATTRIBUTE_SOURCE_IDENTITY_MISMATCH', stage: 'preflight',
        detail: 'source-identity-mismatch',
      });
    }
    const geometryBundle = await parseFbxGeometryBundleWithWasm(bytes, {
      sourceIdentity: job.sourceIdentity, parserIdentity: job.parserIdentity,
    });
    const attributeBundle = await parseFbxVertexAttributeBundleWithWasm(bytes, {
      geometryBundle, parserIdentity: job.parserIdentity,
    });
    const transfer = transferList(geometryBundle, attributeBundle);
    post(makeFbxAttributeComplete(job.jobId, geometryBundle, attributeBundle), transfer);
  } catch (error) {
    post(makeFbxAttributeError(jobId, error));
  }
}

let received = false;
function dispatch(message, post) {
  if (received) {
    post(makeFbxAttributeError(typeof message?.jobId === 'string' ? message.jobId : 'invalid-job',
      Object.assign(new Error('The FBX attribute worker accepts one job.'), {
        code: 'FBX_ATTRIBUTE_WORKER_DUPLICATE_JOB', stage: null,
      })));
    return;
  }
  received = true;
  void run(message, post);
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (event) => dispatch(event.data,
    (value, transfer = []) => self.postMessage(value, transfer));
} else if (typeof process !== 'undefined' && process.versions?.node) {
  const { parentPort } = await import('node:worker_threads');
  parentPort?.on('message', (value) => dispatch(value,
    (result, transfer = []) => parentPort.postMessage(result, transfer)));
}
