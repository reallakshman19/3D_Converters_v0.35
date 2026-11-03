import * as THREE from 'three';

export function resolveInspectableObject(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData?.glbSupportSymbolMesh || cur.userData?.glbSupportSymbolRole) {
      cur = cur.parent;
      continue;
    }
    if (cur.userData?.glbSupportSymbol) return cur;
    if (String(cur.userData?.glbShape || '').startsWith('support-reference-v2-')) return null;
    if (cur.userData?.pcfId || cur.userData?.REF_NO || cur.userData?.id) return cur;
    if (Object.keys(cur.userData || {}).length > 0) return cur;
    cur = cur.parent;
  }
  return obj;
}

function cloneMaterialForHighlight(material) {
  if (!material || typeof material.clone !== 'function') return material;
  const cloned = material.clone();
  if (cloned.emissive?.setHex) {
    cloned.emissive.setHex(0x3b82f6);
    cloned.emissiveIntensity = Math.max(0.8, Number(cloned.emissiveIntensity || 0));
  } else if (cloned.color?.setHex) {
    cloned.color.setHex(0x3b82f6);
  }
  cloned.needsUpdate = true;
  return cloned;
}

function highlightObject(object) {
  object.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    if (node.userData.originalSelectionMaterial === undefined) node.userData.originalSelectionMaterial = node.material;
    if (Array.isArray(node.material)) node.material = node.material.map(cloneMaterialForHighlight);
    else node.material = cloneMaterialForHighlight(node.material);
  });
}

function restoreHighlightObject(object) {
  object.traverse((node) => {
    if (!node.isMesh || node.userData.originalSelectionMaterial === undefined) return;
    const highlighted = node.material;
    node.material = node.userData.originalSelectionMaterial;
    delete node.userData.originalSelectionMaterial;
    const disposeOne = (mat) => {
      if (mat && mat !== node.material && typeof mat.dispose === 'function') mat.dispose();
    };
    if (Array.isArray(highlighted)) highlighted.forEach(disposeOne);
    else disposeOne(highlighted);
  });
}

export function createSelection(getCamera, scene, domElement) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  let selectionCallback = null;
  let activeHighlightObject = null;
  let pointerStart = null;

  const selectAt = (e) => {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, getCamera());
    const intersects = raycaster.intersectObjects(scene.children, true);

    let clickedObject = null;
    for (const intersect of intersects) {
      if (intersect.object.type === 'Mesh') {
        clickedObject = resolveInspectableObject(intersect.object);
        if (clickedObject) break;
      }
    }

    if (activeHighlightObject && activeHighlightObject !== clickedObject) restoreHighlightObject(activeHighlightObject);
    if (clickedObject && activeHighlightObject !== clickedObject) highlightObject(clickedObject);

    activeHighlightObject = clickedObject;
    if (selectionCallback) selectionCallback(clickedObject);
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };

  const onPointerUp = (event) => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
      pointerStart = null;
      return;
    }
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (distance > 4) return;
    try {
      selectAt(event);
    } catch (error) {
      console.error('Selection failed. Please check the browser console for the full error.', error);
    }
  };

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointerup', onPointerUp);

  return {
    onSelect: (fn) => { selectionCallback = fn; },
    dispose: () => {
      if (activeHighlightObject) restoreHighlightObject(activeHighlightObject);
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointerup', onPointerUp);
    }
  };
}
