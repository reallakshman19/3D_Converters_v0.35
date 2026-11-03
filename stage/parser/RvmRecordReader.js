export const RVM_RECORD_READER_VERSION = '20260701-rvm-record-reader-v1';
export const RVM_RECORD_READER_SCHEMA = 'RvmRecordReaderReport.v1';
export const RVM_RECORD_READER_LIMITS = Object.freeze({ maxScanBytes: 2_000_000, maxByteRanges: 128, maxPrimSlices: 128, maxWarnings: 64 });
export const RVM_RECORD_EVIDENCE_LEVELS = Object.freeze({ candidate: 'candidate', bounded: 'bounded-candidate', truncated: 'truncated-candidate', malformed: 'malformed-candidate' });

export function createRvmRecordReaderReport(options = {}) {
  return {
    schema: RVM_RECORD_READER_SCHEMA,
    readerVersion: RVM_RECORD_READER_VERSION,
    source: { jobId: options.jobId || '', fileName: options.fileName || '', fileHash: options.fileHash || '', byteLength: byteLengthOf(options.arrayBuffer) },
    evidenceMode: 'record-reader-candidate',
    parserComplete: false,
    visualParityClaimed: false,
    candidateRecords: { total: 0, cntb: 0, cnte: 0, prim: 0, bbox: 0, unknown: 0 },
    confirmedRecords: { total: 0 },
    containerStack: { balanced: false, maxDepth: 0, unmatchedCntb: 0, unmatchedCnte: 0 },
    primPayloadSlices: [],
    nativeCodeCounts: {},
    byteRanges: [],
    warnings: [],
    errors: [],
  };
}

export function readRvmRecordEvidence(input = {}) {
  const report = createRvmRecordReaderReport(input);
  try {
    const bytes = byteView(input.arrayBuffer);
    if (!bytes.byteLength) {
      report.errors.push(message('STAGE_RVM_RECORD_READER_EMPTY_BINARY', 'binary byteLength must be greater than zero', 'error'));
      return report;
    }
    scanCandidateRecords(bytes, report);
    finishContainerStack(report);
    if (!report.candidateRecords.total) report.warnings.push(message('STAGE_RVM_RECORD_READER_NO_CANDIDATES', 'no conservative record candidates detected', 'warning'));
    if (bytes.byteLength > RVM_RECORD_READER_LIMITS.maxScanBytes) report.warnings.push(message('STAGE_RVM_RECORD_READER_SCAN_TRUNCATED', 'record reader scan truncated by safety limit', 'warning'));
  } catch (error) {
    report.errors.push(message('STAGE_RVM_RECORD_READER_FAILED', error?.message || String(error), 'error'));
  }
  return report;
}

export function summarizeRvmRecordEvidence(report) {
  return {
    schema: report?.schema || RVM_RECORD_READER_SCHEMA,
    readerVersion: report?.readerVersion || RVM_RECORD_READER_VERSION,
    byteLength: Number(report?.source?.byteLength) || 0,
    candidateRecords: { total: num(report?.candidateRecords?.total), cntb: num(report?.candidateRecords?.cntb), cnte: num(report?.candidateRecords?.cnte), prim: num(report?.candidateRecords?.prim), bbox: num(report?.candidateRecords?.bbox), unknown: num(report?.candidateRecords?.unknown) },
    confirmedRecords: { total: num(report?.confirmedRecords?.total) },
    containerStack: { balanced: report?.containerStack?.balanced === true, maxDepth: num(report?.containerStack?.maxDepth), unmatchedCntb: num(report?.containerStack?.unmatchedCntb), unmatchedCnte: num(report?.containerStack?.unmatchedCnte) },
    primPayloadSliceCount: Array.isArray(report?.primPayloadSlices) ? report.primPayloadSlices.length : 0,
    nativeCodeCounts: report?.nativeCodeCounts || {},
    byteRangeCount: Array.isArray(report?.byteRanges) ? report.byteRanges.length : 0,
    warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
    errorCount: Array.isArray(report?.errors) ? report.errors.length : 0,
  };
}

export function validateRvmRecordReaderReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return invalid('report must be an object');
  if (report.schema !== RVM_RECORD_READER_SCHEMA) errors.push(`schema must be ${RVM_RECORD_READER_SCHEMA}`);
  if (report.readerVersion !== RVM_RECORD_READER_VERSION) errors.push('readerVersion is invalid');
  if (report.evidenceMode !== 'record-reader-candidate') errors.push('evidenceMode must be record-reader-candidate');
  if (report.parserComplete !== false) errors.push('parserComplete must remain false');
  if (report.visualParityClaimed !== false) errors.push('visualParityClaimed must remain false');
  if (report.confirmedRecords?.total !== 0) errors.push('confirmedRecords.total must remain 0');
  for (const key of ['total', 'cntb', 'cnte', 'prim', 'bbox', 'unknown']) if (!Number.isFinite(report.candidateRecords?.[key])) errors.push(`candidateRecords.${key} must be finite`);
  for (const key of ['balanced', 'maxDepth', 'unmatchedCntb', 'unmatchedCnte']) if (report.containerStack?.[key] === undefined) errors.push(`containerStack.${key} is required`);
  for (const key of ['primPayloadSlices', 'byteRanges', 'warnings', 'errors']) if (!Array.isArray(report[key])) errors.push(`${key} must be an array`);
  for (const slice of report.primPayloadSlices || []) validatePrimSlice(slice, errors);
  return { valid: errors.length === 0, errors };
}

function scanCandidateRecords(bytes, report) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let depth = 0;
  const limit = Math.min(Math.max(bytes.byteLength - 3, 0), RVM_RECORD_READER_LIMITS.maxScanBytes);
  for (let offset = 0; offset < limit; offset += 1) {
    const tag = ascii4(bytes, offset);
    if (tag === 'CNTB') { depth += 1; report.containerStack.maxDepth = Math.max(report.containerStack.maxDepth, depth); count(report, 'cntb', tag, offset, offset + 4); continue; }
    if (tag === 'CNTE') { if (depth === 0) report.containerStack.unmatchedCnte += 1; else depth -= 1; count(report, 'cnte', tag, offset, offset + 4); continue; }
    if (tag === 'PRIM') { readPrimSlice(view, report, offset); continue; }
    if (tag === 'BBOX') { count(report, 'bbox', tag, offset, Math.min(offset + 28, view.byteLength)); }
  }
  report.containerStack.unmatchedCntb = depth;
}

function readPrimSlice(view, report, offset) {
  const headerBounded = offset + 12 <= view.byteLength;
  const code = headerBounded ? readU32(view, offset + 4) : null;
  const payloadLength = headerBounded ? readU32(view, offset + 8) : null;
  const endOffset = headerBounded && Number.isInteger(payloadLength) ? offset + 12 + payloadLength : offset + 4;
  const bounded = headerBounded && Number.isInteger(payloadLength) && payloadLength >= 0 && endOffset <= view.byteLength;
  const reasonCodes = reasonCodesFor(headerBounded, payloadLength, bounded);
  const evidenceLevel = bounded ? RVM_RECORD_EVIDENCE_LEVELS.bounded : headerBounded ? RVM_RECORD_EVIDENCE_LEVELS.truncated : RVM_RECORD_EVIDENCE_LEVELS.malformed;
  count(report, 'prim', 'PRIM', offset, Math.min(endOffset, view.byteLength));
  if (Number.isInteger(code)) increment(report.nativeCodeCounts, code);
  if (report.primPayloadSlices.length < RVM_RECORD_READER_LIMITS.maxPrimSlices) report.primPayloadSlices.push({ offset, endOffset: Math.min(endOffset, view.byteLength), candidateNativeCode: code, candidatePayloadLength: payloadLength, bounded, evidenceLevel, reasonCodes });
}

function reasonCodesFor(headerBounded, payloadLength, bounded) {
  const reasons = [];
  if (!headerBounded) reasons.push('PRIM_HEADER_OUT_OF_BOUNDS');
  if (headerBounded && !Number.isInteger(payloadLength)) reasons.push('PRIM_PAYLOAD_LENGTH_MISSING');
  if (headerBounded && Number.isInteger(payloadLength) && payloadLength < 0) reasons.push('PRIM_PAYLOAD_LENGTH_NEGATIVE');
  if (headerBounded && !bounded) reasons.push('PRIM_PAYLOAD_OUT_OF_BOUNDS');
  if (bounded) reasons.push('PRIM_PAYLOAD_BOUNDED');
  return reasons;
}

function finishContainerStack(report) {
  report.containerStack.balanced = report.candidateRecords.cntb > 0 && report.containerStack.unmatchedCntb === 0 && report.containerStack.unmatchedCnte === 0;
}

function count(report, key, type, start, end) {
  report.candidateRecords.total += 1;
  report.candidateRecords[key] += 1;
  if (report.byteRanges.length < RVM_RECORD_READER_LIMITS.maxByteRanges) report.byteRanges.push({ type, start, end, evidenceLevel: RVM_RECORD_EVIDENCE_LEVELS.candidate });
}

function validatePrimSlice(slice, errors) {
  if (!slice || typeof slice !== 'object') return errors.push('primPayloadSlice must be an object');
  for (const key of ['offset', 'endOffset']) if (!Number.isFinite(slice[key])) errors.push(`primPayloadSlice.${key} must be finite`);
  if (typeof slice.bounded !== 'boolean') errors.push('primPayloadSlice.bounded must be boolean');
  if (!Object.values(RVM_RECORD_EVIDENCE_LEVELS).includes(slice.evidenceLevel)) errors.push(`primPayloadSlice.evidenceLevel is invalid: ${slice.evidenceLevel}`);
  if (!Array.isArray(slice.reasonCodes)) errors.push('primPayloadSlice.reasonCodes must be an array');
}

function ascii4(bytes, offset) { return offset >= 0 && offset + 4 <= bytes.byteLength ? String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]) : ''; }
function readU32(view, offset) { return offset >= 0 && offset + 4 <= view.byteLength ? view.getUint32(offset, true) : null; }
function byteLengthOf(value) { return value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? value.byteLength : 0; }
function byteView(value) { if (value instanceof ArrayBuffer) return new Uint8Array(value); return ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(0); }
function increment(target, key) { const text = String(key); target[text] = (target[text] || 0) + 1; }
function num(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function message(code, text, severity) { return { severity, code, message: text }; }
function invalid(messageText) { return { valid: false, errors: [messageText] }; }
