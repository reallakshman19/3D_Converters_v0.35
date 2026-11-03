import { createAivFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network.js';
import {
  addAivFlareNetworkNode,
  addAivFlareNetworkSegment,
} from '../converters/vibration/aiv/aiv-flare-network-mutations.js';

function text(value) { return String(value ?? '').trim(); }

export function aivUnifiedCanvasNextId(network, prefix) {
  const used = new Set([
    ...(network?.nodes ?? []).map((item) => item.canonicalId),
    ...(network?.segments ?? []).map((item) => item.segmentId),
  ]);
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${prefix}-${String(index).padStart(3, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new RangeError(`Unable to allocate AIV authoring ID for ${prefix}.`);
}

export function aivUnifiedCanvasNodeSelectionKey(node) {
  if (!node) return null;
  if (node.kind === 'SOURCE') return `SOURCE:${node.canonicalId}:${node.sourceInput?.caseId ?? ''}`;
  if (node.kind === 'ASSESSMENT') return `ASSESSMENT:${node.canonicalId}`;
  return `NETWORK_NODE:${node.canonicalId}`;
}

export function createAivUnifiedCanvasBlankNetwork(input = {}) {
  const networkId = text(input.networkId);
  if (!networkId) throw new TypeError('New AIV flare network requires a Network ID.');
  return createAivFlareNetwork({
    networkId,
    revision: '1',
    source: 'AIV_FLARE_NETWORK_UI',
    sourceRevision: '1',
    nodes: [],
    segments: [],
  });
}

function defaultPosition(network) {
  const index = network.nodes.length;
  return { x: 110 + (index % 4) * 220, y: 100 + Math.floor(index / 4) * 130 };
}

export function createAivUnifiedCanvasRvBranch(network, input = {}) {
  const canonicalId = text(input.canonicalId) || aivUnifiedCanvasNextId(network, 'RV');
  const caseId = text(input.caseId);
  const targetNodeId = text(input.targetNodeId);
  const segmentId = text(input.segmentId) || `${canonicalId}-BRANCH`;
  const line = text(input.line) || null;
  const length = Number(input.length);
  const unit = text(input.unit) || 'm';
  if (!caseId) throw new TypeError(`AIV flare-network Source ${canonicalId} requires an operating case.`);
  if (!targetNodeId) throw new TypeError('Quick RV branch requires a target junction or header node.');
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError('Quick RV branch requires a positive engineering length.');
  const withNode = addAivFlareNetworkNode(network, {
    canonicalId,
    kind: 'SOURCE',
    tag: canonicalId,
    line,
    sourceInput: { caseId, sourceDeviceType: 'RELIEF_VALVE' },
    presentation: input.presentation ?? defaultPosition(network),
  });
  return addAivFlareNetworkSegment(withNode, {
    segmentId,
    fromNodeId: canonicalId,
    toNodeId: targetNodeId,
    line,
    physicalLength: { value: length, unit },
  });
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function inspectAivUnifiedCanvasSourceCompleteness(node) {
  if (!node || node.kind !== 'SOURCE') return Object.freeze({ complete: true, missing: [] });
  const input = node.sourceInput ?? {};
  const checks = [
    ['Operating case', input.caseId],
    ['Device type', input.sourceDeviceType],
    ['Source state', input.sourceState],
    ['Phase', input.phase],
    ['Mass flow value', input.massFlow?.value],
    ['Mass flow unit', input.massFlow?.unit],
    ['Upstream pressure value', input.upstreamPressure?.value],
    ['Upstream pressure unit', input.upstreamPressure?.unit],
    ['Upstream pressure basis', input.upstreamPressure?.basis],
    ['Downstream pressure value', input.downstreamPressure?.value],
    ['Downstream pressure unit', input.downstreamPressure?.unit],
    ['Downstream pressure basis', input.downstreamPressure?.basis],
    ['Temperature value', input.upstreamTemperature?.value],
    ['Temperature unit', input.upstreamTemperature?.unit],
    ['Molecular weight value', input.molecularWeight?.value],
    ['Molecular weight unit', input.molecularWeight?.unit],
    ['Sonic state', input.sonicState],
    ['Low-noise trim state', input.lowNoiseTrim?.state],
  ];
  const missing = checks.filter(([, value]) => !present(value)).map(([label]) => label);
  return Object.freeze({ complete: missing.length === 0, missing: Object.freeze(missing) });
}
