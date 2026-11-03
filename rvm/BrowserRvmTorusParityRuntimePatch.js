import * as THREE from 'three';

export const BROWSER_RVM_TORUS_PARITY_SCHEMA = 'browser-rvm-torus-parity/v2-line-placeholder-carriers';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-torus-parity-runtime-patch-v2-line-placeholder-carriers');
const UPGRADE_FLAG = Symbol.for('pcf-glb-rvm-torus-parity-upgraded-v1');
const GLOBAL_STATE_KEY = '__PCF_GLB_RVM_TORUS_PARITY__';
const GLOBAL_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_TORUS_PARITY_DIAGNOSTICS__';
const MAX_OBJECTS = 8000;
const MAX_SEGMENTS_U = 96;
const MAX_SEGMENTS_V = 48;

export function installBrowserRvmTorusParityRuntimePatch() {
  if (globalThis[PATCH_FLAG]) return globalThis[PATCH_FLAG];
  const state = {
    installed: true,
    schemaVersion: BROWSER_RVM_TORUS_PARITY_SCHEMA,
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
    const diagnostics = upgradeActiveRvmTorusParity();
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
  try { globalThis.addEventListener?.('rvm-remaining-primitives-diagnostics', schedule); } catch (_) {}
  for (const delay of [500, 900, 1800, 3200, 5200, 8000]) setTimeout(schedule, delay);
  return state;
}

export function upgradeActiveRvmTorusParity() {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!viewer?.modelGroup) return makeDiagnostics({ reason: 'viewer-not-ready' });
  const diagnostics = upgradeRvmTorusParity(viewer.modelGroup);
  annotateViewer(viewer, diagnostics);
  return diagnostics;
}

export function upgradeRvmTorusParity(root) {
  const diagnostics = makeDiagnostics({ reason: '' });
  if (!root?.traverse) return diagnostics;
  const replacements = [];
  root.traverse((object) => {
    if (!object || replacements.length >= MAX_OBJECTS) return;
    if (object === root || !object.parent || !isTorusCarrierObject(object)) return;
    diagnostics.scannedCount += 1;
    if (object[UPGRADE_FLAG] || object.userData?.browserRvmTorusParityUpgraded) {
      diagnostics.alreadyUpgradedCount += 1;
      return;
    }
    const attrs = attrsForObject(object);
    const params = parseNativeParams(attrs?.RVM_NATIVE_PRIMITIVE_PARAMS);
    const matrix = parseNumericArray(attrs?.RVM_TRANSFORM_3X4, 12);
    const code = Number(params?.kind || attrs?.RVM_PRIMITIVE_CODE);
    if (!params?.decoded || !matrix || (code !== 3 && code !== 4)) return;
    diagnostics.candidateCount += 1;
    bump(diagnostics.kindCounts, params.kindName || `Kind-${code}`);
    bump(diagnostics.carrierTypeCounts, carrierTypeFor(object));
    if (object.isLine || object.isLineSegments) diagnostics.linePlaceholderCandidateCount += 1;

    const material = materialForSource(object);
    const native = code === 4
      ? buildCircularTorusObject(params, matrix, material, diagnostics)
      : buildRectangularTorusObject(params, matrix, material, diagnostics);
    if (!native) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, `invalid-torus-kind-${code}`);
      return;
    }
    replacements.push({ source: object, native, params, code });
  });

  for (const item of replacements) {
    replaceObject(item.source, item.native, item.params, item.code);
    diagnostics.upgradedCount += 1;
    if (item.code === 4) diagnostics.circularTorusTessellatedCount += 1;
    if (item.code === 3) diagnostics.rectangularTorusTessellatedCount += 1;
    bump(diagnostics.upgradedKindCounts, item.params.kindName || `Kind-${item.code}`);
  }
  if (replacements.length >= MAX_OBJECTS) {
    diagnostics.skippedCount += 1;
    bump(diagnostics.skippedReasons, 'torus-upgrade-object-limit');
  }
  return diagnostics;
}

function isTorusCarrierObject(object) {
  if (!object || object.isGroup) return false;
  if (!(object.isMesh || object.isLine || object.isLineSegments || object.geometry)) return false;
  const attrs = attrsForObject(object);
  if (!attrs) return false;
  const code = Number(readNativeKind(attrs));
  return code === 3 || code === 4;
}

function attrsForObject(object) {
  const data = object?.userData || {};
  return data.browserRvmAttributes || data.attributes || data.browserRvmProperties?.attributes || data.rawAttributes || null;
}

function readNativeKind(attrs = {}) {
  const params = parseNativeParams(attrs.RVM_NATIVE_PRIMITIVE_PARAMS);
  return params?.kind || attrs.RVM_PRIMITIVE_CODE;
}

function carrierTypeFor(object) {
  if (object?.isMesh) return 'mesh';
  if (object?.isLineSegments) return 'line-segments';
  if (object?.isLine) return 'line';
  if (object?.geometry) return 'geometry-object';
  return 'unknown';
}

function buildCircularTorusObject(params, matrix3x4, material, diagnostics) {
  const geometry = circularTorusGeometry(params, diagnostics);
  if (!geometry) return null;
  return meshFromGeometry('RVM_NATIVE_CIRCULAR_TORUS_CAPPED', geometry, matrix3x4, material, 'native-cpp-capped-circular-torus');
}

function buildRectangularTorusObject(params, matrix3x4, material, diagnostics) {
  const geometry = rectangularTorusGeometry(params, diagnostics);
  if (!geometry) return null;
  return meshFromGeometry('RVM_NATIVE_RECTANGULAR_TORUS_CAPPED', geometry, matrix3x4, material, 'native-cpp-capped-rectangular-torus');
}

function circularTorusGeometry(params, diagnostics) {
  const offset = positive(Math.abs(params.offset), 0.001);
  const radius = positive(Math.abs(params.radius), 0.001);
  const angle = finite(params.angle, Math.PI * 2);
  const absAngle = Math.max(Math.abs(angle), 0.001);
  const samplesU = Math.max(2, Math.min(MAX_SEGMENTS_U, Math.ceil(segmentCount(offset + radius) * absAngle / (Math.PI * 2)) + 1));
  const samplesV = Math.max(8, Math.min(MAX_SEGMENTS_V, segmentCount(radius)));
  const positions = [];
  const normals = [];
  const indices = [];
  const trigU = [];
  const trigV = [];
  for (let u = 0; u < samplesU; u += 1) {
    const t = samplesU <= 1 ? 0 : (angle * u) / (samplesU - 1);
    trigU.push([Math.cos(t), Math.sin(t)]);
  }
  for (let v = 0; v < samplesV; v += 1) {
    const p = (Math.PI * 2 * v) / samplesV;
    trigV.push([Math.cos(p), Math.sin(p)]);
  }
  for (let u = 0; u < samplesU; u += 1) {
    const [ct, st] = trigU[u];
    for (let v = 0; v < samplesV; v += 1) {
      const [cp, sp] = trigV[v];
      positions.push((radius * cp + offset) * ct, (radius * cp + offset) * st, radius * sp);
      normals.push(cp * ct, cp * st, sp);
    }
  }
  for (let u = 0; u + 1 < samplesU; u += 1) {
    for (let v = 0; v < samplesV; v += 1) {
      const vv = (v + 1) % samplesV;
      indices.push(u * samplesV + v, (u + 1) * samplesV + v, (u + 1) * samplesV + vv);
      indices.push((u + 1) * samplesV + vv, u * samplesV + vv, u * samplesV + v);
      diagnostics.torusShellTriangleCount += 2;
    }
  }
  const cap0 = addCircularTorusCap(positions, normals, indices, trigU[0], trigV, offset, radius, true);
  const cap1 = addCircularTorusCap(positions, normals, indices, trigU[samplesU - 1], trigV, offset, radius, false);
  diagnostics.torusCapTriangleCount += cap0 + cap1;
  diagnostics.circularTorusSegmentSamples += samplesU * samplesV;
  diagnostics.torusCappedEndCount += 2;
  return bufferGeometry(positions, indices, normals);
}

function addCircularTorusCap(positions, normals, indices, uv, trigV, offset, radius, first) {
  const [ct, st] = uv;
  const start = positions.length / 3;
  for (const [cp, sp] of trigV) {
    positions.push((radius * cp + offset) * ct, (radius * cp + offset) * st, radius * sp);
    normals.push(first ? 0 : -st, first ? -1 : ct, 0);
  }
  const ring = [];
  for (let i = 0; i < trigV.length; i += 1) ring.push(start + (first ? i : trigV.length - 1 - i));
  const before = indices.length / 3;
  fanCap(indices, ring);
  return (indices.length / 3) - before;
}

function rectangularTorusGeometry(params, diagnostics) {
  const inner = positive(Math.abs(params.innerRadius), 0.001);
  const outer = Math.max(positive(Math.abs(params.outerRadius), inner * 1.1), inner + 0.001);
  const height = positive(Math.abs(params.height), 0.001);
  const angle = finite(params.angle, Math.PI * 2);
  const absAngle = Math.max(Math.abs(angle), 0.001);
  const samplesU = Math.max(2, Math.min(MAX_SEGMENTS_U, Math.ceil(segmentCount(outer) * absAngle / (Math.PI * 2)) + 1));
  const section = [[outer, -height / 2], [inner, -height / 2], [inner, height / 2], [outer, height / 2]];
  const positions = [];
  const normals = [];
  const indices = [];
  const trig = [];
  for (let u = 0; u < samplesU; u += 1) {
    const t = samplesU <= 1 ? 0 : (angle * u) / (samplesU - 1);
    const ct = Math.cos(t), st = Math.sin(t);
    trig.push([ct, st]);
    for (let k = 0; k < 4; k += 1) {
      const [r, z] = section[k];
      positions.push(r * ct, r * st, z);
      const normal = rectangularSectionNormal(k, ct, st);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  for (let u = 0; u + 1 < samplesU; u += 1) {
    for (let k = 0; k < 4; k += 1) {
      const kk = (k + 1) % 4;
      indices.push(u * 4 + k, u * 4 + kk, (u + 1) * 4 + k);
      indices.push((u + 1) * 4 + k, u * 4 + kk, (u + 1) * 4 + kk);
      diagnostics.torusShellTriangleCount += 2;
    }
  }
  const cap0 = addRectangularTorusCap(positions, normals, indices, trig[0], section, true);
  const cap1 = addRectangularTorusCap(positions, normals, indices, trig[samplesU - 1], section, false);
  diagnostics.torusCapTriangleCount += cap0 + cap1;
  diagnostics.rectangularTorusSegmentSamples += samplesU * 4;
  diagnostics.torusCappedEndCount += 2;
  return bufferGeometry(positions, indices, normals);
}

function rectangularSectionNormal(k, ct, st) {
  if (k === 0) return { x: ct, y: st, z: 0 };
  if (k === 1) return { x: -ct, y: -st, z: 0 };
  if (k === 2) return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 0, z: -1 };
}

function addRectangularTorusCap(positions, normals, indices, uv, section, first) {
  const [ct, st] = uv;
  const start = positions.length / 3;
  for (const [r, z] of section) {
    positions.push(r * ct, r * st, z);
    normals.push(first ? 0 : -st, first ? -1 : ct, 0);
  }
  if (first) {
    indices.push(start, start + 2, start + 1, start + 2, start, start + 3);
  } else {
    indices.push(start, start + 1, start + 2, start + 2, start + 3, start);
  }
  return 2;
}

function meshFromGeometry(name, geometry, matrix3x4, material, quality) {
  geometry.applyMatrix4(matrix4FromCppMat3x4(matrix3x4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals?.();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData = {
    schemaVersion: BROWSER_RVM_TORUS_PARITY_SCHEMA,
    browserRvmTorusParityUpgraded: true,
    browserRvmTorusParitySchema: BROWSER_RVM_TORUS_PARITY_SCHEMA,
    effectiveRenderPrimitive: name,
    renderQuality: quality,
    pickable: true,
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
    browserRvmTorusParityUpgraded: true,
    browserRvmTorusParityKind: params.kindName || `Kind-${code}`,
    browserRvmTorusParityCode: String(code),
    browserRvmTorusCarrierType: carrierTypeFor(source),
    previousEffectiveRenderPrimitive: source.userData?.effectiveRenderPrimitive || '',
    previousRenderQuality: source.userData?.renderQuality || '',
    effectiveRenderPrimitive: native.userData.effectiveRenderPrimitive,
    renderQuality: native.userData.renderQuality,
    pickable: true,
    selectable: true,
    nonSelectableReason: '',
  };
  const index = parent.children.indexOf(source);
  if (index >= 0) parent.children[index] = native;
  native.parent = parent;
  source.parent = null;
  disposeObject(source);
}

function makeDiagnostics(extra = {}) {
  return {
    schemaVersion: BROWSER_RVM_TORUS_PARITY_SCHEMA,
    capturedAt: new Date().toISOString(),
    reason: extra.reason || '',
    scannedCount: 0,
    candidateCount: 0,
    linePlaceholderCandidateCount: 0,
    upgradedCount: 0,
    alreadyUpgradedCount: 0,
    skippedCount: 0,
    circularTorusTessellatedCount: 0,
    rectangularTorusTessellatedCount: 0,
    torusCappedEndCount: 0,
    torusShellTriangleCount: 0,
    torusCapTriangleCount: 0,
    circularTorusSegmentSamples: 0,
    rectangularTorusSegmentSamples: 0,
    kindCounts: {},
    carrierTypeCounts: {},
    upgradedKindCounts: {},
    skippedReasons: {},
  };
}

function publishDiagnostics(diagnostics = {}) {
  const payload = { schemaVersion: BROWSER_RVM_TORUS_PARITY_SCHEMA, capturedAt: new Date().toISOString(), ...(diagnostics || {}) };
  globalThis[GLOBAL_DIAGNOSTICS_KEY] = payload;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-torus-parity-diagnostics', { detail: payload })); } catch (_) {}
  return payload;
}

function annotateViewer(viewer, diagnostics) {
  const root = viewer?.modelGroup?.children?.[0] || viewer?.modelGroup || null;
  if (!root) return;
  root.userData = { ...(root.userData || {}), browserRvmTorusParity: diagnostics };
  if (root.userData.browserRvmRender) {
    root.userData.browserRvmRender = { ...(root.userData.browserRvmRender || {}), torusParity: diagnostics };
  }
}

function bufferGeometry(positions, indices, normals = null) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (Array.isArray(normals) && normals.length === positions.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
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
    if (!material && (child?.isMesh || child?.isLine || child?.isLineSegments) && child.material) {
      material = Array.isArray(child.material) ? child.material[0] : child.material;
    }
  });
  if (!material && object?.material) material = Array.isArray(object.material) ? object.material[0] : object.material;
  const color = material?.color?.clone?.() || new THREE.Color(0x6b7280);
  const roughness = Number.isFinite(material?.roughness) ? material.roughness : 0.72;
  const metalness = Number.isFinite(material?.metalness) ? material.metalness : 0.08;
  const opacity = Number.isFinite(material?.opacity) && material.opacity > 0 ? Math.max(material.opacity, 0.82) : 1;
  const meshMaterial = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent: opacity < 1, opacity });
  meshMaterial.side = THREE.DoubleSide;
  return meshMaterial;
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
  return Math.max(12, Math.min(48, Math.ceil(Math.sqrt(r) * 8)));
}

function disposeObject(root) {
  root?.traverse?.((obj) => { if (obj.geometry?.dispose) obj.geometry.dispose(); });
}
function bump(target, key) { const name = String(key || '').trim() || 'UNKNOWN'; target[name] = (target[name] || 0) + 1; }
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function requestAnimationFrameSafe(fn) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn); else setTimeout(fn, 0); }
