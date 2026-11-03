import { normalizedNumber } from '../../zone-geometry/compare.js';

const EPSILON = 1e-12;

export const INLINE_ASSEMBLY_GEOMETRY_PROFILE = Object.freeze({
  schema: 'FbxInlineAssemblyGeometryProfile.v1',
  directionOppositionDotTolerance: 0.01,
  portAxisDotTolerance: 0.01,
  radiusCompatibilityAbsoluteMm: 0.05,
  radiusCompatibilityRatio: 0.001,
  minimumFaceToFaceMm: 0.000001,
  maximumGasketThicknessToDiameterRatio: 0.25,
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
  return magnitude > EPSILON ? scale(vector, 1 / magnitude) : null;
}

function cleanNumber(value) {
  return Math.abs(value) <= EPSILON ? 0 : normalizedNumber(value);
}

function cleanVector(value) {
  return value.map(cleanNumber);
}

function rejected(reason, residuals = {}) {
  return Object.freeze({ admitted: false, reason, residuals });
}

export function normalizeInlineAssemblyPort(candidate) {
  const centreMm = finiteVector(candidate?.centreMm);
  const outwardDirection = normalize(finiteVector(candidate?.normal) || []);
  const radiusMm = Number(candidate?.radiusMm);
  const innerRadiusMm = candidate?.innerRadiusMm == null
    ? null : Number(candidate.innerRadiusMm);
  if (!centreMm || !outwardDirection || !Number.isFinite(radiusMm) || radiusMm <= 0) return null;
  if (innerRadiusMm !== null && (!Number.isFinite(innerRadiusMm) || innerRadiusMm < 0)) return null;
  return Object.freeze({
    centreMm: cleanVector(centreMm),
    outwardDirection: cleanVector(outwardDirection),
    radiusMm: cleanNumber(radiusMm),
    diameterMm: cleanNumber(radiusMm * 2),
    innerRadiusMm: innerRadiusMm === null ? null : cleanNumber(innerRadiusMm),
  });
}

function radiusQualification(left, right, profile) {
  const differenceMm = Math.abs(left.radiusMm - right.radiusMm);
  const scaleMm = Math.max(left.radiusMm, right.radiusMm);
  const limitMm = Math.max(
    profile.radiusCompatibilityAbsoluteMm,
    scaleMm * profile.radiusCompatibilityRatio,
  );
  if (differenceMm > limitMm) {
    return rejected('PORT_RADIUS_MISMATCH', { radiusDifferenceMm: differenceMm, radiusLimitMm: limitMm });
  }
  return { admitted: true, differenceMm, limitMm };
}

function axialQualification(left, right, profile) {
  const oppositionResidual = Math.abs(dot(left.outwardDirection, right.outwardDirection) + 1);
  if (oppositionResidual > profile.directionOppositionDotTolerance) {
    return rejected('PORT_DIRECTIONS_NOT_OPPOSED', { oppositionResidual });
  }
  const spanVector = subtract(right.centreMm, left.centreMm);
  const faceToFaceMm = length(spanVector);
  if (faceToFaceMm < profile.minimumFaceToFaceMm) return rejected('FACE_TO_FACE_INVALID');
  const axis = normalize(spanVector);
  const leftAxisResidual = 1 - dot(left.outwardDirection, scale(axis, -1));
  const rightAxisResidual = 1 - dot(right.outwardDirection, axis);
  if (leftAxisResidual > profile.portAxisDotTolerance) {
    return rejected('FACE_A_AXIS_MISMATCH', { leftAxisResidual });
  }
  if (rightAxisResidual > profile.portAxisDotTolerance) {
    return rejected('FACE_L_AXIS_MISMATCH', { rightAxisResidual });
  }
  return { admitted: true, axis, faceToFaceMm, oppositionResidual,
    leftAxisResidual, rightAxisResidual };
}

function axialGeometry(family, topologyDisposition, ports, profile) {
  const radius = radiusQualification(ports[0], ports[1], profile);
  if (!radius.admitted) return radius;
  const axial = axialQualification(ports[0], ports[1], profile);
  if (!axial.admitted) return axial;
  const meanDiameterMm = ports.reduce((sum, port) => sum + port.diameterMm, 0) / ports.length;
  const thicknessRatio = axial.faceToFaceMm / meanDiameterMm;
  if (family === 'GASKET'
    && thicknessRatio > profile.maximumGasketThicknessToDiameterRatio) {
    return rejected('GASKET_THICKNESS_RATIO_EXCEEDED', { thicknessToDiameterRatio: thicknessRatio });
  }
  return Object.freeze({
    admitted: true,
    geometry: Object.freeze({
      method: 'AXIAL_INLINE_ASSEMBLY_V1',
      family,
      topologyDisposition,
      portCentreAxis: cleanVector(axial.axis),
      faceToFaceMm: cleanNumber(axial.faceToFaceMm),
      meanDiameterMm: cleanNumber(meanDiameterMm),
      thicknessToDiameterRatio: cleanNumber(thicknessRatio),
      residuals: Object.freeze({
        directionOpposition: cleanNumber(axial.oppositionResidual),
        faceAAxis: cleanNumber(axial.leftAxisResidual),
        faceLAxis: cleanNumber(axial.rightAxisResidual),
        radiusDifferenceMm: cleanNumber(radius.differenceMm),
        radiusCompatibilityMarginMm: cleanNumber(radius.limitMm - radius.differenceMm),
      }),
    }),
  });
}

function instrumentGeometry(topologyDisposition, ports) {
  const centres = ports.map((port) => port.centreMm);
  const centroid = centres[0].map((_, axis) => (
    centres.reduce((sum, centre) => sum + centre[axis], 0) / centres.length
  ));
  return Object.freeze({ admitted: true, geometry: Object.freeze({
    method: 'INSTRUMENT_PORT_SET_V1',
    family: 'INSTRUMENT',
    topologyDisposition,
    portCount: ports.length,
    centroidMm: cleanVector(centroid),
    meanDiameterMm: cleanNumber(
      ports.reduce((sum, port) => sum + port.diameterMm, 0) / ports.length),
    faceToFaceMm: ports.length === 2 ? cleanNumber(length(subtract(
      ports[1].centreMm, ports[0].centreMm))) : null,
    residuals: Object.freeze({}),
  }) });
}

export function buildInlineAssemblyGeometry(
  family,
  topologyDisposition,
  candidates,
  profile = INLINE_ASSEMBLY_GEOMETRY_PROFILE,
) {
  const ports = candidates.map(normalizeInlineAssemblyPort);
  if (ports.some((port) => port === null)) return rejected('PORT_GEOMETRY_INCOMPLETE');
  if (family === 'BLIND') {
    return Object.freeze({ admitted: true, geometry: Object.freeze({
      method: 'SINGLE_MATING_FACE_V1', family, topologyDisposition,
      portCount: 1, meanDiameterMm: ports[0].diameterMm,
      faceToFaceMm: null, residuals: Object.freeze({}),
    }) });
  }
  if (family === 'INSTRUMENT'
    && ['BENT_TWO_PORT', 'THREE_PORT'].includes(topologyDisposition)) {
    return instrumentGeometry(topologyDisposition, ports);
  }
  return axialGeometry(family, topologyDisposition, ports, profile);
}
