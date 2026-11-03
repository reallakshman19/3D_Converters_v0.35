export const AIV_FLARE_NETWORK_SCHEMA = 'AivFlareNetwork.v1';
export const AIV_FLARE_NETWORK_NODE_KINDS = Object.freeze([
  'SOURCE', 'ASSESSMENT', 'JUNCTION', 'CONNECTION', 'BOUNDARY', 'OFF_PAGE',
]);
export const AIV_FLARE_NETWORK_LENGTH_UNITS = Object.freeze(['m', 'mm']);

function text(value) { return String(value ?? '').trim(); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function normalizePresentation(value = {}) {
  const x = Number(value.x ?? 0);
  const y = Number(value.y ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('AIV flare-network presentation coordinates must be finite.');
  return { x, y };
}

function normalizeLength(value, segmentId) {
  if (value == null || value === '') return null;
  const number = Number(value.value);
  const unit = text(value.unit);
  if (!(number > 0) || !Number.isFinite(number)) {
    throw new RangeError(`AIV flare-network segment ${segmentId} physical length must be finite and positive.`);
  }
  if (!AIV_FLARE_NETWORK_LENGTH_UNITS.includes(unit)) {
    throw new RangeError(`AIV flare-network segment ${segmentId} uses unsupported length unit ${unit}.`);
  }
  return { value: number, unit };
}

function normalizeNode(node) {
  const canonicalId = text(node?.canonicalId);
  const kind = text(node?.kind).toUpperCase();
  if (!canonicalId) throw new TypeError('AIV flare-network node requires canonicalId.');
  if (!AIV_FLARE_NETWORK_NODE_KINDS.includes(kind)) throw new RangeError(`Unsupported AIV flare-network node kind ${kind}.`);
  if (kind === 'SOURCE' && !text(node?.sourceInput?.caseId)) {
    throw new TypeError(`AIV flare-network Source ${canonicalId} requires sourceInput.caseId.`);
  }
  return {
    canonicalId,
    kind,
    tag: text(node.tag) || canonicalId,
    line: text(node.line) || null,
    sourceInput: kind === 'SOURCE' ? clone(node.sourceInput ?? {}) : null,
    assessmentInput: kind === 'ASSESSMENT' ? clone(node.assessmentInput ?? {}) : null,
    presentation: normalizePresentation(node.presentation),
  };
}

function normalizeSegment(segment) {
  const segmentId = text(segment?.segmentId);
  const fromNodeId = text(segment?.fromNodeId);
  const toNodeId = text(segment?.toNodeId);
  if (!segmentId || !fromNodeId || !toNodeId) throw new TypeError('AIV flare-network segment requires segmentId, fromNodeId and toNodeId.');
  if (fromNodeId === toNodeId) throw new RangeError(`AIV flare-network segment ${segmentId} cannot connect a node to itself.`);
  return {
    segmentId,
    fromNodeId,
    toNodeId,
    line: text(segment.line) || null,
    physicalLength: normalizeLength(segment.physicalLength, segmentId),
    source: text(segment.source) || null,
    sourceRevision: text(segment.sourceRevision) || null,
  };
}

export function createAivFlareNetwork(input = {}) {
  const networkId = text(input.networkId);
  const revision = text(input.revision);
  if (!networkId || !revision) throw new TypeError('AIV flare network requires networkId and revision.');
  const nodes = (input.nodes ?? []).map(normalizeNode);
  const segments = (input.segments ?? []).map(normalizeSegment);
  const nodeIds = new Set();
  for (const node of nodes) {
    if (nodeIds.has(node.canonicalId)) throw new RangeError(`Duplicate AIV flare-network node ${node.canonicalId}.`);
    nodeIds.add(node.canonicalId);
  }
  const segmentIds = new Set();
  for (const segment of segments) {
    if (segmentIds.has(segment.segmentId)) throw new RangeError(`Duplicate AIV flare-network segment ${segment.segmentId}.`);
    segmentIds.add(segment.segmentId);
    if (!nodeIds.has(segment.fromNodeId) || !nodeIds.has(segment.toNodeId)) {
      throw new RangeError(`AIV flare-network segment ${segment.segmentId} has a dangling endpoint.`);
    }
  }
  return deepFreeze({
    schema: AIV_FLARE_NETWORK_SCHEMA,
    networkId,
    revision,
    source: text(input.source) || 'AIV_FLARE_NETWORK',
    sourceRevision: text(input.sourceRevision) || revision,
    nodes,
    segments,
    policy: {
      svgPixelsAuthoritativeForDistance: false,
      segmentEngineeringLengthAuthoritative: true,
      graphPathMayGenerateAivDistance: true,
      ambiguousPathRequiresResolution: true,
    },
  });
}

export function aivFlareNetworkLengthMetres(length) {
  if (!length) return null;
  if (length.unit === 'm') return Number(length.value);
  if (length.unit === 'mm') return Number(length.value) / 1000;
  throw new RangeError(`Unsupported AIV flare-network length unit ${length.unit}.`);
}

function outgoingSegments(network) {
  const map = new Map();
  for (const segment of network.segments) {
    if (!map.has(segment.fromNodeId)) map.set(segment.fromNodeId, []);
    map.get(segment.fromNodeId).push(segment);
  }
  for (const rows of map.values()) rows.sort((a, b) => a.segmentId.localeCompare(b.segmentId));
  return map;
}

export function findAivFlareNetworkDirectedPaths(networkInput, fromNodeId, toNodeId, maxPaths = 2) {
  const network = networkInput?.schema === AIV_FLARE_NETWORK_SCHEMA ? networkInput : createAivFlareNetwork(networkInput);
  const start = text(fromNodeId);
  const target = text(toNodeId);
  if (!start || !target || start === target) return Object.freeze([]);
  const outgoing = outgoingSegments(network);
  const paths = [];
  const visit = (nodeId, visited, segments) => {
    if (paths.length >= maxPaths) return;
    for (const segment of outgoing.get(nodeId) ?? []) {
      if (visited.has(segment.toNodeId)) continue;
      const nextSegments = [...segments, segment];
      if (segment.toNodeId === target) {
        paths.push(Object.freeze(nextSegments));
        if (paths.length >= maxPaths) return;
        continue;
      }
      const nextVisited = new Set(visited);
      nextVisited.add(segment.toNodeId);
      visit(segment.toNodeId, nextVisited, nextSegments);
      if (paths.length >= maxPaths) return;
    }
  };
  visit(start, new Set([start]), []);
  return Object.freeze(paths);
}

export function resolveAivFlareNetworkPath(networkInput, fromNodeId, toNodeId) {
  const network = networkInput?.schema === AIV_FLARE_NETWORK_SCHEMA ? networkInput : createAivFlareNetwork(networkInput);
  const paths = findAivFlareNetworkDirectedPaths(network, fromNodeId, toNodeId, 2);
  if (paths.length === 0) return deepFreeze({ status: 'DISCONNECTED', segmentIds: [], physicalDistanceM: null });
  if (paths.length > 1) return deepFreeze({ status: 'AMBIGUOUS_PATH', segmentIds: [], physicalDistanceM: null });
  const path = paths[0];
  const unresolved = path.filter((segment) => !segment.physicalLength).map((segment) => segment.segmentId);
  if (unresolved.length) {
    return deepFreeze({
      status: 'UNRESOLVED_LENGTH',
      segmentIds: path.map((segment) => segment.segmentId),
      unresolvedSegmentIds: unresolved,
      physicalDistanceM: null,
    });
  }
  const physicalDistanceM = path.reduce((sum, segment) => sum + aivFlareNetworkLengthMetres(segment.physicalLength), 0);
  return deepFreeze({
    status: 'RESOLVED',
    segmentIds: path.map((segment) => segment.segmentId),
    physicalDistanceM,
  });
}

export function moveAivFlareNetworkNodePresentation(networkInput, canonicalId, x, y) {
  const network = networkInput?.schema === AIV_FLARE_NETWORK_SCHEMA ? networkInput : createAivFlareNetwork(networkInput);
  const id = text(canonicalId);
  if (!network.nodes.some((node) => node.canonicalId === id)) throw new RangeError(`Unknown AIV flare-network node ${id}.`);
  return createAivFlareNetwork({
    ...network,
    nodes: network.nodes.map((node) => node.canonicalId === id ? { ...node, presentation: { x, y } } : node),
  });
}
