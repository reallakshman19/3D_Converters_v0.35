import * as THREE from 'three';

export function attachStagePreviewPicking(rendererState, onSelect) {
  if (!rendererState || rendererState.picking) return rendererState?.picking;
  const canvas = rendererState.renderer.domElement;
  const picking = { onSelect, startX: 0, startY: 0 };
  picking.onPointerDown = (event) => {
    picking.startX = event.clientX;
    picking.startY = event.clientY;
  };
  picking.onClick = (event) => {
    if (dragDistance(picking, event) > 6) return;
    const ref = makeStageSelectionRefFromObject(pickStagePreviewObject(rendererState, event.clientX, event.clientY));
    if (ref) picking.onSelect?.(ref);
  };
  canvas.addEventListener('pointerdown', picking.onPointerDown);
  canvas.addEventListener('click', picking.onClick);
  rendererState.picking = picking;
  return picking;
}

export function detachStagePreviewPicking(rendererState) {
  const picking = rendererState?.picking;
  if (!picking) return;
  const canvas = rendererState.renderer.domElement;
  canvas.removeEventListener('pointerdown', picking.onPointerDown);
  canvas.removeEventListener('click', picking.onClick);
  rendererState.picking = null;
}

export function pickStagePreviewObject(rendererState, clientX, clientY) {
  if (!rendererState?.rootGroup) return null;
  const bounds = rendererState.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
    -(((clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1),
  );
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = Math.max((rendererState.cameraControls?.radius || 1) * 0.01, 0.02);
  raycaster.setFromCamera(pointer, rendererState.camera);
  const hit = raycaster.intersectObjects(rendererState.rootGroup.children, true)[0];
  return hit?.object || null;
}

export function makeStageSelectionRefFromObject(object) {
  const data = firstStageData(object);
  if (!data) return null;
  if (data.primitiveId) return { type: 'primitive', id: data.primitiveId };
  if (data.componentId) return { type: 'component', id: data.componentId };
  if (data.nodeId) return { type: 'node', id: data.nodeId };
  return null;
}

function firstStageData(object) {
  let current = object;
  while (current) {
    const data = current.userData || {};
    if (data.primitiveId || data.componentId || data.nodeId) return data;
    current = current.parent;
  }
  return null;
}

function dragDistance(picking, event) {
  return Math.hypot(event.clientX - picking.startX, event.clientY - picking.startY);
}
