import {
  aivCanvasClampPointToWorkspace,
  aivCanvasFitViewport,
  aivCanvasTidyLayout,
  aivCanvasWorkspaceBounds,
} from './vibration-aiv-canvas-workspace.js?v=20260816-aiv-canvas-spatial-1';
import {
  AIV_CANVAS_SEMANTIC_LEVEL,
  aivCanvasSemanticLevel,
  resolveAivCanvasLabelPlacements,
} from './vibration-aiv-canvas-label-layout.js?v=20260816-aiv-canvas-spatial-1';

function text(value) { return String(value ?? '').trim(); }
function rect(value) {
  const source = value?.getBoundingClientRect?.();
  return source ? { left: source.left, top: source.top, width: source.width, height: source.height } : null;
}
function ownerKey(owner) { return text(owner?.dataset?.aivSelectionKey || owner?.dataset?.aivCanvasNode || owner?.dataset?.aivCanvasSegment); }
function selected(owner, selection) { return Boolean(ownerKey(owner) && ownerKey(owner) === text(selection?.selectionKey)); }
function activeLabel(owner, mode) { return owner.querySelector(`[data-aiv-canvas-label-content][data-aiv-label-mode="${mode}"]`); }
function ownerPriority(owner, selection) {
  if (selected(owner, selection)) return 100;
  if (owner.matches('[data-aiv-canvas-node]')) return 40;
  if (owner.matches('[data-aiv-canvas-segment]')) return 25;
  return 15;
}
function union(rects) {
  const values = rects.filter(Boolean); if (!values.length) return null;
  const left = Math.min(...values.map((item) => item.left)); const top = Math.min(...values.map((item) => item.top));
  const right = Math.max(...values.map((item) => item.left + item.width)); const bottom = Math.max(...values.map((item) => item.top + item.height));
  return { left, top, width: right - left, height: bottom - top };
}
function restoreBase(element, key) {
  if (!element) return;
  if (!(key in element.dataset)) element.dataset[key] = element.getAttribute('transform') ?? '';
  const base = element.dataset[key]; if (base) element.setAttribute('transform', base); else element.removeAttribute('transform');
}
function appendShift(element, key, dx, dy) {
  restoreBase(element, key);
  const base = element?.dataset?.aivLabelSemanticTransform || element?.dataset?.[key] || '';
  if (!element) return;
  if (!dx && !dy) { if (base) element.setAttribute('transform', base); return; }
  element.setAttribute('transform', `${base} translate(${dx} ${dy})`.trim());
}
function bundle(owner, mode, selection) {
  const label = activeLabel(owner, mode); if (!label || label.style.visibility === 'hidden') return null;
  const title = owner.matches('[data-aiv-canvas-node]') ? owner.querySelector('.aiv-canvas-node-title') : null;
  restoreBase(label, 'aivLabelBaseTransform'); restoreBase(title, 'aivTitleBaseTransform');
  if (label.dataset.aivLabelSemanticTransform) label.setAttribute('transform', label.dataset.aivLabelSemanticTransform);
  const value = union([rect(title), rect(label)]); if (!value || !(value.width > 0) || !(value.height > 0)) return null;
  return { id: ownerKey(owner), owner, label, title, rect: value, priority: ownerPriority(owner, selection) };
}
function glyphObstacles(container) {
  return [...container.querySelectorAll('.aiv-canvas-engineering-glyph,.aiv-canvas-status-glyph')].map(rect).filter(Boolean);
}
function controlObstacles(container) {
  return [...container.querySelectorAll('.aiv-canvas-head-actions')].map(rect).filter(Boolean);
}
function preserveSelectedTextSize(element, zoom, isSelected) {
  if (!element) return;
  const values = element.matches?.('text') ? [element] : [...element.querySelectorAll?.('text') ?? []];
  for (const item of values) {
    if (!item.dataset.aivBaseFontSize) item.dataset.aivBaseFontSize = String(parseFloat(getComputedStyle(item).fontSize) || 10);
    const base = Number(item.dataset.aivBaseFontSize) || 10;
    item.style.fontSize = isSelected && zoom < 0.65 ? `${base / Math.max(0.35, zoom)}px` : '';
  }
}
function selectedLabelTransform(owner, label, zoom, isSelected) {
  if (!label) return;
  restoreBase(label, 'aivLabelBaseTransform');
  const base = label.dataset.aivLabelBaseTransform || '';
  const preserve = isSelected && zoom < 0.65;
  label.dataset.aivLabelSemanticTransform = preserve
    ? `${base}${owner.matches('[data-aiv-canvas-node]') ? ' translate(0 30)' : ''} scale(${1 / Math.max(0.35, zoom)})`.trim()
    : '';
  if (label.dataset.aivLabelSemanticTransform) label.setAttribute('transform', label.dataset.aivLabelSemanticTransform);
}
function svgScale(canvas, layout) {
  const value = canvas?.getBoundingClientRect?.(); const box = canvas?.viewBox?.baseVal;
  if (!value || !box || !(box.width > 0)) return 1;
  return Math.max(1e-6, value.width / box.width * Number(layout?.viewport?.zoom ?? 1));
}

export function aivCanvasWorkspace(layout) { return aivCanvasWorkspaceBounds(layout?.nodes ?? []); }
export function aivCanvasClampLayoutPoint(layout, value, bounds = aivCanvasWorkspace(layout)) {
  return aivCanvasClampPointToWorkspace(value, bounds);
}

export function aivCanvasEventScenePoint(canvas, layout, event) {
  const value = canvas.getBoundingClientRect(); const box = canvas.viewBox.baseVal;
  const raw = { x: (event.clientX - value.left) * box.width / value.width, y: (event.clientY - value.top) * box.height / value.height };
  const viewport = layout?.viewport ?? { x: 0, y: 0, zoom: 1 };
  const point = { x: (raw.x - viewport.x) / viewport.zoom, y: (raw.y - viewport.y) / viewport.zoom };
  return aivCanvasClampPointToWorkspace(point, aivCanvasWorkspace(layout));
}

export function aivCanvasFitForSvg(layout, canvas) {
  const box = canvas?.viewBox?.baseVal;
  return aivCanvasFitViewport(layout?.nodes ?? [], { width: box?.width, height: box?.height });
}

export function aivCanvasTopologyEdges(container) {
  const edges = [];
  for (const item of container.querySelectorAll('[data-aiv-network-segment]')) edges.push({ from: text(item.dataset.aivNetworkFrom), to: text(item.dataset.aivNetworkTo) });
  for (const item of container.querySelectorAll('[data-aiv-canvas-relationship][data-aiv-logical-only="true"]')) {
    edges.push({ from: text(item.dataset.aivSourceCanonicalId), to: text(item.dataset.aivAssessmentCanonicalId) });
  }
  return edges.filter((item) => item.from && item.to);
}

export function aivCanvasTidyForDom(layout, container) { return aivCanvasTidyLayout(layout, aivCanvasTopologyEdges(container)); }

export function applyAivCanvasWorkspacePresentation(container, layout) {
  const boundary = container.querySelector('[data-aiv-canvas-workspace-boundary]'); if (!boundary) return;
  const bounds = aivCanvasWorkspace(layout);
  boundary.setAttribute('x', bounds.left); boundary.setAttribute('y', bounds.top);
  boundary.setAttribute('width', bounds.width); boundary.setAttribute('height', bounds.height);
}

export function applyAivCanvasSemanticPresentation(container, layout, selection) {
  const level = aivCanvasSemanticLevel(layout?.viewport?.zoom); const card = container.querySelector('[data-aiv-unified-canvas]');
  if (card) card.dataset.aivCanvasSemanticLevel = level;
  const mode = card?.dataset?.aivCanvasLabelDisplay ?? 'NORMAL'; const zoom = Number(layout?.viewport?.zoom ?? 1);
  for (const owner of container.querySelectorAll('[data-aiv-canvas-node],[data-aiv-canvas-segment],[data-aiv-canvas-relationship]')) {
    const isSelected = selected(owner, selection); const label = activeLabel(owner, mode); const title = owner.querySelector('.aiv-canvas-node-title');
    if (title) title.style.visibility = level === AIV_CANVAS_SEMANTIC_LEVEL.OVERVIEW && !isSelected ? 'hidden' : '';
    preserveSelectedTextSize(title, zoom, isSelected);
    if (!label) continue;
    selectedLabelTransform(owner, label, zoom, isSelected);
    label.style.visibility = level === AIV_CANVAS_SEMANTIC_LEVEL.OVERVIEW && !isSelected ? 'hidden' : '';
    const rows = [...label.querySelectorAll('text')]; rows.forEach((row) => { row.style.display = ''; });
    if (level === AIV_CANVAS_SEMANTIC_LEVEL.COMPACT && !isSelected) rows.slice(1).forEach((row) => { row.style.display = 'none'; });
  }
  return level;
}

export function applyAivCanvasCollisionPresentation(container, layout, selection) {
  const canvas = container.querySelector('[data-aiv-unified-canvas-svg]'); const card = container.querySelector('[data-aiv-unified-canvas]');
  if (!canvas || !card) return [];
  const mode = card.dataset.aivCanvasLabelDisplay ?? 'NORMAL';
  const bundles = [...container.querySelectorAll('[data-aiv-canvas-node],[data-aiv-canvas-segment],[data-aiv-canvas-relationship]')]
    .map((owner) => bundle(owner, mode, selection)).filter(Boolean);
  const placements = resolveAivCanvasLabelPlacements(bundles, [...glyphObstacles(container), ...controlObstacles(container)], { step: 20, gap: 5 });
  const byId = new Map(placements.map((item) => [item.id, item])); const scale = svgScale(canvas, layout);
  for (const item of bundles) {
    const placement = byId.get(item.id) ?? { dx: 0, dy: 0, crowded: false };
    const dx = placement.dx / scale; const dy = placement.dy / scale;
    appendShift(item.label, 'aivLabelBaseTransform', dx, dy); appendShift(item.title, 'aivTitleBaseTransform', dx, dy);
    item.owner.toggleAttribute('data-aiv-label-crowded', placement.crowded);
  }
  return placements;
}

export function applyAivCanvasSpatialPresentation(container, layout, selection) {
  applyAivCanvasWorkspacePresentation(container, layout);
  applyAivCanvasSemanticPresentation(container, layout, selection);
  return applyAivCanvasCollisionPresentation(container, layout, selection);
}
