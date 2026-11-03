/**
 * RvmFinal2dCsvBuilder.js
 * Wave 3/4 - builds rows for the Final 2D CSV from an RVM index.
 * Pure JS: no DOM, no three.js.
 *
 * Inputs: RVM index nodes and optional selected roots/masters.
 * Outputs: sorted Final 2D CSV row objects with bore, class, valve, support, and CA data.
 * Fallback: coordinates may use bbox-derived values; bore can fall back to line-key parsing.
 */

import { RvmPipelineRefResolver } from './RvmPipelineRefResolver.js';
import { RvmBoreConverter } from './RvmBoreConverter.js';
import { RvmPipingClassMapper } from './RvmPipingClassMapper.js';
import { RvmValveWeightMapper } from './RvmValveWeightMapper.js';
import { RvmRemainingMastersMapper } from './RvmRemainingMastersMapper.js';

const TYPE_MAP = [
  { keys: ['TUBI', 'PIPE'], type: 'PIPE', include: true },
  { keys: ['ELBO', 'ELBOW', 'BEND'], type: 'BEND', include: true },
  { keys: ['TEE'], type: 'TEE', include: true },
  { keys: ['OLET', 'WELDOLET', 'SOCKOLET'], type: 'OLET', include: true },
  { keys: ['FLAN', 'FLANGE', 'FBLI'], type: 'FLANGE', include: true },
  { keys: ['VALV', 'VALVE'], type: 'VALVE', include: true },
  { keys: ['REDU', 'REDUCER'], type: 'REDUCER-CONCENTRIC', include: true },
  { keys: ['ATTA', 'ANCI', 'SUPPORT'], type: 'SUPPORT', include: true },
  { keys: ['BRANCH'], type: 'BRANCH', include: false },
  { keys: ['GASK'], type: 'GASK', include: false },
  { keys: ['INST'], type: 'INST', include: false },
  { keys: ['WELD'], type: 'WELD', include: false },
];

function resolveType(node) {
  const raw = (node.kind || node.type || '').toUpperCase().trim();

  for (const entry of TYPE_MAP) {
    if (entry.keys.includes(raw)) {
      return { type: entry.type, include: entry.include };
    }
  }

  return { type: 'UNKNOWN', include: false };
}

const EP1_KEYS = [
  'APOS',
  'A_POS',
  'EP1',
  'START',
  'END_POINT1',
  'ABOP',
  'POS_START',
  'START_POINT',
];

const EP2_KEYS = [
  'LPOS',
  'L_POS',
  'EP2',
  'END',
  'END_POINT2',
  'LBOP',
  'POS_END',
  'END_POINT',
];

const CP_KEYS = [
  'CPOS',
  'POS',
  'POSI',
  'CENTRE_POINT',
  'CENTER_POINT',
  'CENTRE-POINT',
  'CENTER-POINT',
  'CP',
];

const BP_KEYS = [
  'BPOS',
  'BRANCH_POINT',
  'BRANCH1_POINT',
  'BRANCH-POINT',
  'BRANCH1-POINT',
  'BP',
  'BPOS1',
];

const SUPP_KEYS = [
  'POS',
  'CO_ORDS',
  'COORDS',
  'CO_ORD',
  'SUPPORT_COOR',
  'SUPPORT_COORD',
];

function parseCoord(value) {
  if (value == null) return null;

  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value;

    if ([x, y, z].every(v => typeof v === 'number' && isFinite(v))) {
      return { x, y, z };
    }

    return null;
  }

  if (typeof value === 'object') {
    const x = value.x ?? value.X;
    const y = value.y ?? value.Y;
    const z = value.z ?? value.Z;

    if ([x, y, z].every(v => typeof v === 'number' && isFinite(v))) {
      return { x, y, z };
    }

    return null;
  }

  if (typeof value === 'string') {
    const text = value.trim();

    if (!text) return null;

    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        return parseCoord(JSON.parse(text));
      } catch {
        // Fall through to text parsing.
      }
    }

    const parts = text.match(/[+-]?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?/g)?.map(Number) || [];
    if (parts.length >= 3 && parts.slice(0, 3).every(v => isFinite(v))) {
      return { x: parts[0], y: parts[1], z: parts[2] };
    }

    return null;
  }

  return null;
}

function findCoord(attrs, keys) {
  for (const k of keys) {
    if (k in attrs) {
      const c = parseCoord(attrs[k]);
      if (c) return c;
    }
  }

  return null;
}

function coordDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;

  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);

  if (![dx, dy, dz].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

/**
 * Shared direction map for AVEVA compass labels.
 */
const _ORI_DIR_MAP = Object.freeze({
  U:  { x: 0,  y: 0,  z: 1  },
  D:  { x: 0,  y: 0,  z: -1 },
  N:  { x: 0,  y: 1,  z: 0  },
  S:  { x: 0,  y: -1, z: 0  },
  E:  { x: 1,  y: 0,  z: 0  },
  W:  { x: -1, y: 0,  z: 0  },
  NE: { x: 0.707,  y: 0.707,  z: 0 },
  NW: { x: -0.707, y: 0.707,  z: 0 },
  SE: { x: 0.707,  y: -0.707, z: 0 },
  SW: { x: -0.707, y: -0.707, z: 0 },
});

/**
 * Parse AVEVA RVM ORI compass notation into a world-space direction for the Z-axis.
 * Used for OLETs where the branch exits along the component Z-axis.
 *
 * @param {string} oriString  e.g. "Y is N and Z is U"
 * @returns {{x,y,z}|null}
 */
function _parseAvevaOri(oriString) {
  if (!oriString || typeof oriString !== 'string') return null;
  const zMatch = oriString.match(/\bZ\s+is\s+([A-Z]{1,2})\b/i);
  if (zMatch) {
    const dir = zMatch[1].toUpperCase();
    if (_ORI_DIR_MAP[dir]) return _ORI_DIR_MAP[dir];
  }
  return null;
}

/**
 * Parse full ORI into both Y-axis and Z-axis world directions.
 * @param {string} oriString  e.g. "Y is N and Z is U"
 * @returns {{ yDir: {x,y,z}, zDir: {x,y,z} } | null}
 */
function _parseAvevaOriFull(oriString) {
  if (!oriString || typeof oriString !== 'string') return null;
  const yMatch = oriString.match(/\bY\s+is\s+([A-Z]{1,2})\b/i);
  const zMatch = oriString.match(/\bZ\s+is\s+([A-Z]{1,2})\b/i);
  if (!yMatch || !zMatch) return null;
  const yDir = _ORI_DIR_MAP[yMatch[1].toUpperCase()];
  const zDir = _ORI_DIR_MAP[zMatch[1].toUpperCase()];
  if (!yDir || !zDir) return null;
  return { yDir, zDir };
}

/**
 * 3D cross product a × b.
 */
function _cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Normalize a 3D vector in-place (returns same ref).
 */
function _normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-9) return null;
  v.x /= len; v.y /= len; v.z /= len;
  return v;
}

/**
 * Derive TEE branch point from AVEVA ORI compass notation.
 *
 * AVEVA TEE convention:
 *   - Component Y-axis = run direction (along EP1→EP2)
 *   - Component Z-axis = vertical/up
 *   - Component X-axis = branch direction (perpendicular to run)
 *
 * We reconstruct X = Y × Z from ORI to get the branch world-direction,
 * then verify it's perpendicular to the actual run (EP1→EP2).
 * If ORI X-axis is NOT perpendicular to the run, fall back to computing
 * the perpendicular from the run direction crossed with ORI Z-axis.
 *
 * @param {{x,y,z}} cp        Centre point
 * @param {{x,y,z}} ep1       End point 1
 * @param {{x,y,z}} ep2       End point 2
 * @param {string}  oriValue  ORI attribute e.g. "Y is N and Z is U"
 * @param {number}  brlen     Branch length in mm
 * @returns {{x,y,z}|null}
 */
function _deriveTeeBpFromOri(cp, ep1, ep2, oriValue, brlen) {
  if (!cp || !brlen || brlen <= 0) return null;

  const ori = _parseAvevaOriFull(oriValue);
  if (!ori) return null;

  // Component X-axis = Y × Z (right-hand rule)
  let branchDir = _cross(ori.yDir, ori.zDir);
  branchDir = _normalize(branchDir);
  if (!branchDir) return null;

  // Verify branch is roughly perpendicular to the actual run direction.
  // If EP1/EP2 are available, use them to validate.
  if (ep1 && ep2) {
    const runDir = _normalize({
      x: ep2.x - ep1.x,
      y: ep2.y - ep1.y,
      z: ep2.z - ep1.z,
    });
    if (runDir) {
      const dot = branchDir.x * runDir.x + branchDir.y * runDir.y + branchDir.z * runDir.z;
      // If not roughly perpendicular (dot > 0.3), recompute from run × Z-axis
      if (Math.abs(dot) > 0.3) {
        let altDir = _cross(runDir, ori.zDir);
        altDir = _normalize(altDir);
        if (altDir) branchDir = altDir;
      }
    }
  }

  return {
    x: cp.x + branchDir.x * brlen,
    y: cp.y + branchDir.y * brlen,
    z: cp.z + branchDir.z * brlen,
  };
}

/**
 * Parse a length value that may include a unit suffix like "263mm" or "895mm".
 * Returns value in mm as a number, or null.
 */
function _parseLengthMm(value) {
  if (value == null) return null;
  const s = String(value).trim();
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)\s*mm?$/i);
  if (m) return Number(m[1]);
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Derive OLET branch point from AVEVA ORI compass notation + branch length + cp.
 * For OLETs, the branch exits along the component Z-axis.
 * bp = cp + branchDir * brlen
 *
 * @param {{x,y,z}} cp       Centre point
 * @param {string}  oriValue ORI attribute e.g. "Y is N and Z is U"
 * @param {*}       brlenValue  Branch length (mm), with or without "mm" suffix
 * @returns {{x,y,z}|null}
 */
function _deriveOletBpFromOri(cp, oriValue, brlenValue) {
  if (!cp) return null;

  const dir = _parseAvevaOri(oriValue);
  if (!dir) return null;

  const brlen = _parseLengthMm(brlenValue);
  if (!brlen || brlen <= 0) return null;

  return {
    x: cp.x + dir.x * brlen,
    y: cp.y + dir.y * brlen,
    z: cp.z + dir.z * brlen,
  };
}

function parseBbox(bbox) {
  if (!bbox) return null;

  let min;
  let max;

  if (Array.isArray(bbox.min) && Array.isArray(bbox.max)) {
    min = { x: bbox.min[0], y: bbox.min[1], z: bbox.min[2] };
    max = { x: bbox.max[0], y: bbox.max[1], z: bbox.max[2] };
  } else if (
    bbox.minX != null &&
    bbox.minY != null &&
    bbox.minZ != null &&
    bbox.maxX != null &&
    bbox.maxY != null &&
    bbox.maxZ != null
  ) {
    min = { x: bbox.minX, y: bbox.minY, z: bbox.minZ };
    max = { x: bbox.maxX, y: bbox.maxY, z: bbox.maxZ };
  } else {
    return null;
  }

  return { min, max };
}

function bboxMidpoint(parsed) {
  return {
    x: (parsed.min.x + parsed.max.x) / 2,
    y: (parsed.min.y + parsed.max.y) / 2,
    z: (parsed.min.z + parsed.max.z) / 2,
  };
}

export class RvmFinal2dCsvBuilder {
  /**
   * @param {object} rvmIndex - { nodes: [...] }
   * @param {object} options - { selectedCanonicalIds?: string[], masters?: {}, selectedRootIds?: string[] }
   */
  constructor(rvmIndex, options = {}) {
    this._index = rvmIndex;
    this._selected = options.selectedCanonicalIds || [];
    this._masters = options.masters || {};

    this._resolver = new RvmPipelineRefResolver(rvmIndex, {
      selectedRootIds: options.selectedRootIds || [],
    });
    this._boreConverter = new RvmBoreConverter();
    const getRows = key => (this._masters[key] && this._masters[key].rows) || [];
    const getBlocks = key => (this._masters[key] && this._masters[key].blocks) || [];

    const mapperData = {
      linelist: getRows('linelist'),
      pipingClassMaster: getRows('pipingClass'),
      weightMaster: getRows('weight'),
      supportMaster: getBlocks('supportMapping'),
      branchGeometryMaster: getRows('branchGeometry'),
      skeyMaster: getRows('pipingClass')
    };

    this._pipingClassMapper = new RvmPipingClassMapper(mapperData);
    this._valveWeightMapper = new RvmValveWeightMapper(mapperData);
    this._remainingMastersMapper = new RvmRemainingMastersMapper(mapperData);

    const allNodes = (rvmIndex && rvmIndex.nodes) || [];
    const nodeById = new Map(allNodes.map(n => [n.canonicalObjectId, n]));

    this._nodeById = nodeById;
    this._refIndex = new Map();
    this._ancestorMap = new Map();

    for (const n of allNodes) {
      this._indexNodeReferences(n);

      const chain = [];
      let current = nodeById.get(n.parentCanonicalObjectId);

      while (current) {
        chain.push(current);
        current = nodeById.get(current.parentCanonicalObjectId);
      }

      this._ancestorMap.set(n.canonicalObjectId, chain);
    }
  }

  _indexNodeReferences(node) {
    const attrs = node?.attributes || {};
    const tokens = [
      node?.canonicalObjectId,
      node?.name,
      attrs.NAME,
      attrs.OWNER,
      attrs.REF,
      attrs.CREF,
      attrs.HREF,
      attrs.TREF,
    ];

    for (const raw of tokens) {
      const token = this._normalizeRefToken(raw);
      if (!token) continue;
      if (!this._refIndex.has(token)) {
        this._refIndex.set(token, []);
      }
      this._refIndex.get(token).push(node);
    }
  }

  _normalizeRefToken(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  _getNodeCoords(node) {
    const attrs = node?.attributes || {};
    const coordKeys = ['BPOS', 'APOS', 'LPOS', 'POS', 'HPOS', 'TPOS'];
    const coords = [];

    for (const key of coordKeys) {
      const coord = parseCoord(attrs[key]);
      if (coord) coords.push({ key, coord });
    }

    return coords;
  }

  _pickNearestCoord(candidates, target, preferFarthest = false) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    if (!target) return candidates[0].coord || null;

    let best = null;
    let bestDist = preferFarthest ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const coord = candidate?.coord || null;
      const dist = coordDistance(coord, target);
      if (preferFarthest ? dist > bestDist : dist < bestDist) {
        bestDist = dist;
        best = coord;
      }
    }

    return best;
  }

  _resolveReferencedBranchPoint(refToken, targetCoord, preferFarthest = false, type = null) {
    const token = this._normalizeRefToken(refToken);
    if (!token) return null;

    const refNodes = this._refIndex.get(token) || [];
    if (!refNodes.length) return null;

    const candidates = [];
    for (const refNode of refNodes) {
      candidates.push(...this._getNodeCoords(refNode));
    }

    const preferredKeys = type === 'OLET'
      ? ['BPOS', 'BRANCH1-POINT', 'BRANCH1_POINT', 'BRANCH_POINT', 'BP', 'BPOS1', 'POS']
      : ['BPOS', 'BRANCH1-POINT', 'BRANCH1_POINT', 'BRANCH_POINT', 'BP', 'BPOS1'];

    const preferredCandidates = candidates.filter((entry) =>
      preferredKeys.includes(String(entry?.key || '').toUpperCase())
    );

    const ordered = preferredCandidates.length ? preferredCandidates : candidates;
    return this._pickNearestCoord(ordered, targetCoord, preferFarthest);
  }

  build() {
    const nodes = this._resolveScope();
    const rows = nodes.map(n => this._buildRow(n));
    const diagnostics = [];

    rows.sort((a, b) => {
      const sp = (a.sourcePath || '').localeCompare(b.sourcePath || '');
      if (sp !== 0) return sp;

      const tp = (a.type || '').localeCompare(b.type || '');
      if (tp !== 0) return tp;

      return (a.sourceCanonicalId || '').localeCompare(b.sourceCanonicalId || '');
    });

    rows.forEach((r, i) => {
      r.rowNo = (i + 1) * 10;
    });

    return { rows, diagnostics };
  }

  _resolveScope() {
    const allNodes = this._index.nodes || [];

    if (this._selected.length === 0) {
      return allNodes;
    }

    const childrenOf = new Map();

    for (const n of allNodes) {
      const pid = n.parentCanonicalObjectId;

      if (pid != null) {
        if (!childrenOf.has(pid)) childrenOf.set(pid, []);
        childrenOf.get(pid).push(n.canonicalObjectId);
      }
    }

    const included = new Set();

    const expand = id => {
      if (included.has(id)) return;

      included.add(id);

      for (const cid of childrenOf.get(id) || []) {
        expand(cid);
      }
    };

    for (const id of this._selected) {
      expand(id);
    }

    return allNodes.filter(n => included.has(n.canonicalObjectId));
  }

  _buildRow(node) {
    const { type, include } = resolveType(node);
    const attrs = node.attributes || {};
    const bbox = parseBbox(node.bbox);
    const rowDiags = [];

    const ancestorChain = this._ancestorMap.get(node.canonicalObjectId) || [];
    const { pipelineRef, source: pipelineRefSource } = this._resolver.resolve(
      node,
      ancestorChain
    );

    const lineKey = this._boreConverter.findLineKey(attrs, [
      pipelineRef,
      node.name,
      node.path,
      node.canonicalObjectId,
    ]);

    const lineKeyBoreCandidate = this._boreConverter.parseLineKeyBoreMm(lineKey);

    let classAttrFallback = '';
    for (const key of Object.keys(attrs)) {
      if (['PIPING_CLASS', 'CLASS', 'SPEC'].includes(key.toUpperCase()) && attrs[key]) {
         classAttrFallback = attrs[key];
         break;
      }
    }
    const rawBore = this._boreConverter.findRawBore(attrs);
    const boreResult = this._boreConverter.convertBoreWithContext(rawBore, attrs, [lineKey, classAttrFallback]);

    if (boreResult.convertedBoreSource === 'LINE-KEY') {
      rowDiags.push('BORE-LINEKEY-FALLBACK');
    } else if (lineKeyBoreCandidate != null && boreResult.convertedBore == null) {
      rowDiags.push('BORE-LINEKEY-CANDIDATE-NOT-USED');
    }

    if (boreResult.convertedBore == null) {
      rowDiags.push('BORE-UNRESOLVED');
    }

    let ep1 = findCoord(attrs, EP1_KEYS);
    let ep1Fallback = false;

    if (!ep1 && bbox) {
      ep1 = bbox.min;
      ep1Fallback = true;
      rowDiags.push('EP1-BBOX-FALLBACK');
    }

    let ep2 = findCoord(attrs, EP2_KEYS);
    let ep2Fallback = false;

    if (!ep2 && bbox) {
      ep2 = bbox.max;
      ep2Fallback = true;
      rowDiags.push('EP2-BBOX-FALLBACK');
    }

    const centerHint = findCoord(attrs, CP_KEYS);
    let cp = centerHint;
    let cpFallback = false;

    if (!cp && bbox) {
      cp = bboxMidpoint(bbox);
      cpFallback = true;
      rowDiags.push('CP-MIDPOINT-FALLBACK');
    }

    if (!cp && ep1 && ep2) {
      cp = {
        x: (ep1.x + ep2.x) / 2,
        y: (ep1.y + ep2.y) / 2,
        z: (ep1.z + ep2.z) / 2,
      };
      cpFallback = true;
      rowDiags.push('CP-ENDPOINT-MIDPOINT-FALLBACK');
    }

    let bp = findCoord(attrs, BP_KEYS);

    if ((type === 'OLET' || type === 'TEE') && bp && cp && coordDistance(bp, cp) === 0) {
      rowDiags.push('BP-CP-COLLAPSED');
      bp = null;
    }

    // --- TEE / OLET: ORI-vector direction (preferred for branches — always perpendicular to run) ---
    // AVEVA RVM encodes orientation in ORI: "Y is N and Z is U".
    //   OLET: branch exits along component Z-axis → use Z direction directly.
    //   TEE:  branch exits along component X-axis (perpendicular to run Y-axis)
    //         → compute X = Y × Z from ORI to get branch world-direction.
    if (!bp && (type === 'OLET' || type === 'TEE') && cp) {
      const oriVal = attrs.ORI ?? attrs.ori ?? null;
      if (oriVal) {
        // Derive a reasonable default brlen from SPRE bore ratio
        let defaultBrlen = null;
        const spreVal = String(attrs.SPRE ?? attrs.spre ?? '');
        const spreMatch = spreVal.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
        if (spreMatch) {
          const branchBore = Math.min(Number(spreMatch[1]), Number(spreMatch[2]));
          if (Number.isFinite(branchBore) && branchBore > 0) {
            defaultBrlen = branchBore * 4;
          }
        }
        // Fallback: parse header bore from ABORE/LBORE and use ~60% as default nozzle
        if (!defaultBrlen) {
          const boreStr = String(attrs.ABORE ?? attrs.LBORE ?? attrs.convertedBore ?? '');
          const boreNum = Number(boreStr.replace(/[^0-9.]/g, ''));
          if (Number.isFinite(boreNum) && boreNum > 0) {
            defaultBrlen = boreNum * 0.6;
          }
        }
        if (!defaultBrlen && type === 'TEE' && ep1 && ep2) {
          defaultBrlen = coordDistance(ep1, ep2) / 2;
        }
        if (!defaultBrlen) defaultBrlen = 200; // absolute fallback

        let derived = null;
        if (type === 'TEE') {
          // TEE: branch is perpendicular to run — use X = Y × Z from ORI
          derived = _deriveTeeBpFromOri(cp, ep1, ep2, oriVal, defaultBrlen);
        } else {
          // OLET: branch exits along component Z-axis
          derived = _deriveOletBpFromOri(cp, oriVal, defaultBrlen);
        }
        if (derived) {
          bp = derived;
          rowDiags.push('BP-ORI-DERIVED');
        }
      }
    }

    // --- TEE / OLET: CREF reference fallback (last resort for direction) ---
    if (!bp && (type === 'TEE' || type === 'OLET')) {
      const cref = attrs.CREF || attrs.cref || null;
      const targetCoord = cp || centerHint || ep1 || ep2 || (bbox ? bboxMidpoint(bbox) : null);
      bp = this._resolveReferencedBranchPoint(cref, targetCoord, type === 'OLET', type);
      if (bp) {
        rowDiags.push('BP-CREF-FALLBACK');
      }
    }

    if (!bp && type === 'TEE' && bbox) {
      bp = bboxMidpoint(bbox);
      rowDiags.push('BP-BBOX-FALLBACK');
    }



    let supportCoor = findCoord(attrs, SUPP_KEYS);

    if (!supportCoor && bbox) {
      supportCoor = bboxMidpoint(bbox);
      rowDiags.push('SUPPORT-COOR-BBOX-FALLBACK');
    }

    if (type === 'UNKNOWN') {
      rowDiags.push('TYPE-UNKNOWN');
    }

    const epFallback = ep1Fallback || ep2Fallback || cpFallback;

    const partialRow = {
      attributes: attrs,
      pipelineRef,
      convertedBore: boreResult.convertedBore,
      type,
    };

    const classResult = this._pipingClassMapper.mapRow(partialRow);

    const valveRow = {
      attributes: attrs,
      type,
      convertedBore: boreResult.convertedBore,
      rating: classResult.pipingClassRating ?? null,
      rowNo: null,
      ca: {},
      diagnostics: rowDiags,
    };

    const valveResult = this._valveWeightMapper.mapRow(valveRow);

    const row = {
      rowNo: null,
      sourceCanonicalId: node.canonicalObjectId,
      sourcePath: node.path || node.name || node.canonicalObjectId,
      name: node.name || node.canonicalObjectId,
      type,
      kind: node.kind,
      include,

      ep1: ep1 || null,
      ep2: ep2 || null,
      cp: cp || null,
      bp: bp || null,
      supportCoor: supportCoor || null,
      _epFallback: epFallback,

      attributes: attrs,
      diagnostics: rowDiags,

      pipelineRef,
      pipelineRefSource,

      lineKey,
      lineKeyBoreCandidate,

      rawBore,
      bore: boreResult.bore,
      convertedBore: boreResult.convertedBore,
      convertedBoreStatus: boreResult.convertedBoreStatus,
      convertedBoreSource: boreResult.convertedBoreSource,
      boreMapping: boreResult.boreMapping,

      ...classResult,

      ca: valveRow.ca,
      valveWeightSource: valveResult.valveWeightSource,
      valveWeightLengthMm: valveResult.valveWeightLengthMm,
      ambiguousValveWeightRequests: valveResult.ambiguousValveWeightRequests,
    };

    this._remainingMastersMapper.mapRow(row);

    return row;
  }
}
