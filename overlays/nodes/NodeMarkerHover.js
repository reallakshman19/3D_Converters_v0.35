export const NODE_MARKER_HOVER_SCHEMA = 'non-primitive-node-marker-hover/v1';

export function buildNodeMarkerHoverPreview(marker = {}, options = {}) {
  const upstream = marker.upstreamRef || {};
  const downstream = marker.downstreamRef || {};
  return {
    schema: NODE_MARKER_HOVER_SCHEMA,
    markerId: marker.markerId || '',
    nodeNumber: marker.nodeNumber ?? '',
    branchName: marker.branchName || '',
    markerKind: marker.markerKind || '',
    componentRefNo: marker.componentRefNo || '',
    upstreamName: upstream.name || marker.sourceName || '',
    upstreamType: upstream.type || marker.sourceType || '',
    downstreamName: downstream.name || '',
    downstreamType: downstream.type || '',
    status: marker.status || 'unknown',
    confidence: Number.isFinite(Number(marker.confidence)) ? Number(marker.confidence) : null,
    sourceKind: marker.sourceKind || options.sourceKind || '',
    sourceSubKind: marker.sourceSubKind || options.sourceSubKind || '',
    sourceFile: marker.sourceFile || options.sourceFile || '',
  };
}

export function renderNodeMarkerHoverHtml(preview = {}, { escapeHtml = defaultEscapeHtml } = {}) {
  return `
    <div class="rvm-node-marker-hover__title">Node ${escapeHtml(preview.nodeNumber || preview.markerId || '-')}</div>
    <div class="rvm-node-marker-hover__row">Branch: ${escapeHtml(preview.branchName || '-')}</div>
    <div class="rvm-node-marker-hover__row">Kind: ${escapeHtml(preview.markerKind || '-')}</div>
    <div class="rvm-node-marker-hover__row">Upstream: ${escapeHtml(preview.upstreamName || '-')} ${escapeHtml(preview.upstreamType || '')}</div>
    <div class="rvm-node-marker-hover__row">Downstream: ${escapeHtml(preview.downstreamName || '-')} ${escapeHtml(preview.downstreamType || '')}</div>
    <div class="rvm-node-marker-hover__row">ComponentRefNo: ${escapeHtml(preview.componentRefNo || '-')}</div>
    <div class="rvm-node-marker-hover__status">${escapeHtml(preview.status || 'unknown')}${preview.confidence !== null ? ` · ${escapeHtml(Math.round(preview.confidence * 100))}%` : ''}</div>`;
}

export function emptyNodeMarkerHoverState(reason = 'clear') {
  return { schema: NODE_MARKER_HOVER_SCHEMA, status: 'cleared', reason, primitiveExcluded: true, rvmSearchIndexed: false, rvmSelectionUsed: false };
}

function defaultEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
