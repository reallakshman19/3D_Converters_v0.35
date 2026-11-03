// Shared synthetic fixtures for the independent zone-package (Phases 1-7) test suites.

// A single quad, four control points, one four-vertex polygon: a valid, minimal
// selected geometry that exercises the full buffer pipeline without needing a
// real parsed FBX source.
export function quadGeometry(geometryId, occurrenceId, sourceObjectId, offsetX = 0) {
  return {
    geometryId, occurrenceId, sourceObjectId,
    controlPointsMm: [
      0 + offsetX, 0, 0,
      10 + offsetX, 0, 0,
      10 + offsetX, 10, 0,
      0 + offsetX, 10, 0,
    ],
    polygonOffsets: [0, 4],
    polygonVertexIndices: [0, 1, 2, 3],
  };
}

// A closed tetrahedron: four triangular faces, every edge shared by exactly
// two polygons, one connected shell, zero boundary edges.
export function tetrahedronGeometry(geometryId, occurrenceId, sourceObjectId) {
  return {
    geometryId, occurrenceId, sourceObjectId,
    controlPointsMm: [0, 0, 0, 10, 0, 0, 5, 10, 0, 5, 5, 10],
    polygonOffsets: [0, 3, 6, 9, 12],
    polygonVertexIndices: [0, 1, 2, 0, 1, 3, 1, 2, 3, 2, 0, 3],
  };
}

// Two disjoint triangles: a valid multi-shell case (two connected components,
// each individually closed-boundary-free is not possible for a single
// triangle, so each shell instead contributes one open boundary loop).
export function twoTrianglesGeometry(geometryId, occurrenceId, sourceObjectId) {
  return {
    geometryId, occurrenceId, sourceObjectId,
    controlPointsMm: [0, 0, 0, 10, 0, 0, 5, 10, 0, 100, 0, 0, 110, 0, 0, 105, 10, 0],
    polygonOffsets: [0, 3, 6],
    polygonVertexIndices: [0, 1, 2, 3, 4, 5],
  };
}

// An open square tube: two four-vertex rings connected by four side quads,
// no end caps. One shell, exactly two boundary loops (top and bottom rings).
export function openTubeGeometry(geometryId, occurrenceId, sourceObjectId) {
  return {
    geometryId, occurrenceId, sourceObjectId,
    controlPointsMm: [
      0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0,
      0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10,
    ],
    polygonOffsets: [0, 4, 8, 12, 16],
    polygonVertexIndices: [
      0, 1, 5, 4,
      1, 2, 6, 5,
      2, 3, 7, 6,
      3, 0, 4, 7,
    ],
  };
}

// Two disjoint closed tetrahedra: watertight, zero boundary edges, two
// connected shells.
export function twoTetrahedraGeometry(geometryId, occurrenceId, sourceObjectId) {
  return {
    geometryId, occurrenceId, sourceObjectId,
    controlPointsMm: [
      0, 0, 0, 10, 0, 0, 5, 10, 0, 5, 5, 10,
      100, 0, 0, 110, 0, 0, 105, 10, 0, 105, 5, 10,
    ],
    polygonOffsets: [0, 3, 6, 9, 12, 15, 18, 21, 24],
    polygonVertexIndices: [
      0, 1, 2, 0, 1, 3, 1, 2, 3, 2, 0, 3,
      4, 5, 6, 4, 5, 7, 5, 6, 7, 6, 4, 7,
    ],
  };
}

// A single degenerate two-vertex "polygon": invalid topology.
export function degenerateGeometry(geometryId, occurrenceId, sourceObjectId) {
  return {
    geometryId, occurrenceId, sourceObjectId,
    controlPointsMm: [0, 0, 0, 10, 0, 0],
    polygonOffsets: [0, 2],
    polygonVertexIndices: [0, 1],
  };
}

export function sourceIdentityFixture() {
  return { sha256: 'a'.repeat(64), byteLength: 1024, fbxVersion: 7500 };
}

export const COMPLETE_SOURCE_GRAPH_SHA256 = 'b'.repeat(64);
