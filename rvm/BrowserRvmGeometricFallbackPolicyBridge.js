import * as THREE from 'three';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-geometric-fallback-policy-v1');
const VERSION = '20260622-rvm-geometric-fallback-policy-1';
const GLOBAL_KEY = '__PCF_GLB_RVM_GEOMETRIC_FALLBACK_POLICY__';
const DIAG_KEY = '__PCF_GLB_RVM_GEOMETRIC_FALLBACK_POLICY_DIAGNOSTICS__';
const LARGE_MAX_DIM = 900;
const LARGE_DIAGONAL = 1600;
const HUGE_MAX_DIM = 2200;
const WEAK_SOURCE_RE = /^\/?(EQUIPMENT|STRUCTURE|STRUCTURES|PIPING|CIVIL|MODEL|RVM)\/?$/i;
const BOXISH_RE = /BOX|BBOX|PLACEHOLDER|GENERIC|DISH_BBOX|BOX_SOLID|SLAB|PANEL|FRAME|PLATE|FLOOR|FOUND|GRID|GENSEC/i;
const PROCESS_RE = /PIPE|PIPING|ELBOW|BEND|TEE|OLET|FLANGE|VALVE|NOZZLE|GASKET|REDUCER|PUMP|VESSEL|TANK|EQUIPMENT|SUPPORT|HANGER|GUIDE|STOP|ANCHOR|SHOE/i;
const CIVIL_RE = /GRID|GENSEC|FDNS|FOUND|FOUNDATION|FOOTING|SLAB|PANEL|FRAME|FRMWORK|PAVE|ROAD|GRAD|GRADE|PIT|TRENCH|STRUCTURE|CIVIL|WALL|FLOOR|DECK/i;

export function installBrowserRvmGeometricFallbackPolicyBridge() {
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  const state = {
    version: VERSION,
    runs: 0,
    lastDiagnostics: null,
    runNow: () => runPolicy(state),
  };
  globalThis[INSTALL_FLAG] = state;
  globalThis[GLOBAL_KEY] = state;
  const schedule = () => setTimeout(() => runPolicy(state), 0);
  for (const event of ['rvm-model-loaded', 'rvm-civil-fallback-policy-diagnostics', 'rvm-render-policy-diagnostics', 'rvm-native-facet-diagnostics']) {
    try { globalThis.addEventListener?.(event, schedule); } catch (_) {}
  }
  for (const delay of [400, 1200, 2400, 4800]) setTimeout(schedule, delay);
  return state;
}

export function runBrowserRvmGeometricFallbackPolicy(modelGroup = globalThis.__3D_RVM_VIEWER__?.modelGroup) {
  const diagnostics = baseDiagnostics();
  if (!modelGroup?.traverse) return { ...diagnostics, reason: 'model-not-ready' };
  modelGroup.traverse((object) => {
    if (!(object?.isMesh || object?.isLineSegments || object?.isGroup)) return;
    diagnostics.scannedCount += 1;
    const policy = classifyGeometricFallback(object);
    if (!policy) return;
    diagnostics.policyCount += 1;
    diagnostics.byReason[policy.reason] = (diagnostics.byReason[policy.reason] || 0) + 1;
    applyPolicy(object, policy);
    if (policy.action === 'hide') diagnostics.hiddenCount += 1;
    if (policy.action === 'wireframe') diagnostics.wireframeCount += 1;
    if (diagnostics.examples.length < 10) diagnostics.examples.push({ name: object.name || '', reason: policy.reason, size: policy.size });
  });
  return diagnostics;
}

function runPolicy(state) {
  const diagnostics = runBrowserRvmGeometricFallbackPolicy();
  state.runs += 1;
  state.lastDiagnostics = diagnostics;
  globalThis[DIAG_KEY] = diagnostics;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-geometric-fallback-policy-diagnostics', { detail: diagnostics })); } catch (_) {}
  return diagnostics;
}

function classifyGeometricFallback(object) {
  const data = object.userData || {};
  if (data.rvmBranchDisabledByUser || data.browserRvmGeometricFallbackPolicy) return null;
  if (object.visible === false) return null;
  const text = sourceText(object, data);
  const primitive = primitiveText(object, data);
  const weakSource = isWeakSource(data, text);
  const boxish = BOXISH_RE.test(`${primitive} ${text}`) || data.browserRvmBboxPlaceholderWireframe || data.bboxPromotedSolidBlocked;
  const processProtected = !weakSource && PROCESS_RE.test(text) && !CIVIL_RE.test(text);
  if (processProtected) return null;
  const size = objectSize(object);
  if (!size || (!size.large && !size.huge)) return null;
  const nonSelectable = data.pickable === false || data.selectable === false || Boolean(data.nonSelectableReason);
  const civil = CIVIL_RE.test(text);
  const anonymousHugeBox = boxish && size.huge && (weakSource || !hasCanonicalIdentity(data));
  const nonSelectableLargeBox = boxish && nonSelectable && size.large;
  const civilLargeBox = boxish && civil && size.large;
  if (!(anonymousHugeBox || nonSelectableLargeBox || civilLargeBox)) return null;
  if (/GRID|GENSEC|REFERENCE|AXIS|EASTING|NORTHING/i.test(text) || anonymousHugeBox) {
    return { action: 'hide', reason: anonymousHugeBox ? 'huge-anonymous-box-diagnostic-hidden' : 'grid-reference-box-diagnostic-hidden', size };
  }
  return { action: 'wireframe', reason: civil ? 'large-civil-box-wireframe-diagnostic' : 'large-nonselectable-box-wireframe-diagnostic', size };
}

function applyPolicy(object, policy) {
  object.userData = {
    ...(object.userData || {}),
    browserRvmGeometricFallbackPolicy: true,
    browserRvmGeometricFallbackPolicyVersion: VERSION,
    pickable: false,
    selectable: false,
    nonSelectableReason: policy.reason,
    fallbackReason: policy.reason,
    geometryPolicy: policy.action === 'hide' ? 'geometric-fallback-hidden-diagnostic' : 'geometric-fallback-wireframe-diagnostic',
    materialPolicy: 'geometric-fallback-diagnostic',
  };
  if (policy.action === 'hide') {
    object.visible = false;
    return;
  }
  object.traverse?.((child) => {
    if (!child?.material || !child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((mat) => {
      const clone = mat?.clone ? mat.clone() : new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
      clone.wireframe = true;
      clone.transparent = true;
      clone.opacity = 0.10;
      clone.depthWrite = false;
      return clone;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function objectSize(object) {
  let box = null;
  try { box = new THREE.Box3().setFromObject(object); } catch (_) { return null; }
  if (!box || box.isEmpty()) return null;
  const v = box.getSize(new THREE.Vector3());
  const dims = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)].sort((a, b) => a - b);
  const maxDim = dims[2] || 0;
  const midDim = dims[1] || 0;
  const minDim = dims[0] || 0;
  const diagonal = Math.hypot(v.x, v.y, v.z);
  const thinRatio = maxDim > 0 ? minDim / maxDim : 1;
  return { x: Math.abs(v.x), y: Math.abs(v.y), z: Math.abs(v.z), minDim, midDim, maxDim, diagonal, thinRatio, large: maxDim >= LARGE_MAX_DIM || diagonal >= LARGE_DIAGONAL, huge: maxDim >= HUGE_MAX_DIM, planar: maxDim >= LARGE_MAX_DIM && thinRatio <= 0.05 };
}

function sourceText(object, data) {
  const attrs = data.browserRvmAttributes || data.attributes || {};
  const props = data.browserRvmProperties || {};
  return [object.name, data.displayName, data.sourceName, data.sourcePath, data.reviewName, props.sourcePath, props.SourcePath, props.displayName, attrs.RVM_OWNER_PATH, attrs.RVM_OWNER_NAME, attrs.RVM_REVIEW_NAME, attrs.REVIEW_NAME, attrs.NAME, attrs.TYPE, attrs.RVM_PRIMITIVE_KIND].filter(Boolean).join('/').toUpperCase();
}

function primitiveText(object, data) {
  return [object.name, data.renderKind, data.renderPrimitive, data.effectiveRenderPrimitive, data.effectivePrimitive, data.primitiveCode, data.browserRvmNativePrimitiveCode].filter(Boolean).join('/').toUpperCase();
}

function isWeakSource(data, text = '') {
  const source = String(data.sourcePath || data.browserRvmProperties?.sourcePath || '').trim();
  if (!source || WEAK_SOURCE_RE.test(source)) return true;
  if (WEAK_SOURCE_RE.test(text.trim())) return true;
  return false;
}

function hasCanonicalIdentity(data = {}) {
  return Boolean(data.canonicalId || data.sourcePath || data.browserRvmProperties?.sourcePath || data.renderObjectId || data.leafRenderObjectId);
}

function baseDiagnostics() {
  return { version: VERSION, capturedAt: new Date().toISOString(), scannedCount: 0, policyCount: 0, hiddenCount: 0, wireframeCount: 0, byReason: {}, examples: [] };
}
