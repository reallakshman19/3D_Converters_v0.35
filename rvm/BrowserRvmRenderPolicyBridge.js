import * as THREE from 'three';

export const BROWSER_RVM_RENDER_POLICY_SCHEMA = 'browser-rvm-render-policy/v1';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-render-policy-bridge-v1');
const GLOBAL_STATE_KEY = '__PCF_GLB_RVM_RENDER_POLICY__';
const GLOBAL_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_RENDER_POLICY_DIAGNOSTICS__';
const MAX_SCAN_OBJECTS = 160000;
const LARGE_DIAG_SIZE = 900;
const LARGE_DIAG_DIAGONAL = 1400;

export function installBrowserRvmRenderPolicyBridge() {
  if (globalThis[PATCH_FLAG]) return globalThis[PATCH_FLAG];
  const state = {
    installed: true,
    schemaVersion: BROWSER_RVM_RENDER_POLICY_SCHEMA,
    installedAt: new Date().toISOString(),
    runs: 0,
    lastDiagnostics: null,
    runNow() { return runAndPublish(); },
    getDiagnostics() { return state.lastDiagnostics || globalThis[GLOBAL_DIAGNOSTICS_KEY] || null; },
  };
  globalThis[PATCH_FLAG] = state;
  globalThis[GLOBAL_STATE_KEY] = state;

  function schedule() { requestAnimationFrameSafe(runAndPublish); }
  state.schedule = schedule;

  function runAndPublish() {
    const diagnostics = applyActiveBrowserRvmRenderPolicy();
    state.runs += 1;
    state.lastDiagnostics = diagnostics;
    publishBrowserRvmRenderPolicyDiagnostics(diagnostics);
    return diagnostics;
  }

  try { globalThis.addEventListener?.('rvm-model-loaded', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-browser-parse-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-native-tessellation-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-native-facet-ghost-panel-diagnostics', schedule); } catch (_) {}
  for (const delay of [300, 900, 1800, 3600]) setTimeout(schedule, delay);
  return state;
}

export function applyActiveBrowserRvmRenderPolicy() {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!viewer?.modelGroup?.traverse) return makeDiagnostics({ reason: 'viewer-not-ready' });
  return applyBrowserRvmRenderPolicy(viewer.modelGroup);
}

export function publishBrowserRvmRenderPolicyDiagnostics(diagnostics = {}) {
  const payload = { schemaVersion: BROWSER_RVM_RENDER_POLICY_SCHEMA, capturedAt: new Date().toISOString(), ...(diagnostics || {}) };
  globalThis[GLOBAL_DIAGNOSTICS_KEY] = payload;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-render-policy-diagnostics', { detail: payload })); } catch (_) {}
  return payload;
}

export function applyBrowserRvmRenderPolicy(root) {
  const diagnostics = makeDiagnostics();
  if (!root?.traverse) return diagnostics;
  root.traverse((object) => {
    if (!object || diagnostics.scannedCount >= MAX_SCAN_OBJECTS) return;
    diagnostics.scannedCount += 1;
    if (!(object.isMesh || object.isLine || object.isPoints || object.isGroup)) return;
    const data = object.userData || {};
    const policy = classifyObject(object, data);
    stampObjectTraceMetadata(object, policy);
    bump(diagnostics.kindCounts, policy.renderKind || 'UNKNOWN');
    if (policy.pickable === false && object.visible !== false) {
      diagnostics.visibleNonPickableCount += 1;
      bump(diagnostics.nonPickableReasons, policy.nonSelectableReason || 'non-selectable');
    }
    if (policy.action === 'hide') {
      object.visible = false;
      diagnostics.hiddenCount += 1;
      bump(diagnostics.policyActions, 'hide');
    } else if (policy.action === 'wireframe') {
      applyWireframePolicy(object, policy);
      diagnostics.wireframeCount += 1;
      bump(diagnostics.policyActions, 'wireframe');
    } else if (policy.action === 'ghost') {
      applyGhostPolicy(object, policy);
      diagnostics.ghostCount += 1;
      bump(diagnostics.policyActions, 'ghost');
    } else {
      bump(diagnostics.policyActions, 'solid-or-unchanged');
    }
  });
  if (diagnostics.scannedCount >= MAX_SCAN_OBJECTS) diagnostics.scanCapped = true;
  return diagnostics;
}

function classifyObject(object, data) {
  const effectivePrimitive = String(data.effectiveRenderPrimitive || data.renderKind || data.parentBrowserRvmRenderPrimitive || object.name || '').toUpperCase();
  const rawPrimitive = String(data.renderPrimitive || data.originalPrimitive || data.parentBrowserRvmRenderPrimitive || '').toUpperCase();
  const renderKind = effectivePrimitive || rawPrimitive || 'UNKNOWN';
  const isHelperEdges = Boolean(data.browserRvmNativeFacetGroupEdges || data.browserRvmNativeFacetGhostEdges || /_EDGES$/.test(renderKind));
  const isBboxPlaceholder = Boolean(data.browserRvmBboxPlaceholderWireframe || /BBOX_PLACEHOLDER/.test(renderKind) || /PLACEHOLDER/.test(renderKind));
  const isUnmapped = !data.sourcePath && !data.browserRvmProperties?.sourcePath && !data.displayName && !data.sourceName && object !== object.parent;
  const suspiciousFan = isSuspiciousConeFanEnvelope(object, data);

  if (isHelperEdges) {
    return policyFor(object, 'wireframe', renderKind, rawPrimitive, false, 'native-facet-diagnostic-edge-overlay', 'diagnostic-edges', 'line-wireframe');
  }
  if (isBboxPlaceholder) {
    return policyFor(object, object.isLine ? 'none' : 'wireframe', renderKind, rawPrimitive, false, 'bbox-placeholder-diagnostic-wireframe', 'wireframe-diagnostic-not-solid-geometry', 'line-wireframe');
  }
  if (suspiciousFan) {
    return policyFor(object, object.isLine ? 'none' : 'wireframe', renderKind, rawPrimitive, data.pickable !== false, 'suspicious-large-cone-fan-envelope', 'wireframe-suspicious-cone-fan', 'wireframe-risk-guard');
  }
  if (isUnmapped && object.visible !== false && (object.isMesh || object.isLine)) {
    return policyFor(object, 'none', renderKind, rawPrimitive, false, 'visible-object-missing-source-id', 'unmapped-visible-diagnostic', 'diagnostic');
  }
  return policyFor(object, 'none', renderKind, rawPrimitive, data.pickable !== false, data.nonSelectableReason || '', data.geometryPolicy || 'source-model-geometry', data.materialPolicy || 'source-material');
}

function policyFor(object, action, renderKind, rawPrimitive, pickable, reason, geometryPolicy, materialPolicy) {
  return {
    action,
    renderKind: renderKind || 'UNKNOWN',
    originalPrimitive: rawPrimitive || '',
    pickable: Boolean(pickable),
    selectable: Boolean(pickable),
    nonSelectableReason: pickable ? '' : reason,
    fallbackReason: reason || '',
    geometryPolicy,
    materialPolicy,
    primitiveCode: object?.userData?.primitiveCode || object?.userData?.browserRvmNativePrimitiveCode || object?.userData?.browserRvmAttributes?.RVM_PRIMITIVE_CODE || '',
  };
}

function stampObjectTraceMetadata(object, policy) {
  const data = object.userData || {};
  const props = data.browserRvmProperties || {};
  const canonicalId = data.canonicalId || data.name || props.canonicalId || object.name || object.uuid || '';
  object.userData = {
    ...data,
    rvmSource: true,
    renderKind: data.renderKind || policy.renderKind,
    primitiveCode: data.primitiveCode || policy.primitiveCode || '',
    effectivePrimitive: data.effectivePrimitive || data.effectiveRenderPrimitive || policy.renderKind,
    originalPrimitive: data.originalPrimitive || data.renderPrimitive || policy.originalPrimitive,
    reviewName: data.reviewName || data.displayName || data.sourceName || object.name || '',
    sourcePath: data.sourcePath || props.sourcePath || props.SourcePath || '',
    canonicalId,
    pickable: policy.pickable,
    selectable: policy.selectable,
    fallbackReason: data.fallbackReason || policy.fallbackReason || '',
    materialPolicy: policy.materialPolicy,
    geometryPolicy: policy.geometryPolicy,
    nonSelectableReason: policy.nonSelectableReason || data.nonSelectableReason || '',
    browserRvmRenderPolicySchema: BROWSER_RVM_RENDER_POLICY_SCHEMA,
  };
}

function applyWireframePolicy(object, policy) {
  if (object.isLine || object.userData?.browserRvmRenderPolicyApplied === policy.geometryPolicy) return;
  object.traverse?.((child) => {
    if (!child?.isMesh || !child.geometry) return;
    const wasArray = Array.isArray(child.material);
    const materials = wasArray ? child.material : [child.material];
    const next = materials.map((material) => {
      const cloned = material?.clone ? material.clone() : new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
      cloned.wireframe = true;
      cloned.transparent = true;
      cloned.opacity = 0.35;
      cloned.depthWrite = false;
      return cloned;
    });
    child.material = wasArray ? next : next[0];
    child.userData = { ...(child.userData || {}), browserRvmRenderPolicyApplied: policy.geometryPolicy, pickable: policy.pickable, selectable: policy.selectable, nonSelectableReason: policy.nonSelectableReason };
  });
  object.userData.browserRvmRenderPolicyApplied = policy.geometryPolicy;
}

function applyGhostPolicy(object, policy) {
  if (object.userData?.browserRvmRenderPolicyApplied === policy.geometryPolicy) return;
  object.traverse?.((child) => {
    if (!child?.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const next = materials.map((material) => {
      const cloned = material?.clone ? material.clone() : new THREE.MeshStandardMaterial({ color: 0x73808f });
      cloned.transparent = true;
      cloned.opacity = 0.22;
      cloned.depthWrite = false;
      cloned.side = THREE.DoubleSide;
      return cloned;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
  object.userData.browserRvmRenderPolicyApplied = policy.geometryPolicy;
}

function isSuspiciousConeFanEnvelope(object, data) {
  if (!(object?.isMesh || object?.isGroup)) return false;
  const renderKind = String(data.effectiveRenderPrimitive || data.renderKind || '').toUpperCase();
  const isFacetOrCone = /FACET|CONE|SNOUT|FRUSTUM/.test(renderKind);
  if (!isFacetOrCone) return false;
  let box = null;
  try { box = new THREE.Box3().setFromObject(object); } catch (_) { return false; }
  if (!box || box.isEmpty()) return false;
  const size = new THREE.Vector3();
  box.getSize(size);
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
  const diagonal = Math.hypot(size.x, size.y, size.z);
  const maxDim = dims[2] || 0;
  const midDim = dims[1] || 0;
  const minDim = dims[0] || 0;
  const triangleCount = Number(data.browserRvmNativeFacetGroupTriangleCount || data.triangleCount || 0);
  const largeEnvelope = maxDim >= LARGE_DIAG_SIZE && diagonal >= LARGE_DIAG_DIAGONAL;
  const nonPipeAspect = maxDim / Math.max(midDim, 1) >= 1.8 || minDim / Math.max(maxDim, 1) >= 0.08;
  return largeEnvelope && nonPipeAspect && triangleCount >= 10;
}

function makeDiagnostics(extra = {}) {
  return {
    schemaVersion: BROWSER_RVM_RENDER_POLICY_SCHEMA,
    reason: extra.reason || '',
    scannedCount: 0,
    hiddenCount: 0,
    ghostCount: 0,
    wireframeCount: 0,
    visibleNonPickableCount: 0,
    scanCapped: false,
    kindCounts: {},
    policyActions: {},
    nonPickableReasons: {},
    ...extra,
  };
}

function bump(target, key) {
  const name = String(key || '').trim() || 'unknown';
  target[name] = (target[name] || 0) + 1;
}

function requestAnimationFrameSafe(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(callback, 0);
}
