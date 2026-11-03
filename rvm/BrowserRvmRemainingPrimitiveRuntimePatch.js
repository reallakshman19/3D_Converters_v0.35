import * as THREE from 'three';

export const BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA = 'browser-rvm-remaining-primitives/v4-support-raw-safe';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-remaining-primitive-runtime-patch-v4-support-raw-safe');
const UPGRADE_FLAG = Symbol.for('pcf-glb-rvm-remaining-primitive-upgraded-v4');
const GLOBAL_STATE_KEY = '__PCF_GLB_RVM_REMAINING_PRIMITIVES__';
const GLOBAL_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_REMAINING_PRIMITIVES_DIAGNOSTICS__';
const MAX_OBJECTS = 8000;
const FACET_GROUP_RENDER_QUALITY = 'native-cpp-facetgroup-tessellated';

const GRID_LINE_TERMS = /\b(GRID|GRIDS|GRIDLINE|GENSEC|REFERENCE|AXIS|EASTING|EASTINGS|NORTHING|NORTHINGS|SETTINGOUT|DATUM)\b/i;
const CIVIL_LINE_CONTEXT_TERMS = /\b(STRUCTURE|STRUCTURAL|FRMWORK|FRAMEWORK|SBFRAMEWORK|PANEL|PAVE|ROAD|FOUNDATION|FDNS|CIVIL)\b/i;
const SUPPORT_TERMS = /\b(SUPPORT|SUPP|GUIDE|ANCHOR|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|REST|SHOE|HANGER|SPRING|CLAMP|TRUNNION|DUMMY|SADDLE|STANCHION|PEDESTAL|BASE\s*PLATE)\b/i;

export function installBrowserRvmRemainingPrimitiveRuntimePatch() {
  if (globalThis[PATCH_FLAG]) return globalThis[PATCH_FLAG];
  const state = {
    installed: true,
    schemaVersion: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA,
    installedAt: new Date().toISOString(),
    runs: 0,
    lastDiagnostics: null,
    runNow() { return runAndPublish(); },
    getDiagnostics() { return state.lastDiagnostics || globalThis[GLOBAL_DIAGNOSTICS_KEY] || null; },
  };
  globalThis[PATCH_FLAG] = state;
  globalThis[GLOBAL_STATE_KEY] = state;

  const schedule = () => requestAnimationFrameSafe(runAndPublish);
  state.schedule = schedule;

  function runAndPublish() {
    const diagnostics = upgradeActiveRvmRemainingPrimitives();
    if (diagnostics) {
      state.runs += 1;
      state.lastDiagnostics = diagnostics;
      publishDiagnostics(diagnostics);
    }
    return diagnostics;
  }

  try { globalThis.addEventListener?.('rvm-browser-parse-diagnostics', schedule); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-native-tessellation-diagnostics', schedule); } catch (_) {}
  for (const delay of [700, 1800, 3600, 6500]) setTimeout(schedule, delay);
  return state;
}

export function upgradeActiveRvmRemainingPrimitives() {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!viewer?.modelGroup) return makeDiagnostics({ reason: 'viewer-not-ready' });
  const diagnostics = upgradeRvmRemainingPrimitives(viewer.modelGroup);
  annotateViewer(viewer, diagnostics);
  return diagnostics;
}

export function upgradeRvmRemainingPrimitives(root) {
  const diagnostics = makeDiagnostics({ reason: '' });
  if (!root?.traverse) return diagnostics;
  const replacements = [];
  root.traverse((object) => {
    if (!object || replacements.length >= MAX_OBJECTS) return;
    if (object === root || !object.parent || !object.isMesh) return;
    diagnostics.scannedCount += 1;
    if (object[UPGRADE_FLAG] || object.userData?.browserRvmRemainingPrimitiveUpgraded) {
      diagnostics.alreadyUpgradedCount += 1;
      return;
    }
    const attrs = object.userData?.browserRvmAttributes || object.userData?.attributes || object.userData?.browserRvmProperties?.attributes || null;
    if (isGeneratedSupportOrChild(object, attrs)) {
      diagnostics.generatedSupportUpgradeSkippedCount += 1;
      bump(diagnostics.skippedReasons, 'generated-support-or-support-placeholder-not-native-upgraded');
      return;
    }
    const params = parseNativeParams(attrs?.RVM_NATIVE_PRIMITIVE_PARAMS);
    const matrix = parseNumericArray(attrs?.RVM_TRANSFORM_3X4, 12);
    const code = Number(params?.kind || attrs?.RVM_PRIMITIVE_CODE);
    if (!Number.isFinite(code)) return;
    bump(diagnostics.kindCounts, params?.kindName || attrs?.RVM_PRIMITIVE_KIND_NAME || `Kind-${code}`);

    if (code === 1 && isSupportLikeObject(object, attrs)) {
      diagnostics.supportCode1SolidUpgradeSkippedCount += 1;
      bump(diagnostics.skippedReasons, 'support-code1-pyramid-solid-upgrade-disabled');
      return;
    }

    if (!params?.decoded || !matrix) {
      if (code === 11) {
        diagnostics.facetGroupUnsupportedCount += 1;
        diagnostics.facetGroupDecodeCapSkippedCount += params?.reason ? 1 : 0;
        bump(diagnostics.skippedReasons, params?.reason || 'facet-group-native-stream-not-decoded');
      }
      return;
    }
    // code 2 = Box (this patch). Snout(7)/CircTorus(4)/Dish(5,6) are owned by their dedicated
    // parity/tessellation patches (browser-rvm-snout-parity, browser-rvm-torus-parity, dish tessellation).
    if (code !== 1 && code !== 2 && code !== 10 && code !== 11) return;
    diagnostics.candidateCount += 1;
    const native = buildNativeObject(code, params, matrix, materialForSource(object), diagnostics, object);
    if (!native) {
      diagnostics.skippedCount += 1;
      bump(diagnostics.skippedReasons, `unsupported-kind-${code}`);
      return;
    }
    replacements.push({ source: object, native, params, code });
  });

  for (const item of replacements) {
    replaceObject(item.source, item.native, item.params, item.code);
    diagnostics.upgradedCount += 1;
    if (item.code === 1) diagnostics.pyramidTessellatedCount += 1;
    if (item.code === 10) diagnostics.lineTessellatedCount += 1;
    if (item.code === 11) diagnostics.facetGroupTessellatedCount += 1;
    bump(diagnostics.upgradedKindCounts, item.params.kindName || `Kind-${item.code}`);
  }
  if (replacements.length >= MAX_OBJECTS) {
    diagnostics.skippedCount += 1;
    bump(diagnostics.skippedReasons, 'upgrade-object-limit');
  }
  return diagnostics;
}

function isGeneratedSupportOrChild(object, attrs = {}) {
  const data = object?.userData || {};
  const parentPrimitive = String(data.parentBrowserRvmRenderPrimitive || '').toUpperCase();
  const effective = String(data.effectiveRenderPrimitive || '').toUpperCase();
  const raw = String(data.renderPrimitive || attrs?.RVM_BROWSER_RENDER_PRIMITIVE || '').toUpperCase();
  return Boolean(
    data.supportSymbol ||
    data.rvmSupportSymbolGenerated ||
    data.rvmSupportGeometryGenerated ||
    parentPrimitive === 'SUPPORT_BBOX_PLACEHOLDER' ||
    raw === 'SUPPORT_BBOX_PLACEHOLDER' ||
    effective === 'SUPPORT_STAND'
  );
}

function isSupportLikeObject(object, attrs = {}) {
  const data = object?.userData || {};
  const props = data.browserRvmProperties || {};
  if (String(attrs?.RVM_BROWSER_SUPPORT_HINT || data.RVM_BROWSER_SUPPORT_HINT || '').toLowerCase() === 'true') return true;
  if (String(attrs?.RVM_BROWSER_SUPPORT_RAW_PRIMITIVE_PRESERVED || '').toLowerCase() === 'true') return true;
  if (String(data.type || attrs?.TYPE || '').toUpperCase() === 'SUPPORT') return true;
  const text = [
    object?.name,
    data.displayName,
    data.sourcePath,
    props.displayName,
    props.sourcePath,
    attrs?.NAME,
    attrs?.TYPE,
    attrs?.RVM_OWNER_NAME,
    attrs?.RVM_OWNER_PATH,
    attrs?.RVM_BROWSER_SUPPORT_KIND,
    attrs?.SUPPORT_KIND,
    attrs?.SUPPORT_TYPE,
  ].map((value) => String(value || '')).join(' ');
  return SUPPORT_TERMS.test(text);
}

function buildNativeObject(code, params, matrix3x4, material, diagnostics, source = null) {
  if (code === 10) return buildCode10LineObject(params, matrix3x4, material, diagnostics, source);

  let geometry = null;
  let primitive = '';
  if (code === 1) {
    geometry = pyramidGeometry(params);
    primitive = 'RVM_NATIVE_PYRAMID';
  } else if (code === 2) {
    geometry = boxGeometry(params);
    primitive = 'RVM_NATIVE_BOX';
  } else if (code === 11) {
    geometry = facetGroupGeometry(params, diagnostics);
    primitive = 'RVM_NATIVE_FACET_GROUP';
  }
  if (!geometry) return null;
  geometry.applyMatrix4(matrix4FromCppMat3x4(matrix3x4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals?.();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = primitive;
  mesh.userData = {
    schemaVersion: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA,
    browserRvmRemainingPrimitiveUpgraded: true,
    browserRvmRemainingPrimitiveSchema: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA,
    effectiveRenderPrimitive: primitive,
    renderQuality: code === 11 ? FACET_GROUP_RENDER_QUALITY : 'native-cpp-remaining-primitive',
  };
  mesh[UPGRADE_FLAG] = true;
  return mesh;
}

function buildCode10LineObject(params, matrix3x4, material, diagnostics, source = null) {
  const policy = classifyCode10LinePolicy(source, params);
  if (policy.action === 'hidden') {
    diagnostics.lineHiddenDiagnosticCount += 1;
    bump(diagnostics.skippedReasons, policy.reason);
    const group = new THREE.Group();
    group.name = 'RVM_NATIVE_LINE_HIDDEN_DIAGNOSTIC';
    group.visible = false;
    group.userData = linePolicyUserData(policy, 'RVM_NATIVE_LINE');
    group[UPGRADE_FLAG] = true;
    return group;
  }

  const geometry = lineSegmentGeometry(params, source);
  if (!geometry) return null;
  geometry.applyMatrix4(matrix4FromCppMat3x4(matrix3x4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const line = new THREE.LineSegments(geometry, lineMaterialForSource(material, policy));
  line.name = policy.gridLike ? 'RVM_NATIVE_GRID_LINE_DIAGNOSTIC' : 'RVM_NATIVE_LINE';
  line.userData = {
    schemaVersion: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA,
    browserRvmRemainingPrimitiveUpgraded: true,
    browserRvmRemainingPrimitiveSchema: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA,
    effectiveRenderPrimitive: 'RVM_NATIVE_LINE',
    renderQuality: policy.gridLike ? 'native-code10-grid-line-wire-diagnostic' : 'native-code10-line-wire',
    ...linePolicyUserData(policy, 'RVM_NATIVE_LINE'),
  };
  line[UPGRADE_FLAG] = true;
  diagnostics.lineWireDiagnosticCount += 1;
  if (policy.gridLike) diagnostics.lineGridDiagnosticCount += 1;
  return line;
}

function linePolicyUserData(policy = {}, primitive = 'RVM_NATIVE_LINE') {
  return {
    browserRvmCode10LinePolicy: true,
    browserRvmCode10LinePolicyVersion: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA,
    browserRvmCode10LineGridLike: Boolean(policy.gridLike),
    browserRvmCode10LineAction: policy.action || 'wire',
    browserRvmLineBoxAvoided: true,
    effectiveRenderPrimitive: primitive,
    pickable: false,
    selectable: false,
    nonSelectableReason: policy.reason || 'rvm-code10-line-wire-diagnostic',
    fallbackReason: policy.reason || 'rvm-code10-line-wire-diagnostic',
    geometryPolicy: policy.action === 'hidden' ? 'code10-line-hidden-diagnostic' : 'code10-line-wire-not-box',
    materialPolicy: 'line-basic-diagnostic',
  };
}

function classifyCode10LinePolicy(source = null, params = {}) {
  const text = [
    source?.name,
    source?.userData?.displayName,
    source?.userData?.sourceName,
    source?.userData?.sourcePath,
    source?.userData?.browserRvmProperties?.sourcePath,
    source?.userData?.browserRvmProperties?.displayName,
    source?.userData?.browserRvmAttributes?.RVM_OWNER_PATH,
    source?.userData?.browserRvmAttributes?.RVM_OWNER_NAME,
    source?.userData?.browserRvmAttributes?.NAME,
    params?.kindName,
  ].filter(Boolean).join('/');
  const upper = String(text || '').toUpperCase();
  const bbox = parseNumericArray(source?.userData?.browserRvmAttributes?.RVM_LOCAL_BBOX || source?.userData?.browserRvmAttributes?.BBOX, 6);
  const dims = dimsFromBbox(bbox);
  const longThin = dims.maxDim >= 500 && dims.midDim <= Math.max(20, dims.maxDim * 0.04);
  const gridLike = GRID_LINE_TERMS.test(upper) || (CIVIL_LINE_CONTEXT_TERMS.test(upper) && longThin);
  if (gridLike) {
    return {
      action: 'hidden',
      gridLike: true,
      reason: 'code10-grid-reference-line-default-off',
    };
  }
  return {
    action: 'wire',
    gridLike: false,
    reason: 'code10-line-rendered-as-wire-not-box',
  };
}

function lineSegmentGeometry(params = {}, source = null) {
  const bbox = parseNumericArray(source?.userData?.browserRvmAttributes?.RVM_LOCAL_BBOX || source?.userData?.browserRvmAttributes?.BBOX, 6);
  if (bbox) {
    const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
    const dx = Math.abs(maxX - minX), dy = Math.abs(maxY - minY), dz = Math.abs(maxZ - minZ);
    const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
    if (dx >= dy && dx >= dz) return lineGeometry([minX, cy, cz, maxX, cy, cz]);
    if (dy >= dx && dy >= dz) return lineGeometry([cx, minY, cz, cx, maxY, cz]);
    return lineGeometry([cx, cy, minZ, cx, cy, maxZ]);
  }
  const a = positive(Math.abs(params.a), 0.001);
  const b = positive(Math.abs(params.b), a);
  const length = Math.max(a, b, 0.001);
  return lineGeometry([0, 0, -length * 0.5, 0, 0, length * 0.5]);
}

function lineGeometry(values) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

function lineMaterialForSource(material, policy = {}) {
  const color = material?.color?.getHex ? material.color.getHex() : (policy.gridLike ? 0x7dd3fc : 0x93c5fd);
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity: policy.gridLike ? 0.32 : 0.62, depthWrite: false });
}

// Native code-2 Box: local lengthX/Y/Z (mm), centered; oriented + scaled by the cpp-mat3x4.
// Renders the actual oriented plate/box instead of an axis-aligned bounding-box block.
function boxGeometry(params) {
  const dx = positive(Math.abs(params.lengthX), 0.001);
  const dy = positive(Math.abs(params.lengthY), 0.001);
  const dz = positive(Math.abs(params.lengthZ), 0.001);
  return new THREE.BoxGeometry(dx, dy, dz);
}

function pyramidGeometry(params) {
  const bx = positive(Math.abs(params.bottomX), 0.001) * 0.5;
  const by = positive(Math.abs(params.bottomY), 0.001) * 0.5;
  const tx = positive(Math.abs(params.topX), 0.001) * 0.5;
  const ty = positive(Math.abs(params.topY), 0.001) * 0.5;
  const ox = finite(params.offsetX, 0);
  const oy = finite(params.offsetY, 0);
  const h = positive(Math.abs(params.height), Math.max(bx, by, tx, ty) * 2);
  const z0 = -h * 0.5;
  const z1 = h * 0.5;
  const positions = [
    -bx, -by, z0,   bx, -by, z0,   bx,  by, z0,  -bx,  by, z0,
    ox - tx, oy - ty, z1,   ox + tx, oy - ty, z1,   ox + tx, oy + ty, z1,   ox - tx, oy + ty, z1,
  ];
  const indices = [];
  quad(indices, 0, 1, 2, 3);
  quad(indices, 4, 7, 6, 5);
  quad(indices, 0, 4, 5, 1);
  quad(indices, 1, 5, 6, 2);
  quad(indices, 2, 6, 7, 3);
  quad(indices, 3, 7, 4, 0);
  return bufferGeometry(positions, indices);
}

function facetGroupGeometry(params, diagnostics) {
  const positions = [];
  const normals = [];
  const indices = [];
  const polygons = Array.isArray(params?.polygons) ? params.polygons : [];
  let polygonCount = 0;
  let triangleCount = 0;
  let holeSkipped = 0;
  for (const polygon of polygons) {
    const contours = Array.isArray(polygon?.contours) ? polygon.contours : [];
    const contour = contours[0];
    if (!contour || !Array.isArray(contour.vertices) || contour.vertices.length < 9) continue;
    polygonCount += 1;
    if (contours.length > 1) holeSkipped += contours.length - 1;
    const vo = positions.length / 3;
    const vertexCount = Math.floor(contour.vertices.length / 3);
    for (let i = 0; i < vertexCount; i += 1) {
      positions.push(finite(contour.vertices[i * 3], 0), finite(contour.vertices[i * 3 + 1], 0), finite(contour.vertices[i * 3 + 2], 0));
      if (Array.isArray(contour.normals) && contour.normals.length >= (i + 1) * 3) {
        normals.push(finite(contour.normals[i * 3], 0), finite(contour.normals[i * 3 + 1], 0), finite(contour.normals[i * 3 + 2], 1));
      } else {
        normals.push(0, 0, 1);
      }
    }
    if (vertexCount === 3) {
      indices.push(vo, vo + 1, vo + 2);
      triangleCount += 1;
    } else if (vertexCount === 4) {
      const split = quadSplit(contour.vertices);
      if (split === '012') {
        indices.push(vo, vo + 1, vo + 2, vo + 2, vo + 3, vo);
      } else {
        indices.push(vo + 3, vo, vo + 1, vo + 1, vo + 2, vo + 3);
      }
      triangleCount += 2;
    } else {
      for (let i = 1; i < vertexCount - 1; i += 1) indices.push(vo, vo + i, vo + i + 1);
      triangleCount += Math.max(vertexCount - 2, 0);
    }
  }
  diagnostics.facetGroupPolygonCount += polygonCount;
  diagnostics.facetGroupTriangleCount += triangleCount;
  diagnostics.facetGroupContourHoleSkippedCount += holeSkipped;
  if (!positions.length || !indices.length) return null;
  const geometry = bufferGeometry(positions, indices);
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function quadSplit(vertices) {
  const p = (i) => new THREE.Vector3(finite(vertices[i * 3], 0), finite(vertices[i * 3 + 1], 0), finite(vertices[i * 3 + 2], 0));
  const v0 = p(0), v1 = p(1), v2 = p(2), v3 = p(3);
  const n0 = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v3, v0));
  const n1 = new THREE.Vector3().subVectors(v2, v1).cross(new THREE.Vector3().subVectors(v0, v1));
  const n2 = new THREE.Vector3().subVectors(v3, v2).cross(new THREE.Vector3().subVectors(v1, v2));
  const n3 = new THREE.Vector3().subVectors(v0, v3).cross(new THREE.Vector3().subVectors(v2, v3));
  return n0.dot(n2) < n1.dot(n3) ? '012' : '301';
}

function replaceObject(source, native, params, code) {
  const parent = source.parent;
  if (!parent) return;
  native.name = source.name || native.name;
  native.userData = {
    ...(source.userData || {}),
    ...(native.userData || {}),
    browserRvmRemainingPrimitiveUpgraded: true,
    browserRvmRemainingPrimitiveSchema: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA,
    browserRvmRemainingPrimitiveKind: params.kindName || `Kind-${code}`,
    browserRvmRemainingPrimitiveCode: String(code),
    previousEffectiveRenderPrimitive: source.userData?.effectiveRenderPrimitive || '',
    previousRenderQuality: source.userData?.renderQuality || '',
    effectiveRenderPrimitive: native.userData.effectiveRenderPrimitive,
    renderQuality: native.userData.renderQuality,
    pickable: native.userData.pickable === false ? false : true,
    selectable: native.userData.selectable === false ? false : native.userData.selectable,
    nonSelectableReason: native.userData.nonSelectableReason || source.userData?.nonSelectableReason || '',
    fallbackReason: native.userData.fallbackReason || source.userData?.fallbackReason || '',
  };
  const index = parent.children.indexOf(source);
  if (index >= 0) parent.children[index] = native;
  native.parent = parent;
  source.parent = null;
  disposeObject(source);
}

function makeDiagnostics(extra = {}) {
  return {
    schemaVersion: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA,
    capturedAt: new Date().toISOString(),
    reason: extra.reason || '',
    scannedCount: 0,
    candidateCount: 0,
    upgradedCount: 0,
    alreadyUpgradedCount: 0,
    skippedCount: 0,
    generatedSupportUpgradeSkippedCount: 0,
    supportCode1SolidUpgradeSkippedCount: 0,
    pyramidTessellatedCount: 0,
    lineTessellatedCount: 0,
    lineWireDiagnosticCount: 0,
    lineGridDiagnosticCount: 0,
    lineHiddenDiagnosticCount: 0,
    lineBoxGeometryAvoided: true,
    facetGroupTessellatedCount: 0,
    facetGroupRenderQuality: FACET_GROUP_RENDER_QUALITY,
    facetGroupUnsupportedCount: 0,
    facetGroupDecodeCapSkippedCount: 0,
    facetGroupPolygonCount: 0,
    facetGroupTriangleCount: 0,
    facetGroupContourHoleSkippedCount: 0,
    kindCounts: {},
    upgradedKindCounts: {},
    skippedReasons: {},
  };
}

function publishDiagnostics(diagnostics = {}) {
  const payload = { schemaVersion: BROWSER_RVM_REMAINING_PRIMITIVE_SCHEMA, capturedAt: new Date().toISOString(), ...(diagnostics || {}) };
  globalThis[GLOBAL_DIAGNOSTICS_KEY] = payload;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-remaining-primitive-diagnostics', { detail: payload })); } catch (_) {}
  return payload;
}

function annotateViewer(viewer, diagnostics) {
  const root = viewer?.modelGroup?.children?.[0] || viewer?.modelGroup || null;
  if (!root) return;
  root.userData = { ...(root.userData || {}), browserRvmRemainingPrimitiveDiagnostics: diagnostics };
  if (root.userData.browserRvmRender) {
    root.userData.browserRvmRender = {
      ...root.userData.browserRvmRender,
      remainingPrimitiveDiagnostics: diagnostics,
      remainingPrimitiveUpgradedCount: diagnostics.upgradedCount,
      remainingPrimitiveGeneratedSupportSkippedCount: diagnostics.generatedSupportUpgradeSkippedCount,
      supportCode1SolidUpgradeSkippedCount: diagnostics.supportCode1SolidUpgradeSkippedCount,
      facetGroupTessellatedCount: diagnostics.facetGroupTessellatedCount,
      facetGroupUnsupportedCount: diagnostics.facetGroupUnsupportedCount,
      lineWireDiagnosticCount: diagnostics.lineWireDiagnosticCount,
      lineGridDiagnosticCount: diagnostics.lineGridDiagnosticCount,
      lineHiddenDiagnosticCount: diagnostics.lineHiddenDiagnosticCount,
    };
  }
}

function bufferGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}
function quad(indices, a, b, c, d) { indices.push(a, b, c, c, d, a); }
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
  object?.traverse?.((child) => { if (!material && child?.isMesh && child.material) material = Array.isArray(child.material) ? child.material[0] : child.material; });
  if (!material && object?.material) material = Array.isArray(object.material) ? object.material[0] : object.material;
  return material?.clone?.() || material || new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.72, metalness: 0.08 });
}
function dimsFromBbox(bbox = null) {
  if (!Array.isArray(bbox) || bbox.length < 6) return { maxDim: 0, midDim: 0, minDim: 0 };
  const dims = [Math.abs(bbox[3] - bbox[0]), Math.abs(bbox[4] - bbox[1]), Math.abs(bbox[5] - bbox[2])].sort((a, b) => a - b);
  return { minDim: dims[0] || 0, midDim: dims[1] || 0, maxDim: dims[2] || 0 };
}
function parseNativeParams(value) { if (!value) return null; try { return JSON.parse(String(value)); } catch (_) { return null; } }
function parseNumericArray(value, expected) {
  let arr = null;
  try { arr = JSON.parse(String(value || '')); } catch (_) { arr = String(value || '').split(/[\s,]+/g).map(Number).filter(Number.isFinite); }
  if (!Array.isArray(arr) || arr.length < expected) return null;
  const out = arr.slice(0, expected).map(Number);
  return out.every(Number.isFinite) ? out : null;
}
function disposeObject(root) { root?.traverse?.((obj) => { obj.geometry?.dispose?.(); }); }
function bump(target, key) { const name = String(key || '').trim() || 'UNKNOWN'; target[name] = (target[name] || 0) + 1; }
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function requestAnimationFrameSafe(fn) { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn); else setTimeout(fn, 0); }
