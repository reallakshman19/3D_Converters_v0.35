import * as THREE from 'three';
import { RvmIdentityMap } from './RvmIdentityMap.js';
import { state } from '../core/state.js';
import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';

const FITTING_TYPES = new Set(['VALVE', 'FLANGE', 'ELBOW', 'BEND', 'TEE', 'OLET', 'GASK', 'REDUCER', 'INST']);
const PIPE_TYPES = new Set(['PIPE']);
const SUPPORT_TYPES = new Set(['SUPPORT', 'ATTA', 'ANCI']);
const MIN_ROUTE_GAP_EPS = 0.0001;
const TOPOLOGY_METHODS = Object.freeze({
  STRICT: 'topology_strict',
  LEGACY: 'topology_legacy',
  RAY: 'topology_ray'
});
const DEFAULT_RVM_ROUTING = Object.freeze({
  topologyMethod: TOPOLOGY_METHODS.LEGACY,
  routeThroughInstEnabled: false
});

function asNumber(value) {
  const n = Number.parseFloat(String(value ?? '').replace(/mm/gi, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseDirCoordText(text) {
  const src = String(text || '').trim();
  if (!src) return null;
  const tokens = src.split(/\s+/g);
  const out = { x: 0, y: 0, z: 0 };
  let parsedAny = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i];
    const n = asNumber(tokens[i + 1]);
    if (n === null) continue;
    if (axis === 'E') {
      out.x = n;
      parsedAny = true;
    } else if (axis === 'W') {
      out.x = -n;
      parsedAny = true;
    } else if (axis === 'N') {
      out.y = n;
      parsedAny = true;
    } else if (axis === 'S') {
      out.y = -n;
      parsedAny = true;
    } else if (axis === 'U') {
      out.z = n;
      parsedAny = true;
    } else if (axis === 'D') {
      out.z = -n;
      parsedAny = true;
    }
  }
  return parsedAny ? out : null;
}

function normalizeCoord(value) {
  if (!value && value !== 0) return null;
  if (Array.isArray(value) && value.length >= 3) {
    const x = asNumber(value[0]);
    const y = asNumber(value[1]);
    const z = asNumber(value[2]);
    if (x === null || y === null || z === null) return null;
    return { x, y, z };
  }
  if (typeof value === 'string') {
    const directional = parseDirCoordText(value);
    if (directional) return directional;
    const parts = String(value).trim().split(/[,\s]+/g).map((part) => asNumber(part)).filter((part) => part !== null);
    if (parts.length >= 3) {
      return { x: parts[0], y: parts[1], z: parts[2] };
    }
    return null;
  }
  if (typeof value === 'object') {
    const x = asNumber(value.x);
    const y = asNumber(value.y);
    const z = asNumber(value.z);
    if (x === null || y === null || z === null) return null;
    return { x, y, z };
  }
  return null;
}

function copyCoord(coord) {
  if (!coord) return null;
  return { x: coord.x, y: coord.y, z: coord.z };
}

function bboxFromElement(element) {
  if (!Array.isArray(element?.bbox) || element.bbox.length !== 6) return null;
  const nums = element.bbox.map((value) => asNumber(value));
  if (nums.some((value) => value === null)) return null;
  return nums;
}

function bboxCenter(element) {
  const bbox = bboxFromElement(element);
  if (!bbox) return null;
  const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
  return { x: minX + ((maxX - minX) * 0.5), y: minY + ((maxY - minY) * 0.5), z: minZ + ((maxZ - minZ) * 0.5) };
}

function bboxDims(element) {
  const bbox = bboxFromElement(element);
  if (!bbox) return null;
  const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
  const dx = Math.abs(maxX - minX);
  const dy = Math.abs(maxY - minY);
  const dz = Math.abs(maxZ - minZ);
  return { dx, dy, dz, max: Math.max(dx, dy, dz), min: Math.min(dx, dy, dz), mid: [dx, dy, dz].sort((a, b) => a - b)[1] };
}

function getAttrs(element) {
  if (!element || typeof element !== 'object') return {};
  return (element.attributes && typeof element.attributes === 'object') ? element.attributes : {};
}

function normalizedType(element) {
  const rawType = String(element?.type || getAttrs(element).TYPE || '').toUpperCase().trim();
  if (rawType) {
    if (rawType === 'VALV' || rawType === 'VALVE') return 'VALVE';
    if (rawType === 'FLAN' || rawType === 'FLANGE') return 'FLANGE';
    if (rawType === 'ELBO' || rawType === 'ELBOW') return 'ELBOW';
    if (rawType === 'BEND') return 'BEND';
    if (rawType === 'TEE') return 'TEE';
    if (rawType === 'OLET') return 'OLET';
    if (rawType === 'GASK') return 'GASK';
    if (rawType === 'INST' || rawType === 'INSTRUMENT') return 'INST';
    if (rawType === 'REDU' || rawType === 'REDUCER' || rawType === 'REDUCER-CONCENTRIC' || rawType === 'REDUCER-ECCENTRIC') return 'REDUCER';
    if (rawType === 'PIPE' || rawType === 'TUBI') return 'PIPE';
    if (rawType === 'BRANCH' || rawType === 'BRAN') return 'BRANCH';
    if (rawType === 'SUPPORT' || rawType === 'ATTA' || rawType === 'ANCI') return 'SUPPORT';
    return rawType;
  }
  const n = String(element?.name || '').toUpperCase();
  if (n.includes('VALV')) return 'VALVE';
  if (n.includes('FLAN')) return 'FLANGE';
  if (n.includes('ELBO') || n.includes('BEND')) return 'ELBOW';
  if (n.includes('TEE')) return 'TEE';
  if (n.includes('OLET')) return 'OLET';
  if (n.includes('GASK')) return 'GASK';
  if (n.includes('INST') || n.includes('INSTRUMENT')) return 'INST';
  if (n.includes('REDU')) return 'REDUCER';
  if (n.includes('BRANCH') || n.includes('BRAN')) return 'BRANCH';
  if (n.includes('SUPPORT') || n.includes('ATTA')) return 'SUPPORT';
  if (n.includes('PIPE') || n.includes('TUBI')) return 'PIPE';
  return 'UNKNOWN';
}

function getAposLpos(element) {
  const attrs = getAttrs(element);
  const pickCoord = (keys) => {
    for (const key of keys) {
      const value = attrs[key] ?? element[key];
      const point = normalizeCoord(value);
      if (point) return point;
    }
    return null;
  };
  const apos = pickCoord(['APOS', 'A_POS', 'EP1', 'END_POINT1', 'POS_START', 'POSSTART', 'START_POINT', 'START', 'ABOP']);
  const lpos = pickCoord(['LPOS', 'L_POS', 'EP2', 'END_POINT2', 'POS_END', 'POSEND', 'END_POINT', 'END', 'LBOP']);
  const pos = pickCoord(['POS', 'CO_ORDS', 'COORDS', 'CO_ORD']);
  const cpos = pickCoord(['CPOS', 'CENTRE_POINT', 'CENTER_POINT', 'CENTRE-POINT', 'CENTER-POINT', 'CP']);
  const bpos = pickCoord(['BPOS', 'BRANCH1_POINT', 'BRANCH_POINT', 'BRANCH1-POINT', 'BRANCH-POINT', 'BPOS1', 'BP']);
  return { apos, lpos, pos, cpos, bpos };
}

function midpointCoord(a, b) {
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5
  };
}

function anchorCoordFromElement(element) {
  const pts = getAposLpos(element);
  if (pts.pos) return pts.pos;
  if (pts.apos && pts.lpos) return midpointCoord(pts.apos, pts.lpos);
  if (pts.apos) return pts.apos;
  if (pts.lpos) return pts.lpos;
  return bboxCenter(element);
}

function normalizePathToken(value) {
  const text = String(value || '').trim();
  return text ? text.toUpperCase() : '';
}

function resolveRoutingConfig(rawConfig) {
  const source = (rawConfig && typeof rawConfig === 'object') ? rawConfig : {};
  const method = String(source.topologyMethod || '').trim().toLowerCase();
  let topologyMethod = DEFAULT_RVM_ROUTING.topologyMethod;
  if (method === TOPOLOGY_METHODS.LEGACY) topologyMethod = TOPOLOGY_METHODS.LEGACY;
  if (method === TOPOLOGY_METHODS.RAY) topologyMethod = TOPOLOGY_METHODS.RAY;
  const routeThroughInstEnabled = source.routeThroughInstEnabled === true;
  return { topologyMethod, routeThroughInstEnabled };
}

function isPrimaryFlowType(type) {
  return type === 'PIPE'
    || type === 'VALVE'
    || type === 'FLANGE'
    || type === 'REDUCER'
    || type === 'ELBOW'
    || type === 'BEND'
    || type === 'TEE'
    || type === 'OLET'
    || type === 'GASK';
}

function collectAnchorCandidates(element) {
  const points = getAposLpos(element);
  const candidates = [];
  const seen = new Set();
  const pushCoord = (value) => {
    const coord = normalizeCoord(value);
    if (!coord) return;
    const key = `${coord.x}|${coord.y}|${coord.z}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(coord);
  };
  pushCoord(points.pos);
  pushCoord(points.apos);
  pushCoord(points.lpos);
  pushCoord(points.cpos);
  pushCoord(points.bpos);
  // Only synthesize anchors when explicit coordinates are unavailable.
  if (candidates.length === 0) pushCoord(midpointCoord(points.apos, points.lpos));
  if (candidates.length === 0) pushCoord(bboxCenter(element));
  return candidates;
}

function buildOwnerPositionIndex(topoRoots) {
  const index = new Map();
  const addEntry = (ownerKey, entry) => {
    if (!ownerKey) return;
    if (!index.has(ownerKey)) index.set(ownerKey, []);
    index.get(ownerKey).push(entry);
  };
  const walk = (element, parentPath) => {
    if (!element || typeof element !== 'object') return;
    const name = String(element.name || element.id || '').trim() || 'Node';
    const currentPath = parentPath ? `${parentPath}/${name}` : name;
    const attrs = getAttrs(element);
    const ownerKey = normalizePathToken(attrs.OWNER ?? element.OWNER);
    const anchors = collectAnchorCandidates(element);
    if (ownerKey && anchors.length > 0) {
      addEntry(ownerKey, { anchors, path: currentPath, type: normalizedType(element) });
    }
    if (Array.isArray(element.children)) {
      for (const child of element.children) walk(child, currentPath);
    }
  };
  for (const root of topoRoots || []) walk(root, '');
  return index;
}

// Resolve tee/olet branch direction from CREF:
// pick nearest child anchor on the referenced branch line (OWNER == CREF).
function resolveNearestCrefAnchor(element, currentPath, ownerPositionIndex) {
  if (!ownerPositionIndex || typeof ownerPositionIndex.get !== 'function') return null;
  const attrs = getAttrs(element);
  const crefKey = normalizePathToken(attrs.CREF ?? element.CREF);
  if (!crefKey) return null;
  const anchors = ownerPositionIndex.get(crefKey);
  if (!Array.isArray(anchors) || !anchors.length) return null;
  const base = anchorCoordFromElement(element);
  if (!base) return null;

  const minDistance = 1.0;
  let nearest = null;
  let nearestScore = Number.POSITIVE_INFINITY;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const entry of anchors) {
    if (!entry) continue;
    if (entry.path === currentPath) continue;
    const type = String(entry.type || '').toUpperCase();
    let typePenalty = 35;
    if (type === 'PIPE') typePenalty = 0;
    else if (type === 'BRANCH') typePenalty = 65;
    else if (isPrimaryFlowType(type)) typePenalty = 10;
    else if (SUPPORT_TYPES.has(type)) typePenalty = 80;
    const candidateAnchors = Array.isArray(entry.anchors) && entry.anchors.length > 0
      ? entry.anchors
      : (entry.pos ? [entry.pos] : []);
    for (const candidate of candidateAnchors) {
      const dist = coordDistance(base, candidate);
      if (!Number.isFinite(dist) || dist < minDistance) continue;
      const score = dist + typePenalty;
      if (score < nearestScore || (Math.abs(score - nearestScore) < 1e-9 && dist < nearestDist)) {
        nearestScore = score;
        nearestDist = dist;
        nearest = candidate;
      }
    }
  }
  return nearest;
}

function ensureSyntheticEndpointsFromBBox(element) {
  const type = normalizedType(element);
  if (!FITTING_TYPES.has(type) && !SUPPORT_TYPES.has(type)) return element;
  const attrs = getAttrs(element);
  const existing = getAposLpos({ attributes: attrs });
  if (existing.apos && existing.lpos) return element;
  const center = bboxCenter(element);
  const dims = bboxDims(element);
  if (!center || !dims) return element;

  const span = Math.max(dims.max, 0.0001);
  const half = Math.max(span * 0.5, 0.00005);
  let axis = 'x';
  if (dims.dy >= dims.dx && dims.dy >= dims.dz) axis = 'y';
  else if (dims.dz >= dims.dx && dims.dz >= dims.dy) axis = 'z';

  const apos = { x: center.x, y: center.y, z: center.z };
  const lpos = { x: center.x, y: center.y, z: center.z };
  apos[axis] -= half;
  lpos[axis] += half;

  return {
    ...element,
    attributes: {
      ...attrs,
      APOS: apos,
      LPOS: lpos,
      SYNTHETIC_ENDPOINTS: 'bbox'
    }
  };
}

function coordDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function isFitting(element) {
  return FITTING_TYPES.has(normalizedType(element));
}

function isPipeLike(element) {
  return PIPE_TYPES.has(normalizedType(element));
}

function isRouteableFittingEntry(entry, routingConfig) {
  if (!entry || !entry.child) return false;
  if (!isFitting(entry.child)) return false;
  const type = normalizedType(entry.child);
  const rawPoints = getAposLpos(entry.raw);
  if (!exactPortCandidatesFromPoints(rawPoints).length) return false;
  if (type !== 'INST') return true;
  return shouldIncludeInstInRouting(entry.child, rawPoints, routingConfig);
}

function pickBore(attrs) {
  const keys = ['HBOR', 'TBOR', 'ABORE', 'LBORE', 'DTXR', 'BORE'];
  for (const key of keys) {
    const value = asNumber(attrs?.[key]);
    if (Number.isFinite(value) && value > 0) return { key, value, raw: String(attrs[key]) };
  }
  return null;
}

function hasInlineRouteMetadata(attrs) {
  if (pickBore(attrs)) return true;
  const joined = [
    attrs?.TYPE,
    attrs?.SPRE,
    attrs?.LSTU,
    attrs?.SKEY,
    attrs?.NAME
  ].map((value) => String(value || '').toUpperCase()).join(' ');
  return /VALV|VALVE|INLINE|IN-LINE/.test(joined);
}

function shouldIncludeInstInRouting(element, rawPoints, routingConfig) {
  if (!routingConfig.routeThroughInstEnabled) return false;
  if (!rawPoints?.apos || !rawPoints?.lpos) return false;
  return hasInlineRouteMetadata(getAttrs(element));
}

function exactPortCandidatesFromPoints(points) {
  const pts = points || {};
  const candidates = [];
  if (pts.apos) candidates.push({ key: 'APOS', coord: pts.apos });
  if (pts.lpos) candidates.push({ key: 'LPOS', coord: pts.lpos });
  if (pts.bpos) candidates.push({ key: 'BPOS', coord: pts.bpos });
  return candidates;
}

function collectIdentityTokens(element) {
  const attrs = getAttrs(element);
  const ids = new Set();
  const add = (value) => {
    const token = normalizePathToken(value);
    if (token) ids.add(token);
  };
  add(attrs.REF ?? element.REF);
  add(attrs.NAME ?? element.NAME);
  add(element.name);
  return ids;
}

function ownerToken(element) {
  const attrs = getAttrs(element);
  return normalizePathToken(attrs.OWNER ?? element.OWNER);
}

function hasLinkTokenMatch(fromElement, toElement) {
  const fromAttrs = getAttrs(fromElement);
  const toIds = collectIdentityTokens(toElement);
  const href = normalizePathToken(fromAttrs.HREF ?? fromElement.HREF);
  const tref = normalizePathToken(fromAttrs.TREF ?? fromElement.TREF);
  const cref = normalizePathToken(fromAttrs.CREF ?? fromElement.CREF);
  if (href && toIds.has(href)) return true;
  if (tref && toIds.has(tref)) return true;
  if (cref && (toIds.has(cref) || cref === ownerToken(toElement))) return true;
  return false;
}

function isTopologyProvenSequentialPair(current, next, branchOwnerKey) {
  const ownerA = ownerToken(current);
  const ownerB = ownerToken(next);
  if (ownerA && ownerB && ownerA === ownerB && (!branchOwnerKey || ownerA === branchOwnerKey)) return true;
  if (hasLinkTokenMatch(current, next)) return true;
  if (hasLinkTokenMatch(next, current)) return true;
  return false;
}

function resolvePreferredPortKeys(current, next) {
  const currentIds = collectIdentityTokens(current);
  const nextIds = collectIdentityTokens(next);
  const currentAttrs = getAttrs(current);
  const nextAttrs = getAttrs(next);
  const currentPreferred = new Set();
  const nextPreferred = new Set();

  const currentHref = normalizePathToken(currentAttrs.HREF ?? current.HREF);
  const currentTref = normalizePathToken(currentAttrs.TREF ?? current.TREF);
  const nextHref = normalizePathToken(nextAttrs.HREF ?? next.HREF);
  const nextTref = normalizePathToken(nextAttrs.TREF ?? next.TREF);

  if ((currentTref && nextIds.has(currentTref)) || (nextHref && currentIds.has(nextHref))) {
    currentPreferred.add('LPOS');
    nextPreferred.add('APOS');
  }
  if ((currentHref && nextIds.has(currentHref)) || (nextTref && currentIds.has(nextTref))) {
    currentPreferred.add('APOS');
    nextPreferred.add('LPOS');
  }

  const currentCref = normalizePathToken(currentAttrs.CREF ?? current.CREF);
  const nextCref = normalizePathToken(nextAttrs.CREF ?? next.CREF);
  if (currentCref && currentCref === ownerToken(next)) currentPreferred.add('BPOS');
  if (nextCref && nextCref === ownerToken(current)) nextPreferred.add('BPOS');

  return { currentPreferred, nextPreferred };
}

function selectTopologyPortPair(current, next, currentPts, nextPts) {
  const aCandidates = exactPortCandidatesFromPoints(currentPts);
  const bCandidates = exactPortCandidatesFromPoints(nextPts);
  if (!aCandidates.length || !bCandidates.length) return null;
  const preferred = resolvePreferredPortKeys(current, next);
  const preferredA = preferred.currentPreferred.size
    ? aCandidates.filter((entry) => preferred.currentPreferred.has(entry.key))
    : [];
  const preferredB = preferred.nextPreferred.size
    ? bCandidates.filter((entry) => preferred.nextPreferred.has(entry.key))
    : [];
  const fromCandidates = preferredA.length ? preferredA : aCandidates;
  const toCandidates = preferredB.length ? preferredB : bCandidates;

  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const a of fromCandidates) {
    for (const b of toCandidates) {
      const dist = coordDistance(a.coord, b.coord);
      if (!Number.isFinite(dist)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          start: a.coord,
          end: b.coord,
          startKey: a.key,
          endKey: b.key,
          gap: dist
        };
      }
    }
  }
  return best;
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function percentile(sortedValues, pct) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  const p = clamp(pct, 0, 100) / 100;
  const idx = (sortedValues.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const w = idx - lo;
  return sortedValues[lo] + ((sortedValues[hi] - sortedValues[lo]) * w);
}

function vectorBetween(a, b) {
  if (!a || !b) return null;
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

function normalizeVector(v) {
  if (!v) return null;
  const len = Math.sqrt((v.x * v.x) + (v.y * v.y) + (v.z * v.z));
  if (!Number.isFinite(len) || len <= 1e-9) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dotVector(a, b) {
  if (!a || !b) return 0;
  return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
}

function negateVector(v) {
  if (!v) return null;
  return { x: -v.x, y: -v.y, z: -v.z };
}

function midPoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 };
}

function flowVectorFromPoints(points) {
  if (points?.apos && points?.lpos) return normalizeVector(vectorBetween(points.apos, points.lpos));
  const runMid = midPoint(points?.apos, points?.lpos);
  if (runMid && points?.bpos) return normalizeVector(vectorBetween(runMid, points.bpos));
  return null;
}

function rayExitPorts(points) {
  const out = [];
  if (points?.lpos) out.push({ key: 'LPOS', coord: points.lpos });
  if (points?.bpos) out.push({ key: 'BPOS', coord: points.bpos });
  if (points?.apos) out.push({ key: 'APOS', coord: points.apos });
  return out;
}

function rayEntryPorts(points) {
  const out = [];
  if (points?.apos) out.push({ key: 'APOS', coord: points.apos });
  if (points?.bpos) out.push({ key: 'BPOS', coord: points.bpos });
  if (points?.lpos) out.push({ key: 'LPOS', coord: points.lpos });
  return out;
}

function legacySequentialPair(currentPts, nextPts) {
  // Primary: strict LPOS→APOS (original behaviour, preserved when both ports are present)
  const start = currentPts?.lpos;
  const end = nextPts?.apos;
  const gap = coordDistance(start, end);
  if (Number.isFinite(gap)) return { start, end, startKey: 'LPOS', endKey: 'APOS', gap };

  // Fallback: LPOS or APOS is absent on one side. Find the closest available port pair
  // across {APOS, LPOS, BPOS} × {APOS, LPOS, BPOS} to bridge the physical gap.
  // Soundness: adjacent fittings in a branch are always physically closest to each other,
  // so the minimum-distance port pair always identifies the intended pipe connection.
  const aCandidates = exactPortCandidatesFromPoints(currentPts);
  const bCandidates = exactPortCandidatesFromPoints(nextPts);
  if (!aCandidates.length || !bCandidates.length) return null;
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const a of aCandidates) {
    for (const b of bCandidates) {
      const dist = coordDistance(a.coord, b.coord);
      if (!Number.isFinite(dist)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = { start: a.coord, end: b.coord, startKey: a.key, endKey: b.key, gap: dist };
      }
    }
  }
  return best;
}

function adaptiveRayMaxGap(entries) {
  const ports = [];
  for (const entry of entries) {
    const points = getAposLpos(entry.raw);
    for (const candidate of exactPortCandidatesFromPoints(points)) {
      ports.push({ entry, ...candidate });
    }
  }
  if (ports.length < 2) return 1500;

  const nearest = [];
  for (let i = 0; i < ports.length; i += 1) {
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < ports.length; j += 1) {
      if (i === j) continue;
      if (ports[i].seqIndex === ports[j].seqIndex) continue;
      const d = coordDistance(ports[i].coord, ports[j].coord);
      if (Number.isFinite(d) && d < best) best = d;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }
  if (!nearest.length) return 1500;

  nearest.sort((a, b) => a - b);
  const p25 = percentile(nearest, 25);
  const p75 = percentile(nearest, 75);
  if (!Number.isFinite(p25) || !Number.isFinite(p75)) return 1500;
  const iqr = p75 - p25;
  return clamp(p75 + (1.5 * iqr), 50, 1500);
}

function createAutoPipeElement(branchNode, label, startCoord, endCoord, bore) {
  return {
    name: `PIPE AUTO ${String(branchNode.name || 'BRANCH')} ${label}`,
    type: 'PIPE',
    attributes: {
      APOS: copyCoord(startCoord),
      LPOS: copyCoord(endCoord),
      AUTO_GENERATED_PIPE: 'true',
      GAP_MM: coordDistance(startCoord, endCoord).toFixed(3),
      ...(bore ? { [bore.key]: bore.raw, BORE: String(bore.value), BORE_SOURCE: `inherited from ${bore.key}` } : {})
    }
  };
}

function routeBranchChildren(branchNode, rawRoutingConfig) {
  const routingConfig = resolveRoutingConfig(rawRoutingConfig);
  const srcChildrenRaw = Array.isArray(branchNode?.children) ? branchNode.children : [];
  const srcChildren = srcChildrenRaw.map((child) => ensureSyntheticEndpointsFromBBox(child));
  if (!srcChildren.length) return [];
  const branchAttrs = getAttrs(branchNode);

  // REV->XML local import already carries explicit route-bearing PIPE and fitting entries.
  // Auto-routing here would drop source PIPE children and regenerate synthetic links,
  // which degrades topology fidelity into skeleton-like fan-outs.
  if (String(branchAttrs.SOURCE_FORMAT || '').toUpperCase() === 'REV_XML') {
    return srcChildren;
  }

  const paired = srcChildren.map((child, index) => ({ child, raw: srcChildrenRaw[index] }));
  const filteredPairs = paired.filter((entry) => !isPipeLike(entry.child));
  const filtered = filteredPairs.map((entry) => entry.child);
  const fittings = filteredPairs
    .filter((entry) => isRouteableFittingEntry(entry, routingConfig))
    .map((entry, index) => ({ ...entry, seqIndex: index }));

  if (fittings.length === 0) return filtered;

  const spans = fittings.map((fitting) => {
    const dims = bboxDims(fitting.child);
    if (!dims) return 0;
    return Math.max(dims.mid, dims.min, 0);
  }).filter((value) => Number.isFinite(value) && value > 0);
  spans.sort((a, b) => a - b);
  const medianSpan = spans.length ? spans[Math.floor(spans.length * 0.5)] : 0;
  const routeGapTolerance = Math.max(MIN_ROUTE_GAP_EPS, medianSpan * 0.005);

  const syntheticAfter = new Map();
  const branchBore = pickBore(getAttrs(branchNode));
  const branchOwnerKey = normalizePathToken(getAttrs(branchNode).NAME ?? branchNode.name);
  const pairUsed = new Set();
  const portUsed = new Set();
  let autoCounter = 1;

  const pairKey = (a, b) => {
    const lo = Math.min(a.seqIndex, b.seqIndex);
    const hi = Math.max(a.seqIndex, b.seqIndex);
    return `${lo}:${hi}`;
  };
  const portKey = (entry, key) => `${entry.seqIndex}|${key}`;
  const appendPipe = (fromEntry, toEntry, pair, routeMethod) => {
    if (!pair || !pair.start || !pair.end) return false;
    const gap = pair.gap;
    if (!Number.isFinite(gap) || gap <= routeGapTolerance) return false;
    const edgeKey = pairKey(fromEntry, toEntry);
    if (pairUsed.has(edgeKey)) return false;
    const fromPortKey = portKey(fromEntry, pair.startKey || 'LPOS');
    const toPortKey = portKey(toEntry, pair.endKey || 'APOS');
    if (portUsed.has(fromPortKey) || portUsed.has(toPortKey)) return false;

    const bore = pickBore(getAttrs(fromEntry.child)) || pickBore(getAttrs(toEntry.child)) || branchBore;
    const pipe = createAutoPipeElement(branchNode, String(autoCounter++), pair.start, pair.end, bore);
    pipe.attributes.ROUTE_TIER = routeMethod;
    if (!syntheticAfter.has(fromEntry.child)) syntheticAfter.set(fromEntry.child, []);
    syntheticAfter.get(fromEntry.child).push(pipe);
    pairUsed.add(edgeKey);
    portUsed.add(fromPortKey);
    portUsed.add(toPortKey);
    return true;
  };

  if (routingConfig.topologyMethod === TOPOLOGY_METHODS.STRICT) {
    for (let i = 0; i < fittings.length - 1; i += 1) {
      const current = fittings[i];
      const next = fittings[i + 1];
      if (!isTopologyProvenSequentialPair(current.child, next.child, branchOwnerKey)) continue;
      const currentPts = getAposLpos(current.raw);
      const nextPts = getAposLpos(next.raw);
      const pair = selectTopologyPortPair(current.child, next.child, currentPts, nextPts);
      appendPipe(current, next, pair, 'STRICT');
    }
  } else if (routingConfig.topologyMethod === TOPOLOGY_METHODS.LEGACY) {
    for (let i = 0; i < fittings.length - 1; i += 1) {
      const current = fittings[i];
      const next = fittings[i + 1];
      const currentPts = getAposLpos(current.raw);
      const nextPts = getAposLpos(next.raw);
      const pair = legacySequentialPair(currentPts, nextPts);
      appendPipe(current, next, pair, 'LEGACY');
    }
  } else if (routingConfig.topologyMethod === TOPOLOGY_METHODS.RAY) {
    const maxGap = adaptiveRayMaxGap(fittings);
    const edgeCandidates = [];
    for (const fromEntry of fittings) {
      const fromPoints = getAposLpos(fromEntry.raw);
      const flowFrom = flowVectorFromPoints(fromPoints);
      const exits = rayExitPorts(fromPoints);
      for (const start of exits) {
        const startUse = portKey(fromEntry, start.key);
        if (portUsed.has(startUse)) continue;
        for (const toEntry of fittings) {
          if (fromEntry.seqIndex === toEntry.seqIndex) continue;
          if (pairUsed.has(pairKey(fromEntry, toEntry))) continue;
          const toPoints = getAposLpos(toEntry.raw);
          const flowTo = flowVectorFromPoints(toPoints);
          const entries = rayEntryPorts(toPoints);
          for (const end of entries) {
            const endUse = portKey(toEntry, end.key);
            if (portUsed.has(endUse)) continue;
            const gap = coordDistance(start.coord, end.coord);
            if (!Number.isFinite(gap) || gap <= routeGapTolerance || gap > maxGap) continue;

            const gapVec = normalizeVector(vectorBetween(start.coord, end.coord));
            if (!gapVec) continue;
            const alignFrom = flowFrom ? dotVector(flowFrom, gapVec) : 1;
            if (flowFrom && alignFrom <= 0) continue;
            const alignTo = flowTo ? dotVector(negateVector(flowTo), gapVec) : 1;

            const fromPenalty = flowFrom ? (alignFrom > 0.9 ? 1.0 : 10.0) : 4.0;
            const toPenalty = flowTo ? (alignTo > 0.75 ? 1.0 : 6.0) : 3.0;
            const score = gap * fromPenalty * toPenalty;

            edgeCandidates.push({
              fromEntry,
              toEntry,
              pair: {
                start: start.coord,
                end: end.coord,
                startKey: start.key,
                endKey: end.key,
                gap
              },
              score
            });
          }
        }
      }
    }
    edgeCandidates.sort((a, b) => (a.score - b.score) || (a.pair.gap - b.pair.gap));
    for (const candidate of edgeCandidates) {
      appendPipe(candidate.fromEntry, candidate.toEntry, candidate.pair, 'RAY');
    }
  }

  // Bridge HPOS → first fitting and last fitting → TPOS with synthetic stub pipes.
  // The fitting-to-fitting loop only routes adjacent pairs; these stubs cover the
  // physical pipe run between the branch connection point and the nearest fitting.
  const hpos = normalizeCoord(branchAttrs.HPOS ?? branchNode.HPOS);
  const tpos = normalizeCoord(branchAttrs.TPOS ?? branchNode.TPOS);

  const headPipes = [];
  if (hpos && fittings.length > 0) {
    const firstFitting = fittings[0];
    const firstPts = getAposLpos(firstFitting.raw);
    const firstPorts = exactPortCandidatesFromPoints(firstPts);
    let nearestPort = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const p of firstPorts) {
      const d = coordDistance(hpos, p.coord);
      if (d < nearestDist) { nearestDist = d; nearestPort = p; }
    }
    if (nearestPort && nearestDist > routeGapTolerance) {
      const bore = pickBore(getAttrs(firstFitting.child)) || branchBore;
      const pipe = createAutoPipeElement(branchNode, 'HEAD', hpos, nearestPort.coord, bore);
      pipe.attributes.ROUTE_TIER = 'BRANCH_HEAD';
      headPipes.push(pipe);
    }
  }

  const tailPipes = [];
  if (tpos && fittings.length > 0) {
    const lastFitting = fittings[fittings.length - 1];
    const lastPts = getAposLpos(lastFitting.raw);
    const lastPorts = exactPortCandidatesFromPoints(lastPts);
    let nearestPort = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const p of lastPorts) {
      const d = coordDistance(tpos, p.coord);
      if (d < nearestDist) { nearestDist = d; nearestPort = p; }
    }
    if (nearestPort && nearestDist > routeGapTolerance) {
      const bore = pickBore(getAttrs(lastFitting.child)) || branchBore;
      const pipe = createAutoPipeElement(branchNode, 'TAIL', nearestPort.coord, tpos, bore);
      pipe.attributes.ROUTE_TIER = 'BRANCH_TAIL';
      tailPipes.push(pipe);
    }
  }

  const merged = [];
  merged.push(...headPipes);
  for (const child of filtered) {
    merged.push(child);
    const extras = syntheticAfter.get(child);
    if (extras && extras.length) merged.push(...extras);
  }
  merged.push(...tailPipes);
  return merged;
}

function preprocessTopologyTree(element) {
  if (!element || typeof element !== 'object') return element;
  const withSynthetic = ensureSyntheticEndpointsFromBBox(element);
  const cloned = {
    ...withSynthetic,
    attributes: getAttrs(withSynthetic),
    children: Array.isArray(withSynthetic.children) ? withSynthetic.children.map((c) => preprocessTopologyTree(c)) : []
  };
  const type = normalizedType(cloned);
  if (type === 'BRANCH') {
    cloned.children = routeBranchChildren(cloned, state.rvm?.routing || DEFAULT_RVM_ROUTING);
  }
  return cloned;
}

function computeRadius(element, segmentLength, defaultRadius) {
  const attrs = getAttrs(element);
  const bore = pickBore(attrs);
  if (bore) {
    return Math.max(bore.value * 0.5, 2.0);
  }
  // No reliable bore in source: derive from dataset default + local span.
  const span = Number.isFinite(segmentLength) ? segmentLength : 50;
  const datasetRadius = Number.isFinite(defaultRadius) ? defaultRadius : (span * 0.04);
  const localCap = Math.max(span * 0.22, datasetRadius);
  const localFloor = Math.max(span * 0.01, datasetRadius * 0.35, 0.0001);
  return Math.min(localCap, Math.max(localFloor, datasetRadius));
}

function createSegmentCylinder(startVec, endVec, radius, material, radialSegments) {
  const diff = new THREE.Vector3().subVectors(endVec, startVec);
  const length = diff.length();
  if (!Number.isFinite(length) || length < 0.001) return null;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.clone().normalize());
  return mesh;
}

function createDiscMesh(position, normal, radius, thickness, material) {
  const safeThickness = Math.max(thickness, 0.001);
  const geometry = new THREE.CylinderGeometry(radius, radius, safeThickness, 20);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  return mesh;
}

function createTubeFromCurve(curve, radius, material, tubularSegments, radialSegments) {
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  return new THREE.Mesh(geometry, material);
}

function toVector(coord) {
  const point = normalizeCoord(coord);
  if (!point) return null;
  return new THREE.Vector3(point.x, point.y, point.z);
}

function directionTokenToVector(token) {
  const t = String(token || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!t) return null;
  if (t === 'E' || t === 'EAST') return new THREE.Vector3(1, 0, 0);
  if (t === 'W' || t === 'WEST') return new THREE.Vector3(-1, 0, 0);
  if (t === 'N' || t === 'NORTH') return new THREE.Vector3(0, 1, 0);
  if (t === 'S' || t === 'SOUTH') return new THREE.Vector3(0, -1, 0);
  if (t === 'U' || t === 'UP') return new THREE.Vector3(0, 0, 1);
  if (t === 'D' || t === 'DOWN') return new THREE.Vector3(0, 0, -1);
  if (t === 'NE' || t === 'NORTHEAST') return new THREE.Vector3(1, 1, 0).normalize();
  if (t === 'NW' || t === 'NORTHWEST') return new THREE.Vector3(-1, 1, 0).normalize();
  if (t === 'SE' || t === 'SOUTHEAST') return new THREE.Vector3(1, -1, 0).normalize();
  if (t === 'SW' || t === 'SOUTHWEST') return new THREE.Vector3(-1, -1, 0).normalize();
  return null;
}

// Parse local orientation text like "Y is D and Z is W" into world unit axes.
// Returns nullable vectors; callers must provide geometric fallbacks when axes are absent.
function parseOrientationAxes(element) {
  const attrs = getAttrs(element);
  const raw = String(attrs.ORI ?? attrs.LAXE ?? element.ORI ?? '').toUpperCase().trim();
  if (!raw) return { yAxis: null, zAxis: null, xAxis: null };
  const yMatch = raw.match(/\bY\s+IS\s+([A-Z]+)/);
  const zMatch = raw.match(/\bZ\s+IS\s+([A-Z]+)/);
  const yAxis = directionTokenToVector(yMatch ? yMatch[1] : '');
  const zAxis = directionTokenToVector(zMatch ? zMatch[1] : '');
  let xAxis = null;
  if (yAxis && zAxis) {
    const cross = new THREE.Vector3().crossVectors(yAxis, zAxis);
    if (cross.length() > 0.01) xAxis = cross.normalize();
  }
  return { yAxis, zAxis, xAxis };
}

// Extract run/outlet size ratio from branch fitting spec (e.g. "BR3B-250x50").
// Returns null when spec does not contain an explicit reducing pair.
function parseOutletRatioFromSpec(element) {
  const attrs = getAttrs(element);
  const spec = String(attrs.SPRE ?? element.SPRE ?? '').toUpperCase();
  const match = spec.match(/(\d+(?:\.\d+)?)\s*[X]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const a = Number.parseFloat(match[1]);
  const b = Number.parseFloat(match[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  const run = Math.max(a, b);
  const outlet = Math.min(a, b);
  return { run, outlet, ratio: outlet / run };
}

// Resolve tee/olet branch radius using explicit branch bores first, then spec ratio, then fallback scale.
function resolveBranchRadius(element, runRadius, fallbackScale) {
  const attrs = getAttrs(element);
  const branchKeys = ['TBOR', 'HBOR', 'BBORE', 'BRBORE', 'OUTLET_BORE'];
  for (const key of branchKeys) {
    const value = asNumber(attrs[key]);
    if (Number.isFinite(value) && value > 0) return Math.max(value * 0.5, 1);
  }
  const specRatio = parseOutletRatioFromSpec(element);
  if (specRatio) return Math.max(runRadius * specRatio.ratio, 1);
  return Math.max(runRadius * fallbackScale, 1);
}

function projectPointToSegment(pointVec, startVec, endVec) {
  const segment = new THREE.Vector3().subVectors(endVec, startVec);
  const segLenSq = segment.lengthSq();
  if (segLenSq < 1e-9) return startVec.clone();
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(pointVec, startVec).dot(segment) / segLenSq, 0, 1);
  return startVec.clone().addScaledVector(segment, t);
}

function resolveBranchAxis(mainAxis, branchVec, branchAxisHint) {
  const minOrth = 0.15;
  const normalizedHint = (branchAxisHint && branchAxisHint.length() > 0.01) ? branchAxisHint.clone().normalize() : null;
  if (branchVec && branchVec.length() > 0.01) {
    const fromVec = branchVec.clone().normalize();
    const orth = 1 - Math.abs(fromVec.dot(mainAxis));
    if (orth >= minOrth) return fromVec;
  }
  if (normalizedHint) {
    const hintOrth = 1 - Math.abs(normalizedHint.dot(mainAxis));
    if (hintOrth >= 0.05) return normalizedHint;
  }
  let fallback = new THREE.Vector3().crossVectors(mainAxis, new THREE.Vector3(0, 1, 0));
  if (fallback.length() < 0.05) fallback = new THREE.Vector3().crossVectors(mainAxis, new THREE.Vector3(1, 0, 0));
  if (normalizedHint && fallback.dot(normalizedHint) < 0) fallback.multiplyScalar(-1);
  return fallback.normalize();
}

function inferCornerCenter(startCoord, endCoord) {
  const p1 = normalizeCoord(startCoord);
  const p2 = normalizeCoord(endCoord);
  if (!p1 || !p2) return null;
  const segLen = coordDistance(p1, p2);
  if (!Number.isFinite(segLen) || segLen < 0.1) return null;
  const candidates = [
    { x: p1.x, y: p2.y, z: p1.z },
    { x: p2.x, y: p1.y, z: p1.z },
    { x: p1.x, y: p1.y, z: p2.z },
    { x: p2.x, y: p1.y, z: p2.z },
    { x: p1.x, y: p2.y, z: p2.z },
    { x: p2.x, y: p2.y, z: p1.z }
  ];
  let best = null;
  let bestErr = Number.POSITIVE_INFINITY;
  for (const cp of candidates) {
    const d1 = coordDistance(cp, p1);
    const d2 = coordDistance(cp, p2);
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) continue;
    if (d1 < 0.1 || d2 < 0.1) continue;
    const err = Math.abs(d1 - d2);
    if (err < bestErr) {
      bestErr = err;
      best = cp;
    }
  }
  if (!best) return null;
  const allowedErr = Math.max(1, segLen * 0.15);
  if (bestErr > allowedErr) return null;
  return best;
}

function resolveElbowCenter(startCoord, endCoord, declaredCenterCoord, cornerCoord) {
  const p1 = normalizeCoord(startCoord);
  const p2 = normalizeCoord(endCoord);
  if (!p1 || !p2) return null;
  const segLen = coordDistance(p1, p2);
  if (!Number.isFinite(segLen) || segLen < 0.1) return null;
  const mid = {
    x: (p1.x + p2.x) * 0.5,
    y: (p1.y + p2.y) * 0.5,
    z: (p1.z + p2.z) * 0.5
  };
  const isValidCenter = (cp) => {
    if (!cp) return false;
    const d1 = coordDistance(cp, p1);
    const d2 = coordDistance(cp, p2);
    if (!Number.isFinite(d1) || !Number.isFinite(d2)) return false;
    if (d1 < 0.1 || d2 < 0.1) return false;
    const err = Math.abs(d1 - d2);
    if (err > Math.max(1, segLen * 0.2)) return false;
    const centerToMid = coordDistance(cp, mid);
    return centerToMid <= Math.max(segLen * 1.5, 250);
  };
  const corner = normalizeCoord(cornerCoord);
  if (isValidCenter(corner)) return corner;
  const declared = normalizeCoord(declaredCenterCoord);
  if (isValidCenter(declared)) return declared;
  const inferred = inferCornerCenter(p1, p2);
  if (isValidCenter(inferred)) return inferred;
  return null;
}

function applyRenderableIdentity(renderable, currentPath, type) {
  if (!renderable) return null;
  renderable.name = currentPath;
  renderable.userData = { ...(renderable.userData || {}), name: currentPath, type };
  renderable.traverse((node) => {
    if (!node?.isMesh) return;
    node.name = currentPath;
    node.userData = { ...(node.userData || {}), name: currentPath, type };
  });
  return renderable;
}

function buildFlangeAssembly(startVec, endVec, radius, flangeColor, webColor) {
  const diff = new THREE.Vector3().subVectors(endVec, startVec);
  const length = diff.length();
  if (!Number.isFinite(length) || length < 0.001) return null;

  const normal = diff.clone().normalize();
  const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  const discRadius = radius * 1.95;
  const discThickness = Math.max(Math.min(radius * 0.5, length * 0.35), 0.25);
  const q1 = startVec.clone().lerp(mid, 0.18);
  const q2 = endVec.clone().lerp(mid, 0.18);
  const flangeMaterial = new THREE.MeshStandardMaterial({ color: flangeColor, roughness: 0.62, metalness: 0.16 });
  const webMaterial = new THREE.MeshStandardMaterial({ color: webColor, roughness: 0.6, metalness: 0.14 });
  const group = new THREE.Group();
  group.add(createDiscMesh(q1, normal, discRadius, discThickness, flangeMaterial));
  group.add(createDiscMesh(q2, normal, discRadius, discThickness, flangeMaterial));
  const web = createSegmentCylinder(q1, q2, radius * 0.82, webMaterial, 16);
  if (web) group.add(web);
  return group;
}

function buildValveAssembly(startVec, endVec, radius, valveColor, flangeColor, bodyColor) {
  const diff = new THREE.Vector3().subVectors(endVec, startVec);
  const length = diff.length();
  if (!Number.isFinite(length) || length < 0.001) return null;

  const normal = diff.clone().normalize();
  const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  const discRadius = radius * 1.7;
  const discThickness = Math.max(Math.min(radius * 0.5, length * 0.3), 0.25);
  const q1 = startVec.clone().lerp(mid, 0.24);
  const q2 = endVec.clone().lerp(mid, 0.24);
  const flangeMaterial = new THREE.MeshStandardMaterial({ color: flangeColor, roughness: 0.62, metalness: 0.16 });
  const valveMaterial = new THREE.MeshStandardMaterial({ color: valveColor, roughness: 0.58, metalness: 0.2 });
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.14 });
  const group = new THREE.Group();
  group.add(createDiscMesh(q1, normal, discRadius, discThickness, flangeMaterial));
  group.add(createDiscMesh(q2, normal, discRadius, discThickness, flangeMaterial));
  const body = createSegmentCylinder(q1, q2, radius * 0.72, bodyMaterial, 16);
  if (body) group.add(body);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 16, 16), valveMaterial);
  sphere.position.copy(mid);
  group.add(sphere);
  return group;
}

function buildTeeAssembly(startVec, endVec, centerVec, branchVec, branchAxisHint, radius, color, branchScale, options) {
  const diff = new THREE.Vector3().subVectors(endVec, startVec);
  const length = diff.length();
  if (!Number.isFinite(length) || length < 0.001) return null;

  const midCandidate = centerVec ? centerVec.clone() : new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  const mid = projectPointToSegment(midCandidate, startVec, endVec);
  if (!Number.isFinite(mid.x) || !Number.isFinite(mid.y) || !Number.isFinite(mid.z)) return null;
  const mainAxis = diff.clone().normalize();
  const branchVectorFromCenter = (branchVec && branchVec.distanceTo(mid) > Math.max(radius * 0.25, 0.05))
    ? new THREE.Vector3().subVectors(branchVec, mid)
    : null;
  const branchAxis = resolveBranchAxis(mainAxis, branchVectorFromCenter, branchAxisHint);
  const mergedOptions = options && typeof options === 'object' ? options : {};
  const shortBranch = mergedOptions.shortBranch === true;
  const branchRadiusScale = Number.isFinite(mergedOptions.branchRadiusScale) ? mergedOptions.branchRadiusScale : 1;
  const branchRadius = Math.max(radius * branchScale * branchRadiusScale, 0.5);
  let branchLength = 0;
  if (branchVectorFromCenter && branchVectorFromCenter.length() > 0.001) {
    branchLength = branchVectorFromCenter.length();
  } else if (shortBranch) {
    branchLength = Math.max(branchRadius * 2.2, radius * 0.7);
  } else {
    branchLength = Math.max(length * 0.24, radius * 2.6);
  }
  const minLen = Math.max(branchRadius * 1.6, 1);
  const maxLen = Math.max(length * 0.8, radius * 3.5);
  branchLength = THREE.MathUtils.clamp(branchLength, minLen, maxLen);
  const branchEnd = mid.clone().addScaledVector(branchAxis, branchLength);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.16 });
  const group = new THREE.Group();
  const leg1 = createSegmentCylinder(startVec, mid, radius, material, 16);
  const leg2 = createSegmentCylinder(mid, endVec, radius, material, 16);
  if (leg1) group.add(leg1);
  if (leg2) group.add(leg2);
  if (!leg1 && !leg2) {
    const run = createSegmentCylinder(startVec, endVec, radius, material, 16);
    if (run) group.add(run);
  }
  const branch = createSegmentCylinder(mid, branchEnd, branchRadius, material, 14);
  if (branch) group.add(branch);
  const junction = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.15, 16, 16), material);
  junction.position.copy(mid);
  group.add(junction);
  return group;
}

// Olet point symbol: short branch nozzle + reinforcement cue at run center.
// Used when only a single outlet point exists (no reliable APOS/LPOS span).
function buildOletPointAssembly(centerVec, orientationAxes, radius, branchRadius, color, branchAxisOverride) {
  if (!centerVec) return null;
  // Capture the raw CREF distance before normalising — used to extend the nozzle
  // all the way to the branch connection point so it protrudes past the run-pipe wall.
  const overrideRawLen = (branchAxisOverride && branchAxisOverride.length() > 0.01)
    ? branchAxisOverride.length()
    : 0;
  const overrideAxis = overrideRawLen > 0
    ? branchAxisOverride.clone().normalize()
    : null;
  const axisFromOri = orientationAxes?.yAxis
    ? orientationAxes.yAxis.clone().normalize()
    : (orientationAxes?.zAxis ? orientationAxes.zAxis.clone().normalize() : null);
  const branchAxis = overrideAxis || axisFromOri || new THREE.Vector3(0, 1, 0);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.16 });
  const group = new THREE.Group();

  // neckLen must reach past the run-pipe surface (radius) to be visible.
  // When the CREF anchor distance is known, extend the nozzle to cover the full gap
  // from the run-pipe centreline to the branch connection point.
  const neckLen = overrideRawLen > 0
    ? Math.max(overrideRawLen, radius * 1.2, branchRadius * 2.2)
    : Math.max(branchRadius * 2.2, radius * 1.2, 8);
  const tip = centerVec.clone().addScaledVector(branchAxis, neckLen);
  const neck = createSegmentCylinder(centerVec, tip, Math.max(branchRadius * 0.92, 0.8), material, 14);
  if (neck) group.add(neck);

  const baseBulge = new THREE.Mesh(new THREE.SphereGeometry(Math.max(branchRadius * 1.15, 1), 14, 14), material);
  baseBulge.position.copy(centerVec);
  group.add(baseBulge);

  const tipCap = new THREE.Mesh(new THREE.SphereGeometry(Math.max(branchRadius * 0.82, 0.6), 12, 12), material);
  tipCap.position.copy(tip);
  group.add(tipCap);

  const reinforceAxis = orientationAxes?.xAxis ? orientationAxes.xAxis.clone().normalize() : null;
  if (reinforceAxis) {
    const ringHalf = Math.max(radius * 0.32, branchRadius * 1.4);
    const r1 = centerVec.clone().addScaledVector(reinforceAxis, -ringHalf);
    const r2 = centerVec.clone().addScaledVector(reinforceAxis, ringHalf);
    const reinforce = createSegmentCylinder(r1, r2, Math.max(branchRadius * 0.62, 0.7), material, 12);
    if (reinforce) group.add(reinforce);
  }
  return group;
}

function buildCurvedElbowAssembly(startVec, endVec, centerVec, radius, color) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.16 });
  const v1 = startVec.clone().sub(centerVec);
  const v2 = endVec.clone().sub(centerVec);
  if (v1.length() < 0.1 || v2.length() < 0.1) return null;
  const d1 = v1.clone().normalize();
  const d2 = v2.clone().normalize();
  const dot = THREE.MathUtils.clamp(d1.dot(d2), -1, 1);
  const angle = Math.acos(dot);
  if (angle < 0.05 || Math.abs(Math.PI - angle) < 0.05) return null;
  const normal = new THREE.Vector3().crossVectors(d1, d2);
  if (normal.length() < 1e-4) return null;
  const arcRadius = Math.min(v1.length(), v2.length());
  if (arcRadius < radius * 0.5) return null;

  const arcStart = centerVec.clone().addScaledVector(d1, arcRadius);
  const arcEnd = centerVec.clone().addScaledVector(d2, arcRadius);
  const sweepAngle = Math.PI - angle;
  const alpha = (4 / 3) * Math.tan(sweepAngle / 4);
  const cp1 = arcStart.clone().addScaledVector(d1, -alpha * arcRadius);
  const cp2 = arcEnd.clone().addScaledVector(d2, -alpha * arcRadius);
  const bendCurve = new THREE.CubicBezierCurve3(arcStart, cp1, cp2, arcEnd);

  const group = new THREE.Group();
  const straight1 = startVec.distanceTo(arcStart) > 0.1 ? createSegmentCylinder(startVec, arcStart, radius, material, 16) : null;
  const straight2 = arcEnd.distanceTo(endVec) > 0.1 ? createSegmentCylinder(arcEnd, endVec, radius, material, 16) : null;
  const bend = createTubeFromCurve(bendCurve, radius, material, 32, 16);
  if (straight1) group.add(straight1);
  if (bend) group.add(bend);
  if (straight2) group.add(straight2);
  return group.children.length ? group : null;
}

function buildElbowAssembly(startVec, endVec, centerVec, radius, color) {
  if (centerVec) {
    const curved = buildCurvedElbowAssembly(startVec, endVec, centerVec, radius, color);
    if (curved) return curved;
  }
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.16 });
  const group = new THREE.Group();
  const body = createSegmentCylinder(startVec, endVec, radius, material, 16);
  if (body) group.add(body);
  const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.1, 16, 16), material);
  hub.position.copy(mid);
  group.add(hub);
  return group;
}

function buildReducerAssembly(startVec, endVec, radius, color, element) {
  const diff = new THREE.Vector3().subVectors(endVec, startVec);
  const length = diff.length();
  if (!Number.isFinite(length) || length < 0.001) return null;

  // Derive outlet radius from SPRE spec (e.g. "BR-250x100") or use 0.65 ratio fallback
  const specRatio = parseOutletRatioFromSpec(element);
  const outletRadius = specRatio
    ? Math.max(radius * specRatio.ratio, 1)
    : Math.max(radius * 0.65, 1);
  
  const rStart = radius;
  const rEnd = outletRadius;

  const dir = diff.clone().normalize();
  const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.18 });

  // Tapered cone body
  // Top is rEnd, Bottom is rStart
  const geo = new THREE.CylinderGeometry(rEnd, rStart, length, 20, 1, false);
  const cone = new THREE.Mesh(geo, mat);
  cone.position.copy(mid);
  cone.quaternion.copy(quat);
  group.add(cone);

  // End caps
  const capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
  const capStart = new THREE.Mesh(new THREE.CircleGeometry(rStart, 20), capMat);
  capStart.position.copy(startVec);
  capStart.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate());
  group.add(capStart);
  
  const capEnd = new THREE.Mesh(new THREE.CircleGeometry(rEnd, 20), capMat);
  capEnd.position.copy(endVec);
  capEnd.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  group.add(capEnd);

  return group;
}

function bboxSegmentEndpoints(minX, minY, minZ, maxX, maxY, maxZ) {
  const width = Math.max(Math.abs(maxX - minX), 0.01);
  const height = Math.max(Math.abs(maxY - minY), 0.01);
  const depth = Math.max(Math.abs(maxZ - minZ), 0.01);
  const center = new THREE.Vector3(minX + (width * 0.5), minY + (height * 0.5), minZ + (depth * 0.5));
  let axis = new THREE.Vector3(1, 0, 0);
  let span = width;
  if (height >= width && height >= depth) {
    axis = new THREE.Vector3(0, 1, 0);
    span = height;
  } else if (depth >= width && depth >= height) {
    axis = new THREE.Vector3(0, 0, 1);
    span = depth;
  }
  const half = Math.max(span * 0.5, 0.005);
  return {
    width,
    height,
    depth,
    minDim: Math.min(width, height, depth),
    center,
    start: center.clone().addScaledVector(axis, -half),
    end: center.clone().addScaledVector(axis, half)
  };
}

function buildSegmentMesh(element, currentPath, defaultRadius, renderContext) {
  const type = normalizedType(element);
  const points = getAposLpos(element);

  let hasLine = points.apos && points.lpos;
  let dx = 0, dy = 0, dz = 0, length = 0;

  if (hasLine) {
    dx = points.lpos.x - points.apos.x;
    dy = points.lpos.y - points.apos.y;
    dz = points.lpos.z - points.apos.z;
    length = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    if (!Number.isFinite(length) || length < 0.001) {
      hasLine = false; // Too short to be a line segment, treat as a single point
    }
  }

  const centerPt = hasLine ? null : (points.pos || points.apos || points.lpos);

  if (!hasLine && !centerPt) return null;

  const radius = computeRadius(element, hasLine ? length : defaultRadius, defaultRadius);
  let color = 0x657083;
  if (type === 'PIPE') color = 0x3d74c5;
  else if (type === 'VALVE') color = 0xcc2222;
  else if (type === 'FLANGE') color = 0x9a9a9a;
  else if (type === 'GASK') color = 0x444444;   // dark charcoal — visually distinct from flanges
  else if (type === 'REDUCER') color = 0x8f8f8f;
  else if (type === 'ELBOW' || type === 'BEND') color = 0xaa55aa;
  else if (type === 'TEE' || type === 'OLET') color = 0x55aa55;
  else if (type === 'INST') color = 0xb53f3f;
  else if (SUPPORT_TYPES.has(type)) color = 0x2a5fa8;

  const webColor = 0xaaaaaa;
  const flangeColor = 0x9a9a9a;
  let renderable = null;

  if (hasLine) {
    const startVec = new THREE.Vector3(points.apos.x, points.apos.y, points.apos.z);
    const endVec = new THREE.Vector3(points.lpos.x, points.lpos.y, points.lpos.z);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.15 });
    const elbowCenter = resolveElbowCenter(points.apos, points.lpos, points.cpos, points.pos);
    const elbowCenterVec = toVector(elbowCenter);
    const teeCenterVec = toVector(points.pos || points.cpos) || new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    const crefBranchCoord = resolveNearestCrefAnchor(element, currentPath, renderContext?.ownerPositionIndex);
    const teeBranchVec = toVector(crefBranchCoord || points.bpos);
    const orientationAxes = parseOrientationAxes(element);
    const teeAxisHint = orientationAxes.yAxis || orientationAxes.zAxis;
    const branchRadius = resolveBranchRadius(element, radius, type === 'OLET' ? 0.2 : 1.0);
    const branchScale = radius > 0 ? (branchRadius / radius) : (type === 'OLET' ? 0.2 : 1.0);

    if (type === 'VALVE') {
      renderable = buildValveAssembly(startVec, endVec, radius, color, flangeColor, webColor);
    } else if (type === 'FLANGE') {
      renderable = buildFlangeAssembly(startVec, endVec, radius, flangeColor, webColor);
    } else if (type === 'GASK') {
      // Gaskets are physically thin (typically 2–5 mm). Rendering them as a two-disc
      // flange assembly causes z-fighting with adjacent flange faces because all three
      // surfaces are nearly co-planar. Instead, render a SINGLE solid disc at the
      // midpoint with a guaranteed minimum visual thickness, in a darker charcoal so
      // it is clearly distinguishable from the grey flanges on either side.
      const gaskMid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
      const gaskNormal = new THREE.Vector3().subVectors(endVec, startVec).normalize();
      const gaskDiscRadius = radius * 1.95;
      const gaskThickness = Math.max(length * 0.6, radius * 0.12, 2.0);
      const gaskMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
      renderable = createDiscMesh(gaskMid, gaskNormal, gaskDiscRadius, gaskThickness, gaskMaterial);
    } else if (type === 'TEE' || type === 'OLET') {
      renderable = buildTeeAssembly(
        startVec,
        endVec,
        teeCenterVec,
        teeBranchVec,
        teeAxisHint,
        radius,
        color,
        branchScale,
        { shortBranch: type === 'OLET' }
      );
    } else if (type === 'ELBOW' || type === 'BEND') {
      renderable = buildElbowAssembly(startVec, endVec, elbowCenterVec, radius * 1.05, color);
    } else if (type === 'REDUCER') {
      renderable = buildReducerAssembly(startVec, endVec, radius, color, element);
    } else if (SUPPORT_TYPES.has(type)) {
      renderable = createSegmentCylinder(startVec, endVec, Math.max(radius * 0.8, 6), material, 12);
    } else {
      renderable = createSegmentCylinder(startVec, endVec, radius, material, 16);
    }
  } else {
    const pos = new THREE.Vector3(centerPt.x, centerPt.y, centerPt.z);
    let sphereRadius = radius;
    if (type === 'VALVE') sphereRadius = radius * 1.45;
    else if (type === 'FLANGE') sphereRadius = radius * 1.25;
    else if (type === 'GASK') sphereRadius = radius * 1.25;
    else if (type === 'ELBOW' || type === 'BEND' || type === 'TEE' || type === 'OLET') sphereRadius = radius * 1.2;
    else if (SUPPORT_TYPES.has(type)) sphereRadius = Math.max(radius * 0.85, 8);

    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.15 });
    if (SUPPORT_TYPES.has(type)) {
      renderable = new THREE.Mesh(new THREE.BoxGeometry(sphereRadius * 1.2, sphereRadius * 1.2, sphereRadius * 1.2), material);
      renderable.position.copy(pos);
    } else if (type === 'OLET') {
      const orientationAxes = parseOrientationAxes(element);
      const outletRadius = resolveBranchRadius(element, radius, 0.2);
      const crefBranchCoord = resolveNearestCrefAnchor(element, currentPath, renderContext?.ownerPositionIndex);
      const branchAxisFromCref = crefBranchCoord
        ? new THREE.Vector3(
          crefBranchCoord.x - pos.x,
          crefBranchCoord.y - pos.y,
          crefBranchCoord.z - pos.z
        )
        : null;
      renderable = buildOletPointAssembly(pos, orientationAxes, radius, outletRadius, color, branchAxisFromCref);
    } else if (type === 'TEE') {
      const orientationAxes = parseOrientationAxes(element);
      const runAxis = orientationAxes.xAxis;
      const crefBranchCoord = resolveNearestCrefAnchor(element, currentPath, renderContext?.ownerPositionIndex);
      const branchAxisFromCref = crefBranchCoord
        ? new THREE.Vector3(
          crefBranchCoord.x - pos.x,
          crefBranchCoord.y - pos.y,
          crefBranchCoord.z - pos.z
        )
        : null;
      const branchAxis = branchAxisFromCref || orientationAxes.yAxis || orientationAxes.zAxis;
      if (runAxis && branchAxis) {
        const halfRun = Math.max(radius * 1.9, 6);
        const start = pos.clone().addScaledVector(runAxis, -halfRun);
        const end = pos.clone().addScaledVector(runAxis, halfRun);
        const branchRadius = resolveBranchRadius(element, radius, 1.0);
        const branchScale = radius > 0 ? (branchRadius / radius) : 1.0;
        renderable = buildTeeAssembly(start, end, pos, null, branchAxis, radius, color, branchScale, { shortBranch: true });
      } else {
        renderable = new THREE.Mesh(new THREE.SphereGeometry(sphereRadius, 16, 16), material);
        renderable.position.copy(pos);
      }
    } else {
      renderable = new THREE.Mesh(new THREE.SphereGeometry(sphereRadius, 16, 16), material);
      renderable.position.copy(pos);
    }
  }

  return applyRenderableIdentity(renderable, currentPath, type);
}

function buildBBoxMesh(element, currentPath, renderContext) {
  if (!Array.isArray(element?.bbox) || element.bbox.length !== 6) return null;
  const [minX, minY, minZ, maxX, maxY, maxZ] = element.bbox;
  const {
    width,
    height,
    depth,
    minDim,
    center,
    start,
    end
  } = bboxSegmentEndpoints(minX, minY, minZ, maxX, maxY, maxZ);
  const hasChildren = Array.isArray(element.children) && element.children.length > 0;
  if (hasChildren) return null;

  const type = normalizedType(element);
  if (type === 'UNKNOWN' || type === 'BRANCH') return null;
  const pipeColor = 0x3d74c5;
  const valveColor = 0xcc2222;
  const instColor = 0xb53f3f;
  const flangeColor = 0x9a9a9a;
  const elbowColor = 0xaa55aa;
  const teeColor = 0x55aa55;
  const supportColor = 0x2a5fa8;
  const webColor = 0xaaaaaa;
  let renderable = null;

  if (type === 'PIPE') {
    const radius = Math.max(minDim * 0.35, 0.001);
    const material = new THREE.MeshStandardMaterial({ color: pipeColor, roughness: 0.65, metalness: 0.15 });
    renderable = createSegmentCylinder(start, end, radius, material, 16);
  } else if (FITTING_TYPES.has(type)) {
    const radius = Math.max(minDim * 0.45, 0.0005);
    if (type === 'VALVE') {
      renderable = buildValveAssembly(start, end, radius, valveColor, flangeColor, webColor);
    } else if (type === 'INST') {
      renderable = buildValveAssembly(start, end, radius, instColor, flangeColor, webColor);
    } else if (type === 'FLANGE' || type === 'GASK') {
      renderable = buildFlangeAssembly(start, end, radius, flangeColor, webColor);
    } else if (type === 'TEE' || type === 'OLET') {
      const orientationAxes = parseOrientationAxes(element);
      const crefBranchCoord = resolveNearestCrefAnchor(element, currentPath, renderContext?.ownerPositionIndex);
      const branchAxisFromCref = crefBranchCoord
        ? new THREE.Vector3(
          crefBranchCoord.x - center.x,
          crefBranchCoord.y - center.y,
          crefBranchCoord.z - center.z
        )
        : null;
      const branchAxis = branchAxisFromCref || orientationAxes.yAxis || orientationAxes.zAxis;
      const branchRadius = resolveBranchRadius(element, radius, type === 'OLET' ? 0.2 : 1.0);
      const branchScale = radius > 0 ? (branchRadius / radius) : (type === 'OLET' ? 0.2 : 1.0);
      renderable = buildTeeAssembly(
        start,
        end,
        null,
        null,
        branchAxis,
        radius,
        teeColor,
        branchScale,
        { shortBranch: type === 'OLET' }
      );
    } else if (type === 'ELBOW' || type === 'BEND') {
      renderable = buildElbowAssembly(start, end, null, radius * 1.05, elbowColor);
    } else if (type === 'REDUCER') {
      renderable = buildReducerAssembly(start, end, radius, 0x8f8f8f, element);
    } else {
      const material = new THREE.MeshStandardMaterial({ color: 0x5f7391, roughness: 0.65, metalness: 0.15 });
      renderable = createSegmentCylinder(start, end, radius, material, 16);
    }
  } else if (SUPPORT_TYPES.has(type)) {
    const material = new THREE.MeshStandardMaterial({ color: supportColor, roughness: 0.7, metalness: 0.1 });
    renderable = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    renderable.position.copy(center);
  } else {
    return null;
  }

  if (!renderable) {
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: 0x657083, roughness: 0.72, metalness: 0.08 })
    );
    fallback.position.copy(center);
    renderable = fallback;
  }
  return applyRenderableIdentity(renderable, currentPath, type);
}

export class AvevaJsonLoader {
  constructor() {}

  async load(jsonData, ctx, asyncSession) {
    asyncSession.update('manifest', 10);

    const manifest = {
      schemaVersion: 'rvm-bundle/v1',
      bundleId: 'Aveva-JSON-Import',
      source: { format: 'AVEVA-JSON', files: [] },
      artifacts: { glb: '' },
      runtime: { units: 'mm', upAxis: 'Z', originOffset: [0, 0, 0], scale: 1 },
      modelClass: 'single-bundle'
    };

    asyncSession.update('glb', 30);

    const rootGroup = new THREE.Group();
    rootGroup.name = 'AvevaRoot';
    const nodes = [];
    let nodeIdCounter = 1;

    const topoRoots = Array.isArray(jsonData)
      ? jsonData.map((root) => preprocessTopologyTree(root))
      : [preprocessTopologyTree(jsonData)];
    const renderContext = {
      ownerPositionIndex: buildOwnerPositionIndex(topoRoots)
    };
    const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));

    // Scan segment spans once and derive a dataset-scale fallback radius.
    const segmentLengths = [];
    let scannedNodeCount = 0;
    const collectLengths = async (node) => {
      if (!node || typeof node !== 'object') return;
      const pts = getAposLpos(node);
      if (pts.apos && pts.lpos) {
        const dx = pts.lpos.x - pts.apos.x;
        const dy = pts.lpos.y - pts.apos.y;
        const dz = pts.lpos.z - pts.apos.z;
        const len = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
        if (Number.isFinite(len) && len > 0) segmentLengths.push(len);
      }
      scannedNodeCount += 1;
      if (scannedNodeCount % 1000 === 0) {
        asyncSession.update('scan-json', Math.min(45, 30 + Math.floor(scannedNodeCount / 1000)));
        await yieldToMain();
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) await collectLengths(child);
      }
    };
    for (const root of topoRoots) await collectLengths(root);
    segmentLengths.sort((a, b) => a - b);
    const medianLen = segmentLengths.length
      ? segmentLengths[Math.floor(segmentLengths.length * 0.5)]
      : 50;
    const datasetDefaultRadius = Math.max(medianLen * 0.06, 0.0001);

    let traversedNodeCount = 0;
    const traverse = async (element, parentGroup, parentPath) => {
      if (!element || typeof element !== 'object') return;
      const name = String(element.name || element.id || `Node-${nodeIdCounter}`).trim() || `Node-${nodeIdCounter}`;
      const type = normalizedType(element);
      const id = `NODE-${nodeIdCounter++}`;
      const currentPath = parentPath ? `${parentPath}/${name}` : name;

      const nodeRecord = {
        id,
        sourceObjectId: currentPath,
        canonicalObjectId: currentPath,
        renderObjectIds: [],
        name,
        kind: type,
        parentCanonicalObjectId: parentPath || null,
        attributes: {}
      };

      const attrs = getAttrs(element);
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        if (typeof v === 'object') nodeRecord.attributes[k] = JSON.stringify(v);
        else nodeRecord.attributes[k] = String(v);
      }
      if (!nodeRecord.attributes.TYPE && type) nodeRecord.attributes.TYPE = type;

      const group = new THREE.Group();
      group.name = currentPath;
      let mesh = buildSegmentMesh(element, currentPath, datasetDefaultRadius, renderContext);
      if (!mesh) mesh = buildBBoxMesh(element, currentPath, renderContext);
      if (mesh) {
        group.add(mesh);
        nodeRecord.renderObjectIds.push(mesh.name);
      }

      nodes.push(nodeRecord);
      parentGroup.add(group);

      traversedNodeCount += 1;
      if (traversedNodeCount % 500 === 0) {
        const scannedTotal = Math.max(scannedNodeCount, 1);
        const buildProgress = 45 + Math.min(35, Math.floor((traversedNodeCount / scannedTotal) * 35));
        asyncSession.update('build-meshes', buildProgress);
        await yieldToMain();
      }

      if (Array.isArray(element.children) && element.children.length > 0) {
        for (const child of element.children) {
          await traverse(child, group, currentPath);
        }
      }
    };

    for (const root of topoRoots) {
      await traverse(root, rootGroup, '');
    }

    asyncSession.update('index', 82);
    const indexJson = {
      bundleId: manifest.bundleId,
      nodes
    };

    asyncSession.update('build-tree', 92);
    const identityMap = RvmIdentityMap.fromNodes(nodes);

    rootGroup.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(100, 200, 50);
    rootGroup.add(dir);

    if (asyncSession.isStale() || asyncSession.isCancelled()) return;
    asyncSession.complete();

    const payload = {
      manifest,
      gltf: { scene: rootGroup },
      indexJson,
      tagXmlText: null,
      identityMap
    };

    state.rvm.manifest = manifest;
    state.rvm.activeBundle = manifest.bundleId;
    state.rvm.index = indexJson;
    state.rvm.identityMap = identityMap;

    emit(RuntimeEvents.RVM_MODEL_LOADED, payload);
    return payload;
  }
}
