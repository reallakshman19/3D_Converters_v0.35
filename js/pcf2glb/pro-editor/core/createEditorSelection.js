import * as THREE from 'three';

export function createSelection(cameraOrGetter, scene, domElement) {
  const getCamera = typeof cameraOrGetter === 'function'
    ? cameraOrGetter
    : () => cameraOrGetter;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let selectHandler = null;

  function onPointerDown(event) {
    const camera = getCamera();
    if (!camera) return;

    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const meshHit = hits.find(h => h.object?.isMesh || h.object?.type === 'Mesh');

    selectHandler?.(meshHit ? resolveInspectableObject(meshHit.object) : null);
  }

  domElement.addEventListener('pointerdown', onPointerDown);

  return {
    onSelect(cb) {
      selectHandler = cb;
    },
    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown);
    }
  };
}

export function resolveInspectableObject(object) {
  let cursor = object;
  while (cursor && cursor.parent) {
    if (cursor.userData?.pcfId || cursor.userData?.REF_NO || cursor.userData?.pcfType) {
      return cursor;
    }
    cursor = cursor.parent;
  }
  return object;
}
