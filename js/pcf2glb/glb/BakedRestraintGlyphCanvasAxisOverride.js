import * as THREE from 'three';
import {
  RESTRAINT_VISUAL_PROFILE,
  SUPPORT_SYMBOL_COLORS,
  normalizeRestraintAxisLabel,
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
const COMMON_ARROW_LENGTH_FACTOR = 0.64; // previous review length reduced by about 30%.
const COMMON_ARROW_RADIUS_FACTOR = 0.044;

function text(value) { return String(value ?? '').trim(); }
function upper(value) { return text(value).toUpperCase(); }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function attrsFrom(object, comp = {}) { return { ...(comp.raw || {}), ...(comp.attributes || {}), ...(object?.userData || {}) }; }

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

/**
 * BM_CII InputXML-basic benchmark axis rule.
 *
 * No source-to-canvas transformation is applied here. X/Y/Z are interpreted as
 * the canvas X/Y/Z directions exactly as supplied by InputXML. The future
 * transformation profile must be chosen explicitly by the user in the
 * conversion popup and passed as a different axis mapper.
 *
 * KIND/TYPE decides the symbol family. Axis only decides arrow orientation.
 */
function canvasAxisFromLabel(axisLabel = '') {
  const normalized = normalizeRestraintAxisLabel(axisLabel);
  const sign = normalized.startsWith('-') ? -1 : 1;
  if (normalized.includes('X')) return X_AXIS.clone().multiplyScalar(sign);
  if (normalized.includes('Y')) return Y_AXIS.clone().multiplyScalar(sign);
  if (normalized.includes('Z')) return Z_AXIS.clone().multiplyScalar(sign);
  return null;
}

function canvasAxisFrom(attrs = {}, comp = {}, axisLabel = '') {
  // For InputXML-basic, the explicit axis label is primary. Do not prefer
  // earlier transformed canvasAxis/axisGlb fields from older benchmark files.
  return canvasAxisFromLabel(axisLabel)
    || vectorFrom(comp.axis)
    || vectorFrom(attrs.axis)
    || vectorFrom(comp.canvasAxis)
    || vectorFrom(attrs.canvasAxis)
    || X_AXIS.clone();
}

function pipeTangentFrom(attrs = {}, comp = {}, fallbackAxis = X_AXIS) {
  const tangent = vectorFrom(comp.pipeTangent)
    || vectorFrom(comp.pipeAxis)
    || vectorFrom(comp.pipeDirection)
    || vectorFrom(comp.tangent)
    || vectorFrom(comp.pipeTangentGlb)
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
  return fallbackAxis.clone().normalize();
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

function arrowFixedTip(group, name, tip, outwardAxis, length, color, radius) {
  const outward = outwardAxis?.clone?.().normalize?.() || X_AXIS.clone();
  if (outward.lengthSq() < EPS) return null;
  const start = tip.clone().add(outward.clone().multiplyScalar(length));
  const delta = new THREE.Vector3().subVectors(tip, start);
  const arrowLength = delta.length();
  if (arrowLength < 1e-6) return null;
  const dir = delta.clone().normalize();
  const headLength = Math.min(Math.max(radius * 8.0, arrowLength * 0.30), arrowLength * 0.58);
  const shaftEnd = tip.clone().sub(dir.clone().multiplyScalar(headLength));
  cylinderBetween(group, `${name}-shaft`, start, shaftEnd, radius, color, 14);
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 6.0, headLength, 20), material(color));
  head.name = `${name}-head-fixed-tip`;
  head.position.copy(shaftEnd.clone().add(dir.clone().multiplyScalar(headLength * 0.5)));
  orientFromY(head, dir);
  group.add(head);
  return head;
}

function torus(group, name, center, normal, major, minor, color) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(major, minor, 8, 28), material(color));
  mesh.name = name;
  mesh.position.copy(center);
  orientFromY(mesh, normal);
  group.add(mesh);
  return mesh;
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

  return {
    point,
    pipeTangent: T,
    pipeRadius,
    top,
    side,
    anchors: {
      CIRCUM_TOP: point.clone().add(top.clone().multiplyScalar(pipeRadius)),
      CIRCUM_BOT: point.clone().add(top.clone().multiplyScalar(-pipeRadius)),
      CIRCUM_SIDE1: point.clone().add(side.clone().multiplyScalar(pipeRadius)),
      CIRCUM_SIDE2: point.clone().add(side.clone().multiplyScalar(-pipeRadius)),
      CIRCUM_EAST: point.clone().add(X_AXIS.clone().multiplyScalar(pipeRadius)),
      CIRCUM_WEST: point.clone().add(X_AXIS.clone().multiplyScalar(-pipeRadius)),
      CIRCUM_NORTH: point.clone().add(Z_AXIS.clone().multiplyScalar(pipeRadius)),
      CIRCUM_SOUTH: point.clone().add(Z_AXIS.clone().multiplyScalar(-pipeRadius)),
    },
  };
}

function plainVector(v) { return [Number(v.x.toFixed(6)), Number(v.y.toFixed(6)), Number(v.z.toFixed(6))]; }
function plainCircumferenceFrame(frame) {
  return Object.fromEntries([
    ['supportPoint', plainVector(frame.point)],
    ['pipeTangent', plainVector(frame.pipeTangent)],
    ['pipeRadius', Number(frame.pipeRadius.toFixed(6))],
    ...Object.entries(frame.anchors).map(([key, value]) => [key, plainVector(value)]),
  ]);
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

function signedAxisTip(frame, axis) {
  const dir = axis.clone().normalize();
  if (Math.abs(dir.dot(Y_AXIS)) > 0.90) {
    return dir.dot(Y_AXIS) >= 0 ? frame.anchors.CIRCUM_TOP.clone() : frame.anchors.CIRCUM_BOT.clone();
  }
  return frame.point.clone().add(dir.multiplyScalar(frame.pipeRadius));
}

function restTipAndOutward(frame, axis) {
  const dir = axis.clone().normalize();
  if (Math.abs(dir.dot(Y_AXIS)) > 0.90) {
    return { tip: frame.anchors.CIRCUM_BOT.clone(), outward: Y_AXIS.clone().negate() };
  }
  return { tip: signedAxisTip(frame, dir), outward: dir };
}

function stampLayerMetadata(target, record, { scale, role }) {
  const profile = visualProfileMetadata({ kind: record.kind, source: record.source, axisLabel: record.axis, scale, role });
  target.userData = {
    ...(target.userData || {}),
    ...(record.details || {}),
    AXIS: record.axis || 'N/A',
    NODE: record.node || 'N/A',
    SOURCE: record.source || 'N/A',
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
    supportReferenceStyleV11InputXmlBasicAxis: true,
    supportGlyphRole: role,
    supportSymbolContract: record.supportSymbolContract,
    supportRecordId: record.recordId,
    circumferenceAnchors: record.circumferenceAnchors || null,
  };
}

function stampGlyphMetadata(target, record, { scale, role, renderGlyph, canvasAxis }) {
  stampLayerMetadata(target, record, { scale, role });
  const isRenderableRecordRoot = role === 'baked-symbol-root';
  target.userData = {
    ...(target.userData || {}),
    canvasAxis: canvasAxis ? { x: canvasAxis.x, y: canvasAxis.y, z: canvasAxis.z } : null,
    renderGlyph,
    bmCiiTrace: isRenderableRecordRoot
      ? supportTraceFromRecord(record, {
        renderGlyph,
        renderScale: scale,
        visualProfile: RESTRAINT_VISUAL_PROFILE.id,
        circumferenceAnchors: record.circumferenceAnchors || null,
        canvasAxis: canvasAxis ? { x: canvasAxis.x, y: canvasAxis.y, z: canvasAxis.z } : null,
        placementContract: 'inputxml-basic-type-family-axis-orients-symbol-fixed-tip-circumference-no-transform',
      })
      : {
        entity: 'supportPart',
        parentRecordId: record.recordId,
        supportRecordId: record.recordId,
        supportKind: record.kind,
        supportSource: record.source,
        supportSymbolContract: record.supportSymbolContract,
        circumferenceAnchors: record.circumferenceAnchors || null,
        canvasAxis: canvasAxis ? { x: canvasAxis.x, y: canvasAxis.y, z: canvasAxis.z } : null,
        ...(record.details || {}),
        AXIS: record.axis || 'N/A',
        NODE: record.node || 'N/A',
        SOURCE: record.source || 'N/A',
      },
  };
}

function commonLength(scale) { return scale * COMMON_ARROW_LENGTH_FACTOR; }
function commonRadius(scale) { return scale * COMMON_ARROW_RADIUS_FACTOR; }

function buildRest(group, id, frame, canvasAxis, scale, color) {
  // REST = one arrow. Axis is not reclassified into GUIDE/LINESTOP; it only
  // chooses the side of the pipe for X/Z. Y-rest uses a normal bottom REST arrow.
  const { tip, outward } = restTipAndOutward(frame, canvasAxis || Y_AXIS);
  arrowFixedTip(group, `${id}-rest-single-axis-arrow-fixed-tip`, tip, outward, commonLength(scale), color, commonRadius(scale));
}

function buildGuide(group, id, frame, canvasAxis, scale, color) {
  // GUIDE = lateral opposed arrows only. The InputXML axis gives the lateral
  // direction directly in canvas coordinates for this benchmark.
  let axis = canvasAxis?.clone?.().normalize?.() || frame.side.clone();
  if (axis.lengthSq() < EPS) axis = frame.side.clone();
  // If the declared guide axis is accidentally axial, keep the family GUIDE and
  // use the frame side as a readable lateral fallback. Do not turn it into a line stop.
  if (Math.abs(axis.dot(frame.pipeTangent)) > 0.92) axis = frame.side.clone();
  axis.normalize();
  const positiveTip = frame.point.clone().add(axis.clone().multiplyScalar(frame.pipeRadius));
  const negativeTip = frame.point.clone().add(axis.clone().multiplyScalar(-frame.pipeRadius));
  arrowFixedTip(group, `${id}-guide-positive-lateral-fixed-tip`, positiveTip, axis, commonLength(scale), color, commonRadius(scale));
  arrowFixedTip(group, `${id}-guide-negative-lateral-fixed-tip`, negativeTip, axis.clone().negate(), commonLength(scale), color, commonRadius(scale));
}

function buildLineStopOrLimit(group, id, frame, canvasAxis, scale, color, kind) {
  // LINESTOP/LIMIT = axial arrow family. For InputXML-basic, a signed +X/+Y/+Z
  // record draws one arrow in that direction. An unsigned/blank record would be
  // rendered as a two-sided fallback later, but this benchmark uses signed records.
  const axis = canvasAxis?.clone?.().normalize?.() || frame.pipeTangent.clone();
  const tip = frame.anchors.CIRCUM_BOT.clone();
  arrowFixedTip(group, `${id}-${kind.toLowerCase()}-single-axis-arrow-fixed-tip`, tip, axis, commonLength(scale), color, commonRadius(scale));
}

function buildSpring(group, id, frame, scale, color) {
  // SPRING/HANGER = coil only. No arrow shaft/head.
  const tip = frame.anchors.CIRCUM_TOP.clone();
  const coilStart = tip.clone().add(UP.clone().multiplyScalar(scale * 0.18));
  const coilEnd = tip.clone().add(UP.clone().multiplyScalar(scale * 0.92));
  const ringCount = 7;
  for (let i = 0; i < ringCount; i += 1) {
    const f = ringCount === 1 ? 0.5 : i / (ringCount - 1);
    const c = coilStart.clone().lerp(coilEnd, f);
    torus(group, `${id}-spring-coil-only-${i + 1}`, c, UP, scale * 0.18, scale * 0.022, color);
  }
}

function buildAnchor(group, id, frame, scale, color) {
  // ANCHOR = flat plate blocking flow, normal to the pipe axis.
  const thickness = Math.max(scale * 0.12, frame.pipeRadius * 0.45);
  const start = frame.point.clone().add(frame.pipeTangent.clone().multiplyScalar(-thickness * 0.5));
  const end = frame.point.clone().add(frame.pipeTangent.clone().multiplyScalar(thickness * 0.5));
  cylinderBetween(group, `${id}-anchor-flat-flow-blocking-plate`, start, end, Math.max(frame.pipeRadius * 1.75, scale * 0.34), color, 32);
}

function buildUnknown(group, id, frame, scale) {
  const warning = new THREE.Mesh(new THREE.OctahedronGeometry(scale * 0.06, 0), material(0x64748b));
  warning.name = `${id}-unknown-debug-hidden-marker`;
  warning.position.copy(frame.point);
  warning.visible = false;
  group.add(warning);
}

function buildSymbolForKind(group, id, record, frame, canvasAxis, scale, color) {
  const kind = record.kind;
  if (kind === 'REST' || kind === 'SHOE' || kind === 'HOLDDOWN') buildRest(group, id, frame, canvasAxis, scale, color);
  else if (kind === 'GUIDE') buildGuide(group, id, frame, canvasAxis, scale, color);
  else if (kind === 'LINESTOP' || kind === 'LIMIT') buildLineStopOrLimit(group, id, frame, canvasAxis, scale, color, kind);
  else if (kind === 'HANGER' || kind === 'SPRING') buildSpring(group, id, frame, scale, color);
  else if (kind === 'ANCHOR') buildAnchor(group, id, frame, scale, color);
  else buildUnknown(group, id, frame, scale);
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
  const canvasAxis = canvasAxisFrom(attrs, comp, axisLabel).normalize();
  const pipeAxis = pipeTangentFrom(attrs, comp, canvasAxis);
  const scale = supportScaleFor(comp, attrs, options);
  const pipeRadius = pipeRadiusFor(comp, attrs);
  const color = SUPPORT_SYMBOL_COLORS[kind] || SUPPORT_SYMBOL_COLORS.UNKNOWN;
  const id = text(comp.id || sourceRecord.recordId || object.name || 'support');

  const frame = makeCircumferenceFrame(new THREE.Vector3(0, 0, 0), pipeAxis, pipeRadius);
  sourceRecord.circumferenceAnchors = plainCircumferenceFrame(frame);

  const markerGroup = new THREE.Group();
  markerGroup.name = `${sourceRecord.recordId}-restraint-${RESTRAINT_VISUAL_PROFILE.id}-${kind.toLowerCase()}-inputxml-basic`;
  const renderGlyph = `baked-${RESTRAINT_VISUAL_PROFILE.id}-${kind.toLowerCase()}-inputxml-basic`;

  buildSymbolForKind(markerGroup, id, sourceRecord, frame, canvasAxis, scale, color);

  const glyphMeshes = [];
  markerGroup.traverse((child) => { if (child.isMesh) glyphMeshes.push(child); });
  glyphMeshes.forEach((child, index) => stampGlyphMetadata(child, sourceRecord, {
    scale,
    role: index === 0 ? 'baked-symbol-root' : 'baked-symbol-child',
    renderGlyph,
    canvasAxis,
  }));
  stampLayerMetadata(markerGroup, sourceRecord, { scale, role: 'baked-group' });

  const hiddenOriginalProxyMeshes = hideExistingProxyMeshes(object, markerGroup.name);
  object.add(markerGroup);
  object.userData = {
    ...(object.userData || {}),
    ...(sourceRecord.details || {}),
    AXIS: axisLabel || 'N/A',
    NODE: sourceRecord.node || 'N/A',
    SOURCE: source,
    labelText: object.userData?.labelText || `${id} ${kind}`,
    supportKind: kind,
    supportAxis: { x: canvasAxis.x, y: canvasAxis.y, z: canvasAxis.z },
    canvasAxis: { x: canvasAxis.x, y: canvasAxis.y, z: canvasAxis.z },
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
    glbShape: `support-reference-inputxml-basic-${kind.toLowerCase()}`,
    glbSupportVisualProfile: RESTRAINT_VISUAL_PROFILE.id,
    bmCiiTrace: supportTraceFromRecord(sourceRecord, {
      renderGlyph,
      renderScale: scale,
      visualProfile: RESTRAINT_VISUAL_PROFILE.id,
      circumferenceAnchors: sourceRecord.circumferenceAnchors,
      canvasAxis: { x: canvasAxis.x, y: canvasAxis.y, z: canvasAxis.z },
      placementContract: 'inputxml-basic-type-family-axis-orients-symbol-fixed-tip-circumference-no-transform',
    }),
    bmCiiRestraintVisualProfile: visualProfileMetadata({ kind, source, axisLabel, scale, role: 'baked-object-root' }),
    supportSymbolContract: sourceRecord.supportSymbolContract || supportSymbolContractFor(kind),
    supportPlacementContract: 'inputxml-basic-type-family-axis-orients-symbol-fixed-tip-circumference-no-transform',
    directionalSupportEnhanced: true,
    directionalSupportSymbolCount: markerGroup.children.length,
    supportReferenceStyle: true,
    supportReferenceStyleV11InputXmlBasicAxis: true,
    fixedTipScaleApplied: true,
    hiddenOriginalProxyMeshCount: hiddenOriginalProxyMeshes.length,
  };
  return object;
}
