const GLB_SUPPORT_SYMBOLS_GROUP = '__GLB_SUPPORT_SYMBOLS_V3__';
function disposeGroup(root) {
  root?.traverse?.((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    mats.forEach((mat) => mat?.dispose?.());
  });
}

function hasRuntimeOverlayDisableFlag(root) {
  if (!root) return false;
  if (root.userData?.plantOnlyMode === true || root.userData?.disableRuntimeSupportOverlay === true) return true;
  let disabled = false;
  root.traverse?.((object) => {
    if (disabled) return;
    const data = object.userData || {};
    if (data.plantOnlyMode === true || data.disableRuntimeSupportOverlay === true) disabled = true;
  });
  return disabled;
}

export function applyGlbSupportSymbols(root, scene, options = {}) {
  const existing = scene?.getObjectByName?.(GLB_SUPPORT_SYMBOLS_GROUP)
    || root?.getObjectByName?.(GLB_SUPPORT_SYMBOLS_GROUP)
    || scene?.getObjectByName?.('__GLB_SUPPORT_SYMBOLS_v1__')
    || root?.getObjectByName?.('__GLB_SUPPORT_SYMBOLS_v1__');
  if (existing) {
    existing.parent?.remove?.(existing);
    disposeGroup(existing);
  }

  if (hasRuntimeOverlayDisableFlag(root) || options.disableRuntimeSupportOverlay !== false) {
    return {
      created: 0,
      scanned: 0,
      hidden: 0,
      skipped: true,
      reason: hasRuntimeOverlayDisableFlag(root)
        ? 'disableRuntimeSupportOverlay/plantOnlyMode'
        : 'runtime support overlay disabled; use baked source-backed support glyphs',
    };
  }

  return {
    created: 0,
    scanned: 0,
    hidden: 0,
    skipped: true,
    reason: 'runtime support overlay disabled; use baked source-backed support glyphs',
  };
}
