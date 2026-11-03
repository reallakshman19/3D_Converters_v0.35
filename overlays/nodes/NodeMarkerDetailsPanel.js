export const NODE_MARKER_DETAILS_PANEL_SCHEMA = 'non-primitive-node-marker-details-panel/v2';

export function buildNodeMarkerDetailsPanelState(marker = null, context = {}) {
  if (!marker || marker.status === 'cleared') return emptyNodeMarkerDetailsPanelState(context.reason || 'no-selection');
  const upstream = marker.upstreamRef || {};
  const downstream = marker.downstreamRef || {};
  return {
    schema: NODE_MARKER_DETAILS_PANEL_SCHEMA,
    status: 'selected',
    markerId: marker.markerId || '',
    nodeNumber: marker.nodeNumber ?? '',
    markerKind: marker.markerKind || '',
    branchName: marker.branchName || '',
    componentType: marker.componentType || '',
    componentRefNo: marker.componentRefNo || '',
    componentRefNoSource: marker.componentRefNoSource || '',
    sourcePath: marker.sourcePath || '',
    sourceKind: marker.sourceKind || context.sourceKind || '',
    sourceSubKind: marker.sourceSubKind || context.sourceSubKind || '',
    sourceFile: marker.sourceFile || context.sourceFile || '',
    sourceObjectType: marker.sourceObjectType || '',
    sourceName: marker.sourceName || '',
    sourceType: marker.sourceType || '',
    positionSource: marker.positionSource || '',
    matchMethod: marker.matchMethod || marker.nodeNumberSource || marker.componentRefNoSource || '',
    confidence: normalizeConfidence(marker.confidence),
    staleReason: marker.staleReason || context.staleReason || '',
    overrideStatus: marker.overrideStatus || 'none',
    overrideId: marker.overrideId || '',
    overrideReason: marker.overrideReason || '',
    lockedByOverride: Boolean(marker.lockedByOverride),
    suppressedByOverride: Boolean(marker.suppressedByOverride),
    markerStatus: marker.status || 'unknown',
    warnings: Array.isArray(marker.warnings) ? marker.warnings : [],
    xmlCii: {
      BranchName: marker.branchName || '',
      NodeNumber: marker.nodeNumber ?? '',
      ComponentType: marker.componentType || '',
      ComponentRefNo: marker.componentRefNo || '',
      PositionSource: marker.positionSource || '',
    },
    upstream: {
      name: upstream.name || '',
      type: upstream.type || '',
      componentType: upstream.componentType || upstream.type || '',
      componentRefNo: upstream.componentRefNo || '',
      sourcePath: upstream.sourcePath || '',
    },
    downstream: {
      name: downstream.name || '',
      type: downstream.type || '',
      componentType: downstream.componentType || downstream.type || '',
      componentRefNo: downstream.componentRefNo || '',
      sourcePath: downstream.sourcePath || '',
    },
  };
}

export function emptyNodeMarkerDetailsPanelState(reason = 'clear') {
  return { schema: NODE_MARKER_DETAILS_PANEL_SCHEMA, status: 'empty', reason, markerId: '', nodeNumber: '', markerKind: '', branchName: '', warnings: [] };
}

export function renderNodeMarkerDetailsPanelHtml(state = emptyNodeMarkerDetailsPanelState(), { escapeHtml = defaultEscapeHtml } = {}) {
  if (!state || state.status !== 'selected') {
    return `<div class="rvm-source-tools-detail rvm-node-marker-detail" data-node-marker-details-empty="true"><div class="rvm-empty-state">Select a Node Marker glyph to inspect XML-CII node details.</div></div>`;
  }
  const rows = [
    ['BranchName', state.xmlCii.BranchName],
    ['NodeNumber', state.xmlCii.NodeNumber],
    ['ComponentType', state.xmlCii.ComponentType],
    ['ComponentRefNo', state.xmlCii.ComponentRefNo],
    ['PositionSource', state.xmlCii.PositionSource],
    ['sourcePath', state.sourcePath],
    ['sourceKind', `${state.sourceKind}${state.sourceSubKind ? ` / ${state.sourceSubKind}` : ''}`],
    ['sourceFile', state.sourceFile],
    ['matchMethod', state.matchMethod],
    ['confidence', state.confidence == null ? '' : `${Math.round(state.confidence * 100)}%`],
    ['staleReason', state.staleReason],
    ['overrideStatus', state.overrideStatus],
    ['overrideId', state.overrideId],
    ['overrideReason', state.overrideReason],
    ['markerStatus', state.markerStatus],
    ['upstream', `${state.upstream.name} ${state.upstream.componentType}`.trim()],
    ['downstream', `${state.downstream.name} ${state.downstream.componentType}`.trim()],
  ];
  const warnings = state.warnings.length
    ? `<ul>${state.warnings.map((warning) => `<li>${escapeHtml(typeof warning === 'string' ? warning : warning?.message || warning?.code || JSON.stringify(warning))}</li>`).join('')}</ul>`
    : '<div class="rvm-empty-state">No marker warnings.</div>';
  return `
    <div class="rvm-source-tools-detail rvm-node-marker-detail" data-node-marker-details-selected="true" data-node-marker-id="${escapeHtml(state.markerId)}" data-node-marker-source-path="${escapeHtml(state.sourcePath)}">
      <div class="rvm-source-tools-group-title"><span>Node Marker ${escapeHtml(state.nodeNumber || state.markerId || '-')}</span><strong>${escapeHtml(state.markerKind || '-')}</strong></div>
      ${rows.map(([label, value]) => `<label class="rvm-source-tools-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? '')}</strong></label>`).join('')}
      <div class="rvm-source-tools-group-title"><span>Override</span><strong>${escapeHtml(state.overrideStatus || 'none')}</strong></div>
      ${renderOverrideControls(state, escapeHtml)}
      <div class="rvm-source-tools-group-title"><span>Diagnostics</span><strong>${escapeHtml(state.markerStatus || 'unknown')}</strong></div>
      ${warnings}
      <div class="rvm-source-tools-actions rvm-source-tools-actions--inline">
        <button type="button" data-node-marker-details-action="save-override">Save override</button>
        <button type="button" data-node-marker-details-action="clear-override">Clear override</button>
        <button type="button" data-node-marker-details-action="copy-json">Copy details JSON</button>
        <button type="button" data-node-marker-details-action="download-json">Download details JSON</button>
        <button type="button" data-node-marker-details-action="clear">Clear</button>
      </div>
    </div>`;
}

export function buildNodeMarkerDetailsJson(state = emptyNodeMarkerDetailsPanelState(), context = {}) {
  return { schema: 'non-primitive-node-marker-details-json/v2', generatedAt: context.generatedAt || new Date(0).toISOString(), state };
}

function renderOverrideControls(state, escapeHtml) {
  const fields = [
    ['nodeNumber', 'NodeNumber', state.nodeNumber],
    ['branchName', 'BranchName', state.branchName],
    ['componentRefNo', 'ComponentRefNo', state.componentRefNo],
    ['componentType', 'ComponentType', state.componentType],
    ['positionSource', 'PositionSource', state.positionSource],
    ['reason', 'Reason', state.overrideReason],
  ];
  const inputs = fields.map(([name, label, value]) => `<label class="rvm-source-tools-row"><span>${escapeHtml(label)}</span><input data-node-marker-override-field="${name}" value="${escapeHtml(value ?? '')}"></label>`).join('');
  return `${inputs}
    <label class="rvm-source-tools-row"><span>suppressExport</span><input type="checkbox" data-node-marker-override-field="suppressExport" ${state.suppressedByOverride ? 'checked' : ''}></label>
    <label class="rvm-source-tools-row"><span>lock marker</span><input type="checkbox" data-node-marker-override-field="locked" ${state.lockedByOverride ? 'checked' : ''}></label>`;
}

function normalizeConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function defaultEscapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
