import { buildDeterministicAivCanvasLayout } from '../converters/vibration/aiv/aiv-canvas-layout-contract.js';
import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import { aivCanvasFieldKey } from './vibration-aiv-canvas-field.js';
import { renderAivCanvasFilterControls } from './vibration-aiv-canvas-filter.js';
import { renderAivCanvasNodeGlyph, renderAivCanvasStatusGlyphs } from './vibration-aiv-canvas-icons.js';
import {
  renderAivCanvasAssessmentResultHtml,
  renderAivCanvasRelationshipResultHtml,
  renderAivCanvasSourceResultHtml,
} from './vibration-aiv-canvas-results.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function topology(state) {
  if (state.readinessEnvelope?.exchange) return state.readinessEnvelope.exchange;
  if (state.topologyInput?.format === 'PARSED_EXCHANGE' || state.topologyInput?.format === 'FLARE_NETWORK') return state.topologyInput.data;
  return state.topology ?? null;
}

function canvasProjection(state) {
  return buildAivCanvasProjection({
    tables: state.tables,
    assumptionResolution: state.assumptionResolution,
    readinessEnvelope: state.readinessEnvelope,
    screeningResult: state.screeningResult,
    topology: topology(state),
  });
}

function badge(text, kind = '') {
  return text ? `<span class="aiv-canvas-badge ${esc(kind)}">${esc(text)}</span>` : '';
}

function filterAttrs(item) {
  return ` data-aiv-filterable="true" data-aiv-canvas-cases="${esc((item.caseIds ?? []).join('|'))}" data-aiv-canvas-line="${esc(item.line ?? '')}"`;
}

function resultText(node) {
  const summary = node.resultSummary;
  if (!summary) return '';
  if (summary.caseCount) return `${summary.caseCount} case results`;
  if (node.nodeKind === 'SOURCE') return summary.effectiveSourcePwlDb == null ? '' : `${summary.effectiveSourcePwlDb} dB effective`;
  return summary.lof == null ? '' : `LOF ${summary.lof} · ${summary.caseId}`;
}

function statusText(item) {
  return [item.assumptionCount ? `[A] ${item.assumptionCount}` : '', item.readinessStatus ?? ''].filter(Boolean).join(' · ');
}

function nodeTableKind(node) {
  if (node.nodeKind === 'SOURCE') return 'sources';
  if (node.nodeKind === 'ASSESSMENT') return 'assessments';
  return '';
}

function nodeHtml(node, position) {
  const caseText = node.caseId ? ` · ${node.caseId}` : '';
  const aria = `${node.nodeKind} ${node.tag}${caseText}${statusText(node) ? ` · ${statusText(node)}` : ''}`;
  const tableKind = nodeTableKind(node);
  const tableAttr = tableKind ? ` data-aiv-table-kind="${tableKind}"` : '';
  return `<g class="aiv-canvas-node is-${esc(node.nodeKind.toLowerCase())}" transform="translate(${position.x} ${position.y})" data-aiv-canvas-node="${esc(node.nodeKey)}" data-aiv-selection-key="${esc(node.nodeKey)}"${tableAttr}${filterAttrs(node)} data-aiv-canvas-canonical-id="${esc(node.canonicalId)}" data-aiv-canvas-case-id="${esc(node.caseId ?? '')}" data-aiv-canvas-node-kind="${esc(node.nodeKind)}" data-aiv-canvas-icon-type="${esc(node.iconType)}" data-aiv-canvas-x="${position.x}" data-aiv-canvas-y="${position.y}" role="button" tabindex="0" aria-selected="false" aria-label="${esc(aria)}">
    <title>${esc(aria)}</title>${renderAivCanvasNodeGlyph(node)}${renderAivCanvasStatusGlyphs(node.statusGlyphs)}
    <text class="aiv-canvas-node-title" x="0" y="40" text-anchor="middle">${esc(node.tag)}</text>
    <text class="aiv-canvas-node-subtitle" x="0" y="55" text-anchor="middle">${esc(node.canonicalId)}${esc(caseText)}</text>
    ${statusText(node) ? `<text class="aiv-canvas-node-status" x="0" y="70" text-anchor="middle">${esc(statusText(node))}</text>` : ''}
    ${resultText(node) ? `<text class="aiv-canvas-node-result" x="0" y="83" text-anchor="middle">${esc(resultText(node))}</text>` : ''}
  </g>`;
}

function relationshipLabel(relationship) {
  const distance = relationship.physicalDistance && relationship.physicalDistanceUnit
    ? `${relationship.physicalDistance} ${relationship.physicalDistanceUnit}`
    : 'distance unresolved';
  return [relationship.caseId, distance, statusText(relationship)].filter(Boolean).join(' · ');
}

function relationshipHtml(relationship, positions) {
  const sourceKey = `SOURCE:${relationship.sourceCanonicalId}:${relationship.caseId}`;
  const assessmentKey = `ASSESSMENT:${relationship.assessmentCanonicalId}`;
  const source = positions.get(sourceKey);
  const assessment = positions.get(assessmentKey);
  if (!source || !assessment) return '';
  const x1 = source.x + 30;
  const x2 = assessment.x - 30;
  const midX = (source.x + assessment.x) / 2;
  const midY = (source.y + assessment.y) / 2;
  const kind = relationship.applicabilityDisposition === 'APPLICABLE' ? 'applicable' : 'inactive';
  const aria = `${relationship.sourceCanonicalId} to ${relationship.assessmentCanonicalId} · ${relationshipLabel(relationship)}`;
  return `<g class="aiv-canvas-relationship is-${kind}" data-aiv-canvas-relationship="${esc(relationship.rowKey)}" data-aiv-selection-key="${esc(relationship.selectionKey)}" data-aiv-table-kind="relationships"${filterAttrs(relationship)} data-aiv-source-canonical-id="${esc(relationship.sourceCanonicalId)}" data-aiv-assessment-canonical-id="${esc(relationship.assessmentCanonicalId)}" data-aiv-case-id="${esc(relationship.caseId)}" data-aiv-canvas-source-node="${esc(sourceKey)}" data-aiv-canvas-assessment-node="${esc(assessmentKey)}" role="button" tabindex="0" aria-selected="false" aria-label="${esc(aria)}">
    <title>${esc(aria)}</title><line x1="${x1}" y1="${source.y}" x2="${x2}" y2="${assessment.y}" marker-end="url(#aiv-canvas-arrow)"></line>
    <text x="${midX}" y="${midY - 8}" text-anchor="middle">${esc(relationshipLabel(relationship))}</text>
    <g transform="translate(${midX} ${midY})">${renderAivCanvasStatusGlyphs(relationship.statusGlyphs)}</g>
  </g>`;
}

function assumptionAction(item) {
  const key = aivCanvasFieldKey(item.tableKind, item.rowIndex, item.column);
  return `<button type="button" class="engineering-console-btn aiv-canvas-assumption-action" data-aiv-assumption-field-key="${esc(key)}"><strong>[A] ${esc(item.column)}</strong><br><small>${esc(item.assumedValue)} · ${esc(item.profilePath)} · ${esc(item.reason)}</small></button>`;
}

function inputValuesHtml(values = {}) {
  const rows = Object.entries(values).filter(([, value]) => String(value ?? '').trim());
  if (!rows.length) return '<small>No table-backed values are available for this presentation node.</small>';
  return `<dl class="aiv-canvas-input-values">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
}

function provenanceHtml(values = {}) {
  const rows = Object.entries(values).filter(([key, value]) => String(value ?? '').trim()
    && /(Source|Revision|Record ID|Status|Reviewer)/u.test(key));
  if (!rows.length) return '<small>No explicit table provenance fields are populated.</small>';
  return `<dl class="aiv-canvas-input-values">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
}

function detailMetric(label, value) {
  return `<span><small>${esc(label)}</small><strong>${esc(value ?? '—')}</strong></span>`;
}

function summaryHtml(item, kind) {
  if (kind === 'RELATIONSHIP') {
    return `<div class="aiv-canvas-detail-grid">${detailMetric('Source', item.sourceCanonicalId)}${detailMetric('Assessment', item.assessmentCanonicalId)}${detailMetric('Case', item.caseId)}${detailMetric('Line', item.line)}${detailMetric('Applicability', item.applicabilityDisposition)}${detailMetric('Physical distance', item.physicalDistance && item.physicalDistanceUnit ? `${item.physicalDistance} ${item.physicalDistanceUnit}` : '—')}${detailMetric('Readiness', item.readinessStatus ?? 'NOT_CHECKED')}${detailMetric('Assumptions', item.assumptionCount)}</div>`;
  }
  return `<div class="aiv-canvas-detail-grid">${detailMetric('Canonical ID', item.canonicalId)}${detailMetric('Kind', item.nodeKind)}${detailMetric('Icon type', item.iconType)}${detailMetric('Case', item.caseId ?? (item.caseIds?.join(', ') || '—'))}${detailMetric('Line', item.line)}${detailMetric('Readiness', item.readinessStatus ?? 'NOT_CHECKED')}${detailMetric('Screening status', item.screeningStatus ?? 'NOT_RUN')}${detailMetric('Assumptions', item.assumptionCount)}</div>`;
}

function t26Html(item) {
  const summary = item?.resultSummary;
  const cases = summary?.caseCount ? summary.cases : summary ? [summary] : [];
  const rows = cases.filter((entry) => entry.t26Intermediates).map((entry) => {
    const t26 = entry.t26Intermediates;
    return `<div><strong>${esc(entry.caseId)}</strong><div class="aiv-canvas-detail-grid">${detailMetric('FLM1', t26.FLM1)}${detailMetric('FLM2', t26.FLM2)}${detailMetric('Lf', t26.Lf)}${detailMetric('B', t26.B)}${detailMetric('log10(N)', t26.log10N)}</div></div>`;
  });
  return rows.length ? rows.join('') : '<small>No returned T2-6 intermediates for this Assessment.</small>';
}

function tabButton(detailId, id, label, selected = false) {
  const tabId = `${detailId}-tab-${id}`;
  const panelId = `${detailId}-panel-${id}`;
  return `<button id="${esc(tabId)}" type="button" class="engineering-console-btn" data-aiv-detail-tab="${id}" role="tab" aria-controls="${esc(panelId)}" aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}">${esc(label)}</button>`;
}

function panel(detailId, id, html, selected = false) {
  const tabId = `${detailId}-tab-${id}`;
  const panelId = `${detailId}-panel-${id}`;
  return `<div id="${esc(panelId)}" class="aiv-canvas-detail-panel" data-aiv-detail-panel="${id}" role="tabpanel" aria-labelledby="${esc(tabId)}"${selected ? '' : ' hidden'}>${html}</div>`;
}

function selectedDetail(selectionKey, label, item, resultHtml = '', kind = 'NODE') {
  const assumptions = item.assumptions?.map(assumptionAction).join('') ?? '';
  const detailId = `aiv-detail-${selectionKey.replace(/[^a-zA-Z0-9_-]/gu, '-')}`;
  const calculationLabel = kind === 'RELATIONSHIP' ? 'Contribution' : kind === 'ASSESSMENT' ? 'Contributions' : 'Calculation';
  const tabs = [
    tabButton(detailId, 'summary', 'Summary', true), tabButton(detailId, 'inputs', 'Inputs'), tabButton(detailId, 'calculation', calculationLabel),
    ...(kind === 'ASSESSMENT' ? [tabButton(detailId, 't26', 'T2-6')] : []), tabButton(detailId, 'assumptions', 'Assumptions'), tabButton(detailId, 'provenance', 'Provenance'),
  ].join('');
  const panels = [
    panel(detailId, 'summary', summaryHtml(item, kind), true),
    panel(detailId, 'inputs', inputValuesHtml(item.inputValues)),
    panel(detailId, 'calculation', resultHtml || '<small>No screening result is available yet. Inputs and identity remain selectable before calculation.</small>'),
    ...(kind === 'ASSESSMENT' ? [panel(detailId, 't26', t26Html(item))] : []),
    panel(detailId, 'assumptions', assumptions ? `<div class="aiv-canvas-assumption-list">${assumptions}</div>` : '<small>No resolved assumptions for this item.</small>'),
    panel(detailId, 'provenance', provenanceHtml(item.inputValues)),
  ].join('');
  return `<section class="aiv-canvas-selected-detail" data-aiv-canvas-assumption-detail="${esc(selectionKey)}" aria-label="Selected AIV item"><strong>${esc(label)}</strong><div class="aiv-canvas-detail-tabs" role="tablist" aria-label="Selected item detail">${tabs}</div>${panels}</section>`;
}

function selectedProjectionItem(projection, selectionKey) {
  const node = projection.nodes.find((item) => item.nodeKey === selectionKey && ['SOURCE', 'ASSESSMENT'].includes(item.nodeKind));
  if (node) return { item: node, kind: node.nodeKind };
  const relationship = projection.relationships.find((item) => item.selectionKey === selectionKey);
  return relationship ? { item: relationship, kind: 'RELATIONSHIP' } : null;
}

export function renderAivCanvasSelectedDetailHtml(state = {}, selectionKey = null) {
  const projection = canvasProjection(state);
  const selected = selectedProjectionItem(projection, String(selectionKey ?? '').trim());
  if (!selected) return '<div class="aiv-canvas-detail-placeholder">Select a Source, Assessment or Source→Assessment relationship to inspect inputs, calculation trace, assumptions and provenance.</div>';
  const { item, kind } = selected;
  if (kind === 'RELATIONSHIP') {
    return selectedDetail(item.selectionKey, `${item.sourceCanonicalId} → ${item.assessmentCanonicalId} · ${item.caseId}`, item, renderAivCanvasRelationshipResultHtml(item), kind);
  }
  const result = kind === 'SOURCE' ? renderAivCanvasSourceResultHtml(item) : renderAivCanvasAssessmentResultHtml(item);
  return selectedDetail(item.nodeKey, `${kind} ${item.tag}`, item, result, kind);
}

function lineSummaryNotice(projection) {
  if (!projection.lineCaseSummaries.length) return '';
  const rows = projection.lineCaseSummaries.map((item) => `<span data-aiv-filterable="true" data-aiv-canvas-cases="${esc(item.caseId)}" data-aiv-canvas-line="${esc(item.line ?? '')}">${esc(item.line ?? '—')} / ${esc(item.caseId)}: ${esc(item.lof)}</span>`).join('');
  return `<div class="aiv-canvas-line-summary"><strong>Line/Case trace only — NON-AUTHORITATIVE FOR SCREENING</strong>${rows}</div>`;
}

function emptyCanvas() {
  return '<div class="aiv-canvas-empty">Load AIV records with canonical IDs to populate the relationship canvas. Blank editable identities are not invented by the canvas.</div>';
}

function canvasHeight(layout) {
  const maxY = Math.max(0, ...layout.nodes.map((node) => node.y));
  return Math.max(260, maxY + 125);
}

function canvasControls() {
  return `<div class="aiv-canvas-controls" role="group" aria-label="AIV canvas zoom controls"><button type="button" class="engineering-console-btn" data-aiv-canvas-action="zoom-out" aria-label="Zoom out">−</button><button type="button" class="engineering-console-btn" data-aiv-canvas-action="reset-view">Reset view</button><button type="button" class="engineering-console-btn" data-aiv-canvas-action="zoom-in" aria-label="Zoom in">+</button></div>`;
}

function relationshipControls() {
  return `<div class="aiv-canvas-mode-controls" role="group" aria-label="AIV canvas mode controls">
    <button type="button" class="engineering-console-btn" data-aiv-canvas-mode="NAVIGATE" aria-pressed="true">Navigate</button>
    <button type="button" class="engineering-console-btn" data-aiv-canvas-mode="RELATIONSHIPS" aria-pressed="false">Relationships</button>
    <button type="button" class="engineering-console-btn" data-aiv-canvas-mode="RESULTS" aria-pressed="false">Results</button>
    <button type="button" class="engineering-console-btn" data-aiv-canvas-action="delete-relationship" disabled>Delete relationship</button>
  </div>`;
}

export function renderAivCanvasWorkspaceHtml(state = {}) {
  const projection = canvasProjection(state);
  const layout = buildDeterministicAivCanvasLayout(projection, state.canvasLayout ?? null);
  const positions = new Map(layout.nodes.map((node) => [node.nodeKey, node]));
  const height = canvasHeight(layout);
  const relationships = projection.relationships.map((item) => relationshipHtml(item, positions)).join('');
  const nodes = projection.nodes.map((item) => nodeHtml(item, positions.get(item.nodeKey))).join('');
  const badges = `${badge(`${projection.nodes.length} nodes`)}${badge(`${projection.relationships.length} relationships`)}${badge('presentation-only', 'authority')}`;
  const vp = layout.viewport;
  const canvas = projection.nodes.length ? `<div class="aiv-canvas-frame"><svg class="aiv-canvas-svg" data-aiv-canvas-svg="true" data-aiv-canvas-viewport-x="${vp.x}" data-aiv-canvas-viewport-y="${vp.y}" data-aiv-canvas-viewport-zoom="${vp.zoom}" role="img" aria-label="AIV source to assessment relationship canvas" viewBox="0 0 760 ${height}" preserveAspectRatio="xMidYMin meet"><defs><marker id="aiv-canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z"></path></marker></defs><g data-aiv-canvas-scene="true" transform="translate(${vp.x} ${vp.y}) scale(${vp.zoom})"><g class="aiv-canvas-relationships">${relationships}</g><g class="aiv-canvas-nodes">${nodes}</g></g></svg></div>` : emptyCanvas();
  return `<section class="aivq-card aiv-canvas-card" data-aiv-canvas-active-mode="NAVIGATE">
    <div class="aivq-section-head"><div><h4>AIV relationship canvas</h4><p>Case/line filters synchronize canvas, result and editable table presentation. Assessment contribution rows come from current screening results; combined PWL is never reconstructed in UI code.</p></div><div class="aiv-canvas-head-actions"><div class="aiv-canvas-badges">${badges}</div>${renderAivCanvasFilterControls(projection)}${relationshipControls()}${canvasControls()}</div></div>
    <div class="aiv-canvas-workspace-grid">${canvas}<aside class="aiv-canvas-detail-host" data-aiv-canvas-selected-detail-host aria-live="polite">${renderAivCanvasSelectedDetailHtml(state, state.selectedCanvasKey)}</aside></div>
    ${lineSummaryNotice(projection)}
  </section>`;
}