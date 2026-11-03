// Shared synthetic fixtures for the solid-fitting-ports (closed-solid PIPE
// inference) test suites.

function newell(points) {
  const result = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    result[0] += (a[1] - b[1]) * (a[2] + b[2]);
    result[1] += (a[2] - b[2]) * (a[0] + b[0]);
    result[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return result;
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// A watertight N-sided prism (a faceted approximation of a straight capped
// cylinder): two N-gon end caps plus N side quads, consistently oriented so
// every face normal points outward.
export function prismGeometry(radius = 10, height = 50, sides = 8) {
  const points = [];
  for (let k = 0; k < sides; k += 1) {
    const angle = (k * 2 * Math.PI) / sides;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
  }
  for (let k = 0; k < sides; k += 1) {
    const angle = (k * 2 * Math.PI) / sides;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), height]);
  }
  const faces = [Array.from({ length: sides }, (_, i) => i),
    Array.from({ length: sides }, (_, i) => sides + i)];
  for (let k = 0; k < sides; k += 1) {
    const next = (k + 1) % sides;
    faces.push([k, next, sides + next, sides + k]);
  }
  function expectedOutward(face, index) {
    if (index === 0) return [0, 0, -1];
    if (index === 1) return [0, 0, 1];
    const pts = face.map((i) => points[i]);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const len = Math.hypot(cx, cy);
    return [cx / len, cy / len, 0];
  }
  const orientedFaces = faces.map((face, index) => (
    dot(newell(face.map((i) => points[i])), expectedOutward(face, index)) >= 0
      ? face : [...face].reverse()
  ));
  const polygonOffsets = [0], polygonVertexIndices = [];
  for (const face of orientedFaces) {
    polygonVertexIndices.push(...face);
    polygonOffsets.push(polygonVertexIndices.length);
  }
  return { controlPointsMm: points.flat(), polygonOffsets, polygonVertexIndices };
}

function float64Buffer(values) { return new Float64Array(values).buffer; }
function uint32Buffer(values) { return new Uint32Array(values).buffer; }

export function selectionFromGeometry(geometryObjectId, sourceObjectId, geometry) {
  return {
    geometry: {
      geometryObjectId, sourceObjectId,
      controlPointCount: geometry.controlPointsMm.length / 3,
      polygonCount: geometry.polygonOffsets.length - 1,
    },
    buffers: [
      { role: 'control-points-mm', buffer: { bytes: float64Buffer(geometry.controlPointsMm) } },
      { role: 'polygon-offsets', buffer: { bytes: uint32Buffer(geometry.polygonOffsets) } },
      { role: 'polygon-vertex-indices', buffer: { bytes: uint32Buffer(geometry.polygonVertexIndices) } },
    ],
  };
}

export function occurrenceFixture(sourceOccurrenceId, sourceModelObjectId, geometryObjectId, overrides = {}) {
  return {
    sourceOccurrenceId, sourceModelObjectId, geometryObjectIds: [geometryObjectId],
    geometryMatrixMm: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], inheritMode: 0, ...overrides,
  };
}
