export function buildAutoBendOverlayContract({ bends = [], coordinateMapper = null, sourceKind = 'unknown' } = {}) {
  return {
    name: '__NON_PRIMITIVE_AUTO_BEND_OVERLAY__',
    userData: { overlayKind: 'auto-bend', sourceKind },
    children: bends.map((bend) => ({
      name: `auto-bend:${bend.nodeId}`,
      kind: 'auto-bend-contract',
      points: sampleBendArc(bend, 24).map((point) => coordinateMapper?.mapPoint ? coordinateMapper.mapPoint(point).mappedPoint : point),
      userData: {
        overlayKind: 'auto-bend',
        nodeId: bend.nodeId,
        segmentAId: bend.segmentAId,
        segmentBId: bend.segmentBId,
        radiusMm: bend.radiusMm,
        turnAngleDeg: bend.turnAngleDeg,
        source: bend.source,
        warnings: bend.warnings,
      },
    })),
  };
}

export function sampleBendArc(bend, count = 24) {
  const center = bend.center;
  const rA = normalize(sub(bend.tangentA, center));
  const rB = normalize(sub(bend.tangentB, center));
  if (!rA || !rB) return [];
  const angle = signedAngleAroundNormal(rA, rB, bend.planeNormal);
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const rotated = rotateVectorAroundAxis(rA, bend.planeNormal, angle * (i / count));
    points.push(add(center, scale(rotated, bend.radiusMm)));
  }
  return points;
}

function signedAngleAroundNormal(a, b, normal) {
  const unsigned = Math.acos(clamp(dot(a, b), -1, 1));
  const sign = dot(normalize(normal) || { x: 0, y: 1, z: 0 }, cross(a, b)) >= 0 ? 1 : -1;
  return unsigned * sign;
}

function rotateVectorAroundAxis(v, axisValue, angle) {
  const axis = normalize(axisValue) || { x: 0, y: 1, z: 0 };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(add(scale(v, cos), scale(cross(axis, v), sin)), scale(axis, dot(axis, v) * (1 - cos)));
}

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function length(a) { return Math.sqrt(dot(a, a)); }
function normalize(a) { const len = length(a || {}); return len > 1e-9 ? scale(a, 1 / len) : null; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
