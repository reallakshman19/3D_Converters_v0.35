import { AIV_FLARE_NETWORK_SCHEMA, createAivFlareNetwork } from './aiv-flare-network.js';

function network(value) { return value?.schema === AIV_FLARE_NETWORK_SCHEMA ? value : createAivFlareNetwork(value); }

function sourceType(node) {
  return ({
    RELIEF_VALVE: 'VALV', CONTROL_VALVE: 'VALV', RESTRICTION_ORIFICE: 'ORIFICE',
    PRESSURE_REDUCING_BRANCH_CONNECTION: 'VALV',
  })[node.sourceInput?.sourceDeviceType] ?? 'SOURCE';
}
function assessmentType(node) {
  return ({ WELDOLET: 'OLET', WELDED_TEE: 'TEE', WELDED_SUPPORT: 'SUPPORT' })[node.assessmentInput?.assessmentType] ?? 'WELD';
}
function nodeType(node) {
  if (node.kind === 'SOURCE') return sourceType(node);
  if (node.kind === 'ASSESSMENT') return assessmentType(node);
  if (node.kind === 'BOUNDARY') return 'BOUNDARY';
  if (node.kind === 'OFF_PAGE') return 'OFF_PAGE';
  return node.kind;
}

export function buildAivFlareNetworkTopologyExchange(networkInput) {
  const value = network(networkInput);
  return Object.freeze({
    schema: 'AivFlareNetworkTopologyExchange.v1',
    sourceFileName: `${value.networkId}@${value.revision}`,
    networkId: value.networkId,
    revision: value.revision,
    elements: Object.freeze(value.nodes.map((node) => Object.freeze({
      canonicalId: node.canonicalId,
      tag: node.tag,
      type: nodeType(node),
      line: node.line,
    }))),
    segments: Object.freeze(value.segments.map((segment) => Object.freeze({
      segmentId: segment.segmentId,
      fromNodeId: segment.fromNodeId,
      toNodeId: segment.toNodeId,
      line: segment.line,
      physicalLength: segment.physicalLength ? Object.freeze({ ...segment.physicalLength }) : null,
    }))),
    authority: Object.freeze({
      connectivitySource: 'AivFlareNetwork.v1',
      physicalDistanceSource: 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH',
      svgPixelsAuthoritativeForDistance: false,
      designAuthority: false,
    }),
  });
}
