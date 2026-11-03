import { buildDeterministicAivCanvasLayout, createAivCanvasLayout } from '../converters/vibration/aiv/aiv-canvas-layout-contract.js';
import { renderAivCanvasFilterControls } from './vibration-aiv-canvas-filter.js';
import { renderAivCanvasNodeGlyph, renderAivCanvasStatusGlyphs } from './vibration-aiv-canvas-icons.js';
import {
  AIV_INPUT_MODE,
  currentAivInputRevision,
  isAivLineageCurrent,
} from './vibration-aiv-engineering-revision.js';
import { renderAivUnifiedCanvasAuthoringHtml } from './vibration-aiv-unified-canvas-author-view.js?v=20260816-aiv-526-editor-3';
import { renderAivUnifiedCanvasSelectedDetailHtml } from './vibration-aiv-unified-canvas-inspector.js?v=20260816-aiv-canvas-release-1';
import {
  buildAivCanvasNodeFieldLinks,
  buildAivCanvasRelationshipFieldLinks,
  buildAivCanvasSegmentFieldLinks,
} from './vibration-aiv-canvas-field-link.js?v=20260816-aiv-canvas-release-1';
import {
  AIV_CANVAS_LABEL_MODE,
  AIV_CANVAS_LABEL_MODES,
  buildAivCanvasNodeLabelLines,
  buildAivCanvasRelationshipLabelLines,
  buildAivCanvasSegmentLabelLines,
} from './vibration-aiv-unified-canvas-labels.js?v=20260816-aiv-526-editor-3';
import {
  aivCanvasLineLabelAnchor,
  aivCanvasPathLabelAnchor,
  renderAivCanvasControlIcon,
} from './vibration-aiv-canvas-presentation.js?v=20260816-aiv-canvas-spatial-1';
import { buildAivUnifiedCanvasProjection } from './vibration-aiv-unified-canvas-projection.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function text(value) { return String(value ?? '').trim(); }
function filterAttrs(cases, line) {
  return ` data-aiv-filterable="true" data-aiv-canvas-cases="${esc((cases ?? []).filter(Boolean).join('|'))}" data-aiv-canvas-line="${esc(line ?? '')}"`;
}
function sourceKey(id, caseId) { return caseId ? `SOURCE:${id}:${caseId}` : `NETWORK_NODE:${id}`; }
function nodeKey(node) {
  if (node.nodeKind === 'SOURCE') return sourceKey(node.canonicalId, node.caseId);
  if (node.nodeKind === 'ASSESSMENT') return `ASSESSMENT:${node.canonicalId}`;
  return `NETWORK_NODE:${node.canonicalId}`;
}
function iconType(node) {
  if (node.nodeKind === 'SOURCE') return node.iconType ?? 'UNKNOWN_SOURCE';
  if (node.nodeKind === 'ASSESSMENT') return node.iconType ?? 'UNKNOWN_ASSESSMENT';
  return ({ JUNCTION: 'JUNCTION', CONNECTION: 'CONNECTION_NODE', OFF_PAGE: 'OFF_PAGE', BOUNDARY: 'BOUNDARY' })[node.nodeKind] ?? 'PIPE_PATH';
}
function topology(state) {
  return state.readinessEnvelope?.exchange
    ?? ((state.topologyInput?.format === 'PARSED_EXCHANGE' || state.topologyInput?.format === 'FLARE_NETWORK') ? state.topologyInput.data : state.topology)
    ?? null;
}
function projection(state) {
  return buildAivUnifiedCanvasProjection({
    tables: state.tables, assumptionResolution: state.assumptionResolution,
    readinessEnvelope: state.readinessEnvelope, screeningResult: state.screeningResult,
    topology: topology(state), inputMode: state.inputMode,
    flareNetwork: state.flareNetwork, generatedInputSet: state.generatedInputSet,
  });
}
function entityMap(value) {
  return new Map(value.entityNodes.map((node) => [node.nodeKind === 'SOURCE'
    ? `${node.canonicalId}\u0000${node.caseId ?? ''}` : `${node.canonicalId}\u0000`, node]));
}
function mergedPhysicalNodes(value) {
  const entities = entityMap(value);
  return value.physicalNodes.map((node) => {
    const entity = entities.get(`${node.canonicalId}\u0000${node.nodeKind === 'SOURCE' ? (node.caseId ?? '') : ''}`);
    return { ...entity, ...node, nodeKind: node.nodeKind,
      nodeKey: entity?.nodeKey ?? nodeKey(node), selectionKey: entity?.selectionKey ?? entity?.nodeKey ?? nodeKey(node),
      iconType: entity?.iconType ?? iconType(node), statusGlyphs: entity?.statusGlyphs ?? [], resultSummary: entity?.resultSummary ?? null };
  });
}
function layoutFor(value) {
  if (value.inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN) {
    return createAivCanvasLayout({ nodes: mergedPhysicalNodes(value).map((node, displayOrder) => ({
      nodeKey: node.nodeKey, canonicalId: node.canonicalId, caseId: node.caseId ?? null,
      nodeKind: node.nodeKind, x: node.presentation.x, y: node.presentation.y, displayOrder,
    })) });
  }
  return buildDeterministicAivCanvasLayout({ schema: 'AivCanvasProjection.v1', nodes: value.entityNodes });
}
function positionMap(layout) { return new Map(layout.nodes.map((node) => [node.nodeKey, node])); }
function canonicalPositionMap(nodes, layout) {
  const layoutByKey = positionMap(layout);
  return new Map(nodes.map((node) => [node.canonicalId, layoutByKey.get(node.nodeKey)]));
}
function linkAttrs(link) {
  if (!link?.primaryFieldKey) return ' pointer-events="none"';
  return ` data-aiv-canvas-field-key="${esc(link.primaryFieldKey)}" data-aiv-canvas-field-keys="${esc(link.fieldKeys.join('|'))}" tabindex="0" role="button" aria-label="Edit ${esc(link.label)}" style="cursor:pointer;pointer-events:auto"`;
}
function modeTextGroup(mode, lines, links = [], x = 0, y = 45, step = 9, className = 'aiv-canvas-node-subtitle', halo = false) {
  const display = mode === AIV_CANVAS_LABEL_MODE.NORMAL ? '' : ' style="display:none"';
  const haloAttrs = halo ? ' paint-order="stroke" stroke="#08111f" stroke-width="4" stroke-linejoin="round"' : '';
  const textRows = lines.map((line, index) => `<text class="${className}" x="0" y="${index * step}" text-anchor="middle"${haloAttrs}${linkAttrs(links[index])}>${esc(line)}</text>`).join('');
  return `<g data-aiv-canvas-label-content="true" data-aiv-label-mode="${mode}" transform="translate(${x} ${y})"${display}>${textRows}</g>`;
}
function allModeLabels(builder, linkBuilder, x = 0, y = 45, step = 9, className, halo = false) {
  return AIV_CANVAS_LABEL_MODES.map((mode) => {
    const lines = builder(mode); const links = linkBuilder?.(mode, lines) ?? [];
    return modeTextGroup(mode, lines, links, x, y, step, className, halo);
  }).join('');
}
function nodeHtml(node, position, screeningCurrent, inputMode) {
  const cases = node.caseIds ?? (node.caseId ? [node.caseId] : []);
  const labels = allModeLabels(
    (mode) => buildAivCanvasNodeLabelLines(node, mode, { screeningCurrent }),
    (mode, lines) => buildAivCanvasNodeFieldLinks(node, mode, lines, { inputMode }),
  );
  return `<g class="aiv-canvas-node is-${esc(text(node.nodeKind).toLowerCase())}" transform="translate(${position.x} ${position.y})" data-aiv-canvas-node="${esc(node.nodeKey)}" data-aiv-selection-key="${esc(node.selectionKey ?? node.nodeKey)}" data-aiv-canvas-node-kind="${esc(node.nodeKind)}" data-aiv-canvas-canonical-id="${esc(node.canonicalId)}" data-aiv-canvas-case-id="${esc(node.caseId ?? '')}" data-aiv-network-canonical-id="${esc(node.canonicalId)}" data-aiv-canvas-x="${position.x}" data-aiv-canvas-y="${position.y}"${filterAttrs(cases, node.line)} tabindex="0" role="button" aria-selected="false">
    ${renderAivCanvasNodeGlyph({ ...node, iconType: iconType(node) })}${renderAivCanvasStatusGlyphs(node.statusGlyphs)}
    <text class="aiv-canvas-node-title" x="0" y="36" text-anchor="middle">${esc(node.tag || node.canonicalId)}</text>${labels}
  </g>`;
}
function physicalSegmentHtml(segment, positions, inputMode) {
  const from = positions.get(segment.fromNodeId); const to = positions.get(segment.toNodeId); if (!from || !to) return '';
  const key = `SEGMENT:${segment.segmentId}`; const anchor = aivCanvasLineLabelAnchor(from, to, { offset: 16, side: 1 });
  const labels = allModeLabels(
    (mode) => buildAivCanvasSegmentLabelLines(segment, mode),
    (mode, lines) => buildAivCanvasSegmentFieldLinks(segment, mode, lines, { inputMode }),
    anchor.x, anchor.y, 10, 'aiv-canvas-segment-label', true,
  );
  return `<g class="aiv-network-segment${segment.engineeringLength ? '' : ' is-unresolved'}" data-aiv-network-segment="${esc(segment.segmentId)}" data-aiv-canvas-segment="${esc(key)}" data-aiv-selection-key="${esc(key)}" data-aiv-network-from="${esc(segment.fromNodeId)}" data-aiv-network-to="${esc(segment.toNodeId)}"${filterAttrs([], segment.line)} tabindex="0" role="button" aria-selected="false">
    <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>${labels}
  </g>`;
}
function relationshipAttrs(item) {
  const source = sourceKey(item.sourceCanonicalId, item.caseId); const assessment = `ASSESSMENT:${item.assessmentCanonicalId}`;
  return ` data-aiv-canvas-relationship="${esc(item.selectionKey)}" data-aiv-selection-key="${esc(item.selectionKey)}" data-aiv-canvas-source-node="${esc(source)}" data-aiv-canvas-assessment-node="${esc(assessment)}" data-aiv-source-canonical-id="${esc(item.sourceCanonicalId)}" data-aiv-assessment-canonical-id="${esc(item.assessmentCanonicalId)}" data-aiv-case-id="${esc(item.caseId)}"${filterAttrs([item.caseId], item.line)} tabindex="0" role="button" aria-selected="false"`;
}
function relationshipLabels(item, segments, screeningCurrent, inputMode) {
  const anchor = aivCanvasPathLabelAnchor(segments, { offset: 22, side: -1 }); if (!anchor) return '';
  return allModeLabels(
    (mode) => buildAivCanvasRelationshipLabelLines(item, mode, { screeningCurrent }),
    (mode, lines) => buildAivCanvasRelationshipFieldLinks(item, mode, lines, { inputMode }),
    anchor.x, anchor.y, 10, 'aiv-canvas-relationship-label', true,
  );
}
function logicalRelationshipHtml(item, layout, screeningCurrent, inputMode) {
  const positions = positionMap(layout); const from = positions.get(sourceKey(item.sourceCanonicalId, item.caseId)); const to = positions.get(`ASSESSMENT:${item.assessmentCanonicalId}`);
  if (!from || !to) return '';
  return `<g class="aiv-canvas-relationship is-logical"${relationshipAttrs(item)} data-aiv-logical-only="true"><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke-dasharray="8 6"></line>${relationshipLabels(item, [{ from, to }], screeningCurrent, inputMode)}</g>`;
}
function pathRelationshipHtml(item, segmentMap, positions, screeningCurrent, inputMode) {
  const labelSegments = [];
  const lines = item.segmentIds.map((id) => segmentMap.get(id)).filter(Boolean).map((segment) => {
    const from = positions.get(segment.fromNodeId); const to = positions.get(segment.toNodeId); if (!from || !to) return '';
    labelSegments.push({ from, to });
    return `<line data-aiv-path-segment-id="${esc(segment.segmentId)}" data-aiv-path-from="${esc(segment.fromNodeId)}" data-aiv-path-to="${esc(segment.toNodeId)}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`;
  }).join('');
  const from = positions.get(item.sourceCanonicalId); const to = positions.get(item.assessmentCanonicalId); if (!labelSegments.length && from && to) labelSegments.push({ from, to });
  return `<g class="aiv-canvas-relationship is-path-overlay is-${esc(text(item.pathStatus).toLowerCase())}"${relationshipAttrs(item)} data-aiv-path-status="${esc(item.pathStatus)}" data-aiv-path-distance-m="${esc(item.pathDistanceM ?? '')}">${lines}${relationshipLabels(item, labelSegments, screeningCurrent, inputMode)}</g>`;
}
function relationshipsHtml(value, layout, physicalNodes, screeningCurrent) {
  if (value.inputMode !== AIV_INPUT_MODE.NETWORK_DRIVEN) return value.relationships.map((item) => logicalRelationshipHtml(item, layout, screeningCurrent, value.inputMode)).join('');
  const positions = canonicalPositionMap(physicalNodes, layout); const segmentMap = new Map(value.physicalSegments.map((segment) => [segment.segmentId, segment]));
  return value.relationships.map((item) => pathRelationshipHtml(item, segmentMap, positions, screeningCurrent, value.inputMode)).join('');
}
function summaryHtml(value) {
  if (!value.lineCaseSummaries.length) return '';
  return `<div class="aiv-canvas-line-summary">${value.lineCaseSummaries.map((item) => `<span>${esc(item.line || 'Unassigned line')} · ${esc(item.caseId || 'Unassigned case')} · non-authoritative trace</span>`).join('')}</div>`;
}
function currentnessHtml(state) {
  const revision = currentAivInputRevision(state); if (revision === 0) return '';
  const readinessCurrent = isAivLineageCurrent(state, 'readiness'); const screeningCurrent = isAivLineageCurrent(state, 'screening');
  if (readinessCurrent && screeningCurrent) return `<div class="aivq-banner is-qualified" data-aiv-canvas-currentness="current"><strong>Engineering revision ${revision} · current.</strong><span>Readiness and registered screening results match the active inputs.</span></div>`;
  return `<div class="aivq-banner is-warning" data-aiv-canvas-currentness="stale"><strong>Engineering inputs changed · revision ${revision}.</strong><span>Readiness: ${readinessCurrent ? 'current' : 'needs check'} · screening/results: ${screeningCurrent ? 'current' : 'needs run'}. Run the missing checks before relying on or exporting results.</span></div>`;
}
function iconButton(label, icon, attrs, { active = false, pressed = null, disabled = false } = {}) {
  const pressedAttr = pressed === null ? '' : ` aria-pressed="${pressed ? 'true' : 'false'}"`;
  return `<button type="button" class="engineering-console-btn${active ? ' is-active' : ''}" data-aiv-canvas-icon-only="true" ${attrs} aria-label="${esc(label)}" title="${esc(label)}"${pressedAttr}${disabled ? ' disabled' : ''} style="width:32px;height:32px;padding:6px;display:inline-flex;align-items:center;justify-content:center">${renderAivCanvasControlIcon(icon)}</button>`;
}
function labelModeButtons() {
  const icons = { NORMAL: 'normal', PROCESS: 'process', GEOMETRY: 'geometry', RESULTS: 'results', COMPLETENESS: 'completeness' };
  return AIV_CANVAS_LABEL_MODES.map((mode) => iconButton(`${mode[0]}${mode.slice(1).toLowerCase()}`, icons[mode], `data-aiv-canvas-label-mode="${mode}"`,
    { active: mode === AIV_CANVAS_LABEL_MODE.NORMAL, pressed: mode === AIV_CANVAS_LABEL_MODE.NORMAL })).join('');
}
function labelLegendIcon() {
  return `<span data-aiv-canvas-label-legend="true" aria-label="Labels" title="Labels" role="img" style="width:28px;height:32px;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8">${renderAivCanvasControlIcon('labels')}</span>`;
}
export function renderAivUnifiedCanvasWorkspaceHtml(state = {}) {
  const value = projection(state); const networkDriven = value.inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN; const screeningCurrent = isAivLineageCurrent(state, 'screening');
  const physicalNodes = networkDriven ? mergedPhysicalNodes(value) : []; const layout = layoutFor(value); const layoutPositions = positionMap(layout);
  const nodes = networkDriven ? physicalNodes : value.entityNodes; const canonicalPositions = networkDriven ? canonicalPositionMap(physicalNodes, layout) : new Map();
  const physicalSegments = networkDriven ? value.physicalSegments.map((item) => physicalSegmentHtml(item, canonicalPositions, value.inputMode)).join('') : '';
  const nodeMarkup = nodes.map((node) => nodeHtml(node, layoutPositions.get(node.nodeKey ?? nodeKey(node)), screeningCurrent, value.inputMode)).join('');
  const relationshipMarkup = relationshipsHtml(value, layout, physicalNodes, screeningCurrent);
  const modeLabel = networkDriven ? 'NETWORK_DRIVEN · graph authority' : 'TABLE_DRIVEN · table authority'; const relationshipLabel = networkDriven ? 'Inspect paths' : 'Relationships';
  return `<section class="aivq-card aiv-canvas-card" data-aiv-unified-canvas="true" data-aiv-input-mode="${esc(value.inputMode)}" data-aiv-canvas-label-display="NORMAL" data-aiv-canvas-semantic-level="DETAILED" data-aiv-last-committed-field="${esc(state.lastCommittedAivFieldKey ?? '')}">
    <div class="aivq-section-head"><div><h4>AIV Network Canvas Editor</h4><p>One SVG is the AIV input editor, topology view, relationship view and registered-result surface.</p></div><div class="aiv-canvas-badges"><span class="aiv-canvas-badge authority">${esc(modeLabel)}</span><span class="aiv-canvas-badge authority">SVG x/y = presentation only</span><span class="aiv-canvas-badge authority">registered results</span></div></div>
    ${currentnessHtml(state)}${renderAivUnifiedCanvasAuthoringHtml(state)}
    ${renderAivCanvasFilterControls({ nodes, relationships: value.relationships })}
    <div data-aiv-canvas-workbench="true" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">
      <div class="aiv-canvas-frame" style="position:relative;flex:3 1 620px;min-width:min(100%,520px)">
        <div class="aiv-canvas-head-actions" aria-label="Canvas navigation controls" style="position:absolute;z-index:6;top:8px;right:8px;padding:4px;border:1px solid #334155;border-radius:8px;background:rgba(8,17,31,.9)">${iconButton('Navigate', 'navigate', 'data-aiv-canvas-mode="NAVIGATE"', { active: true, pressed: true })}${iconButton(relationshipLabel, 'relationships', 'data-aiv-canvas-mode="RELATIONSHIPS"', { pressed: false })}${iconButton('Zoom +', 'zoomIn', 'data-aiv-canvas-action="zoom-in"')}${iconButton('Zoom −', 'zoomOut', 'data-aiv-canvas-action="zoom-out"')}${iconButton('Reset view', 'reset', 'data-aiv-canvas-action="reset-view"')}${iconButton('Fit network', 'fit', 'data-aiv-canvas-action="fit-network"')}${iconButton('Auto tidy', 'tidy', 'data-aiv-canvas-action="auto-tidy"')}${iconButton('Export canvas package', 'export', 'data-aiv-canvas-export="screening"', { disabled: true })}</div>
        <div class="aiv-canvas-head-actions" aria-label="Canvas engineering labels" style="position:absolute;z-index:6;left:8px;bottom:8px;padding:4px;border:1px solid #334155;border-radius:8px;background:rgba(8,17,31,.9)">${labelLegendIcon()}${labelModeButtons()}</div>
        <svg class="aiv-canvas-svg" data-aiv-canvas-svg="true" data-aiv-unified-canvas-svg="true" viewBox="0 0 900 520" role="img" aria-label="AIV unified network canvas editor"><g data-aiv-canvas-viewport="true"><rect data-aiv-canvas-workspace-boundary="true" x="0" y="0" width="1200" height="760" rx="18" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="8 8" opacity=".55" pointer-events="none"></rect>${physicalSegments}${relationshipMarkup}${nodeMarkup}</g></svg>
      </div>
      <aside data-aiv-canvas-inspector-dock="true" aria-label="Selected AIV item details" style="flex:1 1 320px;min-width:min(100%,300px);max-height:620px;overflow:auto"><div data-aiv-canvas-selected-detail-host>${renderAivUnifiedCanvasSelectedDetailHtml(state, state.selectedCanvasKey)}</div></aside>
    </div>
    <div class="aivq-readiness-note"><strong>Field integration:</strong> linked Process/Geometry input labels open the exact authoritative inspector/table field. NETWORK_DRIVEN links graph-owned fields; TABLE_DRIVEN links working-table fields. Results remain registered output only.</div>
    ${summaryHtml(value)}
  </section>`;
}