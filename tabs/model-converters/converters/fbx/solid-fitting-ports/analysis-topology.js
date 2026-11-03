import { compareText } from '../zone-geometry/compare.js';

const NEIGHBOURS = Object.freeze(Array.from({ length: 27 }, (_, index) => [
  Math.floor(index / 9) - 1, Math.floor((index % 9) / 3) - 1, (index % 3) - 1,
]));

function comparePoint(left, right) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (left.point[axis] !== right.point[axis]) return left.point[axis] - right.point[axis];
  }
  return left.index - right.index;
}

function boundsDiagonal(points) {
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis += 1) {
    minimum[axis] = Math.min(minimum[axis], point[axis]);
    maximum[axis] = Math.max(maximum[axis], point[axis]);
  }
  return Math.hypot(...minimum.map((value, axis) => maximum[axis] - value));
}

function toleranceFor(points, profile) {
  const scaled = boundsDiagonal(points) * profile.vertexMergeRelativeTolerance;
  return Math.max(profile.vertexMergeAbsoluteMm, scaled);
}

function cellFor(point, tolerance) {
  return point.map((value) => Math.floor(value / tolerance));
}

function cellKey(cell) { return cell.join(':'); }
function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function nearbyGroups(cell, buckets) {
  const groups = new Set();
  for (const offset of NEIGHBOURS) {
    const key = cellKey(cell.map((value, axis) => value + offset[axis]));
    for (const group of buckets.get(key) || []) groups.add(group);
  }
  return [...groups];
}

function chooseGroup(point, groups, tolerance) {
  const eligible = groups.map((group) => ({ group, residual: distance(point, group.point) }))
    .filter((item) => item.residual <= tolerance)
    .sort((a, b) => a.residual - b.residual || a.group.analysisIndex - b.group.analysisIndex);
  return eligible[0] || null;
}

function buildVertexGroups(points, tolerance) {
  const ordered = points.map((point, index) => ({ point, index })).sort(comparePoint);
  const groups = [], sourceToAnalysis = Array(points.length), buckets = new Map();
  let maximumMergeResidualMm = 0;
  for (const item of ordered) {
    const cell = cellFor(item.point, tolerance);
    const match = chooseGroup(item.point, nearbyGroups(cell, buckets), tolerance);
    if (match) {
      match.group.sourceVertexIndices.push(item.index);
      sourceToAnalysis[item.index] = match.group.analysisIndex;
      maximumMergeResidualMm = Math.max(maximumMergeResidualMm, match.residual);
      continue;
    }
    const group = { analysisIndex: groups.length, point: [...item.point], sourceVertexIndices: [item.index] };
    groups.push(group); sourceToAnalysis[item.index] = group.analysisIndex;
    const key = cellKey(cell), entries = buckets.get(key) || [];
    entries.push(group); buckets.set(key, entries);
  }
  return { groups, sourceToAnalysis, maximumMergeResidualMm };
}

function rotations(values) {
  return values.map((_, start) => values.slice(start).concat(values.slice(0, start)));
}

function minimumRotation(values) {
  return rotations(values).sort((left, right) => {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return 0;
  })[0] || [];
}

function normalizedVertices(vertices) {
  const result = [];
  for (const vertex of vertices) if (result.at(-1) !== vertex) result.push(vertex);
  if (result.length > 1 && result[0] === result.at(-1)) result.pop();
  return result;
}

function faceIdentity(vertices) {
  const forward = minimumRotation(vertices), reverse = minimumRotation([...vertices].reverse());
  const canonical = (() => {
    for (let index = 0; index < forward.length; index += 1) {
      if (forward[index] < reverse[index]) return forward;
      if (forward[index] > reverse[index]) return reverse;
    }
    return forward;
  })();
  return { signature: canonical.join(','), orientedKey: forward.join(',') };
}

function projectFaces(faces, sourceToAnalysis) {
  const projected = [], degenerateFaceIds = [];
  for (const face of faces) {
    const vertices = normalizedVertices(face.vertices.map((index) => sourceToAnalysis[index]));
    if (vertices.length < 3 || new Set(vertices).size < 3) {
      degenerateFaceIds.push(face.faceId); continue;
    }
    const identity = faceIdentity(vertices);
    projected.push({ ...face, vertices, signature: identity.signature, orientedKey: identity.orientedKey });
  }
  return { projected, degenerateFaceIds: degenerateFaceIds.sort(compareText) };
}

function deduplicateFaces(faces) {
  const ordered = [...faces].sort((a, b) => compareText(a.signature, b.signature)
    || compareText(a.orientedKey, b.orientedKey) || compareText(a.faceId, b.faceId));
  const kept = [], duplicateFaceIds = [], seen = new Set();
  for (const face of ordered) {
    if (seen.has(face.signature)) { duplicateFaceIds.push(face.faceId); continue; }
    seen.add(face.signature); kept.push(face);
  }
  return { faces: kept, duplicateFaceIds: duplicateFaceIds.sort(compareText) };
}

function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

function buildEdges(faces) {
  const edges = new Map();
  for (const face of faces) for (let corner = 0; corner < face.vertices.length; corner += 1) {
    const from = face.vertices[corner], to = face.vertices[(corner + 1) % face.vertices.length];
    const key = edgeKey(from, to), edge = edges.get(key) || {
      key, a: Math.min(from, to), b: Math.max(from, to), occurrences: [], incidentFaceIds: new Set(),
    };
    edge.occurrences.push({ faceId: face.faceId, from, to, corner });
    edge.incidentFaceIds.add(face.faceId); edges.set(key, edge);
  }
  return [...edges.values()].map((edge) => ({ ...edge,
    incidentFaceIds: [...edge.incidentFaceIds].sort(compareText),
    occurrences: edge.occurrences.sort((a, b) => compareText(a.faceId, b.faceId)
      || a.corner - b.corner || a.from - b.from || a.to - b.to),
  })).sort((a, b) => a.a - b.a || a.b - b.b);
}

export function buildSolidFittingAnalysisTopology(topology, profile) {
  const toleranceMm = toleranceFor(topology.points, profile);
  const grouped = buildVertexGroups(topology.points, toleranceMm);
  const projected = projectFaces(topology.faces, grouped.sourceToAnalysis);
  const deduplicated = deduplicateFaces(projected.projected);
  const points = grouped.groups.map((group) => group.point);
  return Object.freeze({
    topology: Object.freeze({
      geometryObjectId: topology.geometryObjectId, sourceObjectId: topology.sourceObjectId,
      points, faces: deduplicated.faces, edges: buildEdges(deduplicated.faces),
    }),
    evidence: Object.freeze({
      method: 'POSITION_WELD_AND_FACE_DEDUP_V1', toleranceMm,
      sourceVertexCount: topology.points.length, analysisVertexCount: points.length,
      mergedVertexCount: topology.points.length - points.length,
      maximumMergeResidualMm: grouped.maximumMergeResidualMm,
      sourceFaceCount: topology.faces.length, analysisFaceCount: deduplicated.faces.length,
      degenerateFaceIds: projected.degenerateFaceIds,
      duplicateFaceIds: deduplicated.duplicateFaceIds,
      vertexGroups: grouped.groups.filter((group) => group.sourceVertexIndices.length > 1)
        .map((group) => ({ analysisVertexIndex: group.analysisIndex,
          sourceVertexIndices: [...group.sourceVertexIndices].sort((a, b) => a - b) })),
    }),
  });
}
