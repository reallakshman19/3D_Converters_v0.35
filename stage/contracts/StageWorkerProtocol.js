export const STAGE_WORKER_PROTOCOL_VERSION = 'RvmStageWorkerProtocol.v1';

export const STAGE_WORKER_MESSAGE_TYPES = Object.freeze([
  'STAGE_WORKER_READY',
  'STAGE_WORKER_START',
  'STAGE_WORKER_PROGRESS',
  'STAGE_WORKER_DIAGNOSTIC',
  'STAGE_WORKER_STAGE_READY',
  'STAGE_WORKER_PACKAGE_READY',
  'STAGE_WORKER_ERROR',
  'STAGE_WORKER_CANCELLED',
]);

export const STAGE_WORKER_PHASES = Object.freeze([
  'idle',
  'reading-file',
  'hashing-source',
  'parsing-records',
  'building-hierarchy',
  'decoding-primitives',
  'building-components',
  'building-diagnostics',
  'writing-package',
  'complete',
  'failed',
  'cancelled',
]);

export function createStageWorkerMessage(type, payload = {}) {
  return {
    protocol: STAGE_WORKER_PROTOCOL_VERSION,
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function createStageWorkerProgress(phase, progress = {}) {
  const loaded = Number(progress.loaded) || 0;
  const total = Number(progress.total) || 0;
  const percent = progress.percent ?? calculatePercent(loaded, total);
  return createStageWorkerMessage('STAGE_WORKER_PROGRESS', {
    phase,
    loaded,
    total,
    percent,
    message: progress.message || '',
  });
}

export function createStageWorkerError(error, context = {}) {
  const source = error || {};
  return createStageWorkerMessage('STAGE_WORKER_ERROR', {
    message: source.message || String(source || 'Stage worker failed'),
    code: source.code || 'STAGE_WORKER_ERROR',
    context,
  });
}

export function validateStageWorkerMessage(message) {
  const errors = [];
  if (!message || typeof message !== 'object') return invalid('message must be an object');
  validateEnvelope(message, errors);
  if (message.type === 'STAGE_WORKER_PROGRESS') collect(errors, validateStageWorkerProgress(message).errors);
  if (message.type === 'STAGE_WORKER_ERROR') validateErrorPayload(message.payload, errors);
  return { valid: errors.length === 0, errors };
}

export function validateStageWorkerProgress(progressMessage) {
  const payload = progressMessage?.payload || progressMessage;
  const errors = [];
  if (!payload || typeof payload !== 'object') return invalid('progress payload must be an object');
  if (!STAGE_WORKER_PHASES.includes(payload.phase)) errors.push(`phase is invalid: ${payload.phase}`);
  validateNonNegativeNumber(payload.loaded, 'loaded', errors);
  validateNonNegativeNumber(payload.total, 'total', errors);
  validatePercent(payload.percent, errors);
  if (Number.isFinite(payload.loaded) && Number.isFinite(payload.total) && payload.loaded > payload.total) errors.push('loaded must not exceed total');
  if (payload.message !== undefined && typeof payload.message !== 'string') errors.push('message must be a string');
  return { valid: errors.length === 0, errors };
}

function validateEnvelope(message, errors) {
  if (message.protocol !== STAGE_WORKER_PROTOCOL_VERSION) errors.push(`protocol must be ${STAGE_WORKER_PROTOCOL_VERSION}`);
  if (!STAGE_WORKER_MESSAGE_TYPES.includes(message.type)) errors.push(`type is invalid: ${message.type}`);
  if (typeof message.timestamp !== 'string' || !isIsoLike(message.timestamp)) errors.push('timestamp must be an ISO-like string');
  if (!message.payload || typeof message.payload !== 'object') errors.push('payload object is required');
}

function validateErrorPayload(payload, errors) {
  if (!payload || typeof payload !== 'object') return errors.push('error payload must be an object');
  if (typeof payload.message !== 'string' || !payload.message.trim()) errors.push('error.message is required');
  if (typeof payload.code !== 'string' || !payload.code.trim()) errors.push('error.code is required');
  if (!payload.context || typeof payload.context !== 'object') errors.push('error.context object is required');
}

function calculatePercent(loaded, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}

function validateNonNegativeNumber(value, label, errors) {
  if (!Number.isFinite(value) || value < 0) errors.push(`${label} must be a non-negative finite number`);
}

function validatePercent(value, errors) {
  if (!Number.isFinite(value) || value < 0 || value > 100) errors.push('percent must be between 0 and 100');
}

function isIsoLike(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value);
}

function collect(errors, nextErrors) {
  errors.push(...nextErrors);
}

function invalid(message) {
  return { valid: false, errors: [message] };
}
