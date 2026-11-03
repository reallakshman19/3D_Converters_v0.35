export const SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA = 'support-overlay-details-panel/v4-polish';

const MAX_WARNING_ROWS = 4;
const MAX_ATTRIBUTE_ROWS = 12;

export function emptySupportOverlayDetailsPanelState(reason = 'not-selected') {
  return {
    schema: SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA,
    status: 'empty',
    reason: text(reason),
    highlighted: false,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

export function buildSupportOverlayDetailsPanelState(details = null, context = {}) {
  if (!details || typeof details !== 'object' || details.overlayKind !== 'support') {
    return emptySupportOverlayDetailsPanelState(context.reason || 'not-selected');
  }

  const warnings = normalizeList(details.warnings);
  const coordinateWarnings = normalizeList(details.coordinateWarnings);
  const pipeAxisWarnings = normalizeList(details.pipeAxisWarnings);
  const allWarnings = [...warnings, ...coordinateWarnings, ...pipeAxisWarnings].slice(0, MAX_WARNING_ROWS);
  const family = text(details.family || details.kind || 'UNKNOWN').toUpperCase() || 'UNKNOWN';
  const sourceKind = text(details.sourceKind || context.sourceKind || 'source-preview');
  const sourceFile = text(details.sourceFile || context.sourceFile || '');
  const supportId = text(details.supportId || details.supportNo || 'support');
  const supportNo = text(details.supportNo || details.supportId || supportId);
  const rawType = text(details.rawType || details.restraintType || details.type || '');
  const matchedPipeSegmentId = text(details.matchedPipeSegmentId || details.hostComponentId || details.pipeId || '');
  const warningCount = Number(details.warningCount || allWarnings.length) || 0;
  const highlighted = Boolean(details.highlighted || context.highlighted);

  return {
    schema: SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA,
    status: 'selected',
    supportId,
    supportNo,
    family,
    rawType,
    nodeId: text(details.nodeId || details.node || ''),
    sourceKind,
    sourceFile,
    sourceCoordinate: copyVec3(details.sourceCoordinate),
    mappedCoordinate: copyVec3(details.mappedCoordinate),
    pipeAxis: copyVec3(details.pipeAxis),
    pipeAxisSource: text(details.pipeAxisSource || ''),
    matchedPipeSegmentId,
    explicitSign: text(details.explicitSign || ''),
    gapMm: nullableNumber(details.gapMm),
    gapVisualSeparationMm: nullableNumber(details.gapVisualSeparationMm),
    pipeOdMm: nullableNumber(details.pipeOdMm),
    highlighted,
    popupRequired: Boolean(details.popupRequired),
    warningCount,
    warnings: allWarnings,
    attributes: compactAttributeRows(details.attributes),
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

export function renderSupportOverlayDetailsPanelHtml(state = emptySupportOverlayDetailsPanelState(), options = {}) {
  const escapeHtml = options.escapeHtml || defaultEscapeHtml;
  if (!state || state.status !== 'selected') {
    return `
      <div class="rvm-support-details-card rvm-support-details-card--empty" data-support-details-panel="empty" data-support-details-schema="${escapeHtml(SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA)}">
        <div class="rvm-support-details-title"><span>Support Details</span><strong class="rvm-support-status-badge">none</strong></div>
        <div class="rvm-support-empty-state" data-support-details-field="empty">Click a source-preview support glyph to inspect support tag, kind, node, gap, host pipe, and source restraint data.</div>
      </div>`;
  }

  const warningBadgeClass = state.warningCount ? ' is-warn' : '';
  const highlightText = state.highlighted ? 'highlighted' : 'selected';
  const warnings = state.warnings.length
    ? `<ul>${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
    : '<span>No warnings.</span>';
  const attrs = state.attributes.length
    ? `<ul>${state.attributes.map((row) => `<li><strong>${escapeHtml(row.key)}</strong>: ${escapeHtml(row.value)}</li>`).join('')}</ul>`
    : '<span>No compact source attributes.</span>';
  const sourceLabel = `${state.sourceKind || 'source-preview'}${state.sourceFile ? ` · ${state.sourceFile}` : ''}`;

  return `
    <div class="rvm-support-details-card rvm-support-details-card--compact" data-support-details-panel="selected" data-support-details-schema="${escapeHtml(SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA)}" data-support-details-id="${escapeHtml(state.supportId)}" data-support-details-family="${escapeHtml(state.family)}" data-support-details-highlighted="${state.highlighted ? 'true' : 'false'}" data-support-details-warnings="${escapeHtml(state.warningCount)}">
      <div class="rvm-support-details-title">
        <span>Support Details</span>
        <span class="rvm-support-badge-row">
          <strong class="rvm-support-status-badge${state.highlighted ? ' is-on' : ''}" data-support-details-highlight="${state.highlighted ? 'true' : 'false'}">${escapeHtml(highlightText)}</strong>
          <strong class="rvm-support-kind-badge${warningBadgeClass}" data-support-details-kind="${escapeHtml(state.family)}">${escapeHtml(state.family)}</strong>
        </span>
      </div>
      <div class="rvm-support-details-kpi-row" data-support-details-kpis="true">
        ${kpi('Tag', state.supportNo || state.supportId, escapeHtml)}
        ${kpi('Node', state.nodeId || 'n/a', escapeHtml)}
        ${kpi('Gap', gapText(state), escapeHtml)}
        ${kpi('Warnings', state.warningCount, escapeHtml, state.warningCount ? 'is-warn' : '')}
      </div>
      <div class="rvm-support-details-priority-grid" data-support-details-priority="true">
        ${detailRow('Support tag', state.supportNo || state.supportId, escapeHtml, 'support')}
        ${detailRow('Support kind', state.family, escapeHtml, 'kind')}
        ${detailRow('Source restraint', state.rawType || 'n/a', escapeHtml, 'raw-type')}
        ${detailRow('Node', state.nodeId || 'n/a', escapeHtml, 'node')}
        ${detailRow('Host pipe / segment', state.matchedPipeSegmentId || 'n/a', escapeHtml, 'matched-pipe')}
        ${detailRow('Pipe OD / bore', state.pipeOdMm == null ? 'n/a' : `${round(state.pipeOdMm)} mm`, escapeHtml, 'pipe-od')}
        ${detailRow('Source', sourceLabel, escapeHtml, 'source')}
        ${detailRow('Pipe axis', `${vecText(state.pipeAxis)}${state.pipeAxisSource ? ` (${state.pipeAxisSource})` : ''}`, escapeHtml, 'pipe-axis')}
      </div>
      <div class="rvm-support-details-warning-box${warningBadgeClass}" data-support-details-field="warnings"><span>Warnings / filters</span>${warnings}</div>
      <details class="rvm-support-details-raw" data-support-details-field="attributes"><summary>Raw source attributes (${escapeHtml(state.attributes.length)})</summary>${attrs}</details>
      <div class="rvm-source-tools-actions rvm-source-tools-actions--inline rvm-support-details-actions" data-support-details-actions="true">
        <button type="button" data-support-details-action="copy-json">Copy JSON</button>
        <button type="button" data-support-details-action="download-json">Download</button>
        <button type="button" data-support-details-action="clear">Clear</button>
      </div>
    </div>`;
}

function kpi(label, value, escapeHtml, tone = '') {
  return `<span class="rvm-support-details-kpi ${escapeHtml(tone)}"><b title="${escapeHtml(value)}">${escapeHtml(value)}</b><small>${escapeHtml(label)}</small></span>`;
}

function detailRow(label, value, escapeHtml, field) {
  return `<div class="rvm-support-details-row" data-support-details-field="${escapeHtml(field)}"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value || 'n/a')}">${escapeHtml(value || 'n/a')}</strong></div>`;
}

function gapText(state) {
  if (state.gapMm == null) return 'n/a';
  const visual = state.gapVisualSeparationMm == null ? '' : ` · visual ${round(state.gapVisualSeparationMm)} mm`;
  return `${round(state.gapMm)} mm${visual}`;
}

function compactAttributeRows(attrs = {}) {
  if (!attrs || typeof attrs !== 'object') return [];
  return Object.entries(attrs).slice(0, MAX_ATTRIBUTE_ROWS).map(([key, value]) => ({
    key: text(key),
    value: text(formatAttributeValue(value)),
  })).filter((row) => row.key);
}

function formatAttributeValue(value) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value ?? '';
  if (Array.isArray(value)) return value.slice(0, 4).map((item) => text(item)).join(', ');
  return '[object]';
}

function normalizeList(value) {
  const list = Array.isArray(value) ? value : [value].filter(Boolean);
  return list.map((item) => text(item)).filter(Boolean);
}

function copyVec3(value) {
  if (!value || typeof value !== 'object') return null;
  const x = nullableNumber(value.x);
  const y = nullableNumber(value.y);
  const z = nullableNumber(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function vecText(value) {
  if (!value) return 'n/a';
  return `${round(value.x)}, ${round(value.y)}, ${round(value.z)}`;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value) {
  const n = Number(value) || 0;
  return Math.abs(n) < 1e-9 ? '0' : String(Math.round(n * 1000) / 1000);
}

function text(value) {
  return String(value ?? '').trim();
}

function defaultEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
