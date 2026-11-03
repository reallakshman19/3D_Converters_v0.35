import { AvevaJsonLoader } from './AvevaJsonLoader.js';
import { state } from '../core/state.js';

const FLAG = '__RVM_INPUTXML_DISPLAY_OVERRIDE_V1__';
const SUPPORT_TYPES = new Set(['ATTA', 'ANCI', 'SUPPORT', 'PIPE_SUPPORT', 'PIPESUPPORT']);

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function upper(value) { return text(value).trim().toUpperCase(); }
function num(value, fallback = 0) {
  const n = Number.parseFloat(String(value ?? '').replace(/mm/gi, '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function clonePoint(point) {
  if (!point || typeof point !== 'object') return null;
  const x = Number(point.x ?? point.X);
  const y = Number(point.y ?? point.Y);
  const z = Number(point.z ?? point.Z);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function len(v) { return Math.hypot(v.x, v.y, v.z); }
function norm(v) { const l = len(v); return l > 1e-9 ? mul(v, 1 / l) : null; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function dist(a, b) { return len(sub(a, b)); }
function pointKey(p, tol = 1) { return [p.x, p.y, p.z].map((v) => Math.round(v / tol)).join('|'); }

function currentOptions() {
  let autoBend = true;
  try {
    const raw = localStorage.getItem('rvm.inputxml.autoBend');
    if (raw === 'false' || raw === '0' || raw === 'off') autoBend = false;
  } catch {}
  let verticalAxis = 'Y';
  let northAxis = 'X';
  try { verticalAxis = upper(localStorage.getItem('rvm.inputxml.verticalAxis') || 'Y') || 'Y'; } catch {}
  try { northAxis = upper(localStorage.getItem('rvm.inputxml.northAxis') || 'X') || 'X'; } catch {}
  if (!['X', 'Y', 'Z'].includes(verticalAxis)) verticalAxis = 'Y';
  if (!['X', 'Y', 'Z'].includes(northAxis) || northAxis === verticalAxis) northAxis = verticalAxis === 'X' ? 'Y' : 'X';
  return { autoBend, verticalAxis, northAxis };
}

function isSupportNode(node) {
  const attrs = node?.attributes || {};
  return SUPPORT_TYPES.has(upper(node?.type || node?.kind || attrs.TYPE || attrs.RAW_TYPE));
}

function isBranchNode(node) {
  const attrs = node?.attributes || {};
  const type = upper(node?.type || node?.kind || attrs.TYPE);
  return type === 'BRAN' || type === 'BRANCH' || Array.isArray(node?.children);
}

function hasInputXml(value) {
  let found = false;
  const visit = (node) => {
    if (found || !node || typeof node !== 'object') return;
    const attrs = node.attributes || {};
    const hay = [node.name, node.canonicalObjectId, node.sourceObjectId, node.type, node.kind, attrs.SOURCE_FORMAT, attrs.SOURCE_CONVERTER, attrs.SOURCE_FILE, attrs.OWNER, attrs.NAME].map(text).join(' ');
    if (/INPUTXML/i.test(hay)) { found = true; return; }
    for (const key of ['children', 'items', 'branches', 'hierarchy', 'nodes']) {
      const arr = node[key];
      if (Array.isArray(arr)) arr.forEach(visit);
    }
  };
  (Array.isArray(value) ? value : [value]).forEach(visit);
  return found;
}

function componentBore(attrs) {
  return Math.max(num(attrs.BORE ?? attrs.ABORE ?? attrs.LBORE ?? attrs.DIAMETER ?? attrs.ATTACHED_PIPE_OD, 100), 1);
}

function pipeName(attrs, fallback = 'PIPE') {
  const from = text(attrs.FROM_NODE || attrs.HREF || '').trim();
  const to = text(attrs.TO_NODE || attrs.TREF || '').trim();
  if (from || to) return `PIPE ${from || '?'}_TO_${to || '?'}`;
  const name = text(attrs.NAME || fallback).replace(/\b(BEND|ELBOW|FLANGE_PAIR|FLANGE|VALVE|GASK|GASKET|REDUCER)\b/gi, 'PIPE');
  return name.replace(/\s+/g, ' ').trim() || 'PIPE';
}

function normalizeInputXmlComponent(node) {
  const attrs = node.attributes && typeof node.attributes === 'object' ? node.attributes : (node.attributes = {});
  if (isSupportNode(node)) return;
  if (!clonePoint(attrs.APOS) || !clonePoint(attrs.LPOS)) return;
  const oldType = upper(node.type || attrs.TYPE || attrs.RAW_TYPE || 'PIPE');
  if (!attrs.INPUTXML_ORIGINAL_TYPE) attrs.INPUTXML_ORIGINAL_TYPE = oldType;
  attrs.TYPE = 'PIPE';
  attrs.RAW_TYPE = 'PIPE';
  attrs.DTXR = 'PIPE';
  attrs.INPUTXML_DISPLAY_MODE = 'PIPE_ONLY';
  const newName = pipeName(attrs, node.name || attrs.NAME || 'PIPE');
  attrs.NAME = newName;
  node.name = newName;
  node.type = 'PIPE';
  node.kind = 'PIPE';
}

function collectBranches(root, out = []) {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (isBranchNode(node) && Array.isArray(node.children)) out.push(node);
    for (const key of ['children', 'items', 'branches', 'hierarchy', 'nodes']) {
      const arr = node[key];
      if (Array.isArray(arr)) arr.forEach(visit);
    }
  };
  (Array.isArray(root) ? root : [root]).forEach(visit);
  return out;
}

function applyBranchAutoBends(branch) {
  const children = Array.isArray(branch.children) ? branch.children : [];
  const pipes = [];
  for (const child of children) {
    normalizeInputXmlComponent(child);
    const attrs = child?.attributes || {};
    if (isSupportNode(child)) continue;
    const a = clonePoint(attrs.APOS);
    const b = clonePoint(attrs.LPOS);
    if (!a || !b || dist(a, b) < 1e-6) continue;
    pipes.push({ node: child, attrs, a, b, bore: componentBore(attrs) });
  }

  const byPoint = new Map();
  for (const pipe of pipes) {
    for (const end of ['a', 'b']) {
      const p = pipe[end];
      const key = pointKey(p, 1);
      if (!byPoint.has(key)) byPoint.set(key, []);
      byPoint.get(key).push({ pipe, end, point: p });
    }
  }

  const synthetic = [];
  let autoIndex = 0;
  for (const entries of byPoint.values()) {
    if (entries.length !== 2) continue;
    const [e1, e2] = entries;
    if (e1.pipe === e2.pipe) continue;
    const joint = e1.point;
    const o1 = e1.end === 'a' ? e1.pipe.b : e1.pipe.a;
    const o2 = e2.end === 'a' ? e2.pipe.b : e2.pipe.a;
    const d1 = norm(sub(o1, joint));
    const d2 = norm(sub(o2, joint));
    if (!d1 || !d2) continue;
    const cos = Math.max(-1, Math.min(1, dot(d1, d2)));
    const angle = Math.acos(cos);
    const angleDeg = angle * 180 / Math.PI;
    if (angleDeg < 8 || angleDeg > 172) continue;
    const bore = Math.min(e1.pipe.bore, e2.pipe.bore);
    const radius = 1.5 * bore;
    const tangent = Math.min(radius / Math.max(Math.tan(angle / 2), 0.1), len(sub(o1, joint)) * 0.35, len(sub(o2, joint)) * 0.35);
    if (!Number.isFinite(tangent) || tangent < 1) continue;
    const p1 = add(joint, mul(d1, tangent));
    const p2 = add(joint, mul(d2, tangent));
    if (e1.end === 'a') e1.pipe.attrs.APOS = p1; else e1.pipe.attrs.LPOS = p1;
    if (e2.end === 'a') e2.pipe.attrs.APOS = p2; else e2.pipe.attrs.LPOS = p2;
    e1.pipe.attrs.INPUTXML_AUTO_BEND_TRIMMED = 'true';
    e2.pipe.attrs.INPUTXML_AUTO_BEND_TRIMMED = 'true';
    autoIndex += 1;
    synthetic.push({
      name: `INPUTXML_AUTO_BEND_${autoIndex}`,
      type: 'BEND',
      attributes: {
        TYPE: 'BEND',
        RAW_TYPE: 'AUTO_BEND',
        NAME: `INPUTXML_AUTO_BEND_${autoIndex}`,
        OWNER: branch.name || branch.attributes?.NAME || '',
        SOURCE_FORMAT: 'INPUTXML_AUTO_BEND',
        SOURCE_CONVERTER: 'RVM_VIEWER_AUTO_BEND',
        INPUTXML_AUTO_BEND: 'true',
        LABEL_SUPPRESS: 'true',
        APOS: p1,
        LPOS: p2,
        BORE: `${bore}mm`,
        ABORE: `${bore}mm`,
        LBORE: `${bore}mm`,
        DIAMETER: `${bore}mm`,
        BEND_RADIUS: String(radius),
        BEND_ANGLE: String(angleDeg),
      },
    });
  }
  if (synthetic.length) children.push(...synthetic);
  return synthetic.length;
}

function applyDisplayOverride(source) {
  const options = currentOptions();
  if (!hasInputXml(source)) {
    state.rvm = state.rvm || {};
    state.rvm.inputXmlDisplay = { active: false, autoBend: false, verticalAxis: options.verticalAxis, northAxis: options.northAxis };
    return source;
  }
  let syntheticBends = 0;
  const branches = collectBranches(source);
  for (const branch of branches) {
    const attrs = branch.attributes && typeof branch.attributes === 'object' ? branch.attributes : (branch.attributes = {});
    attrs.INPUTXML_VERTICAL_AXIS = options.verticalAxis;
    attrs.INPUTXML_NORTH_AXIS = options.northAxis;
    attrs.AUTO_BEND = options.autoBend ? 'ON' : 'OFF';
    attrs.AUTO_CONNECT_FITTINGS = 'OFF';
    if (options.autoBend) syntheticBends += applyBranchAutoBends(branch);
    else (branch.children || []).forEach(normalizeInputXmlComponent);
  }
  state.rvm = state.rvm || {};
  state.rvm.inputXmlDisplay = {
    active: true,
    autoBend: Boolean(options.autoBend),
    verticalAxis: options.verticalAxis,
    northAxis: options.northAxis,
    syntheticBends,
  };
  return source;
}

export function installAvevaJsonInputXmlDisplayOverride() {
  if (typeof window === 'undefined') return;
  if (window[FLAG]) return;
  window[FLAG] = true;
  const proto = AvevaJsonLoader?.prototype;
  if (!proto || typeof proto.load !== 'function') return;
  const original = proto.load;
  proto.load = async function inputXmlDisplayOverrideLoad(source, ...rest) {
    return original.call(this, applyDisplayOverride(source), ...rest);
  };
}

installAvevaJsonInputXmlDisplayOverride();
