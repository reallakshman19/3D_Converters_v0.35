import { compareText } from './compare.js';
import { evidenceId } from './identity.js';

function createUnion(faceIds) {
  const parent = new Map(faceIds.map((id) => [id, id]));
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

function connectFaces(topology, union) {
  for (const edge of topology.edges) {
    const ids = edge.incidentFaceIds;
    for (let index = 1; index < ids.length; index += 1) union.join(ids[0], ids[index]);
  }
}

function componentMap(topology, union) {
  const groups = new Map();
  for (const face of topology.faces) {
    const root = union.find(face.faceId), group = groups.get(root) || [];
    group.push(face); groups.set(root, group);
  }
  return groups;
}

function shellEdges(topology, faceIds) {
  const admitted = new Set(faceIds);
  return topology.edges.filter((edge) => edge.incidentFaceIds.some((id) => admitted.has(id)));
}

function shellIdentityBody(topology, faces, edges) {
  const signatureCounts = new Map();
  for (const face of faces) signatureCounts.set(face.signature,
    (signatureCounts.get(face.signature) || 0) + 1);
  const faceSignatures = [...signatureCounts].sort((a, b) => compareText(a[0], b[0]))
    .map(([signature, count]) => ({ signature, count }));
  const edgeIncidence = edges.map((edge) => ({ edge: [edge.a, edge.b],
    incidentFaceSignatures: edge.incidentFaceIds.map((id) => (
      faces.find((face) => face.faceId === id)?.signature || id
    )).sort(compareText), occurrenceCount: edge.occurrences.length }));
  return { geometryObjectId: topology.geometryObjectId, faceSignatures, edgeIncidence };
}

function shellProblems(edges) {
  const reasons = new Set();
  for (const edge of edges) {
    if (edge.incidentFaceIds.length > 2) reasons.add('NON_MANIFOLD_EDGE');
    if (edge.incidentFaceIds.length !== edge.occurrences.length) reasons.add('AMBIGUOUS_EDGE_INCIDENCE');
    if (edge.a === edge.b) reasons.add('AMBIGUOUS_EDGE_INCIDENCE');
  }
  if (reasons.size) reasons.add('NON_MANIFOLD_SHELL');
  return [...reasons].sort(compareText);
}

export async function deriveConnectedShells(topology) {
  const union = createUnion(topology.faces.map((face) => face.faceId));
  connectFaces(topology, union);
  const groups = componentMap(topology, union), shells = [];
  for (const faces of groups.values()) {
    const orderedFaces = [...faces].sort((a, b) => compareText(a.faceId, b.faceId));
    const edges = shellEdges(topology, orderedFaces.map((face) => face.faceId));
    const shellId = await evidenceId('FbxBoundaryShell.v1', 'shell',
      shellIdentityBody(topology, orderedFaces, edges));
    shells.push({ shellId, faces: orderedFaces, edges, rejectionReasons: shellProblems(edges) });
  }
  return shells.sort((a, b) => compareText(a.shellId, b.shellId));
}
