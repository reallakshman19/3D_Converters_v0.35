import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import { aivCanvasFieldKey } from './vibration-aiv-canvas-field.js?v=20260816-aiv-canvas-release-1';
import {
  renderAivCanvasAssessmentResultHtml,
  renderAivCanvasRelationshipResultHtml,
  renderAivCanvasSourceResultHtml,
} from './vibration-aiv-canvas-results.js';
import { AIV_INPUT_MODE } from './vibration-aiv-engineering-revision.js';
import { renderAivUnifiedCanvasEngineeringEditorHtml } from './vibration-aiv-unified-canvas-editor-view.js?v=20260816-aiv-canvas-fields-1';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function topology(state) {
  if (state.readinessEnvelope?.exchange) return state.readinessEnvelope.exchange;
  if (state.topologyInput?.format === 'PARSED_EXCHANGE' || state.topologyInput?.format === 'FLARE_NETWORK') return state.topologyInput.data;
  return state.topology ?? null;
}
function projection(state) {
  return buildAivCanvasProjection({ tables: state.tables, assumptionResolution: state.assumptionResolution,
    readinessEnvelope: state.readinessEnvelope, screeningResult: state.screeningResult, topology: topology(state) });
}
function assumptionAction(item) {
  const key = aivCanvasFieldKey(item.tableKind, item.rowIndex, item.column);
  return `<button type="button" class="engineering-console-btn aiv-canvas-assumption-action" data-aiv-assumption-field-key="${esc(key)}"><strong>[A] ${esc(item.column)}</strong><br><small>${esc(item.assumedValue)} · ${esc(item.profilePath)} · ${esc(item.reason)}</small></button>`;
}
function inputValuesHtml(values = {}) {
  const rows = Object.entries(values).filter(([, value]) => String(value ?? '').trim());
  if (!rows.length) return '<small>No table-backed values are available for this item.</small>';
  return `<dl class="aiv-canvas-input-values">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
}
function provenanceHtml(values = {}) {
  const rows = Object.entries(values).filter(([key, value]) => String(value ?? '').trim() && /(Source|Revision|Record ID|Status|Reviewer)/u.test(key));
  if (!rows.length) return '<small>No explicit provenance fields are populated.</small>';
  return `<dl class="aiv-canvas-input-values">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
}
function metric(label, value) { return `<span><small>${esc(label)}</small><strong>${esc(value ?? '—')}</strong></span>`; }
function summaryHtml(item, kind) {
  if (kind === 'RELATIONSHIP') return `<div class="aiv-canvas-detail-grid">${metric('Source', item.sourceCanonicalId)}${metric('Assessment', item.assessmentCanonicalId)}${metric('Case', item.caseId)}${metric('Line', item.line)}${metric('Applicability', item.applicabilityDisposition)}${metric('Physical distance', item.physicalDistance && item.physicalDistanceUnit ? `${item.physicalDistance} ${item.physicalDistanceUnit}` : '—')}${metric('Readiness', item.readinessStatus ?? 'NOT_CHECKED')}</div>`;
  if (kind === 'SEGMENT') return `<div class="aiv-canvas-detail-grid">${metric('Segment', item.segmentId)}${metric('From', item.fromNodeId)}${metric('To', item.toNodeId)}${metric('Line', item.line)}${metric('Engineering length', item.engineeringLength ?? 'UNRESOLVED')}${metric('Distance authority', 'EXPLICIT SEGMENT INPUT')}</div>`;
  return `<div class="aiv-canvas-detail-grid">${metric('Canonical ID', item.canonicalId)}${metric('Kind', item.nodeKind)}${metric('Case', item.caseId ?? (item.caseIds?.join(', ') || '—'))}${metric('Line', item.line)}${metric('Readiness', item.readinessStatus ?? 'NOT_CHECKED')}${metric('Screening status', item.screeningStatus ?? 'NOT_RUN')}${metric('Assumptions', item.assumptionCount ?? 0)}</div>`;
}
function t26Html(item) {
  const summary = item?.resultSummary; const cases = summary?.caseCount ? summary.cases : summary ? [summary] : [];
  const rows = cases.filter((entry) => entry.t26Intermediates).map((entry) => {
    const t26 = entry.t26Intermediates;
    return `<div><strong>${esc(entry.caseId)}</strong><div class="aiv-canvas-detail-grid">${metric('FLM1', t26.FLM1)}${metric('FLM2', t26.FLM2)}${metric('Lf', t26.Lf)}${metric('B', t26.B)}${metric('log10(N)', t26.log10N)}</div></div>`;
  });
  return rows.length ? rows.join('') : '<small>No returned T2-6 intermediates for this Assessment.</small>';
}
function tabButton(detailId, id, label, selected = false) {
  return `<button id="${esc(`${detailId}-tab-${id}`)}" type="button" class="engineering-console-btn" data-aiv-detail-tab="${id}" role="tab" aria-controls="${esc(`${detailId}-panel-${id}`)}" aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}">${esc(label)}</button>`;
}
function panel(detailId, id, html, selected = false) {
  return `<div id="${esc(`${detailId}-panel-${id}`)}" class="aiv-canvas-detail-panel" data-aiv-detail-panel="${id}" role="tabpanel" aria-labelledby="${esc(`${detailId}-tab-${id}`)}"${selected ? '' : ' hidden'}>${html}</div>`;
}
function tableKind(kind) { return ({ SOURCE: 'sources', ASSESSMENT: 'assessments', RELATIONSHIP: 'relationships' })[kind] ?? null; }
function ownershipBadge(state) {
  const network = state.inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN;
  return `<span class="aiv-canvas-badge authority" data-aiv-canvas-inspector-owner="${network ? 'NETWORK' : 'TABLE'}">${network ? 'NETWORK OWNER · graph edit' : 'TABLE OWNER · working row'}</span>`;
}
function tableAction(state, item, kind, selectionKey) {
  const table = tableKind(kind); const row = Number(item?.tableRowIndex); if (!table || !Number.isInteger(row) || row < 0) return '';
  const generated = state.inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN;
  const label = generated ? `Open generated ${table} table` : `Open full ${table} table`;
  return `<button type="button" class="engineering-console-btn" data-aiv-canvas-open-table="${table}" data-aiv-selection-key="${esc(selectionKey)}">${esc(label)}</button>`;
}
function selectedDetail(state, selectionKey, labelText, item, resultHtml = '', kind = 'NODE') {
  const assumptions = item.assumptions?.map(assumptionAction).join('') ?? ''; const detailId = `aiv-detail-${selectionKey.replace(/[^a-zA-Z0-9_-]/gu, '-')}`;
  const editorHtml = renderAivUnifiedCanvasEngineeringEditorHtml(state, { ...item, selectionKey }, kind);
  const calcLabel = kind === 'RELATIONSHIP' ? 'Contribution' : kind === 'ASSESSMENT' ? 'Contributions' : 'Calculation';
  const tabs = [tabButton(detailId, 'summary', 'Summary', true), ...(editorHtml ? [tabButton(detailId, 'edit', 'Engineering edit')] : []), tabButton(detailId, 'inputs', 'Inputs'), tabButton(detailId, 'calculation', calcLabel), ...(kind === 'ASSESSMENT' ? [tabButton(detailId, 't26', 'T2-6')] : []), tabButton(detailId, 'assumptions', 'Assumptions'), tabButton(detailId, 'provenance', 'Provenance')].join('');
  const panels = [panel(detailId, 'summary', summaryHtml(item, kind), true), ...(editorHtml ? [panel(detailId, 'edit', editorHtml)] : []), panel(detailId, 'inputs', inputValuesHtml(item.inputValues)), panel(detailId, 'calculation', resultHtml || '<small>No screening result is available for this item.</small>'), ...(kind === 'ASSESSMENT' ? [panel(detailId, 't26', t26Html(item))] : []), panel(detailId, 'assumptions', assumptions ? `<div class="aiv-canvas-assumption-list">${assumptions}</div>` : '<small>No resolved assumptions for this item.</small>'), panel(detailId, 'provenance', provenanceHtml(item.inputValues))].join('');
  return `<section class="aiv-canvas-selected-detail" data-aiv-canvas-assumption-detail="${esc(selectionKey)}" aria-label="Selected AIV item"><div class="aivq-section-head"><div><strong>${esc(labelText)}</strong><div>${ownershipBadge(state)}</div></div>${tableAction(state, item, kind, selectionKey)}</div><div class="aiv-canvas-detail-tabs" role="tablist">${tabs}</div>${panels}</section>`;
}
function networkFallback(state, selectionKey) {
  if (state.inputMode !== AIV_INPUT_MODE.NETWORK_DRIVEN) return null;
  if (selectionKey.startsWith('SEGMENT:')) {
    const id = selectionKey.slice('SEGMENT:'.length); const segment = state.flareNetwork?.segments?.find((entry) => entry.segmentId === id);
    return segment ? { kind: 'SEGMENT', item: { selectionKey, segmentId: id, fromNodeId: segment.fromNodeId, toNodeId: segment.toNodeId, line: segment.line, engineeringLength: segment.physicalLength ? `${segment.physicalLength.value} ${segment.physicalLength.unit}` : null, inputValues: {} } } : null;
  }
  const node = state.flareNetwork?.nodes?.find((entry) => {
    if (entry.kind === 'SOURCE') return `SOURCE:${entry.canonicalId}:${entry.sourceInput?.caseId ?? ''}` === selectionKey;
    if (entry.kind === 'ASSESSMENT') return `ASSESSMENT:${entry.canonicalId}` === selectionKey;
    return `NETWORK_NODE:${entry.canonicalId}` === selectionKey;
  });
  return node ? { kind: node.kind, item: { selectionKey, canonicalId: node.canonicalId, nodeKind: node.kind, tag: node.tag, line: node.line, caseId: node.sourceInput?.caseId ?? null, inputValues: {}, assumptions: [] } } : null;
}
function selectedProjectionItem(state, value, selectionKey) {
  const node = value.nodes.find((item) => item.nodeKey === selectionKey && ['SOURCE', 'ASSESSMENT'].includes(item.nodeKind)); if (node) return { item: node, kind: node.nodeKind };
  const relationship = value.relationships.find((item) => item.selectionKey === selectionKey);
  return relationship ? { item: relationship, kind: 'RELATIONSHIP' } : networkFallback(state, selectionKey);
}

export function renderAivUnifiedCanvasSelectedDetailHtml(state = {}, selectionKey = null) {
  const key = String(selectionKey ?? '').trim(); const selected = selectedProjectionItem(state, projection(state), key);
  if (!selected) return '<div class="aiv-canvas-detail-placeholder">Select a Source, Assessment, physical segment, routing node or Source→Assessment relationship. The Engineering edit tab changes the authoritative input for the active mode.</div>';
  const { item, kind } = selected;
  if (kind === 'SEGMENT') return selectedDetail(state, key, `SEGMENT ${item.segmentId}`, item, '', kind);
  if (kind === 'RELATIONSHIP') return selectedDetail(state, item.selectionKey, `${item.sourceCanonicalId} → ${item.assessmentCanonicalId} · ${item.caseId}`, item, renderAivCanvasRelationshipResultHtml(item), kind);
  const result = kind === 'SOURCE' ? renderAivCanvasSourceResultHtml(item) : kind === 'ASSESSMENT' ? renderAivCanvasAssessmentResultHtml(item) : '';
  return selectedDetail(state, key, `${kind} ${item.tag || item.canonicalId}`, item, result, kind);
}