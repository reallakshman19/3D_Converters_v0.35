import { RVM_FACET_GROUP_DECODE_SCHEMA } from '../contracts/RvmFacetGroupDecodeContract.js';
import { nativeKindForCode, readWideTag } from './RvmWideRecordReader.js';
import { isFiniteBbox, isMatrix3x4, normalizeBbox, normalizeBboxFromPoints, transformLocalBbox, transformPoint3x4 } from './RvmPrimitiveTransformMath.js';

export const RVM_FACET_GROUP_PAYLOAD_DECODER_VERSION = '20260702-rvm-code11-facet-decoder-v1';

const LIMITS = Object.freeze({ maxPolygons: 5000, maxContours: 1000, maxVerticesPerContour: 10000, maxVertices: 200000 });

export function decodeRvmFacetGroupPayload(input = {}) {
  const record = input.primitiveRecord || {};
  const view = dataViewOf(input.arrayBuffer);
  const header = validateFacetHeader(view, record);
  if (!header.ok) return failed(record, header.reason, header.diagnostic);
  const base = decodeFacetBase(view, record);
  if (!base.ok) return failed(record, base.reason, base.diagnostic);
  const stream = decodeFacetStream(view, base, record.recordEndOffset, input.limits || LIMITS);
  if (!stream.ok) return failed(record, stream.reason, stream.diagnostic);
  return decoded(record, base, stream.evidence);
}

export function summarizeFacetGroupsFromDecodeReport(report) {
  const groups = (report?.decodedPrimitives || []).map((entry) => entry.facetGroup).filter(Boolean);
  const failed = (report?.unsupportedPrimitives || []).filter((entry) => entry.nativeCode === 11 && entry.decodeStatus === 'failed-diagnostic');
  return {
    decodedFacetGroupCount: groups.length,
    failedFacetGroupCount: failed.length,
    totalFacetVertices: groups.reduce((sum, group) => sum + Number(group.vertexCount || 0), 0),
    totalFacetFaces: groups.reduce((sum, group) => sum + Number(group.faceCount || 0), 0),
    maxFacetVerticesPerPrimitive: Math.max(0, ...groups.map((group) => Number(group.vertexCount || 0))),
  };
}

function decodeFacetBase(view, record) {
  const floats = readFloatPayload(view, record.recordOffset + 32, record.recordEndOffset);
  if (floats.length < 18) return bad('payload-requires-18-floats', 'RVM_FACET_PAYLOAD_SHORT', 'facet PRIM payload has fewer than 18 floats');
  const transform3x4 = floats.slice(0, 12);
  const localBbox = normalizeBbox(floats.slice(12, 18));
  const worldBbox = transformLocalBbox(transform3x4, localBbox);
  if (!isMatrix3x4(transform3x4) || !isFiniteBbox(localBbox) || !isFiniteBbox(worldBbox)) return bad('invalid-transform-or-bbox', 'RVM_FACET_INVALID_BBOX', 'facet transform or bbox evidence is invalid');
  return { ok: true, transform3x4, matrix3x3: transform3x4.slice(0, 9), origin: { x: transform3x4[9] || 0, y: transform3x4[10] || 0, z: transform3x4[11] || 0 }, localBbox, worldBbox, streamOffset: record.recordOffset + 32 + 18 * 4 };
}

function decodeFacetStream(view, base, end, limits) {
  const state = { view, offset: base.streamOffset, end, transform3x4: base.transform3x4, limits: { ...LIMITS, ...limits }, vertices: [], normals: [], faces: [], polygonCount: 0, contourCount: 0 };
  try {
    state.polygonCount = readUint(state);
    if (!validCount(state.polygonCount, 1, state.limits.maxPolygons)) return streamBad('facet-polygon-count-cap', state);
    for (let polygon = 0; polygon < state.polygonCount; polygon += 1) readPolygon(state, polygon);
    return { ok: true, evidence: makeFacetEvidence(state) };
  } catch (error) {
    return { ok: false, reason: error?.message || 'facet-decode-failed', diagnostic: diag('RVM_FACET_STREAM_FAILED', error?.message || 'facet decode failed', 'error') };
  }
}

function readPolygon(state, polygonIndex) {
  const contourCount = readUint(state);
  if (!validCount(contourCount, 1, state.limits.maxContours)) throw new Error('facet-contour-count-cap');
  state.contourCount += contourCount;
  for (let contour = 0; contour < contourCount; contour += 1) readContour(state, polygonIndex, contour);
}

function readContour(state, polygonIndex, contourIndex) {
  const count = readUint(state);
  if (!validCount(count, 3, state.limits.maxVerticesPerContour)) throw new Error('facet-contour-vertex-count-cap');
  if (state.vertices.length + count > state.limits.maxVertices) throw new Error('facet-total-vertex-count-cap');
  const indices = [];
  for (let index = 0; index < count; index += 1) indices.push(readFacetVertex(state));
  state.faces.push({ polygonIndex, contourIndex, vertexIndices: indices });
}

function readFacetVertex(state) {
  const vertex = [round(readFloat(state)), round(readFloat(state)), round(readFloat(state))];
  const normal = [round(readFloat(state)), round(readFloat(state)), round(readFloat(state))];
  if (!vertex.every(Number.isFinite) || !normal.every(Number.isFinite)) throw new Error('facet-non-finite-vertex-normal');
  state.vertices.push(vertex);
  state.normals.push(normal);
  return state.vertices.length - 1;
}

function makeFacetEvidence(state) {
  const bboxLocal = normalizeBboxFromPoints(state.vertices.map(([x, y, z]) => ({ x, y, z })));
  const bboxWorld = normalizeBboxFromPoints(state.vertices.map(([x, y, z]) => transformPoint3x4(state.transform3x4, { x, y, z })));
  if (!isFiniteBbox(bboxLocal) || !isFiniteBbox(bboxWorld)) throw new Error('facet-invalid-derived-bbox');
  return { schema: RVM_FACET_GROUP_DECODE_SCHEMA, decoded: true, representation: 'native-facet-group', polygonCount: state.polygonCount, contourCount: state.contourCount, vertexCount: state.vertices.length, normalCount: state.normals.length, faceCount: state.faces.length, vertices: state.vertices, normals: state.normals, faces: state.faces, bboxLocal, bboxWorld, diagnostics: [] };
}

function decoded(record, base, facetGroup) {
  return { id: `decoded-${record.id}`, primitiveRecordId: record.id, nodeId: record.nodeId, parentPath: record.parentPath, recordOffset: record.recordOffset, recordEndOffset: record.recordEndOffset, nativeCode: 11, nativeKind: record.nativeKind || nativeKindForCode(11), decodeStatus: 'decoded-native', geometryDecoded: true, transform3x4: base.transform3x4, matrix3x3: base.matrix3x3, origin: base.origin, localBbox: base.localBbox, worldBbox: base.worldBbox, nativeParams: { facetGroupDecoded: true }, facetGroup, geometryBasis: { source: 'rvm-native-primitive', confidence: 'native-facet-evidence', renderReady: false }, diagnostics: [] };
}

function validateFacetHeader(view, record) {
  if (!view.byteLength) return bad('missing-array-buffer', 'RVM_FACET_NO_BUFFER', 'arrayBuffer is required');
  if (!Number.isFinite(record.recordOffset) || record.recordOffset + 32 > view.byteLength) return bad('record-offset-out-of-bounds', 'RVM_FACET_OFFSET_BOUNDS', 'record offset is out of bounds');
  if (readWideTag(view, record.recordOffset) !== 'PRIM') return bad('record-tag-not-prim', 'RVM_FACET_TAG_MISMATCH', 'record tag is not PRIM');
  const nextOffset = view.getUint32(record.recordOffset + 16, false);
  const code = view.getUint32(record.recordOffset + 28, false);
  if (code !== 11 || record.nativeCode !== 11) return bad('native-code-not-11', 'RVM_FACET_CODE_MISMATCH', 'record native code is not code 11');
  if (!compatibleEnd(nextOffset, record.recordEndOffset, view.byteLength)) return bad('record-end-mismatch', 'RVM_FACET_END_MISMATCH', 'record nextOffset does not match ledger end offset');
  return { ok: true };
}

function failed(record, reason, diagnostic) {
  return { primitiveRecordId: record.id || '', nodeId: record.nodeId || '', parentPath: record.parentPath || '/', recordOffset: numberOrZero(record.recordOffset), recordEndOffset: numberOrZero(record.recordEndOffset), nativeCode: numberOrZero(record.nativeCode), nativeKind: record.nativeKind || nativeKindForCode(record.nativeCode), decodeStatus: 'failed-diagnostic', geometryDecoded: false, reason, diagnostics: [diagnostic || diag('RVM_FACET_DECODE_FAILED', reason, 'error')] };
}

function readUint(state) { if (state.offset + 4 > state.end) throw new Error('facet-stream-eof-uint'); const value = state.view.getUint32(state.offset, false); state.offset += 4; return value; }
function readFloat(state) { if (state.offset + 4 > state.end) throw new Error('facet-stream-eof-float'); const value = state.view.getFloat32(state.offset, false); state.offset += 4; return value; }
function readFloatPayload(view, start, end) { const out = []; for (let offset = start; offset + 4 <= end && offset + 4 <= view.byteLength; offset += 4) out.push(view.getFloat32(offset, false)); return out; }
function compatibleEnd(nextOffset, ledgerEndOffset, byteLength) { return nextOffset === ledgerEndOffset || Math.min(nextOffset, byteLength) === ledgerEndOffset; }
function validCount(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function streamBad(reason, state) { return { ok: false, reason, diagnostic: diag('RVM_FACET_STREAM_LIMIT', reason, 'warning', { polygonCount: state.polygonCount, contourCount: state.contourCount, vertexCount: state.vertices.length }) }; }
function bad(reason, code, message) { return { ok: false, reason, diagnostic: diag(code, message, 'error') }; }
function dataViewOf(value) { if (value instanceof ArrayBuffer) return new DataView(value); if (ArrayBuffer.isView(value)) return new DataView(value.buffer, value.byteOffset, value.byteLength); return new DataView(new ArrayBuffer(0)); }
function diag(code, message, severity, ref = {}) { return { severity, code, message, ref }; }
function numberOrZero(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function round(value) { return Math.round(Number(value) * 1e6) / 1e6; }
