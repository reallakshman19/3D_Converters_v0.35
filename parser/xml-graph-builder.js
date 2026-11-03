/**
 * Purpose:
 * Build viewer-ready XML geometry directly from FROM/TO connectivity without routing through core PCF continuity.
 *
 * Logic reasoning:
 * - XML already contains explicit node connectivity and per-element deltas.
 * - Disconnected assemblies must be solved as independent graph components.
 * - Exact global coordinates are not always available, so seeded or synthetic placement is supported.
 * - Core PCF modules remain untouched.
 */

function _num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function _copyPoint(p = null) {
  if (!p) return null;
  return { x: _num(p.x), y: _num(p.y), z: _num(p.z), bore: _num(p.bore, 0) };
}

function _mid(a, b, bore = 0) {
  return {
    x: (_num(a?.x) + _num(b?.x)) / 2,
    y: (_num(a?.y) + _num(b?.y)) / 2,
    z: (_num(a?.z) + _num(b?.z)) / 2,
    bore: _num(bore),
  };
}

function _dist(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = _num(a.x) - _num(b.x);
  const dy = _num(a.y) - _num(b.y);
  const dz = _num(a.z) - _num(b.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function _length(dx, dy, dz) {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function _normalizeRef(v) {
  return String(v ?? '').trim();
}

function _fileStem(fileName = '') {
  const base = String(fileName || 'XML').split(/[\/]/).pop() || 'XML';
  return base.replace(/\.[^.]+$/, '') || 'XML';
}

function _pointKey(p) {
  return `${_num(p?.x).toFixed(6)}|${_num(p?.y).toFixed(6)}|${_num(p?.z).toFixed(6)}`;
}

function _buildAdjacency(elements) {
  const byNode = new Map();
  for (const el of elements || []) {
    const from = Number(el.from);
    const to = Number(el.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (!byNode.has(from)) byNode.set(from, []);
    if (!byNode.has(to)) byNode.set(to, []);
    byNode.get(from).push({ next: to, el, sign: +1 });
    byNode.get(to).push({ next: from, el, sign: -1 });
  }
  return byNode;
}

function _connectedComponents(elements) {
  const adj = _buildAdjacency(elements);
  const visited = new Set();
  const comps = [];
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const queue = [node];
    visited.add(node);
    const nodeIds = [];
    const edgeSet = new Set();
    while (queue.length) {
      const cur = queue.shift();
      nodeIds.push(cur);
      for (const entry of adj.get(cur) || []) {
        const key = `${Math.min(cur, entry.next)}->${Math.max(cur, entry.next)}#${entry.el.index}`;
        edgeSet.add(key);
        if (!visited.has(entry.next)) {
          visited.add(entry.next);
          queue.push(entry.next);
        }
      }
    }
    const nodeIdSet = new Set(nodeIds);
    const compEls = (elements || []).filter((el) => nodeIdSet.has(Number(el.from)) || nodeIdSet.has(Number(el.to)));
    comps.push({ root: nodeIds[0], nodeIds, nodeIdSet, elements: compEls });
  }
  return comps;
}

function _solveComponent(component, diagnostics) {
  const positions = new Map();
  const conflicts = [];
  const queue = [component.root];
  positions.set(component.root, { x: 0, y: 0, z: 0 });
  const adj = _buildAdjacency(component.elements);

  while (queue.length) {
    const cur = queue.shift();
    const curPos = positions.get(cur);
    for (const entry of adj.get(cur) || []) {
      if (!component.nodeIdSet.has(entry.next)) continue;
      const dx = _num(entry.el.dx);
      const dy = _num(entry.el.dy);
      const dz = _num(entry.el.dz);
      const nextPos = entry.sign > 0
        ? { x: curPos.x + dx, y: curPos.y + dy, z: curPos.z + dz }
        : { x: curPos.x - dx, y: curPos.y - dy, z: curPos.z - dz };

      if (!positions.has(entry.next)) {
        positions.set(entry.next, nextPos);
        queue.push(entry.next);
      } else {
        const prev = positions.get(entry.next);
        const err = _dist(prev, nextPos);
        if (err > 0.01) {
          conflicts.push({ node: entry.next, existing: prev, computed: nextPos, delta: err, elementIndex: entry.el.index });
        }
      }
    }
  }

  for (const node of component.nodeIds) {
    if (!positions.has(node)) {
      positions.set(node, { x: 0, y: 0, z: 0 });
      diagnostics.unsolvedNodes.push(node);
    }
  }

  diagnostics.nodeConflicts.push(...conflicts);
  return positions;
}

function _layoutSolvedComponents(solved, options, diagnostics) {
  const seededComponents = new Map(Object.entries(options.componentPlacements || {}));
  const seededRoots = new Map(Object.entries(options.rootPlacements || {}));
  let cursorX = 0;
  const gap = _num(options.syntheticGapMm, 3000);

  for (let i = 0; i < solved.length; i += 1) {
    const comp = solved[i];
    const seed = seededComponents.get(String(i)) || seededRoots.get(String(comp.root));
    let offset;
    if (seed && typeof seed === 'object') {
      offset = { x: _num(seed.x), y: _num(seed.y), z: _num(seed.z) };
      diagnostics.seededPlacements.push({ componentIndex: i, root: comp.root, offset });
      diagnostics.placementMode = 'seeded';
    } else {
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      for (const p of comp.positions.values()) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
      }
      const width = Number.isFinite(minX) && Number.isFinite(maxX) ? (maxX - minX) : 0;
      offset = { x: cursorX - (Number.isFinite(minX) ? minX : 0), y: 0, z: 0 };
      diagnostics.lateRoots.push({ componentIndex: i, root: comp.root, offset, mode: 'synthetic' });
      cursorX += Math.max(width, 500) + gap;
    }

    comp.offset = offset;
    for (const [node, p] of comp.positions.entries()) {
      comp.positions.set(node, { x: p.x + offset.x, y: p.y + offset.y, z: p.z + offset.z });
    }
  }
}

function _supportBlockFromText(text = '') {
  const t = String(text || '').toUpperCase();
  const m = t.match(/CA\d+/);
  return m ? m[0] : '';
}

function _supportKindFromRestraint(r) {
  const raw = String(r?.rawType || r?.type || r?.supportDescription || '').toUpperCase();
  const block = _supportBlockFromText(raw || r?.supportBlock || '');
  if (block === 'CA100') return 'GDE';
  if (block === 'CA150' || block === 'CA250') return 'RST';
  if (/ANC(HOR)?|FIX(ED)?|RIGID/.test(raw)) return 'ANC';
  if (/GUIDE|GDE|GUI|SLIDE|HANGER/.test(raw)) return 'GDE';
  if (/REST|RST|STOP|LIM(IT)?/.test(raw)) return 'RST';
  return 'RST';
}

function _supportDirectionFromRestraint(r) {
  const raw = String(r?.rawType || r?.type || r?.supportDescription || '').toUpperCase();
  if (/NORTH/.test(raw)) return 'NORTH';
  if (/SOUTH/.test(raw)) return 'SOUTH';
  if (/EAST/.test(raw)) return 'EAST';
  if (/WEST/.test(raw)) return 'WEST';
  if (/UP/.test(raw)) return 'UP';
  if (/DOWN/.test(raw)) return 'DOWN';
  const c = r?.axisCosines;
  if (c) {
    const x = _num(c.x), y = _num(c.y), z = _num(c.z);
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    if (ay >= ax && ay >= az) return y >= 0 ? 'UP' : 'DOWN';
    if (az >= ax && az >= ay) return z >= 0 ? 'SOUTH' : 'NORTH';
    return x >= 0 ? 'EAST' : 'WEST';
  }
  const dofs = Array.isArray(r?.dofs) ? r.dofs : [];
  if (dofs.includes(2)) return 'UP';
  if (dofs.includes(3)) return 'NORTH';
  if (dofs.includes(1)) return 'EAST';
  return '';
}

function _classifyElement(el) {
  const name = String(el?.name || '').toUpperCase();
  const rigidType = String(el?.rigidType || '').toUpperCase();
  if (el?.hasBend) return 'BEND';
  if (/VALVE/.test(name) || /VALVE/.test(rigidType)) return 'VALVE';
  if (/FLANGE/.test(name) || /FLANGE/.test(rigidType)) return 'FLANGE';
  if (/TEE/.test(name)) return 'TEE';
  if (/REDUC/.test(name)) return 'REDUCER';
  return 'PIPE';
}

function _branchRole(component, nodeDegrees, el) {
  const fromDeg = nodeDegrees.get(Number(el.from)) || 0;
  const toDeg = nodeDegrees.get(Number(el.to)) || 0;
  const maxDeg = Math.max(fromDeg, toDeg);
  const minDeg = Math.min(fromDeg, toDeg);
  if (maxDeg >= 3) return minDeg <= 1 ? 'BRANCH_OFF' : 'RUN';
  if (fromDeg === 1 || toDeg === 1) return 'DEADLEG';
  return 'RUN';
}

function _buildNodeDegrees(elements) {
  const degrees = new Map();
  for (const el of elements || []) {
    const from = Number(el.from);
    const to = Number(el.to);
    degrees.set(from, (degrees.get(from) || 0) + 1);
    degrees.set(to, (degrees.get(to) || 0) + 1);
  }
  return degrees;
}

function _componentLengthMm(el) {
  return _length(_num(el.dx), _num(el.dy), _num(el.dz));
}

function _makeLineSquareNodes(solvedComponents, fileName, options) {
  const stem = _fileStem(fileName);
  const nodes = [];
  for (let i = 0; i < solvedComponents.length; i += 1) {
    const comp = solvedComponents[i];
    let min = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY };
    let max = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY };
    for (const p of comp.positions.values()) {
      min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
    }
    const text = String(options.lineLabelText || '').trim() || `${options.lineLabelPrefix || 'ASSEMBLY'} ${i + 1} (${stem})`;
    nodes.push({
      text,
      pos: {
        x: (min.x + max.x) / 2,
        y: max.y,
        z: (min.z + max.z) / 2,
      },
    });
  }
  return nodes;
}

function _makeNodeCircleNodes(solvedComponents) {
  const rows = [];
  for (const comp of solvedComponents) {
    for (const [node, p] of comp.positions.entries()) {
      rows.push({ text: String(node), pos: { x: p.x, y: p.y, z: p.z } });
    }
  }
  return rows;
}

function _indexBends(parsed) {
  const map = new Map();
  for (const b of parsed?.bends || []) {
    const ptr = Number(b?.ptr);
    if (Number.isFinite(ptr) && ptr > 0) {
      map.set(ptr, b);
    }
  }
  return map;
}

export function buildXmlGraphData(parsed, fileName, options = {}) {
  const diagnostics = {
    graphComponents: 0,
    nodeConflicts: [],
    unsolvedNodes: [],
    lateRoots: [],
    placementMode: 'synthetic',
    seededPlacements: [],
  };

  const elements = Array.isArray(parsed?.elements) ? parsed.elements : [];
  if (!elements.length) {
    return {
      kind: 'xml-direct',
      fileName,
      parsed,
      components: [],
      messageCircleNodes: [],
      messageSquareNodes: [],
      solvedNodePositions: {},
      diagnostics,
    };
  }

  const connected = _connectedComponents(elements);
  diagnostics.graphComponents = connected.length;
  const nodeDegrees = _buildNodeDegrees(elements);
  const bendByPtr = _indexBends(parsed);

  const solvedComponents = connected.map((comp) => ({
    ...comp,
    positions: _solveComponent(comp, diagnostics),
  }));

  _layoutSolvedComponents(solvedComponents, options, diagnostics);

  const components = [];
  const nodeToPos = new Map();

  solvedComponents.forEach((comp, componentIndex) => {
    for (const [node, pos] of comp.positions.entries()) {
      nodeToPos.set(Number(node), pos);
    }

    for (const el of comp.elements) {
      const p1 = _copyPoint(comp.positions.get(Number(el.from)));
      const p2 = _copyPoint(comp.positions.get(Number(el.to)));
      if (!p1 || !p2) continue;

      const type = _classifyElement(el);
      const bore = _num(el.od, 0);
      const role = _branchRole(comp, nodeDegrees, el);

      const attrs = {
        'PIPELINE-REFERENCE': _normalizeRef(el.lineNo || ''),
        MATERIAL: String(el.material || ''),
        SKEY: String(el.name || type),
        'COMPONENT-ATTRIBUTE1': el.P1 ? `${Math.round(_num(el.P1) * 100)} KPA` : '',
        'COMPONENT-ATTRIBUTE2': el.T1 ? `${Math.round(_num(el.T1))} C` : '',
        'COMPONENT-ATTRIBUTE3': String(el.material || ''),
        'COMPONENT-ATTRIBUTE4': el.wall ? `${_num(el.wall).toFixed(3)} MM` : '',
        'COMPONENT-ATTRIBUTE5': el.corrosion ? `${_num(el.corrosion).toFixed(3)} MM` : '',
        'COMPONENT-ATTRIBUTE97': `XML-${componentIndex + 1}-${el.index + 1}`,
        'COMPONENT-ATTRIBUTE98': String(el.index + 1),
        GRAPH_ROLE: role,
        XML_ELEMENT_NAME: String(el.name || ''),
      };

      if (el.lineNo) attrs.LINE_NO = String(el.lineNo);

      let centrePoint = null;
      let bendMeta = null;

      if (type === 'BEND') {
        bendMeta = bendByPtr.get(Number(el.bendPtr)) || null;

        // IMPORTANT:
        // For XML direct import, the bend's NEAR_NODE is the best available
        // corner/apex control point. This is what the 3D elbow builder needs.
        const nearNode = Number(bendMeta?.nearNode || 0);
        const cp = Number.isFinite(nearNode) && nearNode > 0
          ? comp.positions.get(nearNode) || nodeToPos.get(nearNode) || null
          : null;

        if (cp) {
          centrePoint = { x: cp.x, y: cp.y, z: cp.z };
        }
      }

      components.push({
        id: `XML-${componentIndex + 1}-${el.index + 1}`,
        type,
        points: [p1, p2],
        centrePoint,
        branch1Point: null,
        coOrds: null,
        bore,
        fixingAction: '',
        attributes: attrs,
        source: {
          ...el,
          componentIndex,
          graphRole: role,
          bend: bendMeta
            ? {
                ...bendMeta,
                centrePoint: centrePoint ? { ...centrePoint } : null,
              }
            : el.bend || null,
        },
      });
    }
  });

  // NOTE:
  // We intentionally DO NOT synthesize SUPPORT components in this file anymore.
  // Support generation must come from xml-support-builder.js using solved node positions.
  // That avoids the weak RST/UP fallback path that was making everything render as
  // vertical green rest supports.

  const solvedNodePositions = {};
  for (const [nodeId, pos] of nodeToPos.entries()) {
    solvedNodePositions[nodeId] = {
      x: _num(pos.x),
      y: _num(pos.y),
      z: _num(pos.z),
      bore: _num(pos.bore, 0),
    };
  }

  return {
    kind: 'xml-direct',
    fileName,
    parsed,
    components,
    messageCircleNodes: _makeNodeCircleNodes(solvedComponents),
    messageSquareNodes: _makeLineSquareNodes(solvedComponents, fileName, options),
    solvedNodePositions,
    diagnostics,
  };
}
