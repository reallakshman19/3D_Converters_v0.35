import * as THREE from 'three';

const NODE_ANNOTATION_SCHEMA = 'bm-cii-node-annotation/v1';
const LAYER_SCHEMA = 'bm-cii-layer/v1';
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const SEGMENTS = {
  a: [[0.18, 0.92], [0.82, 0.92]],
  b: [[0.86, 0.54], [0.86, 0.86]],
  c: [[0.86, 0.14], [0.86, 0.46]],
  d: [[0.18, 0.08], [0.82, 0.08]],
  e: [[0.14, 0.14], [0.14, 0.46]],
  f: [[0.14, 0.54], [0.14, 0.86]],
  g: [[0.18, 0.50], [0.82, 0.50]],
};

const DIGIT_SEGMENTS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgecd',
  7: 'abc',
  8: 'abcdefg',
  9: 'abfgcd',
};

function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && text(value) !== '') return value;
  }
  return '';
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || text(value) === '') return fallback;
  const raw = upper(value);
  if (['1', 'TRUE', 'YES', 'Y', 'ON'].includes(raw)) return true;
  if (['0', 'FALSE', 'NO', 'N', 'OFF'].includes(raw)) return false;
  return fallback;
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function point3(point = {}) {
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return new THREE.Vector3(x, y, z);
}

function axisVectorFromLabel(value) {
  const raw = upper(value);
  const sign = raw.startsWith('-') ? -1 : 1;
  if (/^[+-]?X$/.test(raw)) return X_AXIS.clone().multiplyScalar(sign);
  if (/^[+-]?Y$/.test(raw)) return Y_AXIS.clone().multiplyScalar(sign);
  if (/^[+-]?Z$/.test(raw)) return Z_AXIS.clone().multiplyScalar(sign);
  return null;
}

function vectorFrom(value, fallback = X_AXIS) {
  const axis = axisVectorFromLabel(value);
  if (axis) return axis;
  if (value instanceof THREE.Vector3) return value.lengthSq() > 1e-12 ? value.clone().normalize() : fallback.clone();
  if (Array.isArray(value)) {
    const v = new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    return v.lengthSq() > 1e-12 ? v.normalize() : fallback.clone();
  }
  if (typeof value === 'string') {
    const parts = value.split(/[\s,;|]+/).map(Number).filter(Number.isFinite);
    if (parts.length >= 3) {
      const v = new THREE.Vector3(parts[0], parts[1], parts[2]);
      return v.lengthSq() > 1e-12 ? v.normalize() : fallback.clone();
    }
  }
  if (value && typeof value === 'object') {
    const v = new THREE.Vector3(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
    return v.lengthSq() > 1e-12 ? v.normalize() : fallback.clone();
  }
  return fallback.clone();
}

function attrsOf(comp = {}) {
  return { ...(comp.raw || {}), ...(comp.attributes || {}) };
}

function nodeLabelText(comp = {}, attrs = {}) {
  const raw = text(comp.label || comp.refNo || attrs.NODE_LABEL || attrs.NODE_NUMBER || attrs.NodeNumber || comp.id);
  if (!raw) return '';
  return raw.replace(/^N/i, '');
}

function nodeLabelDisplayText(label = '') {
  const raw = text(label);
  if (!raw) return '';
  return /^N/i.test(raw) ? raw.toUpperCase() : `N${raw}`;
}

function material(color, emissive = color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: options.emissiveIntensity ?? 0.18,
    roughness: 0.50,
    metalness: 0.02,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

function labelMaterial(color, emissive = color, attrs = {}, comp = {}) {
  const doubleSided = nodeLabelDoubleSided(comp, attrs);
  return material(color, emissive, {
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function orientFromY(object, direction) {
  const dir = direction?.clone?.().normalize?.();
  if (!dir || dir.lengthSq() < 1e-12) return;
  object.quaternion.setFromUnitVectors(UP, dir);
}

function orientPlaneNormal(object, faceDirection) {
  const dir = faceDirection?.clone?.().normalize?.() || Z_AXIS.clone();
  if (!dir || dir.lengthSq() < 1e-12) return;
  // THREE.PlaneGeometry has local +Z as its front normal. This is used only
  // when a static baked plate is explicitly requested.
  object.quaternion.setFromUnitVectors(Z_AXIS, dir);
}

function cylinderBetween(name, start, end, radius, color, options = {}) {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = delta.length();
  if (length < 1e-9) return null;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, options.radialSegments ?? 8),
    material(color, options.emissive ?? color, options.materialOptions || {}),
  );
  mesh.name = name;
  mesh.position.copy(start.clone().add(delta.multiplyScalar(0.5)));
  orientFromY(mesh, new THREE.Vector3().subVectors(end, start));
  return mesh;
}

function layerIdsForPart(part = 'node') {
  const base = ['plant.annotations', 'annotation.all', 'annotation.node', 'source.inputxml'];
  if (part === 'marker') return [...base, 'annotation.node_marker'];
  if (part === 'leader') return [...base, 'annotation.node_leader'];
  if (part === 'label' || part === 'label-anchor') return [...base, 'annotation.node_label'];
  return base;
}

function labelFaceDirection(comp = {}, attrs = {}) {
  const configured = firstNonEmpty(
    attrs.NODE_LABEL_FACE_DIRECTION,
    attrs.NODE_LABEL_LOOK_DIRECTION,
    attrs.NODE_LABEL_FACE_AXIS,
    attrs.ANNOTATION_FACE_DIRECTION,
    attrs.ANNOTATION_LOOK_DIRECTION,
    attrs.LABEL_FACE_DIRECTION,
    attrs.LABEL_LOOK_DIRECTION,
    comp.nodeLabelFaceDirection,
    comp.nodeLabelLookDirection,
    comp.annotationFaceDirection,
    comp.annotationLookDirection,
    comp.labelFaceDirection,
    comp.labelLookDirection,
    '+Z',
  );
  return {
    raw: text(configured) || '+Z',
    vector: vectorFrom(configured || '+Z', Z_AXIS),
  };
}

function nodeLabelDoubleSided(comp = {}, attrs = {}) {
  return bool(firstNonEmpty(
    attrs.NODE_LABEL_DOUBLE_SIDED,
    attrs.NODE_LABEL_READABLE_BOTH_SIDES,
    attrs.ANNOTATION_DOUBLE_SIDED,
    attrs.LABEL_DOUBLE_SIDED,
    comp.nodeLabelDoubleSided,
    comp.nodeLabelReadableBothSides,
    comp.annotationDoubleSided,
    comp.labelDoubleSided,
  ), true);
}

function staticPlateVisible(comp = {}, attrs = {}) {
  return bool(firstNonEmpty(
    attrs.NODE_LABEL_STATIC_PLATE_VISIBLE,
    attrs.NODE_LABEL_BAKED_PLATE_VISIBLE,
    attrs.ANNOTATION_STATIC_PLATE_VISIBLE,
    comp.nodeLabelStaticPlateVisible,
    comp.nodeLabelBakedPlateVisible,
    comp.annotationStaticPlateVisible,
  ), false);
}

function crossBillboardTextVisible(comp = {}, attrs = {}) {
  return bool(firstNonEmpty(
    attrs.NODE_LABEL_CROSS_BILLBOARD_VISIBLE,
    attrs.NODE_LABEL_3D_TEXT_VISIBLE,
    attrs.ANNOTATION_CROSS_BILLBOARD_VISIBLE,
    attrs.ANNOTATION_3D_TEXT_VISIBLE,
    comp.nodeLabelCrossBillboardVisible,
    comp.nodeLabel3dTextVisible,
    comp.annotationCrossBillboardVisible,
    comp.annotation3dTextVisible,
  ), true);
}

function stampNodeAnnotation(target, comp, attrs, {
  part = 'node',
  role = 'node-annotation',
  faceDirection = null,
  faceDirectionRaw = '+Z',
  doubleSided = true,
  exportLabel = false,
  labelAnchor = false,
} = {}) {
  const node = text(attrs.NODE_NUMBER || attrs.NODE || comp.refNo || comp.label || comp.id).replace(/^N/i, '');
  const label = nodeLabelText(comp, attrs);
  const displayLabel = nodeLabelDisplayText(label);
  const layerIds = layerIdsForPart(part);
  const faceVector = faceDirection?.clone?.().normalize?.() || Z_AXIS.clone();
  target.userData = {
    ...(target.userData || {}),
    schema: NODE_ANNOTATION_SCHEMA,
    entity: 'annotation',
    semanticCategory: 'annotation',
    annotationType: 'NODE_LABEL',
    annotationKind: 'NODE_LABEL',
    annotationRole: role,
    nodeAnnotationPart: part,
    pcfType: 'NODE_LABEL',
    pcfId: comp.id || `node-annotation-${node || label}`,
    TYPE: 'NODE ANNOTATION',
    NODE: node || label,
    NODE_LABEL: label,
    NODE_LABEL_DISPLAY: displayLabel,
    SOURCE: 'InputXML',
    labelKind: 'node',
    labelAnchor,
    exportLabel,
    EXPORT_LABEL: exportLabel,
    hideLabel: !exportLabel,
    labelText: label,
    labelDisplayText: displayLabel,
    sourceNode: node || label,
    connectedElements: attrs.CONNECTED_ELEMENTS || comp.connectedElements || '',
    connectedElementCount: number(attrs.CONNECTED_ELEMENT_COUNT ?? comp.connectedElementCount, 0),
    hasSupport: String(attrs.HAS_SUPPORT ?? comp.hasSupport ?? '').toLowerCase() === 'true',
    hasComponent: String(attrs.HAS_COMPONENT ?? comp.hasComponent ?? '').toLowerCase() === 'true',
    NODE_LABEL_FACE_DIRECTION: faceDirectionRaw || '+Z',
    NODE_LABEL_DOUBLE_SIDED: doubleSided,
    NODE_LABEL_READABLE_BOTH_SIDES: doubleSided,
    NODE_LABEL_RUNTIME_OVERLAY: exportLabel && labelAnchor,
    NODE_LABEL_CAMERA_FACING: exportLabel && labelAnchor,
    annotationFaceDirection: { x: faceVector.x, y: faceVector.y, z: faceVector.z },
    annotationFacingMode: exportLabel && labelAnchor
      ? 'runtime-css2d-camera-facing-anchor'
      : 'baked-cross-billboard-3d-stroke-text',
    labelOrientationContract: exportLabel && labelAnchor
      ? 'css2d-node-label-anchor-camera-facing-in-basic-viewer'
      : 'portable-glb-cross-billboard-3d-stroke-text-readable-in-external-viewers',
    bmCiiLayerSchema: LAYER_SCHEMA,
    bmCiiLayer: {
      schema: LAYER_SCHEMA,
      category: 'annotation',
      source: 'inputxml',
      annotationKind: 'NODE_LABEL',
      annotationRole: role,
      visibleDefault: false,
      layerIds,
    },
    bmCiiLayerIds: layerIds,
    glbShape: labelAnchor ? 'node-label-anchor' : `node-annotation-${part}`,
  };
}

function labelOffsetBasis(comp = {}, attrs = {}) {
  const tangent = vectorFrom(comp.averagePipeTangent || attrs.AVERAGE_PIPE_TANGENT || attrs.PIPE_TANGENT, X_AXIS);
  let top = UP.clone().sub(tangent.clone().multiplyScalar(UP.dot(tangent)));
  if (top.lengthSq() < 1e-12) top = Z_AXIS.clone().sub(tangent.clone().multiplyScalar(Z_AXIS.dot(tangent)));
  if (top.lengthSq() < 1e-12) top = X_AXIS.clone();
  top.normalize();
  let side = new THREE.Vector3().crossVectors(tangent, top);
  if (side.lengthSq() < 1e-12) side = X_AXIS.clone();
  side.normalize();
  return { top, side };
}

function staggerSign(index = 0) {
  return (Number(index) || 0) % 2 === 0 ? 1 : -1;
}

function glyphStrokes(ch) {
  if (ch === 'N') {
    return [
      [[0.15, 0.08], [0.15, 0.92]],
      [[0.85, 0.08], [0.85, 0.92]],
      [[0.15, 0.92], [0.85, 0.08]],
    ];
  }
  const segments = DIGIT_SEGMENTS[ch] || '';
  return [...segments].map((key) => SEGMENTS[key]).filter(Boolean);
}

function addStrokeTextPlane(group, comp, attrs, {
  displayLabel,
  center,
  u,
  v,
  n,
  width,
  height,
  radius,
  color,
  prefix,
  faceDirectionRaw,
  doubleSided,
}) {
  const chars = [...displayLabel.toUpperCase()];
  const margin = width * 0.10;
  const cell = (width - margin * 2) / Math.max(chars.length, 1);
  const glyphHeight = height * 0.70;
  const y0 = -glyphHeight * 0.5;
  const front = n.clone().normalize().multiplyScalar(radius * 1.6);
  chars.forEach((ch, charIndex) => {
    const x0 = -width * 0.5 + margin + charIndex * cell;
    glyphStrokes(ch).forEach(([[x1, y1], [x2, y2]], strokeIndex) => {
      const p1 = center.clone()
        .add(u.clone().multiplyScalar(x0 + x1 * cell))
        .add(v.clone().multiplyScalar(y0 + y1 * glyphHeight))
        .add(front);
      const p2 = center.clone()
        .add(u.clone().multiplyScalar(x0 + x2 * cell))
        .add(v.clone().multiplyScalar(y0 + y2 * glyphHeight))
        .add(front);
      const stroke = cylinderBetween(
        `${prefix}-stroke-${ch}-${charIndex}-${strokeIndex}`,
        p1,
        p2,
        radius,
        color,
        { radialSegments: 8, emissive: color, materialOptions: { side: THREE.DoubleSide, emissiveIntensity: 0.30 } },
      );
      if (stroke) {
        stampNodeAnnotation(stroke, comp, attrs, {
          part: 'label',
          role: 'node-label-cross-billboard-3d-stroke',
          faceDirection: n,
          faceDirectionRaw,
          doubleSided,
          exportLabel: false,
        });
        stroke.userData.NODE_LABEL_GEOMETRY_MODE = 'CROSS_BILLBOARD_3D_STROKE_TEXT';
        stroke.userData.NODE_LABEL_TEXT_PLANE = prefix.endsWith('-x') ? '+X' : '+Z';
        group.add(stroke);
      }
    });
  });
}

function addCrossBillboardText(group, comp, attrs, {
  labelAnchor,
  displayLabel,
  scale,
  faceDirectionRaw,
  doubleSided,
}) {
  const width = Math.max(scale * 2.35, scale * 0.48 * Math.max(displayLabel.length, 1));
  const height = Math.max(scale * 0.74, 2.4);
  const radius = Math.max(scale * 0.022, 0.10);
  const color = 0xe0f2fe;

  const planes = [
    { suffix: 'z', u: X_AXIS.clone(), v: Y_AXIS.clone(), n: Z_AXIS.clone() },
    { suffix: 'x', u: Z_AXIS.clone(), v: Y_AXIS.clone(), n: X_AXIS.clone() },
  ];

  planes.forEach(({ suffix, u, v, n }) => {
    addStrokeTextPlane(group, comp, attrs, {
      displayLabel,
      center: labelAnchor,
      u,
      v,
      n,
      width,
      height,
      radius,
      color,
      prefix: `node-annotation-label-cross-${suffix}:${displayLabel}`,
      faceDirectionRaw,
      doubleSided,
    });
  });
}

export function buildNodeLabelObject(comp = {}) {
  const attrs = attrsOf(comp);
  const pt = point3(comp.coOrds || comp.centrePoint || comp.ep1);
  const label = nodeLabelText(comp, attrs);
  const displayLabel = nodeLabelDisplayText(label);
  if (!pt || !label) return null;

  const bore = number(comp.bore ?? attrs.BORE ?? attrs.OutsideDiameter, 20);
  const scale = Math.max(6, Math.min(36, number(attrs.NODE_LABEL_SCALE ?? comp.nodeLabelScale, bore * 0.45 || 10)));
  const markerRadius = Math.max(scale * 0.12, 0.8);
  const { top, side } = labelOffsetBasis(comp, attrs);
  const { raw: faceDirectionRaw, vector: faceDirectionVector } = labelFaceDirection(comp, attrs);
  const doubleSided = nodeLabelDoubleSided(comp, attrs);
  const plateVisible = staticPlateVisible(comp, attrs);
  const bakedTextVisible = crossBillboardTextVisible(comp, attrs);
  const sideSign = staggerSign(attrs.NODE_LABEL_INDEX ?? comp.nodeLabelIndex);
  const labelAnchor = pt.clone()
    .add(top.clone().multiplyScalar(scale * 1.85))
    .add(side.clone().multiplyScalar(scale * 1.35 * sideSign));

  const group = new THREE.Group();
  group.name = `node-annotation:${label}`;

  const marker = new THREE.Mesh(new THREE.SphereGeometry(markerRadius, 12, 12), material(0x38bdf8, 0x0ea5e9));
  marker.name = `node-annotation-marker:${label}`;
  marker.position.copy(pt);
  stampNodeAnnotation(marker, comp, attrs, { part: 'marker', role: 'node-marker', faceDirection: faceDirectionVector, faceDirectionRaw, doubleSided, exportLabel: false });
  group.add(marker);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(markerRadius * 1.85, markerRadius * 0.12, 8, 28), material(0xe0f2fe, 0x38bdf8));
  ring.name = `node-annotation-ring:${label}`;
  ring.position.copy(pt);
  ring.quaternion.setFromUnitVectors(Z_AXIS, top);
  stampNodeAnnotation(ring, comp, attrs, { part: 'marker', role: 'node-marker-ring', faceDirection: faceDirectionVector, faceDirectionRaw, doubleSided, exportLabel: false });
  group.add(ring);

  const leader = cylinderBetween(`node-annotation-leader:${label}`, pt, labelAnchor, Math.max(markerRadius * 0.18, 0.16), 0x93c5fd);
  if (leader) {
    stampNodeAnnotation(leader, comp, attrs, { part: 'leader', role: 'node-leader', faceDirection: faceDirectionVector, faceDirectionRaw, doubleSided, exportLabel: false });
    group.add(leader);
  }

  // Static/baked plates are omitted by default, not merely hidden. A plate is
  // exported only when the user explicitly opts into NODE_LABEL_STATIC_PLATE_VISIBLE
  // / NODE_LABEL_BAKED_PLATE_VISIBLE.
  if (plateVisible) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(scale * 3.0, scale * 1.05), labelMaterial(0x0f172a, 0x075985, attrs, comp));
    plate.name = `node-annotation-label:${label}`;
    plate.position.copy(labelAnchor);
    orientPlaneNormal(plate, faceDirectionVector);
    stampNodeAnnotation(plate, comp, attrs, { part: 'label', role: 'node-label-static-plate', faceDirection: faceDirectionVector, faceDirectionRaw, doubleSided, exportLabel: false });
    plate.userData.NOTE = `Runtime CSS2D display label is ${displayLabel}; raw node label is available as NODE_LABEL.`;
    plate.userData.NODE_LABEL_STATIC_PLATE_VISIBLE = true;
    group.add(plate);
  }

  // Portable GLB text. This is real 3D stroke geometry duplicated on +Z and +X
  // text planes so external GLB viewers can read node numbers without CSS2D.
  if (bakedTextVisible) {
    addCrossBillboardText(group, comp, attrs, { labelAnchor, displayLabel, scale, faceDirectionRaw, doubleSided });
  }

  // Optional label anchor consumed by glbLabelOverlayFinal.js in Basic GLB/PCF.
  const overlayAnchor = new THREE.Group();
  overlayAnchor.name = `node-label:${label}`;
  overlayAnchor.position.copy(labelAnchor);
  stampNodeAnnotation(overlayAnchor, comp, attrs, {
    part: 'label-anchor',
    role: 'node-label-css2d-anchor',
    faceDirection: faceDirectionVector,
    faceDirectionRaw,
    doubleSided,
    exportLabel: true,
    labelAnchor: true,
  });
  overlayAnchor.userData.NOTE = `Camera-facing Basic viewer label is ${displayLabel}; portable GLB cross-billboard 3D text is ${bakedTextVisible ? 'exported' : 'disabled'}; static plate is ${plateVisible ? 'visible' : 'not exported'} by default.`;
  group.add(overlayAnchor);

  stampNodeAnnotation(group, comp, attrs, { part: 'node', role: 'node-annotation-group', faceDirection: faceDirectionVector, faceDirectionRaw, doubleSided, exportLabel: false });
  group.userData = {
    ...group.userData,
    nodeCoordinate: { x: pt.x, y: pt.y, z: pt.z },
    labelAnchor: { x: labelAnchor.x, y: labelAnchor.y, z: labelAnchor.z },
    labelFaceDirection: { x: faceDirectionVector.x, y: faceDirectionVector.y, z: faceDirectionVector.z },
    labelFaceDirectionRaw: faceDirectionRaw,
    labelDoubleSided: doubleSided,
    labelReadableBothSides: doubleSided,
    labelRuntimeOverlay: true,
    labelStaticPlateVisible: plateVisible,
    labelStaticPlateExported: plateVisible,
    labelCrossBillboard3dTextVisible: bakedTextVisible,
    labelGeometryMode: 'cross-billboard-3d-stroke-text-plus-optional-css2d-anchor',
    labelPlacementContract: 'node-marker-centreline-leader-no-arrow-label-offset-from-pipe-cross-billboard-3d-text-external-viewer-safe',
  };

  return group;
}
