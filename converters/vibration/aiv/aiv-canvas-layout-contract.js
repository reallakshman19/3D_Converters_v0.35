export const AIV_CANVAS_LAYOUT_SCHEMA = 'AivCanvasLayout.v1';

const DEFAULT_VIEWPORT = Object.freeze({ x: 0, y: 0, zoom: 1 });
const LANE_X = Object.freeze({ SOURCE: 120, PATH: 360, BOUNDARY: 360, ASSESSMENT: 620 });

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${field} must be finite.`);
  return number;
}

function positive(value, field) {
  const number = finite(value, field);
  if (!(number > 0)) throw new RangeError(`${field} must be positive.`);
  return number;
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeViewport(viewport = {}) {
  return Object.freeze({
    x: finite(viewport.x ?? DEFAULT_VIEWPORT.x, 'AIV canvas viewport x'),
    y: finite(viewport.y ?? DEFAULT_VIEWPORT.y, 'AIV canvas viewport y'),
    zoom: positive(viewport.zoom ?? DEFAULT_VIEWPORT.zoom, 'AIV canvas viewport zoom'),
  });
}

function normalizeNode(node, index) {
  const nodeKey = text(node?.nodeKey);
  const canonicalId = text(node?.canonicalId);
  if (!nodeKey || !canonicalId) throw new TypeError('AIV canvas layout nodes require nodeKey and canonicalId.');
  return Object.freeze({
    nodeKey,
    canonicalId,
    caseId: text(node.caseId) || null,
    nodeKind: text(node.nodeKind) || null,
    x: finite(node.x, `AIV canvas node ${nodeKey} x`),
    y: finite(node.y, `AIV canvas node ${nodeKey} y`),
    displayOrder: Number.isInteger(node.displayOrder) ? node.displayOrder : index,
    collapsed: node.collapsed === true,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createAivCanvasLayout({ nodes = [], viewport = DEFAULT_VIEWPORT } = {}) {
  if (!Array.isArray(nodes)) throw new TypeError('AIV canvas layout nodes must be an array.');
  const normalized = nodes.map(normalizeNode);
  const keys = new Set();
  for (const node of normalized) {
    if (keys.has(node.nodeKey)) throw new RangeError(`Duplicate AIV canvas layout nodeKey ${node.nodeKey}.`);
    keys.add(node.nodeKey);
  }
  return deepFreeze({ schema: AIV_CANVAS_LAYOUT_SCHEMA, nodes: normalized, viewport: normalizeViewport(viewport) });
}

function projectionNodes(projection) {
  if (projection?.schema !== 'AivCanvasProjection.v1' || !Array.isArray(projection.nodes)) {
    throw new TypeError('Deterministic AIV canvas layout requires AivCanvasProjection.v1.');
  }
  return projection.nodes;
}

function sortNode(a, b) {
  return String(a.caseId ?? '').localeCompare(String(b.caseId ?? ''))
    || String(a.line ?? '').localeCompare(String(b.line ?? ''))
    || String(a.canonicalId ?? '').localeCompare(String(b.canonicalId ?? ''))
    || String(a.nodeKey ?? '').localeCompare(String(b.nodeKey ?? ''));
}

function lane(nodeKind) {
  return LANE_X[nodeKind] ?? LANE_X.PATH;
}

function existingByKey(layout) {
  if (!layout) return new Map();
  const normalized = createAivCanvasLayout(layout);
  return new Map(normalized.nodes.map((node) => [node.nodeKey, node]));
}

export function buildDeterministicAivCanvasLayout(projection, existingLayout = null) {
  const nodes = [...projectionNodes(projection)].sort(sortNode);
  const existing = existingByKey(existingLayout);
  const laneCounts = new Map();
  const layoutNodes = nodes.map((node, displayOrder) => {
    const retained = existing.get(node.nodeKey);
    if (retained) return { ...retained, displayOrder, canonicalId: node.canonicalId, caseId: node.caseId ?? null, nodeKind: node.nodeKind };
    const count = laneCounts.get(node.nodeKind) ?? 0;
    laneCounts.set(node.nodeKind, count + 1);
    return {
      nodeKey: node.nodeKey,
      canonicalId: node.canonicalId,
      caseId: node.caseId ?? null,
      nodeKind: node.nodeKind,
      x: lane(node.nodeKind),
      y: 90 + count * 120,
      displayOrder,
      collapsed: false,
    };
  });
  return createAivCanvasLayout({ nodes: layoutNodes, viewport: existingLayout?.viewport ?? DEFAULT_VIEWPORT });
}

export function moveAivCanvasLayoutNode(layout, nodeKey, x, y) {
  const current = createAivCanvasLayout(layout);
  const key = text(nodeKey);
  if (!current.nodes.some((node) => node.nodeKey === key)) throw new RangeError(`Unknown AIV canvas layout nodeKey ${key}.`);
  return createAivCanvasLayout({
    viewport: current.viewport,
    nodes: current.nodes.map((node) => node.nodeKey === key ? { ...node, x, y } : node),
  });
}
