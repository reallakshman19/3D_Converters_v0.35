import * as THREE from 'three';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-progressive-model-root-patch-v3');
const MAX_ROBUST_FIT_OBJECTS = 6000;
const MIN_ROBUST_FIT_OBJECTS = 3;
const ABS_OUTLIER_DIAGONAL = 50000;
const OUTLIER_MEDIAN_FACTOR = 25;
const OUTLIER_P90_FACTOR = 8;

export function installRvmProgressiveModelRootPatch(RvmViewer3D) {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[PATCH_FLAG]) return;

  const originalSetModel = proto.setModel;

  proto.setProgressiveModelRoot = function setProgressiveModelRoot(model, upAxis = 'Z', options = {}) {
    const oldChildren = Array.from(this.modelGroup?.children || []);
    this.modelGroup?.clear?.();
    scheduleDisposal(oldChildren);

    this._stpGroup = null;
    this._upAxis = upAxis;
    this._modelDiag = positiveNumber(options.estimatedDiagonal, positiveNumber(this._modelDiag, 5000));
    this._progressiveModelRoot = model || null;
    this._progressiveModelBounds = normalizeBounds(options.bounds || model?.userData?.bounds || model?.userData?.diagnostics?.bounds || null);
    this._progressiveFitDiagnostics = null;

    if (this.modelGroup) {
      if (String(upAxis || '').toUpperCase() === 'Z') this.modelGroup.rotation.set(-Math.PI / 2, 0, 0);
      else this.modelGroup.rotation.set(0, 0, 0);
      if (model) this.modelGroup.add(model);
      this.modelGroup.updateMatrix();
      this.modelGroup.matrixWorldNeedsUpdate = true;
    }

    bindModulesWithoutFullTraversal(this);

    if (options.fit === true && this._progressiveModelBounds) {
      this.fitProgressiveBounds(this._progressiveModelBounds, options);
    }

    return model;
  };

  proto.fitProgressiveBounds = function fitProgressiveBounds(bounds, options = {}) {
    const requestedBox = boxFromBounds(bounds || this._progressiveModelBounds);
    const fit = resolveRobustProgressiveFit(this, requestedBox, options);
    const fitBox = fit?.box && !fit.box.isEmpty() ? fit.box : requestedBox;
    if (!fitBox || fitBox.isEmpty()) return false;

    this._progressiveModelBounds = boundsFromBox(fitBox);
    this._progressiveFitDiagnostics = fit?.diagnostics || null;
    annotateProgressiveRoot(this, this._progressiveFitDiagnostics);

    this._modelDiag = Math.max(fitBox.getSize(new THREE.Vector3()).length(), 1);
    fitBoxWithoutFullSceneTraversal(this, fitBox);
    return true;
  };

  proto.setModel = function patchedSetModel(model, upAxis = 'Y', options = {}) {
    const progressive = options?.progressive === true
      || model?.userData?.browserRvmWorkerFirstPipeline === true
      || model?.userData?.browserRvmProgressiveRenderEnabled === true
      || model?.userData?.source === 'browser-rvm-worker-progressive-root';

    if (progressive && typeof this.setProgressiveModelRoot === 'function') {
      return this.setProgressiveModelRoot(model, upAxis, options);
    }

    return originalSetModel.call(this, model, upAxis, options);
  };

  proto[PATCH_FLAG] = true;
}

function bindModulesWithoutFullTraversal(viewer) {
  const identityMap = viewer.ctx?.identityMap || null;

  if (viewer.sectioning) {
    viewer.sectioning.modelGroup = viewer.modelGroup;
    if (viewer.sectioning._sectionMode !== 'OFF') {
      viewer.sectioning.disableSection?.();
    }
  }

  if (viewer.visibility) {
    viewer.visibility.modelGroup = viewer.modelGroup;
    viewer.visibility.identityMap = identityMap || viewer.visibility.identityMap;
  }

  if (viewer.selection) {
    viewer.selection.modelGroup = viewer.modelGroup;
    viewer.selection.identityMap = identityMap || viewer.selection.identityMap;
    viewer.selection._selectedCanonicalId = null;
    viewer.selection._selectedCanonicalIds = [];
    viewer.selection._selectedRenderIds = [];
    viewer.selection._originalMaterials?.clear?.();
  }
}

function resolveRobustProgressiveFit(viewer, requestedBox, options = {}) {
  const entries = collectRenderableBoxes(viewer, options.maxFitObjects || MAX_ROBUST_FIT_OBJECTS);
  const requestedRadius = boxRadius(requestedBox);
  if (entries.length < MIN_ROBUST_FIT_OBJECTS) {
    return {
      box: requestedBox,
      diagnostics: {
        progressiveFitGuard: 'insufficient-renderables',
        requestedRadius,
        robustFitUsed: false,
        renderedBoundsUsed: false,
        objectCount: entries.length,
      }
    };
  }

  const diagonals = entries.map((entry) => entry.diagonal).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const median = percentile(diagonals, 0.5);
  const p90 = percentile(diagonals, 0.9);
  const threshold = Math.max(
    ABS_OUTLIER_DIAGONAL,
    positiveNumber(median, 0) * OUTLIER_MEDIAN_FACTOR,
    positiveNumber(p90, 0) * OUTLIER_P90_FACTOR,
  );

  const renderedBox = new THREE.Box3();
  let included = 0;
  let excluded = 0;
  let hidden = 0;

  for (const entry of entries) {
    const isOutlier = entry.diagonal > threshold;
    if (isOutlier) {
      excluded += 1;
      if (shouldHideFitOutlier(entry.object)) {
        entry.object.visible = false;
        entry.object.userData = {
          ...(entry.object.userData || {}),
          browserRvmHiddenFitOutlier: true,
          browserRvmFitOutlierDiagonal: Number(entry.diagonal.toFixed(3)),
          browserRvmFitOutlierThreshold: Number(threshold.toFixed(3)),
        };
        hidden += 1;
      }
      continue;
    }
    renderedBox.union(entry.box);
    included += 1;
  }

  const renderedRadius = boxRadius(renderedBox);
  const useRendered = included >= MIN_ROBUST_FIT_OBJECTS && renderedBox && !renderedBox.isEmpty() && renderedRadius > 0;

  return {
    box: useRendered ? renderedBox : requestedBox,
    diagnostics: {
      progressiveFitGuard: useRendered ? 'rendered-world-bounds' : 'requested-bounds-fallback',
      robustFitUsed: useRendered,
      renderedBoundsUsed: useRendered,
      requestedRadius: Number(requestedRadius.toFixed(3)),
      renderedRadius: Number(renderedRadius.toFixed(3)),
      robustRadius: Number(renderedRadius.toFixed(3)),
      objectCount: entries.length,
      fitIncludedCount: included,
      fitOutlierCount: excluded,
      fitOutlierHiddenCount: hidden,
      outlierDiagonalThreshold: Number(threshold.toFixed(3)),
      medianObjectDiagonal: Number(positiveNumber(median, 0).toFixed(3)),
      p90ObjectDiagonal: Number(positiveNumber(p90, 0).toFixed(3)),
    }
  };
}

function collectRenderableBoxes(viewer, limit) {
  const entries = [];
  viewer?.modelGroup?.updateMatrixWorld?.(true);
  viewer?.modelGroup?.traverse?.((obj) => {
    if (entries.length >= limit) return;
    if (!obj?.isMesh || !obj.geometry || obj.userData?.supportSymbol) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (!box || box.isEmpty()) return;
    const diagonal = box.getSize(new THREE.Vector3()).length();
    if (!Number.isFinite(diagonal) || diagonal <= 0) return;
    entries.push({ object: obj, box, diagonal });
  });
  return entries;
}

function shouldHideFitOutlier(obj) {
  const primitive = String(obj?.userData?.effectiveRenderPrimitive || obj?.userData?.renderPrimitive || '').toUpperCase();
  const type = String(obj?.userData?.type || obj?.userData?.kind || '').toUpperCase();
  const attrs = obj?.userData?.browserRvmAttributes || {};
  const code = String(attrs.RVM_PRIMITIVE_CODE || '').trim();
  const source = String(obj?.userData?.renderSource || attrs.RVM_BROWSER_RENDER_SOURCE || '').toUpperCase();
  const browserBboxDerived = /BBOX|BROWSER|FALLBACK|DERIVED|SCALE-SAFE/.test(source);
  const boxLike = primitive === 'BOX_SOLID' || primitive === 'STRUCTURE_SOLID' || primitive === 'BOX_BBOX' || primitive === 'STRUCTURE_BBOX' || type === 'BOX' || type === 'STRUCTURE' || code === '2';
  return boxLike && browserBboxDerived;
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

function scheduleDisposal(children = []) {
  if (!children.length) return;
  const queue = [...children];
  const disposeSlice = () => {
    const started = performanceNow();
    while (queue.length && performanceNow() - started < 6) {
      disposeObject(queue.pop());
    }
    if (queue.length) scheduleIdle(disposeSlice);
  };
  scheduleIdle(disposeSlice);
}

function disposeObject(root) {
  if (!root) return;
  root.traverse?.((obj) => {
    if (obj.geometry?.dispose) obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    for (const mat of materials) mat?.dispose?.();
  });
}

function scheduleIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 250 });
  else setTimeout(fn, 0);
}

function performanceNow() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function percentile(sortedValues, ratio) {
  if (!Array.isArray(sortedValues) || !sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * ratio)));
  return sortedValues[index];
}

function safeAspect(widthOrAspect, height) {
  const width = Number(widthOrAspect);
  const h = Number(height);
  if (Number.isFinite(width) && Number.isFinite(h) && h !== 0) return Math.abs(width / h) || 1;
  if (Number.isFinite(width) && width > 0) return width;
  return 1;
}

function boxRadius(box) {
  if (!box || box.isEmpty()) return 0;
  return Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0);
}

function boundsFromBox(box) {
  if (!box || box.isEmpty()) return null;
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  const min = bounds.min || bounds.minimum || null;
  const max = bounds.max || bounds.maximum || null;
  if (min && max) {
    const out = {
      min: { x: Number(min.x), y: Number(min.y), z: Number(min.z) },
      max: { x: Number(max.x), y: Number(max.y), z: Number(max.z) }
    };
    return isFiniteBounds(out) ? out : null;
  }
  return isFiniteBounds(bounds) ? bounds : null;
}

function boxFromBounds(bounds) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) return null;
  return new THREE.Box3(
    new THREE.Vector3(normalized.min.x, normalized.min.y, normalized.min.z),
    new THREE.Vector3(normalized.max.x, normalized.max.y, normalized.max.z)
  );
}

function isFiniteBounds(bounds) {
  return ['x', 'y', 'z'].every((axis) => Number.isFinite(bounds?.min?.[axis]) && Number.isFinite(bounds?.max?.[axis]));
}
