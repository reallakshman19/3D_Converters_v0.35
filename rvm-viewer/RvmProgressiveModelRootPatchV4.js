import { installRvmProgressiveModelRootPatch as installBaseProgressivePatch } from './RvmProgressiveModelRootPatch.js?v=20260620-rvm-final-fit-1';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-progressive-model-root-patch-v4');
const DUPLICATE_FIT_WINDOW_MS = 4000;
const MIN_RENDERED_MESHES_FOR_SUPPRESSION = 3;

export function installRvmProgressiveModelRootPatch(RvmViewer3D) {
  installBaseProgressivePatch(RvmViewer3D);
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[PATCH_FLAG]) return;

  const baseFitProgressiveBounds = proto.fitProgressiveBounds;
  proto.fitProgressiveBounds = function fitProgressiveBoundsNoDuplicate(bounds, options = {}) {
    const now = nowMs();
    const progressiveRoot = this?._progressiveModelRoot || this?.modelGroup?.children?.[0] || null;
    const isProgressiveRvm = Boolean(progressiveRoot?.userData?.browserRvmProgressiveRenderEnabled || progressiveRoot?.userData?.browserRvmWorkerFirstPipeline);
    const lastFitAt = Number(this?._progressiveLastSuccessfulFitAt || 0);
    const duplicateFit = isProgressiveRvm
      && options?.force !== true
      && lastFitAt > 0
      && now - lastFitAt <= DUPLICATE_FIT_WINDOW_MS
      && countRenderedModelMeshes(this) >= MIN_RENDERED_MESHES_FOR_SUPPRESSION;

    if (duplicateFit) {
      const diagnostics = {
        ...(this._progressiveFitDiagnostics || {}),
        progressiveFitGuard: 'duplicate-fit-suppressed-rendered-world-bounds',
        duplicateFitSuppressed: true,
        duplicateFitWindowMs: DUPLICATE_FIT_WINDOW_MS,
        renderedBoundsUsed: true,
        objectCount: countRenderedModelMeshes(this),
      };
      this._progressiveFitDiagnostics = diagnostics;
      annotateProgressiveRoot(this, diagnostics);
      return true;
    }

    const result = typeof baseFitProgressiveBounds === 'function'
      ? baseFitProgressiveBounds.call(this, bounds, options)
      : false;
    if (result && isProgressiveRvm) this._progressiveLastSuccessfulFitAt = nowMs();
    return result;
  };

  proto[PATCH_FLAG] = true;
}

function countRenderedModelMeshes(viewer) {
  let count = 0;
  viewer?.modelGroup?.traverse?.((object) => {
    if (count >= MIN_RENDERED_MESHES_FOR_SUPPRESSION) return;
    if (object?.isMesh && object.visible !== false && !object.userData?.supportSymbol) count += 1;
  });
  return count;
}

function annotateProgressiveRoot(viewer, diagnostics) {
  const root = viewer?._progressiveModelRoot || viewer?.modelGroup?.children?.[0] || null;
  if (!root || !diagnostics) return;
  root.userData = {
    ...(root.userData || {}),
    browserRvmProgressiveFitGuard: diagnostics,
  };
}

function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
}
