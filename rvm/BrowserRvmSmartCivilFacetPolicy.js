import * as THREE from 'three';

export const BROWSER_RVM_SMART_CIVIL_FACET_POLICY_SCHEMA = 'browser-rvm-smart-civil-facet-policy/v1';

const LARGE_MAX_DIM = 700;
const LARGE_DIAGONAL = 1400;
const HUGE_MAX_DIM = 1800;
const THIN_RATIO = 0.04;
const VERY_THIN_RATIO = 0.018;

const CIVIL_TERMS = Object.freeze({
  GRID: /\b(GRID|GRIDS|GRDLN|GRIDLINE|GRATING|GRATE|DATUM|AXIS|REFERENCE|SETTINGOUT)\b/i,
  FOUNDATION: /\b(FDNS|FDN|FOUND|FOUNDATION|FOOTING|PILE|PILECAP|SLAB|BASESLAB|PEDESTAL|PLINTH|ANCHORBLOCK|CONCRETE|RCC|PCC)\b/i,
  EARTHWORK: /\b(PAVE|PAVEMENT|ROAD|CURB|KERB|GRAD|GRADE|DRAIN|TRENCH|PIT|PITS|DUCTBANK|CULVERT|CHANNEL|SUMP|BUND)\b/i,
  PANEL_FRAME: /\b(PANEL|FRAMEWORK|FRMWORK|SBFRAMEWORK|WALL|FLOOR|DECK|ROOF|PLATE|SHEET|CLADDING|FENCE|BARRIER)\b/i,
  STRUCTURE: /\b(STRUCTURE|STRUCTURAL|CIVIL|BUILDING|ARCH|ARCHITECTURAL)\b/i,
});

const PROCESS_TERMS = /\b(PIPE|PIPING|ELBOW|BEND|TEE|OLET|BRANCH|FLANGE|VALVE|NOZZLE|GASKET|REDUCER|CAP|COUPLING|INSTRUMENT|PUMP|VESSEL|DRUM|TANK|EXCHANGER|EQUIPMENT|SUPPORT|HANGER|SPRING|GUIDE|STOP|ANCHOR|SHOE)\b/i;

export function classifySmartCivilFacetInstruction(instruction = {}, native = null) {
  const code = primitiveCodeForInstruction(instruction, native);
  if (code !== 11) return null;
  const text = smartCivilSourceText(instruction);
  const bbox = parseBbox(instruction.bbox || instruction.rawBbox || instruction.attributes?.RVM_BBOX || instruction.attributes?.BBOX);
  const dims = dimsFromBbox(bbox);
  const stats = native?.stats || facetStatsFromParams(native?.params || parseParams(instruction.attributes?.RVM_NATIVE_PRIMITIVE_PARAMS));
  return classifySmartCivilFacet({ text, dims, stats, code });
}

export function classifySmartCivilFacetObject(object = {}) {
  const data = object.userData || {};
  const attrs = data.browserRvmAttributes || data.attributes || data.browserRvmProperties?.attributes || {};
  const code = Number(data.browserRvmNativePrimitiveCode || data.primitiveCode || data.rvmPrimitiveCode || attrs.RVM_PRIMITIVE_CODE || parseParams(attrs.RVM_NATIVE_PRIMITIVE_PARAMS)?.kind || 0);
  if (code !== 11 && !data.browserRvmNativeFacetGroupPrimary) return null;
  const text = [
    object.name,
    data.displayName,
    data.sourceName,
    data.sourcePath,
    data.reviewName,
    data.browserRvmProperties?.sourcePath,
    data.browserRvmProperties?.displayName,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.NAME,
    attrs.TYPE,
    attrs.RVM_PRIMITIVE_KIND,
  ].filter(Boolean).join('/');
  const dims = dimsFromObject(object);
  const stats = {
    polygonCount: Number(data.browserRvmNativeFacetGroupPolygonCount || 0),
    triangleCount: Number(data.browserRvmNativeFacetGroupTriangleCount || 0),
    holeSkippedCount: Number(data.browserRvmNativeFacetGroupContourHoleSkippedCount || 0),
  };
  return classifySmartCivilFacet({ text, dims, stats, code: 11 });
}

export function classifySmartCivilFacet({ text = '', dims = null, stats = {}, code = 11 } = {}) {
  if (Number(code) !== 11) return null;
  const source = String(text || '');
  const upper = source.toUpperCase();
  const size = normalizeDims(dims);
  const geometry = geometrySignals(size, stats);
  const semantics = semanticSignals(upper);

  let score = 0;
  score += semantics.score;
  score += geometry.score;
  if (PROCESS_TERMS.test(upper)) score -= 5;

  const strongCivil = semantics.score >= 4;
  const largeCivil = geometry.large && semantics.score >= 2;
  const hugePlanarUnknown = geometry.huge && geometry.planar && semantics.score >= 1;
  const riskyGenericPanel = geometry.large && geometry.veryThin && semantics.kinds.includes('PANEL_FRAME') && !PROCESS_TERMS.test(upper);

  if (!(score >= 5 || strongCivil && geometry.large || largeCivil || hugePlanarUnknown || riskyGenericPanel)) return null;

  const kind = chooseKind(semantics.kinds, geometry);
  const action = shouldHideByDefault(kind, semantics, geometry) ? 'hidden' : 'wireframe-proxy';
  const reason = action === 'hidden'
    ? `smart-code11-${kind.toLowerCase()}-deferred-default-off`
    : `smart-code11-${kind.toLowerCase()}-wireframe-proxy-default-off`;

  return {
    schemaVersion: BROWSER_RVM_SMART_CIVIL_FACET_POLICY_SCHEMA,
    kind,
    action,
    policy: action === 'hidden' ? 'defer-native-code11-civil-hidden' : 'defer-native-code11-civil-wireframe-proxy',
    reason,
    confidence: Math.max(0, Math.min(1, score / 10)),
    score,
    semanticKinds: semantics.kinds,
    geometry,
    deferNativeTessellation: true,
    visible: action !== 'hidden',
    pickable: false,
    selectable: false,
  };
}

export function buildSmartCivilFacetProxyObject(instruction = {}, native = null, policy = null, material = null, context = null) {
  const activePolicy = policy || classifySmartCivilFacetInstruction(instruction, native);
  if (!activePolicy?.deferNativeTessellation) return null;
  const bbox = parseBbox(instruction.bbox || instruction.rawBbox || instruction.attributes?.RVM_BBOX || instruction.attributes?.BBOX);
  const object = activePolicy.action === 'wireframe-proxy' && bbox
    ? bboxProxyObject(bbox, material, context)
    : new THREE.Group();
  object.name = activePolicy.action === 'hidden' ? 'RVM_CODE11_CIVIL_DEFERRED' : 'RVM_CODE11_CIVIL_WIREFRAME_PROXY';
  object.visible = activePolicy.action !== 'hidden';
  object.userData = smartCivilPolicyUserData(activePolicy);
  return object;
}

export function smartCivilPolicyUserData(policy = {}) {
  return {
    browserRvmSmartCivilFacetPolicy: true,
    browserRvmSmartCivilFacetPolicyVersion: BROWSER_RVM_SMART_CIVIL_FACET_POLICY_SCHEMA,
    browserRvmSmartCivilFacetKind: policy.kind || 'CIVIL',
    browserRvmSmartCivilFacetAction: policy.action || 'hidden',
    browserRvmSmartCivilFacetScore: Number(policy.score || 0),
    browserRvmSmartCivilFacetConfidence: Number(policy.confidence || 0),
    browserRvmSmartCivilFacetSemanticKinds: Array.isArray(policy.semanticKinds) ? policy.semanticKinds.join(',') : '',
    browserRvmSmartCivilFacetDeferred: true,
    browserRvmNativeTessellationDeferred: true,
    pickable: false,
    selectable: false,
    nonSelectableReason: policy.reason || 'smart-code11-civil-deferred-default-off',
    fallbackReason: policy.reason || 'smart-code11-civil-deferred-default-off',
    geometryPolicy: policy.policy || 'defer-native-code11-civil-hidden',
    materialPolicy: 'smart-civil-code11-default-off',
    renderQuality: policy.action === 'wireframe-proxy' ? 'smart-civil-code11-wireframe-proxy' : 'smart-civil-code11-hidden-deferred',
  };
}

function bboxProxyObject(bbox, material, context = null) {
  const width = Math.max(Math.abs(bbox[3] - bbox[0]), 0.001);
  const height = Math.max(Math.abs(bbox[4] - bbox[1]), 0.001);
  const depth = Math.max(Math.abs(bbox[5] - bbox[2]), 0.001);
  const center = new THREE.Vector3((bbox[0] + bbox[3]) * 0.5, (bbox[1] + bbox[4]) * 0.5, (bbox[2] + bbox[5]) * 0.5);
  const key = `smart-civil-code11-bbox:${fixed(width)}:${fixed(height)}:${fixed(depth)}`;
  const boxGeometry = cachedGeometry(context, `${key}:box`, () => new THREE.BoxGeometry(width, height, depth));
  const edgesGeometry = cachedGeometry(context, `${key}:edges`, () => new THREE.EdgesGeometry(boxGeometry));
  const color = material?.color?.getHex ? material.color.getHex() : 0x94a3b8;
  const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
  const line = new THREE.LineSegments(edgesGeometry, lineMaterial);
  line.position.copy(center);
  return line;
}

function smartCivilSourceText(instruction = {}) {
  const attrs = instruction.attributes || {};
  const att = instruction.att || {};
  const attAttrs = instruction.attAttributes || {};
  return [
    instruction.sourcePath,
    instruction.sourceName,
    instruction.displayName,
    instruction.type,
    instruction.kind,
    instruction.renderPrimitive,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.NAME,
    attrs.TYPE,
    attrs.RVM_PRIMITIVE_KIND,
    att.DTXR_POS,
    att.DTXR,
    att.DESCRIPTION,
    att.DESC,
    attAttrs.DTXR_POS,
    attAttrs.DTXR,
  ].filter(Boolean).join('/');
}

function semanticSignals(text) {
  const kinds = [];
  let score = 0;
  for (const [kind, re] of Object.entries(CIVIL_TERMS)) {
    if (re.test(text)) {
      kinds.push(kind);
      score += kind === 'STRUCTURE' ? 1 : 3;
    }
  }
  if (/\/STRUCTURE\//i.test(text)) score += 1;
  return { kinds, score };
}

function geometrySignals(dims, stats = {}) {
  const maxDim = Math.max(dims.x, dims.y, dims.z);
  const minDim = Math.min(dims.x, dims.y, dims.z);
  const midDim = [dims.x, dims.y, dims.z].sort((a, b) => a - b)[1] || 0;
  const diagonal = Math.hypot(dims.x, dims.y, dims.z);
  const thinRatio = maxDim > 0 ? minDim / maxDim : 1;
  const large = maxDim >= LARGE_MAX_DIM || diagonal >= LARGE_DIAGONAL;
  const huge = maxDim >= HUGE_MAX_DIM;
  const planar = large && thinRatio <= THIN_RATIO;
  const veryThin = large && thinRatio <= VERY_THIN_RATIO;
  const broad = large && midDim >= Math.max(80, maxDim * 0.12);
  const holeRisk = Number(stats?.holeSkippedCount || 0) > 0;
  const complex = Number(stats?.triangleCount || 0) > 80 || Number(stats?.polygonCount || 0) > 30;
  let score = 0;
  if (large) score += 2;
  if (huge) score += 2;
  if (planar) score += 2;
  if (veryThin) score += 1;
  if (broad) score += 1;
  if (holeRisk) score += 1;
  if (complex && planar) score += 1;
  return { ...dims, maxDim, minDim, midDim, diagonal, thinRatio, large, huge, planar, veryThin, broad, holeRisk, complex, score };
}

function chooseKind(kinds, geometry) {
  if (kinds.includes('GRID')) return 'GRID';
  if (kinds.includes('FOUNDATION')) return 'FOUNDATION';
  if (kinds.includes('EARTHWORK')) return 'EARTHWORK';
  if (kinds.includes('PANEL_FRAME')) return 'PANEL_FRAME';
  if (kinds.includes('STRUCTURE')) return geometry.planar ? 'STRUCTURAL_PANEL' : 'STRUCTURE';
  return geometry.planar ? 'PLANAR_FACET' : 'CIVIL_FACET';
}

function shouldHideByDefault(kind, semantics, geometry) {
  if (kind === 'GRID') return true;
  if (kind === 'PANEL_FRAME' && geometry.planar) return true;
  if (kind === 'STRUCTURAL_PANEL' && geometry.huge) return true;
  if (kind === 'PLANAR_FACET' && geometry.huge && geometry.veryThin) return true;
  return false;
}

function primitiveCodeForInstruction(instruction = {}, native = null) {
  const attrs = instruction.attributes || {};
  const params = native?.params || parseParams(attrs.RVM_NATIVE_PRIMITIVE_PARAMS);
  return Number(params?.kind || attrs.RVM_PRIMITIVE_CODE || instruction.primitiveCode || 0);
}

function facetStatsFromParams(params = {}) {
  let polygonCount = 0;
  let triangleCount = 0;
  let holeSkippedCount = 0;
  const polygons = Array.isArray(params?.polygons) ? params.polygons : [];
  for (const polygon of polygons) {
    const contours = Array.isArray(polygon?.contours) ? polygon.contours : [];
    const contour = contours[0];
    if (!contour || !Array.isArray(contour.vertices)) continue;
    const vertexCount = Math.floor(contour.vertices.length / 3);
    if (vertexCount < 3) continue;
    polygonCount += 1;
    holeSkippedCount += Math.max(contours.length - 1, 0);
    triangleCount += Math.max(vertexCount - 2, 1);
  }
  return { polygonCount, triangleCount, holeSkippedCount };
}

function parseParams(value) {
  if (!value) return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function parseBbox(value) {
  if (!value) return null;
  let arr = null;
  if (Array.isArray(value)) arr = value;
  else {
    try { arr = JSON.parse(String(value)); }
    catch (_) { arr = String(value).split(/[\s,]+/g).map(Number).filter(Number.isFinite); }
  }
  if (!Array.isArray(arr) || arr.length < 6) return null;
  const out = arr.slice(0, 6).map(Number);
  return out.every(Number.isFinite) ? out : null;
}

function dimsFromBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 6) return null;
  return normalizeDims({ x: Math.abs(bbox[3] - bbox[0]), y: Math.abs(bbox[4] - bbox[1]), z: Math.abs(bbox[5] - bbox[2]) });
}

function dimsFromObject(object) {
  try {
    const box = new THREE.Box3().setFromObject(object);
    if (!box || box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    return normalizeDims(size);
  } catch (_) {
    return null;
  }
}

function normalizeDims(value) {
  return {
    x: Math.max(0, Number(value?.x || 0)),
    y: Math.max(0, Number(value?.y || 0)),
    z: Math.max(0, Number(value?.z || 0)),
  };
}

function cachedGeometry(context, key, factory) {
  if (!context?.geometryCache || context?.renderOptions?.cacheGeometries === false) return factory();
  if (context.geometryCache.has(key)) {
    if (context.stats) context.stats.geometryCacheHits += 1;
    return context.geometryCache.get(key);
  }
  if (context.stats) context.stats.geometryCacheMisses += 1;
  const geometry = factory();
  context.geometryCache.set(key, geometry);
  return geometry;
}

function fixed(value) { return Number(value || 0).toFixed(3); }
