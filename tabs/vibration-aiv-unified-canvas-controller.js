import {
  createAivCanvasLayout,
  moveAivCanvasLayoutNode,
} from '../converters/vibration/aiv/aiv-canvas-layout-contract.js';
import { moveAivFlareNetworkNodePresentation } from '../converters/vibration/aiv/aiv-flare-network.js';
import { activateAivCanvasDetailTab, moveAivCanvasDetailTab } from './vibration-aiv-canvas-detail.js';
import { createAivCanvasFieldController } from './vibration-aiv-canvas-field-controller.js?v=20260816-aiv-canvas-fields-1';
import { createAivCanvasFilterController } from './vibration-aiv-canvas-filter.js';
import {
  AIV_CANVAS_MODE,
  advanceAivCanvasRelationshipState,
  aivCanvasRelationshipEndpoint,
  aivCanvasRelationshipIdentityFromElement,
  createAivCanvasRelationshipState,
  setAivCanvasRelationshipMode,
} from './vibration-aiv-canvas-relationship.js';
import {
  aivCanvasSelectionFromElement,
  applyAivCanvasSelection,
  revealAivCanvasSelection,
} from './vibration-aiv-canvas-selection.js?v=20260816-aiv-canvas-release-1';
import {
  applyAivUnifiedNetworkAuthorAction,
  applyAivUnifiedNetworkAuthorChange,
} from './vibration-aiv-unified-canvas-author.js?v=20260816-aiv-526-editor-3';
import { createAivUnifiedCanvasEditorController } from './vibration-aiv-unified-canvas-editor-controller.js?v=20260816-aiv-526-editor-3';
import {
  AIV_CANVAS_LABEL_MODE,
  normalizeAivCanvasLabelMode,
} from './vibration-aiv-unified-canvas-labels.js?v=20260816-aiv-526-editor-3';
import {
  aivCanvasLineLabelAnchor,
  aivCanvasPathLabelAnchor,
} from './vibration-aiv-canvas-presentation.js?v=20260816-aiv-canvas-spatial-1';
import {
  aivCanvasClampLayoutPoint,
  aivCanvasEventScenePoint,
  aivCanvasFitForSvg,
  aivCanvasTidyForDom,
  aivCanvasWorkspace,
  applyAivCanvasSpatialPresentation,
} from './vibration-aiv-canvas-spatial-dom.js?v=20260816-aiv-canvas-spatial-1';
import { AIV_INPUT_MODE } from './vibration-aiv-engineering-revision.js';

function text(value) { return String(value ?? '').trim(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function card(container) { return container.querySelector('[data-aiv-unified-canvas]'); }
function svg(container) { return container.querySelector('[data-aiv-unified-canvas-svg]'); }
function scene(container) { return container.querySelector('[data-aiv-canvas-viewport]'); }
function inputMode(container) { return card(container)?.dataset.aivInputMode ?? AIV_INPUT_MODE.TABLE_DRIVEN; }
function isNetworkDriven(container) { return inputMode(container) === AIV_INPUT_MODE.NETWORK_DRIVEN; }
function canvasTarget(event) { return event.target?.closest?.('[data-aiv-canvas-node],[data-aiv-canvas-relationship],[data-aiv-canvas-segment]') ?? null; }
function editingControl(event) { return Boolean(event.target?.closest?.('input,textarea,select,[contenteditable="true"]')); }
function createdSelection(before, after) {
  const nodeIds = new Set((before?.nodes ?? []).map((item) => item.canonicalId));
  const node = after?.nodes?.find((item) => !nodeIds.has(item.canonicalId));
  if (node?.kind === 'SOURCE') return { selectionKey: `SOURCE:${node.canonicalId}:${node.sourceInput?.caseId ?? ''}` };
  if (node?.kind === 'ASSESSMENT') return { selectionKey: `ASSESSMENT:${node.canonicalId}` };
  if (node) return { selectionKey: `NETWORK_NODE:${node.canonicalId}` };
  const segmentIds = new Set((before?.segments ?? []).map((item) => item.segmentId));
  const segment = after?.segments?.find((item) => !segmentIds.has(item.segmentId));
  return segment ? { selectionKey: `SEGMENT:${segment.segmentId}` } : null;
}
function domNodes(container) {
  return [...container.querySelectorAll('[data-aiv-unified-canvas-svg] [data-aiv-canvas-node]')].map((element, displayOrder) => ({
    nodeKey: text(element.dataset.aivCanvasNode), canonicalId: text(element.dataset.aivCanvasCanonicalId),
    caseId: text(element.dataset.aivCanvasCaseId) || null, nodeKind: text(element.dataset.aivCanvasNodeKind) || null,
    x: number(element.dataset.aivCanvasX), y: number(element.dataset.aivCanvasY), displayOrder,
  }));
}
function reconcileLayout(container, previous) {
  const incoming = domNodes(container); const existing = new Map((previous?.nodes ?? []).map((node) => [node.nodeKey, node]));
  return createAivCanvasLayout({ viewport: previous?.viewport,
    nodes: incoming.map((node) => isNetworkDriven(container) ? node : ({ ...node, ...(existing.get(node.nodeKey) ?? {}) })) });
}
function positions(layout) { return new Map(layout.nodes.map((node) => [node.nodeKey, node])); }
function canonicalPositions(container, layout) {
  const byKey = positions(layout);
  return new Map([...container.querySelectorAll('[data-aiv-unified-canvas-svg] [data-aiv-network-canonical-id]')]
    .map((element) => [text(element.dataset.aivNetworkCanonicalId), byKey.get(text(element.dataset.aivCanvasNode))]));
}
function setLine(line, from, to) {
  if (!line || !from || !to) return;
  line.setAttribute('x1', from.x); line.setAttribute('y1', from.y); line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
}
function pathSegments(owner, positionsByCanonical) {
  return [...owner.querySelectorAll('[data-aiv-path-from]')].map((line) => ({
    from: positionsByCanonical.get(text(line.dataset.aivPathFrom)), to: positionsByCanonical.get(text(line.dataset.aivPathTo)),
  })).filter((item) => item.from && item.to);
}
function setLabelPosition(owner, segments, options) {
  if (!owner || !segments?.length) return;
  const anchor = segments.length === 1 ? aivCanvasLineLabelAnchor(segments[0].from, segments[0].to, options) : aivCanvasPathLabelAnchor(segments, options);
  if (!anchor) return;
  for (const group of owner.querySelectorAll('[data-aiv-canvas-label-content]')) {
    const transform = `translate(${anchor.x} ${anchor.y})`; group.setAttribute('transform', transform); group.dataset.aivLabelBaseTransform = transform;
  }
}
function redraw(container, layout) {
  const byKey = positions(layout); const byCanonical = canonicalPositions(container, layout);
  for (const element of container.querySelectorAll('[data-aiv-unified-canvas-svg] [data-aiv-canvas-node]')) {
    const point = byKey.get(text(element.dataset.aivCanvasNode)); if (!point) continue;
    element.setAttribute('transform', `translate(${point.x} ${point.y})`); element.dataset.aivCanvasX = point.x; element.dataset.aivCanvasY = point.y;
  }
  for (const segment of container.querySelectorAll('[data-aiv-unified-canvas-svg] [data-aiv-network-segment]')) {
    const from = byCanonical.get(text(segment.dataset.aivNetworkFrom)); const to = byCanonical.get(text(segment.dataset.aivNetworkTo));
    setLine(segment.querySelector('line'), from, to); setLabelPosition(segment, [{ from, to }], { offset: 16, side: 1 });
  }
  for (const line of container.querySelectorAll('[data-aiv-unified-canvas-svg] [data-aiv-path-from]')) setLine(line, byCanonical.get(text(line.dataset.aivPathFrom)), byCanonical.get(text(line.dataset.aivPathTo)));
  for (const relation of container.querySelectorAll('[data-aiv-unified-canvas-svg] [data-aiv-canvas-relationship]')) {
    const logical = relation.dataset.aivLogicalOnly === 'true';
    const from = logical ? byKey.get(text(relation.dataset.aivCanvasSourceNode)) : byCanonical.get(text(relation.dataset.aivSourceCanonicalId));
    const to = logical ? byKey.get(text(relation.dataset.aivCanvasAssessmentNode)) : byCanonical.get(text(relation.dataset.aivAssessmentCanonicalId));
    if (logical) setLine(relation.querySelector('line'), from, to);
    const segments = logical ? [{ from, to }] : pathSegments(relation, byCanonical); if (!segments.length && from && to) segments.push({ from, to });
    setLabelPosition(relation, segments, { offset: 22, side: -1 });
  }
  scene(container)?.setAttribute('transform', `translate(${layout.viewport.x} ${layout.viewport.y}) scale(${layout.viewport.zoom})`);
}
function svgPoint(svgElement, event) {
  const rect = svgElement.getBoundingClientRect(); const box = svgElement.viewBox.baseVal;
  return { x: (event.clientX - rect.left) * box.width / rect.width, y: (event.clientY - rect.top) * box.height / rect.height };
}
function setModePresentation(container, mode) {
  const value = card(container); if (value) value.dataset.aivCanvasActiveMode = mode;
  for (const button of container.querySelectorAll('[data-aiv-canvas-mode]')) {
    const active = button.dataset.aivCanvasMode === mode; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}
function setLabelModePresentation(container, requested) {
  const mode = normalizeAivCanvasLabelMode(requested); const value = card(container); if (value) value.dataset.aivCanvasLabelDisplay = mode;
  for (const button of container.querySelectorAll('[data-aiv-canvas-label-mode]')) {
    const active = button.dataset.aivCanvasLabelMode === mode; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  for (const group of container.querySelectorAll('[data-aiv-canvas-label-content]')) group.style.display = group.dataset.aivLabelMode === mode ? '' : 'none';
  return mode;
}
function updateDeleteControl(container, selection) {
  const button = container.querySelector('[data-aiv-canvas-action="delete-relationship"]');
  if (button) button.disabled = isNetworkDriven(container) || !String(selection?.selectionKey ?? '').startsWith('REL:');
}
export function createAivUnifiedCanvasController(container, callbacks = {}) {
  let layout = null; let selection = null; let gesture = null; let suppressClick = false;
  let relationship = createAivCanvasRelationshipState({ mode: AIV_CANVAS_MODE.NAVIGATE }); let labelMode = AIV_CANVAS_LABEL_MODE.NORMAL;
  const getNetwork = callbacks.getNetwork ?? (() => null); const filter = createAivCanvasFilterController(container, { onSelectionFiltered: () => select(null) });
  let editorController = null; let fieldController = null;
  function paint() { if (!layout) return; redraw(container, layout); labelMode = setLabelModePresentation(container, labelMode); applyAivCanvasSpatialPresentation(container, layout, selection); }
  function select(next, origin = 'canvas') {
    selection = next;
    if (layout && svg(container)) { const revealed = revealAivCanvasSelection(container, svg(container), layout, selection, origin); layout = revealed.layout; if (origin === 'table') redraw(container, layout); }
    else applyAivCanvasSelection(container, selection);
    if (layout) applyAivCanvasSpatialPresentation(container, layout, selection);
    updateDeleteControl(container, selection); callbacks.onSelectionChange?.(selection);
  }
  fieldController = createAivCanvasFieldController(container, {
    onCanvasOwner: (element) => select(aivCanvasSelectionFromElement(element)),
    onFieldCommit: (key) => callbacks.onFieldCommit?.(key),
  });
  editorController = createAivUnifiedCanvasEditorController(container, {
    getNetwork, getSelection: () => selection, onNetworkChange: callbacks.onNetworkChange, onSelectionChange: (next) => select(next), onError: callbacks.onError,
    toCanvasPoint: (event) => layout && svg(container) ? aivCanvasEventScenePoint(svg(container), layout, event) : { x: 110, y: 100 },
  });
  function sync() {
    if (!svg(container)) { callbacks.onSelectionChange?.(selection); return; }
    layout = reconcileLayout(container, layout); redraw(container, layout); applyAivCanvasSelection(container, selection); filter.sync();
    setModePresentation(container, relationship.mode); labelMode = setLabelModePresentation(container, labelMode); applyAivCanvasSpatialPresentation(container, layout, selection);
    updateDeleteControl(container, selection); editorController.sync(); fieldController.sync();
  }
  function updateViewport(next) { layout = createAivCanvasLayout({ nodes: layout.nodes, viewport: next }); paint(); }
  function fitNetwork() { const canvas = svg(container); if (layout && canvas) updateViewport(aivCanvasFitForSvg(layout, canvas)); }
  function tidyNetwork() {
    const canvas = svg(container); if (!layout || !canvas) return;
    const tidy = aivCanvasTidyForDom(layout, container); layout = createAivCanvasLayout({ nodes: tidy.nodes, viewport: aivCanvasFitForSvg(tidy, canvas) }); paint();
    if (!isNetworkDriven(container)) return;
    try {
      let network = getNetwork();
      for (const node of layout.nodes) network = moveAivFlareNetworkNodePresentation(network, node.canonicalId, node.x, node.y);
      callbacks.onPresentationChange?.(network);
    } catch (error) { callbacks.onError?.(error); }
  }
  function deleteSelectedRelationship() {
    if (isNetworkDriven(container)) return;
    const element = container.querySelector('[data-aiv-canvas-relationship].is-selected'); const identity = aivCanvasRelationshipIdentityFromElement(element);
    if (identity && callbacks.onDeleteRelationship?.(identity)) select(null);
  }
  function authorAction(event) {
    const author = event.target.closest('[data-aiv-network-editor]'); if (!author) return false;
    try {
      const before = getNetwork(); const result = applyAivUnifiedNetworkAuthorAction(before, author, event.target);
      if (result.handled) { callbacks.onNetworkChange?.(result.network); const nextSelection = createdSelection(before, result.network); if (nextSelection) select(nextSelection); }
      return result.handled;
    } catch (error) { callbacks.onError?.(error); return true; }
  }
  function click(event) {
    if (fieldController.handleClick(event) || editorController.handleClick(event) || authorAction(event)) return;
    const labelRequest = event.target.closest('[data-aiv-canvas-label-mode]')?.dataset.aivCanvasLabelMode;
    if (labelRequest) { labelMode = setLabelModePresentation(container, labelRequest); applyAivCanvasSpatialPresentation(container, layout, selection); return; }
    const detailTab = event.target.closest('[data-aiv-detail-tab]'); if (detailTab && activateAivCanvasDetailTab(detailTab)) return;
    const mode = event.target.closest('[data-aiv-canvas-mode]')?.dataset.aivCanvasMode;
    if (mode) { relationship = setAivCanvasRelationshipMode(relationship, mode); setModePresentation(container, relationship.mode); return; }
    const command = event.target.closest('[data-aiv-canvas-action]')?.dataset.aivCanvasAction;
    if (command === 'delete-relationship') { deleteSelectedRelationship(); return; }
    if (command && layout) {
      if (command === 'zoom-in') updateViewport({ ...layout.viewport, zoom: Math.min(3, layout.viewport.zoom * 1.2) });
      if (command === 'zoom-out') updateViewport({ ...layout.viewport, zoom: Math.max(0.35, layout.viewport.zoom / 1.2) });
      if (command === 'reset-view') updateViewport({ x: 0, y: 0, zoom: 1 });
      if (command === 'fit-network') fitNetwork(); if (command === 'auto-tidy') tidyNetwork(); return;
    }
    if (event.target.closest('[data-aiv-table-add],[data-aiv-table-delete]')) return;
    const row = event.target.closest('[data-aiv-table-row-kind]'); if (row) { select(aivCanvasSelectionFromElement(row), 'table'); return; }
    if (suppressClick) { suppressClick = false; return; }
    const element = canvasTarget(event); if (!element) return; select(aivCanvasSelectionFromElement(element));
    if (relationship.mode !== AIV_CANVAS_MODE.RELATIONSHIPS || isNetworkDriven(container)) return;
    const endpoint = aivCanvasRelationshipEndpoint(element); if (!endpoint) return;
    const advanced = advanceAivCanvasRelationshipState(relationship, endpoint); relationship = advanced.state;
    if (advanced.createRequest && callbacks.onCreateRelationship?.(advanced.createRequest)) {
      select({ selectionKey: `REL:${advanced.createRequest.sourceCanonicalId}:${advanced.createRequest.assessmentCanonicalId}:${advanced.createRequest.caseId}`, tableKind: 'relationships' });
      relationship = setAivCanvasRelationshipMode(relationship, AIV_CANVAS_MODE.NAVIGATE); setModePresentation(container, relationship.mode);
    }
  }
  function change(event) {
    fieldController.noteCommit(event);
    const author = event.target.closest('[data-aiv-network-editor]'); if (!author) return;
    try { const result = applyAivUnifiedNetworkAuthorChange(getNetwork(), author, event.target); if (result.handled) callbacks.onNetworkChange?.(result.network); }
    catch (error) { callbacks.onError?.(error); }
  }
  function pointerDown(event) {
    const canvas = svg(container); if (!canvas || !layout || editorController.isDirectEditActive() || event.button !== 0 || !event.target.closest('[data-aiv-unified-canvas-svg]')) return;
    const node = event.target.closest('[data-aiv-canvas-node]'); const start = svgPoint(canvas, event);
    if (node) {
      const key = text(node.dataset.aivCanvasNode); const current = positions(layout).get(key); if (!current) return;
      gesture = { kind: 'NODE', pointerId: event.pointerId, key, start, x: current.x, y: current.y, canonicalId: text(node.dataset.aivNetworkCanonicalId) || null, workspace: aivCanvasWorkspace(layout), moved: false };
    } else gesture = { kind: 'PAN', pointerId: event.pointerId, start, x: layout.viewport.x, y: layout.viewport.y, moved: false };
    canvas.setPointerCapture?.(event.pointerId); event.preventDefault?.();
  }
  function pointerMove(event) {
    const canvas = svg(container); if (!gesture || !canvas || gesture.pointerId !== event.pointerId) return;
    const point = svgPoint(canvas, event); const dx = point.x - gesture.start.x; const dy = point.y - gesture.start.y; gesture.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
    if (gesture.kind === 'PAN') updateViewport({ ...layout.viewport, x: gesture.x + dx, y: gesture.y + dy });
    else {
      const target = aivCanvasClampLayoutPoint(layout, { x: gesture.x + dx / layout.viewport.zoom, y: gesture.y + dy / layout.viewport.zoom }, gesture.workspace);
      layout = moveAivCanvasLayoutNode(layout, gesture.key, target.x, target.y); paint();
    }
    event.preventDefault?.();
  }
  function pointerUp(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const finished = gesture; gesture = null; suppressClick = finished.moved; svg(container)?.releasePointerCapture?.(event.pointerId);
    if (finished.kind === 'NODE' && finished.moved && finished.canonicalId && isNetworkDriven(container)) {
      const point = positions(layout).get(finished.key);
      try { callbacks.onPresentationChange?.(moveAivFlareNetworkNodePresentation(getNetwork(), finished.canonicalId, point.x, point.y)); }
      catch (error) { callbacks.onError?.(error); }
    }
  }
  function wheel(event) {
    if (!event.target.closest('[data-aiv-unified-canvas-svg]') || !layout) return;
    const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2; updateViewport({ ...layout.viewport, zoom: Math.max(0.35, Math.min(3, layout.viewport.zoom * factor)) }); event.preventDefault();
  }
  function keyDown(event) {
    if (fieldController.handleKeyDown(event)) { event.preventDefault(); return; }
    if (editorController.handleKeyDown(event)) { event.preventDefault(); return; }
    if (event.key === 'Escape') { relationship = setAivCanvasRelationshipMode(relationship, AIV_CANVAS_MODE.NAVIGATE); setModePresentation(container, relationship.mode); return; }
    const tab = event.target.closest('[data-aiv-detail-tab]'); if (tab && moveAivCanvasDetailTab(tab, event.key)) { event.preventDefault(); return; }
    if (['Delete', 'Backspace'].includes(event.key) && !isNetworkDriven(container) && !editingControl(event)) { deleteSelectedRelationship(); return; }
    if (!['Enter', ' '].includes(event.key)) return;
    if (tab) { activateAivCanvasDetailTab(tab, true); event.preventDefault(); return; }
    const target = canvasTarget(event); if (!target) return; select(aivCanvasSelectionFromElement(target));
    if (relationship.mode === AIV_CANVAS_MODE.RELATIONSHIPS && !isNetworkDriven(container)) {
      const endpoint = aivCanvasRelationshipEndpoint(target);
      if (endpoint) { const advanced = advanceAivCanvasRelationshipState(relationship, endpoint); relationship = advanced.state;
        if (advanced.createRequest && callbacks.onCreateRelationship?.(advanced.createRequest)) select({ selectionKey: `REL:${advanced.createRequest.sourceCanonicalId}:${advanced.createRequest.assessmentCanonicalId}:${advanced.createRequest.caseId}`, tableKind: 'relationships' }); }
    }
    event.preventDefault();
  }
  const handlers = { click, change, pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp, pointercancel: pointerUp, wheel, keydown: keyDown };
  for (const [type, handler] of Object.entries(handlers)) container.addEventListener(type, handler, type === 'wheel' ? { passive: false } : undefined);
  return Object.freeze({ sync, getLayout: () => layout,
    destroy() { filter.destroy(); editorController.destroy(); fieldController.destroy(); for (const [type, handler] of Object.entries(handlers)) container.removeEventListener(type, handler); layout = null; gesture = null; selection = null; },
  });
}