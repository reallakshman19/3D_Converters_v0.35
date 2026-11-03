import * as THREE from 'three';

const EPS = 1e-8;
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = number(value);
    if (n !== null) return n;
  }
  return null;
}

function asUnitVector(value, fallback = X_AXIS) {
  if (value instanceof THREE.Vector3) {
    return value.lengthSq() > EPS ? value.clone().normalize() : fallback.clone().normalize();
  }
  if (Array.isArray(value)) {
    const v = new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    return v.lengthSq() > EPS ? v.normalize() : fallback.clone().normalize();
  }
  if (value && typeof value === 'object') {
    const v = new THREE.Vector3(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
    return v.lengthSq() > EPS ? v.normalize() : fallback.clone().normalize();
  }
  return fallback.clone().normalize();
}

export function isParallelToPipe(appliedAxis, pipeTangent, threshold = 0.92) {
  const axis = asUnitVector(appliedAxis);
  const tangent = asUnitVector(pipeTangent);
  return Math.abs(axis.dot(tangent)) >= threshold;
}

export function makePipeOdFrame({ point = new THREE.Vector3(0, 0, 0), pipeTangent = X_AXIS, pipeRadius = 1 } = {}) {
  const P = point instanceof THREE.Vector3 ? point.clone() : asUnitVector(point, new THREE.Vector3(0, 0, 0));
  const T = asUnitVector(pipeTangent, X_AXIS);
  const R = Math.max(Number(pipeRadius) || 0, 0);

  let top = UP.clone().sub(T.clone().multiplyScalar(UP.dot(T)));
  if (top.lengthSq() < EPS) top = X_AXIS.clone().sub(T.clone().multiplyScalar(X_AXIS.dot(T)));
  if (top.lengthSq() < EPS) top = Z_AXIS.clone().sub(T.clone().multiplyScalar(Z_AXIS.dot(T)));
  if (top.lengthSq() < EPS) top = X_AXIS.clone();
  top.normalize();

  let side = new THREE.Vector3().crossVectors(T, top);
  if (side.lengthSq() < EPS) side = Z_AXIS.clone().sub(T.clone().multiplyScalar(Z_AXIS.dot(T)));
  if (side.lengthSq() < EPS) side = X_AXIS.clone();
  side.normalize();

  return {
    point: P,
    pipeTangent: T,
    pipeRadius: R,
    top,
    side,
    anchors: {
      CIRCUM_TOP: P.clone().add(top.clone().multiplyScalar(R)),
      CIRCUM_BOT: P.clone().add(top.clone().multiplyScalar(-R)),
      CIRCUM_SIDE1: P.clone().add(side.clone().multiplyScalar(R)),
      CIRCUM_SIDE2: P.clone().add(side.clone().multiplyScalar(-R)),
    },
  };
}

export function restraintGapOffsetFrom({ attrs = {}, comp = {}, record = {}, options = {} } = {}) {
  const gap = firstNumber(
    record?.details?.GAP,
    record?.raw?.GAP,
    record?.raw?.Gap,
    attrs.GAP,
    attrs.Gap,
    attrs.gap,
    comp.GAP,
    comp.Gap,
    comp.gap,
  );
  if (gap === null || gap <= 0) {
    return {
      gapValue: gap,
      gapPositive: false,
      gapOffset: 0,
      gapFormula: 'none; GAP missing or <= 0',
    };
  }

  // BM_CII GLBs are authored in metres. User rule is GAP * 10 mm.
  // 10 mm = 0.01 m, therefore offset = GAP * 0.01 in this benchmark scene.
  const modelUnitsPerTenMm = Number(options.modelUnitsPerTenMm ?? options.gapModelUnitsPerTenMm ?? 0.01);
  return {
    gapValue: gap,
    gapPositive: true,
    gapOffset: gap * modelUnitsPerTenMm,
    gapFormula: 'GAP * 10mm',
    modelUnitsPerTenMm,
  };
}

export function resolveRestraintArrowContact({
  frame,
  appliedAxis,
  arrowDirection,
  gapOffset = 0,
  parallelThreshold = 0.92,
  preferredLateralAxis = null,
} = {}) {
  const pipeFrame = frame || makePipeOdFrame();
  const d = asUnitVector(arrowDirection || appliedAxis, X_AXIS);
  const axis = asUnitVector(appliedAxis || d, d);
  const T = pipeFrame.pipeTangent.clone().normalize();
  const R = pipeFrame.pipeRadius + Math.max(Number(gapOffset) || 0, 0);
  const parallel = Math.abs(axis.dot(T)) >= parallelThreshold;

  if (parallel) {
    let lateral = preferredLateralAxis ? asUnitVector(preferredLateralAxis, pipeFrame.top.clone().negate()) : pipeFrame.top.clone().negate();
    lateral = lateral.sub(T.clone().multiplyScalar(lateral.dot(T)));
    if (lateral.lengthSq() < EPS) lateral = pipeFrame.side.clone();
    lateral.normalize();
    return {
      tip: pipeFrame.point.clone().add(lateral.clone().multiplyScalar(R)),
      appliedAxis: axis,
      arrowDirection: d,
      parallelToPipe: true,
      lateralOffsetAxis: lateral,
      basePipeRadius: pipeFrame.pipeRadius,
      gapOffset: Math.max(Number(gapOffset) || 0, 0),
      offsetRadius: R,
      rule: 'parallel-to-pipe: move whole restraint arrow line to any lateral OD/2 axis, then apply GAP outward on same lateral axis',
    };
  }

  let radial = d.clone().sub(T.clone().multiplyScalar(d.dot(T)));
  if (radial.lengthSq() < EPS) radial = pipeFrame.top.clone();
  radial.normalize();
  // arrowDirection points toward the pipe. The head contact point is on the
  // opposite radial side; positive GAP moves farther away from the pipe along
  // that same outward radial side.
  const outward = radial.clone().negate();
  return {
    tip: pipeFrame.point.clone().add(outward.clone().multiplyScalar(R)),
    appliedAxis: axis,
    arrowDirection: d,
    parallelToPipe: false,
    lateralOffsetAxis: outward,
    basePipeRadius: pipeFrame.pipeRadius,
    gapOffset: Math.max(Number(gapOffset) || 0, 0),
    offsetRadius: R,
    rule: 'non-parallel: arrow head touches OD at P - radial(direction)*(OD/2), then GAP moves outward along same radial axis',
  };
}

export function resolveGuideContacts({ frame, guideAxis, gapOffset = 0 } = {}) {
  const pipeFrame = frame || makePipeOdFrame();
  const axis = asUnitVector(guideAxis, pipeFrame.side);
  const R = pipeFrame.pipeRadius + Math.max(Number(gapOffset) || 0, 0);
  return {
    positiveTip: pipeFrame.point.clone().add(axis.clone().multiplyScalar(R)),
    negativeTip: pipeFrame.point.clone().add(axis.clone().multiplyScalar(-R)),
    guideAxis: axis,
    basePipeRadius: pipeFrame.pipeRadius,
    gapOffset: Math.max(Number(gapOffset) || 0, 0),
    offsetRadius: R,
    rule: 'guide: tips on selected lateral axis at OD/2; positive GAP moves both tips farther outward along the same guide axis',
  };
}

export function plainVector(v) {
  return [Number(v.x.toFixed(6)), Number(v.y.toFixed(6)), Number(v.z.toFixed(6))];
}
