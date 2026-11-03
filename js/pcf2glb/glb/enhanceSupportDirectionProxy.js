import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const KIND_COLORS = {
  REST: 0x22c55e,
  GUIDE: 0x22c55e,
  LINESTOP: 0x16a34a,
  LIMIT: 0x84cc16,
  ANCHOR: 0xef4444,
  SPRING: 0xa855f7,
  HANGER: 0xa855f7,
  SHOE: 0x22c55e,
  UNKNOWN: 0x94a3b8,
};

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
  return {
    ...(comp.raw || {}),
    ...(comp.attributes || {}),
    ...(object?.userData || {}),
  };
}

function supportKind(attrs = {}, comp = {}) {
  const kind = upper(comp.supportKind || attrs.supportKind || attrs.SUPPORT_KIND || attrs.CAESAR_SUPPORT_KIND || attrs.caesarSupportKind || attrs.CMPSUPTYPE || attrs.SKEY);
  if (kind === 'LINE_STOP') return 'LINESTOP';
  if (kind === 'HANGER') return 'HANGER';
  if (KIND_COLORS[kind]) return kind;
  return 'UNKNOWN';
}

function cosineAxis(attrs = {}) {
  const x = number(attrs.caesarXCosine ?? attrs.XCOSINE ?? attrs.X_COSINE ?? attrs.XCOS ?? attrs.X);
  const y = number(attrs.caesarYCosine ?? attrs.YCOSINE ?? attrs.Y_COSINE ?? attrs.YCOS ?? attrs.Y);
  const z = number(attrs.caesarZCosine ?? attrs.ZCOSINE ?? attrs.Z_COSINE ?? attrs.ZCOS ?? attrs.Z);
  if ([x, y, z].some((value) => value == null)) return null;
  const axis = new THREE.Vector3(x, y, z);
  return axis.length() < 0.01 ? null : axis.normalize();
}

function textAxis(attrs = {}) {
  const src = upper([
    attrs.SUPPORT_DIRECTION,
    attrs['SUPPORT-DIRECTION'],
    attrs.SUPPORT_NAME,
    attrs.SUPPORT_TAG,
    attrs.labelText,
  ].join(' '));
  if (/\bX\b|\bEAST\b|\bWEST\b/.test(src)) return X_AXIS.clone();
  if (/\bY\b|\bUP\b|\bDOWN\b|\bVERTICAL\b/.test(src)) return Y_AXIS.clone();
  if (/\bZ\b|\bNORTH\b|\bSOUTH\b/.test(src)) return Z_AXIS.clone();
  return null;
}

function supportAxis(attrs = {}) {
  return cosineAxis(attrs) || textAxis(attrs) || Z_AXIS.clone();
}

function supportScaleFor(comp = {}, attrs = {}, options = {}) {
  const bore = number(comp.bore ?? attrs.bore ?? attrs.BORE ?? attrs.DIAMETER) || 100;
  const multiplier = number(options.supportSymbolScale) || 0.85;
  return Math.max(22, Math.min(150, bore * multiplier));
}

function perpendicular(axis) {
  const basis = Math.abs(axis.dot(UP)) > 0.9 ? X_AXIS : UP;
  const side = new THREE.Vector3().crossVectors(axis, basis);
  return side.length() < 0.01 ? X_AXIS.clone() : side.normalize();
}

function secondPerpendicular(axis, side) {
  const normal = new THREE.Vector3().crossVectors(axis, side);
  return normal.length() < 0.01 ? UP.clone() : normal.normalize();
}

function orientFromY(object, direction) {
  object.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
}

function orientFromZ(object, direction) {
  object.quaternion.setFromUnitVectors(Z_AXIS, direction.clone().normalize());
}

function supportMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.08,
    roughness: 0.38,
    metalness: 0.12,
  });
}

function addBox(group, name, size, position, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    supportMaterial(color),
  );
  mesh.name = name;
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

function addCylinder(group, name, radius, length, axis, position, color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 20),
    supportMaterial(color),
  );
  mesh.name = name;
  mesh.position.copy(position);
  orientFromY(mesh, axis);
  group.add(mesh);
  return mesh;
}

function addCone(group, name, coneRadius, height, axis, position, color) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(coneRadius, height, 24),
    supportMaterial(color),
  );
  cone.name = name;
  cone.position.copy(position);
  orientFromY(cone, axis);
  group.add(cone);
  return cone;
}

function addBasePad(group, id, radius, color, options = {}) {
  const y = options.y ?? -radius * 2.15;
  addBox(
    group,
    `${id}-reference-base-pad`,
    new THREE.Vector3(radius * 2.75, radius * 0.28, radius * 2.75),
    new THREE.Vector3(0, y, 0),
    color,
  );
}

function addReferencePost(group, id, radius, color, options = {}) {
  const y0 = options.y0 ?? -radius * 1.35;
  const length = options.length ?? radius * 2.35;
  addCylinder(
    group,
    `${id}-reference-post`,
    Math.max(radius * 0.10, 0.9),
    length,
    UP,
    new THREE.Vector3(0, y0 + length / 2, 0),
    color,
  );
}

function addPlate(group, name, axis, radius, color, offsetScale = 1.15) {
  const a = axis.clone().normalize();
  const side = perpendicular(a);
  const vertical = secondPerpendicular(a, side);
  const plate = addBox(
    group,
    name,
    new THREE.Vector3(radius * 0.16, radius * 1.25, radius * 1.25),
    a.clone().multiplyScalar(radius * offsetScale),
    color,
  );
  plate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, vertical, side));
  return plate;
}

function addArrow(group, name, axis, radius, dist, color) {
  const a = axis.clone().normalize();
  const shaftLength = radius * 1.35;
  const headLength = radius * 0.82;
  const shaftCenter = a.clone().multiplyScalar(Math.max(0, dist - headLength - shaftLength / 2));
  const headCenter = a.clone().multiplyScalar(dist - headLength / 2);
  addCylinder(group, `${name}-shaft`, Math.max(radius * 0.055, 0.55), shaftLength, a, shaftCenter, color);
  const head = addCone(group, name, radius * 0.28, headLength, a, headCenter, color);
  return head;
}

function addAxisArrowPair(group, id, axis, radius, color, label) {
  const a = axis.clone().normalize();
  addArrow(group, `${id}-${label}-positive`, a, radius, radius * 2.25, color);
  addArrow(group, `${id}-${label}-negative`, a.clone().negate(), radius, radius * 2.25, color);
}

function addGuideBars(group, id, axis, radius, color) {
  const a = axis.clone().normalize();
  const side = perpendicular(a);
  addBasePad(group, id, radius, color);
  addBox(
    group,
    `${id}-guide-base`,
    new THREE.Vector3(radius * 2.75, radius * 0.28, radius * 2.75),
    new THREE.Vector3(0, -radius * 2.15, 0),
    color,
  );
  addReferencePost(group, id, radius, color);
  addCylinder(
    group,
    `${id}-guide-reference-post`,
    Math.max(radius * 0.10, 0.9),
    radius * 2.35,
    UP,
    new THREE.Vector3(0, -radius * 1.35 + (radius * 2.35) / 2, 0),
    color,
  );
  const barSize = new THREE.Vector3(radius * 0.18, radius * 1.65, radius * 0.28);
  const pos = a.clone().multiplyScalar(radius * 0.9).add(side.clone().multiplyScalar(radius * 0.18));
  const neg = a.clone().multiplyScalar(-radius * 0.9).add(side.clone().multiplyScalar(radius * 0.18));
  addBox(group, `${id}-guide-bar-positive`, barSize, pos, color);
  addBox(group, `${id}-guide-bar-negative`, barSize, neg, color);
  addAxisArrowPair(group, id, a, radius, color, 'guide-axis');
}

function addRestBase(group, id, axis, radius, color) {
  const a = axis.length() > 0.01 ? axis.clone().normalize() : UP.clone();
  addBasePad(group, id, radius, color);
  addReferencePost(group, id, radius, color, { y0: -radius * 1.85, length: radius * 2.15 });
  addBox(group, `${id}-rest-base`, new THREE.Vector3(radius * 2.45, radius * 0.32, radius * 1.75), new THREE.Vector3(0, -radius * 2.05, 0), color);
  addArrow(group, `${id}-rest-axis`, a.y > 0.3 ? a : UP, radius, radius * 1.95, color);
}

function addLineStop(group, id, axis, radius, color) {
  const a = axis.clone().normalize();
  addBasePad(group, id, radius, color);
  addReferencePost(group, id, radius, color);
  addPlate(group, `${id}-linestop-plate-positive`, a, radius, color, 0.92);
  addPlate(group, `${id}-linestop-plate-negative`, a.clone().negate(), radius, color, 0.92);
  addAxisArrowPair(group, id, a, radius, color, 'linestop-axis');
}

function addLimit(group, id, axis, radius, color) {
  const a = axis.clone().normalize();
  addBasePad(group, id, radius, color);
  addReferencePost(group, id, radius, color);
  addPlate(group, `${id}-limit-stop-plate`, a, radius, color, 0.98);
  addArrow(group, `${id}-limit-axis`, a, radius, radius * 2.35, color);
}

function addAnchor(group, id, radius, color) {
  addBasePad(group, id, radius, color);
  addBox(group, `${id}-anchor-block`, new THREE.Vector3(radius * 1.0, radius * 1.0, radius * 1.0), new THREE.Vector3(), color);
  [
    X_AXIS, X_AXIS.clone().negate(),
    Y_AXIS, Y_AXIS.clone().negate(),
    Z_AXIS, Z_AXIS.clone().negate(),
  ].forEach((axis, index) => addArrow(group, `${id}-anchor-axis-${index + 1}`, axis, radius * 0.75, radius * 2.25, color));
}

function addHanger(group, id, radius, color) {
  addCylinder(group, `${id}-hanger-rod`, Math.max(radius * 0.065, 0.65), radius * 3.9, UP, new THREE.Vector3(0, radius * 1.95, 0), color);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.72, Math.max(radius * 0.045, 0.5), 10, 28),
    supportMaterial(color),
  );
  ring.name = `${id}-hanger-ring`;
  ring.position.set(0, radius * 4.05, 0);
  orientFromZ(ring, UP);
  group.add(ring);
  addArrow(group, `${id}-hanger-load-axis`, UP.clone().negate(), radius * 0.8, radius * 1.1, color);
}

function addShoe(group, id, radius, color) {
  addBasePad(group, id, radius, color);
  addBox(group, `${id}-shoe-base`, new THREE.Vector3(radius * 2.4, radius * 0.32, radius * 1.55), new THREE.Vector3(0, -radius * 1.52, 0), color);
  addCylinder(group, `${id}-shoe-post`, radius * 0.14, radius * 1.7, UP, new THREE.Vector3(0, -radius * 0.75, 0), color);
}

export function enhanceSupportDirectionProxy(object, comp = {}, options = {}) {
  if (!object || comp.type !== 'SUPPORT') return object;
  const attrs = attrsFrom(object, comp);
  const kind = supportKind(attrs, comp);
  const axis = supportAxis(attrs);
  const radius = supportScaleFor(comp, attrs, options);
  const color = KIND_COLORS[kind] || KIND_COLORS.UNKNOWN;
  const id = text(comp.id || object.name || 'support');

  const markerGroup = new THREE.Group();
  markerGroup.name = `${id}-directional-symbols`;
  markerGroup.userData = {
    labelText: object.userData?.labelText || `${id} ${kind}`,
    labelAnchor: false,
    supportKind: kind,
    supportAxis: { x: axis.x, y: axis.y, z: axis.z },
    supportSymbolScale: radius,
    glbShape: `support-reference-v2-${kind.toLowerCase()}`,
  };

  if (kind === 'GUIDE') addGuideBars(markerGroup, id, axis, radius, color);
  else if (kind === 'LINESTOP') addLineStop(markerGroup, id, axis, radius, color);
  else if (kind === 'LIMIT') addLimit(markerGroup, id, axis, radius, color);
  else if (kind === 'ANCHOR') addAnchor(markerGroup, id, radius, color);
  else if (kind === 'SPRING' || kind === 'HANGER') addHanger(markerGroup, id, radius, color);
  else if (kind === 'SHOE') addShoe(markerGroup, id, radius, color);
  else addRestBase(markerGroup, id, axis.y > 0.5 ? axis : UP, radius, color);

  object.add(markerGroup);
  object.userData = {
    ...(object.userData || {}),
    supportKind: kind,
    supportAxis: { x: axis.x, y: axis.y, z: axis.z },
    supportSymbolScale: radius,
    directionalSupportEnhanced: true,
    directionalSupportSymbolCount: markerGroup.children.length,
    supportReferenceStyle: true,
  };
  return object;
}
