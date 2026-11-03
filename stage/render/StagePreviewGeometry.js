import * as THREE from 'three';

const COLORS = {
  native: 0x60a5fa,
  box: 0x94a3b8,
  facet: 0xf59e0b,
  diagnostic: 0xef4444,
  selection: 0x22c55e,
};

export function createPreviewObject(entry, primitive) {
  if (!entry || entry.output === 'hidden') return null;
  if (entry.diagnosticOnly || entry.renderKind === 'UNKNOWN_DIAGNOSTIC') return bboxWire(entry.bboxWorld, COLORS.diagnostic);
  if (entry.renderKind === 'CYLINDER') return cylinderObject(entry, primitive);
  if (entry.renderKind === 'BOX') return boxObject(entry.bboxWorld, false);
  if (entry.renderKind === 'FACET_GROUP') return facetProxy(entry.bboxWorld);
  if (entry.renderKind === 'ELBOW') return elbowObject(entry, primitive);
  return bboxWire(entry.bboxWorld, COLORS.diagnostic);
}

export function createSelectionBox(bboxWorld) {
  return bboxWire(bboxWorld, COLORS.selection);
}

function cylinderObject(entry, primitive) {
  const bbox = entry.bboxWorld;
  if (!isBbox(bbox)) return bboxWire(bbox, COLORS.diagnostic);
  const size = bboxSize(bbox);
  const axis = longestAxis(size);
  const length = Math.max(size[axis], 0.001);
  const radius = radiusForCylinder(primitive, size, axis);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24, 1), material(COLORS.native));
  orientCylinder(mesh, axis);
  mesh.position.copy(centerOf(bbox));
  return mesh;
}

function boxObject(bbox, wire = false) {
  if (!isBbox(bbox)) return null;
  const size = bboxSize(bbox);
  const geometry = new THREE.BoxGeometry(Math.max(size[0], 0.001), Math.max(size[1], 0.001), Math.max(size[2], 0.001));
  const mesh = new THREE.Mesh(geometry, material(COLORS.box, wire));
  mesh.position.copy(centerOf(bbox));
  return mesh;
}

function facetProxy(bbox) {
  const box = boxObject(bbox, true);
  if (!box) return null;
  box.material.color.setHex(COLORS.facet);
  box.scale.y = Math.max(box.scale.y * 0.35, 0.08);
  return box;
}

function elbowObject(entry, primitive) {
  const bbox = entry.bboxWorld;
  const params = primitive?.nativeGeometry?.nativeParams || primitive?.nativeParams || primitive?.params || {};
  const tubeRadius = Number(params.radius);
  const bendRadius = Number(params.bendRadius);
  const angleDeg = Number(params.angleDeg || 90);
  if (!isBbox(bbox) || !tubeRadius || !bendRadius) return bboxWire(bbox, COLORS.diagnostic);
  const geometry = new THREE.TorusGeometry(bendRadius, tubeRadius, 16, 36, THREE.MathUtils.degToRad(angleDeg));
  const mesh = new THREE.Mesh(geometry, material(COLORS.native));
  mesh.position.copy(centerOf(bbox));
  return mesh;
}

function bboxWire(bbox, color) {
  if (!isBbox(bbox)) return null;
  const size = bboxSize(bbox).map((value) => Math.max(value, 0.001));
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size[0], size[1], size[2]));
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
  line.position.copy(centerOf(bbox));
  return line;
}

function material(color, wireframe = false) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, wireframe });
}

function radiusForCylinder(primitive, size, axis) {
  const value = Number(primitive?.params?.radius);
  if (Number.isFinite(value) && value > 0) return value;
  const minors = size.filter((_, index) => index !== axis);
  return Math.max(Math.min(...minors) / 2, 0.001);
}

function orientCylinder(mesh, axis) {
  if (axis === 0) mesh.rotation.z = Math.PI / 2;
  if (axis === 2) mesh.rotation.x = Math.PI / 2;
}

function longestAxis(size) {
  return size.indexOf(Math.max(...size));
}

function centerOf(bbox) {
  return new THREE.Vector3((bbox[0] + bbox[3]) / 2, (bbox[1] + bbox[4]) / 2, (bbox[2] + bbox[5]) / 2);
}

function bboxSize(bbox) {
  return [bbox[3] - bbox[0], bbox[4] - bbox[1], bbox[5] - bbox[2]];
}

function isBbox(value) {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite);
}
