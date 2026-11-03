import { compareText, normalizedNumber } from '../../zone-geometry/compare.js';

const NUMERIC_EPSILON = 1e-12;

export const TEE_GEOMETRY_PROFILE = Object.freeze({
  schema: 'FbxTeeGeometryProfile.v1',
  runOppositionDotTolerance: 0.01,
  runPairAmbiguityTolerance: 1e-9,
  runAxisDotTolerance: 0.01,
  runRadiusAbsoluteMm: 0.05,
  runRadiusRatio: 0.001,
  branchIntersectionAbsoluteMm: 0.05,
  branchIntersectionRadiusRatio: 0.001,
  runExtentAbsoluteMm: 0.05,
  runExtentRadiusRatio: 0.001,
  minimumBranchAngleDeg: 0.000001,
  maximumBranchAngleDeg: 90,
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

function residualLimit(absoluteMm, ratio, scaleMm) {
  return Math.max(absoluteMm, Math.abs(scaleMm) * ratio);
}

function rejected(reason, residuals = {}) {
  return { admitted: false, reason, residuals };
}

function portGeometry(port) {
  if (!port?.portEvidenceId) return null;
  const centreMm = finiteVector(port.centreMm);
  const normal = normalize(finiteVector(port?.normal) || []);
  const radiusMm = Number(port?.radiusMm);
  if (!centreMm || !normal || !Number.isFinite(radiusMm) || radiusMm <= 0) return null;
  return { ...port, centreMm, normal, radiusMm };
}

export function normalizeTeePortEvidence(port) {
  const geometry = portGeometry(port);
  if (!geometry) return null;
  const innerRadiusMm = port.innerRadiusMm === null || port.innerRadiusMm === undefined
    ? null : Number(port.innerRadiusMm);
  if (innerRadiusMm !== null && (!Number.isFinite(innerRadiusMm) || innerRadiusMm < 0)) return null;
  return {
    centreMm: cleanVector(geometry.centreMm),
    outwardDirection: cleanVector(geometry.normal),
    radiusMm: cleanNumber(geometry.radiusMm),
    diameterMm: cleanNumber(geometry.radiusMm * 2),
    innerRadiusMm: innerRadiusMm === null ? null : cleanNumber(innerRadiusMm),
  };
}

function pairIdentity(pair) {
  return pair.ports.map((port) => String(port.portEvidenceId)).sort(compareText).join('|');
}

function runPairCandidates(ports) {
  const pairs = [];
  for (let left = 0; left < ports.length; left += 1) {
    for (let right = left + 1; right < ports.length; right += 1) {
      pairs.push({ ports: [ports[left], ports[right]], oppositionResidual: 1 + dot(ports[left].normal, ports[right].normal) });
    }
  }
  return pairs.sort((a, b) => a.oppositionResidual - b.oppositionResidual
    || compareText(pairIdentity(a), pairIdentity(b)));
}

function selectRunPair(ports, profile) {
  const pairs = runPairCandidates(ports);
  const [best, second] = pairs;
  if (!best || best.oppositionResidual > profile.runOppositionDotTolerance) {
    return rejected('RUN_PAIR_NOT_OPPOSED', { runOpposition: best?.oppositionResidual ?? null });
  }
  if (second && second.oppositionResidual - best.oppositionResidual
    <= profile.runPairAmbiguityTolerance) {
    return rejected('AMBIGUOUS_RUN_PAIR', {
      runOpposition: best.oppositionResidual,
      secondRunOpposition: second.oppositionResidual,
    });
  }
  const branch = ports.find((port) => !best.ports.includes(port));
  return { admitted: true, runPorts: best.ports, branch, oppositionResidual: best.oppositionResidual };
}

function canonicalAxis(vector) {
  const unit = normalize(vector);
  if (!unit) return null;
  const first = unit.find((value) => Math.abs(value) > NUMERIC_EPSILON);
  return first < 0 ? scale(unit, -1) : unit;
}

function orderedRunPorts(runPorts) {
  const axis = canonicalAxis(subtract(runPorts[1].centreMm, runPorts[0].centreMm));
  if (!axis) return null;
  const ordered = [...runPorts].sort((left, right) => dot(left.centreMm, axis) - dot(right.centreMm, axis)
    || compareText(left.portEvidenceId, right.portEvidenceId));
  return { axis, negative: ordered[0], positive: ordered[1] };
}

function runGeometry(runSelection, profile) {
  const ordered = orderedRunPorts(runSelection.runPorts);
  if (!ordered) return rejected('RUN_SPAN_INVALID');
  const spanMm = length(subtract(ordered.positive.centreMm, ordered.negative.centreMm));
  if (spanMm <= NUMERIC_EPSILON) return rejected('RUN_SPAN_INVALID');
  const negativeResidual = Math.abs(dot(ordered.negative.normal, ordered.axis) + 1);
  const positiveResidual = Math.abs(dot(ordered.positive.normal, ordered.axis) - 1);
  if (Math.max(negativeResidual, positiveResidual) > profile.runAxisDotTolerance) {
    return rejected('RUN_PORT_AXIS_MISMATCH', { negativeAxis: negativeResidual, positiveAxis: positiveResidual });
  }
  return { admitted: true, ...ordered, spanMm, negativeResidual, positiveResidual };
}

function runRadiusGeometry(run, profile) {
  const residualMm = Math.abs(run.negative.radiusMm - run.positive.radiusMm);
  const scaleMm = Math.max(run.negative.radiusMm, run.positive.radiusMm);
  const limitMm = residualLimit(profile.runRadiusAbsoluteMm, profile.runRadiusRatio, scaleMm);
  if (residualMm > limitMm) return rejected('RUN_RADIUS_MISMATCH', { runRadiusMm: residualMm, runRadiusLimitMm: limitMm });
  return { admitted: true, residualMm, limitMm, meanRadiusMm: (run.negative.radiusMm + run.positive.radiusMm) / 2 };
}

function closestLinePoints(pointA, directionA, pointB, directionB) {
  const a = dot(directionA, directionA), b = dot(directionA, directionB);
  const c = dot(directionB, directionB), offset = subtract(pointA, pointB);
  const d = dot(directionA, offset), e = dot(directionB, offset);
  const denominator = a * c - b * b;
  if (Math.abs(denominator) <= NUMERIC_EPSILON) return null;
  const parameterA = (b * e - c * d) / denominator;
  const parameterB = (a * e - b * d) / denominator;
  return {
    parameterA,
    parameterB,
    closestA: add(pointA, scale(directionA, parameterA)),
    closestB: add(pointB, scale(directionB, parameterB)),
  };
}

function branchGeometry(run, branch, radius, profile) {
  const pair = closestLinePoints(run.negative.centreMm, run.axis, branch.centreMm, scale(branch.normal, -1));
  if (!pair) return rejected('BRANCH_AXIS_PARALLEL');
  const intersectionResidualMm = length(subtract(pair.closestA, pair.closestB));
  const scaleMm = Math.max(radius.meanRadiusMm, branch.radiusMm);
  const intersectionLimitMm = residualLimit(profile.branchIntersectionAbsoluteMm,
    profile.branchIntersectionRadiusRatio, scaleMm);
  if (intersectionResidualMm > intersectionLimitMm) {
    return rejected('BRANCH_INTERSECTION_RESIDUAL', { branchIntersectionMm: intersectionResidualMm, branchIntersectionLimitMm: intersectionLimitMm });
  }
  const extentResidualMm = Math.max(0, -pair.parameterA, pair.parameterA - run.spanMm);
  const extentLimitMm = residualLimit(profile.runExtentAbsoluteMm, profile.runExtentRadiusRatio, run.spanMm);
  if (pair.parameterB <= 0 || extentResidualMm > extentLimitMm) {
    return rejected('BRANCH_INTERSECTION_OUTSIDE', { runExtentMm: extentResidualMm, runExtentLimitMm: extentLimitMm });
  }
  return { admitted: true, pair, intersectionResidualMm, extentResidualMm };
}

function branchAngleGeometry(run, branch, profile) {
  const cosine = Math.max(0, Math.min(1, Math.abs(dot(branch.normal, run.axis))));
  const angleDeg = Math.acos(cosine) * 180 / Math.PI;
  if (angleDeg < profile.minimumBranchAngleDeg || angleDeg > profile.maximumBranchAngleDeg) {
    return rejected('BRANCH_ANGLE_OUT_OF_RANGE', { branchAngleDeg: angleDeg });
  }
  return { admitted: true, angleDeg };
}

function meanPoint(left, right) {
  return left.map((value, axis) => (value + right[axis]) / 2);
}

export function buildTeeGeometry(portInputs, profile = TEE_GEOMETRY_PROFILE) {
  if (!Array.isArray(portInputs) || portInputs.length !== 3) return rejected('PORT_COUNT_MISMATCH');
  const ports = portInputs.map(portGeometry);
  if (ports.some((port) => port === null)) return rejected('PORT_GEOMETRY_INCOMPLETE');
  const selection = selectRunPair(ports, profile);
  if (!selection.admitted) return selection;
  const run = runGeometry(selection, profile);
  if (!run.admitted) return run;
  const radius = runRadiusGeometry(run, profile);
  if (!radius.admitted) return radius;
  const branch = branchGeometry(run, selection.branch, radius, profile);
  if (!branch.admitted) return branch;
  const angle = branchAngleGeometry(run, selection.branch, profile);
  if (!angle.admitted) return angle;
  return {
    admitted: true,
    roles: {
      RUN_NEGATIVE: run.negative.portEvidenceId,
      RUN_POSITIVE: run.positive.portEvidenceId,
      BRANCH: selection.branch.portEvidenceId,
    },
    geometry: {
      method: 'RUN_PAIR_INTERSECTION_V1',
      runAxis: cleanVector(run.axis),
      runSpanMm: cleanNumber(run.spanMm),
      junctionMm: cleanVector(meanPoint(branch.pair.closestA, branch.pair.closestB)),
      branchAngleDeg: cleanNumber(angle.angleDeg),
      branchToRunRadiusRatio: cleanNumber(selection.branch.radiusMm / radius.meanRadiusMm),
      residuals: {
        runOpposition: cleanNumber(selection.oppositionResidual),
        runNegativeAxis: cleanNumber(run.negativeResidual),
        runPositiveAxis: cleanNumber(run.positiveResidual),
        runRadiusMm: cleanNumber(radius.residualMm),
        branchIntersectionMm: cleanNumber(branch.intersectionResidualMm),
        runExtentMm: cleanNumber(branch.extentResidualMm),
      },
    },
  };
}
