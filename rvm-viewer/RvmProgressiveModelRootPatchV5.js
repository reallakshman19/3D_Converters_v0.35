import * as THREE from 'three';
import { installRvmProgressiveModelRootPatch as installBaseProgressivePatch } from './RvmProgressiveModelRootPatchV4.js?v=20260620-rvm-no-duplicate-fit-1';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-progressive-model-root-patch-v5-no-hide-fit');
const MAX_RENDERED_FIT_OBJECTS = 8000;
const MIN_RENDERED_FIT_OBJECTS = 3;

export function installRvmProgressiveModelRootPatch(RvmViewer3D) {
  installBaseProgressivePatch(RvmViewer3D);
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[PATCH_FLAG]) return;

  proto.fitProgressiveBounds = function fitProgressiveBoundsNoHide(bounds, options = {}) {
    const entries = collectVisibleRenderedMeshBoxes(this, options.maxFitObjects || MAX_RENDERED_FIT_OBJECTS);
    const renderedBox = unionBoxes(entries.map((entry) => entry.box));
    const requestedBox = boxFromBounds(bounds || this?._progressiveModelBounds || null);
    const fitBox = entries.length >= MIN_RENDERED_FIT_OBJECTS && renderedBox && !renderedBox.isEmpty()
      ? renderedBox
      : requestedBox;

    if (!fitBox || fitBox.isEmpty()) return false;

    const diagnostics = {
      progressiveFitGuard: 'rendered-world-bounds-no-hide',
      renderedBoundsUsed: entries.length >= MIN_RENDERED_FIT_OBJECTS,
      noHideFitOutliers: true,
      objectCount: entries.length,
      renderedRadius: Number(boxRadius(renderedBox).toFixed(3)),
      requestedRadius: Number(boxRadius(requestedBox).toFixed(3)),
      duplicateFitSuppressionDisabledForVisibility: true,
    };

    this._progressiveModelBounds = boundsFromBox(fitBox);
    this._progressiveFitDiagnostics = diagnostics;
    this._progressiveLastSuccessfulFitAt = nowMs();
    this._modelDiag = Math.max(fitBox.getSize(new THREE.Vector3()).length(), 1);
    annotateProgressiveRoot(this, diagnostics);
    return fitBoxWithoutFullSceneTraversal(this, fitBox);
  };

  proto[PATCH_FLAG] = true;
}

function collectVisibleRenderedMeshBoxes(viewer, limit) {
  const entries = [];
  viewer?.modelGroup?.updateMatrixWorld?.(true);
  viewer?.modelGroup?.traverse?.((obj) => {
    if (entries.length >= limit) return;
    if (!obj?.isMesh || !obj.geometry || obj.userData?.supportSymbol || obj.visible === false) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (!box || box.isEmpty()) return;
    const diagonal = box.getSize(new THREE.Vector3()).length();
    if (!Number.isFinite(diagonal) || diagonal <= 0) return;
    entries.push({ object: obj, box, diagonal });
  });
  return entries;
}

function unionBoxes(boxes = []) {
  const out = new THREE.Box3();
  let any = false;
  for (const box of boxes) {
    if (!box || box.isEmpty()) continue;
    out.union(box);
    any = true;
  }
  return any ? out : null;
}

function annotateProgressiveRoot(viewer, diagnostics) {
  const root = viewer?._progressiveModelRoot || viewer?.modelGroup?.children?.[0] || null;
  if (!root || !diagnostics) return;
  root.userData = {
    ...(root.userData || {}),
    browserRvmProgressiveFitGuard: diagnostics,
  };
}

function fitBoxWithoutFullSceneTraversal(viewer, box) {
  if (!viewer?.camera || !viewer?.controls || !box || box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const aspect = viewer._isOrthographic
    ? safeAspect((viewer.orthoCamera.right - viewer.orthoCamera.left), (viewer.orthoCamera.top - viewer.orthoCamera.bottom))
    : safeAspect(viewer.perspCamera?.aspect, 1);

  let distance;
  if (viewer._isOrthographic) {
    distance = maxSize * 1.35;
  } else {
    const fov = Number(viewer.camera.fov) || 45;
    const fitHeightDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    const fitWidthDistance = fitHeightDistance / Math.max(aspect, 0.01);
    distance = 1.35 * Math.max(fitHeightDistance, fitWidthDistance, maxSize);
  }

  const direction = viewer.controls.target.clone().sub(viewer.camera.position).normalize().multiplyScalar(-1);
  if (direction.lengthSq() < 0.0001) direction.set(1, 1, 1).normalize();

  viewer.controls.target.copy(center);
  viewer.camera.position.copy(center).add(direction.multiplyScalar(distance));

  if (viewer._isOrthographic) {
    viewer.orthoCamera.left = -distance * aspect / 2;
    viewer.orthoCamera.right = distance * aspect / 2;
    viewer.orthoCamera.top = distance / 2;
    viewer.orthoCamera.bottom = -distance / 2;
  }

  const fitDiagonal = Math.max(size.length(), 1);
  viewer.camera.near = Math.max(0.01, distance / 2000);
  viewer.camera.far = Math.max(1000, distance * 40, fitDiagonal * 20);
  viewer.camera.updateProjectionMatrix?.();
  viewer.controls.update?.();
  return true;
}

function boxFromBounds(bounds) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) return null;
  return new THREE.Box3(
    new THREE.Vector3(normalized.min.x, normalized.min.y, normalized.min.z),
    new THREE.Vector3(normalized.max.x, normalized.max.y, normalized.max.z)
  );
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  const min = bounds.min || bounds.minimum || null;
  const max = bounds.max || bounds.maximum || null;
  if (!min || !max) return null;
  const out = {
    min: { x: Number(min.x), y: Number(min.y), z: Number(min.z) },
    max: { x: Number(max.x), y: Number(max.y), z: Number(max.z) },
  };
  return isFiniteBounds(out) ? out : null;
}

function boundsFromBox(box) {
  if (!box || box.isEmpty()) return null;
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };
}

function isFiniteBounds(bounds) {
  return ['x', 'y', 'z'].every((axis) => Number.isFinite(bounds?.min?.[axis]) && Number.isFinite(bounds?.max?.[axis]));
}
function boxRadius(box) { return box && !box.isEmpty() ? Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0) : 0; }
function safeAspect(widthOrAspect, height) { const width = Number(widthOrAspect); const h = Number(height); if (Number.isFinite(width) && Number.isFinite(h) && h !== 0) return Math.abs(width / h) || 1; if (Number.isFinite(width) && width > 0) return width; return 1; }
function nowMs() { return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now(); }
