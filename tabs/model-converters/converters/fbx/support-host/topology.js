import { transformPoint, validateOccurrenceTransform } from '../transform-policy.js';
import {
  cross, dot, magnitude, subtract, triangleNormal,
} from './vector.js';

function bytesView(value, label) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error(`BLOCKED_SUPPORT_HOST_BINDING missing ${label}.`);
}

function typedView(selection, role, Type, bytesPerValue) {
  const item = selection?.buffers?.find((buffer) => buffer.role === role);
  const bytes = bytesView(item?.buffer?.bytes, role);
  if (bytes.byteLength % bytesPerValue !== 0) {
    throw new Error(`BLOCKED_SUPPORT_HOST_TOPOLOGY invalid ${role} byte length.`);
  }
  return new Type(bytes.buffer, bytes.byteOffset, bytes.byteLength / bytesPerValue);
}

export function topologyViews(selection) {
  return Object.freeze({
    points: typedView(selection, 'control-points-mm', Float64Array, 8),
    offsets: typedView(selection, 'polygon-offsets', Uint32Array, 4),
    indices: typedView(selection, 'polygon-vertex-indices', Uint32Array, 4),
  });
}

export function worldPoints(selection, occurrence) {
  validateOccurrenceTransform(occurrence);
  const { points } = topologyViews(selection);
  if (points.length % 3 !== 0) {
    throw new Error('BLOCKED_SUPPORT_HOST_TOPOLOGY invalid control-point tuple count.');
  }
  const output = [];
  for (let index = 0; index < points.length; index += 3) {
    output.push(transformPoint(occurrence.geometryMatrixMm,
      [points[index], points[index + 1], points[index + 2]]));
  }
  return output;
}

function newell(points) {
  const normal = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index], next = points[(index + 1) % points.length];
    normal[0] += (current[1] - next[1]) * (current[2] + next[2]);
    normal[1] += (current[2] - next[2]) * (current[0] + next[0]);
    normal[2] += (current[0] - next[0]) * (current[1] + next[1]);
  }
  return normal;
}

function projectionAxis(normal) {
  const absolute = normal.map(Math.abs);
  return absolute.indexOf(Math.max(...absolute));
}

function project(point, dropped) {
  if (dropped === 0) return [point[1], point[2]];
  if (dropped === 1) return [point[0], point[2]];
  return [point[0], point[1]];
}

function signedArea2(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index][0] * next[1] - next[0] * points[index][1];
  }
  return area;
}

function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1])
    - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle(point, a, b, c, sign) {
  return [
    orient(a, b, point), orient(b, c, point), orient(c, a, point),
  ].every((value) => sign * value >= -1e-12);
}

function onSegment(a, b, point) {
  return Math.min(a[0], b[0]) <= point[0] && point[0] <= Math.max(a[0], b[0])
    && Math.min(a[1], b[1]) <= point[1] && point[1] <= Math.max(a[1], b[1]);
}

function segmentsIntersect(a, b, c, d) {
  const values = [orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)];
  if (values[0] === 0 && onSegment(a, b, c)) return true;
  if (values[1] === 0 && onSegment(a, b, d)) return true;
  if (values[2] === 0 && onSegment(c, d, a)) return true;
  if (values[3] === 0 && onSegment(c, d, b)) return true;
  return Math.sign(values[0]) !== Math.sign(values[1])
    && Math.sign(values[2]) !== Math.sign(values[3]);
}

function simplePolygon(points) {
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (segmentsIntersect(points[left], points[leftNext],
        points[right], points[rightNext])) return false;
    }
  }
  return true;
}

function canonicalRing(indices) {
  const variants = [];
  for (const ring of [indices, [...indices].reverse()]) {
    for (let offset = 0; offset < ring.length; offset += 1) {
      variants.push([...ring.slice(offset), ...ring.slice(0, offset)].join(','));
    }
  }
  return variants.sort()[0];
}

function earKey(vertex, sourceIndex) {
  return `${vertex[0].toPrecision(17)}|${vertex[1].toPrecision(17)}`
    + `|${String(sourceIndex).padStart(12, '0')}`;
}

function earCandidates(remaining, projected, sign) {
  const result = [];
  for (let index = 0; index < remaining.length; index += 1) {
    const previous = remaining[(index + remaining.length - 1) % remaining.length];
    const current = remaining[index], next = remaining[(index + 1) % remaining.length];
    const a = projected[previous.localIndex];
    const b = projected[current.localIndex], c = projected[next.localIndex];
    if (sign * orient(a, b, c) <= 1e-12) continue;
    const contains = remaining.some((item) => (
      item !== previous && item !== current && item !== next
      && pointInTriangle(projected[item.localIndex], a, b, c, sign)
    ));
    if (!contains) result.push({
      index, key: earKey(b, current.sourceIndex),
      triangle: [previous, current, next],
    });
  }
  return result;
}

function earClip(indices, projected) {
  const sign = Math.sign(signedArea2(projected));
  if (!sign) return null;
  const remaining = indices.map((sourceIndex, localIndex) => ({ sourceIndex, localIndex }));
  const triangles = [];
  while (remaining.length > 3) {
    const ears = earCandidates(remaining, projected, sign)
      .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
    if (!ears.length) return null;
    triangles.push(ears[0].triangle.map((item) => item.sourceIndex));
    remaining.splice(ears[0].index, 1);
  }
  triangles.push(remaining.map((item) => item.sourceIndex));
  return triangles;
}

function planar(points, normal, profile) {
  const length = magnitude(normal), unit = normal.map((value) => value / length);
  const origin = points[0];
  const diagonal = Math.max(...points.map((point) => magnitude(subtract(point, origin))));
  const tolerance = Math.max(profile.polygonPlanarityAbsoluteMm,
    profile.polygonPlanarityRatio * diagonal);
  return points.every((point) => Math.abs(dot(subtract(point, origin), unit)) <= tolerance);
}

function polygonTriangles(indices, points, profile) {
  if (indices.length < 3 || new Set(indices).size !== indices.length
      || indices.some((index) => index >= points.length)) return null;
  const polygon = indices.map((index) => points[index]);
  const normal = newell(polygon);
  if (magnitude(normal) <= profile.degenerateTriangleAreaMm2Inclusive * 2
      || !planar(polygon, normal, profile)) return null;
  const projected = polygon.map((point) => project(point, projectionAxis(normal)));
  return simplePolygon(projected) ? earClip(indices, projected) : null;
}

function triangleRecord(geometryObjectId, polygonKey, indices, points, profile) {
  const world = indices.map((index) => points[index]);
  const normal = triangleNormal(world);
  const area = magnitude(cross(subtract(world[1], world[0]), subtract(world[2], world[0]))) / 2;
  if (!normal || area <= profile.degenerateTriangleAreaMm2Inclusive) return null;
  return Object.freeze({ geometryObjectId, polygonKey,
    indices: Object.freeze([...indices]), points: Object.freeze(world), normal });
}

export function triangulateSelection(selection, occurrence, profile) {
  const topology = topologyViews(selection), points = worldPoints(selection, occurrence);
  if (topology.offsets.length < 2 || topology.offsets[0] !== 0
      || topology.offsets[topology.offsets.length - 1] !== topology.indices.length) {
    throw new Error('BLOCKED_SUPPORT_HOST_TOPOLOGY polygon offsets are invalid.');
  }
  const triangles = [], rejectedPolygonKeys = [];
  for (let polygon = 0; polygon + 1 < topology.offsets.length; polygon += 1) {
    const start = topology.offsets[polygon], end = topology.offsets[polygon + 1];
    const indices = [...topology.indices.slice(start, end)], polygonKey = canonicalRing(indices);
    const derived = polygonTriangles(indices, points, profile);
    if (!derived) { rejectedPolygonKeys.push(polygonKey); continue; }
    for (const triangle of derived) {
      const record = triangleRecord(selection.geometry.geometryObjectId,
        polygonKey, triangle, points, profile);
      if (record) triangles.push(record);
      else rejectedPolygonKeys.push(polygonKey);
    }
  }
  return Object.freeze({
    triangles: Object.freeze(triangles),
    rejectedPolygonKeys: Object.freeze([...new Set(rejectedPolygonKeys)].sort()),
    points: Object.freeze(points),
    polygonCount: topology.offsets.length - 1,
    vertexReferenceCount: topology.indices.length,
  });
}
