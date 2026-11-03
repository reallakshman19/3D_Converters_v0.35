import { nativeKindForCode, readWideTag } from './RvmWideRecordReader.js';
import { decodeRvmFacetGroupPayload } from './RvmFacetGroupPayloadDecoder.js';
import { decodeRvmPrimitiveParams, isSupportedPrimitiveCode } from './RvmPrimitiveParamsDecoder.js';
import { columnScales, isFiniteBbox, isMatrix3x4, normalizeBbox, transformLocalBbox } from './RvmPrimitiveTransformMath.js';

export const RVM_PRIMITIVE_PAYLOAD_DECODER_VERSION = '20260702-rvm-primitive-payload-decoder-v1';

export function decodeRvmPrimitivePayload(input = {}) {
  const record = input.primitiveRecord || {};
  if (!isSupportedPrimitiveCode(record.nativeCode)) return unsupported(record, 'unsupported-native-code');
  if (Number(record.nativeCode) === 11) return decodeRvmFacetGroupPayload(input);
  const view = dataViewOf(input.arrayBuffer);
  const header = validateHeader(view, record);
  if (!header.ok) return failed(record, header.reason, header.diagnostic);
  const floats = readFloatPayload(view, record.recordOffset + 32, record.recordEndOffset);
  if (floats.length < 18) return failed(record, 'payload-requires-18-floats', diag('RVM_PRIMITIVE_PAYLOAD_SHORT', 'PRIM payload has fewer than 18 float32 values', 'error'));
  return decodeFloats(record, floats);
}

export function readRvmPrimitivePayloadFloats(arrayBuffer, primitiveRecord) {
  const view = dataViewOf(arrayBuffer);
  return readFloatPayload(view, primitiveRecord.recordOffset + 32, primitiveRecord.recordEndOffset);
}

function validateHeader(view, record) {
  if (!view.byteLength) return bad('missing-array-buffer', 'RVM_PRIMITIVE_PAYLOAD_NO_BUFFER', 'arrayBuffer is required');
  if (!Number.isFinite(record.recordOffset) || record.recordOffset + 32 > view.byteLength) return bad('record-offset-out-of-bounds', 'RVM_PRIMITIVE_PAYLOAD_OFFSET_BOUNDS', 'record offset is out of bounds');
  if (readWideTag(view, record.recordOffset) !== 'PRIM') return bad('record-tag-not-prim', 'RVM_PRIMITIVE_PAYLOAD_TAG_MISMATCH', 'record tag is not PRIM');
  const nextOffset = view.getUint32(record.recordOffset + 16, false);
  const code = view.getUint32(record.recordOffset + 28, false);
  if (!compatibleEnd(nextOffset, record.recordEndOffset, view.byteLength)) return bad('record-end-mismatch', 'RVM_PRIMITIVE_PAYLOAD_END_MISMATCH', 'record nextOffset does not match ledger end offset');
  if (code !== record.nativeCode) return bad('native-code-mismatch', 'RVM_PRIMITIVE_PAYLOAD_CODE_MISMATCH', 'record native code does not match ledger native code');
  return { ok: true };
}

function decodeFloats(record, floats) {
  const transform3x4 = floats.slice(0, 12);
  const matrix3x3 = transform3x4.slice(0, 9);
  const origin = { x: transform3x4[9] || 0, y: transform3x4[10] || 0, z: transform3x4[11] || 0 };
  const localBbox = normalizeBbox(floats.slice(12, 18));
  const worldBbox = transformLocalBbox(transform3x4, localBbox);
  if (!isMatrix3x4(transform3x4) || !isFiniteBbox(localBbox) || !isFiniteBbox(worldBbox)) return failed(record, 'invalid-transform-or-bbox', diag('RVM_PRIMITIVE_PAYLOAD_INVALID_BBOX', 'transform or bbox evidence is invalid', 'error'));
  const params = decodeRvmPrimitiveParams(record.nativeCode, floats.slice(18), { localBbox, columnScales: columnScales(transform3x4) });
  if (!params.decoded) return failed(record, params.reason || 'native-params-not-decoded', diag('RVM_PRIMITIVE_PARAMS_FAILED', `native params failed for code ${record.nativeCode}`, 'warning'));
  return decoded(record, transform3x4, matrix3x3, origin, localBbox, worldBbox, params);
}

function decoded(record, transform3x4, matrix3x3, origin, localBbox, worldBbox, params) {
  const { decoded: _decoded, ...nativeParams } = params;
  return {
    id: `decoded-${record.id}`,
    primitiveRecordId: record.id,
    nodeId: record.nodeId,
    parentPath: record.parentPath,
    recordOffset: record.recordOffset,
    recordEndOffset: record.recordEndOffset,
    nativeCode: record.nativeCode,
    nativeKind: record.nativeKind || nativeKindForCode(record.nativeCode),
    decodeStatus: 'decoded-native',
    geometryDecoded: true,
    transform3x4,
    matrix3x3,
    origin,
    localBbox,
    worldBbox,
    nativeParams,
    geometryBasis: { source: 'rvm-native-primitive', confidence: 'native-evidence', renderReady: false },
    diagnostics: [],
  };
}

function unsupported(record, reason) {
  return diagnosticEntry(record, 'unsupported-diagnostic', reason, 'RVM_PRIMITIVE_UNSUPPORTED_CODE', 'warning');
}

function failed(record, reason, diagnostic) {
  const entry = diagnosticEntry(record, 'failed-diagnostic', reason, diagnostic?.code || 'RVM_PRIMITIVE_DECODE_FAILED', 'error');
  entry.diagnostics = [diagnostic || diag('RVM_PRIMITIVE_DECODE_FAILED', reason, 'error')];
  return entry;
}

function diagnosticEntry(record, status, reason, code, severity) {
  return {
    primitiveRecordId: record.id || '',
    nodeId: record.nodeId || '',
    parentPath: record.parentPath || '/',
    recordOffset: numberOrZero(record.recordOffset),
    recordEndOffset: numberOrZero(record.recordEndOffset),
    nativeCode: numberOrZero(record.nativeCode),
    nativeKind: record.nativeKind || nativeKindForCode(record.nativeCode),
    decodeStatus: status,
    geometryDecoded: false,
    reason,
    diagnostics: [diag(code, reason, severity, { primitiveRecordId: record.id, nativeCode: record.nativeCode })],
  };
}

function readFloatPayload(view, start, end) {
  const out = [];
  for (let offset = start; offset + 4 <= end && offset + 4 <= view.byteLength; offset += 4) out.push(view.getFloat32(offset, false));
  return out;
}

function compatibleEnd(nextOffset, ledgerEndOffset, byteLength) {
  return nextOffset === ledgerEndOffset || Math.min(nextOffset, byteLength) === ledgerEndOffset;
}

function bad(reason, code, message) {
  return { ok: false, reason, diagnostic: diag(code, message, 'error') };
}

function dataViewOf(value) {
  if (value instanceof ArrayBuffer) return new DataView(value);
  if (ArrayBuffer.isView(value)) return new DataView(value.buffer, value.byteOffset, value.byteLength);
  return new DataView(new ArrayBuffer(0));
}

function diag(code, message, severity, ref = {}) { return { severity, code, message, ref }; }
function numberOrZero(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
