import { normalizedNumber } from '../../zone-geometry/compare.js';

const NUMERIC_EPSILON = 1e-12;

export const ELBOW_GEOMETRY_PROFILE = Object.freeze({
  schema: 'FbxElbowGeometryProfile.v1',
  minimumBendAngleDeg: 0.000001,
  maximumBendAngleDeg: 179.999999,
  minimumBendRadiusMm: 0.000001,
  lineIntersectionAbsoluteMm: 0.05,
  lineIntersectionRadiusRatio: 0.001,
  tangentLengthAbsoluteMm: 0.05,
  tangentLengthRatio: 0.001,
  bendRadiusAbsoluteMm: 0.05,
  bendRadiusRatio: 0.001,
  portRadiusAbsoluteMm: 0.05,
  portRadiusRatio: 0.001,
});

function finiteVector(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const result = value.map(Number);
  return result.every(Number.isFinite) ? result : null;
}

function add(left, right) {
  return left.map((value, axis) => value + right[axis]);
}

function subtract(left, right) {
  return left.map((value, axis) => value - right[axis]);
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function dot(left, right) {
  return left.reduce((sum, value, axis) => sum + value * right[axis], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(vector) {
  return Math.hypot(...vector);
}

function normalize(vector) {
  const magnitude = length(vector);
  return magnitude > NUMERIC_EPSILON ? scale(vector, 1 / magnitude) : null;
}

function cleanNumber(value) {
  return Math.abs(value) <= NUMERIC_EPSILON ? 0 : normalizedNumber(value);
}

function normalizedVector(vector) {
  return vector.map(cleanNumber);
}

function residualLimit(absoluteMm, ratio, scaleMm) {
  return Math.max(absoluteMm, Math.abs(scaleMm) * ratio);
}

function rejected(reason, residuals = {}) {
  return { admitted: false, reason, residuals };
}

function portGeometry(port) {
  const centreMm = finiteVector(port?.centreMm);
  const normal = normalize(finiteVector(port?.normal) || []);
  const radiusMm = Number(port?.radiusMm);
  if (!centreMm || !normal || !Number.isFinite(radiusMm) || radiusMm <= 0) return null;
  return { centreMm, normal, radiusMm };
}

export function normalizeElbowPortEvidence(port) {
  const geometry = portGeometry(port);
  if (!geometry) return null;
  const innerRadiusMm = port.innerRadiusMm === null || port.innerRadiusMm === undefined
    ? null : Number(port.innerRadiusMm);
  if (innerRadiusMm !== null && (!Number.isFinite(innerRadiusMm) || innerRadiusMm < 0)) return null;
  return {
    centreMm: normalizedVector(geometry.centreMm),
    outwardDirection: normalizedVector(geometry.normal),
    radiusMm: cleanNumber(geometry.radiusMm),
    diameterMm: cleanNumber(geometry.radiusMm * 2),
    innerRadiusMm: innerRadiusMm === null ? null : cleanNumber(innerRadiusMm),
  };
}

function closestLinePoints(pointA, directionA, pointB, directionB) {
  const a = dot(directionA, directionA), b = dot(directionA, directionB);
  const c = dot(directionB, directionB), offset = subtract(pointA, pointB);
  const d = dot(directionA, offset), e = dot(directionB, offset);
  const denominator = a * c - b * b;
  if (Math.abs(denominator) <= NUMERIC_EPSILON) return null;
  const parameterA = (b * e - c * d) / denominator;
  const parameterB = (a * e - b * d) / denominator;
  const closestA = add(pointA, scale(directionA, parameterA));
  const closestB = add(pointB, scale(directionB, parameterB));
  return { parameterA, parameterB, closestA, closestB };
}

function meanPoint(left, right) {
  return left.map((value, axis) => (value + right[axis]) / 2);
}

function angleGeometry(portA, portB) {
  const travelA = scale(portA.normal, -1), travelB = portB.normal;
  const cosine = Math.max(-1, Math.min(1, dot(travelA, travelB)));
  const angleRad = Math.acos(cosine);
  return { travelA, travelB, angleRad, angleDeg: angleRad * 180 / Math.PI };
}

function radiusCompatibility(portA, portB, profile) {
  const residualMm = Math.abs(portA.radiusMm - portB.radiusMm);
  const scaleMm = Math.max(portA.radiusMm, portB.radiusMm);
  const limitMm = residualLimit(profile.portRadiusAbsoluteMm, profile.portRadiusRatio, scaleMm);
  return { residualMm, limitMm, compatible: residualMm <= limitMm };
}

function tangentGeometry(portA, portB, angle, profile) {
  const pair = closestLinePoints(
    portA.centreMm, angle.travelA, portB.centreMm, scale(angle.travelB, -1),
  );
  if (!pair) return rejected('TANGENT_LINES_PARALLEL');
  if (pair.parameterA <= 0 || pair.parameterB <= 0) {
    return rejected('TANGENT_INTERSECTION_OUTSIDE');
  }
  const lineResidualMm = length(subtract(pair.closestA, pair.closestB));
  const lineLimitMm = residualLimit(profile.lineIntersectionAbsoluteMm,
    profile.lineIntersectionRadiusRatio, Math.max(portA.radiusMm, portB.radiusMm));
  if (lineResidualMm > lineLimitMm) {
    return rejected('TANGENT_INTERSECTION_RESIDUAL', { lineResidualMm, lineLimitMm });
  }
  return { admitted: true, pair, lineResidualMm, lineLimitMm };
}

function bendRadiusGeometry(portA, portB, angle, tangent, profile) {
  const tangentResidualMm = Math.abs(tangent.pair.parameterA - tangent.pair.parameterB);
  const tangentScaleMm = Math.max(tangent.pair.parameterA, tangent.pair.parameterB);
  const tangentLimitMm = residualLimit(profile.tangentLengthAbsoluteMm,
    profile.tangentLengthRatio, tangentScaleMm);
  if (tangentResidualMm > tangentLimitMm) {
    return rejected('TANGENT_LENGTH_MISMATCH', { tangentResidualMm, tangentLimitMm });
  }
  const tangentMeanMm = (tangent.pair.parameterA + tangent.pair.parameterB) / 2;
  const tangentHalf = Math.tan(angle.angleRad / 2);
  const radiusMm = tangentMeanMm / tangentHalf;
  if (!Number.isFinite(radiusMm) || radiusMm < profile.minimumBendRadiusMm) {
    return rejected('BEND_RADIUS_INVALID');
  }
  const chordMm = length(subtract(portB.centreMm, portA.centreMm));
  const chordRadiusMm = chordMm / (2 * Math.sin(angle.angleRad / 2));
  const radiusResidualMm = Math.abs(radiusMm - chordRadiusMm);
  const radiusLimitMm = residualLimit(profile.bendRadiusAbsoluteMm,
    profile.bendRadiusRatio, radiusMm);
  if (radiusResidualMm > radiusLimitMm) {
    return rejected('BEND_RADIUS_RESIDUAL', { radiusResidualMm, radiusLimitMm });
  }
  return { admitted: true, radiusMm, tangentMeanMm, tangentResidualMm,
    tangentLimitMm, chordRadiusMm, radiusResidualMm, radiusLimitMm };
}

function bendCentreGeometry(portA, portB, angle, radius, profile) {
  const planeNormal = normalize(cross(angle.travelA, angle.travelB));
  if (!planeNormal) return rejected('BEND_PLANE_DEGENERATE');
  const centreA = add(portA.centreMm, scale(cross(planeNormal, angle.travelA), radius.radiusMm));
  const centreB = add(portB.centreMm, scale(cross(planeNormal, angle.travelB), radius.radiusMm));
  const centreResidualMm = length(subtract(centreA, centreB));
  const centreLimitMm = residualLimit(profile.bendRadiusAbsoluteMm,
    profile.bendRadiusRatio, radius.radiusMm);
  if (centreResidualMm > centreLimitMm) {
    return rejected('BEND_CENTRE_RESIDUAL', { centreResidualMm, centreLimitMm });
  }
  return { admitted: true, planeNormal, centreMm: meanPoint(centreA, centreB),
    centreResidualMm, centreLimitMm };
}

export function buildElbowGeometry(portAInput, portBInput, profile = ELBOW_GEOMETRY_PROFILE) {
  const portA = portGeometry(portAInput), portB = portGeometry(portBInput);
  if (!portA || !portB) return rejected('PORT_GEOMETRY_INCOMPLETE');
  const radii = radiusCompatibility(portA, portB, profile);
  if (!radii.compatible) return rejected('PORT_RADIUS_MISMATCH', radii);
  const angle = angleGeometry(portA, portB);
  if (angle.angleDeg <= profile.minimumBendAngleDeg
    || angle.angleDeg >= profile.maximumBendAngleDeg) return rejected('BEND_ANGLE_OUT_OF_RANGE');
  const tangent = tangentGeometry(portA, portB, angle, profile);
  if (!tangent.admitted) return tangent;
  const radius = bendRadiusGeometry(portA, portB, angle, tangent, profile);
  if (!radius.admitted) return radius;
  const centre = bendCentreGeometry(portA, portB, angle, radius, profile);
  if (!centre.admitted) return centre;
  return {
    admitted: true,
    geometry: {
      method: 'TANGENT_INTERSECTION_CIRCULAR_ARC_V1',
      angleDeg: cleanNumber(angle.angleDeg),
      centreMm: normalizedVector(centre.centreMm),
      radiusMm: cleanNumber(radius.radiusMm),
      planeNormal: normalizedVector(centre.planeNormal),
      tangentIntersectionMm: normalizedVector(meanPoint(tangent.pair.closestA, tangent.pair.closestB)),
      tangentLengthsMm: [tangent.pair.parameterA, tangent.pair.parameterB].map(cleanNumber),
      residuals: {
        lineIntersectionMm: cleanNumber(tangent.lineResidualMm),
        tangentLengthMm: cleanNumber(radius.tangentResidualMm),
        bendRadiusMm: cleanNumber(radius.radiusResidualMm),
        bendCentreMm: cleanNumber(centre.centreResidualMm),
        portRadiusMm: cleanNumber(radii.residualMm),
      },
    },
  };
}
