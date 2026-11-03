export const SUPPORT_OVERLAY_HOVER_SCHEMA = 'support-overlay-hover/v1';

const DEFAULT_HOVER_COLOR = 0xfff28a;
const DEFAULT_HOVER_OPACITY = 0.96;
const MAX_WARNING_PREVIEW = 3;

export function hoverSupportOverlayGlyph(owner, roots = [], options = {}) {
  if (!owner?.userData?.supportOverlayDetails) {
    return createEmptySupportOverlayHoverState('support-details-owner-missing', 'skipped');
  }

  const rootList = normalizeRootList(roots);
  clearSupportOverlayHovers(rootList, 'before-hover');

  if (owner.userData.supportOverlayHighlighted) {
    return {
      ...createEmptySupportOverlayHoverState('selected-glyph-already-highlighted', 'skipped'),
      supportId: options.supportId || owner.userData.supportOverlayDetails.supportId || '',
      family: options.family || owner.userData.supportOverlayDetails.family || '',
    };
  }

  const hoverColor = Number.isFinite(Number(options.hoverColor))
    ? Number(options.hoverColor)
    : DEFAULT_HOVER_COLOR;

  let hoveredParts = 0;
  owner.traverse?.((object) => {
    if (!object?.material) return;
    hoveredParts += applyHoverMaterial(object, hoverColor);
  });

  owner.userData.supportOverlayHovered = true;
  owner.userData.supportOverlayHoverSchema = SUPPORT_OVERLAY_HOVER_SCHEMA;
  owner.userData.supportOverlayHoverState = {
    schema: SUPPORT_OVERLAY_HOVER_SCHEMA,
    status: 'hovered',
    supportId: options.supportId || owner.userData.supportOverlayDetails.supportId || owner.userData.supportTag || '',
    family: options.family || owner.userData.supportOverlayDetails.family || owner.userData.supportKind || '',
    hoveredParts,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };

  return owner.userData.supportOverlayHoverState;
}

export function clearSupportOverlayHovers(roots = [], reason = 'clear') {
  const rootList = normalizeRootList(roots);
  let clearedOwners = 0;
  let restoredParts = 0;

  for (const root of rootList) {
    root?.traverse?.((object) => {
      if (object?.userData?.supportOverlayHovered) {
        object.userData.supportOverlayHovered = false;
        object.userData.supportOverlayHoverCleared = reason;
        delete object.userData.supportOverlayHoverState;
        clearedOwners += 1;
      }
      restoredParts += restoreHoverMaterial(object);
    });
  }

  return {
    schema: SUPPORT_OVERLAY_HOVER_SCHEMA,
    status: 'cleared',
    reason,
    clearedOwners,
    restoredParts,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

export function createEmptySupportOverlayHoverState(reason = 'empty', status = 'empty') {
  return {
    schema: SUPPORT_OVERLAY_HOVER_SCHEMA,
    status,
    reason,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

export function buildSupportOverlayHoverPreviewState(details = {}, context = {}) {
  if (!details || details.status === 'empty') {
    return {
      ...createEmptySupportOverlayHoverState(context.reason || 'empty'),
      sourceKind: normalizeText(context.sourceKind),
      sourceFile: normalizeText(context.sourceFile),
    };
  }

  const supportId = normalizeText(details.supportId || details.supportNo || details.id || '');
  const family = normalizeText(details.family || details.supportFamily || 'UNKNOWN');
  const rawType = normalizeText(details.rawType || details.type || '');
  const warnings = normalizeWarnings(details.warnings || details.warningCodes || []);

  return {
    schema: SUPPORT_OVERLAY_HOVER_SCHEMA,
    status: 'preview',
    supportId,
    supportNo: normalizeText(details.supportNo || supportId),
    family,
    rawType,
    nodeId: normalizeText(details.nodeId || details.node || ''),
    sourceKind: normalizeText(context.sourceKind || details.sourceKind || ''),
    sourceFile: normalizeText(context.sourceFile || details.sourceFile || ''),
    warningCount: warnings.length,
    warnings: warnings.slice(0, MAX_WARNING_PREVIEW),
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  };
}

export function renderSupportOverlayHoverPreviewHtml(state = {}, { escapeHtml = defaultEscapeHtml } = {}) {
  if (!state || state.status !== 'preview') return '';
  const title = [state.supportNo || state.supportId || 'Support', state.family || 'UNKNOWN']
    .filter(Boolean)
    .join(' ');
  const rawType = state.rawType ? `<div class="rvm-support-hover-preview__row">${escapeHtml(state.rawType)}</div>` : '';
  const node = state.nodeId ? `<div class="rvm-support-hover-preview__row">Node ${escapeHtml(state.nodeId)}</div>` : '';
  const warnings = Number(state.warningCount || 0) > 0
    ? `<div class="rvm-support-hover-preview__warn">${escapeHtml(state.warningCount)} warning${Number(state.warningCount) === 1 ? '' : 's'}</div>`
    : '';
  return `<div class="rvm-support-hover-preview__title">${escapeHtml(title)}</div>${rawType}${node}${warnings}`;
}

function normalizeRootList(roots) {
  if (!roots) return [];
  if (Array.isArray(roots)) return roots.filter(Boolean);
  return [roots].filter(Boolean);
}

function applyHoverMaterial(object, hoverColor) {
  if (object?.userData?.supportOverlayHighlightedPart || object?.userData?.__supportOverlayOriginalMaterial) return 0;
  const materials = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
  if (!materials.length) return 0;
  if (!object.userData) object.userData = {};
  if (!object.userData.__supportOverlayHoverOriginalMaterial) {
    object.userData.__supportOverlayHoverOriginalMaterial = object.material;
  }

  const hovered = materials.map((material) => cloneHoverMaterial(material, hoverColor));
  object.material = Array.isArray(object.material) ? hovered : hovered[0];
  object.userData.supportOverlayHoveredPart = true;
  object.userData.supportOverlayHoverSchema = SUPPORT_OVERLAY_HOVER_SCHEMA;
  object.userData.pickable = false;
  object.userData.selectable = false;
  return hovered.length;
}

function restoreHoverMaterial(object) {
  if (!object?.userData?.__supportOverlayHoverOriginalMaterial) return 0;
  const hovered = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
  for (const material of hovered) material?.dispose?.();
  object.material = object.userData.__supportOverlayHoverOriginalMaterial;
  delete object.userData.__supportOverlayHoverOriginalMaterial;
  delete object.userData.supportOverlayHoveredPart;
  return hovered.length;
}

function cloneHoverMaterial(material, hoverColor) {
  const clone = typeof material?.clone === 'function' ? material.clone() : { ...material };
  if (clone?.color?.setHex) clone.color.setHex(hoverColor);
  else if (clone?.color?.set) clone.color.set(hoverColor);
  else clone.color = hoverColor;
  clone.opacity = DEFAULT_HOVER_OPACITY;
  clone.transparent = true;
  clone.depthTest = material?.depthTest ?? true;
  clone.needsUpdate = true;
  return clone;
}

function normalizeWarnings(value) {
  const list = Array.isArray(value) ? value : [value].filter(Boolean);
  return list.map((item) => {
    if (typeof item === 'string') return item;
    return item?.code || item?.message || JSON.stringify(item);
  }).filter(Boolean);
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function defaultEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
