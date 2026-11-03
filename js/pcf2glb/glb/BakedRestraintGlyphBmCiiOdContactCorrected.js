import * as THREE from 'three';
import { SUPPORT_SYMBOL_COLORS, visualProfileMetadata, RESTRAINT_VISUAL_PROFILE } from './RestraintVisualProfile.js';
import { normalizeSupportRecord, supportTraceFromRecord } from './SupportRecordNormalizer.js';
import {
  makePipeOdFrame,
  plainVector,
  resolveGuideContacts,
  resolveRestraintArrowContact,
  restraintGapOffsetFrom,
} from './RestraintOdGapPlacementPolicy.js';

const EPS = 1e-8;
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ARROW_LENGTH_FACTOR = 0.64;
const ARROW_RADIUS_FACTOR = 0.044;
const SCALE_MULTIPLIER = 3.0;

function text(value) { return String(value ?? '').trim(); }
function upper(value) { return text(value).toUpperCase(); }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function positive(value) { const n = number(value); return n !== null && n > 0 ? n : null; }
function firstPositive(...values) { for (const value of values) { const n = positive(value); if (n !== null) return n; } return null; }
function attrsFrom(object, comp = {}) { return { ...(comp.raw || {}), ...(comp.attributes || {}), ...(object?.userData || {}), ...comp }; }
function sourceOf(attrs = {}, comp = {}, options = {}) {
  const raw = upper(options.supportRendering?.source || options.supportSource || comp.supportSource || comp.source || attrs.supportSource || attrs.SUPPORT_SOURCE || attrs['SUPPORT-SOURCE']);
  return raw.includes('ISONOTE') ? 'isonote' : 'inputxml';
}
function vectorFrom(value) {
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
function axisFromLabel(axisLabel = '') {
  const raw = upper(axisLabel);
  const sign = raw.startsWith('-') ? -1 : 1;
  if (raw.includes('X')) return X_AXIS.clone().multiplyScalar(sign);
  if (raw.includes('Y')) return Y_AXIS.clone().multiplyScalar(sign);
  if (raw.includes('Z')) return Z_AXIS.clone().multiplyScalar(sign);
  return null;
}
function rawCosineAxis(attrs = {}, fallbackAxis = '') {
  const x = number(attrs.XCOSINE ?? attrs.xcosine ?? attrs.XCosine ?? attrs.xcos ?? attrs.XCOS ?? attrs.cosineX ?? attrs.CX);
  const y = number(attrs.YCOSINE ?? attrs.ycosine ?? attrs.YCosine ?? attrs.ycos ?? attrs.YCOS ?? attrs.cosineY ?? attrs.CY);
  const z = number(attrs.ZCOSINE ?? attrs.zcosine ?? attrs.ZCosine ?? attrs.zcos ?? attrs.ZCOS ?? attrs.cosineZ ?? attrs.CZ);
  if ([x, y, z].every((v) => v !== null)) {
    const v = new THREE.Vector3(x, y, z);
    if (v.lengthSq() > EPS) return v.normalize();
  }
  return axisFromLabel(fallbackAxis) || X_AXIS.clone();
}
function pipeTangentFrom(attrs = {}, comp = {}, fallbackAxis = X_AXIS) {
  // InputXML-basic path: prefer raw/untransformed pipe tangent fields.
  return vectorFrom(comp.pipeTangent)
    || vectorFrom(comp.pipeAxis)
    || vectorFrom(comp.pipeDirection)
    || vectorFrom(comp.tangent)
    || vectorFrom(attrs.pipeTangent)
    || vectorFrom(attrs.pipeAxis)
    || vectorFrom(attrs.pipeDirection)
    || vectorFrom(attrs.tangent)
    || vectorFrom(attrs.PipeTangent)
    || vectorFrom(attrs.PIPE_TANGENT)
    || vectorFrom(attrs.PIPE_AXIS)
    || fallbackAxis.clone().normalize();
}
function diameterFor(attrs = {}, comp = {}) {
  return firstPositive(
    attrs.bmCiiOdTouchDiameter,
    comp.bmCiiOdTouchDiameter,
    attrs.OutsideDiameter,
    comp.OutsideDiameter,
    attrs.OUTSIDE_DIAMETER,
    comp.OUTSIDE_DIAMETER,
    attrs.outsideDiameter,
    comp.outsideDiameter,
    attrs.OD,
    comp.OD,
    attrs.od,
    comp.od,
    attrs.outerDiameter,
    comp.outerDiameter,
    attrs.DIAMETER,
    comp.DIAMETER,
    attrs.diameter,
    comp.diameter,
    attrs.bore,
    comp.bore,
    attrs.BORE,
  ) || 100;
}
function scaleFor(d, options = {}) {
  const multiplier = number(options.supportSymbolScale) || number(options.restraintSymbolScale) || 0.95;
  return Math.max(28, Math.min(190, d * multiplier)) * SCALE_MULTIPLIER;
}
function material(color) { return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.10, roughness: 0.42, metalness: 0.08 }); }
function orientFromY(object, direction) {
  const dir = direction?.clone?.().normalize?.();
  if (!dir || dir.lengthSq() < EPS) return;
  object.quaternion.setFromUnitVectors(UP, dir);
}
function cylinderBetween(group, name, start, end, radius, color, radialSegments = 14) {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = delta.length();
  if (length < 1e-6) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), material(color));
  mesh.name = name;
  mesh.position.copy(start.clone().add(delta.multiplyScalar(0.5)));
  orientFromY(mesh, new THREE.Vector3().subVectors(end, start));
  group.add(mesh);
  return mesh;
}
function coneAtTip(group, name, tip, direction, headLength, radius, color) {
  const dir = direction.clone().normalize();
  const shaftEnd = tip.clone().add(dir.clone().multiplyScalar(-headLength));
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius, headLength, 20), material(color));
  head.name = name;
  head.position.copy(shaftEnd.clone().add(dir.clone().multiplyScalar(headLength * 0.5)));
  orientFromY(head, dir);
  group.add(head);
  return head;
}
function arrowFixedTip(group, name, tip, arrowDirection, length, color, radius) {
  const dir = arrowDirection?.clone?.().normalize?.() || X_AXIS.clone();
  if (dir.lengthSq() < EPS) return;
  const headLength = Math.min(Math.max(radius * 8.0, length * 0.30), length * 0.58);
  const tail = tip.clone().add(dir.clone().multiplyScalar(-length));
  const shaftEnd = tip.clone().add(dir.clone().multiplyScalar(-headLength));
  cylinderBetween(group, `${name}-shaft`, tail, shaftEnd, radius, color, 14);
  coneAtTip(group, `${name}-head-fixed-tip`, tip, dir, headLength, radius * 6.0, color);
}
function torus(group, name, center, normal, major, minor, color) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(major, minor, 8, 28), material(color));
  mesh.name = name;
  mesh.position.copy(center);
  orientFromY(mesh, normal);
  group.add(mesh);
  return mesh;
}
function isSignedAxis(label = '') { return /^[+-][XYZ]$/i.test(text(label)); }
function hideExistingMeshes(object) {
  const hidden = [];
  for (const child of object.children || []) {
    child.traverse?.((node) => {
      if (node.isMesh) {
        node.visible = false;
        hidden.push(node.name || node.uuid);
      }
    });
  }
  return hidden;
}
function stamp(target, record, common) {
  target.userData = {
    ...(target.userData || {}),
    ...(record.details || {}),
    ...common,
    supportKind: record.kind,
    renderKind: record.renderKind || record.kind,
    supportFamily: record.family || record.details?.FAMILY || record.kind,
    restraintAxis: record.axis,
    supportRecordId: record.recordId,
    supportSymbolContract: record.supportSymbolContract,
    bmCiiTrace: supportTraceFromRecord(record, common),
  };
}
function contactPlain(contact) {
  return {
    tip: plainVector(contact.tip),
    direction: plainVector(contact.arrowDirection),
    appliedAxis: plainVector(contact.appliedAxis),
    parallelToPipe: contact.parallelToPipe,
    lateralOffsetAxis: plainVector(contact.lateralOffsetAxis),
    basePipeRadius: contact.basePipeRadius,
    gapOffset: contact.gapOffset,
    offsetRadius: contact.offsetRadius,
    rule: contact.rule,
  };
}
function buildAxis(group, id, record, frame, axis, scale, color, gapOffset) {
  const len = scale * ARROW_LENGTH_FACTOR;
  const r = scale * ARROW_RADIUS_FACTOR;
  if (isSignedAxis(record.axis)) {
    const contact = resolveRestraintArrowContact({ frame, appliedAxis: axis, arrowDirection: axis, gapOffset });
    arrowFixedTip(group, `${id}-single-axis-tip-at-od2-gap-policy`, contact.tip, axis, len, color, r);
    return [contactPlain(contact)];
  }
  const plusContact = resolveRestraintArrowContact({ frame, appliedAxis: axis, arrowDirection: axis, gapOffset });
  const minusContact = resolveRestraintArrowContact({ frame, appliedAxis: axis.clone().negate(), arrowDirection: axis.clone().negate(), gapOffset });
  arrowFixedTip(group, `${id}-axis-pair-plus-tip-at-od2-gap-policy`, plusContact.tip, axis, len, color, r);
  arrowFixedTip(group, `${id}-axis-pair-minus-tip-at-od2-gap-policy`, minusContact.tip, axis.clone().negate(), len, color, r);
  return [contactPlain(plusContact), contactPlain(minusContact)];
}
function buildAxial(group, id, record, frame, axis, scale, color, gapOffset) {
  const len = scale * ARROW_LENGTH_FACTOR;
  const r = scale * ARROW_RADIUS_FACTOR;
  if (isSignedAxis(record.axis)) {
    const contact = resolveRestraintArrowContact({ frame, appliedAxis: axis, arrowDirection: axis, gapOffset, preferredLateralAxis: frame.top.clone().negate() });
    arrowFixedTip(group, `${id}-single-axial-tip-at-od2-gap-policy`, contact.tip, axis, len, color, r);
    return [contactPlain(contact)];
  }
  const plusContact = resolveRestraintArrowContact({ frame, appliedAxis: frame.pipeTangent, arrowDirection: frame.pipeTangent, gapOffset, preferredLateralAxis: frame.top.clone().negate() });
  const minusContact = resolveRestraintArrowContact({ frame, appliedAxis: frame.pipeTangent.clone().negate(), arrowDirection: frame.pipeTangent.clone().negate(), gapOffset, preferredLateralAxis: frame.top.clone().negate() });
  arrowFixedTip(group, `${id}-axial-pair-plus-tip-at-od2-gap-policy`, plusContact.tip, frame.pipeTangent.clone(), len, color, r);
  arrowFixedTip(group, `${id}-axial-pair-minus-tip-at-od2-gap-policy`, minusContact.tip, frame.pipeTangent.clone().negate(), len, color, r);
  return [contactPlain(plusContact), contactPlain(minusContact)];
}
function buildGuide(group, id, record, frame, cosineAxis, scale, color, gapOffset) {
  const len = scale * ARROW_LENGTH_FACTOR;
  const r = scale * ARROW_RADIUS_FACTOR;
  const L1 = frame.top.clone();
  const L2 = frame.side.clone();
  const d1 = cosineAxis.dot(L1);
  const d2 = cosineAxis.dot(L2);
  let axis = Math.abs(d1) >= Math.abs(d2) ? L1.multiplyScalar(d1 >= 0 ? 1 : -1) : L2.multiplyScalar(d2 >= 0 ? 1 : -1);
  axis.normalize();
  const contacts = resolveGuideContacts({ frame, guideAxis: axis, gapOffset });
  arrowFixedTip(group, `${id}-guide-positive-lateral-tip-at-od2-gap-policy`, contacts.positiveTip, axis.clone().negate(), len, color, r);
  arrowFixedTip(group, `${id}-guide-negative-lateral-tip-at-od2-gap-policy`, contacts.negativeTip, axis.clone(), len, color, r);
  return [
    { tip: plainVector(contacts.positiveTip), direction: plainVector(axis.clone().negate()), guideAxis: plainVector(axis), gapOffset: contacts.gapOffset, offsetRadius: contacts.offsetRadius, rule: contacts.rule },
    { tip: plainVector(contacts.negativeTip), direction: plainVector(axis), guideAxis: plainVector(axis), gapOffset: contacts.gapOffset, offsetRadius: contacts.offsetRadius, rule: contacts.rule },
  ];
}
function buildSpring(group, id, frame, scale, color, gapOffset) {
  const startPoint = frame.point.clone().add(frame.top.clone().multiplyScalar(frame.pipeRadius + Math.max(gapOffset || 0, 0)));
  const start = startPoint.clone().add(UP.clone().multiplyScalar(scale * 0.18));
  const end = startPoint.clone().add(UP.clone().multiplyScalar(scale * 0.92));
  for (let i = 0; i < 7; i += 1) {
    const c = start.clone().lerp(end, i / 6);
    torus(group, `${id}-spring-coil-only-starts-at-od2-gap-policy-${i + 1}`, c, UP, scale * 0.18, scale * 0.022, color);
  }
  return [{ springReferencePointAtOD: plainVector(startPoint), gapOffset, rule: 'spring/hanger has no arrow; positive GAP moves coil reference away from pipe from CIRCUM_TOP' }];
}
function buildAnchor(group, id, frame, scale, color) {
  const thickness = Math.max(scale * 0.12, frame.pipeRadius * 0.45);
  const start = frame.point.clone().add(frame.pipeTangent.clone().multiplyScalar(-thickness * 0.5));
  const end = frame.point.clone().add(frame.pipeTangent.clone().multiplyScalar(thickness * 0.5));
  cylinderBetween(group, `${id}-anchor-flat-flow-blocking-plate-od2`, start, end, Math.max(frame.pipeRadius * 1.75, scale * 0.34), color, 32);
  return [{ plateNormal: plainVector(frame.pipeTangent), plateCoversOD: true, rule: 'anchor plate blocks flow normal to pipe tangent' }];
}

export function applyBakedRestraintGlyph(object, comp = {}, options = {}) {
  if (!object || comp.type !== 'SUPPORT') return object;
  const attrs = attrsFrom(object, comp);
  const source = sourceOf(attrs, comp, options);
  const record = normalizeSupportRecord({ ...attrs, ...comp }, { source, supportSource: source, index: comp.supportRecordIndex ?? comp.recordIndex ?? comp.index ?? comp.supportIndex });
  const diameter = diameterFor(attrs, comp);
  const radius = Math.max(diameter / 2, 5);
  const axis = axisFromLabel(record.axis) || X_AXIS.clone();
  const tangent = pipeTangentFrom(attrs, comp, axis);
  const frame = makePipeOdFrame({ pipeTangent: tangent, pipeRadius: radius });
  const gapPolicy = restraintGapOffsetFrom({ attrs, comp, record, options });
  const scale = scaleFor(diameter, options);
  const color = SUPPORT_SYMBOL_COLORS[record.kind] || SUPPORT_SYMBOL_COLORS.UNKNOWN;
  const id = text(comp.id || record.recordId || object.name || 'support');
  const group = new THREE.Group();
  group.name = `${record.recordId}-bm-cii-od2-gap-policy-${record.kind.toLowerCase()}`;
  const hidden = hideExistingMeshes(object);
  let contacts = [];
  if (record.kind === 'GUIDE') contacts = buildGuide(group, id, record, frame, rawCosineAxis(attrs, record.axis), scale, color, gapPolicy.gapOffset);
  else if (record.kind === 'LINESTOP' || record.kind === 'LIMIT') contacts = buildAxial(group, id, record, frame, axis, scale, color, gapPolicy.gapOffset);
  else if (record.kind === 'SPRING' || record.kind === 'HANGER') contacts = buildSpring(group, id, frame, scale, color, gapPolicy.gapOffset);
  else if (record.kind === 'ANCHOR') contacts = buildAnchor(group, id, frame, scale, color);
  else contacts = buildAxis(group, id, record, frame, axis, scale, color, gapPolicy.gapOffset);

  const common = {
    NODE: record.node || 'N/A',
    AXIS: record.axis || 'N/A',
    SOURCE: source,
    supportSource: source,
    supportPoint: [0, 0, 0],
    pipeTangent: plainVector(frame.pipeTangent),
    bmCiiOdTouchRadius: radius,
    bmCiiOdTouchDiameter: diameter,
    circumferenceAnchors: {
      CIRCUM_TOP: plainVector(frame.anchors.CIRCUM_TOP),
      CIRCUM_BOT: plainVector(frame.anchors.CIRCUM_BOT),
      CIRCUM_SIDE1: plainVector(frame.anchors.CIRCUM_SIDE1),
      CIRCUM_SIDE2: plainVector(frame.anchors.CIRCUM_SIDE2),
    },
    odGapPlacementPolicy: gapPolicy,
    odTouchContacts: contacts,
    renderGlyph: 'baked-bm-cii-independent-od-gap-placement-policy',
    placementContract: 'BM_CII independent policy: if applied restraint axis is parallel to pipe, offset the arrow line to a lateral OD/2 axis; if GAP>0, move contact head farther away by GAP*10mm',
    bmCiiRestraintVisualProfile: visualProfileMetadata({ kind: record.kind, source, axisLabel: record.axis, scale, role: 'baked-object-root' }),
    visualProfile: RESTRAINT_VISUAL_PROFILE.id,
    hiddenOriginalProxyMeshCount: hidden.length,
  };
  group.traverse((child) => { if (child.isMesh) stamp(child, record, common); });
  object.add(group);
  object.userData = { ...(object.userData || {}), ...(record.details || {}), ...common, supportKind: record.kind, supportRecordId: record.recordId };
  return object;
}
