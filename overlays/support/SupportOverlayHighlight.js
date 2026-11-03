export const SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA = 'support-overlay-highlight/v1';

const DEFAULT_HIGHLIGHT_COLOR = 0x66d9ff;
const DEFAULT_HIGHLIGHT_OPACITY = 1;

export function highlightSupportOverlayGlyph(owner, roots = [], options = {}) {
  if (!owner?.userData?.supportOverlayDetails) {
    return {
      schema: SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA,
      status: 'skipped',
      reason: 'support-details-owner-missing',
    };
  }

  const rootList = normalizeRootList(roots);
  clearSupportOverlayHighlights(rootList, 'before-select');

  const highlightColor = Number.isFinite(Number(options.highlightColor))
    ? Number(options.highlightColor)
    : DEFAULT_HIGHLIGHT_COLOR;

  let highlightedParts = 0;
  owner.traverse?.((object) => {
    if (!object?.material) return;
    highlightedParts += applyHighlightMaterial(object, highlightColor);
  });

  owner.userData.supportOverlayHighlighted = true;
  owner.userData.supportOverlayHighlightSchema = SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA;
  owner.userData.supportOverlayHighlightState = {
    schema: SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA,
    status: 'highlighted',
    supportId: options.supportId || owner.userData.supportOverlayDetails.supportId || owner.userData.supportTag || '',
    family: options.family || owner.userData.supportOverlayDetails.family || owner.userData.supportKind || '',
    highlightedParts,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };

  return owner.userData.supportOverlayHighlightState;
}

export function clearSupportOverlayHighlights(roots = [], reason = 'clear') {
  const rootList = normalizeRootList(roots);
  let clearedOwners = 0;
  let restoredParts = 0;

  for (const root of rootList) {
    root?.traverse?.((object) => {
      if (object?.userData?.supportOverlayHighlighted) {
        object.userData.supportOverlayHighlighted = false;
        object.userData.supportOverlayHighlightCleared = reason;
        delete object.userData.supportOverlayHighlightState;
        clearedOwners += 1;
      }
      restoredParts += restoreHighlightMaterial(object);
    });
  }

  return {
    schema: SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA,
    status: 'cleared',
    reason,
    clearedOwners,
    restoredParts,
    primitiveExcluded: true,
  };
}

export function createEmptySupportOverlayHighlightState(reason = 'empty') {
  return {
    schema: SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA,
    status: 'empty',
    reason,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

function normalizeRootList(roots) {
  if (!roots) return [];
  if (Array.isArray(roots)) return roots.filter(Boolean);
  return [roots].filter(Boolean);
}

function applyHighlightMaterial(object, highlightColor) {
  const materials = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
  if (!materials.length) return 0;
  if (!object.userData) object.userData = {};
  if (!object.userData.__supportOverlayOriginalMaterial) {
    object.userData.__supportOverlayOriginalMaterial = object.material;
  }

  const highlighted = materials.map((material) => cloneHighlightMaterial(material, highlightColor));
  object.material = Array.isArray(object.material) ? highlighted : highlighted[0];
  object.userData.supportOverlayHighlightedPart = true;
  object.userData.supportOverlayHighlightSchema = SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA;
  object.userData.pickable = false;
  object.userData.selectable = false;
  return highlighted.length;
}

function restoreHighlightMaterial(object) {
  if (!object?.userData?.__supportOverlayOriginalMaterial) return 0;
  const highlighted = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
  for (const material of highlighted) material?.dispose?.();
  object.material = object.userData.__supportOverlayOriginalMaterial;
  delete object.userData.__supportOverlayOriginalMaterial;
  delete object.userData.supportOverlayHighlightedPart;
  return highlighted.length;
}

function cloneHighlightMaterial(material, highlightColor) {
  const clone = typeof material?.clone === 'function' ? material.clone() : { ...material };
  if (clone?.color?.setHex) clone.color.setHex(highlightColor);
  else if (clone?.color?.set) clone.color.set(highlightColor);
  else clone.color = highlightColor;
  clone.opacity = DEFAULT_HIGHLIGHT_OPACITY;
  clone.transparent = true;
  clone.depthTest = material?.depthTest ?? true;
  clone.needsUpdate = true;
  return clone;
}
