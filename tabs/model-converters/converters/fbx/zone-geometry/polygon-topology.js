import { compareNumberArrays, compareText } from './compare.js';
import { failZoneGeometry } from './errors.js';
import { ZONE_GEOMETRY_STATUS } from './constants.js';

function bytesFor(selection, role) {
  const item = selection.buffers.find((entry) => entry.role === role);
  if (!item) failZoneGeometry(ZONE_GEOMETRY_STATUS.TOPOLOGY, `Missing ${role} buffer.`);
  return item.buffer.bytes;
}

function rotations(values) {
  return values.map((_, start) => values.slice(start).concat(values.slice(0, start)));
}

function minimumRotation(values) {
  return rotations(values).sort(compareNumberArrays)[0] || [];
}

function faceIdentity(vertices) {
  const forward = minimumRotation(vertices);
  const reverse = minimumRotation([...vertices].reverse());
  const canonical = compareNumberArrays(forward, reverse) <= 0 ? forward : reverse;
  return { canonical, signature: canonical.join(',') };
}

function decodePoints(selection) {
  const view = new DataView(bytesFor(selection, 'control-points-mm'));
  return Array.from({ length: selection.geometry.controlPointCount }, (_, index) => [
    view.getFloat64((index * 3) * 8, true),
    view.getFloat64((index * 3 + 1) * 8, true),
    view.getFloat64((index * 3 + 2) * 8, true),
  ]);
}

function decodeFaces(selection) {
  const offsets = new DataView(bytesFor(selection, 'polygon-offsets'));
  const indices = new DataView(bytesFor(selection, 'polygon-vertex-indices'));
  const faces = [];
  for (let face = 0; face < selection.geometry.polygonCount; face += 1) {
    const begin = offsets.getUint32(face * 4, true);
    const end = offsets.getUint32((face + 1) * 4, true);
    const vertices = Array.from({ length: end - begin }, (_, offset) => (
      indices.getUint32((begin + offset) * 4, true)
    ));
    const identity = faceIdentity(vertices);
    faces.push({ vertices, signature: identity.signature,
      orientedKey: minimumRotation(vertices).join(',') });
  }
  return faces;
}

function assignFaceIds(faces) {
  const ordered = [...faces].sort((a, b) => compareText(a.signature, b.signature)
    || compareText(a.orientedKey, b.orientedKey));
  const counts = new Map();
  return ordered.map((face) => {
    const ordinal = counts.get(face.signature) || 0;
    counts.set(face.signature, ordinal + 1);
    return { ...face, faceId: `face:${face.signature}:${ordinal}` };
  });
}

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function edgeRecords(faces) {
  const edges = new Map();
  for (const face of faces) {
    for (let corner = 0; corner < face.vertices.length; corner += 1) {
      const from = face.vertices[corner], to = face.vertices[(corner + 1) % face.vertices.length];
      const key = edgeKey(from, to), edge = edges.get(key) || { key, a: Math.min(from, to),
        b: Math.max(from, to), occurrences: [], incidentFaceIds: new Set() };
      edge.occurrences.push({ faceId: face.faceId, from, to, corner });
      edge.incidentFaceIds.add(face.faceId); edges.set(key, edge);
    }
  }
  return [...edges.values()].map((edge) => ({ ...edge,
    incidentFaceIds: [...edge.incidentFaceIds].sort(compareText),
    occurrences: edge.occurrences.sort((a, b) => compareText(a.faceId, b.faceId)
      || a.corner - b.corner || a.from - b.from || a.to - b.to),
  })).sort((a, b) => a.a - b.a || a.b - b.b);
}

export function decodeExactPolygonTopology(selection) {
  const points = decodePoints(selection), faces = assignFaceIds(decodeFaces(selection));
  return Object.freeze({
    geometryObjectId: selection.geometry.geometryObjectId,
    sourceObjectId: selection.geometry.sourceObjectId,
    points,
    faces,
    edges: edgeRecords(faces),
  });
}
