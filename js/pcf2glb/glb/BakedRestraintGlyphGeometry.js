import * as THREE from 'three';
import {
  RESTRAINT_VISUAL_PROFILE,
  SUPPORT_SYMBOL_COLORS,
  normalizeRestraintAxisLabel,
  normalizeRestraintKind,
  visualProfileMetadata,
} from './RestraintVisualProfile.js';
import {
  normalizeSupportRecord,
  supportSymbolContractFor,
  supportTraceFromRecord,
} from './SupportRecordNormalizer.js';

const EPS = 1e-8;
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const LAYER_SCHEMA = 'bm-cii-layer/v1';
const RESTRAINT_SYMBOL_REVIEW_SCALE_MULTIPLIER = 3.0;

function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function attrsFrom(object, comp = {}) {
  return { ...(comp.raw || {}), ...(comp.attributes || {}), ...(object?.userData || {}) };
}

function vectorFrom(value) {
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

function axisVectorFromLabel(label) {
  const raw = String(label || '').toUpperCase();
  if (raw.includes('X')) return raw.startsWith('-') ? X_AXIS.clone().negate() : X_AXIS.clone();
  if (raw.includes('Y')) return raw.startsWith('-') ? Y_AXIS.clone().negate() : Y_AXIS.clone();
  if (raw.includes('Z')) return raw.startsWith('-') ? Z_AXIS.clone().negate() : Z_AXIS.clone();
  return null;
}

function axisVectorFrom(attrs = {}, comp = {}, axisLabel = '') {
  return vectorFrom(comp.supportAxis)
    || vectorFrom(attrs.supportAxis)
    || vectorFrom(attrs.SUPPORT_AXIS)
    || vectorFrom(attrs.caesarSupportAxis)
    || vectorFrom(attrs.restraintAxisVector)
    || axisVectorFromLabel(axisLabel)
    || X_AXIS.clone();
}

function pipeTangentFrom(attrs = {}, comp = {}, axis = X_AXIS, kind = '') {
  const tangent = vectorFrom(comp.pipeTangent)
    || vectorFrom(comp.pipeAxis)
    || vectorFrom(comp.pipeDirection)
    || vectorFrom(comp.tangent)
    || vectorFrom(comp.axisGlb)
    || vectorFrom(attrs.pipeTangent)
    || vectorFrom(attrs.pipeAxis)
    || vectorFrom(attrs.pipeDirection)
    || vectorFrom(attrs.tangent)
    || vectorFrom(attrs.PipeTangent)
    || vectorFrom(attrs.PIPE_TANGENT)
    || vectorFrom(attrs.PIPE_AXIS)
    || vectorFrom(attrs.pipeDirectionGlb)
    || vectorFrom(attrs.centerlineDirection)
    || vectorFrom(attrs.componentAxis);

  if (tangent) return tangent.normalize();

  // LINESTOP/LIMIT source axes are normally axial restraints, so axis is the
  // safest fallback when the exporter has not supplied pipe tangent yet.
  if (kind === 'LINESTOP' || kind === 'LIMIT') return horizontalAxisOrFallback(axis, X_AXIS);

  return horizontalAxisOrFallback(axis, X_AXIS);
}

function pipeRadiusFor(comp = {}, attrs = {}) {
  const bore = number(comp.bore ?? attrs.bore ?? attrs.BORE ?? attrs.DIAMETER ?? attrs.OutsideDiameter) || 100;
  return Math.max(bore / 2, 5);
}

function supportScaleFor(comp = {}, attrs = {}, options = {}) {
  const bore = number(comp.bore ?? attrs.bore ?? attrs.BORE ?? attrs.DIAMETER ?? attrs.OutsideDiameter) || 100;
  const multiplier = number(options.supportSymbolScale) || number(options.restraintSymbolScale) || 0.95;
  const baseScale = Math.max(28, Math.min(190, bore * multiplier));
  return baseScale * RESTRAINT_SYMBOL_REVIEW_SCALE_MULTIPLIER;
}

function sourceOf(attrs = {}, comp = {}, options = {}) {
  const raw = upper(options.supportRendering?.source || options.supportSource || comp.supportSource || comp.source || attrs.supportSource || attrs.SUPPORT_SOURCE || attrs['SUPPORT-SOURCE']);
  return raw.includes('ISONOTE') ? 'isonote' : 'inputxml';
}

function material(color) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.10, roughness: 0.42, metalness: 0.08 });
}

function orientFromY(object, direction) {
  const dir = direction?.clone?.().normalize?.();
  if (!dir || dir.lengthSq() < EPS) return;
  object.quaternion.setFromUnitVectors(UP, dir);
}

function basisFrom(primary, lateral) {
  const x = primary.clone().normalize();
  let z = lateral.clone().normalize();
  if (z.lengthSq() < EPS || Math.abs(z.dot(x)) > 0.96) {
    z = new THREE.Vector3().crossVectors(x, UP);
    if (z.lengthSq() < EPS) z = Z_AXIS.clone();
    z.normalize();
  }
  let y = new THREE.Vector3().crossVectors(z, x).normalize();
  if (y.dot(UP) < 0) y.negate();
  return { x, y, z };
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

function arrow(group, name, start, end, color, radius) {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = delta.length();
  if (length < 1e-6) return null;
  const dir = delta.clone().normalize();
  const headLength = Math.min(Math.max(radius * 5.0, length * 0.22), length * 0.42);
  const shaftEnd = end.clone().sub(dir.clone().multiplyScalar(headLength));
  cylinderBetween(group, `${name}-shaft`, start, shaftEnd, radius, color, 14);
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.8, headLength, 18), material(color));
  head.name = `${name}-head`;
  head.position.copy(shaftEnd.clone().add(dir.clone().multiplyScalar(headLength * 0.5)));
  orientFromY(head, dir);
  group.add(head);
  return head;
}

function box(group, name, center, size, color, basis = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material(color));
  mesh.name = name;
  mesh.position.copy(center);
  if (basis?.x && basis?.y && basis?.z) {
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(basis.x.clone().normalize(), basis.y.clone().normalize(), basis.z.clone().normalize()));
  }
  group.add(mesh);
  return mesh;
}

function torus(group, name, center, normal, major, minor, color) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(major, minor, 8, 24), material(color));
  mesh.name = name;
  mesh.position.copy(center);
  orientFromY(mesh, normal);
  group.add(mesh);
  return mesh;
}

function horizontalAxisOrFallback(axis, fallback) {
  const source = axis?.lengthSq?.() > EPS ? axis.clone().normalize() : fallback.clone();
  const horizontal = source.sub(UP.clone().multiplyScalar(source.dot(UP)));
  return horizontal.lengthSq() > EPS ? horizontal.normalize() : fallback.clone().normalize();
}

function projectPerpendicular(vector, tangent) {
  if (!vector || !tangent) return null;
  const projected = vector.clone().sub(tangent.clone().multiplyScalar(vector.dot(tangent)));
  return projected.lengthSq() > EPS ? projected.normalize() : null;
}

function makeCircumferenceFrame(center, pipeTangent, pipeRadius) {
  const point = center.clone();
  const T = pipeTangent?.clone?.().normalize?.() || X_AXIS.clone();
  if (T.lengthSq() < EPS) T.copy(X_AXIS);

  let top = projectPerpendicular(UP, T);
  if (!top) top = projectPerpendicular(X_AXIS, T) || projectPerpendicular(Z_AXIS, T) || X_AXIS.clone();
  top.normalize();

  let side = new THREE.Vector3().crossVectors(T, top);
  if (side.lengthSq() < EPS) side = projectPerpendicular(Z_AXIS, T) || Z_AXIS.clone();
  side.normalize();

  const anchors = {
    CIRCUM_TOP: point.clone().add(top.clone().multiplyScalar(pipeRadius)),
    CIRCUM_BOT: point.clone().add(top.clone().multiplyScalar(-pipeRadius)),
    CIRCUM_SIDE1: point.clone().add(side.clone().multiplyScalar(pipeRadius)),
    CIRCUM_SIDE2: point.clone().add(side.clone().multiplyScalar(-pipeRadius)),
  };

  const radialForAxis = (axis) => projectPerpendicular(axis?.clone?.().normalize?.(), T);
  const tipForAxis = (axis, sign = 1) => {
    const radial = radialForAxis(axis);
    if (!radial) return null;
    return point.clone().add(radial.multiplyScalar(sign * pipeRadius));
  };

  return {
    point,
    pipeTangent: T,
    pipeRadius,
    top,
    side,
    anchors,
    radialForAxis,
    tipForAxis,
  };
}

function plainVector(v) {
  return [Number(v.x.toFixed(6)), Number(v.y.toFixed(6)), Number(v.z.toFixed(6))];
}

function plainCircumferenceFrame(frame) {
  return {
    supportPoint: plainVector(frame.point),
    pipeTangent: plainVector(frame.pipeTangent),
    pipeRadius: Number(frame.pipeRadius.toFixed(6)),
    CIRCUM_TOP: plainVector(frame.anchors.CIRCUM_TOP),
    CIRCUM_BOT: plainVector(frame.anchors.CIRCUM_BOT),
    CIRCUM_SIDE1: plainVector(frame.anchors.CIRCUM_SIDE1),
    CIRCUM_SIDE2: plainVector(frame.anchors.CIRCUM_SIDE2),
  };
}

function outwardTailFromTip(tip, outward, length) {
  return tip.clone().add(outward.clone().normalize().multiplyScalar(length));
}

function buildRest(group, id, frame, scale, color) {
  // REST = vertical arrow only. Arrow pointer exactly touches CIRCUM_BOT.
  const tip = frame.anchors.CIRCUM_BOT.clone();
  const start = tip.clone().add(UP.clone().multiplyScalar(-scale * 0.92));
  arrow(group, `${id}-rest-vertical-arrow-tip-circum-bot`, start, tip, color, scale * 0.040);
}

function buildGuide(group, id, frame, guideAxis, scale, color) {
  // GUIDE = lateral arrows only. Arrow pointers exactly touch lateral CIRCUM points.
  const radial = frame.radialForAxis(guideAxis) || frame.side.clone();
  const positiveTip = frame.point.clone().add(radial.clone().multiplyScalar(frame.pipeRadius));
  const negativeTip = frame.point.clone().add(radial.clone().multiplyScalar(-frame.pipeRadius));
  arrow(group, `${id}-guide-lateral-arrow-positive-tip-circum`, outwardTailFromTip(positiveTip, radial, scale * 1.05), positiveTip, color, scale * 0.048);
  arrow(group, `${id}-guide-lateral-arrow-negative-tip-circum`, outwardTailFromTip(negativeTip, radial.clone().negate(), scale * 1.05), negativeTip, color, scale * 0.048);
}

function buildLineStop(group, id, frame, scale, color) {
  // LINESTOP = axial arrows only. Both pointers exactly touch CIRCUM_BOT.
  const tip = frame.anchors.CIRCUM_BOT.clone();
  const axis = frame.pipeTangent.clone().normalize();
  arrow(group, `${id}-linestop-axial-arrow-positive-tip-circum-bot`, tip.clone().add(axis.clone().multiplyScalar(scale * 1.10)), tip, color, scale * 0.052);
  arrow(group, `${id}-linestop-axial-arrow-negative-tip-circum-bot`, tip.clone().add(axis.clone().multiplyScalar(-scale * 1.10)), tip, color, scale * 0.052);
}

function buildLimit(group, id, frame, limitAxis, scale, color) {
  // LIMIT uses the same axial CIRCUM_BOT placement as LINESTOP. One arrow unless bidirectional is provided elsewhere.
  const tip = frame.anchors.CIRCUM_BOT.clone();
  const axis = frame.pipeTangent.clone().normalize();
  const basis = basisFrom(axis, frame.side);
  arrow(group, `${id}-limit-axial-arrow-tip-circum-bot`, tip.clone().add(axis.clone().multiplyScalar(scale * 1.12)), tip, color, scale * 0.042);
  box(group, `${id}-limit-gap-tick-a`, tip.clone().add(axis.clone().multiplyScalar(scale * 0.26)).add(UP.clone().multiplyScalar(scale * 0.18)), new THREE.Vector3(scale * 0.040, scale * 0.28, scale * 0.16), 0xf59e0b, basis);
  box(group, `${id}-limit-gap-tick-b`, tip.clone().add(axis.clone().multiplyScalar(scale * 0.36)).add(UP.clone().multiplyScalar(scale * 0.18)), new THREE.Vector3(scale * 0.040, scale * 0.28, scale * 0.16), 0xf97316, basis);
}

function buildHanger(group, id, frame, scale, color) {
  // HANGER = vertical-down support arrow. Arrow pointer exactly touches CIRCUM_TOP.
  const tip = frame.anchors.CIRCUM_TOP.clone();
  const start = tip.clone().add(UP.clone().multiplyScalar(scale * 1.10));
  arrow(group, `${id}-hanger-vertical-arrow-tip-circum-top`, start, tip, color, scale * 0.040);
  const rodTop = start.clone().add(UP.clone().multiplyScalar(scale * 0.20));
  cylinderBetween(group, `${id}-hanger-rod`, rodTop, start, scale * 0.026, color, 12);
  for (let i = 0; i < 3; i += 1) {
    torus(group, `${id}-hanger-coil-${i + 1}`, start.clone().add(UP.clone().multiplyScalar(scale * (0.18 + i * 0.13))), UP, scale * 0.14, scale * 0.014, color);
  }
}

function buildUnknown(group, id, frame, scale) {
  const warning = new THREE.Mesh(new THREE.OctahedronGeometry(scale * 0.06, 0), material(0x64748b));
  warning.name = `${id}-unknown-debug-hidden-marker`;
  warning.position.copy(frame.point);
  warning.visible = false;
  group.add(warning);
}

function buildAnchor(group, id, frame, guideAxis, scale, color) {
  buildRest(group, id, frame, scale, color);
  buildLineStop(group, id, frame, scale, color);
  buildGuide(group, id, frame, guideAxis, scale, color);
}

function hideExistingProxyMeshes(object, markerGroupName) {
  const hidden = [];
  for (const child of object.children || []) {
    if (child.name === markerGroupName) continue;
    child.traverse?.((node) => {
      if (node.isMesh) {
        node.visible = false;
        hidden.push(node.name || node.uuid);
      }
    });
  }
  return hidden;
}

function stampLayerMetadata(target, record, { scale, role }) {
  const profile = visualProfileMetadata({ kind: record.kind, source: record.source, axisLabel: record.axis, scale, role });
  target.userData = {
    ...(target.userData || {}),
    bmCiiLayerSchema: LAYER_SCHEMA,
    bmCiiLayer: {
      schema: LAYER_SCHEMA,
      category: 'support',
      source: record.source,
      supportKind: record.kind,
      axis: record.axis,
      visibleDefault: record.visibleDefault,
      layerIds: record.layerIds,
      restraintVisualProfile: profile.profile,
      supportGlyphRole: role,
    },
    bmCiiLayerIds: record.layerIds,
    supportKind: record.kind,
    supportSource: record.source,
    restraintAxis: record.axis,
    supportSymbolScale: scale,
    renderScale: scale,
    visualProfile: RESTRAINT_VISUAL_PROFILE.id,
    glbSupportVisualProfile: RESTRAINT_VISUAL_PROFILE.id,
    bmCiiRestraintVisualProfile: profile,
    supportReferenceStyle: true,
    supportReferenceStyleV5: true,
    supportReferenceStyleV7CircumferenceAnchors: true,
    supportGlyphRole: role,
    supportSymbolContract: record.supportSymbolContract,
    supportRecordId: record.recordId,
    circumferenceAnchors: record.circumferenceAnchors || null,
  };
}

function stampGlyphMetadata(target, record, { scale, role, renderGlyph }) {
  stampLayerMetadata(target, record, { scale, role });
  const isRenderableRecordRoot = role === 'baked-symbol-root';
  target.userData = {
    ...(target.userData || {}),
    renderGlyph,
    bmCiiTrace: isRenderableRecordRoot
      ? supportTraceFromRecord(record, {
        renderGlyph,
        renderScale: scale,
        visualProfile: RESTRAINT_VISUAL_PROFILE.id,
        circumferenceAnchors: record.circumferenceAnchors || null,
        placementContract: 'arrow-tips-touch-saved-circumference-anchors',
      })
      : {
        entity: 'supportPart',
        parentRecordId: record.recordId,
        supportRecordId: record.recordId,
        supportKind: record.kind,
        supportSource: record.source,
        supportSymbolContract: record.supportSymbolContract,
        circumferenceAnchors: record.circumferenceAnchors || null,
      },
  };
}

export function applyBakedRestraintGlyph(object, comp = {}, options = {}) {
  if (!object || comp.type !== 'SUPPORT') return object;

  const attrs = attrsFrom(object, comp);
  const source = sourceOf(attrs, comp, options);
  const sourceRecord = normalizeSupportRecord({ ...attrs, ...comp }, {
    source,
    supportSource: source,
    index: comp.supportRecordIndex ?? comp.recordIndex ?? comp.index ?? comp.supportIndex,
  });
  const kind = sourceRecord.kind;
  const axisLabel = sourceRecord.axis;
  const axis = axisVectorFrom(attrs, comp, axisLabel);
  const scale = supportScaleFor(comp, attrs, options);
  const pipeRadius = pipeRadiusFor(comp, attrs);
  const color = SUPPORT_SYMBOL_COLORS[kind] || SUPPORT_SYMBOL_COLORS.UNKNOWN;
  const id = text(comp.id || sourceRecord.recordId || object.name || 'support');

  const pipeAxis = pipeTangentFrom(attrs, comp, axis, kind);
  const guideAxis = axis.lengthSq() > EPS && Math.abs(axis.clone().normalize().dot(pipeAxis)) < 0.85
    ? axis.clone().normalize()
    : (projectPerpendicular(axis, pipeAxis) || new THREE.Vector3().crossVectors(pipeAxis, UP).normalize() || Z_AXIS.clone());
  const frame = makeCircumferenceFrame(new THREE.Vector3(0, 0, 0), pipeAxis, pipeRadius);
  sourceRecord.circumferenceAnchors = plainCircumferenceFrame(frame);

  const markerGroup = new THREE.Group();
  markerGroup.name = `${sourceRecord.recordId}-restraint-${RESTRAINT_VISUAL_PROFILE.id}-${kind.toLowerCase()}`;
  const renderGlyph = `baked-${RESTRAINT_VISUAL_PROFILE.id}-${kind.toLowerCase()}`;

  if (kind === 'REST' || kind === 'SHOE' || kind === 'HOLDDOWN') buildRest(markerGroup, id, frame, scale, color);
  else if (kind === 'GUIDE') buildGuide(markerGroup, id, frame, guideAxis, scale, color);
  else if (kind === 'LINESTOP') buildLineStop(markerGroup, id, frame, scale, color);
  else if (kind === 'LIMIT') buildLimit(markerGroup, id, frame, axis, scale, color);
  else if (kind === 'ANCHOR') buildAnchor(markerGroup, id, frame, guideAxis, scale, color);
  else if (kind === 'HANGER' || kind === 'SPRING') buildHanger(markerGroup, id, frame, scale, color);
  else buildUnknown(markerGroup, id, frame, scale);

  const glyphMeshes = [];
  markerGroup.traverse((child) => { if (child.isMesh) glyphMeshes.push(child); });
  glyphMeshes.forEach((child, index) => stampGlyphMetadata(child, sourceRecord, { scale, role: index === 0 ? 'baked-symbol-root' : 'baked-symbol-child', renderGlyph }));
  stampLayerMetadata(markerGroup, sourceRecord, { scale, role: 'baked-group' });

  const hiddenOriginalProxyMeshes = hideExistingProxyMeshes(object, markerGroup.name);
  object.add(markerGroup);
  object.userData = {
    ...(object.userData || {}),
    labelText: object.userData?.labelText || `${id} ${kind}`,
    supportKind: kind,
    supportAxis: { x: axis.x, y: axis.y, z: axis.z },
    pipeTangent: { x: pipeAxis.x, y: pipeAxis.y, z: pipeAxis.z },
    restraintAxis: axisLabel,
    supportSource: source,
    supportRecordId: sourceRecord.recordId,
    supportSymbolScale: scale,
    supportPipeRadius: pipeRadius,
    circumferenceAnchors: sourceRecord.circumferenceAnchors,
    renderGlyph,
    renderScale: scale,
    visualProfile: RESTRAINT_VISUAL_PROFILE.id,
    glbShape: `support-reference-v7-circumference-${kind.toLowerCase()}`,
    glbSupportVisualProfile: RESTRAINT_VISUAL_PROFILE.id,
    bmCiiTrace: supportTraceFromRecord(sourceRecord, {
      renderGlyph,
      renderScale: scale,
      visualProfile: RESTRAINT_VISUAL_PROFILE.id,
      circumferenceAnchors: sourceRecord.circumferenceAnchors,
      placementContract: 'arrow-tips-touch-saved-circumference-anchors',
    }),
    bmCiiRestraintVisualProfile: visualProfileMetadata({ kind, source, axisLabel, scale, role: 'baked-object-root' }),
    supportSymbolContract: sourceRecord.supportSymbolContract || supportSymbolContractFor(kind),
    supportPlacementContract: 'arrow-tips-touch-saved-circumference-anchors',
    directionalSupportEnhanced: true,
    directionalSupportSymbolCount: markerGroup.children.length,
    supportReferenceStyle: true,
    supportReferenceStyleV7CircumferenceAnchors: true,
    hiddenOriginalProxyMeshCount: hiddenOriginalProxyMeshes.length,
  };
  return object;
}
