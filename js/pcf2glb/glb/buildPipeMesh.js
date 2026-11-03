import * as THREE from 'three';

export function buildPipeMesh(comp) {
  if (!comp.ep1 || !comp.ep2) {
      throw new Error(`Invalid pipe endpoints for ${comp.id}`);
  }

  const p1 = new THREE.Vector3(comp.ep1.x, comp.ep1.y, comp.ep1.z);
  const p2 = new THREE.Vector3(comp.ep2.x, comp.ep2.y, comp.ep2.z);

  const dir = new THREE.Vector3().subVectors(p2, p1);
  const length = dir.length();

  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`Invalid pipe length for ${comp.id}`);
  }

  const radius = Math.max((comp.bore || 10) / 2, 0.5);

  const geom = new THREE.CylinderGeometry(radius, radius, length, 16);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d74c5 });
  const mesh = new THREE.Mesh(geom, mat);

  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  mesh.position.copy(mid);

  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );

  mesh.name = comp.id;
  const attrs = comp.attributes || {};
  mesh.userData = {
    pcfType: comp.type,
    pcfId: comp.id,
    // COMPONENT-ATTRIBUTE97 is the standard PCF reference-number field
    refNo: comp.refNo || attrs['COMPONENT-ATTRIBUTE97'] || '',
    bore: comp.bore || null,
    ...attrs,
  };

  return mesh;
}
