/**
 * xml-support-builder.js
 *
 * Purpose:
 * Build robust SUPPORT viewer components directly from XML restraint data.
 *
 * Why:
 * XML restraints carry support semantics differently from PCF. Routing XML
 * through PCF continuity often loses support direction and support kind.
 *
 * Invariants:
 * - Core PCF modules remain untouched.
 * - Output must match the viewer's expected SUPPORT component shape.
 * - Support direction is normalized into renderer-friendly tokens.
 */

import { debugSupport } from '../debug/support-debug.js';
import { resolveKindPure } from '../support/SupportKindResolver.js';

function _num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function _pt(p) {
  if (!p) return null;
  return {
    x: _num(p.x),
    y: _num(p.y),
    z: _num(p.z),
  };
}

function _norm(v) {
  const x = _num(v?.x);
  const y = _num(v?.y);
  const z = _num(v?.z);
  const len = Math.sqrt((x * x) + (y * y) + (z * z));
  if (len < 1e-9) return null;
  return { x: x / len, y: y / len, z: z / len };
}

function _dot(a, b) {
  return (_num(a?.x) * _num(b?.x)) + (_num(a?.y) * _num(b?.y)) + (_num(a?.z) * _num(b?.z));
}

function _absDot(a, b) {
  return Math.abs(_dot(a, b));
}

function _cross(a, b) {
  return {
    x: (_num(a?.y) * _num(b?.z)) - (_num(a?.z) * _num(b?.y)),
    y: (_num(a?.z) * _num(b?.x)) - (_num(a?.x) * _num(b?.z)),
    z: (_num(a?.x) * _num(b?.y)) - (_num(a?.y) * _num(b?.x)),
  };
}

function _uniqueInts(list) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.trunc(v)))]
    .sort((a, b) => a - b);
}

function _upperText(...parts) {
  return parts
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

function _legacySupportKind(kind) {
  const k = String(kind || '').toUpperCase().trim();
  if (k === 'ANCHOR') return 'ANC';
  if (k === 'GUIDE') return 'GDE';
  if (k === 'REST') return 'RST';
  if (k === 'LINESTOP' || k === 'LIMIT') return 'STP';
  if (k === 'SPRING') return 'SPR';
  return 'UNK';
}

function _supportKindFromText(text) {
  return _legacySupportKind(resolveKindPure(
    { NAME: _upperText(text) },
    { userRules: [], kindMap: {}, defaultKind: '' },
  ));
}

function _supportKindFromBlock(blockCode) {
  const b = String(blockCode || '').toUpperCase().trim();
  if (!b) return 'UNK';

  const resolved = _legacySupportKind(resolveKindPure(
    { SKEY: b },
    { userRules: [], kindMap: {}, defaultKind: '' },
  ));
  if (resolved !== 'UNK') return resolved;

  // Preserve existing catalogue mappings not yet covered by resolver defaults.
  if (b === 'CA300') return 'ANC';
  if (b === 'CA350') return 'STP';

  return 'UNK';
}

function _supportKindFromDofs(dofs, verticalAxis = 'Y') {
  const set = new Set(_uniqueInts(dofs));
  if (set.size === 0) return 'UNK';

  const verticalDOF = verticalAxis === 'Z' ? 3 : 2;

  // Fully restrained or rotationally clamped nodes map visually to Anchors
  if (set.size >= 5 || (set.has(1) && set.has(2) && set.has(3))) return 'ANC';

  // If it only acts vertically, it's a Rest (shoe/trunnion/dummy leg)
  if (set.size === 1 && set.has(verticalDOF)) return 'RST';

  // If it restricts ANY lateral translation (DOF 1 or 3 for Y-up),
  // regardless of if it also rests vertically, visually treat it as a Guide.
  const laterals = verticalAxis === 'Z' ? [1, 2] : [1, 3];
  for (const lat of laterals) {
    if (set.has(lat)) return 'GDE';
  }

  // Fallbacks: If vertical is still present despite other rotational dofs
  if (set.has(verticalDOF)) return 'RST';

  return 'UNK';
}

function _axisFromCosines(axisCosines) {
  const axis = _norm(axisCosines);
  return axis || null;
}

function _cardinalFromAxis(axis, opts = {}) {
  const upAxisName = String(opts.verticalAxis || 'Y').toUpperCase();
  const worldNorth = _norm(opts.worldNorth || { x: 0, y: 0, z: -1 }) || { x: 0, y: 0, z: -1 };

  const up = upAxisName === 'Z'
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };

  const east = _norm(_cross(worldNorth, up)) || { x: 1, y: 0, z: 0 };
  const west = { x: -east.x, y: -east.y, z: -east.z };
  const south = { x: -worldNorth.x, y: -worldNorth.y, z: -worldNorth.z };
  const down = { x: -up.x, y: -up.y, z: -up.z };

  const scores = [
    { dir: 'UP', score: _absDot(axis, up) },
    { dir: 'DOWN', score: _absDot(axis, down) },
    { dir: 'NORTH', score: _absDot(axis, worldNorth) },
    { dir: 'SOUTH', score: _absDot(axis, south) },
    { dir: 'EAST', score: _absDot(axis, east) },
    { dir: 'WEST', score: _absDot(axis, west) },
  ].sort((a, b) => b.score - a.score);

  return scores[0]?.dir || '';
}

function _semanticDirection(axis, supportKind, opts = {}) {
  if (!axis) return '';

  const verticalAxisName = String(opts.verticalAxis || 'Y').toUpperCase();
  const up = verticalAxisName === 'Z'
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };

  const verticalness = _absDot(axis, up);

  // Rest-like supports should resolve to UP/DOWN.
  if (supportKind === 'RST' || supportKind === 'SPR') {
    return _dot(axis, up) >= 0 ? 'UP' : 'DOWN';
  }

  // Guide/stop/lateral/axial supports resolve to horizontal cardinals.
  if (verticalness < 0.75) {
    return _cardinalFromAxis(axis, opts);
  }

  // Fallback if axis points mostly vertical.
  return _dot(axis, up) >= 0 ? 'UP' : 'DOWN';
}

function _pipeAxisFromNode(nodeId, parsed) {
  const elements = Array.isArray(parsed?.elements) ? parsed.elements : [];
  const candidates = [];

  for (const el of elements) {
    if (!el) continue;
    if (Number(el.from) !== Number(nodeId) && Number(el.to) !== Number(nodeId)) continue;

    const dx = _num(el.dx);
    const dy = _num(el.dy);
    const dz = _num(el.dz);
    const axis = _norm({ x: dx, y: dy, z: dz });
    if (axis) candidates.push(axis);
  }

  if (!candidates.length) return null;

  // Choose the longest-stable/first usable axis for now.
  // This is enough for rendering support frames.
  return candidates[0];
}

function _supportKindFromAxisAndPipe(axis, pipeAxis, verticalAxis = 'Y') {
  if (!axis) return 'UNK';
  const up = String(verticalAxis || 'Y').toUpperCase() === 'Z'
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };
  if (_absDot(axis, up) >= 0.75) return 'RST';
  if (!pipeAxis) return 'UNK';
  return _absDot(axis, pipeAxis) >= 0.75 ? 'STP' : 'GDE';
}

function _supportName(blockCode, kind, rawText) {
  if (blockCode) return blockCode;
  if (kind && kind !== 'UNK') return kind;
  const text = String(rawText || '').trim();
  return text ? text.slice(0, 40) : 'SUPPORT';
}

function _stringifyAxis(axis) {
  if (!axis) return '';
  return `${_num(axis.x)}, ${_num(axis.y)}, ${_num(axis.z)}`;
}

/**
 * Build support viewer components directly from parsed XML restraints.
 *
 * @param {object} parsed
 * @param {object} options
 * @param {string} [options.verticalAxis='Y']
 * @param {{x:number,y:number,z:number}} [options.worldNorth]
 * @param {number} [options.defaultBore=100]
 * @returns {Array<object>}
 */
export function buildXmlSupportComponents(parsed, options = {}) {
  const supports = [];

  const nodePositions = options?.nodePositions || parsed?.nodes || {};
  const restraints = Array.isArray(parsed?.restraints) ? parsed.restraints : [];
  const verticalAxis = String(options.verticalAxis || 'Y').toUpperCase();
  const worldNorth = _norm(options.worldNorth || parsed?.north || { x: 0, y: 0, z: -1 }) || { x: 0, y: 0, z: -1 };
  const defaultBore = _num(options.defaultBore, 100);

  for (const r of restraints) {
    const nodeId = Number(r?.node ?? r?.NODE ?? r?.id);
    const sourceId = String(r?.guid || r?.id || `xml-restraint-${nodeId}`);

    if (!Number.isFinite(nodeId) || nodeId <= 0) {
      debugSupport({
        stage: 'xml-support-builder',
        sourceId,
        nodeId,
        skipped: true,
        skipReason: 'invalid-node-id',
        rawType: String(r?.rawType || r?.type || ''),
        supportBlock: String(r?.supportBlock || ''),
      });
      continue;
    }

    const pos = nodePositions[nodeId] || nodePositions[String(nodeId)];
    if (!pos) {
      debugSupport({
        stage: 'xml-support-builder',
        sourceId,
        nodeId,
        skipped: true,
        skipReason: 'missing-node-position',
        rawType: String(r?.rawType || r?.type || ''),
        supportBlock: String(r?.supportBlock || ''),
        typeCode: r?.typeCode,
        dofs: r?.dofs,
        axisCosines: r?.axisCosines || null,
      });
      continue;
    }

    const rawType = String(r?.rawType || r?.type || r?.name || 'XML restraint').trim();
    const supportBlock = String(r?.supportBlock || '').toUpperCase().trim();
    const axis = _axisFromCosines(r?.axisCosines);
    const pipeAxis = _pipeAxisFromNode(nodeId, parsed);

    const kindFromBlock = _supportKindFromBlock(supportBlock);
    const kindFromText = _supportKindFromText(rawType);
    const kindFromDofs = _supportKindFromDofs(r?.dofs, verticalAxis);
    const kindFromAxis = _supportKindFromAxisAndPipe(axis, pipeAxis, verticalAxis);

    let supportKind = 'UNK';
    if (kindFromBlock !== 'UNK') supportKind = kindFromBlock;
    else if (kindFromText !== 'UNK') supportKind = kindFromText;
    else if (kindFromDofs !== 'UNK') supportKind = kindFromDofs;
    else if (kindFromAxis !== 'UNK') supportKind = kindFromAxis;

    const supportDirection = _semanticDirection(axis, supportKind, {
      verticalAxis,
      worldNorth,
    });

    if (supportKind === 'UNK' && !axis) {
      debugSupport({
        stage: 'xml-support-builder',
        sourceId,
        nodeId,
        skipped: true,
        skipReason: 'no-kind-and-no-axis',
        rawType,
        supportBlock,
        typeCode: r?.typeCode,
        dofs: r?.dofs,
      });
      continue;
    }

    const supportName = _supportName(supportBlock, supportKind, rawType);
    const guid = String(r?.guid || `UCI:${nodeId}`);

    if (supportKind === 'RST' && supportDirection === 'UP') {
      debugSupport({
        stage: 'xml-support-builder',
        sourceId,
        nodeId,
        warning: 'rest-up-fallback',
        rawType,
        supportBlock,
        typeCode: r?.typeCode,
        dofs: r?.dofs,
        axisCosines: _stringifyAxis(axis),
        pipeAxisCosines: _stringifyAxis(pipeAxis),
        kindFromBlock,
        kindFromText,
        kindFromDofs,
        resolvedKind: supportKind,
        resolvedDirection: supportDirection,
        positionFound: true,
        skipped: false,
      });
    } else {
      debugSupport({
        stage: 'xml-support-builder',
        sourceId,
        nodeId,
        rawType,
        supportBlock,
        typeCode: r?.typeCode,
        dofs: r?.dofs,
        axisCosines: _stringifyAxis(axis),
        pipeAxisCosines: _stringifyAxis(pipeAxis),
        kindFromBlock,
        kindFromText,
        kindFromDofs,
        resolvedKind: supportKind,
        resolvedDirection: supportDirection,
        positionFound: true,
        skipped: false,
      });
    }

    supports.push({
      id: `xml-support-${nodeId}-${supportName}`,
      type: 'SUPPORT',
      points: [],
      centrePoint: null,
      branch1Point: null,
      coOrds: _pt(pos),
      bore: _num(pos?.bore, defaultBore),
      fixingAction: '',
      attributes: {
        SKEY: supportName,
        SUPPORT_NAME: supportName,
        SUPPORT_TAG: rawType,
        SUPPORT_KIND: supportKind,
        SUPPORT_DESC: String(r?.supportDescription || ''),
        SUPPORT_GUID: guid,
        SUPPORT_DIRECTION: supportDirection,
        SUPPORT_DOFS: _uniqueInts(r?.dofs).join(','),
        AXIS_COSINES: _stringifyAxis(axis),
        PIPE_AXIS_COSINES: _stringifyAxis(pipeAxis),
        SUPPORT_FRICTION: r?.friction ?? '',
        SUPPORT_GAP: r?.gap ?? '',
        '<SUPPORT_NAME>': supportName,
        '<SUPPORT_GUID>': guid,
        NODE_ID: String(nodeId),
        SOURCE: 'XML',
      },
      source: {
        ...(r || {}),
        SUPPORT_NAME: supportName,
        SUPPORT_KIND: supportKind,
        SUPPORT_DIRECTION: supportDirection,
        AXIS_COSINES: _stringifyAxis(axis),
        PIPE_AXIS_COSINES: _stringifyAxis(pipeAxis),
        SUPPORT_GUID: guid,
      },
    });
  }

  return supports;
}
