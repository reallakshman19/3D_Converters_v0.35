import {
  addStageDiagnostic,
  createDiagnosticFallback,
  createEmptyRvmStageModel,
  createNativeGeometryMetadata,
  createNativeRecordRef,
} from '../contracts/RvmStageModelContract.js';
import { decodeRvmCode4ElbowPayload, summarizeRvmCode4DecodeReport } from './RvmCode4ElbowDecoder.js';
import { readRvmRecordEvidence, summarizeRvmRecordEvidence } from './RvmRecordReader.js';

export const RVM_BINARY_STAGE_PARSER_VERSION = '20260701-rvm-binary-stage-parser-code4-mvp-v1';
export const RVM_BINARY_STAGE_PARSER_SCHEMA = 'RvmBinaryParserReport.v1';
export const RVM_BINARY_STAGE_RECORD_CONFIDENCE = Object.freeze({ candidate: 'candidate', decoded: 'decoded', unsupported: 'unsupported' });

export function createRvmBinaryParserReport(options = {}) {
  return {
    schema: RVM_BINARY_STAGE_PARSER_SCHEMA,
    parserVersion: RVM_BINARY_STAGE_PARSER_VERSION,
    source: { jobId: options.jobId || '', fileName: options.fileName || '', fileHash: options.fileHash || '', byteLength: byteLengthOf(options.arrayBuffer) },
    mode: 'mvp-vertical-slice', parserComplete: false, visualParityClaimed: false,
    records: { candidateCntb: 0, candidateCnte: 0, candidatePrim: 0, balancedHierarchy: false, decodedPrimitiveCount: 0, unsupportedPrimitiveCount: 0, diagnosticPrimitiveCount: 0 },
    decodedCodes: { 4: 0, 8: 0 }, unsupportedCodes: {}, hierarchy: { rootNodeId: 'node-root', nodeCount: 0, maxDepth: 0 },
    recordReaderSummary: null, decoderSummaries: [], byteRanges: [], diagnostics: [], errors: [], warnings: [],
  };
}

export function parseRvmBinaryToStageModel(input = {}) {
  const report = createRvmBinaryParserReport(input);
  try {
    const bytes = byteView(input.arrayBuffer);
    if (!bytes.byteLength) return fail(report, 'STAGE_RVM_PARSER_EMPTY_BINARY', 'binary byteLength must be greater than zero');
    const evidence = readRvmRecordEvidence(input);
    applyRecordEvidence(report, evidence);
    const slices = Array.isArray(evidence.primPayloadSlices) ? evidence.primPayloadSlices : [];
    const parsed = slices.map((slice) => decodePrimitive(input, slice, report));
    const decoded = parsed.filter((item) => item.decoded);
    const unsupported = parsed.filter((item) => !item.decoded);
    if (!report.records.balancedHierarchy || decoded.length < 1) return { ok: false, report, errors: report.errors, warnings: report.warnings };
    const stageModel = buildStageModel(input, report, decoded, unsupported);
    return { ok: true, stageModel, report, errors: [], warnings: report.warnings };
  } catch (error) {
    report.errors.push(diag('STAGE_RVM_PARSER_FAILED', error?.message || String(error), 'error'));
    return { ok: false, report, errors: report.errors, warnings: report.warnings };
  }
}

export function validateRvmBinaryParserReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return invalid('report must be an object');
  if (report.schema !== RVM_BINARY_STAGE_PARSER_SCHEMA) errors.push(`schema must be ${RVM_BINARY_STAGE_PARSER_SCHEMA}`);
  if (report.parserVersion !== RVM_BINARY_STAGE_PARSER_VERSION) errors.push('parserVersion is invalid');
  if (report.mode !== 'mvp-vertical-slice') errors.push('mode must be mvp-vertical-slice');
  if (report.parserComplete !== false) errors.push('parserComplete must remain false');
  if (report.visualParityClaimed !== false) errors.push('visualParityClaimed must remain false');
  for (const key of ['candidateCntb', 'candidateCnte', 'candidatePrim', 'decodedPrimitiveCount', 'unsupportedPrimitiveCount', 'diagnosticPrimitiveCount']) if (!Number.isFinite(report.records?.[key])) errors.push(`records.${key} must be finite`);
  for (const key of ['byteRanges', 'diagnostics', 'errors', 'warnings', 'decoderSummaries']) if (!Array.isArray(report[key])) errors.push(`${key} must be an array`);
  return { valid: errors.length === 0, errors };
}

export function summarizeRvmBinaryParserReport(report) {
  return {
    schema: report?.schema || '', parserVersion: report?.parserVersion || '', mode: report?.mode || '',
    parserComplete: report?.parserComplete === true, visualParityClaimed: report?.visualParityClaimed === true,
    candidateCntb: num(report?.records?.candidateCntb), candidateCnte: num(report?.records?.candidateCnte), candidatePrim: num(report?.records?.candidatePrim),
    balancedHierarchy: report?.records?.balancedHierarchy === true, decodedPrimitiveCount: num(report?.records?.decodedPrimitiveCount), unsupportedPrimitiveCount: num(report?.records?.unsupportedPrimitiveCount), diagnosticPrimitiveCount: num(report?.records?.diagnosticPrimitiveCount),
    decodedCodes: report?.decodedCodes || {}, unsupportedCodes: report?.unsupportedCodes || {}, decoderSummaries: report?.decoderSummaries || [], errorCount: (report?.errors || []).length, warningCount: (report?.warnings || []).length,
  };
}

function applyRecordEvidence(report, evidence) {
  const summary = summarizeRvmRecordEvidence(evidence);
  report.recordReaderSummary = summary;
  report.records.candidateCntb = summary.candidateRecords.cntb;
  report.records.candidateCnte = summary.candidateRecords.cnte;
  report.records.candidatePrim = summary.candidateRecords.prim;
  report.records.balancedHierarchy = summary.containerStack.balanced;
  report.hierarchy.maxDepth = summary.containerStack.maxDepth;
  report.hierarchy.nodeCount = summary.containerStack.balanced ? 2 : 1;
  report.byteRanges = evidence.byteRanges || [];
  report.warnings.push(...(evidence.warnings || []));
  report.errors.push(...(evidence.errors || []));
  if (!report.records.balancedHierarchy) report.warnings.push(diag('STAGE_RVM_PARSER_UNBALANCED_HIERARCHY', 'CNTB/CNTE candidate nesting is not balanced', 'warning'));
}

function decodePrimitive(input, slice, report) {
  if (slice.candidateNativeCode === 4) return decodeCode4(input, slice, report);
  if (slice.candidateNativeCode === 8) return decodeCode8(input.arrayBuffer, slice, report);
  return unsupportedPrimitive(slice, report);
}

function decodeCode4(input, slice, report) {
  const decodedReport = decodeRvmCode4ElbowPayload({ ...input, primSlice: slice });
  report.decoderSummaries.push(summarizeRvmCode4DecodeReport(decodedReport));
  report.diagnostics.push(...decodedReport.diagnostics);
  if (!decodedReport.decoded?.ok) return unsupportedPrimitive(slice, report, 'code4-decode-failed');
  report.records.decodedPrimitiveCount += 1; report.decodedCodes[4] += 1;
  return { decoded: true, code: 4, kind: 'ELBOW', offset: slice.offset, end: slice.endOffset, transform3x4: decodedReport.decoded.transform3x4, bboxLocal: decodedReport.decoded.bboxLocal, bboxWorld: decodedReport.decoded.bboxWorld, params: decodedReport.decoded.nativeParams };
}

function decodeCode8(arrayBuffer, slice, report) {
  const bytes = byteView(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = slice.offset + 12;
  if (slice.candidatePayloadLength < 80) return unsupportedPrimitive(slice, report, 'short-code8-payload');
  const transform3x4 = readF32Array(view, start, 12);
  const bboxWorld = readF32Array(view, start + 48, 6);
  const radius = readF32(view, start + 72);
  const length = readF32(view, start + 76);
  if (!isMatrix(transform3x4) || !isBbox(bboxWorld) || !Number.isFinite(radius) || !Number.isFinite(length)) return unsupportedPrimitive(slice, report, 'invalid-code8-payload');
  report.records.decodedPrimitiveCount += 1; report.decodedCodes[8] += 1;
  return { decoded: true, code: 8, kind: 'CYLINDER', offset: slice.offset, end: slice.endOffset, transform3x4, bboxLocal: bboxWorld, bboxWorld, params: { radius, length } };
}

function unsupportedPrimitive(slice, report, reason = 'unsupported-native-code') {
  const code = slice.candidateNativeCode;
  report.records.unsupportedPrimitiveCount += 1; report.records.diagnosticPrimitiveCount += 1; increment(report.unsupportedCodes, code);
  report.diagnostics.push(diag('STAGE_RVM_PARSER_UNSUPPORTED_PRIMITIVE', `Primitive code ${code} is diagnostic-only in the MVP parser`, 'warning', { nativeCode: code, recordOffset: slice.offset, reason }));
  return { decoded: false, code, offset: slice.offset, end: slice.endOffset, reason, bboxWorld: [0, 0, 0, 1, 1, 1] };
}

function buildStageModel(input, report, decoded, unsupported) {
  const model = createEmptyRvmStageModel({ fileName: input.fileName, fileSize: byteLengthOf(input.arrayBuffer), fileHash: input.fileHash, units: 'm' });
  model.materials.push({ id: 'mat-rvm-mvp-default', name: 'RVM MVP default material', color: [0.72, 0.72, 0.72, 1] }, { id: 'mat-rvm-mvp-diagnostic', name: 'RVM MVP diagnostic material', color: [1, 0.6, 0.2, 1] });
  const all = [...decoded, ...unsupported];
  model.hierarchy.nodes.push({ id: 'node-rvm-mvp-000001', parentId: 'node-root', name: 'RVM MVP parsed group', path: '/RVM_MVP', kind: 'RVM_MVP_GROUP', componentIds: [], primitiveIds: [], bboxWorld: unionBbox(all.map((item) => item.bboxWorld)) });
  all.forEach((item, index) => addPrimitiveBundle(model, report, item, index + 1));
  return model;
}

function addPrimitiveBundle(model, report, item, number) {
  const node = model.hierarchy.nodes[0], componentId = id('comp', number), primitiveId = id('prim', number), decoded = item.decoded === true;
  const semanticType = decoded && item.kind === 'ELBOW' ? 'ELBOW' : decoded ? 'PIPE' : 'UNKNOWN';
  node.componentIds.push(componentId); node.primitiveIds.push(primitiveId);
  model.components.push({ id: componentId, nodeId: node.id, semanticType, name: decoded ? `RVM MVP decoded ${semanticType.toLowerCase()}` : 'RVM MVP diagnostic primitive', ownerPath: node.path, primitiveIds: [primitiveId], bboxWorld: item.bboxWorld, confidence: { geometry: decoded ? 'native' : 'diagnostic', semantic: decoded ? 'attribute' : 'unknown' }, renderPolicy: renderPolicy(), diagnostics: [] });
  model.primitives.push(decoded ? createDecodedPrimitive(item, node.id, componentId, primitiveId) : createDiagnosticPrimitive(item, node.id, componentId, primitiveId, model, report));
}

function createDecodedPrimitive(item, nodeId, componentId, primitiveId) {
  const nativeRecord = createNativeRecordRef({ source: 'rvm-binary-mvp', recordType: 'RVM_PRIMITIVE', recordOffset: item.offset, nativeCode: item.code, recordLength: item.end - item.offset, decoded: true });
  const nativeParams = { ...item.params, parserMode: 'mvp-vertical-slice' };
  const renderKind = item.kind === 'ELBOW' ? 'ELBOW' : 'CYLINDER';
  const recipeId = item.code === 4 ? 'mvp-code4-elbow' : 'mvp-code8-cylinder';
  return { id: primitiveId, nodeId, componentId, native: { recordOffset: item.offset, code: item.code, kind: renderKind, decoded: true }, nativeRecord, nativeParams, nativeGeometry: createNativeGeometryMetadata({ nativeRecord, nativeParams, transform3x4: item.transform3x4, bboxLocal: item.bboxLocal, bboxWorld: item.bboxWorld }), transform3x4: item.transform3x4, bboxLocal: item.bboxLocal, bboxWorld: item.bboxWorld, transform: { matrix3x4: item.transform3x4, bboxLocal: item.bboxLocal, bboxWorld: item.bboxWorld }, params: item.params, confidence: { geometry: 'native', semantic: 'attribute' }, renderKind, materialId: 'mat-rvm-mvp-default', recipeSource: { source: 'native', quality: 'full', output: 'procedural', recipeId }, diagnostics: [] };
}

function createDiagnosticPrimitive(item, nodeId, componentId, primitiveId, model, report) {
  const fallback = createDiagnosticFallback({ kind: 'unsupported-native-record', visible: true, message: `Primitive code ${item.code} is unsupported in the MVP parser.` });
  const diagnostic = { severity: 'warning', code: 'STAGE_FALLBACK_UNKNOWN_NATIVE_CODE', message: fallback.message, ref: { nodeId, componentId, primitiveId, nativeCode: item.code, recordOffset: item.offset }, fallback: { reason: fallback.kind, renderKind: 'UNKNOWN_DIAGNOSTIC', recipe: 'diagnostic-bbox' } };
  model.diagnostics = addStageDiagnostic(model.diagnostics, diagnostic);
  return { id: primitiveId, nodeId, componentId, native: { recordOffset: item.offset, code: item.code, kind: 'Unknown', decoded: false }, transform: { matrix3x4: identity(), bboxLocal: item.bboxWorld, bboxWorld: item.bboxWorld }, params: { diagnosticOnly: true }, confidence: { geometry: 'diagnostic', semantic: 'unknown' }, renderKind: 'UNKNOWN_DIAGNOSTIC', materialId: 'mat-rvm-mvp-diagnostic', recipeSource: { source: 'diagnostic-fallback', quality: 'full', output: 'bbox', recipeId: 'mvp-unsupported-diagnostic' }, diagnosticFallback: fallback, diagnostics: report.diagnostics.filter((entry) => entry.ref?.recordOffset === item.offset).concat(diagnostic) };
}

function fail(report, code, message) { report.errors.push(diag(code, message, 'error')); return { ok: false, report, errors: report.errors, warnings: report.warnings }; }
function renderPolicy() { return { full: 'native-primitives', medium: 'simplified-primitives', light: 'proxy-bbox', skeleton: 'centerline-or-icon', hidden: 'hide' }; }
function id(prefix, number) { return `${prefix}-${String(number).padStart(6, '0')}`; }
function identity() { return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; }
function unionBbox(boxes) { const valid = boxes.filter(isBbox); if (!valid.length) return [0, 0, 0, 1, 1, 1]; return [Math.min(...valid.map((b) => b[0])), Math.min(...valid.map((b) => b[1])), Math.min(...valid.map((b) => b[2])), Math.max(...valid.map((b) => b[3])), Math.max(...valid.map((b) => b[4])), Math.max(...valid.map((b) => b[5]))]; }
function readF32(view, offset) { return offset >= 0 && offset + 4 <= view.byteLength ? view.getFloat32(offset, true) : NaN; }
function readF32Array(view, offset, count) { return Array.from({ length: count }, (_, index) => readF32(view, offset + index * 4)); }
function isMatrix(value) { return Array.isArray(value) && value.length === 12 && value.every(Number.isFinite); }
function isBbox(value) { return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5]; }
function byteLengthOf(value) { return value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? value.byteLength : 0; }
function byteView(value) { if (value instanceof ArrayBuffer) return new Uint8Array(value); return ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(0); }
function increment(target, key) { const text = String(key); target[text] = (target[text] || 0) + 1; }
function num(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function diag(code, message, severity, ref = {}) { return { severity, code, message, ref }; }
function invalid(message) { return { valid: false, errors: [message] }; }
