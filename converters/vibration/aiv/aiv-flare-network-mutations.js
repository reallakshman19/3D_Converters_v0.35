import { AIV_FLARE_NETWORK_SCHEMA, createAivFlareNetwork } from './aiv-flare-network.js';

function network(value) {
  return value?.schema === AIV_FLARE_NETWORK_SCHEMA ? value : createAivFlareNetwork(value);
}
function text(value) { return String(value ?? '').trim(); }

export function addAivFlareNetworkNode(networkInput, node) {
  const current = network(networkInput);
  const canonicalId = text(node?.canonicalId);
  if (!canonicalId) throw new TypeError('AIV flare-network node creation requires canonicalId.');
  if (current.nodes.some((item) => item.canonicalId === canonicalId)) {
    throw new RangeError(`Duplicate AIV flare-network node ${canonicalId}.`);
  }
  return createAivFlareNetwork({ ...current, nodes: [...current.nodes, node] });
}

export function updateAivFlareNetworkNode(networkInput, canonicalId, patch = {}) {
  const current = network(networkInput);
  const id = text(canonicalId);
  if (!current.nodes.some((item) => item.canonicalId === id)) throw new RangeError(`Unknown AIV flare-network node ${id}.`);
  return createAivFlareNetwork({
    ...current,
    nodes: current.nodes.map((item) => item.canonicalId === id ? { ...item, ...patch, canonicalId: id } : item),
  });
}

export function deleteAivFlareNetworkNode(networkInput, canonicalId) {
  const current = network(networkInput);
  const id = text(canonicalId);
  const connected = current.segments.filter((segment) => segment.fromNodeId === id || segment.toNodeId === id);
  if (connected.length) {
    throw new RangeError(`Cannot delete AIV flare-network node ${id} while connected segments exist: ${connected.map((item) => item.segmentId).join(', ')}.`);
  }
  if (!current.nodes.some((item) => item.canonicalId === id)) throw new RangeError(`Unknown AIV flare-network node ${id}.`);
  return createAivFlareNetwork({ ...current, nodes: current.nodes.filter((item) => item.canonicalId !== id) });
}

export function addAivFlareNetworkSegment(networkInput, segment) {
  const current = network(networkInput);
  const segmentId = text(segment?.segmentId);
  if (!segmentId) throw new TypeError('AIV flare-network segment creation requires segmentId.');
  if (current.segments.some((item) => item.segmentId === segmentId)) {
    throw new RangeError(`Duplicate AIV flare-network segment ${segmentId}.`);
  }
  return createAivFlareNetwork({ ...current, segments: [...current.segments, segment] });
}

export function updateAivFlareNetworkSegment(networkInput, segmentId, patch = {}) {
  const current = network(networkInput);
  const id = text(segmentId);
  if (!current.segments.some((item) => item.segmentId === id)) throw new RangeError(`Unknown AIV flare-network segment ${id}.`);
  return createAivFlareNetwork({
    ...current,
    segments: current.segments.map((item) => item.segmentId === id ? { ...item, ...patch, segmentId: id } : item),
  });
}

export function setAivFlareNetworkSegmentLength(networkInput, segmentId, value, unit = 'm') {
  return updateAivFlareNetworkSegment(networkInput, segmentId, {
    physicalLength: value == null || value === '' ? null : { value, unit },
  });
}

export function deleteAivFlareNetworkSegment(networkInput, segmentId) {
  const current = network(networkInput);
  const id = text(segmentId);
  if (!current.segments.some((item) => item.segmentId === id)) throw new RangeError(`Unknown AIV flare-network segment ${id}.`);
  return createAivFlareNetwork({ ...current, segments: current.segments.filter((item) => item.segmentId !== id) });
}
