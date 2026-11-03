import * as THREE from 'three';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-debug-pick-v1');
const GLOBAL_KEY = '__PCF_GLB_RVM_DEBUG_PICK__';
const LAST_INTERSECTIONS = Symbol.for('pcf-glb-rvm-debug-pick-last-intersections-v1');
const MAX_SUMMARY_OBJECTS = 120000;

export function installBrowserRvmPickDiagnosticsBridge() {
  if (globalThis[INSTALL_FLAG]) return globalThis[GLOBAL_KEY];
  globalThis[INSTALL_FLAG] = true;
  const api = {
    version: '20260622-rvm-debug-pick-1',
    inspectAtClientPoint,
    listTopIntersections,
    summarizeRenderedKinds,
    summarizeNonPickableVisibleObjects,
  };
  globalThis[GLOBAL_KEY] = api;
  return api;
}

function inspectAtClientPoint(x, y) {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const domElement = viewer?.renderer?.domElement || viewer?.canvas || document.querySelector?.('canvas');
  const camera = viewer?.camera;
  const modelGroup = viewer?.modelGroup || viewer?.scene;
  if (!domElement || !camera || !modelGroup) return { ok: false, reason: 'viewer-camera-or-dom-not-ready' };
  const rect = domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(((Number(x) - rect.left) / rect.width) * 2 - 1, -((Number(y) - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(modelGroup, true).slice(0, 30).map(intersectionSummary);
  globalThis[LAST_INTERSECTIONS] = hits;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-pick-diagnostics', { detail: { clientX: x, clientY: y, hits } })); } catch (_) {}
  return { ok: true, clientX: x, clientY: y, hitCount: hits.length, hits };
}

function listTopIntersections() {
  return [...(globalThis[LAST_INTERSECTIONS] || [])];
}

function summarizeRenderedKinds() {
  const root = activeRvmRoot();
  const summary = { scanned: 0, capped: false, byRenderKind: {}, byEffectivePrimitive: {}, byOriginalPrimitive: {}, byGeometryPolicy: {}, byMaterialPolicy: {} };
  if (!root?.traverse) return { ...summary, reason: 'no-active-rvm-root' };
  root.traverse((object) => {
    if (summary.scanned >= MAX_SUMMARY_OBJECTS) { summary.capped = true; return; }
    if (!(object?.isMesh || object?.isLine || object?.isPoints)) return;
    summary.scanned += 1;
    const data = metadataFor(object);
    bump(summary.byRenderKind, data.renderKind || 'UNKNOWN');
    bump(summary.byEffectivePrimitive, data.effectivePrimitive || 'UNKNOWN');
    bump(summary.byOriginalPrimitive, data.originalPrimitive || 'UNKNOWN');
    bump(summary.byGeometryPolicy, data.geometryPolicy || 'none');
    bump(summary.byMaterialPolicy, data.materialPolicy || 'none');
  });
  return summary;
}

function summarizeNonPickableVisibleObjects(limit = 80) {
  const root = activeRvmRoot();
  const out = { scanned: 0, capped: false, count: 0, reasons: {}, objects: [] };
  if (!root?.traverse) return { ...out, reason: 'no-active-rvm-root' };
  root.traverse((object) => {
    if (out.scanned >= MAX_SUMMARY_OBJECTS) { out.capped = true; return; }
    if (!(object?.isMesh || object?.isLine || object?.isPoints)) return;
    out.scanned += 1;
    const data = metadataFor(object);
    if (object.visible !== false && data.pickable === false) {
      out.count += 1;
      bump(out.reasons, data.nonSelectableReason || 'pickable=false');
      if (out.objects.length < limit) out.objects.push(data);
    }
  });
  return out;
}

function intersectionSummary(hit) {
  const object = hit?.object || null;
  return {
    distance: Number(hit?.distance || 0),
    point: hit?.point ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null,
    ...metadataFor(object),
  };
}

function metadataFor(object) {
  const data = object?.userData || {};
  const props = data.browserRvmProperties || {};
  return {
    uuid: object?.uuid || '',
    objectName: object?.name || '',
    rvmSource: data.rvmSource === true || Boolean(data.browserRvmProperties || data.browserRvmAttributes),
    renderKind: data.renderKind || data.effectivePrimitive || data.effectiveRenderPrimitive || data.renderPrimitive || data.parentBrowserRvmRenderPrimitive || '',
    primitiveCode: data.primitiveCode || data.browserRvmNativePrimitiveCode || data.browserRvmAttributes?.RVM_PRIMITIVE_CODE || '',
    effectivePrimitive: data.effectivePrimitive || data.effectiveRenderPrimitive || data.renderPrimitive || '',
    originalPrimitive: data.originalPrimitive || data.renderPrimitive || data.parentBrowserRvmRenderPrimitive || '',
    reviewName: data.reviewName || data.displayName || data.sourceName || object?.name || '',
    sourcePath: data.sourcePath || props.sourcePath || props.SourcePath || '',
    canonicalId: data.canonicalId || data.name || props.canonicalId || object?.name || object?.uuid || '',
    pickable: data.pickable !== false,
    selectable: data.selectable !== false,
    fallbackReason: data.fallbackReason || data.browserRvmNativeFacetGroupRiskReason || '',
    materialPolicy: data.materialPolicy || data.browserRvmNativeFacetGroupDisplayPolicy || '',
    geometryPolicy: data.geometryPolicy || data.bboxPlaceholderPolicy || data.browserRvmNativeFacetGroupDisplayPolicy || '',
    nonSelectableReason: data.nonSelectableReason || '',
  };
}

function activeRvmRoot() {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  return viewer?.modelGroup || viewer?.scene || null;
}

function bump(target, key) {
  const name = String(key || '').trim() || 'unknown';
  target[name] = (target[name] || 0) + 1;
}

installBrowserRvmPickDiagnosticsBridge();
