export const STAGE_WORKER_JOB_SCHEMA = 'StageWorkerJob.v1';
export const STAGE_WORKER_JOB_KINDS = Object.freeze(['stage-json', 'rvm-binary']);

export function createStageJsonWorkerJob(options = {}) {
  const text = String(options.text || '');
  return {
    schema: STAGE_WORKER_JOB_SCHEMA,
    jobId: options.jobId || makeJobId(options.fileHash, 'stage-json'),
    kind: 'stage-json',
    fileName: options.fileName || 'stage-model.json',
    fileSize: Number(options.fileSize ?? text.length) || 0,
    fileHash: options.fileHash || '',
    text,
    createdAt: options.createdAt || new Date().toISOString(),
  };
}

export function createRvmBinaryWorkerJob(options = {}) {
  const byteLength = byteLengthOf(options.arrayBuffer) || Number(options.byteLength) || Number(options.fileSize) || 0;
  return {
    schema: STAGE_WORKER_JOB_SCHEMA,
    jobId: options.jobId || makeJobId(options.fileHash, 'rvm-binary'),
    kind: 'rvm-binary',
    fileName: options.fileName || 'model.rvm',
    fileSize: Number(options.fileSize ?? byteLength) || 0,
    fileHash: options.fileHash || '',
    arrayBuffer: options.arrayBuffer,
    byteLength,
    createdAt: options.createdAt || new Date().toISOString(),
  };
}

export function validateStageWorkerJob(job) {
  const errors = [];
  if (!job || typeof job !== 'object') return invalid('job must be an object');
  if (job.schema !== STAGE_WORKER_JOB_SCHEMA) errors.push(`schema must be ${STAGE_WORKER_JOB_SCHEMA}`);
  requireText(job.jobId, 'jobId', errors);
  requireAllowed(job.kind, STAGE_WORKER_JOB_KINDS, 'kind', errors);
  requireText(job.fileName, 'fileName', errors);
  requireNonNegativeNumber(job.fileSize, 'fileSize', errors);
  requireText(job.fileHash, 'fileHash', errors);
  requireIsoTimestamp(job.createdAt, errors);
  validateJobPayload(job, errors);
  return { valid: errors.length === 0, errors };
}

export function summarizeStageWorkerJob(job) {
  return {
    schema: job?.schema || '',
    jobId: job?.jobId || '',
    kind: job?.kind || '',
    fileName: job?.fileName || '',
    fileSize: Number(job?.fileSize) || 0,
    fileHash: job?.fileHash || '',
    hasText: typeof job?.text === 'string' && job.text.length > 0,
    byteLength: byteLengthOf(job?.arrayBuffer) || Number(job?.byteLength) || 0,
  };
}

function validateJobPayload(job, errors) {
  if (job.kind === 'stage-json' && (typeof job.text !== 'string' || !job.text.trim())) errors.push('stage-json text is required');
  if (job.kind === 'rvm-binary' && !hasBinaryPayload(job)) errors.push('rvm-binary requires arrayBuffer or positive fileSize');
}

function hasBinaryPayload(job) {
  return byteLengthOf(job.arrayBuffer) > 0 || Number(job.fileSize) > 0 || Number(job.byteLength) > 0;
}

function byteLengthOf(value) {
  return Number.isFinite(value?.byteLength) ? value.byteLength : 0;
}

function makeJobId(fileHash, kind) {
  const seed = String(fileHash || kind || 'stage-worker-job').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `job-${seed || 'stage-worker-job'}`;
}

function requireText(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} is required`);
}

function requireAllowed(value, allowed, label, errors) {
  if (!allowed.includes(value)) errors.push(`${label} is invalid: ${value}`);
}

function requireNonNegativeNumber(value, label, errors) {
  if (!Number.isFinite(value) || value < 0) errors.push(`${label} must be a non-negative finite number`);
}

function requireIsoTimestamp(value, errors) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) errors.push('createdAt must be an ISO timestamp');
}

function invalid(message) {
  return { valid: false, errors: [message] };
}
