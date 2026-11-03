import * as THREE from 'three';
import { RvmViewer3D } from './RvmViewer3D.js?v=20260518-statusbar-theme-12';
import { getRvmSupportSymbolSettings } from './RvmSupportSymbols.js?v=20260518-support-mapper-11';
import { resolveKindFromAttrs } from './RvmSupportMapper.js?v=20260518-support-mapper-11';

const ROOT_NAME = '__RVM_SUPPORT_SYMBOLS__';
const PATCHED = Symbol.for('pcf-glb-rvm-support-bore-anchor-patched');
const SUPPORT_RX = /\b(GUIDE|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|RESTING|REST|SHOE|BP|ANCHOR|FIXED|STOPPER|STOP)\b/i;
const TAG_RX = /\bPS[-_\s]?[A-Z0-9][A-Z0-9._/\-]*\b/i;
const BORE_KEYS = ['OUTSIDE_DIAMETER', 'OUTSIDEDIAMETER', 'OD', 'HBOR', 'TBOR', 'ABORE', 'LBORE', 'BORE', 'NBORE', 'DBOR'];
const SUPPORT_SYMBOL_COLOR = 0x60c864;

const str = (v) => (v === undefined || v === null ? '' : String(v));
const num = (v) => {
  const n = Number.parseFloat(str(v).replace(/mm/gi, '').trim());
  return Number.isFinite(n) ? n : null;
};

function coord(v) {
  if (!v && v !== 0) return null;
  if (Array.isArray(v) && v.length >= 3) {
    const x = num(v[0]), y = num(v[1]), z = num(v[2]);
    return x === null || y === null || z === null ? null : new THREE.Vector3(x, y, z);
  }
  if (typeof v === 'object') {
    const x = num(v.x ?? v.X), y = num(v.y ?? v.Y), z = num(v.z ?? v.Z);
    return x === null || y === null || z === null ? null : new THREE.Vector3(x, y, z);
  }
  const parts = str(v).trim().split(/\s+/g);
  const p = new THREE.Vector3();
  let ok = false;
  for (let i = 0; i < parts.length - 1; i += 2) {
    const axis = parts[i].toUpperCase();
    const n = num(parts[i + 1]);
    if (n === null) continue;
    if (axis === 'E') { p.x = n; ok = true; }
    if (axis === 'W') { p.x = -n; ok = true; }
    if (axis === 'N') { p.y = n; ok = true; }
    if (axis === 'S') { p.y = -n; ok = true; }
    if (axis === 'U') { p.z = n; ok = true; }
    if (axis === 'D') { p.z = -n; ok = true; }
  }
  if (ok) return p;
  const vals = str(v).match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return vals.length >= 3 ? new THREE.Vector3(vals[0], vals[1], vals[2]) : null;
}

function attrs(o) {
  const out = {};
  for (const src of [o?.userData, o?.userData?.attributes, o?.userData?.rawAttributes, o?.userData?.sourceAttributes, o?.attributes]) {
    if (!src || typeof src !== 'object') continue;
    for (const [k, v] of Object.entries(src)) if (v !== undefined && v !== null && out[k] === undefined) out[k] = v;
  }
  return out;
}

function text(o, a) {
  return [o?.name, o?.userData?.name, o?.userData?.type, a.TYPE, a.DTXR, a.SUPPORT_TYPE, a.CMPSUPTYPE, a.CMPSUPREFN, a.NAME, a.TAG, a.SKEY, a.SPRE, a.DESCRIPTION, a.DESC].map(str).join(' ');
}

function kindFrom(t) {
  const s = t.toUpperCase();
  if (/\bGUIDE\b/.test(s)) return 'GUIDE';
  if (/\bLINE\s*STOP\b|\bLINESTOP\b|\bSTOPPER\b|\bSTOP\b/.test(s)) return 'LINESTOP';
  if (/\bLIMIT\s*STOP\b|\bLIMIT\b/.test(s)) return 'LIMIT';
  if (/\bRESTING\b|\bREST\b|\bSHOE\b/.test(s)) return 'REST';
  if (/\bANCHOR\b|\bFIXED\b/.test(s)) return 'ANCHOR';
  // CMPSUPTYPE/MDSSUPPTYPE code prefixes
  if (/\bPG[-_]/.test(s)) return 'GUIDE';
  if (/\bLS[-_]/.test(s)) return 'LINESTOP';
  if (/\bG[-_]\d/.test(s)) return 'GUIDE';
  if (/\bAN\d/.test(s)) return 'ANCHOR';
  if (/\bBP[-_]/.test(s)) return 'REST';
  if (/\bGT\d/.test(s)) return 'GUIDE';
  if (/\bBT\d/.test(s)) return 'REST';
  if (/\bWP[-_]/.test(s)) return 'LINESTOP';
  return '';
}

function supportTag(o, a) {
  for (const v of [a.SUPPORT_TAG, a.CMPSUPREFN, a.NAME, a.TAG, a.TAGNO, a.REF, a.DBREF, a.SKEY, a.SPRE, a.DESCRIPTION, a.DESC, o?.name]) {
    const m = TAG_RX.exec(str(v));
    if (m) return m[0].replace(/\s+/g, '-');
  }
  return str(a.CMPSUPREFN || a.SUPPORT_TAG || a.NAME || o?.name || 'SUPPORT').slice(0, 48);
}

function supportCoordinate(a, viewer) {
  for (const key of ['SUPPORTCOORD', 'SUPPORT_COORD', 'SCOORD', 'POS', 'POSITION', 'COORDS', 'CO_ORDS', 'CO_ORD', 'BPOS', 'BP']) {
    const p = coord(a[key]);
    if (p) return viewer.modelGroup.localToWorld(p.clone());
  }
  return null;
}

function bore(a) {
  for (const k of BORE_KEYS) {
    const d = num(a[k]);
    if (d && d > 0) return d;
  }
  if (a.DTXR && !SUPPORT_RX.test(str(a.DTXR))) {
    const d = num(a.DTXR);
    if (d && d > 0) return d;
  }
  return 0;
}

function axisFrom(a, viewer) {
  const ap = coord(a.APOS), lp = coord(a.LPOS);
  let local = new THREE.Vector3(1, 0, 0);
  if (ap && lp) {
    const d = new THREE.Vector3().subVectors(lp, ap);
    if (d.lengthSq() > 1e-9) local = d.normalize();
  }
  const normal = new THREE.Matrix3().getNormalMatrix(viewer.modelGroup.matrixWorld || new THREE.Matrix4());
  return local.applyMatrix3(normal).normalize();
}

function lateral(axis, vertical) {
  const v = new THREE.Vector3().crossVectors(axis, vertical);
  return v.lengthSq() > 1e-9 ? v.normalize() : new THREE.Vector3(0, 0, 1);
}

function mat(color) { return new THREE.MeshBasicMaterial({ color, transparent: false, depthTest: true }); }
function orient(mesh, dir) { mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); }
function arrow(a, b, color, r) {
  const g = new THREE.Group();
  const v = new THREE.Vector3().subVectors(b, a); const len = v.length();
  if (len <= 1e-6) return g;
  const dir = v.clone().normalize();
  const shaftLen = len * 0.72, headLen = len * 0.28;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, shaftLen, 10), mat(color));
  shaft.position.copy(a.clone().add(dir.clone().multiplyScalar(shaftLen / 2))); orient(shaft, dir);
  const head = new THREE.Mesh(new THREE.ConeGeometry(r * 3, headLen, 12), mat(color));
  head.position.copy(a.clone().add(dir.clone().multiplyScalar(shaftLen + headLen / 2))); orient(head, dir);
  g.add(shaft, head); return g;
}
function plate(c, side, pipe, up, s, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(s * 1.15, s * 0.14, s * 0.65), mat(color));
  m.position.copy(c);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(pipe.clone().normalize(), up.clone().normalize(), side.clone().normalize()));
  return m;
}

function symbol(o, a, viewer, scale) {
  const k = resolveKindFromAttrs(a) || kindFrom(text(o, a));
  if (!k) return null;
  const p = supportCoordinate(a, viewer);
  if (!p) return null;
  const up = new THREE.Vector3(0, 1, 0);
  const pipe = axisFrom(a, viewer);
  const side = lateral(pipe, up);
  const d = bore(a);
  const target = p.clone().add(up.clone().multiplyScalar(-(d > 0 ? d / 2 : 0) - Math.max(scale * 0.18, 4)));
  const base = target.clone().add(up.clone().multiplyScalar(-Math.max(scale * 0.82, 1)));
  const tag = supportTag(o, a);
  const g = new THREE.Group();
  g.name = `SUPPORT_SYMBOL_${tag}_${k}`;
  g.userData = { supportSymbol: true, supportKind: k, supportTag: tag, attributes: { ...a }, supportCoordinate: p.clone(), boreDiameter: d };
  const r = Math.max(scale * 0.025, 0.35);
  const color = SUPPORT_SYMBOL_COLOR;
  g.add(plate(base, side, pipe, up, scale, color));
  if (k === 'REST') g.add(arrow(base.clone().add(up.clone().multiplyScalar(-scale * 0.3)), target, color, r));
  else if (k === 'GUIDE') {
    g.add(arrow(base.clone().add(side.clone().multiplyScalar(-scale * 0.78)), base.clone().add(side.clone().multiplyScalar(-scale * 0.14)), color, r));
    g.add(arrow(base.clone().add(side.clone().multiplyScalar(scale * 0.78)), base.clone().add(side.clone().multiplyScalar(scale * 0.14)), color, r));
  } else if (k === 'LINESTOP' || k === 'LIMIT') {
    g.add(arrow(base.clone().add(pipe.clone().multiplyScalar(-scale * 0.82)), base.clone().add(pipe.clone().multiplyScalar(-scale * 0.14)), color, r));
    g.add(arrow(base.clone().add(pipe.clone().multiplyScalar(scale * 0.82)), base.clone().add(pipe.clone().multiplyScalar(scale * 0.14)), color, r));
  } else if (k === 'ANCHOR') {
    g.add(arrow(base.clone().add(up.clone().multiplyScalar(-scale * 0.3)), target, color, r));
    g.add(arrow(base.clone().add(pipe.clone().multiplyScalar(-scale * 0.78)), base, color, r));
    g.add(arrow(base.clone().add(pipe.clone().multiplyScalar(scale * 0.78)), base, color, r));
  }
  return g;
}

function dispose(root) {
  root.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.()); if (o.element?.parentNode) o.element.parentNode.removeChild(o.element); });
}

function addBoreAnchoredSupportSymbols(viewer) {
  if (!viewer?.scene || !viewer?.modelGroup) return { created: 0 };
  viewer.modelGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(viewer.modelGroup);
  const diag = box.isEmpty() ? 1000 : Math.max(box.getSize(new THREE.Vector3()).length(), 1);
  const { scaleMultiplier } = getRvmSupportSymbolSettings();
  const scale = Math.max(8, Math.min(120, diag * 0.0035)) * (Number.isFinite(scaleMultiplier) ? scaleMultiplier : 1);
  const root = new THREE.Group(); root.name = ROOT_NAME;
  const seen = new Set();
  viewer.modelGroup.traverse((o) => {
    if (!o || o.userData?.supportSymbol) return;
    const a = attrs(o);
    const t = text(o, a);
    const type = str(a.TYPE || o.userData?.type || o.userData?.kind).toUpperCase();
    if ((type === 'PIPE' || type === 'BRANCH') || !(resolveKindFromAttrs(a) || /\bSUPPORT\b|\bATTA\b|\bANCI\b/i.test(t) || SUPPORT_RX.test(t))) return;
    const s = symbol(o, a, viewer, scale);
    if (!s) return;
    const key = `${s.userData.supportTag}:${s.userData.supportKind}:${s.userData.supportCoordinate.x.toFixed(1)}:${s.userData.supportCoordinate.y.toFixed(1)}:${s.userData.supportCoordinate.z.toFixed(1)}`.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key); root.add(s);
  });
  if (root.children.length) {
    // Replace existing only when new ones are found.
    const old = viewer.scene.getObjectByName(ROOT_NAME);
    if (old) { viewer.scene.remove(old); dispose(old); }
    viewer.scene.add(root);
    return { created: root.children.length, placement: 'support-coordinate+bore-offset', labelsVisible: false };
  }
  // Safety rule: keep existing if traversal found 0 to avoid wiping source-overlay symbols.
  dispose(root);
  const existing = viewer.scene.getObjectByName(ROOT_NAME);
  if (existing) { existing.visible = true; return { created: existing.children?.length || 0, preservedExisting: true }; }
  return { created: 0, placement: 'support-coordinate+bore-offset', labelsVisible: false };
}

export function installRvmSupportBoreAnchorPatch() {
  if (RvmViewer3D.prototype[PATCHED]) return;
  const previous = RvmViewer3D.prototype.setModel;
  RvmViewer3D.prototype.setModel = function setModelWithBoreAnchoredSupports(model, upAxis = 'Y') {
    previous.call(this, model, upAxis);
    this.supportSymbolDiagnostics = addBoreAnchoredSupportSymbols(this);
  };
  RvmViewer3D.prototype.refreshSupportSymbols = function refreshSupportSymbols() {
    this.supportSymbolDiagnostics = addBoreAnchoredSupportSymbols(this);
  };
  RvmViewer3D.prototype.setSupportSymbolLabelsVisible = function setSupportSymbolLabelsVisible() {
    // Labels are intentionally disabled for support symbols; use selection/attributes for details.
  };
  RvmViewer3D.prototype[PATCHED] = true;
}

installRvmSupportBoreAnchorPatch();
