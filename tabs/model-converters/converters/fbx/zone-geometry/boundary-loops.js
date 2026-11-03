import { REJECTION_REASON_ORDER } from './constants.js';
import { compareNumberArrays, compareText } from './compare.js';
import { evidenceId } from './identity.js';

function reasonRank(value) {
  const index = REJECTION_REASON_ORDER.indexOf(value);
  return index < 0 ? REJECTION_REASON_ORDER.length : index;
}

function sortedReasons(values) {
  return [...new Set(values)].sort((a, b) => reasonRank(a) - reasonRank(b) || compareText(a, b));
}

function boundaryEdges(shell) {
  return shell.edges.filter((edge) => edge.a !== edge.b && edge.incidentFaceIds.length === 1
    && edge.occurrences.length === 1);
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
    components.push(component.sort((a, b) => a.a - b.a || a.b - b.b));
  }
  return components;
}

function adjacency(component) {
  const result = new Map();
  for (const edge of component) for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) {
    const list = result.get(from) || []; list.push(to); result.set(from, list);
  }
  for (const list of result.values()) list.sort((a, b) => a - b);
  return result;
}

function structuralReasons(component) {
  const graph = adjacency(component), reasons = [];
  if (component.length < 3 || graph.size < 3) reasons.push('DEGENERATE_LOOP');
  if ([...graph.values()].some((list) => list.length === 1)) reasons.push('OPEN_CHAIN');
  if ([...graph.values()].some((list) => list.length > 2)) reasons.push('BRANCHING_BOUNDARY');
  const incoming = new Map(), outgoing = new Map();
  for (const edge of component) {
    const occurrence = edge.occurrences[0];
    outgoing.set(occurrence.from, (outgoing.get(occurrence.from) || 0) + 1);
    incoming.set(occurrence.to, (incoming.get(occurrence.to) || 0) + 1);
  }
  if ([...graph.keys()].some((vertex) => incoming.get(vertex) !== 1 || outgoing.get(vertex) !== 1)) {
    reasons.push('AMBIGUOUS_WINDING');
  }
  return sortedReasons(reasons);
}

function walkCycle(graph, start, next) {
  const result = [start, next], seen = new Set([start]);
  let previous = start, current = next;
  while (current !== start) {
    if (seen.has(current)) return null;
    seen.add(current);
    const choices = (graph.get(current) || []).filter((value) => value !== previous);
    if (choices.length !== 1) return null;
    previous = current; current = choices[0]; result.push(current);
  }
  return result;
}

function canonicalCycle(component) {
  const graph = adjacency(component), start = Math.min(...graph.keys());
  const choices = graph.get(start) || [];
  if (choices.length !== 2) return null;
  const left = walkCycle(graph, start, choices[0]);
  const right = walkCycle(graph, start, choices[1]);
  if (!left || !right) return null;
  return compareNumberArrays(left, right) <= 0 ? left : right;
}

function windingCycle(component) {
  const outgoing = new Map();
  for (const edge of component) outgoing.set(edge.occurrences[0].from, edge.occurrences[0].to);
  const start = Math.min(...outgoing.keys()), result = [start];
  let current = start;
  for (let step = 0; step <= component.length; step += 1) {
    current = outgoing.get(current);
    if (current === undefined) return null;
    result.push(current);
    if (current === start) return result;
  }
  return null;
}

function topologyEvidence(component, canonical, winding) {
  return {
    orderedVertexIndices: canonical || [...new Set(component.flatMap((edge) => [edge.a, edge.b]))].sort((a, b) => a - b),
    windingVertexIndices: winding || [],
    undirectedEdges: component.map((edge) => [edge.a, edge.b]),
  };
}

async function componentRecord(topology, shell, component) {
  const baseReasons = [...shell.rejectionReasons, ...structuralReasons(component)];
  const canonical = baseReasons.length ? null : canonicalCycle(component);
  const winding = baseReasons.length ? null : windingCycle(component);
  if (!baseReasons.length && (!canonical || !winding)) baseReasons.push('AMBIGUOUS_WINDING');
  const orderedTopology = topologyEvidence(component, canonical, winding);
  const body = { geometryObjectId: topology.geometryObjectId, shellId: shell.shellId,
    orderedVertexIndices: orderedTopology.orderedVertexIndices,
    undirectedEdges: orderedTopology.undirectedEdges };
  const boundaryLoopId = await evidenceId('FbxBoundaryLoop.v1', 'boundary-loop', body);
  return { boundaryLoopId, shellId: shell.shellId, geometryObjectId: topology.geometryObjectId,
    orderedTopology, rejectionReasons: sortedReasons(baseReasons) };
}

async function shellDiagnostic(topology, shell) {
  const component = shell.edges.filter((edge) => shell.rejectionReasons.length
    && (edge.incidentFaceIds.length > 2 || edge.incidentFaceIds.length !== edge.occurrences.length));
  const orderedTopology = topologyEvidence(component, null, null);
  const boundaryLoopId = await evidenceId('FbxBoundaryLoop.v1', 'boundary-loop', {
    geometryObjectId: topology.geometryObjectId, shellId: shell.shellId,
    orderedTopology, rejectionReasons: shell.rejectionReasons,
  });
  return { boundaryLoopId, shellId: shell.shellId, geometryObjectId: topology.geometryObjectId,
    orderedTopology, rejectionReasons: sortedReasons(shell.rejectionReasons) };
}

export async function deriveBoundaryLoops(topology, shells) {
  const loops = [];
  for (const shell of shells) {
    const components = edgeComponents(boundaryEdges(shell));
    if (!components.length && shell.rejectionReasons.length) loops.push(await shellDiagnostic(topology, shell));
    for (const component of components) loops.push(await componentRecord(topology, shell, component));
  }
  return loops.sort((a, b) => compareText(a.shellId, b.shellId)
    || compareText(a.boundaryLoopId, b.boundaryLoopId));
}
