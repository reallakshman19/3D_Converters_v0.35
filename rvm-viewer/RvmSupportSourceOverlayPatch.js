import * as THREE from 'three';
import { RuntimeEvents } from '../contracts/runtime-events.js';
import { on } from '../core/event-bus.js';
import { RvmViewer3D } from './RvmViewer3D.js?v=20260518-statusbar-theme-12';
import { getRvmSupportSymbolSettings } from './RvmSupportSymbols.js?v=20260518-support-mapper-11';
import { resolveKindFromAttrs } from './RvmSupportMapper.js?v=20260518-support-mapper-11';

const PATCHED = Symbol.for('pcf-glb-rvm-support-source-overlay-patched');
const ROOT = '__RVM_SUPPORT_SYMBOLS__';
const SUPPORT_KIND = /\b(GUIDE|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|LIMIT|RESTING|REST|SHOE|BP|BASE\s*PLATE|ANCHOR|FIXED|STOPPER|STOP)\b/i;
const SUPPORT_TAG = /\bPS[-_\s]?[A-Z0-9][A-Z0-9._/\-]*\b/i;
const BORE_KEYS = ['OUTSIDE_DIAMETER', 'OUTSIDEDIAMETER', 'OD', 'HBOR', 'TBOR', 'ABORE', 'LBORE', 'BORE', 'NBORE', 'DBOR'];
const SUPPORT_SYMBOL_COLOR = 0x60c864;
let lastAvevaHierarchy = null;

function s(v) { return v === undefined || v === null ? '' : String(v); }
function n(v) { const x = Number.parseFloat(s(v).replace(/mm/gi, '').trim()); return Number.isFinite(x) ? x : null; }
function p(v) {
  if (!v && v !== 0) return null;
  if (Array.isArray(v) && v.length >= 3) {
    const x = n(v[0]), y = n(v[1]), z = n(v[2]);
    return x === null || y === null || z === null ? null : new THREE.Vector3(x, y, z);
  }
  if (typeof v === 'object') {
    const x = n(v.x ?? v.X), y = n(v.y ?? v.Y), z = n(v.z ?? v.Z);
    return x === null || y === null || z === null ? null : new THREE.Vector3(x, y, z);
  }
  const t = s(v).trim();
  const parts = t.split(/\s+/g);
  const out = new THREE.Vector3(0, 0, 0); let directional = false;
  for (let i = 0; i < parts.length - 1; i += 2) {
    const a = parts[i].toUpperCase(); const val = n(parts[i + 1]);
    if (val === null) continue;
    if (a === 'E') { out.x = val; directional = true; }
    else if (a === 'W') { out.x = -val; directional = true; }
    else if (a === 'N') { out.y = val; directional = true; }
    else if (a === 'S') { out.y = -val; directional = true; }
    else if (a === 'U') { out.z = val; directional = true; }
    else if (a === 'D') { out.z = -val; directional = true; }
  }
  if (directional) return out;
  const vals = t.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return vals.length >= 3 ? new THREE.Vector3(vals[0], vals[1], vals[2]) : null;
}
function attrs(o) { return { ...(o?.attributes || {}), ...(o?.attrs || {}), ...(o?.rawAttributes || {}) }; }
function txt(o, a) {
  return [o?.type, o?.kind, o?.name, o?.path, o?.id, a.TYPE, a.STYP, a.DTXR, a.SUPPORT_TYPE, a.CMPSUPTYPE, a.MDSSUPPTYPE, a.CMPSUPREFN, a.SUPPORT_TAG, a.NAME, a.TAG, a.TAGNO, a.SKEY, a.SPRE, a.DESCRIPTION, a.DESC].map(s).join(' ');
}
function kind(t) {
  const u = t.toUpperCase();
  if (/\bGUIDE\b/.test(u)) return 'GUIDE';
  if (/\bLINE\s*STOP\b|\bLINESTOP\b|\bSTOPPER\b|\bSTOP\b/.test(u)) return 'LINESTOP';
  if (/\bLIMIT\s*STOP\b|\bLIMIT\b/.test(u)) return 'LIMIT';
  if (/\bRESTING\b|\bREST\b|\bSHOE\b|\bBASE\s*PLATE\b/.test(u)) return 'REST';
  if (/\bANCHOR\b|\bFIXED\b/.test(u)) return 'ANCHOR';
  // Match CMPSUPTYPE/MDSSUPPTYPE code prefixes: PG-*→GUIDE, LS-*→LINESTOP, G-*→GUIDE, AN*→ANCHOR, BP-*→REST
  if (/\bPG[-_]/.test(u)) return 'GUIDE';
  if (/\bLS[-_]/.test(u)) return 'LINESTOP';
  if (/\bG[-_]\d/.test(u)) return 'GUIDE';
  if (/\bAN\d/.test(u)) return 'ANCHOR';
  if (/\bBP[-_]/.test(u)) return 'REST';
  if (/\bGT\d/.test(u)) return 'GUIDE';
  if (/\bBT\d/.test(u)) return 'REST';
  if (/\bWP[-_]/.test(u)) return 'LINESTOP';
  return '';
}
function tag(o, a) {
  for (const v of [a.SUPPORT_TAG, a.CMPSUPREFN, a.NAME, a.TAG, a.TAGNO, a.REF, a.REFNO, a.DBREF, a.SKEY, a.SPRE, a.DESCRIPTION, a.DESC, o?.name, o?.id]) {
    const m = SUPPORT_TAG.exec(s(v));
    if (m) return m[0].replace(/\s+/g, '-');
  }
  return s(a.CMPSUPREFN || a.SUPPORT_TAG || a.NAME || o?.name || o?.id || 'SUPPORT').slice(0, 48);
}
function coord(a) {
  for (const key of ['SUPPORTCOORD', 'SUPPORT_COORD', 'SCOORD', 'POS', 'POSITION', 'COORDS', 'CO_ORDS', 'CO_ORD', 'BPOS', 'BP', 'APOS', 'LPOS']) {
    const pt = p(a[key]); if (pt) return pt;
  }
  return null;
}
function bore(a) {
  for (const k of BORE_KEYS) { const d = n(a[k]); if (d && d > 0) return d; }
  if (a.DTXR && !SUPPORT_KIND.test(s(a.DTXR))) { const d = n(a.DTXR); if (d && d > 0) return d; }
  return 0;
}
function pipeAxis(a, viewer) {
  const ap = p(a.APOS), lp = p(a.LPOS); let v = new THREE.Vector3(1, 0, 0);
  if (ap && lp) { const d = new THREE.Vector3().subVectors(lp, ap); if (d.lengthSq() > 1e-9) v = d.normalize(); }
  return v.applyMatrix3(new THREE.Matrix3().getNormalMatrix(viewer.modelGroup.matrixWorld || new THREE.Matrix4())).normalize();
}
function collect(root, out = []) {
  const roots = Array.isArray(root) ? root : [root];
  for (const o of roots) {
    if (!o || typeof o !== 'object') continue;
    const a = attrs(o); const t = txt(o, a); const type = s(o.type || a.TYPE).toUpperCase();
    const mappedKind = resolveKindFromAttrs(a);
    if (type !== 'PIPE' && type !== 'BRANCH' && (mappedKind || /\bSUPPORT\b|\bATTA\b|\bANCI\b/i.test(t) || SUPPORT_KIND.test(t))) {
      const k = mappedKind || kind(t) || kind(s(a.CMPSUPTYPE) + ' ' + s(a.MDSSUPPTYPE) + ' ' + s(a.SUPPORT_TYPE)); const c = coord(a);
      if (k && c) out.push({ source: o, attrs: a, kind: k, local: c, tag: tag(o, a), bore: bore(a) });
    }
    if (Array.isArray(o.children)) collect(o.children, out);
    if (Array.isArray(o.items)) collect(o.items, out);
    if (Array.isArray(o.branches)) collect(o.branches, out);
  }
  return out;
}
function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
    if (o.element?.parentNode) o.element.parentNode.removeChild(o.element);
  });
}
function mat(color) { return new THREE.MeshBasicMaterial({ color, depthTest: true }); }
function orient(m, d) { m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); }
function arrow(a, b, color, r) {
  const g = new THREE.Group(); const v = new THREE.Vector3().subVectors(b, a); const len = v.length();
  if (len <= 1e-6) return g; const d = v.clone().normalize(); const sl = len * 0.72; const hl = len * 0.28;
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, sl, 10), mat(color)); sh.position.copy(a.clone().add(d.clone().multiplyScalar(sl / 2))); orient(sh, d);
  const hd = new THREE.Mesh(new THREE.ConeGeometry(r * 3, hl, 12), mat(color)); hd.position.copy(a.clone().add(d.clone().multiplyScalar(sl + hl / 2))); orient(hd, d);
  g.add(sh, hd); return g;
}
function supportObject(item, viewer, scale) {
  const up = new THREE.Vector3(0, 1, 0); const axis = pipeAxis(item.attrs, viewer); let side = new THREE.Vector3().crossVectors(axis, up);
  if (side.lengthSq() <= 1e-9) side = new THREE.Vector3(0, 0, 1); else side.normalize();
  const supportWorld = viewer.modelGroup.localToWorld(item.local.clone());
  const offset = (item.bore > 0 ? item.bore / 2 : 0) + Math.max(scale * 0.18, 4);
  const target = supportWorld.clone().add(up.clone().multiplyScalar(-offset));
  const base = target.clone().add(up.clone().multiplyScalar(-Math.max(scale * 0.82, 1)));
  const color = SUPPORT_SYMBOL_COLOR;
  const g = new THREE.Group(); g.name = `SUPPORT_SYMBOL_${item.tag}_${item.kind}`;
  g.userData = { supportSymbol: true, supportKind: item.kind, supportTag: item.tag, attributes: { ...item.attrs }, supportCoordinate: supportWorld.clone(), boreDiameter: item.bore };
  const r = Math.max(scale * 0.025, 0.35);
  if (item.kind === 'REST') g.add(arrow(base.clone().add(up.clone().multiplyScalar(-scale * 0.3)), target, color, r));
  else if (item.kind === 'GUIDE') { g.add(arrow(base.clone().add(side.clone().multiplyScalar(-scale * 0.78)), base.clone().add(side.clone().multiplyScalar(-scale * 0.14)), color, r)); g.add(arrow(base.clone().add(side.clone().multiplyScalar(scale * 0.78)), base.clone().add(side.clone().multiplyScalar(scale * 0.14)), color, r)); }
  else if (item.kind === 'LINESTOP' || item.kind === 'LIMIT') { g.add(arrow(base.clone().add(axis.clone().multiplyScalar(-scale * 0.82)), base.clone().add(axis.clone().multiplyScalar(-scale * 0.14)), color, r)); g.add(arrow(base.clone().add(axis.clone().multiplyScalar(scale * 0.82)), base.clone().add(axis.clone().multiplyScalar(scale * 0.14)), color, r)); }
  else if (item.kind === 'ANCHOR') { g.add(arrow(base.clone().add(up.clone().multiplyScalar(-scale * 0.3)), target, color, r)); g.add(arrow(base.clone().add(axis.clone().multiplyScalar(-scale * 0.78)), base, color, r)); g.add(arrow(base.clone().add(axis.clone().multiplyScalar(scale * 0.78)), base, color, r)); }
  return g;
}
function overlay(viewer) {
  const supports = collect(lastAvevaHierarchy);
  if (!supports.length || !viewer?.scene || !viewer?.modelGroup) return { created: 0, sourceSupports: 0 };
  const old = viewer.scene.getObjectByName(ROOT); if (old) { viewer.scene.remove(old); dispose(old); }
  viewer.modelGroup.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(viewer.modelGroup);
  const diag = box.isEmpty() ? 1000 : Math.max(box.getSize(new THREE.Vector3()).length(), 1); const { scaleMultiplier } = getRvmSupportSymbolSettings(); const scale = Math.max(8, Math.min(120, diag * 0.0035)) * (Number.isFinite(scaleMultiplier) ? scaleMultiplier : 1);
  const root = new THREE.Group(); root.name = ROOT; const seen = new Set();
  for (const item of supports) { const key = `${item.tag}:${item.kind}:${item.local.x.toFixed(1)}:${item.local.y.toFixed(1)}:${item.local.z.toFixed(1)}`.toUpperCase(); if (seen.has(key)) continue; seen.add(key); root.add(supportObject(item, viewer, scale)); }
  if (root.children.length) viewer.scene.add(root);
  return { created: root.children.length, sourceSupports: supports.length, placement: 'source-hierarchy-support-coordinate-bore-offset-no-plate' };
}

on(RuntimeEvents.FILE_LOADED, (payload) => { if (payload?.source === 'rvm-tab' && payload?.kind === 'aveva-json') lastAvevaHierarchy = payload.payload; });

export function installRvmSupportSourceOverlayPatch() {
  if (RvmViewer3D.prototype[PATCHED]) return;
  const prev = RvmViewer3D.prototype.setModel;
  RvmViewer3D.prototype.setModel = function setModelWithSourceSupportOverlay(model, upAxis = 'Y') {
    prev.call(this, model, upAxis);
    const result = overlay(this);
    if (result.sourceSupports) this.supportSymbolDiagnostics = result;
  };
  RvmViewer3D.prototype.refreshSupportSymbolsFromSource = function refreshSupportSymbolsFromSource() { this.supportSymbolDiagnostics = overlay(this); };
  RvmViewer3D.prototype.setSupportSymbolOptions = function setSupportSymbolOptions(options = {}) {
    this.supportSymbolOptions = { ...(this.supportSymbolOptions || {}), ...options };
    // Try source-overlay rebuild (uses stored scaleMultiplier via getRvmSupportSymbolSettings).
    const fromSource = overlay(this);
    if (fromSource.created > 0) { this.supportSymbolDiagnostics = fromSource; return fromSource; }
    // Fall back to bore-anchor rebuild if source has no data.
    if (typeof this.refreshSupportSymbols === 'function') {
      this.supportSymbolDiagnostics = this.refreshSupportSymbols() || this.supportSymbolDiagnostics;
    }
    return this.supportSymbolDiagnostics || { created: 0 };
  };
  RvmViewer3D.prototype[PATCHED] = true;
}

installRvmSupportSourceOverlayPatch();
