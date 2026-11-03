import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function vectorFromPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  return [x, y, z].every(Number.isFinite) ? new THREE.Vector3(x, y, z) : null;
}

function midpoint(a, b) {
  return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
}

function safeAxis(a, b, fallback = Z_AXIS) {
  const dir = new THREE.Vector3().subVectors(b, a);
  return dir.length() < 0.01 ? fallback.clone() : dir.normalize();
}

function perpendicularAxis(axis) {
  const basis = Math.abs(axis.dot(UP)) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
  const side = new THREE.Vector3().crossVectors(axis, basis);
  return side.length() < 0.01 ? new THREE.Vector3(1, 0, 0) : side.normalize();
}

function orientFromZ(object, direction) {
  if (!object || !direction || direction.length() < 0.01) return;
  object.quaternion.setFromUnitVectors(Z_AXIS, direction.clone().normalize());
}

function teeRadius(comp = {}) {
  return Math.max((Number(comp.bore) || Number(comp.ep1?.bore) || Number(comp.ep2?.bore) || 20) / 2, 0.5);
}

function teeLabel(comp = {}) {
  return comp.label || comp.name || comp.refNo || comp.attributes?.COMPONENT_IDENTIFIER || comp.id || 'TEE';
}

function makeTeeMesh(name, geometry, color, userData) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04 }),
  );
  mesh.name = name;
  mesh.userData = userData;
  return mesh;
}

export function enhanceTeeBodyProxy(object, comp = {}) {
  if (!object || comp.type !== 'TEE') return object;
  if (object.getObjectByName(`${comp.id}-tee-body-hub`)) return object;

  const p1 = vectorFromPoint(comp.ep1 || comp.centrePoint || comp.coOrds);
  const p2 = vectorFromPoint(comp.ep2 || comp.branch1Point || comp.centrePoint || comp.coOrds);
  if (!p1 || !p2 || p1.distanceTo(p2) < 0.1) return object;

  const radius = teeRadius(comp);
  const axis = safeAxis(p1, p2);
  const center = midpoint(p1, p2);
  const branchPoint = vectorFromPoint(comp.branch1Point);
  const branchDir = branchPoint
    ? safeAxis(center, branchPoint, perpendicularAxis(axis))
    : perpendicularAxis(axis);
  const labelText = teeLabel(comp);
  const userData = {
    ...(object.userData || {}),
    labelText,
    glbShape: 'tee-body-union-proxy',
    teeProxy: true,
  };

  const hub = makeTeeMesh(
    `${comp.id}-tee-body-hub`,
    new THREE.SphereGeometry(radius * 1.18, 24, 16),
    0x3c9d55,
    userData,
  );
  hub.position.copy(center);
  object.add(hub);

  const mainSaddle = makeTeeMesh(
    `${comp.id}-tee-main-saddle`,
    new THREE.TorusGeometry(radius * 1.03, Math.max(radius * 0.11, 0.8), 8, 36),
    0x2f7d45,
    userData,
  );
  mainSaddle.position.copy(center);
  orientFromZ(mainSaddle, axis);
  object.add(mainSaddle);

  const branchSaddle = makeTeeMesh(
    `${comp.id}-tee-branch-saddle`,
    new THREE.TorusGeometry(radius * 0.92, Math.max(radius * 0.10, 0.7), 8, 36),
    0x2f7d45,
    userData,
  );
  branchSaddle.position.copy(center.clone().add(branchDir.clone().multiplyScalar(radius * 0.25)));
  orientFromZ(branchSaddle, branchDir);
  object.add(branchSaddle);

  object.userData = userData;
  return object;
}
