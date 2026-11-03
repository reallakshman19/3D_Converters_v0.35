import * as THREE from 'three';

function shouldHideLabelAnchor(object) {
  const data = object?.userData || {};
  const name = String(object?.name || '');
  return Boolean(
    data.labelAnchor === true
    || data.labelKind
    || data.glbShape === 'node-label-anchor'
    || name.startsWith('label:')
    || name.startsWith('node-label:')
  );
}

function makeInvisibleMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  });
}

export function hideGlbLabelAnchorMarkers(root) {
  if (!root?.traverse) return { hidden: 0 };

  let hidden = 0;
  root.traverse((object) => {
    if (!object?.isMesh || !shouldHideLabelAnchor(object)) return;
    object.material = makeInvisibleMaterial();
    object.renderOrder = -1;
    object.userData = {
      ...(object.userData || {}),
      labelMarkerHidden: true,
    };
    hidden += 1;
  });

  root.userData = {
    ...(root.userData || {}),
    hiddenLabelAnchorMarkerCount: hidden,
  };

  return { hidden };
}
