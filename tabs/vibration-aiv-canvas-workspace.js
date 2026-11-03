const DEFAULT_VIEWBOX = Object.freeze({ width: 900, height: 520 });
const DEFAULT_WORKSPACE = Object.freeze({ width: 1200, height: 760, padding: 90 });

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function point(value) {
  const x = Number(value?.x); const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
function orderedNodes(nodes = []) {
  return [...nodes].sort((a, b) => (finite(a.displayOrder, 0) - finite(b.displayOrder, 0))
    || String(a.canonicalId ?? '').localeCompare(String(b.canonicalId ?? ''))
    || String(a.nodeKey ?? '').localeCompare(String(b.nodeKey ?? '')));
}
function contentBounds(nodes = [], padding = DEFAULT_WORKSPACE.padding) {
  const values = nodes.map(point).filter(Boolean);
  if (!values.length) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const xs = values.map((item) => item.x); const ys = values.map((item) => item.y);
  const left = Math.min(...xs) - padding; const right = Math.max(...xs) + padding;
  const top = Math.min(...ys) - padding; const bottom = Math.max(...ys) + padding;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
function expandedBounds(bounds, minWidth, minHeight) {
  const left = Math.min(0, bounds.left); const top = Math.min(0, bounds.top);
  const right = Math.max(bounds.right, left + minWidth); const bottom = Math.max(bounds.bottom, top + minHeight);
  return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top });
}

export function aivCanvasWorkspaceBounds(nodes = [], options = {}) {
  const padding = Math.max(0, finite(options.padding, DEFAULT_WORKSPACE.padding));
  const minWidth = Math.max(1, finite(options.minWidth, DEFAULT_WORKSPACE.width));
  const minHeight = Math.max(1, finite(options.minHeight, DEFAULT_WORKSPACE.height));
  const bounds = contentBounds(nodes, padding);
  if (!nodes.length) return Object.freeze({ left: 0, top: 0, right: minWidth, bottom: minHeight, width: minWidth, height: minHeight });
  return expandedBounds(bounds, minWidth, minHeight);
}

export function aivCanvasClampPointToWorkspace(value, bounds, options = {}) {
  const item = point(value); if (!item) return null;
  const inset = Math.max(0, finite(options.inset, 44));
  const left = finite(bounds?.left); const right = finite(bounds?.right, DEFAULT_WORKSPACE.width);
  const top = finite(bounds?.top); const bottom = finite(bounds?.bottom, DEFAULT_WORKSPACE.height);
  const minX = Math.min(left + inset, (left + right) / 2); const maxX = Math.max(right - inset, (left + right) / 2);
  const minY = Math.min(top + inset, (top + bottom) / 2); const maxY = Math.max(bottom - inset, (top + bottom) / 2);
  return Object.freeze({ x: Math.max(minX, Math.min(maxX, item.x)), y: Math.max(minY, Math.min(maxY, item.y)) });
}

export function aivCanvasFitViewport(nodes = [], viewBox = DEFAULT_VIEWBOX, options = {}) {
  const width = Math.max(1, finite(viewBox?.width, DEFAULT_VIEWBOX.width));
  const height = Math.max(1, finite(viewBox?.height, DEFAULT_VIEWBOX.height));
  if (!nodes.length) return Object.freeze({ x: 0, y: 0, zoom: 1 });
  const padding = Math.max(0, finite(options.padding, 84));
  const bounds = contentBounds(nodes, Math.max(36, finite(options.objectPadding, 54)));
  const usableWidth = Math.max(1, width - padding * 2); const usableHeight = Math.max(1, height - padding * 2);
  const raw = Math.min(usableWidth / Math.max(1, bounds.width), usableHeight / Math.max(1, bounds.height));
  const minZoom = Math.max(0.1, finite(options.minZoom, 0.35)); const maxZoom = Math.max(minZoom, finite(options.maxZoom, 1.4));
  const zoom = Math.max(minZoom, Math.min(maxZoom, raw));
  const cx = (bounds.left + bounds.right) / 2; const cy = (bounds.top + bounds.bottom) / 2;
  return Object.freeze({ x: width / 2 - cx * zoom, y: height / 2 - cy * zoom, zoom });
}

function adjacency(nodes, edges) {
  const ids = new Set(nodes.map((node) => String(node.canonicalId ?? ''))); const map = new Map([...ids].map((id) => [id, new Set()]));
  for (const edge of edges ?? []) {
    const from = String(edge?.from ?? ''); const to = String(edge?.to ?? '');
    if (!map.has(from) || !map.has(to) || from === to) continue;
    map.get(from).add(to); map.get(to).add(from);
  }
  return map;
}
function levels(nodes, edges) {
  const graph = adjacency(nodes, edges); const result = new Map(); const queue = [];
  for (const node of orderedNodes(nodes).filter((item) => item.nodeKind === 'SOURCE')) {
    result.set(String(node.canonicalId), 0); queue.push(String(node.canonicalId));
  }
  while (queue.length) {
    const id = queue.shift(); const next = (result.get(id) ?? 0) + 1;
    for (const neighbor of graph.get(id) ?? []) if (!result.has(neighbor)) { result.set(neighbor, next); queue.push(neighbor); }
  }
  return result;
}
function laneLevel(node, resolved, maxLevel) {
  if (node.nodeKind === 'SOURCE') return 0;
  if (node.nodeKind === 'ASSESSMENT') return Math.max(2, maxLevel + 1);
  const value = resolved.get(String(node.canonicalId));
  return Number.isFinite(value) ? Math.max(1, value) : Math.max(1, Math.ceil(maxLevel / 2));
}

export function aivCanvasTidyLayout(layout = {}, edges = [], options = {}) {
  const nodes = orderedNodes(layout.nodes ?? []); if (!nodes.length) return Object.freeze({ ...layout, nodes: Object.freeze([]) });
  const resolved = levels(nodes, edges); const maxResolved = Math.max(1, ...resolved.values());
  const finalLevel = Math.max(2, maxResolved + 1); const left = finite(options.left, 120); const right = finite(options.right, 780);
  const top = finite(options.top, 90); const rowGap = Math.max(70, finite(options.rowGap, 110));
  const groups = new Map();
  for (const node of nodes) {
    const level = laneLevel(node, resolved, maxResolved); if (!groups.has(level)) groups.set(level, []); groups.get(level).push(node);
  }
  const positioned = [];
  for (const [level, group] of [...groups].sort((a, b) => a[0] - b[0])) {
    const x = left + (right - left) * Math.min(finalLevel, level) / finalLevel;
    group.forEach((node, index) => positioned.push({ ...node, x, y: top + index * rowGap }));
  }
  const byKey = new Map(positioned.map((node) => [node.nodeKey, node]));
  return Object.freeze({ ...layout, nodes: Object.freeze((layout.nodes ?? []).map((node) => Object.freeze(byKey.get(node.nodeKey) ?? node))) });
}
