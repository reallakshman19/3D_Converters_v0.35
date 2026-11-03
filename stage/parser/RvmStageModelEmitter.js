import { createEmptyRvmStageModel } from '../contracts/StageFactory.js';
import { RVM_STAGE_SCHEMA } from '../contracts/StageConstants.js';

export const RVM_STAGE_MODEL_EMITTER_VERSION = '20260702-rvm-stage-model-emitter-v1';

export function buildRvmStageModelFromEvidence(input = {}) {
  const ledger = input.ledger || {};
  const decodeReport = input.primitiveDecodeReport || {};
  const source = { ...(ledger.source || {}), ...(input.options || {}) };
  const model = createEmptyRvmStageModel({ fileName: source.fileName, fileSize: source.byteLength, fileHash: source.fileHash, units: 'm', coordinateBasis: 'rvm-native' });
  model.source = { ...model.source, kind: 'rvm-binary', byteLength: Number(source.byteLength) || model.source.fileSize, attAvailable: false, semanticSource: 'rvm-only' };
  model.parser = parserMetadata(input.readerReport, ledger, decodeReport);
  model.hierarchy.rootId = ledger.hierarchy?.rootNodeId || model.hierarchy.rootId;
  model.hierarchy.balanced = ledger.hierarchy?.balanced === true;
  model.hierarchy.maxDepth = Number(ledger.hierarchy?.maxDepth) || 0;
  model.hierarchy.nodes = stageNodes(ledger, model.hierarchy.rootId);
  model.primitives = stagePrimitives(ledger, decodeReport, model.hierarchy.rootId);
  attachPrimitiveIds(model.hierarchy.nodes, model.primitives, model.hierarchy.rootId);
  model.diagnostics = stageDiagnostics(model.primitives);
  return model;
}

export function summarizeRvmStageModelEmission(stageModel) {
  const primitives = Array.isArray(stageModel?.primitives) ? stageModel.primitives : [];
  return { schema: stageModel?.schema || RVM_STAGE_SCHEMA, sourceKind: stageModel?.source?.kind || '', attAvailable: stageModel?.source?.attAvailable === true, parserComplete: stageModel?.parser?.parserComplete === true, visualParityClaimed: stageModel?.parser?.visualParityClaimed === true, stageNodeCount: Array.isArray(stageModel?.hierarchy?.nodes) ? stageModel.hierarchy.nodes.length : 0, stagePrimitiveCount: primitives.length, decodedPrimitiveCount: primitives.filter((p) => p.geometryDecoded === true).length, unsupportedPrimitiveCount: primitives.filter((p) => p.decodeStatus === 'unsupported-diagnostic').length, failedPrimitiveCount: primitives.filter((p) => p.decodeStatus === 'failed-diagnostic').length, decodedByCode: countBy(primitives.filter((p) => p.geometryDecoded === true), 'nativeCode'), unsupportedByCode: countBy(primitives.filter((p) => p.decodeStatus === 'unsupported-diagnostic'), 'nativeCode'), failedByCode: countBy(primitives.filter((p) => p.decodeStatus === 'failed-diagnostic'), 'nativeCode'), diagnosticCount: stageModel?.diagnostics?.messages?.length || 0 };
}

function parserMetadata(readerReport, ledger, decodeReport) {
  return { readerSchema: readerReport?.schema || '', readerVersion: readerReport?.readerVersion || '', ledgerSchema: ledger?.schema || '', ledgerVersion: ledger?.ledgerVersion || '', primitiveDecodeSchema: decodeReport?.schema || '', primitiveDecodeVersion: decodeReport?.reportVersion || '', parserComplete: false, visualParityClaimed: false };
}

function stageNodes(ledger, rootId) {
  return (ledger.nodes || []).filter((node) => node.id !== rootId).map((node) => ({ id: node.id, parentId: node.parentId || rootId, name: node.name || `CNTB_${node.id}`, path: node.path || '/', depth: Number(node.depth) || 0, source: { kind: 'rvm-cntb', recordOffset: Number(node.recordOffset) || 0, recordEndOffset: Number(node.recordEndOffset) || 0 }, children: [...(node.childNodeIds || [])], primitiveIds: [], componentIds: [], diagnostics: weakNodeName(node) ? [diag('STAGE_RVM_WEAK_CNTB_NAME', `Weak CNTB name preserved for node ${node.id}`, 'warning')] : [] }));
}

function stagePrimitives(ledger, decodeReport, rootId) {
  const ledgerRecords = new Map((ledger.primitiveRecords || []).map((record) => [record.id, record]));
  const decoded = (decodeReport.decodedPrimitives || []).map((entry) => primitiveFromDecoded(entry, ledgerRecords.get(entry.primitiveRecordId), rootId));
  const diagnostic = (decodeReport.unsupportedPrimitives || []).map((entry) => primitiveFromDiagnostic(entry, ledgerRecords.get(entry.primitiveRecordId), rootId));
  return [...decoded, ...diagnostic].sort((a, b) => a.source.recordOffset - b.source.recordOffset);
}

function primitiveFromDecoded(entry, ledgerRecord, rootId) {
  const code = Number(entry.nativeCode);
  return { id: entry.id || `stage-${entry.primitiveRecordId}`, nodeId: entry.nodeId || ledgerRecord?.nodeId || rootId, nativeCode: code, nativeKind: entry.nativeKind, source: sourceRef(entry, ledgerRecord), decodeStatus: 'decoded-native', geometryDecoded: true, geometry: decodedGeometry(entry), semantic: rvmOnlySemantic(), native: { code, kind: entry.nativeKind, decoded: true }, nativeRecord: nativeRecord(entry, ledgerRecord, true), nativeParams: nativeParams(entry), nativeGeometry: nativeGeometry(entry), transform: { matrix3x4: entry.transform3x4, bboxLocal: entry.localBbox, bboxWorld: entry.worldBbox }, renderKind: renderKindFor(code), confidence: { geometry: 'native', semantic: 'unknown' }, recipeSource: { source: 'native', recipeId: `rvm-native-code-${code}`, quality: 'evidence' }, diagnostics: [...(entry.diagnostics || [])] };
}

function primitiveFromDiagnostic(entry, ledgerRecord, rootId) {
  const code = Number(entry.nativeCode);
  return { id: `stage-${entry.primitiveRecordId}`, nodeId: entry.nodeId || ledgerRecord?.nodeId || rootId, nativeCode: code, nativeKind: entry.nativeKind, source: sourceRef(entry, ledgerRecord), decodeStatus: entry.decodeStatus || 'unsupported-diagnostic', geometryDecoded: false, geometry: { basis: 'rvm-native-record-only', confidence: 'diagnostic', renderReady: false }, semantic: rvmOnlySemantic(), native: { code, kind: entry.nativeKind, decoded: false }, nativeRecord: nativeRecord(entry, ledgerRecord, false), renderKind: 'UNKNOWN_DIAGNOSTIC', confidence: { geometry: 'diagnostic', semantic: 'unknown' }, recipeSource: { source: 'diagnostic-fallback', recipeId: `unsupported-rvm-code-${code}`, quality: 'diagnostic' }, diagnosticFallback: { kind: 'unsupported-native-record', message: entry.reason || `Unsupported RVM primitive code ${code}`, visible: true, recipeSource: { source: 'diagnostic-fallback' } }, diagnostics: [...(entry.diagnostics || [diag('STAGE_UNDECODED_NATIVE_PRIMITIVE', `Unsupported RVM primitive code ${code}`, 'warning')])] };
}

function decodedGeometry(entry) {
  if (Number(entry.nativeCode) === 11) return { basis: 'rvm-native-facet-group', confidence: 'native-facet-evidence', transform3x4: entry.transform3x4, matrix3x3: entry.matrix3x3, origin: entry.origin, localBbox: entry.localBbox, worldBbox: entry.worldBbox, facetGroup: entry.facetGroup, renderReady: false };
  return { basis: 'rvm-native-primitive', confidence: 'native-evidence', transform3x4: entry.transform3x4, matrix3x3: entry.matrix3x3, origin: entry.origin, localBbox: entry.localBbox, worldBbox: entry.worldBbox, nativeParams: entry.nativeParams || {}, renderReady: false };
}

function nativeParams(entry) {
  if (Number(entry.nativeCode) === 11) return { facets: entry.facetGroup?.faceCount || 0, facetGroup: entry.facetGroup };
  return { ...(entry.nativeParams || {}) };
}

function nativeGeometry(entry) {
  return { provenance: 'native', nativeRecord: nativeRecord(entry, null, true), nativeParams: nativeParams(entry), transform3x4: entry.transform3x4, bboxLocal: entry.localBbox, bboxWorld: entry.worldBbox, recipeSource: { source: 'native', recipeId: `rvm-native-code-${entry.nativeCode}` } };
}

function nativeRecord(entry, ledgerRecord, decoded) {
  return { source: 'rvm-binary', recordType: Number(entry.nativeCode) === 11 ? 'RVM_FACET_GROUP' : 'RVM_PRIMITIVE', recordOffset: Number(entry.recordOffset) || Number(ledgerRecord?.recordOffset) || 0, nativeCode: Number(entry.nativeCode), recordLength: Math.max(0, Number(entry.recordEndOffset || ledgerRecord?.recordEndOffset) - Number(entry.recordOffset || ledgerRecord?.recordOffset)), decoded };
}

function stageDiagnostics(primitives) {
  const messages = primitives.filter((primitive) => primitive.geometryDecoded === false).map((primitive) => ({ severity: primitive.decodeStatus === 'failed-diagnostic' ? 'error' : 'warning', code: 'STAGE_FALLBACK_UNDECODED_NATIVE_PRIMITIVE', message: primitive.diagnosticFallback?.message || `Unsupported RVM primitive code ${primitive.nativeCode}`, ref: { primitiveId: primitive.id, nodeId: primitive.nodeId, nativeCode: primitive.nativeCode, recordOffset: primitive.source?.recordOffset }, fallback: { reason: primitive.decodeStatus, renderKind: primitive.renderKind, recipe: primitive.recipeSource?.recipeId } }));
  return { schema: 'RvmStageDiagnostics.v1', severityCounts: countSeverity(messages), nativeCodeCounts: countBy(messages.map((m) => m.ref), 'nativeCode'), renderKindCounts: countBy(messages.map((m) => m.fallback), 'renderKind'), semanticTypeCounts: {}, fallbackCounts: countBy(messages.map((m) => m.fallback), 'reason'), messages };
}

function sourceRef(entry, ledgerRecord) { return { kind: 'rvm-prim', recordOffset: Number(entry.recordOffset) || Number(ledgerRecord?.recordOffset) || 0, recordEndOffset: Number(entry.recordEndOffset) || Number(ledgerRecord?.recordEndOffset) || 0, parentPath: entry.parentPath || ledgerRecord?.parentPath || '/' }; }
function attachPrimitiveIds(nodes, primitives, rootId) { const byId = new Map(nodes.map((node) => [node.id, node])); for (const primitive of primitives) if (primitive.nodeId !== rootId) byId.get(primitive.nodeId)?.primitiveIds.push(primitive.id); }
function renderKindFor(code) { return ({ 2: 'BOX', 4: 'ELBOW', 8: 'CYLINDER', 9: 'SPHERE', 11: 'FACET_GROUP' })[Number(code)] || 'UNKNOWN_DIAGNOSTIC'; }
function rvmOnlySemantic() { return { source: 'rvm-only', confidence: 'limited' }; }
function countBy(items, key) { return items.reduce((out, item) => { const text = String(item?.[key] ?? ''); if (text) out[text] = (out[text] || 0) + 1; return out; }, {}); }
function countSeverity(messages) { return { info: 0, warning: messages.filter((m) => m.severity === 'warning').length, error: messages.filter((m) => m.severity === 'error').length }; }
function weakNodeName(node) { return !node?.name || /^CNTB_\d+$/i.test(String(node.name)); }
function diag(code, message, severity = 'info') { return { code, message, severity }; }
