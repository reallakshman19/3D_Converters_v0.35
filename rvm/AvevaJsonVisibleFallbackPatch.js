import * as THREE from 'three';
import { AvevaJsonLoader } from './AvevaJsonLoader.js';

const FLAG = '__AVEVA_JSON_VISIBLE_FALLBACK_PATCHED__';
const MAX_FALLBACK_OBJECTS = 6000;

function attrsOf(node) {
  return node && typeof node === 'object' && node.attributes && typeof node.attributes === 'object'
    ? node.attributes
    : {};
}

function asNumber(value) {
  const n = Number.parseFloat(String(value ?? '').replace(/mm/gi, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseDirectional(text) {
  const src = String(text || '').trim();
  if (!src) return null;
  const tokens = src.split(/\s+/g);
  const out = { x: 0, y: 0, z: 0 };
  let parsed = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = String(tokens[i] || '').toUpperCase();
    const value = asNumber(tokens[i + 1]);
    if (value == null) continue;
    if (axis === 'E') { out.x = value; parsed = true; }
    else if (axis === 'W') { out.x = -value; parsed = true; }
    else if (axis === 'N') { out.y = value; parsed = true; }
    else if (axis === 'S') { out.y = -value; parsed = true; }
    else if (axis === 'U') { out.z = value; parsed = true; }
    else if (axis === 'D') { out.z = -value; parsed = true; }
  }
  return parsed ? out : null;
}

function pointFrom(value) {
  if (!value && value !== 0) return null;
  if (Array.isArray(value) && value.length >= 3) {
    const x = asNumber(value[0]);
    const y = asNumber(value[1]);
    const z = asNumber(value[2]);
    return x == null || y == null || z == null ? null : { x, y, z };
  }
  if (typeof value === 'object') {
    const x = asNumber(value.x ?? value.X ?? value.e ?? value.E);
    const y = asNumber(value.y ?? value.Y ?? value.n ?? value.N);
    const z = asNumber(value.z ?? value.Z ?? value.u ?? value.U);
    return x == null || y == null || z == null ? null : { x, y, z };
  }
  const directional = parseDirectional(value);
  if (directional) return directional;
  const nums = String(value || '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number).filter(Number.isFinite) || [];
  return nums.length >= 3 ? { x: nums[0], y: nums[1], z: nums[2] } : null;
}

function pickPoint(node, keys) {
  const attrs = attrsOf(node);
  for (const key of keys) {
    const value = attrs[key] ?? attrs[key.toLowerCase?.()] ?? node?.[key] ?? node?.[key.toLowerCase?.()];
    const point = pointFrom(value);
    if (point) return point;
  }
  return null;
}

function nodeType(node) {
  const raw = String(node?.type || attrsOf(node).TYPE || '').toUpperCase();
  if (raw === 'VALV') return 'VALVE';
  if (raw === 'FLAN') return 'FLANGE';
  if (raw === 'ELBO') return 'ELBOW';
  if (raw === 'REDU') return 'REDUCER';
  if (raw === 'BRAN') return 'BRANCH';
  if (raw === 'ATTA' || raw === 'ANCI' || raw === 'SUPP' || raw === 'SUPC') return 'SUPPORT';
  return raw || 'UNKNOWN';
}

function colorFor(type) {
  if (type === 'PIPE') return 0x3d74c5;
  if (type === 'VALVE') return 0xcc2222;
  if (type === 'FLANGE') return 0x9a9a9a;
  if (type === 'ELBOW' || type === 'BEND') return 0xaa55aa;
  if (type === 'TEE' || type === 'OLET') return 0x55aa55;
  if (type === 'REDUCER') return 0x8f8f8f;
  if (type === 'SUPPORT') return 0x2a9fd6;
  if (type === 'BRANCH') return 0x446688;
  return 0x73b9ff;
}

function toVec(point) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function pointDistance(a, b) {
  if (!a || !b) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function median(values) {
  const list = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  return list.length ? list[Math.floor(list.length * 0.5)] : 100;
}

function collectRenderableCandidates(rootNodes) {
  const candidates = [];
  const lengths = [];
  const walk = (node, parentPath = '') => {
    if (!node || typeof node !== 'object') return;
    const name = String(node.name || node.id || attrsOf(node).NAME || 'Node').trim() || 'Node';
    const path = parentPath ? `${parentPath}/${name}` : name;
    const type = nodeType(node);
    const start = pickPoint(node, ['APOS', 'A_POS', 'HPOS', 'H_POS', 'START', 'EP1', 'ABOP']);
    const end = pickPoint(node, ['LPOS', 'L_POS', 'TPOS', 'T_POS', 'END', 'EP2', 'LBOP']);
    const pos = pickPoint(node, ['POS', 'CPOS', 'CO_ORDS', 'COORDS', 'CO_ORD', 'BPOS', 'BRANCH_POINT']);
    if (start && end && pointDistance(start, end) > 0.001) {
      const len = pointDistance(start, end);
      lengths.push(len);
      candidates.push({ path, type, start, end, pos });
    } else if (pos || start || end) {
      candidates.push({ path, type, pos: pos || start || end });
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) walk(child, path);
  };
  for (const root of rootNodes) walk(root, '');
  return { candidates, radiusBasis: median(lengths) };
}

function createCylinder(start, end, radius, color) {
  const a = toVec(start);
  const b = toVec(end);
  const diff = new THREE.Vector3().subVectors(b, a);
  const length = diff.length();
  if (!Number.isFinite(length) || length < 0.001) return null;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.08 })
  );
  mesh.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
  return mesh;
}

function createPointMarker(pos, radius, color, type) {
  const geometry = type === 'SUPPORT'
    ? new THREE.BoxGeometry(radius * 1.8, radius * 1.8, radius * 1.8)
    : new THREE.SphereGeometry(radius, 12, 8);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 })
  );
  mesh.position.copy(toVec(pos));
  return mesh;
}

function countMeshes(root) {
  let count = 0;
  root?.traverse?.((obj) => { if (obj?.isMesh) count += 1; });
  return count;
}

function isEmptyBounds(root) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return true;
  const diag = box.getSize(new THREE.Vector3()).length();
  return !Number.isFinite(diag) || diag < 0.001;
}

function appendFallbackGeometry(payload, jsonData) {
  const scene = payload?.gltf?.scene;
  if (!scene || countMeshes(scene) > 0 && !isEmptyBounds(scene)) return payload;

  const roots = Array.isArray(jsonData) ? jsonData : [jsonData].filter(Boolean);
  const { candidates, radiusBasis } = collectRenderableCandidates(roots);
  if (!candidates.length) return payload;

  const radius = Math.max(Math.min(radiusBasis * 0.02, 80), 5);
  const pointRadius = Math.max(radius * 1.6, 12);
  const fallbackGroup = new THREE.Group();
  fallbackGroup.name = 'AVEVA_VISIBLE_GEOMETRY_FALLBACK';
  fallbackGroup.userData = { source: 'AvevaJsonVisibleFallbackPatch', candidateCount: candidates.length };

  const nodeById = new Map((payload.indexJson?.nodes || []).map((node) => [node.canonicalObjectId, node]));
  let added = 0;
  for (const item of candidates) {
    if (added >= MAX_FALLBACK_OBJECTS) break;
    const type = item.type || 'UNKNOWN';
    const color = colorFor(type);
    const mesh = item.start && item.end
      ? createCylinder(item.start, item.end, radius, color)
      : createPointMarker(item.pos, pointRadius, color, type);
    if (!mesh) continue;
    mesh.name = item.path;
    mesh.userData = { name: item.path, type, fallbackRenderable: true };
    fallbackGroup.add(mesh);
    const record = nodeById.get(item.path);
    if (record && !record.renderObjectIds?.includes(item.path)) {
      if (!Array.isArray(record.renderObjectIds)) record.renderObjectIds = [];
      record.renderObjectIds.push(item.path);
    }
    added += 1;
  }

  if (fallbackGroup.children.length) {
    scene.add(fallbackGroup);
    payload.visibleFallback = {
      source: 'AvevaJsonVisibleFallbackPatch',
      meshCount: fallbackGroup.children.length,
    };
  }
  return payload;
}

export function installAvevaJsonVisibleFallbackPatch() {
  if (globalThis[FLAG]) return;
  globalThis[FLAG] = true;
  const originalLoad = AvevaJsonLoader.prototype.load;
  AvevaJsonLoader.prototype.load = async function patchedAvevaJsonLoad(jsonData, ctx, asyncSession) {
    const payload = await originalLoad.call(this, jsonData, ctx, asyncSession);
    return appendFallbackGeometry(payload, jsonData);
  };
}

installAvevaJsonVisibleFallbackPatch();
