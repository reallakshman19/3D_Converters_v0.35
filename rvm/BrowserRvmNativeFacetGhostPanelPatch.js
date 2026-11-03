import * as THREE from 'three';

export const BROWSER_RVM_NATIVE_FACET_GHOST_PANEL_SCHEMA = 'browser-rvm-native-facet-ghost-panels/v1';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-native-facet-ghost-panel-patch-v1');
const GLOBAL_STATE_KEY = '__PCF_GLB_RVM_NATIVE_FACET_GHOST_PANELS__';
const GLOBAL_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_NATIVE_FACET_GHOST_PANEL_DIAGNOSTICS__';
const THIN_PANEL_RATIO = 0.035;
const LARGE_PANEL_LONG_EDGE = 900;
const LARGE_PANEL_DIAGONAL = 1400;
const MAX_SCAN_OBJECTS = 120000;
const MAX_EDGE_OBJECTS = 16000;
const GHOST_OPACITY = 0.24;
const WIREFRAME_OPACITY = 0.72;

export function installBrowserRvmNativeFacetGhostPanelPatch() {
  if (globalThis[PATCH_FLAG]) return globalThis[PATCH_FLAG];
  const state = {
    installed: true,
    schemaVersion: BROWSER_RVM_NATIVE_FACET_GHOST_PANEL_SCHEMA,
    installedAt: new Date().toISOString(),
    runs: 0,
    lastDiagnostics: null,
    runNow() {
      return runAndPublish();
    },
    getDiagnostics() {
      return state.lastDiagnostics || globalThis[GLOBAL_DIAGNOSTICS_KEY] || null;
    }
  };
  globalThis[PATCH_FLAG] = state;
  globalThis[GLOBAL_STATE_KEY] = state;

  const schedule = () => requestAnimationFrameSafe(runAndPublish);
  state.schedule = schedule;

  function runAndPublish() {
    const diagnostics = applyActiveRvmNativeFacetGhostPanelPatch();
    state.runs += 1;
    state.lastDiagnostics = diagnostics;
    publishNativeFacetGhostPanelDiagnostics(diagnostics);
    return diagnostics;
  }

  try { globalThis.addEventListener?.('rvm-browser-parse-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-native-tessellation-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-model-health-updated', schedule); } catch (_) {}
  for (const delay of [500, 1400, 2800, 5200]) setTimeout(schedule, delay);
  return state;
}

export function applyActiveRvmNativeFacetGhostPanelPatch() {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!viewer?.modelGroup?.traverse) return makeDiagnostics({ reason: 'viewer-not-ready' });
  return ghostNativeFacetPanels(viewer.modelGroup);
}

export function publishNativeFacetGhostPanelDiagnostics(diagnostics = {}) {
  const payload = {
    schemaVersion: BROWSER_RVM_NATIVE_FACET_GHOST_PANEL_SCHEMA,
    capturedAt: new Date().toISOString(),
    ...(diagnostics || {})
  };
  globalThis[GLOBAL_DIAGNOSTICS_KEY] = payload;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-native-facet-ghost-panel-diagnostics', { detail: payload })); } catch (_) {}
  return payload;
}

export function ghostNativeFacetPanels(root) {
  const diagnostics = makeDiagnostics();
  if (!root?.traverse) return diagnostics;

  const candidates = [];
  root.traverse((object) => {
    if (!object || diagnostics.scannedCount >= MAX_SCAN_OBJECTS) return;
    diagnostics.scannedCount += 1;
    if (!isNativeFacetGroupObject(object)) return;
    diagnostics.candidateCount += 1;
    const policy = classifyFacetObject(object);
    if (!policy.action) {
      diagnostics.keptSolidCount += 1;
      return;
    }
    candidates.push({ object, policy });
  });

  if (diagnostics.scannedCount >= MAX_SCAN_OBJECTS) diagnostics.scanCapped = true;

  for (const item of candidates) {
    const changed = applyGhostPolicy(item.object, item.policy);
    if (!changed) {
      diagnostics.skippedCount += 1;
      continue;
    }
    if (item.policy.action === 'wireframe-only') diagnostics.wireframeOnlyCount += 1;
    else diagnostics.ghostedCount += 1;
    bump(diagnostics.reasons, item.policy.reason);
  }

  return diagnostics;
}

function makeDiagnostics(extra = {}) {
  return {
    schemaVersion: BROWSER_RVM_NATIVE_FACET_GHOST_PANEL_SCHEMA,
    reason: extra.reason || '',
    scannedCount: 0,
    candidateCount: 0,
    keptSolidCount: 0,
    ghostedCount: 0,
    wireframeOnlyCount: 0,
    skippedCount: 0,
    scanCapped: false,
    reasons: {},
    ...extra
  };
}

function isNativeFacetGroupObject(object) {
  const data = object?.userData || {};
  return Boolean(
    data.browserRvmNativeFacetGroupPrimary
    || data.effectiveRenderPrimitive === 'RVM_NATIVE_FACET_GROUP'
    || String(data.browserRvmNativeFacetGroupSchema || '').includes('native-facetgroup')
  );
}

function classifyFacetObject(object) {
  const data = object?.userData || {};
  if (data.browserRvmNativeFacetGhostApplied) {
    return { action: '', reason: 'already-applied' };
  }
  const holeCount = Number(data.browserRvmNativeFacetGroupContourHoleSkippedCount || 0);
  if (holeCount > 0) return { action: 'wireframe-only', reason: 'facet-holes-filled-by-fan-triangulation' };

  const box = new THREE.Box3().setFromObject(object);
  if (!box || box.isEmpty()) return { action: '', reason: 'empty-bounds' };
  const size = new THREE.Vector3();
  box.getSize(size);
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
  const minDim = dims[0] || 0;
  const midDim = dims[1] || 0;
  const maxDim = dims[2] || 0;
  const diagonal = Math.hypot(size.x, size.y, size.z);
  const thinRatio = maxDim > 0 ? minDim / maxDim : 1;
  const largeThinPanel = maxDim >= LARGE_PANEL_LONG_EDGE && diagonal >= LARGE_PANEL_DIAGONAL && thinRatio <= THIN_PANEL_RATIO;
  const complexThinFan = Number(data.browserRvmNativeFacetGroupTriangleCount || 0) > 80 && thinRatio <= THIN_PANEL_RATIO && midDim > 0;
  if (largeThinPanel || complexThinFan) {
    return { action: 'ghost', reason: largeThinPanel ? 'large-thin-facet-panel' : 'complex-thin-facet-fan' };
  }
  return { action: '', reason: 'solid-ok' };
}

function applyGhostPolicy(object, policy) {
  let changed = false;
  object.userData = {
    ...(object.userData || {}),
    browserRvmNativeFacetGhostApplied: true,
    browserRvmNativeFacetGhostPolicy: policy.action,
    browserRvmNativeFacetGhostReason: policy.reason,
    browserRvmNativeFacetGroupGhosted: policy.action === 'ghost',
    browserRvmNativeFacetGroupWireframeOnly: policy.action === 'wireframe-only',
    renderQuality: policy.action === 'wireframe-only' ? 'native-facetgroup-wireframe-risk-guard' : 'native-facetgroup-ghost-panel'
  };

  object.traverse?.((child) => {
    if (!child?.isMesh || !child.geometry) return;
    if (policy.action === 'wireframe-only') child.visible = false;
    else ghostMeshMaterial(child);
    if (addEdgesForMesh(child, policy)) changed = true;
    child.userData = {
      ...(child.userData || {}),
      browserRvmNativeFacetGhostApplied: true,
      browserRvmNativeFacetGhostPolicy: policy.action,
      browserRvmNativeFacetGhostReason: policy.reason,
      renderQuality: object.userData.renderQuality
    };
    changed = true;
  });
  return changed;
}

function ghostMeshMaterial(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const next = materials.map((material) => {
    const cloned = material?.clone ? material.clone() : new THREE.MeshStandardMaterial({ color: 0x73808f });
    cloned.transparent = true;
    cloned.opacity = GHOST_OPACITY;
    cloned.depthWrite = false;
    cloned.side = THREE.DoubleSide;
    cloned.polygonOffset = true;
    cloned.polygonOffsetFactor = 1;
    cloned.polygonOffsetUnits = 1;
    return cloned;
  });
  mesh.material = Array.isArray(mesh.material) ? next : next[0];
}

function addEdgesForMesh(mesh, policy) {
  if (!mesh?.geometry || mesh.userData?.browserRvmNativeFacetEdgesAdded) return false;
  const vertexCount = mesh.geometry?.attributes?.position?.count || 0;
  if (vertexCount > MAX_EDGE_OBJECTS) return false;
  const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, 24);
  const color = firstMaterialColor(mesh.material) || 0x7dd3fc;
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: policy.action === 'wireframe-only' ? WIREFRAME_OPACITY : 0.58, depthWrite: false });
  const line = new THREE.LineSegments(edgesGeometry, material);
  line.name = 'RVM_NATIVE_FACET_GHOST_EDGES';
  line.userData = {
    browserRvmNativeFacetGhostEdges: true,
    browserRvmNativeFacetGhostPolicy: policy.action,
    pickable: false
  };
  mesh.parent?.add?.(line);
  mesh.userData.browserRvmNativeFacetEdgesAdded = true;
  return true;
}

function firstMaterialColor(material) {
  const m = Array.isArray(material) ? material[0] : material;
  return m?.color?.getHex ? m.color.getHex() : null;
}

function bump(target, key) {
  const name = String(key || '').trim() || 'unknown';
  target[name] = (target[name] || 0) + 1;
}

function requestAnimationFrameSafe(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(callback, 0);
}
