import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RvmViewer3D } from './RvmViewer3D.js?v=20260518-statusbar-theme-12';
import { resolveKindFromAttrs } from './RvmSupportMapper.js?v=20260518-support-mapper-11';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-support-symbols-patched');
const SUPPORT_SYMBOL_GROUP_NAME = '__RVM_SUPPORT_SYMBOLS__';
const SUPPORT_KIND_RX = /\b(GUIDE|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|RESTING|REST|SHOE|BP|BASE\s*PLATE|ANCHOR|FIXED|STOPPER|STOP)\b/i;
const SUPPORT_TAG_RX = /\bPS[-_\s]?[A-Z0-9][A-Z0-9._/\-]*\b/i;
const SUPPORT_SYMBOL_COLOR = 0x60c864;
const SUPPORT_KIND_COLORS = Object.freeze({
  REST: 0x5ee56a,
  GUIDE: 0x42d7ff,
  LINESTOP: 0xffb347,
  LIMIT: 0xffb347,
  ANCHOR: 0xf266ff,
  SPRING: 0xff6fae,
});

const SUPPORT_SYMBOL_SETTINGS_STORAGE_KEY = 'rvm_support_symbol_settings_v1';

const DEFAULTS = Object.freeze({
  labelsVisible: false,

  // Base model-size scaling.
  // Final scale = clamp(modelDiagonal * symbolScaleFactor) * scaleMultiplier
  symbolScaleFactor: 0.0035,

  // User-editable multiplier exposed in 3D RVM Viewer settings.
  scaleMultiplier: 3.0,

  // Wider range so very large/small models remain usable.
  minScale: 8,
  maxScale: 180,

  belowPipeFactor: 0.72,

  // Label-density guard: when labels are enabled, show a readable subset rather
  // than every support tag on top of the model. Symbols remain fully rendered.
  maxVisibleLabels: 28,
  labelGridFactor: 1.45,
});

function asText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
function asNumber(value) {
  const n = Number.parseFloat(String(value ?? '').replace(/mm/gi, '').trim());
  return Number.isFinite(n) ? n : null;
}
function clampNumber(value, min, max, fallback) {
  const n = Number(value);

  if (!Number.isFinite(n)) return fallback;

  return Math.max(min, Math.min(max, n));
}

export function normalizeRvmSupportSymbolScale(value) {
  return clampNumber(value, 0.25, 4.0, DEFAULTS.scaleMultiplier);
}

export function getRvmSupportSymbolSettings() {
  let saved = {};

  try {
    saved = JSON.parse(localStorage.getItem(SUPPORT_SYMBOL_SETTINGS_STORAGE_KEY) || '{}') || {};
  } catch {
    saved = {};
  }

  return {
    scaleMultiplier: normalizeRvmSupportSymbolScale(saved.scaleMultiplier ?? DEFAULTS.scaleMultiplier),
  };
}

export function saveRvmSupportSymbolSettings(patch = {}) {
  const next = {
    ...getRvmSupportSymbolSettings(),
    ...patch,
  };

  next.scaleMultiplier = normalizeRvmSupportSymbolScale(next.scaleMultiplier);

  try {
    localStorage.setItem(SUPPORT_SYMBOL_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore localStorage failure
  }

  return next;
}

function getSupportLabelsVisible(viewer) {
  const root = viewer?.scene?.getObjectByName(SUPPORT_SYMBOL_GROUP_NAME);
  if (!root) return false;

  let visible = false;

  root.traverse((obj) => {
    if (obj.userData?.supportSymbolLabel && obj.element) {
      if (obj.element.style.display !== 'none') visible = true;
    }
  });

  return visible;
}

export function applyRvmSupportSymbolSettings(viewer, patch = {}) {
  if (!viewer?.modelGroup || !viewer?.scene) {
    return { created: 0, scanned: 0, skipped: 'NO_VIEWER_MODEL' };
  }

  const saved = saveRvmSupportSymbolSettings(patch);
  const labelsVisible =
    patch.labelsVisible != null
      ? !!patch.labelsVisible
      : getSupportLabelsVisible(viewer);

  viewer.supportSymbolOptions = {
    ...(viewer.supportSymbolOptions || {}),
    ...saved,
    labelsVisible,
  };

  viewer.supportSymbolDiagnostics = addRvmSupportSymbols(viewer, viewer.supportSymbolOptions);

  return viewer.supportSymbolDiagnostics;
}

function normalizeCoord(value) {
  if (!value && value !== 0) return null;
  if (Array.isArray(value) && value.length >= 3) {
    const x = asNumber(value[0]); const y = asNumber(value[1]); const z = asNumber(value[2]);
    return x === null || y === null || z === null ? null : new THREE.Vector3(x, y, z);
  }
  if (typeof value === 'object') {
    const x = asNumber(value.x ?? value.X); const y = asNumber(value.y ?? value.Y); const z = asNumber(value.z ?? value.Z);
    return x === null || y === null || z === null ? null : new THREE.Vector3(x, y, z);
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const tokens = text.split(/\s+/g);
  const directional = new THREE.Vector3(0, 0, 0);
  let parsedDir = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const n = asNumber(tokens[i + 1]);
    if (n === null) continue;
    if (axis === 'E') { directional.x = n; parsedDir = true; }
    else if (axis === 'W') { directional.x = -n; parsedDir = true; }
    else if (axis === 'N') { directional.y = n; parsedDir = true; }
    else if (axis === 'S') { directional.y = -n; parsedDir = true; }
    else if (axis === 'U') { directional.z = n; parsedDir = true; }
    else if (axis === 'D') { directional.z = -n; parsedDir = true; }
  }
  if (parsedDir) return directional;
  const vals = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return vals.length >= 3 ? new THREE.Vector3(vals[0], vals[1], vals[2]) : null;
}
function getAttrs(obj) {
  const out = {};
  const stack = [obj?.userData, obj?.userData?.attributes, obj?.userData?.rawAttributes, obj?.userData?.sourceAttributes, obj?.attributes];
  for (const src of stack) {
    if (!src || typeof src !== 'object') continue;
    for (const [k, v] of Object.entries(src)) if (v !== undefined && v !== null && out[k] === undefined) out[k] = v;
  }
  return out;
}
function supportSearchText(obj, attrs) {
  return [obj?.name, obj?.userData?.name, obj?.userData?.type, obj?.userData?.kind, obj?.userData?.canonicalObjectId, attrs.TYPE, attrs.STYP, attrs.RAW_TYPE, attrs.DTXR, attrs.SUPPORT_TYPE, attrs.SUPPORT_KIND, attrs.SUPPORT_MAPPER_KIND, attrs.CMPSUPTYPE, attrs.CMPSUPREFN, attrs.SUPPORT_TAG, attrs.NAME, attrs.TAG, attrs.TAGNO, attrs.SKEY, attrs.SPRE, attrs.DESCRIPTION, attrs.DESC, attrs.CONNECTIONTYPE].map(asText).join(' ');
}
function normalizeSupportKind(text) {
  const s = String(text || '').toUpperCase();
  if (/\bGUIDE\b/.test(s)) return 'GUIDE';
  if (/\bLINE\s*STOP\b|\bLINESTOP\b|\bSTOPPER\b/.test(s)) return 'LINESTOP';
  if (/\bLIMIT\s*STOP\b|\bLIMIT\b/.test(s)) return 'LIMIT';
  if (/\bRESTING\b|\bREST\b|\bSHOE\b|\bBP\b|\bBASE\s*PLATE\b/.test(s)) return 'REST';
  if (/\bANCHOR\b|\bFIXED\b/.test(s)) return 'ANCHOR';
  if (/\bSTOP\b/.test(s)) return 'LINESTOP';
  return '';
}
function resolveSupportKind(obj, attrs) {
  return resolveKindFromAttrs(attrs) || normalizeSupportKind(supportSearchText(obj, attrs));
}
function supportTag(obj, attrs) {
  const values = [attrs.SUPPORT_TAG, attrs.CMPSUPREFN, attrs.NAME, attrs.TAG, attrs.TAGNO, attrs.REF, attrs.REFNO, attrs.DBREF, attrs.SKEY, attrs.SPRE, attrs.DESCRIPTION, attrs.DESC, obj?.userData?.name, obj?.userData?.canonicalObjectId, obj?.name];
  for (const value of values) {
    const m = SUPPORT_TAG_RX.exec(asText(value));
    if (m) return m[0].replace(/\s+/g, '-');
  }
  const fallback = asText(attrs.CMPSUPREFN || attrs.SUPPORT_TAG || attrs.NAME || obj?.userData?.name || obj?.name || 'SUPPORT').trim();
  return fallback.replace(/^.*\/SUPPORT\s*/i, '').slice(0, 48);
}
function isSupportObject(obj, attrs) {
  const text = supportSearchText(obj, attrs);
  const typeText = String(attrs.TYPE || attrs.RAW_TYPE || obj?.userData?.type || obj?.userData?.kind || '').toUpperCase();
  if (typeText === 'PIPE' || typeText === 'BRANCH') return false;
  return !!(
    resolveKindFromAttrs(attrs) ||
    typeText === 'SUPPORT' ||
    typeText === 'ATTA' ||
    typeText === 'ANCI' ||
    /\bSUPPORT\b|\bATTA\b|\bANCI\b/i.test(text) ||
    SUPPORT_KIND_RX.test(text)
  );
}
function rawPosition(attrs) {
  for (const key of [
    'SUPPORTCOORD', 'SUPPORT_COORD', 'SCOORD', 'SUPPORT_POINT', 'SUPPORT_POS',
    'LBOP', 'LBOS', 'LBOPOS', 'LBOPOINT',
    'POS', 'POSITION', 'COORDS', 'CO_ORDS', 'CO_ORD', 'BPOS', 'BP', 'APOS', 'LPOS'
  ]) {
    const p = normalizeCoord(attrs[key]);
    if (p) return p;
  }
  return null;
}
function hasRenderableGeometry(obj) {
  let count = 0;
  obj.traverse((child) => { if (child.isMesh && !child.userData?.supportSymbol) count += 1; });
  return count > 0;
}
function getSymbolPosition(obj, attrs, viewer) {
  // UXML support parity supplies the engineering support coordinate explicitly.
  // Use it before object-center fallback, otherwise support symbol overlays can
  // drift to the center of the generated support mesh rather than the pipe contact
  // node used by XML->GLB support rendering. Some AVEVA ATTA records store the
  // support point as LBOP/LBOS, so rawPosition intentionally includes those aliases.
  if (String(attrs.UXML_SUPPORT_PARITY || '').toLowerCase() === 'true') {
    const p = rawPosition(attrs);
    if (p) return viewer?.modelGroup ? viewer.modelGroup.localToWorld(p.clone()) : p;
  }
  if (hasRenderableGeometry(obj)) {
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) return box.getCenter(new THREE.Vector3());
  }
  const p = rawPosition(attrs);
  if (!p) return null;
  return viewer?.modelGroup ? viewer.modelGroup.localToWorld(p.clone()) : p;
}
function axisFromName(value) {
  const s = String(value || '').trim().toUpperCase();
  if (['X', '+X', '-X'].includes(s)) return new THREE.Vector3(1, 0, 0);
  if (['Y', '+Y', '-Y'].includes(s)) return new THREE.Vector3(0, 1, 0);
  if (['Z', '+Z', '-Z'].includes(s)) return new THREE.Vector3(0, 0, 1);
  return null;
}
function dominantAxisFromPoints(a, b) {
  if (!a || !b) return null;
  const d = new THREE.Vector3().subVectors(b, a);
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  if (ax >= ay && ax >= az && ax > 1e-9) return new THREE.Vector3(Math.sign(d.x) || 1, 0, 0);
  if (ay >= ax && ay >= az && ay > 1e-9) return new THREE.Vector3(0, Math.sign(d.y) || 1, 0);
  if (az > 1e-9) return new THREE.Vector3(0, 0, Math.sign(d.z) || 1);
  return null;
}
function resolvePipeAxis(attrs, viewer) {
  const explicit = axisFromName(attrs.PIPE_AXIS || attrs.ROUTE_AXIS || attrs.AXIS || attrs.DIRECTION || attrs.DIR);
  if (explicit) return explicit.normalize();
  const apos = rawPosition({ POS: attrs.APOS });
  const lpos = rawPosition({ POS: attrs.LPOS });
  const derived = dominantAxisFromPoints(apos, lpos) || new THREE.Vector3(1, 0, 0);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(viewer?.modelGroup?.matrixWorld || new THREE.Matrix4());
  return derived.applyMatrix3(normalMatrix).normalize();
}
function chooseLateralAxis(pipeAxis, verticalAxis) {
  const cross = new THREE.Vector3().crossVectors(pipeAxis, verticalAxis);
  if (cross.lengthSq() > 1e-8) return cross.normalize();
  return new THREE.Vector3(0, 0, 1);
}
function createMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: true });
}
function colorForKind(kind) {
  return SUPPORT_KIND_COLORS[kind] || SUPPORT_SYMBOL_COLOR;
}
function orientAlongY(mesh, direction) {
  const dir = direction.clone().normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}
function makeArrow(start, end, color, radius) {
  const group = new THREE.Group();
  const v = new THREE.Vector3().subVectors(end, start);
  const len = v.length();
  if (len <= 1e-6) return group;
  const dir = v.clone().normalize();
  const shaftLen = len * 0.72;
  const headLen = len * 0.28;
  const mat = createMaterial(color);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, shaftLen, 12), mat);
  shaft.position.copy(start.clone().add(dir.clone().multiplyScalar(shaftLen * 0.5)));
  orientAlongY(shaft, dir);
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.0, headLen, 16), mat);
  head.position.copy(start.clone().add(dir.clone().multiplyScalar(shaftLen + headLen * 0.5)));
  orientAlongY(head, dir);
  group.add(shaft, head);
  return group;
}
function makePlate(center, lateral, pipeAxis, vertical, size, color) {
  const geo = new THREE.BoxGeometry(size * 1.15, size * 0.14, size * 0.65);
  const mesh = new THREE.Mesh(geo, createMaterial(color, 0.88));
  mesh.position.copy(center.clone().add(vertical.clone().multiplyScalar(-size * 0.12)));
  const basis = new THREE.Matrix4().makeBasis(pipeAxis.clone().normalize(), vertical.clone().normalize(), lateral.clone().normalize());
  mesh.quaternion.setFromRotationMatrix(basis);
  return mesh;
}
function makeStopBlock(center, axis, lateral, vertical, size, color, name = 'STOP_BLOCK') {
  const geo = new THREE.BoxGeometry(size * 0.18, size * 0.72, size * 0.9);
  const mesh = new THREE.Mesh(geo, createMaterial(color, 0.9));
  mesh.name = name;
  mesh.position.copy(center);
  const basis = new THREE.Matrix4().makeBasis(axis.clone().normalize(), vertical.clone().normalize(), lateral.clone().normalize());
  mesh.quaternion.setFromRotationMatrix(basis);
  return mesh;
}
function makeAnchorCube(center, pipeAxis, lateral, vertical, size, color) {
  const geo = new THREE.BoxGeometry(size * 0.45, size * 0.45, size * 0.45);
  const mesh = new THREE.Mesh(geo, createMaterial(color, 0.92));
  mesh.position.copy(center);
  const basis = new THREE.Matrix4().makeBasis(pipeAxis.clone().normalize(), vertical.clone().normalize(), lateral.clone().normalize());
  mesh.quaternion.setFromRotationMatrix(basis);
  return mesh;
}
function addLabel(group, text, at, size, visible, eligible) {
  if (typeof document === 'undefined') return;
  const div = document.createElement('div');
  div.className = 'rvm-support-symbol-label';
  div.textContent = text;
  div.style.cssText = `font:600 10px/1.2 system-ui,sans-serif;padding:2px 6px;border-radius:10px;background:rgba(8,16,28,.82);color:#e8f3ff;border:1px solid rgba(128,190,255,.45);white-space:nowrap;display:${visible && eligible ? 'block' : 'none'};`;
  const label = new CSS2DObject(div);
  label.name = `${group.name}_LABEL`;
  label.userData.supportSymbolLabel = true;
  label.userData.supportSymbolLabelEligible = Boolean(eligible);
  label.position.copy(at.clone().add(new THREE.Vector3(0, size * 0.45, 0)));
  group.add(label);
}
function supportContactMetrics(attrs, scale, opts) {
  const attachedOd = asNumber(attrs.ATTACHED_PIPE_OD || attrs.ATTACHED_PIPE_BORE || attrs.PIPE_OD || attrs.OD || attrs.BORE);
  const gap = Math.max(asNumber(attrs.SUPPORT_GAP_MM ?? attrs.GAP_MM ?? attrs.GAP) || 0, 0);
  const contactRadius = attachedOd && attachedOd > 0 ? attachedOd * 0.5 : Math.max(scale * 0.08, 0.5);
  const belowOffset = attachedOd && attachedOd > 0 ? Math.max(contactRadius + gap, 1) : Math.max(scale * opts.belowPipeFactor, 1);
  const visualLane = attachedOd && attachedOd > 0 ? Math.max(attachedOd * 2 / 3, scale * 0.25) : Math.max(scale * 0.78, 1);
  const plateSize = attachedOd && attachedOd > 0 ? Math.max(attachedOd * 0.68, scale * 0.45) : scale;
  const radius = Math.max(Math.min(contactRadius * 0.16, scale * 0.055), 0.35);
  return { attachedOd, gap, contactRadius, belowOffset, visualLane, plateSize, radius };
}
function labelText(tag, kind) {
  if (!tag) return kind;
  return kind === 'REST' ? tag : `${tag} ${kind}`;
}
function makeLabelState(scale, opts) {
  return {
    count: 0,
    max: Math.max(0, Number(opts.maxVisibleLabels ?? DEFAULTS.maxVisibleLabels) || 0),
    grid: new Set(),
    cell: Math.max(scale * (opts.labelGridFactor || DEFAULTS.labelGridFactor), 120),
  };
}
function labelGridKey(pos, state) {
  const cell = state.cell || 1;
  return `${Math.round(pos.x / cell)}:${Math.round(pos.y / cell)}:${Math.round(pos.z / cell)}`;
}
function shouldShowLabel(kind, tag, pos, state) {
  if (!state || state.max <= 0) return false;
  if (state.count >= state.max) return false;
  const key = labelGridKey(pos, state);
  if (state.grid.has(key)) return false;
  state.grid.add(key);
  state.count += 1;
  return Boolean(tag) || kind !== 'REST';
}
function buildSymbol(kind, position, attrs, obj, scale, viewer, opts) {
  const vertical = new THREE.Vector3(0, 1, 0);
  const pipeAxis = resolvePipeAxis(attrs, viewer);
  const lateral = chooseLateralAxis(pipeAxis, vertical);
  const metrics = supportContactMetrics(attrs, scale, opts);
  const base = position.clone().add(vertical.clone().multiplyScalar(-metrics.belowOffset));
  const target = position.clone().add(vertical.clone().multiplyScalar(-Math.max(metrics.gap, Math.max(metrics.contactRadius * 0.08, 0.5))));
  const group = new THREE.Group();
  const tag = supportTag(obj, attrs);
  group.name = `SUPPORT_SYMBOL_${tag || kind}`;
  group.userData = { supportSymbol: true, supportKind: kind, supportTag: tag, attributes: { ...attrs }, supportParity: attrs.UXML_SUPPORT_PARITY === 'true' ? 'UXML' : 'RVM' };
  const radius = metrics.radius;
  const plateSize = metrics.plateSize;
  const lane = metrics.visualLane;
  const label = labelText(tag, kind);
  const color = colorForKind(kind);
  if (kind === 'REST') {
    group.add(makePlate(base, lateral, pipeAxis, vertical, plateSize, color));
    group.add(makeArrow(base.clone().add(vertical.clone().multiplyScalar(-plateSize * 0.45)), target, color, radius));
  } else if (kind === 'GUIDE') {
    group.add(makePlate(base, lateral, pipeAxis, vertical, plateSize, color));
    group.add(makeStopBlock(base.clone().add(lateral.clone().multiplyScalar(-plateSize * 0.48)), pipeAxis, lateral, vertical, plateSize * 0.82, color, 'GUIDE_BLOCK_MINUS'));
    group.add(makeStopBlock(base.clone().add(lateral.clone().multiplyScalar(plateSize * 0.48)), pipeAxis, lateral, vertical, plateSize * 0.82, color, 'GUIDE_BLOCK_PLUS'));
    group.add(makeArrow(base.clone().add(lateral.clone().multiplyScalar(-lane)), base.clone().add(lateral.clone().multiplyScalar(-Math.max(lane * 0.18, plateSize * 0.16))), color, radius));
    group.add(makeArrow(base.clone().add(lateral.clone().multiplyScalar(lane)), base.clone().add(lateral.clone().multiplyScalar(Math.max(lane * 0.18, plateSize * 0.16))), color, radius));
  } else if (kind === 'LINESTOP' || kind === 'LIMIT') {
    group.add(makePlate(base, lateral, pipeAxis, vertical, plateSize, color));
    group.add(makeStopBlock(base.clone().add(pipeAxis.clone().multiplyScalar(-plateSize * 0.50)), pipeAxis, lateral, vertical, plateSize * 0.95, color, `${kind}_BLOCK_A`));
    group.add(makeStopBlock(base.clone().add(pipeAxis.clone().multiplyScalar(plateSize * 0.50)), pipeAxis, lateral, vertical, plateSize * 0.95, color, `${kind}_BLOCK_B`));
    group.add(makeArrow(base.clone().add(pipeAxis.clone().multiplyScalar(-lane)), base.clone().add(pipeAxis.clone().multiplyScalar(-Math.max(lane * 0.18, plateSize * 0.16))), color, radius));
    group.add(makeArrow(base.clone().add(pipeAxis.clone().multiplyScalar(lane)), base.clone().add(pipeAxis.clone().multiplyScalar(Math.max(lane * 0.18, plateSize * 0.16))), color, radius));
  } else if (kind === 'ANCHOR') {
    group.add(makePlate(base, lateral, pipeAxis, vertical, plateSize, color));
    group.add(makeAnchorCube(base.clone().add(vertical.clone().multiplyScalar(plateSize * 0.18)), pipeAxis, lateral, vertical, plateSize, color));
    group.add(makeArrow(base.clone().add(vertical.clone().multiplyScalar(-plateSize * 0.45)), target, color, radius));
    group.add(makeArrow(base.clone().add(pipeAxis.clone().multiplyScalar(-lane)), base, color, radius));
    group.add(makeArrow(base.clone().add(pipeAxis.clone().multiplyScalar(lane)), base, color, radius));
  } else {
    group.add(makePlate(base, lateral, pipeAxis, vertical, plateSize, color));
  }
  addLabel(group, label, base, scale, opts.labelsVisible, opts.labelEligible !== false);
  return group;
}
function dedupeKey(obj, attrs, pos) {
  const id = obj?.userData?.canonicalObjectId || obj?.userData?.sourceObjectId || obj?.uuid;
  const tag = supportTag(obj, attrs);
  return `${tag || id || 'support'}:${pos.x.toFixed(1)}:${pos.y.toFixed(1)}:${pos.z.toFixed(1)}`.toUpperCase();
}
function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m?.dispose?.());
    }
    if (obj.element?.parentNode) obj.element.parentNode.removeChild(obj.element);
  });
}
export function setRvmSupportSymbolLabelsVisible(viewer, visible) {
  const root = viewer?.scene?.getObjectByName(SUPPORT_SYMBOL_GROUP_NAME);
  if (!root) return;
  root.traverse((obj) => {
    if (obj.userData?.supportSymbolLabel && obj.element) {
      const eligible = obj.userData.supportSymbolLabelEligible !== false;
      obj.element.style.display = visible && eligible ? 'block' : 'none';
    }
  });
}
export function addRvmSupportSymbols(viewer, options = {}) {
  if (!viewer?.modelGroup || !viewer?.scene) return { created: 0, scanned: 0 };
  const opts = {
    ...DEFAULTS,
    ...getRvmSupportSymbolSettings(),
    ...options,
  };

  opts.scaleMultiplier = normalizeRvmSupportSymbolScale(opts.scaleMultiplier);
  const existing = viewer.scene.getObjectByName(SUPPORT_SYMBOL_GROUP_NAME);
  const symbolRoot = new THREE.Group();
  symbolRoot.name = SUPPORT_SYMBOL_GROUP_NAME;
  symbolRoot.userData.supportSymbolRoot = true;
  const modelBox = new THREE.Box3().setFromObject(viewer.modelGroup);
  const size = modelBox.isEmpty() ? new THREE.Vector3(1000, 1000, 1000) : modelBox.getSize(new THREE.Vector3());
  const diag = Math.max(size.length(), 1);
  const rawScale = diag * opts.symbolScaleFactor;
  const baseScale = Math.max(opts.minScale, Math.min(opts.maxScale, rawScale));
  const scale = baseScale * opts.scaleMultiplier;
  const seen = new Set();
  const labelState = makeLabelState(scale, opts);
  let scanned = 0;
  viewer.modelGroup.updateMatrixWorld(true);
  viewer.modelGroup.traverse((obj) => {
    if (!obj || obj.userData?.supportSymbol) return;
    const attrs = getAttrs(obj);
    if (!isSupportObject(obj, attrs)) return;
    const kind = resolveSupportKind(obj, attrs);
    if (!kind) return;
    const pos = getSymbolPosition(obj, attrs, viewer);
    if (!pos) return;
    const key = dedupeKey(obj, attrs, pos);
    if (seen.has(key)) return;
    seen.add(key);
    scanned += 1;
    const tag = supportTag(obj, attrs);
    const labelEligible = shouldShowLabel(kind, tag, pos, labelState);
    symbolRoot.add(buildSymbol(kind, pos, attrs, obj, scale, viewer, { ...opts, labelEligible }));
  });
  const created = symbolRoot.children.length;

  if (created > 0) {
    if (existing) {
      viewer.scene.remove(existing);
      disposeObject(existing);
    }

    viewer.scene.add(symbolRoot);

    return {
      created,
      scanned,
      labelsVisible: opts.labelsVisible,
      labelCount: labelState.count,
      maxVisibleLabels: labelState.max,
      scale,
      scaleMultiplier: opts.scaleMultiplier,
      minScale: opts.minScale,
      maxScale: opts.maxScale,
      preservedExisting: false,
    };
  }

  // Important safety rule:
  // Do not remove existing symbols if rebuild found zero.
  // This prevents support symbols disappearing during scale adjustment.
  disposeObject(symbolRoot);

  if (existing) {
    existing.visible = true;

    return {
      created: existing.children?.length || 0,
      scanned,
      labelsVisible: opts.labelsVisible,
      labelCount: labelState.count,
      maxVisibleLabels: labelState.max,
      scale,
      scaleMultiplier: opts.scaleMultiplier,
      minScale: opts.minScale,
      maxScale: opts.maxScale,
      preservedExisting: true,
      skipped: 'REBUILD_FOUND_ZERO_SUPPORTS_KEPT_EXISTING',
    };
  }

  return {
    created: 0,
    scanned,
    labelsVisible: opts.labelsVisible,
    labelCount: labelState.count,
    maxVisibleLabels: labelState.max,
    scale,
    scaleMultiplier: opts.scaleMultiplier,
    minScale: opts.minScale,
    maxScale: opts.maxScale,
    preservedExisting: false,
    skipped: 'NO_SUPPORT_SYMBOLS_FOUND',
  };
}
export function installRvmSupportSymbolPatch() {
  if (RvmViewer3D.prototype[PATCH_FLAG]) return;
  const originalSetModel = RvmViewer3D.prototype.setModel;
  RvmViewer3D.prototype.setModel = function patchedSetModel(model, upAxis = 'Y') {
    originalSetModel.call(this, model, upAxis);

    this.supportSymbolOptions = {
      ...getRvmSupportSymbolSettings(),
      upAxis,
      labelsVisible: false,
    };

    this.supportSymbolDiagnostics = addRvmSupportSymbols(this, this.supportSymbolOptions);
  };
  RvmViewer3D.prototype.setSupportSymbolLabelsVisible = function setSupportSymbolLabelsVisible(visible) {
    setRvmSupportSymbolLabelsVisible(this, visible);
  };
  RvmViewer3D.prototype.setSupportSymbolOptions = function setSupportSymbolOptions(options = {}) {
    this.supportSymbolOptions = {
      ...(this.supportSymbolOptions || {}),
      ...getRvmSupportSymbolSettings(),
      ...options,
    };

    this.supportSymbolOptions.scaleMultiplier = normalizeRvmSupportSymbolScale(
      this.supportSymbolOptions.scaleMultiplier
    );

    this.supportSymbolDiagnostics = addRvmSupportSymbols(this, this.supportSymbolOptions);

    return this.supportSymbolDiagnostics;
  };
  RvmViewer3D.prototype[PATCH_FLAG] = true;
}
installRvmSupportSymbolPatch();
