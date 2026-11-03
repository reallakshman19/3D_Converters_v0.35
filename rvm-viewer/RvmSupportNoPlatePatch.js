import { RvmViewer3D } from './RvmViewer3D.js';

const PATCHED = Symbol.for('pcf-glb-rvm-support-no-plate-patched');
const ROOT_NAME = '__RVM_SUPPORT_SYMBOLS__';

function isPlateMesh(obj) {
  if (!obj?.isMesh || !obj.geometry) return false;
  const type = String(obj.geometry.type || '');
  if (type !== 'BoxGeometry' && type !== 'BoxBufferGeometry') return false;
  const p = obj.geometry.parameters || {};
  const w = Number(p.width || 0);
  const h = Number(p.height || 0);
  const d = Number(p.depth || 0);
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(d)) return true;
  if (w <= 0 || h <= 0 || d <= 0) return true;
  // Support overlay plates are intentionally flat rectangular boxes.
  // Arrows use CylinderGeometry/ConeGeometry, so removing flat boxes leaves arrows only.
  return h <= Math.min(w, d) * 0.35;
}

function disposeMesh(mesh) {
  mesh.geometry?.dispose?.();
  if (mesh.material) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => mat?.dispose?.());
  }
}

export function removeRvmSupportSymbolPlates(viewer) {
  const root = viewer?.scene?.getObjectByName(ROOT_NAME);
  if (!root) return { removed: 0 };
  const remove = [];
  root.traverse((obj) => {
    if (isPlateMesh(obj)) remove.push(obj);
  });
  for (const obj of remove) {
    obj.parent?.remove?.(obj);
    disposeMesh(obj);
  }
  return { removed: remove.length };
}

function wrapRefresh(proto, name) {
  const previous = proto[name];
  if (typeof previous !== 'function') return;
  proto[name] = function wrappedSupportRefreshNoPlates(...args) {
    const result = previous.apply(this, args);
    const cleanup = removeRvmSupportSymbolPlates(this);
    this.supportSymbolNoPlateDiagnostics = cleanup;
    return result;
  };
}

export function installRvmSupportNoPlatePatch() {
  const proto = RvmViewer3D.prototype;
  if (proto[PATCHED]) return;
  const previousSetModel = proto.setModel;
  proto.setModel = function setModelWithoutSupportPlates(...args) {
    const result = previousSetModel.apply(this, args);
    const cleanup = removeRvmSupportSymbolPlates(this);
    this.supportSymbolNoPlateDiagnostics = cleanup;
    return result;
  };
  wrapRefresh(proto, 'refreshSupportSymbols');
  wrapRefresh(proto, 'refreshSupportSymbolsFromSource');
  proto[PATCHED] = true;
}

installRvmSupportNoPlatePatch();
