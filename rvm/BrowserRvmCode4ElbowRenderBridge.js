import * as THREE from 'three';

const VERSION = '20260630-rvm-code4-elbow-native-overlay-2';
const GLOBAL_KEY = '__PCF_GLB_RVM_CODE4_ELBOW_RENDER_BRIDGE__';
const ROOT_SELECTOR = '[data-rvm-viewer]';
const MODEL_EVENTS = ['rvm-model-loaded', 'rvm-source-model-loaded', 'rvm-native-rvm-loaded'];
let observer = null;
let refreshTimer = 0;
let installedListeners = false;

export function installBrowserRvmCode4ElbowRenderBridge() {
  if (typeof document === 'undefined') return null;
  const existing = globalThis[GLOBAL_KEY];
  if (existing?.version === VERSION) return existing;
  const api = { version: VERSION, refresh: (reason = 'api') => refreshAll(reason) };
  globalThis[GLOBAL_KEY] = api;
  installListeners();
  for (const delay of [0, 120, 400, 900, 1800, 3200]) setTimeout(() => refreshAll(`install-${delay}`), delay);
  return api;
}

function installListeners() {
  if (installedListeners) return;
  installedListeners = true;
  for (const name of MODEL_EVENTS) {
    globalThis.addEventListener?.(name, () => scheduleRefresh(name));
    document.addEventListener(name, () => scheduleRefresh(name), true);
  }
  observer = new MutationObserver(() => scheduleRefresh('scene-mutation'));
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function scheduleRefresh(reason) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshAll(reason), 50);
}

function refreshAll(reason = 'manual') {
  let patched = 0;
  for (const viewer of activeViewers()) patched += patchViewer(viewer, reason);
  const root = document.querySelector(ROOT_SELECTOR);
  if (root?.dataset) {
    root.dataset.rvmCode4ElbowRenderBridge = VERSION;
    root.dataset.rvmCode4ElbowRenderReason = reason;
    root.dataset.rvmCode4ElbowRenderPatched = String(patched);
  }
  return { version: VERSION, patched, reason };
}

function activeViewers() {
  const set = new Set();
  const root = document.querySelector(ROOT_SELECTOR);
  for (const candidate of [root?.__rvmViewer3D, root?.__rvmViewer, globalThis.__3D_RVM_VIEWER__]) {
    if (candidate?.modelGroup) set.add(candidate);
  }
  return [...set];
}

function patchViewer(viewer, reason = 'manual') {
  const modelGroup = viewer?.modelGroup;
  if (!modelGroup) return 0;
  let patched = 0;
  const targets = [];
  modelGroup.traverse((object) => {
    if (isNativeFittingTarget(object)) targets.push(object);
  });
  for (const object of targets) {
    if (object.userData?.browserRvmNativeFittingOverlayApplied === VERSION) continue;
    const overlay = buildNativeFittingOverlay(object);
    if (!overlay) continue;
    const parent = object.parent || modelGroup;
    parent.add(overlay);
    object.userData.browserRvmNativeFittingOverlayApplied = VERSION;
    object.userData.browserRvmCode4ElbowOverlayApplied = VERSION;
    object.userData.browserRvmNativeFittingOverlayReason = reason;
    object.visible = false;
    patched += 1;
  }
  if (patched) {
    viewer.selection?.updateModelGroup?.(viewer.modelGroup);
    viewer.visibility?.updateModelGroup?.(viewer.modelGroup);
    viewer.modelGroup.updateMatrixWorld?.(true);
  }
  return patched;
}

function isNativeFittingTarget(object) {
  if (!object || object.userData?.browserRvmNativeFittingOverlay === VERSION || object.userData?.browserRvmCode4ElbowOverlay === VERSION) return false;
  return isCode4ElbowObject(object) || isTeePlaceholderObject(object);
}

function isCode4ElbowObject(object) {
  const data = object.userData || {};
  const attrs = data.browserRvmAttributes || {};
  const text = [data.effectiveRenderPrimitive, data.renderPrimitive, data.type, data.kind, attrs.RVM_PRIMITIVE_CODE, attrs.RVM_PRIMITIVE_KIND_NAME, attrs.RVM_PRIMITIVE_CAPABILITY_NAME, attrs.TYPE, attrs.RVM_OWNER_NAME, attrs.RVM_OWNER_PATH].map((value) => String(value || '')).join(' ').toUpperCase();
  if (String(attrs.RVM_PRIMITIVE_CODE || '') === '4') return true;
  if (/ELBOW_TORUS_ARC|CIRCULARTORUS|\bTORUS\b/.test(text) && /ELBOW|BEND|CODE\s*4/.test(text)) return true;
  return false;
}

function isTeePlaceholderObject(object) {
  const data = object.userData || {};
  const attrs = data.browserRvmAttributes || {};
  const effective = String(data.effectiveRenderPrimitive || '').toUpperCase();
  const raw = String(data.renderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '').toUpperCase();
  if (effective === 'TEE_COMPOSITE' || raw === 'TEE_BBOX_PLACEHOLDER') return true;
  if (String(data.type || attrs.TYPE || '').toUpperCase() === 'TEE' && /PLACEHOLDER|COMPOSITE/.test(`${effective} ${raw}`)) return true;
  return false;
}

function buildNativeFittingOverlay(sourceObject) {
  if (isCode4ElbowObject(sourceObject)) return buildCode4ElbowOverlay(sourceObject);
  if (isTeePlaceholderObject(sourceObject)) return buildTeeOverlay(sourceObject);
  return null;
}

function buildCode4ElbowOverlay(sourceObject) {
  const attrs = sourceObject.userData?.browserRvmAttributes || {};
  const params = parseJson(attrs.RVM_NATIVE_PRIMITIVE_PARAMS);
  const matrix = parseNumberArray(attrs.RVM_TRANSFORM_3X4, 12);
  const material = materialFromSource(sourceObject);
  const native = buildNativeCode4Tube(params, matrix, attrs, material);
  const overlay = native || buildBboxArc(sourceObject, attrs, material);
  if (!overlay) return null;
  overlay.name = `${sourceObject.name || 'RVM code 4 elbow'} native fitting overlay`;
  overlay.userData = {
    ...(sourceObject.userData || {}),
    browserRvmNativeFittingOverlay: VERSION,
    browserRvmCode4ElbowOverlay: VERSION,
    browserRvmCode4ElbowOverlaySource: native ? 'native-code4-offset-radius-angle-with-tangent-stubs' : 'bbox-diagnostic-code4-elbow',
    effectiveRenderPrimitive: 'ELBOW_TORUS_ARC',
    renderQuality: 'native-code4-elbow-overlay',
    pickable: true,
  };
  stampChildren(overlay);
  return overlay;
}

function buildNativeCode4Tube(params, matrix, attrs, material) {
  if (!params?.decoded || !Array.isArray(matrix) || matrix.length < 12) return null;
  const rawRadius = Math.abs(Number(params.radius) || 0);
  const offset = Math.abs(Number(params.offset) || 0);
  const angle = normalizeAngle(Number(params.angle));
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-5) return null;
  const centerlineRadius = Math.max(offset, rawRadius, 0.001);
  const segments = Math.max(10, Math.min(72, Math.ceil(Math.abs(angle) / (Math.PI / 24))));
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = angle * (i / segments);
    points.push(transformPoint(matrix, { x: Math.cos(t) * centerlineRadius, y: Math.sin(t) * centerlineRadius, z: 0 }));
  }
  if (points.length < 2 || !points.every(isFiniteVector)) return null;
  const tubeRadius = safeTubeRadius(rawRadius * maxColumnScale(matrix), attrs, points);
  const group = new THREE.Group();
  const arc = tubeMesh(points.map(vec3), tubeRadius, material, `native-code4:${fixed(centerlineRadius)}:${fixed(tubeRadius)}:${fixed(angle)}`);
  if (arc) group.add(arc);
  addElbowTangentStubs(group, points, tubeRadius, material);
  return group.children.length ? group : null;
}

function addElbowTangentStubs(group, points, tubeRadius, material) {
  if (!group || !points || points.length < 2) return;
  const first = vec3(points[0]);
  const second = vec3(points[1]);
  const penultimate = vec3(points[points.length - 2]);
  const last = vec3(points[points.length - 1]);
  const stubLength = Math.max(tubeRadius * 2.2, first.distanceTo(second) * 0.9, 0.001);
  const startDir = first.clone().sub(second).normalize();
  const endDir = last.clone().sub(penultimate).normalize();
  const startStub = cylinderBetween(first.clone().add(startDir.multiplyScalar(stubLength)), first, tubeRadius, material, 12);
  const endStub = cylinderBetween(last, last.clone().add(endDir.multiplyScalar(stubLength)), tubeRadius, material, 12);
  if (startStub) group.add(startStub);
  if (endStub) group.add(endStub);
}

function buildBboxArc(sourceObject, attrs, material) {
  const bbox = parseBbox(attrs.RVM_BROWSER_BBOX || sourceObject.userData?.browserRvmProperties?.attributes?.RVM_BROWSER_BBOX);
  if (!bbox) return null;
  const center = { x: (bbox[0] + bbox[3]) / 2, y: (bbox[1] + bbox[4]) / 2, z: (bbox[2] + bbox[5]) / 2 };
  const extents = extentsFromBbox(bbox).sort((a, b) => b.size - a.size);
  const a = extents[0], b = extents[1] || extents[0];
  const r = Math.max(Math.min(a.size, b.size) * 0.35, 0.001);
  const points = [];
  for (let i = 0; i <= 14; i += 1) {
    const t = (Math.PI * 0.5) * (i / 14);
    const p = { ...center };
    p[a.axis] += Math.cos(t) * r;
    p[b.axis] += Math.sin(t) * r;
    points.push(vec3(p));
  }
  const tubeRadius = safeTubeRadius(0, attrs, points);
  return tubeMesh(points, tubeRadius, material, `bbox-code4:${fixed(r)}:${fixed(tubeRadius)}`);
}

function buildTeeOverlay(sourceObject) {
  const attrs = sourceObject.userData?.browserRvmAttributes || {};
  const bbox = parseBbox(attrs.RVM_BROWSER_BBOX || sourceObject.userData?.browserRvmProperties?.attributes?.RVM_BROWSER_BBOX);
  if (!bbox) return null;
  const material = materialFromSource(sourceObject);
  const center = centerFromBbox(bbox);
  const axisStart = parseVec(attrs.RVM_BROWSER_AXIS_START);
  const axisEnd = parseVec(attrs.RVM_BROWSER_AXIS_END);
  const extents = extentsFromBbox(bbox).sort((a, b) => b.size - a.size);
  const mainAxis = dominantAxisFromSegment(axisStart, axisEnd) || extents[0]?.axis || 'x';
  const branchAxis = (extents.find((item) => item.axis !== mainAxis && item.size > 1e-6) || extents.find((item) => item.axis !== mainAxis) || extents[1] || extents[0]).axis;
  const radius = teeRadius(attrs, bbox, mainAxis, branchAxis);
  const group = new THREE.Group();
  const mainStart = axisStart && axisEnd ? vec3(axisStart) : pointAtBboxAxis(bbox, mainAxis, -1, center);
  const mainEnd = axisStart && axisEnd ? vec3(axisEnd) : pointAtBboxAxis(bbox, mainAxis, 1, center);
  const main = cylinderBetween(mainStart, mainEnd, radius, material, 16);
  if (main) group.add(main);
  const branchPositive = pointAtBboxAxis(bbox, branchAxis, 1, center);
  const branchNegative = pointAtBboxAxis(bbox, branchAxis, -1, center);
  const positiveLen = branchPositive.distanceTo(vec3(center));
  const negativeLen = branchNegative.distanceTo(vec3(center));
  const branchEnd = positiveLen >= negativeLen ? branchPositive : branchNegative;
  const branch = cylinderBetween(vec3(center), branchEnd, radius, material, 16);
  if (branch) group.add(branch);
  const filletRadius = Math.max(radius * 1.08, 0.001);
  const hub = sphereAt(vec3(center), filletRadius, material);
  if (hub) group.add(hub);
  if (!group.children.length) return null;
  group.name = `${sourceObject.name || 'RVM tee'} complete tee overlay`;
  group.userData = {
    ...(sourceObject.userData || {}),
    browserRvmNativeFittingOverlay: VERSION,
    browserRvmTeeOverlay: VERSION,
    browserRvmTeeOverlaySource: 'bbox-axis-complete-tee-diagnostic',
    effectiveRenderPrimitive: 'TEE_COMPOSITE',
    renderQuality: 'complete-tee-overlay',
    pickable: true,
  };
  stampChildren(group);
  return group;
}

function tubeMesh(points, radius, material, key = '') {
  if (!points || points.length < 2 || !Number.isFinite(radius) || radius <= 0) return null;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
  const geometry = new THREE.TubeGeometry(curve, Math.max(points.length * 2, 16), radius, 12, false);
  geometry.userData = { ...(geometry.userData || {}), browserRvmCode4ElbowGeometryKey: key };
  return new THREE.Mesh(geometry, material);
}

function cylinderBetween(start, end, radius, material, radialSegments = 16) {
  const a = start?.isVector3 ? start : vec3(start);
  const b = end?.isVector3 ? end : vec3(end);
  const axis = new THREE.Vector3().subVectors(b, a);
  const length = axis.length();
  if (!Number.isFinite(length) || length <= 1e-6 || !Number.isFinite(radius) || radius <= 0) return null;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  return mesh;
}

function sphereAt(center, radius, material) {
  if (!center || !Number.isFinite(radius) || radius <= 0) return null;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.position.copy(center);
  return mesh;
}

function materialFromSource(sourceObject) {
  let found = null;
  sourceObject.traverse?.((child) => {
    if (found) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    if (material?.isMaterial) found = material;
  });
  const clone = found?.clone?.() || new THREE.MeshStandardMaterial({ color: 0x3d74c5, roughness: 0.68, metalness: 0.12 });
  clone.transparent = false;
  clone.opacity = 1;
  clone.wireframe = false;
  clone.needsUpdate = true;
  return clone;
}

function normalizeAngle(value) {
  let angle = Number(value);
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-8) return Math.PI * 0.5;
  if (Math.abs(angle) > Math.PI * 2 + 1e-4 && Math.abs(angle) <= 720) angle = angle * Math.PI / 180;
  return angle;
}

function safeTubeRadius(candidate, attrs, points) {
  const attrRadius = Math.abs(Number(attrs.RVM_BROWSER_RADIUS) || 0);
  const raw = Math.max(candidate || 0, attrRadius || 0);
  const box = boundsFromPoints(points || []);
  const dims = box ? [box[3] - box[0], box[4] - box[1], box[5] - box[2]].map(Math.abs).filter((value) => value > 0) : [];
  const maxSpan = dims.length ? Math.max(...dims) : 1;
  const fallback = Math.max(maxSpan * 0.035, 0.0025);
  const cap = Math.max(maxSpan * 0.22, fallback);
  return Math.min(Math.max(raw || fallback, fallback), cap);
}

function teeRadius(attrs, bbox, mainAxis, branchAxis) {
  const attrRadius = Math.abs(Number(attrs.RVM_BROWSER_RADIUS) || 0);
  if (attrRadius > 0) return attrRadius;
  const extents = extentsFromBbox(bbox).filter((item) => item.axis !== mainAxis && item.axis !== branchAxis).map((item) => item.size).filter((value) => value > 0);
  const minor = extents.length ? Math.min(...extents) : Math.min(...extentsFromBbox(bbox).map((item) => item.size).filter((value) => value > 0));
  return Math.max((minor || 1) * 0.48, 0.001);
}

function transformPoint(m, p) {
  return {
    x: m[0] * p.x + m[3] * p.y + m[6] * p.z + m[9],
    y: m[1] * p.x + m[4] * p.y + m[7] * p.z + m[10],
    z: m[2] * p.x + m[5] * p.y + m[8] * p.z + m[11],
  };
}

function maxColumnScale(m) {
  if (!Array.isArray(m) || m.length < 9) return 1;
  return Math.max(
    Math.hypot(m[0], m[1], m[2]),
    Math.hypot(m[3], m[4], m[5]),
    Math.hypot(m[6], m[7], m[8]),
    1e-6,
  );
}

function boundsFromPoints(points) {
  if (!points?.length) return null;
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of points) {
    box[0] = Math.min(box[0], p.x); box[1] = Math.min(box[1], p.y); box[2] = Math.min(box[2], p.z);
    box[3] = Math.max(box[3], p.x); box[4] = Math.max(box[4], p.y); box[5] = Math.max(box[5], p.z);
  }
  return box.every(Number.isFinite) ? box : null;
}

function centerFromBbox(bbox) { return { x: (bbox[0] + bbox[3]) / 2, y: (bbox[1] + bbox[4]) / 2, z: (bbox[2] + bbox[5]) / 2 }; }
function extentsFromBbox(bbox) { return [{ axis: 'x', size: Math.abs(bbox[3] - bbox[0]) }, { axis: 'y', size: Math.abs(bbox[4] - bbox[1]) }, { axis: 'z', size: Math.abs(bbox[5] - bbox[2]) }]; }
function pointAtBboxAxis(bbox, axis, sign, center) { const p = { ...center }; p[axis] = sign < 0 ? Math.min(bbox[axisIndex(axis)], bbox[axisIndex(axis) + 3]) : Math.max(bbox[axisIndex(axis)], bbox[axisIndex(axis) + 3]); return vec3(p); }
function axisIndex(axis) { return axis === 'x' ? 0 : axis === 'y' ? 1 : 2; }
function dominantAxisFromSegment(start, end) { if (!start || !end) return null; const d = { x: Math.abs(end.x - start.x), y: Math.abs(end.y - start.y), z: Math.abs(end.z - start.z) }; return d.x >= d.y && d.x >= d.z ? 'x' : d.y >= d.z ? 'y' : 'z'; }
function parseJson(value) { try { return value ? JSON.parse(String(value)) : null; } catch (_) { return null; } }
function parseNumberArray(value, minLength = 0) { const parsed = parseJson(value); return Array.isArray(parsed) && parsed.length >= minLength ? parsed.map(Number).filter(Number.isFinite) : null; }
function parseBbox(value) { const nums = Array.isArray(value) ? value.map(Number) : String(value || '').replace(/[\[\]]/g, ' ').split(/[\s,]+/g).filter(Boolean).map(Number); return nums.length >= 6 && nums.slice(0, 6).every(Number.isFinite) ? nums.slice(0, 6) : null; }
function parseVec(value) { if (value?.isVector3) return { x: value.x, y: value.y, z: value.z }; if (value && typeof value === 'object') { const x = Number(value.x), y = Number(value.y), z = Number(value.z); return [x, y, z].every(Number.isFinite) ? { x, y, z } : null; } const nums = String(value || '').replace(/[\[\]{}]/g, ' ').split(/[\s,:]+/g).filter(Boolean).map(Number); return nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite) ? { x: nums[0], y: nums[1], z: nums[2] } : null; }
function vec3(p) { return p?.isVector3 ? p.clone() : new THREE.Vector3(Number(p?.x) || 0, Number(p?.y) || 0, Number(p?.z) || 0); }
function isFiniteVector(p) { return p && [p.x, p.y, p.z].every((value) => Number.isFinite(Number(value))); }
function stampChildren(root) { root.traverse?.((child) => { child.userData = { ...(child.userData || {}), browserRvmNativeFittingOverlay: VERSION, pickable: true }; }); }
function fixed(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(6) : '0.000000'; }
