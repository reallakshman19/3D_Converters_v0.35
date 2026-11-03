export function normalizeBbox(values) {
  if (!Array.isArray(values) || values.length < 6) return null;
  const [x1, y1, z1, x2, y2, z2] = values.slice(0, 6).map(Number);
  if (![x1, y1, z1, x2, y2, z2].every(Number.isFinite)) return null;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2), Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)];
}

export function bboxDimensions(bbox) {
  const box = normalizeBbox(bbox) || [0, 0, 0, 0, 0, 0];
  return { x: Math.abs(box[3] - box[0]), y: Math.abs(box[4] - box[1]), z: Math.abs(box[5] - box[2]) };
}

export function bboxCorners(bbox) {
  const box = normalizeBbox(bbox);
  if (!box) return [];
  const [minX, minY, minZ, maxX, maxY, maxZ] = box;
  const out = [];
  for (const x of [minX, maxX]) for (const y of [minY, maxY]) for (const z of [minZ, maxZ]) out.push({ x, y, z });
  return out;
}

export function transformPoint3x4(matrix3x4, point) {
  const m = matrix3x4;
  return {
    x: m[0] * point.x + m[3] * point.y + m[6] * point.z + m[9],
    y: m[1] * point.x + m[4] * point.y + m[7] * point.z + m[10],
    z: m[2] * point.x + m[5] * point.y + m[8] * point.z + m[11],
  };
}

export function transformLocalBbox(matrix3x4, localBbox) {
  if (!isMatrix3x4(matrix3x4)) return null;
  const points = bboxCorners(localBbox).map((point) => transformPoint3x4(matrix3x4, point));
  return normalizeBboxFromPoints(points);
}

export function normalizeBboxFromPoints(points) {
  const valid = (points || []).filter((point) => point && ['x', 'y', 'z'].every((key) => Number.isFinite(point[key])));
  if (!valid.length) return null;
  return [
    Math.min(...valid.map((p) => p.x)), Math.min(...valid.map((p) => p.y)), Math.min(...valid.map((p) => p.z)),
    Math.max(...valid.map((p) => p.x)), Math.max(...valid.map((p) => p.y)), Math.max(...valid.map((p) => p.z)),
  ];
}

export function columnScales(matrix3x4) {
  if (!isMatrix3x4(matrix3x4)) return [NaN, NaN, NaN];
  return [
    Math.hypot(matrix3x4[0], matrix3x4[1], matrix3x4[2]),
    Math.hypot(matrix3x4[3], matrix3x4[4], matrix3x4[5]),
    Math.hypot(matrix3x4[6], matrix3x4[7], matrix3x4[8]),
  ];
}

export function isMatrix3x4(value) {
  return Array.isArray(value) && value.length === 12 && value.every((item) => Number.isFinite(item) && Math.abs(item) < 1e12);
}

export function isFiniteBbox(value) {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5];
}
