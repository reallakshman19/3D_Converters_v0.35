import * as THREE from 'three';

export const BROWSER_RVM_DISH_TESSELLATION_SCHEMA = 'browser-rvm-dish-tessellation/v1-cpp-mat3x4';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-dish-tessellation-runtime-patch-v1');
const UPGRADE_FLAG = Symbol.for('pcf-glb-rvm-dish-tessellated-object-v1');
const GLOBAL_STATE_KEY = '__PCF_GLB_RVM_DISH_TESSELLATION__';
const GLOBAL_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_DISH_TESSELLATION_DIAGNOSTICS__';
const MAX_UPGRADE_OBJECTS = 4000;
const DEFAULT_SEGMENTS = 32;

export function installBrowserRvmDishTessellationRuntimePatch() {
  if (globalThis[PATCH_FLAG]) return globalThis[PATCH_FLAG];
  const state = {
    installed: true,
    schemaVersion: BROWSER_RVM_DISH_TESSELLATION_SCHEMA,
    runs: 0,
    upgrades: 0,
    lastDiagnostics: null,
    runNow() { return runAndPublish(); },
    getDiagnostics() { return state.lastDiagnostics || globalThis[GLOBAL_DIAGNOSTICS_KEY] || null; },
  };
  globalThis[PATCH_FLAG] = state;
  globalThis[GLOBAL_STATE_KEY] = state;

  function runAndPublish() {
    const viewer = globalThis.__3D_RVM_VIEWER__;
    const diagnostics = upgradeActiveRvmDishes(viewer);
    state.runs += 1;
    if (diagnostics?.upgradedCount) state.upgrades += diagnostics.upgradedCount;
    state.lastDiagnostics = publishDishDiagnostics(diagnostics);
    return state.lastDiagnostics;
  }

  const schedule = () => requestAnimationFrameSafe(runAndPublish);
  try { globalThis.addEventListener?.('rvm-browser-parse-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-native-tessellation-diagnostics', schedule); } catch (_) {}
  for (const delay of [700, 1800, 3600, 6200]) setTimeout(schedule, delay);
  return state;
}

export function publishDishDiagnostics(diagnostics = {}) {
  const payload = {
    schemaVersion: BROWSER_RVM_DISH_TESSELLATION_SCHEMA,
    capturedAt: new Date().toISOString(),
    ...(diagnostics || {}),
  };
  globalThis[GLOBAL_DIAGNOSTICS_KEY] = payload;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-dish-tessellation-diagnostics', { detail: payload })); } catch (_) {}
  return payload;
}

export function upgradeActiveRvmDishes(viewer = globalThis.__3D_RVM_VIEWER__) {
  const diagnostics = {
    schemaVersion: BROWSER_RVM_DISH_TESSELLATION_SCHEMA,
    scannedCount: 0,
    candidateCount: 0,
    upgradedCount: 0,
    alreadyUpgradedCount: 0,
    skippedCount: 0,
    dishKindCounts: {},
    skippedReasons: {},
  };
  const root = viewer?.modelGroup;
  if (!root?.traverse) {
    bump(diagnostics.skippedReasons, 'viewer-not-ready');
    return diagnostics;
  }

  const replacements = [];
  root.traverse((object) => {
    if (!object || replacements.length >= MAX_UPGRADE_OBJECTS) return;
    if (object === root || !object.parent || !object.isMesh) return;
    diagnostics.scannedCount += 1;
    if (object[UPGRADE_FLAG] || object.userData?.browserRvmDishTessellated) {
      diagnostics.alreadyUpgradedCount += 1;
      return;
    }
    const attrs = object.userData?.browserRvmAttributes || object.userData?.attributes || object.userData?.browserRvmProperties?.attributes || null;
    const params = parseNativeParams(attrs?.RVM_NATIVE_PRIMITIVE_PARAMS);
    const matrix = parseNumericArray(attrs?.RVM_TRANSFORM_3X4, 12);
    const code = Number(params?.kind || attrs?.RVM_PRIMITIVE_CODE);
    if (code !== 5 && code !== 6) return;
    diagnostics.candidateCount += 1;
    bump(diagnostics.dishKindCounts, params?.kindName || `Kind-${code}`);
    if (!params?.decoded) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, 'params-not-decoded');
      return;
    }
    if (!matrix) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, 'missing-mat3x4');
      return;
    }
    const native = buildDishObjectFromParams(code, params, matrix, materialForSource(object));
    if (!native) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, `unsupported-dish-${code}`);
      return;
    }
    replacements.push({ source: object, native, params, code });
  });

  if (replacements.length >= MAX_UPGRADE_OBJECTS) {
    diagnostics.skippedCount += 1;
    bump(diagnostics.skippedReasons, 'upgrade-object-limit');
  }

  for (const item of replacements) {
    replaceObject(item.source, item.native, item.params, item.code);
    diagnostics.upgradedCount += 1;
  }
  annotateViewer(viewer, diagnostics);
  return diagnostics;
}

function buildDishObjectFromParams(code, params, matrix3x4, material) {
  const radius = positive(Math.abs(params.baseRadius || params.radius || params.diameter * 0.5), 0.001);
  const height = positive(Math.abs(params.height || params.radius || radius * 0.35), radius * 0.35);
  const geometry = code === 6
    ? sphericalDishGeometry(radius, height, segmentCount(radius), Math.max(5, Math.floor(segmentCount(radius) / 3)))
    : ellipticalDishGeometry(radius, height, segmentCount(radius), Math.max(5, Math.floor(segmentCount(radius) / 3)));
  if (!geometry) return null;
  geometry.applyMatrix4(matrix4FromCppMat3x4(matrix3x4));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = code === 6 ? 'RVM_NATIVE_SPHERICAL_DISH' : 'RVM_NATIVE_ELLIPTICAL_DISH';
  mesh.userData = {
    schemaVersion: BROWSER_RVM_DISH_TESSELLATION_SCHEMA,
    browserRvmDishTessellated: true,
    effectiveRenderPrimitive: mesh.name,
    renderQuality: 'native-cpp-dish-tessellated',
  };
  mesh[UPGRADE_FLAG] = true;
  return mesh;
}

function ellipticalDishGeometry(radius, height, radialSegments, heightSegments) {
  const r = positive(radius, 0.001);
  const h = positive(height, r * 0.2);
  const seg = Math.max(12, Math.min(96, radialSegments));
  const rings = Math.max(4, Math.min(24, heightSegments));
  const positions = [];
  const indices = [];
  for (let j = 0; j <= rings; j += 1) {
    const t = j / rings;
    const ringR = r * Math.sin(t * Math.PI * 0.5);
    const z = h * (1 - Math.cos(t * Math.PI * 0.5));
    for (let i = 0; i < seg; i += 1) {
      const a = (Math.PI * 2 * i) / seg;
      positions.push(ringR * Math.cos(a), ringR * Math.sin(a), z);
    }
  }
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < seg; i += 1) {
      const ii = (i + 1) % seg;
      const a = j * seg + i;
      const b = j * seg + ii;
      const c = (j + 1) * seg + ii;
      const d = (j + 1) * seg + i;
      if (j === 0) indices.push(a, c, d);
      else quad(indices, a, b, c, d);
    }
  }
  const rim = [];
  for (let i = 0; i < seg; i += 1) rim.push(rings * seg + i);
  fanCap(indices, rim.slice().reverse());
  return bufferGeometry(positions, indices);
}

function sphericalDishGeometry(radius, height, radialSegments, heightSegments) {
  const r = positive(radius, 0.001);
  const h = positive(height, r * 0.5);
  const sphereRadius = Math.max((r * r + h * h) / (2 * h), r);
  const thetaMax = Math.asin(Math.min(0.999, r / sphereRadius));
  const seg = Math.max(12, Math.min(96, radialSegments));
  const rings = Math.max(4, Math.min(24, heightSegments));
  const positions = [];
  const indices = [];
  for (let j = 0; j <= rings; j += 1) {
    const t = j / rings;
    const theta = t * thetaMax;
    const ringR = sphereRadius * Math.sin(theta);
    const z = sphereRadius * (1 - Math.cos(theta));
    for (let i = 0; i < seg; i += 1) {
      const a = (Math.PI * 2 * i) / seg;
      positions.push(ringR * Math.cos(a), ringR * Math.sin(a), z);
    }
  }
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < seg; i += 1) {
      const ii = (i + 1) % seg;
      const a = j * seg + i;
      const b = j * seg + ii;
      const c = (j + 1) * seg + ii;
      const d = (j + 1) * seg + i;
      if (j === 0) indices.push(a, c, d);
      else quad(indices, a, b, c, d);
    }
  }
  const rim = [];
  for (let i = 0; i < seg; i += 1) rim.push(rings * seg + i);
  fanCap(indices, rim.slice().reverse());
  return bufferGeometry(positions, indices);
}

function replaceObject(source, native, params, code) {
  const parent = source.parent;
  if (!parent) return;
  native.name = source.name || native.name;
  native.userData = {
    ...(source.userData || {}),
    ...(native.userData || {}),
    browserRvmDishTessellated: true,
    browserRvmDishTessellationSchema: BROWSER_RVM_DISH_TESSELLATION_SCHEMA,
    browserRvmNativePrimitiveKind: params.kindName || `Kind-${code}`,
    browserRvmNativePrimitiveCode: String(code),
    previousEffectiveRenderPrimitive: source.userData?.effectiveRenderPrimitive || '',
    previousRenderQuality: source.userData?.renderQuality || '',
    effectiveRenderPrimitive: native.userData.effectiveRenderPrimitive,
    renderQuality: 'native-cpp-dish-tessellated',
    pickable: true,
  };
  native.matrixAutoUpdate = true;
  const index = parent.children.indexOf(source);
  if (index >= 0) parent.children[index] = native;
  native.parent = parent;
  source.parent = null;
  disposeObject(source);
}

function bufferGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}
function quad(indices, a, b, c, d) { indices.push(a, b, c, c, d, a); }
function fanCap(indices, ring) { if (!Array.isArray(ring) || ring.length < 3) return; for (let i = 1; i + 1 < ring.length; i += 1) indices.push(ring[0], ring[i], ring[i + 1]); }
function matrix4FromCppMat3x4(m) { return new THREE.Matrix4().set(m[0], m[3], m[6], m[9], m[1], m[4], m[7], m[10], m[2], m[5], m[8], m[11], 0, 0, 0, 1); }
function materialForSource(object) { const material = Array.isArray(object?.material) ? object.material[0] : object?.material; return material || new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.72, metalness: 0.16 }); }
function parseNativeParams(value) { if (!value) return null; try { return JSON.parse(String(value)); } catch (_) { return null; } }
function parseNumericArray(value, expected) { let arr = null; try { arr = JSON.parse(String(value || '')); } catch (_) { arr = String(value || '').split(/[\s,]+/g).map(Number).filter(Number.isFinite); } if (!Array.isArray(arr) || arr.length < expected) return null; const out = arr.slice(0, expected).map(Number); return out.every(Number.isFinite) ? out : null; }
function segmentCount(radius) { const r = positive(Math.abs(radius), 1); return Math.max(16, Math.min(64, Math.ceil(Math.sqrt(r) * 10))); }
function annotateViewer(viewer, diagnostics) { const root = viewer?.modelGroup?.children?.[0] || viewer?.modelGroup || null; if (!root) return; root.userData = { ...(root.userData || {}), browserRvmDishTessellation: diagnostics }; }
function disposeObject(root) { root?.traverse?.((obj) => { obj.geometry?.dispose?.(); }); }
function bump(target, key) { const name = String(key || '').trim() || 'UNKNOWN'; target[name] = (target[name] || 0) + 1; }
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function requestAnimationFrameSafe(fn) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn); else setTimeout(fn, 0); }
