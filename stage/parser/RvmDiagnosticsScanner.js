export const RVM_DIAGNOSTICS_SCANNER_VERSION = '20260701-rvm-diagnostics-scanner-v1';
export const RVM_DIAGNOSTICS_RECORD_TYPES = Object.freeze({ CNTB: 'CNTB', CNTE: 'CNTE', PRIM: 'PRIM', BBOX: 'BBOX' });
export const RVM_DIAGNOSTICS_LIMITS = Object.freeze({ maxScanBytes: 2_000_000, maxByteRanges: 64, maxWarnings: 40 });

const SCHEMA = 'RvmDiagnosticsReport.v1';
const COUNT_KEYS = Object.freeze(['totalCandidateRecords', 'cntb', 'cnte', 'prim', 'nativePrimitiveRecords', 'code4', 'code11', 'unknownNativeCodes', 'undecodedRecords', 'candidateBboxRecords', 'invalidBboxRecords']);

export function createRvmDiagnosticsReport(options = {}) {
  const byteLength = byteLengthOf(options.arrayBuffer);
  return {
    schema: SCHEMA,
    scannerVersion: RVM_DIAGNOSTICS_SCANNER_VERSION,
    source: { jobId: options.jobId || '', fileName: options.fileName || '', fileHash: options.fileHash || '', byteLength },
    counts: Object.fromEntries(COUNT_KEYS.map((key) => [key, 0])),
    nativeCodeCounts: { 4: 0, 8: 0, 11: 0 },
    hierarchy: { candidateRootCount: 0, maxCandidateDepth: 0, namedRecordCount: 0 },
    byteRanges: [],
    warnings: [],
    errors: [],
  };
}

export function scanRvmBinaryDiagnostics(input = {}) {
  const report = createRvmDiagnosticsReport(input);
  try {
    const bytes = byteView(input.arrayBuffer);
    if (!bytes.length) {
      report.errors.push(error('STAGE_RVM_DIAGNOSTICS_EMPTY_BINARY', 'binary byteLength must be greater than zero'));
      return report;
    }
    scanBytes(bytes, report);
    if (bytes.byteLength > RVM_DIAGNOSTICS_LIMITS.maxScanBytes) report.warnings.push(warn('STAGE_RVM_DIAGNOSTICS_SCAN_TRUNCATED', 'diagnostic scan truncated by safety limit'));
    if (!report.counts.totalCandidateRecords) report.warnings.push(warn('STAGE_RVM_DIAGNOSTICS_NO_SIGNATURES', 'no conservative record signatures were detected'));
  } catch (scanError) {
    report.errors.push(error('STAGE_RVM_DIAGNOSTICS_SCAN_FAILED', scanError?.message || String(scanError)));
  }
  return report;
}

export function summarizeRvmDiagnostics(report) {
  return {
    schema: report?.schema || SCHEMA,
    scannerVersion: report?.scannerVersion || RVM_DIAGNOSTICS_SCANNER_VERSION,
    byteLength: Number(report?.source?.byteLength) || 0,
    totalCandidateRecords: Number(report?.counts?.totalCandidateRecords) || 0,
    cntb: Number(report?.counts?.cntb) || 0,
    cnte: Number(report?.counts?.cnte) || 0,
    prim: Number(report?.counts?.prim) || 0,
    nativePrimitiveRecords: Number(report?.counts?.nativePrimitiveRecords) || 0,
    code4: Number(report?.counts?.code4) || 0,
    code11: Number(report?.counts?.code11) || 0,
    unknownNativeCodes: Number(report?.counts?.unknownNativeCodes) || 0,
    undecodedRecords: Number(report?.counts?.undecodedRecords) || 0,
    candidateBboxRecords: Number(report?.counts?.candidateBboxRecords) || 0,
    invalidBboxRecords: Number(report?.counts?.invalidBboxRecords) || 0,
    nativeCodeCounts: report?.nativeCodeCounts || {},
    candidateRootCount: Number(report?.hierarchy?.candidateRootCount) || 0,
    maxCandidateDepth: Number(report?.hierarchy?.maxCandidateDepth) || 0,
    namedRecordCount: Number(report?.hierarchy?.namedRecordCount) || 0,
    warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
    errorCount: Array.isArray(report?.errors) ? report.errors.length : 0,
  };
}

export function validateRvmDiagnosticsReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return invalid('report must be an object');
  if (report.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  if (report.scannerVersion !== RVM_DIAGNOSTICS_SCANNER_VERSION) errors.push('scannerVersion is invalid');
  if (!report.source || typeof report.source !== 'object') errors.push('source is required');
  for (const key of COUNT_KEYS) if (!Number.isFinite(report.counts?.[key])) errors.push(`counts.${key} must be finite`);
  if (!report.nativeCodeCounts || typeof report.nativeCodeCounts !== 'object') errors.push('nativeCodeCounts object is required');
  for (const key of ['candidateRootCount', 'maxCandidateDepth', 'namedRecordCount']) if (!Number.isFinite(report.hierarchy?.[key])) errors.push(`hierarchy.${key} must be finite`);
  for (const key of ['byteRanges', 'warnings', 'errors']) if (!Array.isArray(report[key])) errors.push(`${key} must be an array`);
  return { valid: errors.length === 0, errors };
}

function scanBytes(bytes, report) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let depth = 0;
  const limit = Math.min(bytes.byteLength - 3, RVM_DIAGNOSTICS_LIMITS.maxScanBytes);
  for (let offset = 0; offset < limit; offset += 1) {
    const tag = ascii4(bytes, offset);
    if (tag === 'CNTB') { depth += 1; countRecord(report, 'cntb', tag, offset); report.hierarchy.candidateRootCount += depth === 1 ? 1 : 0; report.hierarchy.maxCandidateDepth = Math.max(report.hierarchy.maxCandidateDepth, depth); if (hasPrintableName(bytes, offset + 4)) report.hierarchy.namedRecordCount += 1; }
    if (tag === 'CNTE') { countRecord(report, 'cnte', tag, offset); depth = Math.max(depth - 1, 0); }
    if (tag === 'PRIM') scanPrimitiveCandidate(view, report, offset);
    if (tag === 'BBOX') scanBboxCandidate(view, report, offset);
  }
}

function scanPrimitiveCandidate(view, report, offset) {
  countRecord(report, 'prim', 'PRIM', offset);
  report.counts.nativePrimitiveRecords += 1;
  report.counts.undecodedRecords += 1;
  const code = readU32(view, offset + 4);
  if (!Number.isInteger(code) || code < 0 || code > 4096) return void (report.counts.unknownNativeCodes += 1);
  const key = String(code);
  report.nativeCodeCounts[key] = (report.nativeCodeCounts[key] || 0) + 1;
  if (code === 4) report.counts.code4 += 1;
  if (code === 11) report.counts.code11 += 1;
}

function scanBboxCandidate(view, report, offset) {
  const values = [];
  for (let index = 0; index < 6; index += 1) values.push(readF32(view, offset + 4 + index * 4));
  if (values.every(Number.isFinite) && values[0] <= values[3] && values[1] <= values[4] && values[2] <= values[5]) report.counts.candidateBboxRecords += 1;
  else report.counts.invalidBboxRecords += 1;
  addRange(report, 'BBOX', offset, Math.min(offset + 28, view.byteLength), false);
}

function countRecord(report, key, tag, offset) {
  report.counts.totalCandidateRecords += 1;
  report.counts[key] += 1;
  addRange(report, tag, offset, offset + 4, false);
}

function addRange(report, type, start, end, confirmed) {
  if (report.byteRanges.length >= RVM_DIAGNOSTICS_LIMITS.maxByteRanges) return;
  report.byteRanges.push({ type, start, end, confirmed });
}

function ascii4(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return '';
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readU32(view, offset) { return offset >= 0 && offset + 4 <= view.byteLength ? view.getUint32(offset, true) : null; }
function readF32(view, offset) { return offset >= 0 && offset + 4 <= view.byteLength ? view.getFloat32(offset, true) : NaN; }
function byteLengthOf(value) { return value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? value.byteLength : 0; }
function byteView(value) { if (value instanceof ArrayBuffer) return new Uint8Array(value); return ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(0); }
function hasPrintableName(bytes, offset) { return offset < bytes.byteLength && bytes[offset] >= 32 && bytes[offset] <= 126; }
function warn(code, message) { return { severity: 'warning', code, message }; }
function error(code, message) { return { severity: 'error', code, message }; }
function invalid(message) { return { valid: false, errors: [message] }; }
