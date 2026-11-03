import * as THREE from 'three';

export function boxToClippingPlanes(box) {
  const { min, max } = box;
  return [
    new THREE.Plane(new THREE.Vector3( 1, 0, 0), -max.x),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0),  min.x),
    new THREE.Plane(new THREE.Vector3( 0, 1, 0), -max.y),
    new THREE.Plane(new THREE.Vector3( 0,-1, 0),  min.y),
    new THREE.Plane(new THREE.Vector3( 0, 0, 1), -max.z),
    new THREE.Plane(new THREE.Vector3( 0, 0,-1),  min.z),
  ];
}

export function createSectionBox(scene, renderer) {
  let enabled = false;
  let currentPlanes = [];
  const helper = new THREE.Box3Helper(new THREE.Box3());
  helper.visible = false;
  scene.add(helper);

  const applyToHierarchy = (root, planes) => {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        mat.clippingPlanes = planes;
        mat.clipShadows = true;
        mat.needsUpdate = true;
      }
    });
  };

  return {
    isEnabled: () => enabled,
    enable: () => {
      enabled = true;
      renderer.localClippingEnabled = true;
      helper.visible = true;
    },
    disable: (root) => {
      enabled = false;
      renderer.localClippingEnabled = false;
      helper.visible = false;
      if (root) applyToHierarchy(root, null);
    },
    setBox: (box, root) => {
      if (!enabled) return;
      helper.box.copy(box);
      currentPlanes = boxToClippingPlanes(box);
      if (root) applyToHierarchy(root, currentPlanes);
    },
    fitToScene: (root) => {
      if (!root) return;
      const box = new THREE.Box3().setFromObject(root, false);
      helper.box.copy(box);
      currentPlanes = boxToClippingPlanes(box);
      applyToHierarchy(root, currentPlanes);
    },
    fitToSelection: (object3D, root) => {
      if (!object3D || !root) return;
      const box = new THREE.Box3().setFromObject(object3D, true);
      // Pad it slightly
      box.expandByScalar(Math.max((box.max.x - box.min.x)*0.2, 5));
      helper.box.copy(box);
      currentPlanes = boxToClippingPlanes(box);
      applyToHierarchy(root, currentPlanes);
    },
    setClipBounds: ({ minX, maxX, minY, maxY, minZ, maxZ }) => {
      if (!enabled) return;
      const box = new THREE.Box3(
        new THREE.Vector3(minX, minY, minZ),
        new THREE.Vector3(maxX, maxY, maxZ)
      );
      helper.box.copy(box);
      currentPlanes = boxToClippingPlanes(box);
      // Re-apply clipping planes to the whole scene
      scene.traverse(obj => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => { mat.clippingPlanes = currentPlanes; mat.needsUpdate = true; });
      });
    }
  };
}
