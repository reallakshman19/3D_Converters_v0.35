const COMPONENT_BLOCKERS = new Set(['ELBOW', 'BEND', 'TEE', 'VALVE', 'FLANGE', 'SUPPORT', 'OLET', 'BRANCH']);
const PIPE_TYPES = new Set(['PIPE', 'TUBI']);
const BEND_TYPES = new Set(['BEND', 'ELBOW']);

export function collectNonPrimitiveAutoBendSegments(source, options = {}) {
  const roots = Array.isArray(source) ? source : [source];
  const segments = [];
  let nodeIdCounter = 1;

  const walk = (node, parentPath, inherited = {}) => {
    if (!node || typeof node !== 'object') return;
    const name = String(node.name || node.id || `Node-${nodeIdCounter}`).trim() || `Node-${nodeIdCounter}`;
    nodeIdCounter += 1;
    const currentPath = parentPath ? `${parentPath}/${name}` : name;
    const attrs = attrsOf(node);
    const componentType = normalizedType(node, attrs);
    const branchId = token(attrs.BRANCH_ID ?? attrs.BRANCH ?? attrs.OWNER ?? node.BRANCH_ID ?? inherited.branchId);
    const lineNo = token(attrs.LINE_NO ?? attrs.LINE ?? attrs.LINE_ID ?? node.LINE_NO ?? inherited.lineNo);

    if (PIPE_TYPES.has(componentType)) {
      const apos = pickCoord(attrs, node, ['APOS', 'A_POS', 'EP1', 'END_POINT1', 'POS_START', 'POSSTART', 'START_POINT', 'START', 'ABOP']);
      const lpos = pickCoord(attrs, node, ['LPOS', 'L_POS', 'EP2', 'END_POINT2', 'POS_END', 'POSEND', 'END_POINT', 'END', 'LBOP']);
      if (apos && lpos && distance(apos, lpos) > (options.minLengthMm ?? 1e-4)) {
        const fromNode = nodeKey(attrs.FROM_NODE ?? attrs.FNODE ?? attrs.ANODE ?? attrs.START_NODE ?? node.fromNode, apos);
        const toNode = nodeKey(attrs.TO_NODE ?? attrs.TNODE ?? attrs.LNODE ?? attrs.END_NODE ?? node.toNode, lpos);
        segments.push({
          id: currentPath,
          fromNode,
          toNode,
          from: apos,
          to: lpos,
          branchId,
          lineNo,
          componentType: 'PIPE',
          pipeOdMm: readPositiveNumber(attrs.PIPE_OD_MM ?? attrs.OD_MM ?? attrs.OD ?? attrs.OUTSIDE_DIAMETER ?? node.pipeOdMm),
          boreMm: readPositiveNumber(attrs.HBOR ?? attrs.TBOR ?? attrs.ABORE ?? attrs.LBORE ?? attrs.BORE ?? node.boreMm),
          bendRadiusMm: readPositiveNumber(attrs.BEND_RADIUS_MM ?? attrs.BEND_RADIUS ?? attrs.RADIUS ?? attrs.RADI ?? node.bendRadiusMm),
          attrs: { ...attrs },
        });
      }
    }

    const nextInherited = {
      branchId: branchId || inherited.branchId,
      lineNo: lineNo || inherited.lineNo,
    };
    for (const key of ['children', 'items', 'branches', 'nodes', 'hierarchy']) {
      const children = node[key];
      if (Array.isArray(children)) for (const child of children) walk(child, currentPath, nextInherited);
    }
  };

  for (const root of roots) walk(root, '', {});
  return segments;
}

export function collectExplicitNonPrimitiveAutoBends(source) {
  const roots = Array.isArray(source) ? source : [source];
  const bends = [];
  let nodeIdCounter = 1;

  const walk = (node, parentPath, inherited = {}) => {
    if (!node || typeof node !== 'object') return;
    const name = String(node.name || node.id || `Node-${nodeIdCounter}`).trim() || `Node-${nodeIdCounter}`;
    nodeIdCounter += 1;
    const currentPath = parentPath ? `${parentPath}/${name}` : name;
    const attrs = attrsOf(node);
    const componentType = normalizedType(node, attrs);
    const branchId = token(attrs.BRANCH_ID ?? attrs.BRANCH ?? attrs.OWNER ?? node.BRANCH_ID ?? inherited.branchId);
    const lineNo = token(attrs.LINE_NO ?? attrs.LINE ?? attrs.LINE_ID ?? node.LINE_NO ?? inherited.lineNo);

    if (BEND_TYPES.has(componentType)) {
      const from = pickCoord(attrs, node, ['APOS', 'A_POS', 'EP1', 'END_POINT1', 'POS_START', 'START_POINT', 'START', 'ABOP']);
      const to = pickCoord(attrs, node, ['LPOS', 'L_POS', 'EP2', 'END_POINT2', 'POS_END', 'END_POINT', 'END', 'LBOP']);
      const radiusMm = readPositiveNumber(attrs.BEND_RADIUS_MM ?? attrs.BEND_RADIUS ?? attrs.RADIUS ?? attrs.RADI ?? node.radiusMm ?? node.bendRadiusMm);
      const turnAngleDeg = readPositiveNumber(attrs.BEND_ANGLE ?? attrs.BEND_ANGLE1 ?? attrs.ANGLE1 ?? attrs.ANGLE ?? node.turnAngleDeg);
      if (from && to && radiusMm && turnAngleDeg) {
        bends.push({
          id: currentPath,
          nodeId: token(attrs.BEND_NODE1 ?? attrs.NODE1 ?? attrs.NODE ?? attrs.FROM_NODE ?? node.nodeId) || coordNodeKey(from),
          bendNode1: token(attrs.BEND_NODE1 ?? attrs.NODE1 ?? ''),
          bendNode2: token(attrs.BEND_NODE2 ?? attrs.NODE2 ?? ''),
          from,
          to,
          branchId,
          lineNo,
          componentType: 'BEND',
          radiusMm,
          turnAngleDeg,
          pipeOdMm: readPositiveNumber(attrs.PIPE_OD_MM ?? attrs.OD_MM ?? attrs.OD ?? attrs.OUTSIDE_DIAMETER ?? attrs.DIAMETER ?? node.pipeOdMm),
          boreMm: readPositiveNumber(attrs.HBOR ?? attrs.TBOR ?? attrs.ABORE ?? attrs.LBORE ?? attrs.BORE ?? attrs.DIAMETER ?? node.boreMm),
          source: sourceForExplicitBend(attrs),
          attrs: { ...attrs },
        });
      }
    }

    const nextInherited = { branchId: branchId || inherited.branchId, lineNo: lineNo || inherited.lineNo };
    for (const key of ['children', 'items', 'branches', 'nodes', 'hierarchy']) {
      const children = node[key];
      if (Array.isArray(children)) for (const child of children) walk(child, currentPath, nextInherited);
    }
  };

  for (const root of roots) walk(root, '', {});
  return bends;
}

export function collectExistingAutoBendNodeKinds(source) {
  const roots = Array.isArray(source) ? source : [source];
  const existing = new Map();

  const markPoint = (point, type) => {
    if (!point || !COMPONENT_BLOCKERS.has(type)) return;
    existing.set(coordNodeKey(point), type);
  };

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const attrs = attrsOf(node);
    const type = normalizedType(node, attrs);
    if (COMPONENT_BLOCKERS.has(type) && !PIPE_TYPES.has(type)) {
      for (const key of ['POS', 'CO_ORDS', 'COORDS', 'CO_ORD', 'CPOS', 'CENTRE_POINT', 'CENTER_POINT', 'APOS', 'LPOS', 'BPOS']) {
        markPoint(parseCoord(attrs[key] ?? node[key]), type);
      }
    }
    for (const key of ['children', 'items', 'branches', 'nodes', 'hierarchy']) {
      const children = node[key];
      if (Array.isArray(children)) for (const child of children) walk(child);
    }
  };

  for (const root of roots) walk(root);
  return existing;
}

function attrsOf(node) {
  return {
    ...(node.attributes && typeof node.attributes === 'object' ? node.attributes : {}),
    ...(node.attrs && typeof node.attrs === 'object' ? node.attrs : {}),
    ...(node.rawAttributes && typeof node.rawAttributes === 'object' ? node.rawAttributes : {}),
  };
}

function normalizedType(node, attrs = attrsOf(node)) {
  const raw = String(node?.type || node?.kind || attrs.TYPE || attrs.CMPTYPE || '').trim().toUpperCase();
  if (raw === 'TUBI') return 'PIPE';
  if (raw === 'ELBO') return 'ELBOW';
  if (raw === 'VALV') return 'VALVE';
  if (raw === 'FLAN') return 'FLANGE';
  if (raw === 'BRAN') return 'BRANCH';
  if (raw === 'ATTA' || raw === 'ANCI') return 'SUPPORT';
  if (raw) return raw;
  const name = String(node?.name || node?.id || '').toUpperCase();
  if (name.includes('PIPE') || name.includes('TUBI')) return 'PIPE';
  if (name.includes('ELBO') || name.includes('BEND')) return 'BEND';
  if (name.includes('TEE')) return 'TEE';
  if (name.includes('VALV')) return 'VALVE';
  if (name.includes('FLAN')) return 'FLANGE';
  if (name.includes('SUPPORT') || name.includes('ATTA')) return 'SUPPORT';
  return 'UNKNOWN';
}

function pickCoord(attrs, node, keys) {
  for (const key of keys) {
    const point = parseCoord(attrs[key] ?? node[key]);
    if (point) return point;
  }
  return null;
}

function parseCoord(value) {
  if (!value && value !== 0) return null;
  if (Array.isArray(value) && value.length >= 3) {
    const x = numberValue(value[0]);
    const y = numberValue(value[1]);
    const z = numberValue(value[2]);
    return x === null || y === null || z === null ? null : { x, y, z };
  }
  if (typeof value === 'object') {
    const x = numberValue(value.x ?? value.X);
    const y = numberValue(value.y ?? value.Y);
    const z = numberValue(value.z ?? value.Z);
    return x === null || y === null || z === null ? null : { x, y, z };
  }
  const text = String(value || '').trim();
  const directional = text.match(/\b([EWNSUD])\s*(-?\d+(?:\.\d+)?)/gi);
  if (directional?.length >= 3) {
    const out = { x: 0, y: 0, z: 0 };
    for (const entry of directional) {
      const match = /([EWNSUD])\s*(-?\d+(?:\.\d+)?)/i.exec(entry);
      if (!match) continue;
      const n = Number(match[2]);
      if (!Number.isFinite(n)) continue;
      if (/E/i.test(match[1])) out.x = n;
      else if (/W/i.test(match[1])) out.x = -n;
      else if (/N/i.test(match[1])) out.y = n;
      else if (/S/i.test(match[1])) out.y = -n;
      else if (/U/i.test(match[1])) out.z = n;
      else if (/D/i.test(match[1])) out.z = -n;
    }
    return out;
  }
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function sourceForExplicitBend(attrs = {}) {
  return String(attrs.SOURCE_FORMAT || attrs.SOURCE_CONVERTER || '').toUpperCase().includes('INPUTXML') ? 'explicit-inputxml-bend' : 'explicit-staged-bend';
}

function numberValue(value) {
  const n = Number.parseFloat(String(value ?? '').replace(/mm/gi, '').trim());
  return Number.isFinite(n) ? n : null;
}
function readPositiveNumber(value) { const n = numberValue(value); return Number.isFinite(n) && n > 0 ? n : null; }
function token(value) { const text = String(value ?? '').trim(); return text || undefined; }
function nodeKey(explicit, point) { const explicitText = String(explicit ?? '').trim(); return explicitText || coordNodeKey(point); }
function coordNodeKey(point) { return `coord:${roundCoord(point.x)}:${roundCoord(point.y)}:${roundCoord(point.z)}`; }
function roundCoord(value) { return Number(value || 0).toFixed(3); }
function distance(a, b) { const dx = a.x - b.x; const dy = a.y - b.y; const dz = a.z - b.z; return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz)); }
