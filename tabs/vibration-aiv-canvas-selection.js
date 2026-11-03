import { createAivCanvasLayout } from '../converters/vibration/aiv/aiv-canvas-layout-contract.js';

function text(value) { return String(value ?? '').trim(); }

export function aivCanvasSelectionFromElement(element) {
  const selectionKey = text(element?.dataset?.aivSelectionKey);
  if (!selectionKey) return null;
  return Object.freeze({
    selectionKey,
    tableKind: text(element.dataset.aivTableKind || element.dataset.aivTableRowKind) || null,
  });
}

function setSelected(element, selected) {
  element.classList.toggle('is-selected', selected);
  element.setAttribute('aria-selected', selected ? 'true' : 'false');
}

export function applyAivCanvasSelection(container, selection) {
  const key = text(selection?.selectionKey);
  let canvasElement = null;
  let tableRow = null;
  for (const element of container.querySelectorAll('[data-aiv-canvas-node],[data-aiv-canvas-relationship],[data-aiv-canvas-segment]')) {
    const selected = Boolean(key && element.dataset.aivSelectionKey === key);
    setSelected(element, selected);
    if (selected) canvasElement = element;
  }
  for (const row of container.querySelectorAll('[data-aiv-table-row-kind]')) {
    const selected = Boolean(key && row.dataset.aivSelectionKey === key);
    setSelected(row, selected);
    if (selected) tableRow = row;
  }
  for (const detail of container.querySelectorAll('[data-aiv-canvas-assumption-detail]')) {
    detail.hidden = !(key && detail.dataset.aivCanvasAssumptionDetail === key);
  }
  return Object.freeze({ canvasElement, tableRow });
}

function segmentPoint(layout, element) {
  const fromId = text(element?.dataset?.aivNetworkFrom);
  const toId = text(element?.dataset?.aivNetworkTo);
  if (!fromId || !toId) return null;
  const from = layout.nodes.find((item) => item.canonicalId === fromId);
  const to = layout.nodes.find((item) => item.canonicalId === toId);
  return from && to ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : null;
}

function selectionPoint(layout, canvasElement) {
  const nodeKey = text(canvasElement?.dataset?.aivCanvasNode);
  if (nodeKey) {
    const node = layout.nodes.find((item) => item.nodeKey === nodeKey);
    return node ? { x: node.x, y: node.y } : null;
  }
  if (canvasElement?.dataset?.aivCanvasSegment) return segmentPoint(layout, canvasElement);
  const sourceKey = text(canvasElement?.dataset?.aivCanvasSourceNode);
  const assessmentKey = text(canvasElement?.dataset?.aivCanvasAssessmentNode);
  const source = layout.nodes.find((item) => item.nodeKey === sourceKey);
  const assessment = layout.nodes.find((item) => item.nodeKey === assessmentKey);
  return source && assessment ? { x: (source.x + assessment.x) / 2, y: (source.y + assessment.y) / 2 } : null;
}

export function centerAivCanvasLayoutOnElement(svg, layoutInput, canvasElement) {
  const layout = createAivCanvasLayout(layoutInput);
  const point = selectionPoint(layout, canvasElement);
  const box = svg?.viewBox?.baseVal;
  if (!point || !box || !(box.width > 0) || !(box.height > 0)) return layout;
  const zoom = layout.viewport.zoom;
  return createAivCanvasLayout({
    nodes: layout.nodes,
    viewport: { x: box.width / 2 - point.x * zoom, y: box.height / 2 - point.y * zoom, zoom },
  });
}

export function revealAivCanvasSelection(container, svg, layout, selection, origin) {
  const applied = applyAivCanvasSelection(container, selection);
  const disclosure = applied.tableRow?.closest?.('[data-aiv-disclosure-key="working-data-tables"]');
  if (origin === 'canvas' && applied.tableRow && (!disclosure || disclosure.open)) {
    applied.tableRow.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  const nextLayout = origin === 'table' && applied.canvasElement
    ? centerAivCanvasLayoutOnElement(svg, layout, applied.canvasElement)
    : createAivCanvasLayout(layout);
  return Object.freeze({ ...applied, layout: nextLayout });
}
