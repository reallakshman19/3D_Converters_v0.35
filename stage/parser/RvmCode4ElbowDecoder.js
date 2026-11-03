export const RVM_CODE4_ELBOW_DECODER_VERSION = '20260701-rvm-code4-elbow-decoder-v1';
export const RVM_CODE4_ELBOW_DECODER_SCHEMA = 'RvmCode4ElbowDecodeReport.v1';
export const RVM_CODE4_ELBOW_DECODER_LIMITS = Object.freeze({ minPayloadLength: 88, transformFloatCount: 12, bboxFloatCount: 6, paramFloatCount: 4 });
export const RVM_CODE4_ELBOW_LAYOUTS = Object.freeze({ mvpFloat32TransformBboxParams: 'mvp-float32-transform-bbox-elbow-params-v1' });

export function createRvmCode4DecodeReport(options = {}) {
  const slice = options.primSlice || {};
  return {
    schema: RVM_CODE4_ELBOW_DECODER_SCHEMA,
    decoderVersion: RVM_CODE4_ELBOW_DECODER_VERSION,
    source: { jobId: options.jobId || '', fileName: options.fileName || '', fileHash: options.fileHash || '', byteLength: byteLengthOf(options.arrayBuffer) },
    decoderComplete: false,
    visualParityClaimed: false,
    layout: { name: RVM_CODE4_ELBOW_LAYOUTS.mvpFloat32TransformBboxParams, supported: false, reasonCodes: [] },
    input: { primOffset: num(slice.offset), payloadOffset: num(slice.offset) + 12, payloadLength: num(slice.candidatePayloadLength), bounded: slice.bounded === true },
    decoded: { ok: false, nativeCode: 4, nativeParams: null, transform3x4: null, bboxLocal: null, bboxWorld: null },
    diagnostics: [],
    warnings: [],
    errors: [],
  };
}

export function decodeRvmCode4ElbowPayload(input = {}) {
  const report = createRvmCode4DecodeReport(input);
  try {
    const bytes = byteView(input.arrayBuffer);
    const slice = input.primSlice || {};
    const reasons = validateSlice(bytes, slice);
    if (reasons.length) return reject(report, reasons);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const payloadOffset = slice.offset + 12;
    const transform3x4 = readF32Array(view, payloadOffset, 12);
    const bboxLocal = readF32Array(view, payloadOffset + 48, 6);
    const params = readF32Array(view, payloadOffset + 72, 4);
    const payloadReasons = validatePayload(transform3x4, bboxLocal, params);
    if (payloadReasons.length) return reject(report, payloadReasons);
    report.layout.supported = true;
    report.layout.reasonCodes = ['CODE4_MVP_LAYOUT_SUPPORTED'];
    report.decoded = { ok: true, nativeCode: 4, nativeParams: nativeParams(params, report.layout.name), transform3x4, bboxLocal, bboxWorld: [...bboxLocal] };
  } catch (error) {
    reject(report, ['CODE4_DECODER_FAILED']);
    report.errors.push(message('STAGE_RVM_CODE4_DECODER_FAILED', error?.message || String(error), 'error'));
  }
  return report;
}

export function summarizeRvmCode4DecodeReport(report) {
  return {
    schema: report?.schema || RVM_CODE4_ELBOW_DECODER_SCHEMA,
    decoderVersion: report?.decoderVersion || RVM_CODE4_ELBOW_DECODER_VERSION,
    byteLength: Number(report?.source?.byteLength) || 0,
    decoderComplete: report?.decoderComplete === true,
    visualParityClaimed: report?.visualParityClaimed === true,
    layoutName: report?.layout?.name || '',
    layoutSupported: report?.layout?.supported === true,
    decodedOk: report?.decoded?.ok === true,
    nativeCode: Number(report?.decoded?.nativeCode) || 0,
    payloadLength: Number(report?.input?.payloadLength) || 0,
    reasonCodes: [...(report?.layout?.reasonCodes || [])],
    warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
    errorCount: Array.isArray(report?.errors) ? report.errors.length : 0,
  };
}

export function validateRvmCode4DecodeReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return invalid('report must be an object');
  if (report.schema !== RVM_CODE4_ELBOW_DECODER_SCHEMA) errors.push(`schema must be ${RVM_CODE4_ELBOW_DECODER_SCHEMA}`);
  if (report.decoderVersion !== RVM_CODE4_ELBOW_DECODER_VERSION) errors.push('decoderVersion is invalid');
  if (report.decoderComplete !== false) errors.push('decoderComplete must remain false');
  if (report.visualParityClaimed !== false) errors.push('visualParityClaimed must remain false');
  if (!report.layout || typeof report.layout !== 'object') errors.push('layout is required');
  if (!report.input || typeof report.input !== 'object') errors.push('input is required');
  if (!report.decoded || typeof report.decoded !== 'object') errors.push('decoded is required');
  if (report.decoded?.nativeCode !== 4) errors.push('decoded.nativeCode must be 4');
  for (const key of ['diagnostics', 'warnings', 'errors']) if (!Array.isArray(report[key])) errors.push(`${key} must be an array`);
  return { valid: errors.length === 0, errors };
}

function validateSlice(bytes, slice) {
  const reasons = [];
  if (!slice || typeof slice !== 'object') reasons.push('CODE4_PRIM_SLICE_REQUIRED');
  if (slice.candidateNativeCode !== 4) reasons.push('CODE4_NATIVE_CODE_REQUIRED');
  if (slice.bounded !== true) reasons.push('CODE4_BOUNDED_SLICE_REQUIRED');
  if (!Number.isFinite(slice.offset) || !Number.isFinite(slice.endOffset)) reasons.push('CODE4_SLICE_OFFSETS_REQUIRED');
  if (slice.candidatePayloadLength < RVM_CODE4_ELBOW_DECODER_LIMITS.minPayloadLength) reasons.push('CODE4_PAYLOAD_TOO_SHORT');
  if (Number.isFinite(slice.offset) && slice.offset + 12 + slice.candidatePayloadLength > bytes.byteLength) reasons.push('CODE4_PAYLOAD_OUT_OF_BOUNDS');
  return reasons;
}

function validatePayload(transform3x4, bboxLocal, params) {
  const reasons = [];
  if (!isFiniteArray(transform3x4, 12)) reasons.push('CODE4_TRANSFORM_INVALID');
  if (!isBbox(bboxLocal)) reasons.push('CODE4_BBOX_INVALID');
  if (!isFiniteArray(params, 4)) reasons.push('CODE4_PARAMS_INVALID');
  if (Number.isFinite(params[0]) && params[0] <= 0) reasons.push('CODE4_RADIUS_NON_POSITIVE');
  if (Number.isFinite(params[1]) && params[1] <= 0) reasons.push('CODE4_BEND_RADIUS_NON_POSITIVE');
  if (Number.isFinite(params[2]) && params[2] <= 0) reasons.push('CODE4_ANGLE_NON_POSITIVE');
  if (Number.isFinite(params[3]) && params[3] <= 0) reasons.push('CODE4_SWEEP_NON_POSITIVE');
  return reasons;
}

function reject(report, reasonCodes) {
  report.layout.supported = false;
  report.layout.reasonCodes = [...new Set(reasonCodes)];
  report.diagnostics.push(message('STAGE_RVM_CODE4_LAYOUT_UNSUPPORTED', `Code 4 payload did not satisfy MVP layout: ${report.layout.reasonCodes.join(', ')}`, 'warning'));
  return report;
}

function readF32Array(view, offset, count) {
  return Array.from({ length: count }, (_, index) => readF32(view, offset + index * 4));
}

function nativeParams(params, layoutName) {
  return { radius: params[0], bendRadius: params[1], angleDeg: params[2], sweepRadians: params[3], layoutName, provenance: 'code4-mvp-layout' };
}

function readF32(view, offset) {
  return offset >= 0 && offset + 4 <= view.byteLength ? view.getFloat32(offset, true) : NaN;
}

function byteLengthOf(value) { return value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? value.byteLength : 0; }
function byteView(value) { if (value instanceof ArrayBuffer) return new Uint8Array(value); return ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(0); }
function isFiniteArray(value, count) { return Array.isArray(value) && value.length === count && value.every(Number.isFinite); }
function isBbox(value) { return isFiniteArray(value, 6) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5]; }
function num(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function message(code, text, severity) { return { severity, code, message: text }; }
function invalid(messageText) { return { valid: false, errors: [messageText] }; }
