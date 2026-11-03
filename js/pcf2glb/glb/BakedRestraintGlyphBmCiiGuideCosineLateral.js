import * as THREE from 'three';
import { applyBakedRestraintGlyph as applyBaseBakedRestraintGlyph } from './BakedRestraintGlyphBmCiiInputXmlBasicMap.js';

const EPS = 1e-8;
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const GUIDE_COLOR = 0x22c55e;

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstFinitePositive(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > EPS) return n;
  }
  return null;
}

function vectorFrom(value, fallback = X_AXIS) {
  if (value instanceof THREE.Vector3) return value.clone().normalize();
  if (Array.isArray(value)) {
    const v = new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    return v.lengthSq() > EPS ? v.normalize() : fallback.clone().normalize();
  }
  if (typeof value === 'string') {
    const parts = value.split(/[\s,;]+/).map(Number).filter(Number.isFinite);
    if (parts.length >= 3) {
      const v = new THREE.Vector3(parts[0], parts[1], parts[2]);
      return v.lengthSq() > EPS ? v.normalize() : fallback.clone().normalize();
    }
  }
  if (value && typeof value === 'object') {
    const v = new THREE.Vector3(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
    return v.lengthSq() > EPS ? v.normalize() : fallback.clone().normalize();
  }
  return fallback.clone().normalize();
}

function optionalVectorFrom(value) {
  if (value instanceof THREE.Vector3) return value.lengthSq() > EPS ? value.clone().normalize() : null;
  if (Array.isArray(value)) {
    const v = new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    return v.lengthSq() > EPS ? v.normalize() : null;
  }
  if (typeof value === 'string') {
    const parts = value.split(/[\s,;]+/).map(Number).filter(Number.isFinite);
    if (parts.length >= 3) {
      const v = new THREE.Vector3(parts[0], parts[1], parts[2]);
      return v.lengthSq() > EPS ? v.normalize() : null;
    }
  }
  if (value && typeof value === 'object') {
    const v = new THREE.Vector3(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
    return v.lengthSq() > EPS ? v.normalize() : null;
  }
  return null;
}

function rawCosineAxisFrom(object, comp = {}) {
  const data = object?.userData || {};
  const raw = { ...(comp.raw || {}), ...(comp.attributes || {}), ...(data.raw || {}) };
  const x = number(raw.XCOSINE ?? raw.xcosine ?? raw.XCosine ?? raw.xcos ?? raw.XCOS ?? raw.cosineX ?? raw.CX, null);
  const y = number(raw.YCOSINE ?? raw.ycosine ?? raw.YCosine ?? raw.ycos ?? raw.YCOS ?? raw.cosineY ?? raw.CY, null);
  const z = number(raw.ZCOSINE ?? raw.zcosine ?? raw.ZCosine ?? raw.zcos ?? raw.ZCOS ?? raw.cosineZ ?? raw.CZ, null);
  if ([x, y, z].every((v) => Number.isFinite(v))) {
    const v = new THREE.Vector3(x, y, z);
    if (v.lengthSq() > EPS) return v.normalize();
  }
  return optionalVectorFrom(raw.axis)
    || optionalVectorFrom(raw.axisGlb)
    || optionalVectorFrom(comp.axis)
    || optionalVectorFrom(comp.axisGlb)
    || optionalVectorFrom(data.restraintCosineAxis);
}

function projectPerpendicular(vector, tangent) {
  const v = vector?.clone?.().normalize?.();
  const t = tangent?.clone?.().normalize?.();
  if (!v || !t || v.lengthSq() < EPS || t.lengthSq() < EPS) return null;
  const projected = v.sub(t.clone().multiplyScalar(v.dot(t)));
  return projected.lengthSq() > EPS ? projected.normalize() : null;
}

function lateralBasisFromPipeTangent(pipeTangent) {
  const tangent = pipeTangent?.clone?.().normalize?.() || X_AXIS.clone();
  if (tangent.lengthSq() < EPS) tangent.copy(X_AXIS);

  let lateralA = projectPerpendicular(Y_AXIS, tangent);
  if (!lateralA) lateralA = projectPerpendicular(Z_AXIS, tangent) || projectPerpendicular(X_AXIS, tangent) || Y_AXIS.clone();
  lateralA.normalize();

  let lateralB = new THREE.Vector3().crossVectors(tangent, lateralA);
  if (lateralB.lengthSq() < EPS) lateralB = projectPerpendicular(X_AXIS, tangent) || Z_AXIS.clone();
  lateralB.normalize();

  return { tangent, lateralA, lateralB };
}

function signedClosestLateralAxis(cosineAxis, lateralA, lateralB) {
  const c = cosineAxis?.clone?.().normalize?.();
  if (!c || c.lengthSq() < EPS) return lateralA.clone();

  const aDot = c.dot(lateralA);
  const bDot = c.dot(lateralB);
  if (Math.abs(aDot) >= Math.abs(bDot)) return lateralA.clone().multiplyScalar(aDot < 0 ? -1 : 1).normalize();
  return lateralB.clone().multiplyScalar(bDot < 0 ? -1 : 1).normalize();
}

function material(color = GUIDE_COLOR) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.10,
    roughness: 0.42,
    metalness: 0.08,
  });
}

function orientFromY(object, direction) {
  const dir = direction?.clone?.().normalize?.();
  if (!dir || dir.lengthSq() < EPS) return;
  object.quaternion.setFromUnitVectors(UP, dir);
}

function cylinderBetween(group, name, start, end, radius, color) {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = delta.length();
  if (length < 1e-6) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 14), material(color));
  mesh.name = name;
  mesh.position.copy(start.clone().add(delta.multiplyScalar(0.5)));
  orientFromY(mesh, new THREE.Vector3().subVectors(end, start));
  group.add(mesh);
  return mesh;
}

function arrowFixedTip(group, name, tip, arrowDirection, length, color, radius) {
  const dir = arrowDirection?.clone?.().normalize?.() || X_AXIS.clone();
  if (dir.lengthSq() < EPS) return null;
  const tail = tip.clone().add(dir.clone().multiplyScalar(-length));
  const headLength = Math.min(Math.max(radius * 8.0, length * 0.30), length * 0.58);
  const shaftEnd = tip.clone().add(dir.clone().multiplyScalar(-headLength));
  cylinderBetween(group, `${name}-shaft`, tail, shaftEnd, radius, color);
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 6.0, headLength, 20), material(color));
  head.name = `${name}-head-fixed-tip`;
  head.position.copy(shaftEnd.clone().add(dir.clone().multiplyScalar(headLength * 0.5)));
  orientFromY(head, dir);
  group.add(head);
  return head;
}

function removePreviousGuideGlyphs(object) {
  const removed = [];
  for (const child of [...(object.children || [])]) {
    const name = String(child.name || '').toLowerCase();
    const isGuideGlyph = name.includes('guide') && name.includes('bm-cii') && name.includes('inputxml');
    const isOldGuideRestraint = name.includes('restraint') && name.includes('guide') && name.includes('inputxml-basic-map');
    if (isGuideGlyph || isOldGuideRestraint) {
      object.remove(child);
      removed.push(child.name || child.uuid);
    }
  }
  return removed;
}

function guideLateralAxisFromCosine(object, comp = {}) {
  const data = object?.userData || {};
  // GUIDE always has two possible lateral axes in the pipe cross-section.
  // Select one of those two axes using the raw InputXML restraint cosine.  Do
  // not use the axis-restraint label path because GUIDE is a family, while
  // X/Y/Z/+Y are direction data.
  const cosineAxis = rawCosineAxisFrom(object, comp)
    || optionalVectorFrom(data.restraintCosineAxis)
    || optionalVectorFrom(comp.axis)
    || optionalVectorFrom(comp.axisGlb)
    || Y_AXIS.clone();
  const pipeTangent = vectorFrom(
    data.pipeTangent || comp.pipeTangentGlb || comp.pipeTangent || comp.pipeAxis || comp.axisGlb,
    X_AXIS,
  );
  const basis = lateralBasisFromPipeTangent(pipeTangent);
  const selected = signedClosestLateralAxis(cosineAxis, basis.lateralA, basis.lateralB);
  return {
    axis: selected,
    pipeTangent: basis.tangent,
    lateralA: basis.lateralA,
    lateralB: basis.lateralB,
    cosineAxis,
  };
}

function pipeRadiusFromSupport(data = {}, comp = {}) {
  const radius = firstFinitePositive(
    data.supportPipeRadius,
    data.pipeRadius,
    data.radius,
    comp.supportPipeRadius,
    comp.pipeRadius,
    comp.radius,
  );
  if (radius) return radius;
  const od = firstFinitePositive(data.OutsideDiameter, data.outsideDiameter, data.OD, comp.OutsideDiameter, comp.outsideDiameter, comp.OD);
  if (od) return od / 2;
  const bore = firstFinitePositive(data.bore, data.BORE, comp.bore, comp.BORE);
  return bore ? bore / 2 : 0.03015;
}

function addGuideCosineLateralGlyph(object, comp = {}) {
  const data = object?.userData || {};
  const guide = guideLateralAxisFromCosine(object, comp);
  const lateral = guide.axis.normalize();
  // Do not apply a large minimum radius here.  GUIDE arrow tips must touch the
  // pipe OD, so the radius is the actual rendered OD/2, not a symbol scale.
  const pipeRadius = pipeRadiusFromSupport(data, comp);
  const scale = Math.max(28, number(data.renderScale, number(data.supportSymbolScale, pipeRadius * 3.0)));
  const length = scale * 0.64;
  const radius = scale * 0.044;
  const positiveTip = lateral.clone().multiplyScalar(pipeRadius);
  const negativeTip = lateral.clone().multiplyScalar(-pipeRadius);
  const id = String(data.supportRecordId || comp.id || object.name || 'guide');

  removePreviousGuideGlyphs(object);

  const group = new THREE.Group();
  group.name = `${id}-guide-cosine-lateral-inputxml-basic`;
  arrowFixedTip(group, `${id}-guide-cosine-positive-lateral`, positiveTip, lateral.clone().negate(), length, GUIDE_COLOR, radius);
  arrowFixedTip(group, `${id}-guide-cosine-negative-lateral`, negativeTip, lateral.clone(), length, GUIDE_COLOR, radius);
  group.traverse((child) => {
    child.userData = {
      ...(child.userData || {}),
      ...(data || {}),
      supportKind: 'GUIDE',
      restraintAxis: data.restraintAxis || data.AXIS || comp.axisLabel || 'N/A',
      supportPipeRadius: pipeRadius,
      supportSymbolContract: 'GUIDE=lateral-arrow-pair-from-restraint-cosine-axis-with-fixed-od-tips',
      guideLateralCosineAxis: { x: lateral.x, y: lateral.y, z: lateral.z },
      guideRestraintCosineAxis: { x: guide.cosineAxis.x, y: guide.cosineAxis.y, z: guide.cosineAxis.z },
      guidePipeLateralAxisA: { x: guide.lateralA.x, y: guide.lateralA.y, z: guide.lateralA.z },
      guidePipeLateralAxisB: { x: guide.lateralB.x, y: guide.lateralB.y, z: guide.lateralB.z },
      guideOdTouchPositiveTip: { x: positiveTip.x, y: positiveTip.y, z: positiveTip.z },
      guideOdTouchNegativeTip: { x: negativeTip.x, y: negativeTip.y, z: negativeTip.z },
      guideLateralBasis: 'select-closest-of-two-pipe-lateral-axes-from-raw-restraint-cosine; arrow-head-apexes-at-P±axis*OD/2',
      renderGlyph: 'baked-guide-cosine-lateral-inputxml-basic',
    };
  });
  object.add(group);
  object.userData = {
    ...data,
    supportKind: 'GUIDE',
    supportPipeRadius: pipeRadius,
    supportSymbolContract: 'GUIDE=lateral-arrow-pair-from-restraint-cosine-axis-with-fixed-od-tips',
    guideLateralCosineAxis: { x: lateral.x, y: lateral.y, z: lateral.z },
    guideRestraintCosineAxis: { x: guide.cosineAxis.x, y: guide.cosineAxis.y, z: guide.cosineAxis.z },
    guidePipeLateralAxisA: { x: guide.lateralA.x, y: guide.lateralA.y, z: guide.lateralA.z },
    guidePipeLateralAxisB: { x: guide.lateralB.x, y: guide.lateralB.y, z: guide.lateralB.z },
    guideOdTouchPositiveTip: { x: positiveTip.x, y: positiveTip.y, z: positiveTip.z },
    guideOdTouchNegativeTip: { x: negativeTip.x, y: negativeTip.y, z: negativeTip.z },
    guideLateralBasis: 'select-closest-of-two-pipe-lateral-axes-from-raw-restraint-cosine; arrow-head-apexes-at-P±axis*OD/2',
    renderGlyph: 'baked-guide-cosine-lateral-inputxml-basic',
    directionalSupportSymbolCount: group.children.length,
  };
}

export function applyBakedRestraintGlyph(object, comp = {}, options = {}) {
  const result = applyBaseBakedRestraintGlyph(object, comp, options);
  const kind = String(result?.userData?.supportKind || comp.kind || comp.supportKind || '').toUpperCase();
  if (kind === 'GUIDE') addGuideCosineLateralGlyph(result, comp);
  return result;
}
