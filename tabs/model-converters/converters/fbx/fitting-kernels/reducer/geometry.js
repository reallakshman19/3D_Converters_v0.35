import { normalizedNumber } from '../../zone-geometry/compare.js';

const NUMERIC_EPSILON = 1e-12;

export const REDUCER_GEOMETRY_PROFILE = Object.freeze({
  schema: 'FbxReducerGeometryProfile.v1',
  directionOppositionDotTolerance: 0.01,
  portAxisDotTolerance: 0.01,
  radiusOrderAbsoluteMm: 0.05,
  radiusOrderRatio: 0.001,
  minimumAxialLengthMm: 0.000001,
  minimumHalfAngleDeg: 0.000001,
  maximumHalfAngleDeg: 89.999999,
});

function finiteVector(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const result = value.map(Number);
  return result.every(Number.isFinite) ? result : null;
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

function cleanVector(vector) {
  return vector.map(cleanNumber);
}

function rejected(reason, residuals = {}) {
  return { admitted: false, reason, residuals };
}

function portGeometry(port) {
  const centreMm = finiteVector(port?.centreMm);
  const outwardDirection = normalize(finiteVector(port?.normal) || []);
  const radiusMm = Number(port?.radiusMm);
  if (!centreMm || !outwardDirection || !Number.isFinite(radiusMm) || radiusMm <= 0) return null;
  return { centreMm, outwardDirection, radiusMm };
}

export function normalizeReducerPortEvidence(port) {
  const geometry = portGeometry(port);
  if (!geometry) return null;
  const innerRadiusMm = port.innerRadiusMm === null || port.innerRadiusMm === undefined
    ? null : Number(port.innerRadiusMm);
  if (innerRadiusMm !== null && (!Number.isFinite(innerRadiusMm) || innerRadiusMm < 0)) return null;
  return {
    centreMm: cleanVector(geometry.centreMm),
    outwardDirection: cleanVector(geometry.outwardDirection),
    radiusMm: cleanNumber(geometry.radiusMm),
    diameterMm: cleanNumber(geometry.radiusMm * 2),
    innerRadiusMm: innerRadiusMm === null ? null : cleanNumber(innerRadiusMm),
  };
}

function radiusOrder(portA, portB, profile) {
  const differenceMm = Math.abs(portA.radiusMm - portB.radiusMm);
  const scaleMm = Math.max(portA.radiusMm, portB.radiusMm);
  const limitMm = Math.max(profile.radiusOrderAbsoluteMm, scaleMm * profile.radiusOrderRatio);
  if (differenceMm <= limitMm) return rejected('PORT_RADIUS_ORDER_NOT_EVIDENCED', {
    radiusDifferenceMm: differenceMm, radiusOrderLimitMm: limitMm,
  });
  const largeIndex = portA.radiusMm > portB.radiusMm ? 0 : 1;
  const large = largeIndex === 0 ? portA : portB;
  const small = largeIndex === 0 ? portB : portA;
  return { admitted: true, large, small, largeIndex, differenceMm, limitMm };
}

function directionQualification(large, small, profile) {
  const oppositionResidual = Math.abs(dot(large.outwardDirection, small.outwardDirection) + 1);
  if (oppositionResidual > profile.directionOppositionDotTolerance) {
    return rejected('PORT_DIRECTIONS_NOT_OPPOSED', { oppositionResidual });
  }
  const spanVector = subtract(small.centreMm, large.centreMm);
  const axialLengthMm = length(spanVector);
  if (axialLengthMm < profile.minimumAxialLengthMm) return rejected('AXIAL_LENGTH_INVALID');
  const axis = normalize(spanVector);
  const largeAxisResidual = 1 - dot(large.outwardDirection, scale(axis, -1));
  const smallAxisResidual = 1 - dot(small.outwardDirection, axis);
  if (largeAxisResidual > profile.portAxisDotTolerance) {
    return rejected('LARGE_END_AXIS_MISMATCH', { largeAxisResidual });
  }
  if (smallAxisResidual > profile.portAxisDotTolerance) {
    return rejected('SMALL_END_AXIS_MISMATCH', { smallAxisResidual });
  }
  return { admitted: true, axis, axialLengthMm, oppositionResidual,
    largeAxisResidual, smallAxisResidual };
}

function taperGeometry(order, direction, profile) {
  const halfAngleRad = Math.atan(order.differenceMm / direction.axialLengthMm);
  const halfAngleDeg = halfAngleRad * 180 / Math.PI;
  if (halfAngleDeg < profile.minimumHalfAngleDeg || halfAngleDeg > profile.maximumHalfAngleDeg) {
    return rejected('TAPER_ANGLE_OUT_OF_RANGE');
  }
  return {
    method: 'AXIAL_RADIUS_TAPER_V1',
    portCentreAxis: cleanVector(direction.axis),
    axialLengthMm: cleanNumber(direction.axialLengthMm),
    largeRadiusMm: cleanNumber(order.large.radiusMm),
    smallRadiusMm: cleanNumber(order.small.radiusMm),
    radiusDifferenceMm: cleanNumber(order.differenceMm),
    smallToLargeRadiusRatio: cleanNumber(order.small.radiusMm / order.large.radiusMm),
    halfAngleDeg: cleanNumber(halfAngleDeg),
    includedAngleDeg: cleanNumber(halfAngleDeg * 2),
    slantLengthMm: cleanNumber(Math.hypot(direction.axialLengthMm, order.differenceMm)),
    residuals: {
      directionOpposition: cleanNumber(direction.oppositionResidual),
      largeEndAxis: cleanNumber(direction.largeAxisResidual),
      smallEndAxis: cleanNumber(direction.smallAxisResidual),
      radiusOrderMarginMm: cleanNumber(order.differenceMm - order.limitMm),
    },
  };
}

export function buildReducerGeometry(portAInput, portBInput, profile = REDUCER_GEOMETRY_PROFILE) {
  const portA = portGeometry(portAInput), portB = portGeometry(portBInput);
  if (!portA || !portB) return rejected('PORT_GEOMETRY_INCOMPLETE');
  const order = radiusOrder(portA, portB, profile);
  if (!order.admitted) return order;
  const direction = directionQualification(order.large, order.small, profile);
  if (!direction.admitted) return direction;
  const geometry = taperGeometry(order, direction, profile);
  if (!geometry.method) return geometry;
  return { admitted: true, largeIndex: order.largeIndex, geometry };
}
