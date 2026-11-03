export const RVM_STAGE_UI_SUMMARY_VERSION = '20260702-rvm-stage-ui-summary-v1';

const KIND_BY_CODE = Object.freeze({ 1: 'Pyramid', 2: 'Box', 4: 'CircularTorus', 5: 'EllipticalDish', 6: 'SphericalDish', 7: 'Snout', 8: 'Cylinder', 9: 'Sphere', 10: 'Line', 11: 'FacetGroup' });

export function deriveRvmStageUiSummary(model, workerMessages = []) {
  const primitives = Array.isArray(model?.primitives) ? model.primitives : [];
  const diagnostics = diagnosticsOf(model);
  return {
    source: { fileName: model?.source?.fileName || '', kind: model?.source?.kind || '', attAvailable: model?.source?.attAvailable === true, byteLength: Number(model?.source?.byteLength || model?.source?.fileSize) || 0 },
    parser: { parserComplete: model?.parser?.parserComplete === true, visualParityClaimed: model?.parser?.visualParityClaimed === true },
    counts: { hierarchyNodes: Array.isArray(model?.hierarchy?.nodes) ? model.hierarchy.nodes.length : 0, totalPrimitives: primitives.length, decodedPrimitives: primitives.filter((p) => p.geometryDecoded === true).length, unsupportedPrimitives: primitives.filter((p) => p.decodeStatus === 'unsupported-diagnostic').length, failedPrimitives: primitives.filter((p) => p.decodeStatus === 'failed-diagnostic').length, diagnostics: diagnostics.length, workerMessages: workerMessages.length },
    coverage: coverageRows(primitives),
    diagnostics: diagnostics.map(diagnosticRow),
  };
}

export function buildStageModelDownload(model, sourceFileName = '') {
  return { fileName: stageModelDownloadFileName(sourceFileName || model?.source?.fileName), text: JSON.stringify(model || {}, null, 2) };
}

export function stageModelDownloadFileName(sourceFileName = '') {
  const base = String(sourceFileName || 'rvm-stage-model').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim() || 'rvm-stage-model';
  return `${base}.stage-model.json`;
}

export function hasUnsafeRenderClaim(model) {
  const text = JSON.stringify(model || {});
  return text.includes('"parserComplete":true') || text.includes('"visualParityClaimed":true') || text.includes('"renderReady":true');
}

function coverageRows(primitives) {
  const counts = new Map();
  for (const primitive of primitives) {
    const code = String(primitive.nativeCode ?? 'unknown');
    const status = primitive.geometryDecoded ? 'decoded' : (primitive.decodeStatus === 'failed-diagnostic' ? 'failed' : 'unsupported');
    const key = `${code}|${status}`;
    counts.set(key, { code, kind: KIND_BY_CODE[code] || primitive.nativeKind || 'unsupported', status: status === 'unsupported' ? 'diagnostic' : status, count: (counts.get(key)?.count || 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => Number(a.code) - Number(b.code) || a.status.localeCompare(b.status));
}

function diagnosticsOf(model) {
  const messages = Array.isArray(model?.diagnostics?.messages) ? model.diagnostics.messages : [];
  const primitiveDiagnostics = (model?.primitives || []).flatMap((primitive) => (primitive.diagnostics || []).map((item) => ({ ...item, ref: { ...(item.ref || {}), primitiveId: primitive.id, nodeId: primitive.nodeId, nativeCode: primitive.nativeCode } })));
  return [...messages, ...primitiveDiagnostics];
}

function diagnosticRow(message) {
  const ref = message?.ref || {};
  return { severity: message?.severity || 'info', code: message?.code || '', message: message?.message || message?.text || String(message || ''), nativeCode: ref.nativeCode ?? '', ref: ref.primitiveId || ref.nodeId || ref.componentId || '' };
}
