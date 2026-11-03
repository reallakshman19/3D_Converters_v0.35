import * as THREE from 'three';

export const BROWSER_RVM_NATIVE_TESSELLATION_SCHEMA = 'browser-rvm-native-tessellation/v2-diagnostics-toggle';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-native-tessellation-runtime-patch-v2');
const UPGRADE_FLAG = Symbol.for('pcf-glb-rvm-native-tessellated-object-v1');
const DEFAULT_SEGMENTS = 24;
const MAX_UPGRADE_OBJECTS = 8000;
const STORAGE_KEY = 'pcf-glb-rvm-native-tessellation-enabled';
const GLOBAL_STATE_KEY = '__PCF_GLB_RVM_NATIVE_TESSELLATION__';
const GLOBAL_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_NATIVE_TESSELLATION_DIAGNOSTICS__';

export function installBrowserRvmNativeTessellationRuntimePatch() {
  if (globalThis[PATCH_FLAG]) return globalThis[PATCH_FLAG];
  const state = {
    installed: true,
    schemaVersion: BROWSER_RVM_NATIVE_TESSELLATION_SCHEMA,
    installedAt: new Date().toISOString(),
    enabled: readEnabled(),
    upgrades: 0,
    runs: 0,
    lastDiagnostics: null,
    setEnabled(enabled) {
      state.enabled = Boolean(enabled);
      writeEnabled(state.enabled);
      const diagnostics = publishNativeTessellationDiagnostics({
        schemaVersion: BROWSER_RVM_NATIVE_TESSELLATION_SCHEMA,
        enabled: state.enabled,
        disabled: !state.enabled,
        reason: state.enabled ? 'enabled' : 'disabled-by-user',
        scannedCount: 0,
        candidateCount: 0,
        upgradedCount: 0,
        skippedCount: 0,
        kindCounts: {},
        upgradedKindCounts: {},
        skippedReasons: {},
      });
      state.lastDiagnostics = diagnostics;
      if (state.enabled) schedule();
      return state.enabled;
    },
    runNow() {
      return runAndPublish();
    },
    getDiagnostics() {
      return state.lastDiagnostics || globalThis[GLOBAL_DIAGNOSTICS_KEY] || null;
    },
  };
  globalThis[PATCH_FLAG] = state;
  globalThis[GLOBAL_STATE_KEY] = state;

  const schedule = () => requestAnimationFrameSafe(runAndPublish);
  state.schedule = schedule;

  function runAndPublish() {
    const diagnostics = upgradeActiveRvmViewerNativeTessellation({ enabled: state.enabled });
    if (diagnostics?.upgradedCount) state.upgrades += diagnostics.upgradedCount;
    if (diagnostics) {
      state.runs += 1;
      state.lastDiagnostics = diagnostics;
      publishNativeTessellationDiagnostics(diagnostics);
    }
    return diagnostics;
  }

  try { globalThis.addEventListener?.('rvm-browser-parse-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-native-tessellation-request', schedule); } catch (_) {}
  for (const delay of [400, 1200, 2600, 5000]) setTimeout(schedule, delay);
  return state;
}

export function publishNativeTessellationDiagnostics(diagnostics = {}) {
  const payload = {
    schemaVersion: BROWSER_RVM_NATIVE_TESSELLATION_SCHEMA,
    capturedAt: new Date().toISOString(),
    ...(diagnostics || {}),
  };
  globalThis[GLOBAL_DIAGNOSTICS_KEY] = payload;
  try {
    globalThis.dispatchEvent?.(new CustomEvent('rvm-native-tessellation-diagnostics', { detail: payload }));
  } catch (_) {}
  return payload;
}

export function setBrowserRvmNativeTessellationEnabled(enabled) {
  const state = installBrowserRvmNativeTessellationRuntimePatch();
  return state.setEnabled(enabled);
}

export function upgradeActiveRvmViewerNativeTessellation(options = {}) {
  const enabled = options.enabled ?? globalThis[GLOBAL_STATE_KEY]?.enabled ?? readEnabled();
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!viewer?.modelGroup) {
    return makeEmptyDiagnostics({ enabled, reason: 'viewer-not-ready' });
  }
  if (!enabled) {
    const diagnostics = makeEmptyDiagnostics({ enabled: false, reason: 'disabled-by-user' });
    annotateViewer(viewer, diagnostics);
    return diagnostics;
  }
  const diagnostics = upgradeNativeRvmTessellation(viewer.modelGroup, { enabled: true });
  annotateViewer(viewer, diagnostics);
  if (diagnostics.upgradedCount > 0) {
    try { viewer.fitProgressiveBounds?.(viewer._progressiveModelBounds || viewer.modelGroup?.children?.[0]?.userData?.bounds || null, { force: true }); } catch (_) {}
  }
  return diagnostics;
}

export function upgradeNativeRvmTessellation(root, options = {}) {
  const diagnostics = {
    schemaVersion: BROWSER_RVM_NATIVE_TESSELLATION_SCHEMA,
    enabled: options.enabled !== false,
    disabled: options.enabled === false,
    scannedCount: 0,
    candidateCount: 0,
    upgradedCount: 0,
    alreadyNativeCount: 0,
    skippedCount: 0,
    kindCounts: {},
    upgradedKindCounts: {},
    skippedReasons: {},
  };
  if (!root?.traverse) return diagnostics;

  const replacements = [];
  root.traverse((object) => {
    if (!object || replacements.length >= MAX_UPGRADE_OBJECTS) return;
    if (object === root || !object.parent) return;
    diagnostics.scannedCount += 1;
    if (object[UPGRADE_FLAG] || object.userData?.browserRvmNativeTessellated) {
      diagnostics.alreadyNativeCount += 1;
      return;
    }
    const attrs = object.userData?.browserRvmAttributes || null;
    const params = parseNativeParams(attrs?.RVM_NATIVE_PRIMITIVE_PARAMS);
    const matrix = parseNumericArray(attrs?.RVM_TRANSFORM_3X4, 12);
    const code = Number(params?.kind || attrs?.RVM_PRIMITIVE_CODE);
    if (!params?.decoded || !matrix || !Number.isFinite(code)) return;
    diagnostics.candidateCount += 1;
    bump(diagnostics.kindCounts, params.kindName || `Kind-${code}`);
    const native = buildNativeObjectFromParams(code, params, matrix, materialForSource(object));
    if (!native) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, `unsupported-kind-${code}`);
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
    bump(diagnostics.upgradedKindCounts, item.params.kindName || `Kind-${item.code}`);
  }
  return diagnostics;
}

function makeEmptyDiagnostics(extra = {}) {
  return {
    schemaVersion: BROWSER_RVM_NATIVE_TESSELLATION_SCHEMA,
    enabled: extra.enabled !== false,
    disabled: extra.enabled === false,
    reason: extra.reason || '',
    scannedCount: 0,
    candidateCount: 0,
    upgradedCount: 0,
    alreadyNativeCount: 0,
    skippedCount: 0,
    kindCounts: {},
    upgradedKindCounts: {},
    skippedReasons: {},
  };
}

function buildNativeObjectFromParams(code, params, matrix3x4, material) {
  let geometry = null;
  let primitive = '';
  if (code === 8) {
    geometry = cylinderGeometry(params.radius, params.height, segmentCount(params.radius));
    primitive = 'RVM_NATIVE_CYLINDER';
  } else if (code === 2) {
    geometry = boxGeometry(params.lengthX, params.lengthY, params.lengthZ);
    primitive = 'RVM_NATIVE_BOX';
  } else if (code === 9) {
    geometry = sphereGeometry(params.diameter);
    primitive = 'RVM_NATIVE_SPHERE';
  } else if (code === 7) {
    geometry = snoutGeometry(params, segmentCount(Math.max(params.radiusBottom, params.radiusTop)));
    primitive = 'RVM_NATIVE_SNOUT';
  } else if (code === 4) {
    geometry = circularTorusGeometry(params, segmentCount(Math.max(params.offset + params.radius, params.radius)), segmentCount(params.radius));
    primitive = 'RVM_NATIVE_CIRCULAR_TORUS';
  } else if (code === 3) {
    geometry = rectangularTorusGeometry(params, segmentCount(params.outerRadius), 4);
    primitive = 'RVM_NATIVE_RECTANGULAR_TORUS';
  }
  if (!geometry) return null;
  geometry.applyMatrix4(matrix4FromCppMat3x4(matrix3x4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = primitive;
  mesh.userData = {
    schemaVersion: BROWSER_RVM_NATIVE_TESSELLATION_SCHEMA,
    browserRvmNativeTessellated: true,
    effectiveRenderPrimitive: primitive,
    renderQuality: 'native-cpp-tessellated',
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
    browserRvmNativeTessellated: true,
    browserRvmNativeTessellationSchema: BROWSER_RVM_NATIVE_TESSELLATION_SCHEMA,
    browserRvmNativePrimitiveKind: params.kindName || `Kind-${code}`,
    browserRvmNativePrimitiveCode: String(code),
    previousEffectiveRenderPrimitive: source.userData?.effectiveRenderPrimitive || '',
    previousRenderQuality: source.userData?.renderQuality || '',
    effectiveRenderPrimitive: native.userData.effectiveRenderPrimitive,
    renderQuality: 'native-cpp-tessellated',
    pickable: true,
  };
  native.matrixAutoUpdate = true;
  const index = parent.children.indexOf(source);
  if (index >= 0) parent.children[index] = native;
  native.parent = parent;
  source.parent = null;
  disposeObject(source);
}

function cylinderGeometry(radius, height, segments) {
  const r = positive(radius, 0.001);
  const h = positive(Math.abs(height), r * 2);
  const geometry = new THREE.CylinderGeometry(r, r, h, segments, 1, false);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function boxGeometry(x, y, z) {
  return new THREE.BoxGeometry(positive(Math.abs(x), 0.001), positive(Math.abs(y), 0.001), positive(Math.abs(z), 0.001));
}

function sphereGeometry(diameter) {
  return new THREE.SphereGeometry(positive(Math.abs(diameter) * 0.5, 0.001), DEFAULT_SEGMENTS, Math.max(12, Math.floor(DEFAULT_SEGMENTS / 2)));
}

function circularTorusGeometry(params, majorSegments, tubeSegments) {
  const offset = positive(Math.abs(params.offset), 0.001);
  const radius = positive(Math.abs(params.radius), 0.001);
  const angle = finite(params.angle, Math.PI * 2);
  const samplesU = Math.max(2, Math.min(96, Math.ceil(majorSegments * Math.max(Math.abs(angle), 0.05) / (Math.PI * 2)) + 1));
  const samplesV = Math.max(8, Math.min(48, tubeSegments));
  const positions = [];
  const indices = [];
  for (let u = 0; u < samplesU; u += 1) {
    const t = samplesU === 1 ? 0 : (angle * u) / (samplesU - 1);
    const ct = Math.cos(t), st = Math.sin(t);
    for (let v = 0; v < samplesV; v += 1) {
      const p = (Math.PI * 2 * v) / samplesV;
      const cp = Math.cos(p), sp = Math.sin(p);
      positions.push((radius * cp + offset) * ct, (radius * cp + offset) * st, radius * sp);
    }
  }
  for (let u = 0; u + 1 < samplesU; u += 1) {
    for (let v = 0; v < samplesV; v += 1) {
      const vv = (v + 1) % samplesV;
      quad(indices, u * samplesV + v, (u + 1) * samplesV + v, (u + 1) * samplesV + vv, u * samplesV + vv);
    }
  }
  return bufferGeometry(positions, indices);
}

function rectangularTorusGeometry(params, majorSegments) {
  const inner = positive(Math.abs(params.innerRadius), 0.001);
  const outer = Math.max(positive(Math.abs(params.outerRadius), inner * 1.1), inner + 0.001);
  const h = positive(Math.abs(params.height), 0.001);
  const angle = finite(params.angle, Math.PI * 2);
  const samplesU = Math.max(2, Math.min(96, Math.ceil(majorSegments * Math.max(Math.abs(angle), 0.05) / (Math.PI * 2)) + 1));
  const positions = [];
  const indices = [];
  const section = [[outer, -h / 2], [inner, -h / 2], [inner, h / 2], [outer, h / 2]];
  for (let u = 0; u < samplesU; u += 1) {
    const t = samplesU === 1 ? 0 : (angle * u) / (samplesU - 1);
    const ct = Math.cos(t), st = Math.sin(t);
    for (const [r, z] of section) positions.push(r * ct, r * st, z);
  }
  for (let u = 0; u + 1 < samplesU; u += 1) {
    for (let k = 0; k < 4; k += 1) {
      const kk = (k + 1) % 4;
      quad(indices, u * 4 + k, (u + 1) * 4 + k, (u + 1) * 4 + kk, u * 4 + kk);
    }
  }
  return bufferGeometry(positions, indices);
}

function snoutGeometry(params, segments) {
  const rb = positive(Math.abs(params.radiusBottom), 0.001);
  const rt = positive(Math.abs(params.radiusTop), 0.001);
  const h = positive(Math.abs(params.height), Math.max(rb, rt) * 2);
  const h2 = h * 0.5;
  const ox = 0.5 * finite(params.offsetX, 0);
  const oy = 0.5 * finite(params.offsetY, 0);
  const mbx = Math.tan(finite(params.bottomShearX, 0));
  const mby = Math.tan(finite(params.bottomShearY, 0));
  const mtx = Math.tan(finite(params.topShearX, 0));
  const mty = Math.tan(finite(params.topShearY, 0));
  const samples = Math.max(8, Math.min(64, segments));
  const positions = [];
  const indices = [];
  const bottomStart = 0;
  const topStart = samples;
  for (let i = 0; i < samples; i += 1) {
    const t = (Math.PI * 2 * i) / samples;
    const c = Math.cos(t), s = Math.sin(t);
    const xb = rb * c - ox;
    const yb = rb * s - oy;
    const zb = -h2 + mbx * rb * c + mby * rb * s;
    const xt = rt * c + ox;
    const yt = rt * s + oy;
    const zt = h2 + mtx * rt * c + mty * rt * s;
    positions.push(xb, yb, zb, xt, yt, zt);
  }
  for (let i = 0; i < samples; i += 1) {
    const ii = (i + 1) % samples;
    quad(indices, bottomStart + i * 2, bottomStart + ii * 2, bottomStart + ii * 2 + 1, bottomStart + i * 2 + 1);
  }
  const bottomRing = [];
  const topRing = [];
  for (let i = 0; i < samples; i += 1) {
    bottomRing.push(i * 2);
    topRing.push(i * 2 + 1);
  }
  fanCap(indices, bottomRing.slice().reverse());
  fanCap(indices, topRing);
  return bufferGeometry(positions, indices);
}

function bufferGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function quad(indices, a, b, c, d) {
  indices.push(a, b, c, c, d, a);
}

function fanCap(indices, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return;
  for (let i = 1; i + 1 < ring.length; i += 1) indices.push(ring[0], ring[i], ring[i + 1]);
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
  return material || new THREE.MeshStandardMaterial({ color: 0x3d74c5, roughness: 0.68, metalness: 0.12 });
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

function readEnabled() {
  try {
    const saved = globalThis.localStorage?.getItem?.(STORAGE_KEY);
    return saved !== 'false';
  } catch (_) {
    return true;
  }
}
function writeEnabled(enabled) {
  try { globalThis.localStorage?.setItem?.(STORAGE_KEY, enabled ? 'true' : 'false'); } catch (_) {}
}
function segmentCount(radius) {
  const r = positive(Math.abs(radius), 1);
  return Math.max(12, Math.min(48, Math.ceil(Math.sqrt(r) * 8)));
}
function annotateViewer(viewer, diagnostics) {
  const root = viewer?.modelGroup?.children?.[0] || viewer?.modelGroup || null;
  if (!root) return;
  root.userData = {
    ...(root.userData || {}),
    browserRvmNativeTessellation: diagnostics,
  };
  if (root.userData.browserRvmRender) {
    root.userData.browserRvmRender = {
      ...root.userData.browserRvmRender,
      nativeTessellation: diagnostics,
      nativeTessellatedCount: diagnostics.upgradedCount,
      nativeTessellationEnabled: diagnostics.enabled,
    };
  }
}

function disposeObject(root) {
  root?.traverse?.((obj) => {
    if (obj.geometry?.dispose) obj.geometry.dispose();
  });
}
function bump(target, key) { const name = String(key || '').trim() || 'UNKNOWN'; target[name] = (target[name] || 0) + 1; }
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function requestAnimationFrameSafe(fn) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn); else setTimeout(fn, 0); }
