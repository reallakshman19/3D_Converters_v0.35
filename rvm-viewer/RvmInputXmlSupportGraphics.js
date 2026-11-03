import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from '../core/state.js';
import { currentInputXmlNodeGraph, inputXmlPoint } from './RvmInputXmlAutoBendGraphics.js?v=20260619-source-bend-collapse-1';

const ROOT_NAME = '__RVM_SUPPORT_SYMBOLS__';
const TRUE_SUPPORT_TYPES = new Set(['ATTA', 'ANCI', 'SUPPORT', 'PIPE_SUPPORT', 'PIPESUPPORT']);
const SOURCE_SUPPORT_TYPES = new Set(['ATTA', 'ANCI']);
const RENDERED_SUPPORT_TYPES = new Set(['SUPPORT', 'PIPE_SUPPORT', 'PIPESUPPORT']);
const KIND_COLORS = {
  REST: 0x5ee56a,
  GUIDE: 0x42d7ff,
  LINESTOP: 0xffb347,
  LIMIT: 0xffb347,
  LIM: 0xffb347,
  ANCHOR: 0xf266ff,
  SPRING: 0xff6fae,
  HANGER: 0xff6fae,
  X: 0x7dd3fc,
  Y: 0x86efac,
  Z: 0xfca5a5,
  UNRESOLVED: 0xff4d4d,
};

function str(v) { if (v == null) return ''; if (typeof v === 'string') return v; try { return JSON.stringify(v); } catch { return String(v); } }
function up(v) { return str(v).trim().toUpperCase(); }
function num(v, f = null) { const n = Number.parseFloat(String(v ?? '').replace(/mm/gi, '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : f; }
function vectorLen(v) { return v?.lengthSq?.() > 1e-10 ? v.clone().normalize() : null; }
function html(v) { return str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

function supportNodeId(a = {}) {
  return str(a.NODE || a.SUPPORT_NODE || a.SOURCE_NODE || a.SOURCE_RESTRAINT_NODE || a.FROM_NODE || a.TO_NODE).trim();
}
function supportPointFromAttrs(a) {
  for (const k of ['SUPPORTCOORD', 'SUPPORT_COORD', 'SCOORD', 'SUPPORT_POINT', 'SUPPORT_POS', 'LBOP', 'LBOS', 'POS', 'POSITION']) {
    const p = inputXmlPoint(a[k]); if (p) return p;
  }
  return null;
}
function supportPlacement(a) {
  const graph = currentInputXmlNodeGraph();
  const id = supportNodeId(a);
  if (id && graph?.nodePoints?.has(id)) {
    const p = graph.nodePoints.get(id).clone();
    const edges = graph.byNode?.get(id) || [];
    return { point: p, nodeId: id, edges, source: 'NODE_GRAPH' };
  }
  const fallback = supportPointFromAttrs(a);
  return fallback ? { point: fallback, nodeId: id, edges: [], source: 'COORD_FALLBACK' } : null;
}
function edgeAxisAtNode(edgeItem) {
  if (!edgeItem?.seg) return null;
  if (edgeItem.endName === 'p0') return vectorLen(edgeItem.seg.p1.clone().sub(edgeItem.seg.p0));
  return vectorLen(edgeItem.seg.p0.clone().sub(edgeItem.seg.p1));
}
function axis(v) {
  const text = up(v).replace(/[^A-Z+-]/g, '');
  if (text.includes('X')) return new THREE.Vector3(1, 0, 0);
  if (text.includes('Y')) return new THREE.Vector3(0, 1, 0);
  if (text.includes('Z')) return new THREE.Vector3(0, 0, 1);
  return null;
}
function supportAxis(a, placement) {
  const graphAxis = placement?.edges?.map(edgeAxisAtNode).find(Boolean);
  if (graphAxis) return graphAxis;
  return axis(a.PIPE_AXIS || a.ROUTE_AXIS || a.SUPPORT_DIRECTION) || new THREE.Vector3(1, 0, 0);
}
function attachedOd(a, placement) {
  const graphOd = placement?.edges?.map((e) => e?.seg?.diameter).find((v) => Number.isFinite(v) && v > 0);
  return Math.max(num(a.ATTACHED_PIPE_OD || a.ATTACHED_PIPE_BORE || a.BORE, graphOd || 100), 1);
}
function axisNameFromKind(k) {
  if (k === 'X') return new THREE.Vector3(1, 0, 0);
  if (k === 'Y') return new THREE.Vector3(0, 1, 0);
  if (k === 'Z') return new THREE.Vector3(0, 0, 1);
  return null;
}
function ortho(t) {
  const c = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0));
  return c.lengthSq() > 1e-8 ? c.normalize() : new THREE.Vector3(0, 0, 1);
}
function guideAxes(t) {
  const ax = Math.abs(t.x), ay = Math.abs(t.y), az = Math.abs(t.z);
  if (ax >= ay && ax >= az) return [new THREE.Vector3(0, 0, 1)];
  if (az >= ax && az >= ay) return [new THREE.Vector3(1, 0, 0)];
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
}
function sourceRestraintKind(a) {
  const raw = Number.parseFloat(String(a.SOURCE_RESTRAINT_TYPE ?? '').trim());
  if (!Number.isFinite(raw)) return '';
  const rounded = Math.round(raw);
  if ([0, 2, 17].includes(rounded)) return 'REST';
  if ([1, 7].includes(rounded)) return 'GUIDE';
  if ([3, 10, 18].includes(rounded)) return 'LINESTOP';
  if ([4, 5, 6, 8, 9].includes(rounded)) return 'LIMIT';
  if ([11, 12, 13, 14, 15, 16].includes(rounded)) return 'SPRING';
  return '';
}
function rawIntentText(a) {
  return [
    a.UXML_RAW_SUPPORT_KIND,
    a.RAW_SUPPORT_KIND,
    a.RAW_SUPPORT_TYPE,
    a.SOURCE_SUPPORT_KIND,
    a.SOURCE_SUPPORT_TYPE,
    a.SKEY,
    a.SPRE,
    a.DTXR,
    a.DESCRIPTION,
    a.DESC,
    a.NAME,
    a.SUPPORT_TAG,
    a.SUPPORT_DIRECTION,
    a.SOURCE_RESTRAINT_LABEL,
    a.SOURCE_RESTRAINT_NAME,
  ].map(up).join(' ');
}
function classifyText(txt) {
  if (/HANGER|\bHANG\b/.test(txt)) return 'HANGER';
  if (/SPRING/.test(txt)) return 'SPRING';
  if (/GUIDE|\bGDE\b|\bGUI\b|\bPG[-_ ]|\bGT0[1-4]\b/.test(txt)) return 'GUIDE';
  if (/LINE\s*STOP|LINESTOP|STOPPER|\bLS[-_ ]|\bST0[6-8]\b/.test(txt)) return 'LINESTOP';
  if (/\bLIM\b|LIMIT/.test(txt)) return 'LIMIT';
  if (/ANCHOR|FIXED/.test(txt)) return 'ANCHOR';
  if (/\bX\b|\+X|-X|PIPE_AXIS_X/.test(txt)) return 'X';
  if (/\bY\b|\+Y|-Y|PIPE_AXIS_Y/.test(txt)) return 'Y';
  if (/\bZ\b|\+Z|-Z|PIPE_AXIS_Z/.test(txt)) return 'Z';
  if (/REST|SHOE|WEAR\s*PLATE|W\.?\s*PAD|BASE\s*PLATE/.test(txt)) return 'REST';
  return '';
}
function kind(a) {
  const direct = up(a.SUPPORT_KIND || a.SUPPORT_MAPPER_KIND || a.SUPPORT_TYPE || a.CMPSUPTYPE || a.MDSSUPPTYPE);
  const sourceKind = sourceRestraintKind(a);
  const rawTextKind = classifyText(rawIntentText(a));

  if (/^(X|\+X|-X|XONLY|XSTOP)$/.test(direct)) return 'X';
  if (/^(Y|\+Y|-Y|YONLY|YSTOP)$/.test(direct)) return 'Y';
  if (/^(Z|\+Z|-Z|ZONLY|ZSTOP)$/.test(direct)) return 'Z';
  if (/^(LIM|LIMIT)$/.test(direct)) return 'LIMIT';
  if (/^(LINESTOP|LINE_STOP)$/.test(direct)) return 'LINESTOP';
  if (/^(HANGER|HANG)$/.test(direct)) return 'HANGER';
  if (/^SPRING$/.test(direct)) return 'SPRING';
  if (/^(ANCHOR|FIXED)$/.test(direct)) return 'ANCHOR';
  if (/^GUIDE$/.test(direct)) return 'GUIDE';

  // SUPPORT_KIND can be auto-normalized to REST before this overlay runs.
  // Do not accept that as a blind fallback; use raw/source intent first.
  if (/^REST$/.test(direct)) {
    if (rawTextKind) return rawTextKind;
    if (sourceKind) return sourceKind;
    return 'UNRESOLVED';
  }

  if (rawTextKind) return rawTextKind;
  if (sourceKind) return sourceKind;
  return 'UNRESOLVED';
}
function isRvmPrimitiveLeaf(n) {
  const a = n?.attributes || {};
  const text = [n?.name, n?.canonicalObjectId, a.NAME, a.RVM_RECORD_TAG, a.RVM_PRIMITIVE_CODE, a.RVM_BYTE_OFFSET, a.RVM_NATIVE_PRIMITIVE_PARAMS].map(str).join(' ');
  return up(a.RVM_RECORD_TAG) === 'PRIM'
    || Boolean(str(a.RVM_PRIMITIVE_CODE).trim())
    || Boolean(str(a.RVM_BYTE_OFFSET).trim())
    || Boolean(str(a.RVM_NATIVE_PRIMITIVE_PARAMS).trim())
    || /^\s*RVM\s+(CYLINDER|BOX|PYRAMID|SPHERE|TORUS|SNOUT|FACET)/i.test(text);
}
function hasSourceSupportRecordAttrs(a) {
  return Boolean(
    str(a.SOURCE_RESTRAINT_ID).trim()
    || str(a.SOURCE_RESTRAINT_TYPE).trim()
    || str(a.SOURCE_RESTRAINT_NAME).trim()
    || str(a.SOURCE_RESTRAINT_LABEL).trim()
    || str(a.UXML_RAW_SUPPORT_KIND).trim()
  );
}
function isInputXmlSupport(n) {
  const a = n?.attributes || {};
  const type = up(n?.type || n?.kind || a.TYPE || a.RAW_TYPE);
  if (!TRUE_SUPPORT_TYPES.has(type)) return false;
  // Raw RVM PRIM leaves are already renderable geometry. Do not treat them as
  // source support records again, otherwise the viewer generates a duplicate
  // overlay that can escape from the pipe/support anchor.
  if (isRvmPrimitiveLeaf(n)) return false;
  if (RENDERED_SUPPORT_TYPES.has(type) && !hasSourceSupportRecordAttrs(a)) return false;
  if (SOURCE_SUPPORT_TYPES.has(type) || hasSourceSupportRecordAttrs(a)) {
    return /INPUTXML/i.test([n?.name, n?.canonicalObjectId, a.SOURCE_FORMAT, a.SOURCE_CONVERTER, a.SOURCE_FILE, a.SOURCE_RESTRAINT_ID, a.NAME, a.SUPPORT_TAG].map(str).join(' ')) || Boolean(a.SOURCE_RESTRAINT_ID);
  }
  return false;
}
function inputXmlSupportNodes() {
  const nodes = Array.isArray(state?.rvm?.index?.nodes) ? state.rvm.index.nodes : [];
  return nodes.filter(isInputXmlSupport);
}
function hasInputXmlModel() {
  const nodes = Array.isArray(state?.rvm?.index?.nodes) ? state.rvm.index.nodes : [];
  return nodes.some((n) => /INPUTXML/i.test([n?.name, n?.canonicalObjectId, n?.attributes?.SOURCE_FORMAT, n?.attributes?.SOURCE_CONVERTER, n?.attributes?.SOURCE_FILE].map(str).join(' ')));
}

function mat(color) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98, depthTest: true }); }
function orientY(mesh, dir) { mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); }
function arrow(tip, away, len, r, color, name) {
  const dir = away.clone().normalize();
  const g = new THREE.Group(); g.name = name;
  const m = mat(color);
  const shaftLen = len * 0.72; const headLen = len * 0.28;
  const start = tip.clone().add(dir.clone().multiplyScalar(len));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, shaftLen, 12), m);
  shaft.position.copy(start.clone().add(dir.clone().multiplyScalar(-shaftLen * 0.5)));
  orientY(shaft, dir.clone().multiplyScalar(-1));
  const head = new THREE.Mesh(new THREE.ConeGeometry(r * 3, headLen, 16), m);
  head.position.copy(tip.clone().add(dir.clone().multiplyScalar(headLen * 0.5)));
  orientY(head, dir.clone().multiplyScalar(-1));
  g.add(shaft, head);
  return g;
}
function addLabel(g, label, p, len, visible) {
  if (!visible || typeof document === 'undefined') return;
  const div = document.createElement('div');
  div.className = 'rvm-support-symbol-label rvm-inputxml-support-label';
  div.textContent = label;
  div.style.cssText = 'font:600 10px/1.2 system-ui,sans-serif;padding:2px 6px;border-radius:10px;background:rgba(8,16,28,.82);color:#e8f3ff;border:1px solid rgba(128,190,255,.45);white-space:nowrap;';
  const css = new CSS2DObject(div);
  css.userData.supportSymbolLabel = true;
  css.userData.supportSymbolLabelEligible = true;
  css.position.copy(p.clone().add(new THREE.Vector3(0, len * 0.55, 0)));
  g.add(css);
}
function removeOld(viewer) {
  const old = viewer?.scene?.getObjectByName(ROOT_NAME) || viewer?.modelGroup?.getObjectByName?.(ROOT_NAME);
  if (!old) return;
  old.parent?.remove?.(old);
  old.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
    if (o.element?.parentNode) o.element.parentNode.removeChild(o.element);
  });
}
function crossSymbol(p, len, r, color, name) {
  const g = new THREE.Group();
  g.name = name;
  const m = mat(color);
  for (const dir of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
    bar.position.copy(p);
    orientY(bar, dir);
    g.add(bar);
  }
  return g;
}
function springSymbol(p, len, r, color, name) {
  const g = new THREE.Group();
  g.name = name;
  const m = mat(color);
  const turns = 6;
  const pts = [];
  for (let i = 0; i <= turns * 8; i++) {
    const t = i / (turns * 8);
    const a = t * Math.PI * 2 * turns;
    pts.push(new THREE.Vector3(Math.cos(a) * r * 4, -t * len, Math.sin(a) * r * 4).add(p));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length, r, 8, false), m));
  g.add(arrow(p.clone().add(new THREE.Vector3(0, -len, 0)), new THREE.Vector3(0, -1, 0), len * 0.35, r, color, `${name}_SPRING_ARROW`));
  return g;
}

function makePickable(group, renderId, attrs, supportKind) {
  group.userData.name = renderId;
  group.userData.canonicalObjectId = renderId;
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.name = renderId;
    obj.userData = {
      ...(obj.userData || {}),
      name: renderId,
      canonicalObjectId: renderId,
      supportSymbol: true,
      inputXmlSupportGraphics: true,
      supportKind,
      kind: 'SUPPORT',
      attributes: { ...attrs, SUPPORT_KIND_RESOLVED: supportKind },
    };
  });
}

function makeSymbol(node, index, viewer, options) {
  const a = node.attributes || {};
  const placement = supportPlacement(a);
  if (!placement?.point) return null;
  const p = placement.point;
  const k = kind(a);
  const tag = str(a.SUPPORT_TAG || a.CMPSUPREFN || a.NAME || a.REF || `SUPPORT-${index + 1}`);
  const renderId = str(node.canonicalObjectId || node.sourceObjectId || node.id || tag || `SUPPORT-${index + 1}`);
  const t = supportAxis(a, placement).normalize();
  const od = attachedOd(a, placement);
  const gap = Math.min(Math.max(num(a.SUPPORT_GAP_MM ?? a.GAP_MM ?? a.GAP, 0), 0), 40);
  const mul = Math.max(0.25, Math.min(1.5, Number(options?.scaleMultiplier || 0.75)));
  const cr = Math.min(od * 0.5, 250);
  const len = Math.min(Math.max(od * 0.35, 28), 180) * mul;
  const rad = Math.min(Math.max(od * 0.018, 1.2), 8) * mul;
  const lane = Math.min(Math.max(od * 0.45, 20), 160) * mul;
  const color = KIND_COLORS[k] || KIND_COLORS.UNRESOLVED;
  const g = new THREE.Group();
  g.name = `SUPPORT_SYMBOL_${tag}`;
  g.userData = { supportSymbol: true, supportKind: k, supportTag: tag, inputXmlSupportGraphics: true, supportPlacementSource: placement.source, supportNodeId: placement.nodeId, attributes: { ...a } };
  const singleAxis = axisNameFromKind(k);
  if (k === 'ANCHOR') {
    for (const ax of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
      g.add(arrow(p.clone().add(ax.clone().multiplyScalar(cr + gap)), ax, len, rad, color, `${tag}_ANCHOR_PLUS`));
      g.add(arrow(p.clone().add(ax.clone().multiplyScalar(-cr - gap)), ax.clone().multiplyScalar(-1), len, rad, color, `${tag}_ANCHOR_MINUS`));
    }
  } else if (k === 'GUIDE') {
    for (const ax of guideAxes(t)) {
      g.add(arrow(p.clone().add(ax.clone().multiplyScalar(cr + gap)), ax, len, rad, color, `${tag}_GUIDE_PLUS`));
      g.add(arrow(p.clone().add(ax.clone().multiplyScalar(-cr - gap)), ax.clone().multiplyScalar(-1), len, rad, color, `${tag}_GUIDE_MINUS`));
    }
  } else if (k === 'LINESTOP' || k === 'LIMIT' || k === 'LIM') {
    const c = p.clone().add(ortho(t).multiplyScalar(lane));
    g.add(arrow(c.clone().add(t.clone().multiplyScalar(gap * 0.5)), t, len, rad, color, `${tag}_${k}_A`));
    g.add(arrow(c.clone().add(t.clone().multiplyScalar(-gap * 0.5)), t.clone().multiplyScalar(-1), len, rad, color, `${tag}_${k}_B`));
  } else if (k === 'SPRING' || k === 'HANGER') {
    g.add(springSymbol(p.clone().add(new THREE.Vector3(0, -cr - gap, 0)), len, rad, color, `${tag}_${k}`));
  } else if (singleAxis) {
    g.add(arrow(p.clone().add(singleAxis.clone().multiplyScalar(cr + gap)), singleAxis, len, rad, color, `${tag}_${k}_PLUS`));
    g.add(arrow(p.clone().add(singleAxis.clone().multiplyScalar(-cr - gap)), singleAxis.clone().multiplyScalar(-1), len, rad, color, `${tag}_${k}_MINUS`));
  } else if (k === 'UNRESOLVED') {
    g.add(crossSymbol(p, len * 0.75, rad * 1.25, color, `${tag}_UNRESOLVED_CROSS`));
  } else {
    g.add(arrow(p.clone().add(new THREE.Vector3(0, -cr - gap, 0)), new THREE.Vector3(0, -1, 0), len, rad, color, `${tag}_REST_PLUS_Y`));
  }
  addLabel(g, k === 'REST' ? tag : `${tag} ${k}`, p, len, Boolean(options?.labelsVisible));
  makePickable(g, renderId, a, k);
  return g;
}

function updateRvmSupportSummaryDom(viewer, diagnostics) {
  if (typeof document === 'undefined' || !diagnostics?.inputXmlSupportGraphics) return;
  const root = document.querySelector('[data-rvm-viewer]');
  if (!root) return;
  const counts = diagnostics.kindCounts || {};
  const entries = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  const summary = root.querySelector('#rvm-support-summary');
  if (summary) {
    summary.innerHTML = entries.length
      ? entries.map(([k, v]) => `<div class="rvm-tag-item"><span class="rvm-tag-text">${html(k)}</span><strong>${html(v)}</strong></div>`).join('')
      : '<div class="rvm-empty-state">No InputXML support symbols found.</div>';
  }
  const supportChip = root.querySelector('[data-rvm-status-chip="supports"]');
  if (supportChip) supportChip.textContent = `Supports: ${Number(diagnostics.created || 0).toLocaleString()}`;
  const kindChip = root.querySelector('[data-rvm-status-chip="kind"]');
  if (kindChip) kindChip.textContent = `Kinds: ${entries.map(([k, v]) => `${k}:${v}`).join(' ') || '-'}`;
  const msg = root.querySelector('#rvm-sb-msg');
  if (msg && /indexAttrs|Loaded|Ready/i.test(msg.textContent || '')) {
    msg.textContent = `${msg.textContent || 'Loaded'}; InputXML supports=${diagnostics.created}; nodeSnapped=${diagnostics.nodeSnapped}/${diagnostics.created}`;
  }
  viewer.__inputXmlSupportSummaryDomUpdated = true;
}

export function applyInputXmlSupportGraphicsOverlay(viewer, options = {}) {
  if (!viewer?.scene) return null;
  removeOld(viewer);
  const enabled = options.supportSymbolsEnabled === true || options.inputXmlSupportGraphicsEnabled === true || options.enabled === true;
  if (!enabled) {
    const diagnostics = {
      created: 0,
      scanned: 0,
      inputXmlSupportGraphics: false,
      inputXmlSupportGraphicsDisabled: true,
      disabledReason: 'raw-rvm-support-primitives-are-default',
    };
    viewer.supportSymbolDiagnostics = diagnostics;
    return diagnostics;
  }
  if (!hasInputXmlModel()) return null;
  const supports = inputXmlSupportNodes();
  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData.supportSymbolRoot = true;
  root.userData.inputXmlSupportGraphics = true;
  supports.forEach((supportNode, index) => { const symbol = makeSymbol(supportNode, index, viewer, options); if (symbol) root.add(symbol); });
  if (root.children.length > 0) {
    if (viewer.modelGroup) {
      viewer.modelGroup.add(root);
      viewer.modelGroup.updateMatrixWorld(true);
      viewer.selection?.updateModelGroup?.(viewer.modelGroup);
    } else {
      viewer.scene.add(root);
    }
  } else {
    root.clear();
  }
  const counts = {};
  let nodeSnapped = 0;
  root.children.forEach((child) => {
    const supportKind = child.userData?.supportKind || 'SUPPORT';
    counts[supportKind] = (counts[supportKind] || 0) + 1;
    if (child.userData?.supportPlacementSource === 'NODE_GRAPH') nodeSnapped += 1;
  });
  viewer.supportSymbolDiagnostics = { created: root.children.length, scanned: supports.length, inputXmlSupportGraphics: true, inputXmlNodeGraphSnap: true, nodeSnapped, kindCounts: counts, labelsVisible: Boolean(options.labelsVisible), scaleMultiplier: options.scaleMultiplier, rawPrimitiveLeavesExcluded: true };
  updateRvmSupportSummaryDom(viewer, viewer.supportSymbolDiagnostics);
  return viewer.supportSymbolDiagnostics;
}
