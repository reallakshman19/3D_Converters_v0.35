export const RVM_RENDERED_OBJECT_INVENTORY_SCHEMA = 'rvm-rendered-object-inventory/v1';

const DEFAULT_SCAN_LIMIT = 160000;

export function buildRvmRenderedObjectInventory(root, options = {}) {
  const scanLimit = Number(options.scanLimit || DEFAULT_SCAN_LIMIT);
  const entries = [];
  const counts = {
    scanned: 0,
    capped: false,
    renderable: 0,
    visible: 0,
    hidden: 0,
    selectable: 0,
    nonSelectable: 0,
    fallback: 0,
    native: 0,
    unmapped: 0,
  };
  const byCategory = {};
  const byRenderKind = {};
  const byPrimitiveCode = {};
  const byFailureReason = {};

  root?.traverse?.((object) => {
    if (!isRenderableObject(object)) return;
    counts.scanned += 1;
    if (entries.length >= scanLimit) {
      counts.capped = true;
      return;
    }
    const entry = renderedObjectEntry(object, entries.length);
    entries.push(entry);
    counts.renderable += 1;
    if (entry.visible) counts.visible += 1;
    else counts.hidden += 1;
    if (entry.selectable) counts.selectable += 1;
    else counts.nonSelectable += 1;
    if (entry.isFallback) counts.fallback += 1;
    if (entry.isNative) counts.native += 1;
    if (!entry.sourceMapped) counts.unmapped += 1;
    bump(byCategory, entry.category);
    bump(byRenderKind, entry.renderKind || 'UNKNOWN');
    bump(byPrimitiveCode, entry.primitiveCode || 'UNKNOWN');
    for (const reason of entry.failureReasons) bump(byFailureReason, reason);
  });

  return {
    schema: RVM_RENDERED_OBJECT_INVENTORY_SCHEMA,
    generatedAt: new Date().toISOString(),
    scanLimit,
    counts,
    byCategory,
    byRenderKind,
    byPrimitiveCode,
    byFailureReason,
    entries,
  };
}

export function renderedObjectEntry(object, index = 0) {
  const data = object?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = attrsFor(object);
  const primitiveCode = stringFirst(data.primitiveCode, data.browserRvmNativePrimitiveCode, attrs.RVM_PRIMITIVE_CODE, attrs.RVM_NATIVE_PRIMITIVE_KIND);
  const renderKind = stringFirst(data.renderKind, data.effectivePrimitive, data.effectiveRenderPrimitive, data.renderPrimitive, data.parentBrowserRvmRenderPrimitive, attrs.RVM_BROWSER_RENDER_PRIMITIVE, attrs.RVM_PRIMITIVE_KIND, object?.name, 'UNKNOWN');
  const sourcePath = stringFirst(data.sourcePath, props.sourcePath, props.SourcePath, attrs.RVM_OWNER_PATH, attrs.RVM_SOURCE_PATH, '');
  const sourceCanonicalId = stringFirst(data.canonicalId, data.canonicalObjectId, data.sourceObjectId, props.canonicalId, data.name, '');
  const canonicalId = sourceCanonicalId || stringFirst(object?.name, object?.uuid, '');
  const sourceReviewName = stringFirst(data.reviewName, data.displayName, data.sourceName, props.displayName, props.sourceName, attrs.RVM_REVIEW_NAME, attrs.NAME, '');
  const reviewName = sourceReviewName || stringFirst(object?.name, canonicalId, '');
  const dtxr = stringFirst(data.DTXR_POS, data.DTXR, attrs.DTXR_POS, attrs.DTXR, attrs.DESC, attrs.DESCRIPTION, attrs.NAME, '');
  const dtxrPs = stringFirst(data.DTXR_PS, data.DTXRPS, attrs.DTXR_PS, attrs.DTXRPS, attrs.PS, attrs.PS_TAG, attrs.SUPPORT_TAG, '');
  const pickable = data.pickable !== false;
  const selectable = data.selectable !== false && pickable && !data.nonSelectableReason;
  const visible = object?.visible !== false;
  const fallbackReason = stringFirst(data.fallbackReason, data.bboxFallbackReason, data.browserRvmNativeFacetGroupRiskReason, '');
  const nonSelectableReason = stringFirst(data.nonSelectableReason, pickable ? '' : 'pickable=false');
  const geometryPolicy = stringFirst(data.geometryPolicy, data.bboxPlaceholderPolicy, data.browserRvmNativeFacetGroupDisplayPolicy, '');
  const materialPolicy = stringFirst(data.materialPolicy, data.browserRvmNativeFacetGroupDisplayPolicy, '');
  const text = normalizeText(`${renderKind} ${reviewName} ${sourcePath} ${dtxr} ${dtxrPs} ${primitiveCode}`);
  const category = classifyRvmObjectCategory({ renderKind, primitiveCode, reviewName, sourcePath, dtxr, dtxrPs, text });
  const isFallback = /FALLBACK|BBOX|PLACEHOLDER|DIAGNOSTIC/.test(normalizeText(`${renderKind} ${geometryPolicy} ${fallbackReason}`));
  const isNative = /RVM_NATIVE|NATIVE|FACET|TORUS/.test(normalizeText(`${renderKind} ${geometryPolicy}`));
  const sourceMapped = Boolean(sourcePath || sourceCanonicalId || sourceReviewName || dtxr || dtxrPs);
  const failureReasons = failureReasonsFor({ visible, selectable, sourceMapped, isFallback, nonSelectableReason, fallbackReason, geometryPolicy, renderKind, primitiveCode });

  return {
    index,
    object,
    uuid: object?.uuid || '',
    objectName: object?.name || '',
    type: object?.isMesh ? 'MESH' : object?.isLineSegments ? 'LINE_SEGMENTS' : object?.isLine ? 'LINE' : object?.isPoints ? 'POINTS' : 'OBJECT',
    category,
    renderKind,
    primitiveCode,
    reviewName,
    sourcePath,
    canonicalId,
    normalizedPath: normalizePath(sourcePath || reviewName),
    dtxr,
    dtxrPs,
    visible,
    pickable,
    selectable,
    sourceMapped,
    isFallback,
    isNative,
    fallbackReason,
    nonSelectableReason,
    geometryPolicy,
    materialPolicy,
    failureReasons,
    matchKeys: buildMatchKeys({ canonicalId: sourceCanonicalId || canonicalId, sourcePath, reviewName, dtxr, dtxrPs }),
  };
}

export function classifyRvmObjectCategory(value = {}) {
  const primitive = String(value.primitiveCode || '').trim();
  const text = normalizeText(value.text || `${value.renderKind || ''} ${value.reviewName || ''} ${value.sourcePath || ''} ${value.dtxr || ''} ${value.dtxrPs || ''}`);
  if (textContainsAny(text, ['SUPPORT', 'SUPPORTGEOM', 'SUPPORT GEOM', 'RESTRAINT', 'REST ', 'GUIDE', 'LINE STOP', 'LINESTOP', 'ANCHOR', 'PS.']) || value.dtxrPs) return 'SUPPORT';
  if (primitive === '3' || primitive === '4' || textContainsAny(text, ['TORUS', 'ELBOW', 'BEND'])) return 'ELBOW';
  if (textContainsAny(text, ['TEE', 'OLET', 'BRANCH'])) return 'TEE';
  if (primitive === '8' || textContainsAny(text, ['PIPE_CYLINDER', 'RVM_NATIVE_CYLINDER', 'CYLINDER', 'PIPE'])) return 'PIPE';
  if (textContainsAny(text, ['VALVE'])) return 'VALVE';
  if (textContainsAny(text, ['FLANGE'])) return 'FLANGE';
  if (textContainsAny(text, ['REDUCER', 'FITTING', 'GASKET', 'BOX_SOLID', 'SPHERE', 'DISH', 'SNOUT', 'FACET'])) return 'FITTING';
  return 'UNKNOWN';
}

export function attrsFor(object) {
  const data = object?.userData || {};
  const props = data.browserRvmProperties || {};
  return data.browserRvmAttributes || data.attributes || props.attributes || data.rawAttributes || {};
}

export function isRenderableObject(object) {
  return Boolean(object && (object.isMesh || object.isLine || object.isLineSegments || object.isPoints));
}

export function normalizePath(value = '') {
  const parts = String(value || '').replace(/\\/g, '/').split('/').map((part) => part.trim()).filter(Boolean);
  return parts.length ? `/${parts.join('/')}` : '';
}

export function buildMatchKeys(value = {}) {
  const raw = [value.canonicalId, value.sourcePath, value.reviewName, value.dtxr, value.dtxrPs]
    .map((item) => normalizeMatchKey(item))
    .filter(Boolean);
  return [...new Set(raw)];
}

export function normalizeMatchKey(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/\s+/g, ' ').trim().toUpperCase();
}

function failureReasonsFor(entry) {
  const reasons = [];
  if (!entry.visible) reasons.push('HIDDEN');
  if (!entry.selectable) reasons.push(entry.nonSelectableReason || 'NON_PICKABLE');
  if (!entry.sourceMapped) reasons.push('MISSING_SOURCE_ID');
  if (entry.isFallback) reasons.push('FALLBACK_ONLY');
  if (/BBOX|PLACEHOLDER/.test(normalizeText(entry.renderKind))) reasons.push('BBOX_PLACEHOLDER');
  if (/HIDDEN/.test(normalizeText(entry.geometryPolicy))) reasons.push('HIDDEN_BY_POLICY');
  return [...new Set(reasons.filter(Boolean))];
}

function textContainsAny(text, needles) {
  return needles.some((needle) => text.includes(String(needle).toUpperCase()));
}

function normalizeText(value = '') {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

function stringFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function bump(target, key) {
  const safe = String(key || 'UNKNOWN').trim() || 'UNKNOWN';
  target[safe] = (target[safe] || 0) + 1;
}
