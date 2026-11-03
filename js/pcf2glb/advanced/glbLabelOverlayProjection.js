import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

const _world = new THREE.Vector3();
const _screen = new THREE.Vector3();

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function showElement(element, show) {
  if (!element) return;
  element.style.display = show ? 'block' : 'none';
  element.style.visibility = show ? 'visible' : 'hidden';
}

function forceProjectLabelChild(child, camera, container) {
  if (child?.userData?.type !== 'glb-userdata-label') return { projected: 0, hidden: 0 };
  const element = child.element;
  if (!element) return { projected: 0, hidden: 0 };
  const width = Number(container?.clientWidth) || Number(container?.offsetWidth) || 0;
  const height = Number(container?.clientHeight) || Number(container?.offsetHeight) || 0;
  if (!camera || !width || !height) return { projected: 0, hidden: 0 };

  if (child.visible === false) {
    showElement(element, false);
    return { projected: 0, hidden: 1 };
  }

  child.getWorldPosition(_world);
  _screen.copy(_world).project(camera);

  const inFrustum = isFiniteNumber(_screen.x) && isFiniteNumber(_screen.y) && isFiniteNumber(_screen.z)
    && _screen.z >= -1.25 && _screen.z <= 1.25;
  if (!inFrustum) {
    showElement(element, false);
    return { projected: 0, hidden: 1 };
  }

  const x = (_screen.x * 0.5 + 0.5) * width;
  const y = (-_screen.y * 0.5 + 0.5) * height;

  showElement(element, true);
  element.style.position = 'absolute';
  element.style.left = '0px';
  element.style.top = '0px';
  element.style.zIndex = '2147483000';
  element.style.pointerEvents = 'none';
  element.style.willChange = 'transform';
  element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -135%)`;

  const parent = element.parentElement;
  if (parent) {
    parent.style.position = 'absolute';
    parent.style.left = '0px';
    parent.style.top = '0px';
    parent.style.width = '100%';
    parent.style.height = '100%';
    parent.style.overflow = 'visible';
    parent.style.pointerEvents = 'none';
    parent.style.zIndex = '2147482990';
  }

  return { projected: 1, hidden: 0 };
}

function forceProjectGlbLabelsInTree(root, camera, container) {
  if (!root?.traverse || !camera || !container) return { projected: 0, hidden: 0 };
  camera.updateMatrixWorld?.(true);
  camera.updateProjectionMatrix?.();
  root.updateMatrixWorld?.(true);

  let projected = 0;
  let hidden = 0;
  root.traverse((object) => {
    const result = forceProjectLabelChild(object, camera, container);
    projected += result.projected;
    hidden += result.hidden;
  });
  return { projected, hidden };
}

/**
 * Force-project GLB metadata label elements to screen coordinates after the
 * CSS2DRenderer has rendered. This is a defensive viewer-side path for labels
 * that are collected correctly but remain invisible because of CSS2D DOM stack,
 * transform, clipping, or stale renderer styling issues in the Basic GLB-PCF
 * workspace.
 *
 * The function does not create labels. It only repositions the existing
 * CSS2DObject DOM elements created by installGlbLabelOverlay().
 */
export function forceProjectGlbLabels(labelGroup, camera, container) {
  if (!labelGroup || !camera || !container) return { projected: 0, hidden: 0 };
  const result = forceProjectGlbLabelsInTree(labelGroup, camera, container);
  labelGroup.userData = {
    ...(labelGroup.userData || {}),
    glbForcedLabelProjection: true,
    glbForcedLabelProjectedCount: result.projected,
    glbForcedLabelHiddenCount: result.hidden,
  };
  return result;
}

function patchCss2dRenderer() {
  if (!CSS2DRenderer?.prototype || CSS2DRenderer.prototype.__bmCiiGlbLabelProjectionPatch) return;
  const originalRender = CSS2DRenderer.prototype.render;
  if (typeof originalRender !== 'function') return;
  CSS2DRenderer.prototype.__bmCiiGlbLabelProjectionPatch = true;
  CSS2DRenderer.prototype.render = function patchedCss2dRender(scene, camera) {
    const result = originalRender.call(this, scene, camera);
    const container = this.domElement;
    const stats = forceProjectGlbLabelsInTree(scene, camera, container);
    if (stats.projected || stats.hidden) {
      this.domElement.dataset.glbForcedLabelProjection = 'true';
      this.domElement.dataset.glbForcedLabelProjectedCount = String(stats.projected);
      this.domElement.dataset.glbForcedLabelHiddenCount = String(stats.hidden);
    }
    return result;
  };
}

patchCss2dRenderer();
