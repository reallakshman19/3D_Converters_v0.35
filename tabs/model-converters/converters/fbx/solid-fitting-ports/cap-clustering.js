import { compareText } from '../zone-geometry/compare.js';

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function finiteVector(value) { return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite); }

function createUnion(ids) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id) => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current);
    let next = id;
    while (parent.get(next) !== current) { const prior = parent.get(next); parent.set(next, current); next = prior; }
    return current;
  };
  const join = (left, right) => {
    const a = find(left), b = find(right);
    if (a === b) return;
    parent.set(compareText(a, b) <= 0 ? b : a, compareText(a, b) <= 0 ? a : b);
  };
  return { find, join };
}

function groupFacesIntoRegions(shell, faceFeatures, tolerance) {
  const faceIds = shell.faces.map((face) => face.faceId);
  const union = createUnion(faceIds);
  for (const edge of shell.edges) {
    if (edge.incidentFaceIds.length !== 2) continue;
    const [left, right] = edge.incidentFaceIds;
    const normalA = faceFeatures.get(left)?.normal, normalB = faceFeatures.get(right)?.normal;
    if (!finiteVector(normalA) || !finiteVector(normalB)) continue;
    if (dot(normalA, normalB) >= tolerance) union.join(left, right);
  }
  const groups = new Map();
  for (const faceId of faceIds) {
    const root = union.find(faceId), group = groups.get(root) || [];
    group.push(faceId); groups.set(root, group);
  }
  return [...groups.values()].map((faceIds2) => faceIds2.sort(compareText));
}

function ringEdgesForRegion(shell, regionFaceIds) {
  const regionSet = new Set(regionFaceIds);
  return shell.edges.filter((edge) => {
    if (edge.incidentFaceIds.length !== 2) return false;
    const inRegion = edge.incidentFaceIds.filter((id) => regionSet.has(id));
    return inRegion.length === 1;
  });
}

function edgeComponents(edges) {
  const byVertex = new Map();
  for (const edge of edges) for (const vertex of [edge.a, edge.b]) {
    const list = byVertex.get(vertex) || []; list.push(edge); byVertex.set(vertex, list);
  }
  const unseen = new Set(edges.map((edge) => edge.key)), components = [];
  while (unseen.size) {
    const first = edges.find((edge) => unseen.has(edge.key)), queue = [first], component = [];
    unseen.delete(first.key);
    while (queue.length) {
      const edge = queue.shift(); component.push(edge);
      for (const vertex of [edge.a, edge.b]) for (const next of byVertex.get(vertex) || []) {
        if (unseen.delete(next.key)) queue.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

function directedEdgeForRegion(edge, regionSet) {
  const occurrence = edge.occurrences.find((item) => regionSet.has(item.faceId));
  return occurrence ? [occurrence.from, occurrence.to] : null;
}

function windingCycleForRegion(component, regionFaceIds) {
  const regionSet = new Set(regionFaceIds), outgoing = new Map();
  for (const edge of component) {
    const directed = directedEdgeForRegion(edge, regionSet);
    if (!directed || outgoing.has(directed[0])) return null;
    outgoing.set(directed[0], directed[1]);
  }
  const start = Math.min(...outgoing.keys());
  const result = [start];
  let current = start;
  for (let step = 0; step <= component.length; step += 1) {
    current = outgoing.get(current);
    if (current === undefined) return null;
    if (current === start) return result;
    if (result.includes(current)) return null;
    result.push(current);
  }
  return null;
}

function ringLoopsForRegion(shell, regionFaceIds) {
  const edges = ringEdgesForRegion(shell, regionFaceIds);
  if (!edges.length) return [];
  return edgeComponents(edges)
    .map((component) => windingCycleForRegion(component, regionFaceIds))
    .filter((cycle) => Array.isArray(cycle) && cycle.length >= 3);
}

export function deriveCapRegions(topology, shell, faceFeatures, profile) {
  const regions = groupFacesIntoRegions(shell, faceFeatures, profile.planarJoinDotTolerance);
  return regions.map((faceIds) => ({
    faceIds,
    ringLoops: ringLoopsForRegion(shell, faceIds)
      .map((cycle) => cycle.map((index) => topology.points[index])),
  })).filter((region) => region.ringLoops.length > 0 && region.ringLoops.length <= 2);
}
