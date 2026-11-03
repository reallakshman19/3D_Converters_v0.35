function polygonsFrom(polygonOffsets, polygonVertexIndices) {
  if ((!Array.isArray(polygonOffsets) && !ArrayBuffer.isView(polygonOffsets))
      || (!Array.isArray(polygonVertexIndices) && !ArrayBuffer.isView(polygonVertexIndices))) return null;
  const offsets = Array.from(polygonOffsets), indices = Array.from(polygonVertexIndices);
  if (!offsets.length || offsets[0] !== 0
      || offsets.some((value) => !Number.isSafeInteger(value) || value < 0)
      || indices.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  for (let index = 1; index < offsets.length; index += 1) if (offsets[index] < offsets[index - 1]) return null;
  if (offsets.at(-1) !== indices.length) return null;
  return Array.from({ length: offsets.length - 1 }, (_, index) => indices.slice(offsets[index], offsets[index + 1]));
}
function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function buildEdgeIndex(polygons) {
  const edges = new Map();
  polygons.forEach((polygon, polygonIndex) => {
    for (let vertex = 0; vertex < polygon.length; vertex += 1) {
      const from = polygon[vertex], to = polygon[(vertex + 1) % polygon.length], key = edgeKey(from, to);
      const entry = edges.get(key) || { polygonIndices: [], directed: [] };
      entry.polygonIndices.push(polygonIndex); entry.directed.push([from, to]); edges.set(key, entry);
    }
  });
  return edges;
}
function unionFind(size) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const find = (value) => parent[value] === value ? value : (parent[value] = find(parent[value]));
  return { find, union: (left, right) => { parent[find(left)] = find(right); } };
}
function shellCountOf(edges, polygonCount) {
  const sets = unionFind(polygonCount);
  for (const entry of edges.values()) if (entry.polygonIndices.length === 2) sets.union(entry.polygonIndices[0], entry.polygonIndices[1]);
  return new Set(Array.from({ length: polygonCount }, (_, index) => sets.find(index))).size;
}
function boundaryLoopCount(edges) {
  const next = new Map();
  for (const entry of edges.values()) {
    if (entry.polygonIndices.length !== 1) continue;
    const [from, to] = entry.directed[0]; if (next.has(from)) return null; next.set(from, to);
  }
  const visited = new Set(); let loops = 0;
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    let cursor = start, steps = 0;
    while (!visited.has(cursor)) {
      visited.add(cursor); const target = next.get(cursor); if (target === undefined) return null;
      cursor = target; steps += 1; if (steps > next.size + 1) return null;
    }
    if (cursor !== start) return null; loops += 1;
  }
  return loops;
}
function degenerateReason(polygons) {
  if (!polygons) return 'MALFORMED_TOPOLOGY_BUFFERS';
  if (!polygons.length) return 'EMPTY_GEOMETRY';
  for (const polygon of polygons) {
    if (polygon.length < 3 || new Set(polygon).size < 3) return 'DEGENERATE_POLYGON';
    for (let index = 0; index < polygon.length; index += 1) {
      if (polygon[index] === polygon[(index + 1) % polygon.length]) return 'ZERO_LENGTH_EDGE';
    }
  }
  return null;
}
function invalidResult(reasonCode, polygonCount, boundaryEdgeCount = 0) {
  return { disposition: 'INVALID_TOPOLOGY', reasonCode,
    stats: { polygonCount, boundaryEdgeCount, shellCount: 0, boundaryLoopCount: 0 } };
}
function classifyByShape(boundaryEdgeCount, shellCount, loops) {
  if (boundaryEdgeCount === 0) return shellCount === 1
    ? { disposition: 'CLOSED', reasonCode: 'WATERTIGHT_SINGLE_SHELL' }
    : { disposition: 'MULTI_SHELL', reasonCode: 'WATERTIGHT_MULTIPLE_SHELLS' };
  if (shellCount > 1) return { disposition: 'OTHER_GOVERNED', reasonCode: 'MULTI_SHELL_WITH_BOUNDARY' };
  if (loops === 2) return { disposition: 'CAPPED', reasonCode: 'TWO_BOUNDARY_LOOPS' };
  if (loops === 1) return { disposition: 'MERGED', reasonCode: 'SINGLE_BOUNDARY_LOOP' };
  return { disposition: 'OTHER_GOVERNED', reasonCode: 'UNGOVERNED_BOUNDARY_LOOP_COUNT' };
}
export function classifyGeometryTopology({ polygonOffsets, polygonVertexIndices }) {
  const polygons = polygonsFrom(polygonOffsets, polygonVertexIndices);
  const degenerate = degenerateReason(polygons);
  if (degenerate) return invalidResult(degenerate, polygons?.length || 0);
  const edges = buildEdgeIndex(polygons);
  const boundaryEdgeCount = [...edges.values()].filter((entry) => entry.polygonIndices.length === 1).length;
  if ([...edges.values()].some((entry) => entry.polygonIndices.length > 2)) {
    return invalidResult('NON_MANIFOLD_EDGE', polygons.length, boundaryEdgeCount);
  }
  const shellCount = shellCountOf(edges, polygons.length), loops = boundaryLoopCount(edges);
  const stats = { polygonCount: polygons.length, boundaryEdgeCount, shellCount, boundaryLoopCount: loops ?? 0 };
  if (loops === null) return { disposition: 'OTHER_GOVERNED', reasonCode: 'IRREGULAR_BOUNDARY', stats };
  return { ...classifyByShape(boundaryEdgeCount, shellCount, loops), stats };
}
