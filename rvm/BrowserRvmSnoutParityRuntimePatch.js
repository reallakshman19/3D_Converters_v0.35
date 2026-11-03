import * as THREE from 'three';

export const BROWSER_RVM_SNOUT_PARITY_SCHEMA = 'browser-rvm-snout-parity/v1-cpp-capped-snout';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-snout-parity-runtime-patch-v1');
const UPGRADE_FLAG = Symbol.for('pcf-glb-rvm-snout-parity-upgraded-v1');
const GLOBAL_STATE_KEY = '__PCF_GLB_RVM_SNOUT_PARITY__';
const GLOBAL_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_SNOUT_PARITY_DIAGNOSTICS__';
const MAX_OBJECTS = 8000;
const MAX_SEGMENTS = 64;
const MIN_SEGMENTS = 12;
const TWO_PI = Math.PI * 2;

export function installBrowserRvmSnoutParityRuntimePatch() {
  if (globalThis[PATCH_FLAG]) return globalThis[PATCH_FLAG];
  const state = {
    installed: true,
    schemaVersion: BROWSER_RVM_SNOUT_PARITY_SCHEMA,
    installedAt: new Date().toISOString(),
    runs: 0,
    upgrades: 0,
    lastDiagnostics: null,
    runNow() { return runAndPublish(); },
    getDiagnostics() { return state.lastDiagnostics || globalThis[GLOBAL_DIAGNOSTICS_KEY] || null; },
  };
  globalThis[PATCH_FLAG] = state;
  globalThis[GLOBAL_STATE_KEY] = state;

  const schedule = () => requestAnimationFrameSafe(runAndPublish);
  state.schedule = schedule;

  function runAndPublish() {
    const diagnostics = upgradeActiveRvmSnoutParity();
    if (diagnostics) {
      state.runs += 1;
      state.upgrades += diagnostics.upgradedCount || 0;
      state.lastDiagnostics = diagnostics;
      publishDiagnostics(diagnostics);
    }
    return diagnostics;
  }

  try { globalThis.addEventListener?.('rvm-browser-parse-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-native-tessellation-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-torus-parity-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-material-mode-diagnostics', schedule); } catch (_) {}
  for (const delay of [1000, 2400, 4600, 7600]) setTimeout(schedule, delay);
  return state;
}

export function upgradeActiveRvmSnoutParity() {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!viewer?.modelGroup) return makeDiagnostics({ reason: 'viewer-not-ready' });
  const diagnostics = upgradeRvmSnoutParity(viewer.modelGroup);
  annotateViewer(viewer, diagnostics);
  return diagnostics;
}

export function upgradeRvmSnoutParity(root) {
  const diagnostics = makeDiagnostics({ reason: '' });
  if (!root?.traverse) return diagnostics;
  const replacements = [];
  root.traverse((object) => {
    if (!object || replacements.length >= MAX_OBJECTS) return;
    if (object === root || !object.parent || !object.isMesh) return;
    diagnostics.scannedCount += 1;
    if (object[UPGRADE_FLAG] || object.userData?.browserRvmSnoutParityUpgraded) {
      diagnostics.alreadyUpgradedCount += 1;
      return;
    }
    const attrs = object.userData?.browserRvmAttributes || object.userData?.attributes || object.userData?.browserRvmProperties?.attributes || null;
    const params = parseNativeParams(attrs?.RVM_NATIVE_PRIMITIVE_PARAMS);
    const matrix = parseNumericArray(attrs?.RVM_TRANSFORM_3X4, 12);
    const code = Number(params?.kind || attrs?.RVM_PRIMITIVE_CODE);
    if (!params?.decoded || !matrix || code !== 7) return;
    diagnostics.candidateCount += 1;
    bump(diagnostics.kindCounts, params.kindName || 'Snout');
    const geometry = snoutGeometry(params, diagnostics);
    if (!geometry) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, 'invalid-snout-params');
      return;
    }
    const native = meshFromGeometry('RVM_NATIVE_SNOUT_CAPPED', geometry, matrix, materialForSource(object));
    replacements.push({ source: object, native, params, code });
  });

  for (const item of replacements) {
    replaceObject(item.source, item.native, item.params, item.code);
    diagnostics.upgradedCount += 1;
    diagnostics.snoutTessellatedCount += 1;
    bump(diagnostics.upgradedKindCounts, item.params.kindName || 'Snout');
  }
  if (replacements.length >= MAX_OBJECTS) {
    diagnostics.skippedCount += 1;
    bump(diagnostics.skippedReasons, 'snout-upgrade-object-limit');
  }
  return diagnostics;
}

function snoutGeometry(params, diagnostics) {
  const radiusBottom = positive(Math.abs(params.radiusBottom), 0.001);
  const radiusTop = positive(Math.abs(params.radiusTop), 0.001);
  const height = positive(Math.abs(params.height), Math.max(radiusBottom, radiusTop) * 2);
  const h2 = height * 0.5;
  const ox = 0.5 * finite(params.offsetX, 0);
  const oy = 0.5 * finite(params.offsetY, 0);
  const bottomShearX = finite(params.bottomShearX, 0);
  const bottomShearY = finite(params.bottomShearY, 0);
  const topShearX = finite(params.topShearX, 0);
  const topShearY = finite(params.topShearY, 0);
  const mbx = Math.tan(bottomShearX);
  const mby = Math.tan(bottomShearY);
  const mtx = Math.tan(topShearX);
  const mty = Math.tan(topShearY);
  const samples = Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, segmentCount(Math.max(radiusBottom, radiusTop))));
  const positions = [];
  const normals = [];
  const indices = [];
  const trig = [];

  for (let i = 0; i < samples; i += 1) {
    const a = (TWO_PI / samples) * i;
    trig.push([Math.cos(a), Math.sin(a)]);
  }

  for (let i = 0; i < samples; i += 1) {
    const [c, s] = trig[i];
    const xb = radiusBottom * c - ox;
    const yb = radiusBottom * s - oy;
    const zb = -h2 + mbx * radiusBottom * c + mby * radiusBottom * s;
    const xt = radiusTop * c + ox;
    const yt = radiusTop * s + oy;
    const zt = h2 + mtx * radiusTop * c + mty * radiusTop * s;
    const projectedOffset = finite(params.offsetX, 0) * c + finite(params.offsetY, 0) * s;
    const nz = -(radiusTop - radiusBottom + projectedOffset) / height;
    const shellNormal = normalized(c, s, nz);
    positions.push(xb, yb, zb, xt, yt, zt);
    normals.push(shellNormal.x, shellNormal.y, shellNormal.z, shellNormal.x, shellNormal.y, shellNormal.z);
  }

  for (let i = 0; i < samples; i += 1) {
    const ii = (i + 1) % samples;
    indices.push(2 * i, 2 * ii, 2 * ii + 1);
    indices.push(2 * ii + 1, 2 * i + 1, 2 * i);
    diagnostics.snoutShellTriangleCount += 2;
  }

  const bottomStart = positions.length / 3;
  const bottomNormal = normalized(
    Math.sin(bottomShearX) * Math.cos(bottomShearY),
    Math.sin(bottomShearY),
    -Math.cos(bottomShearX) * Math.cos(bottomShearY),
  );
  for (let i = 0; i < samples; i += 1) {
    const [c, s] = trig[i];
    positions.push(radiusBottom * c - ox, radiusBottom * s - oy, -h2 + mbx * radiusBottom * c + mby * radiusBottom * s);
    normals.push(bottomNormal.x, bottomNormal.y, bottomNormal.z);
  }
  const bottomRing = [];
  for (let i = samples - 1; i >= 0; i -= 1) bottomRing.push(bottomStart + i);
  diagnostics.snoutCapTriangleCount += fanCap(indices, bottomRing);

  const topStart = positions.length / 3;
  const topNormal = normalized(
    -Math.sin(topShearX) * Math.cos(topShearY),
    -Math.sin(topShearY),
    Math.cos(topShearX) * Math.cos(topShearY),
  );
  for (let i = 0; i < samples; i += 1) {
    const [c, s] = trig[i];
    positions.push(radiusTop * c + ox, radiusTop * s + oy, h2 + mtx * radiusTop * c + mty * radiusTop * s);
    normals.push(topNormal.x, topNormal.y, topNormal.z);
  }
  const topRing = [];
  for (let i = 0; i < samples; i += 1) topRing.push(topStart + i);
  diagnostics.snoutCapTriangleCount += fanCap(indices, topRing);
  diagnostics.snoutCappedEndCount += 2;
  diagnostics.snoutSegmentSamples += samples;
  return bufferGeometry(positions, indices, normals);
}

function meshFromGeometry(name, geometry, matrix3x4, material) {
  geometry.applyMatrix4(matrix4FromCppMat3x4(matrix3x4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData = {
    schemaVersion: BROWSER_RVM_SNOUT_PARITY_SCHEMA,
    browserRvmSnoutParityUpgraded: true,
    browserRvmSnoutParitySchema: BROWSER_RVM_SNOUT_PARITY_SCHEMA,
    effectiveRenderPrimitive: name,
    renderQuality: 'native-cpp-capped-snout',
  };
  mesh[UPGRADE_FLAG] = true;
  return mesh;
}

function replaceObject(source, native, params, code) {
  const parent = source.parent;
  if (!parent) return;
  native.name = source.name || native.name;
  native.userData = {
    ...(source.userData || {}),
    ...(native.userData || {}),
    browserRvmSnoutParityUpgraded: true,
    browserRvmSnoutParityKind: params.kindName || `Kind-${code}`,
    browserRvmSnoutParityCode: String(code),
    previousEffectiveRenderPrimitive: source.userData?.effectiveRenderPrimitive || '',
    previousRenderQuality: source.userData?.renderQuality || '',
    effectiveRenderPrimitive: native.userData.effectiveRenderPrimitive,
    renderQuality: native.userData.renderQuality,
    pickable: true,
  };
  const index = parent.children.indexOf(source);
  if (index >= 0) parent.children[index] = native;
  native.parent = parent;
  source.parent = null;
  disposeObject(source);
}

function makeDiagnostics(extra = {}) {
  return {
    schemaVersion: BROWSER_RVM_SNOUT_PARITY_SCHEMA,
    capturedAt: new Date().toISOString(),
    reason: extra.reason || '',
    scannedCount: 0,
    candidateCount: 0,
    upgradedCount: 0,
    alreadyUpgradedCount: 0,
    skippedCount: 0,
    snoutTessellatedCount: 0,
    snoutCappedEndCount: 0,
    snoutShellTriangleCount: 0,
    snoutCapTriangleCount: 0,
    snoutSegmentSamples: 0,
    kindCounts: {},
    upgradedKindCounts: {},
    skippedReasons: {},
  };
}

function publishDiagnostics(diagnostics = {}) {
  const payload = { schemaVersion: BROWSER_RVM_SNOUT_PARITY_SCHEMA, capturedAt: new Date().toISOString(), ...(diagnostics || {}) };
  globalThis[GLOBAL_DIAGNOSTICS_KEY] = payload;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-snout-parity-diagnostics', { detail: payload })); } catch (_) {}
  return payload;
}

function annotateViewer(viewer, diagnostics) {
  const root = viewer?.modelGroup?.children?.[0] || viewer?.modelGroup || null;
  if (!root) return;
  root.userData = { ...(root.userData || {}), browserRvmSnoutParity: diagnostics };
  if (root.userData.browserRvmRender) {
    root.userData.browserRvmRender = { ...(root.userData.browserRvmRender || {}), snoutParity: diagnostics };
  }
}

function bufferGeometry(positions, indices, normals) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

function fanCap(indices, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const before = indices.length / 3;
  for (let i = 1; i + 1 < ring.length; i += 1) indices.push(ring[0], ring[i], ring[i + 1]);
  return (indices.length / 3) - before;
}

function matrix4FromCppMat3x4(m) {
  return new THREE.Matrix4().set(
    m[0], m[3], m[6], m[9],
    m[1], m[4], m[7], m[10],
    m[2], m[5], m[8], m[11],
    0, 0, 0, 1
  );
}

function materialForSource(object) {
  let material = null;
  object?.traverse?.((child) => {
    if (!material && child?.isMesh && child.material) material = Array.isArray(child.material) ? child.material[0] : child.material;
  });
  if (!material && object?.material) material = Array.isArray(object.material) ? object.material[0] : object.material;
  return material || new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.72, metalness: 0.08 });
}

function parseNativeParams(value) {
  if (!value) return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function parseNumericArray(value, expected) {
  let arr = null;
  try { arr = JSON.parse(String(value || '')); } catch (_) { arr = String(value || '').split(/[\s,]+/g).map(Number).filter(Number.isFinite); }
  if (!Array.isArray(arr) || arr.length < expected) return null;
  const out = arr.slice(0, expected).map(Number);
  return out.every(Number.isFinite) ? out : null;
}

function segmentCount(radius) {
  const r = positive(Math.abs(radius), 1);
  return Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, Math.ceil(Math.sqrt(r) * 8)));
}

function normalized(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function disposeObject(root) {
  root?.traverse?.((obj) => { if (obj.geometry?.dispose) obj.geometry.dispose(); });
}
function bump(target, key) { const name = String(key || '').trim() || 'UNKNOWN'; target[name] = (target[name] || 0) + 1; }
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function requestAnimationFrameSafe(fn) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn); else setTimeout(fn, 0); }
