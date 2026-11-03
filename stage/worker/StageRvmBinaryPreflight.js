export const STAGE_RVM_BINARY_PREFLIGHT_VERSION = 'StageRvmBinaryPreflight.v1';

export const STAGE_RVM_BINARY_PREFLIGHT_CODES = Object.freeze({
  OK: 'STAGE_RVM_PREFLIGHT_OK',
  MISSING_FILE_HASH: 'STAGE_RVM_PREFLIGHT_MISSING_FILE_HASH',
  EMPTY_BINARY: 'STAGE_RVM_PREFLIGHT_EMPTY_BINARY',
  SIZE_MISMATCH: 'STAGE_RVM_PREFLIGHT_SIZE_MISMATCH',
  NON_RVM_EXTENSION: 'STAGE_RVM_PREFLIGHT_NON_RVM_EXTENSION',
  UNKNOWN_HEADER: 'STAGE_RVM_PREFLIGHT_UNKNOWN_HEADER',
  NOT_IMPLEMENTED: 'STAGE_RVM_PREFLIGHT_NOT_IMPLEMENTED',
  INVALID_BINARY: 'STAGE_RVM_PREFLIGHT_INVALID_BINARY',
});

export function createRvmBinaryPreflightReport(input = {}) {
  const errors = [];
  const warnings = [];
  validateIdentity(input, errors);
  validateBinary(input, errors);
  validateExtension(input.fileName, warnings);
  validateSizeConsistency(input, errors);
  sniffHeader(input.arrayBuffer, warnings);
  return {
    version: STAGE_RVM_BINARY_PREFLIGHT_VERSION,
    valid: errors.length === 0,
    errors,
    warnings,
    summary: summarizeInput(input, errors, warnings),
  };
}

export function validateRvmBinaryPreflight(input = {}) {
  const report = createRvmBinaryPreflightReport(input);
  return { valid: report.valid, errors: report.errors, warnings: report.warnings, summary: report.summary };
}

export function summarizeRvmBinaryPreflight(report) {
  return {
    version: report?.version || STAGE_RVM_BINARY_PREFLIGHT_VERSION,
    valid: Boolean(report?.valid),
    errorCount: Array.isArray(report?.errors) ? report.errors.length : 0,
    warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
    ...(report?.summary || {}),
  };
}

function validateIdentity(input, errors) {
  requireText(input.jobId, 'jobId', errors, 'STAGE_RVM_PREFLIGHT_MISSING_JOB_ID');
  requireText(input.fileName, 'fileName', errors, 'STAGE_RVM_PREFLIGHT_MISSING_FILE_NAME');
  if (!Number.isFinite(input.fileSize) || input.fileSize < 0) push(errors, 'STAGE_RVM_PREFLIGHT_INVALID_FILE_SIZE', 'fileSize must be a non-negative finite number');
  if (typeof input.fileHash !== 'string' || !input.fileHash.trim()) push(errors, STAGE_RVM_BINARY_PREFLIGHT_CODES.MISSING_FILE_HASH, 'fileHash is required');
}

function validateBinary(input, errors) {
  if (input.arrayBuffer !== undefined && !isArrayBufferLike(input.arrayBuffer)) {
    push(errors, STAGE_RVM_BINARY_PREFLIGHT_CODES.INVALID_BINARY, 'arrayBuffer must be ArrayBuffer-like');
    return;
  }
  const byteLength = byteLengthOf(input.arrayBuffer);
  if (byteLength <= 0) push(errors, STAGE_RVM_BINARY_PREFLIGHT_CODES.EMPTY_BINARY, 'binary byteLength must be greater than zero');
}

function validateExtension(fileName, warnings) {
  if (typeof fileName === 'string' && fileName && !fileName.toLowerCase().endsWith('.rvm')) {
    push(warnings, STAGE_RVM_BINARY_PREFLIGHT_CODES.NON_RVM_EXTENSION, 'file extension is not .rvm');
  }
}

function validateSizeConsistency(input, errors) {
  const byteLength = byteLengthOf(input.arrayBuffer);
  if (byteLength > 0 && Number.isFinite(input.fileSize) && input.fileSize > 0 && input.fileSize !== byteLength) {
    push(errors, STAGE_RVM_BINARY_PREFLIGHT_CODES.SIZE_MISMATCH, `fileSize ${input.fileSize} does not match byteLength ${byteLength}`);
  }
}

function sniffHeader(arrayBuffer, warnings) {
  const bytes = firstBytes(arrayBuffer, 16);
  if (!bytes.length || isWideHead(bytes)) return;
  const text = String.fromCharCode(...bytes).replace(/\0/g, '').trim();
  if (!text || !/RVM|AVEVA|PDMS|HEAD/i.test(text)) push(warnings, STAGE_RVM_BINARY_PREFLIGHT_CODES.UNKNOWN_HEADER, 'RVM header is not recognized by light preflight sniffing');
}

function summarizeInput(input, errors, warnings) {
  return {
    jobId: input?.jobId || '',
    fileName: input?.fileName || '',
    fileSize: Number(input?.fileSize) || 0,
    fileHash: input?.fileHash || '',
    byteLength: byteLengthOf(input?.arrayBuffer),
    code: errors.length ? errors[0].code : (warnings[0]?.code || STAGE_RVM_BINARY_PREFLIGHT_CODES.OK),
  };
}

function isWideHead(bytes) {
  return bytes.length >= 16 && bytes[3] === 0x48 && bytes[7] === 0x45 && bytes[11] === 0x41 && bytes[15] === 0x44
    && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[4] === 0 && bytes[5] === 0 && bytes[6] === 0;
}

function requireText(value, label, errors, code) {
  if (typeof value !== 'string' || !value.trim()) push(errors, code, `${label} is required`);
}

function isArrayBufferLike(value) {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function byteLengthOf(value) {
  return isArrayBufferLike(value) ? value.byteLength : 0;
}

function firstBytes(value, limit) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value, 0, Math.min(value.byteLength, limit));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, limit));
  return new Uint8Array(0);
}

function push(target, code, message) {
  target.push({ code, message });
}
