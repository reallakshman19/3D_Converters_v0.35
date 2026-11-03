import {
  VIBRATION_TOPOLOGY_PATH_SCHEMA,
  buildVibrationTopologyGraph,
  resolveVibrationTopologyPath,
} from '../topology/graph.js';

export const AIV_TOPOLOGY_VIEW_MODEL_SCHEMA = 'AivTopologyViewModel.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function roleLabel(role) {
  if (role === 'SOURCE') return 'Acoustic source';
  if (role === 'ASSESSMENT') return 'Assessment point';
  if (role === 'SOURCE_AND_ASSESSMENT') return 'Source + assessment';
  return 'Propagation path';
}

function diagnosticMessage(path) {
  if (path.status === 'IDENTITY_NOT_FOUND') {
    return `Source or assessment identity is absent from the certified topology: ${(path.missingCanonicalIds ?? []).join(', ')}.`;
  }
  if (path.status === 'AMBIGUOUS_SHORTEST_PATH') {
    return `More than one equally short certified topology path exists (${path.shortestPathCount}). AIV source-to-assessment mapping must be resolved explicitly.`;
  }
  if (path.status === 'AMBIGUOUS_TOPOLOGY_PATH') {
    return 'More than one topology route connects the selected source and assessment identities. AIV readiness will not choose a route by hop count or SVG presentation geometry.';
  }
  return 'No topology path connects the selected source and assessment identities.';
}

function flareNetworkPaths(exchange, sourceCanonicalId, assessmentCanonicalId, maxPaths = 2) {
  const outgoing = new Map();
  for (const segment of exchange.segments ?? []) {
    if (!outgoing.has(segment.fromNodeId)) outgoing.set(segment.fromNodeId, []);
    outgoing.get(segment.fromNodeId).push(segment);
  }
  for (const rows of outgoing.values()) rows.sort((a, b) => String(a.segmentId).localeCompare(String(b.segmentId)));
  const paths = [];
  const visit = (nodeId, visited, nodeIds) => {
    if (paths.length >= maxPaths) return;
    for (const segment of outgoing.get(nodeId) ?? []) {
      if (visited.has(segment.toNodeId)) continue;
      const nextIds = [...nodeIds, segment.toNodeId];
      if (segment.toNodeId === assessmentCanonicalId) {
        paths.push(nextIds);
        if (paths.length >= maxPaths) return;
        continue;
      }
      const nextVisited = new Set(visited);
      nextVisited.add(segment.toNodeId);
      visit(segment.toNodeId, nextVisited, nextIds);
      if (paths.length >= maxPaths) return;
    }
  };
  visit(sourceCanonicalId, new Set([sourceCanonicalId]), [sourceCanonicalId]);
  return paths;
}

function flareNetworkPath(exchange, input) {
  const sourceCanonicalId = String(input.sourceCanonicalId ?? '').trim();
  const assessmentCanonicalId = String(input.assessmentCanonicalId ?? '').trim();
  const byId = new Map((exchange.elements ?? []).map((item) => [String(item.canonicalId ?? '').trim(), item]));
  const missingCanonicalIds = [sourceCanonicalId, assessmentCanonicalId].filter((id) => !byId.has(id));
  if (missingCanonicalIds.length) {
    return {
      status: 'IDENTITY_NOT_FOUND', sourceCanonicalId, assessmentCanonicalId, missingCanonicalIds,
      elements: [], distanceStatus: 'NOT_DERIVED_FROM_PRESENTATION', authority: { source: 'AivFlareNetworkTopologyExchange.v1' },
    };
  }
  const paths = flareNetworkPaths(exchange, sourceCanonicalId, assessmentCanonicalId, 2);
  if (!paths.length) {
    return {
      status: 'NO_TOPOLOGY_PATH', sourceCanonicalId, assessmentCanonicalId, elements: [],
      distanceStatus: 'NOT_DERIVED_FROM_PRESENTATION', authority: { source: 'AivFlareNetworkTopologyExchange.v1' },
    };
  }
  if (paths.length > 1) {
    return {
      status: 'AMBIGUOUS_TOPOLOGY_PATH', sourceCanonicalId, assessmentCanonicalId, elements: [],
      shortestPathCount: paths.length, alternateRouteDetected: true,
      distanceStatus: 'NOT_DERIVED_FROM_PRESENTATION', authority: { source: 'AivFlareNetworkTopologyExchange.v1' },
    };
  }
  const ids = paths[0];
  return {
    status: 'RESOLVED', sourceCanonicalId, assessmentCanonicalId,
    shortestPathCount: 1, shortestHopCount: ids.length - 1, alternateRouteDetected: false,
    distanceStatus: 'EXPLICIT_NETWORK_ENGINEERING_DISTANCE_SEPARATE',
    authority: {
      source: 'AivFlareNetworkTopologyExchange.v1',
      connectivityAuthority: 'AUTHORED_FLARE_NETWORK_GRAPH',
      svgPixelsAuthoritativeForDistance: false,
    },
    elements: ids.map((id, index) => {
      const element = byId.get(id);
      return {
        ...element,
        role: index === 0 ? 'SOURCE' : index === ids.length - 1 ? 'ASSESSMENT' : 'PATH',
        sourceStatus: 'AIV_FLARE_NETWORK_AUTHORED',
        catalogueAuthority: null,
        lengthMm: null,
      };
    }),
  };
}

function resolveTopologyPath(exchange, input) {
  if (exchange?.schema === 'AivFlareNetworkTopologyExchange.v1') return flareNetworkPath(exchange, input);
  const graph = buildVibrationTopologyGraph(exchange);
  return resolveVibrationTopologyPath(graph, {
    sourceCanonicalId: input.sourceCanonicalId,
    assessmentCanonicalId: input.assessmentCanonicalId,
  });
}

export function buildAivTopologyViewModel(exchange, input = {}) {
  const path = resolveTopologyPath(exchange, input);

  const rows = path.status === 'RESOLVED'
    ? path.elements.map((element, index) => ({
        sequence: index + 1,
        canonicalId: element.canonicalId,
        tag: element.tag,
        type: element.type,
        line: element.line,
        declaredLengthMm: element.lengthMm,
        role: element.role,
        roleLabel: roleLabel(element.role),
        sourceStatus: element.sourceStatus,
        catalogueAuthority: element.catalogueAuthority,
      }))
    : [];

  return deepFreeze({
    schema: AIV_TOPOLOGY_VIEW_MODEL_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    authority: {
      calculationState: 'IMPLEMENTED',
      qualificationState: 'SCREENING',
      screeningAuthority: 'AUTHORIZED',
      engineeringAuthority: 'SCREENING',
      designAuthority: false,
      visualizationAuthority: 'TOPOLOGY_EVIDENCE_ONLY',
    },
    sourceCanonicalId: path.sourceCanonicalId,
    assessmentCanonicalId: path.assessmentCanonicalId,
    pathStatus: path.status,
    shortestPathCount: path.shortestPathCount ?? null,
    shortestHopCount: path.shortestHopCount ?? null,
    alternateRouteDetected: path.alternateRouteDetected ?? false,
    physicalDistanceMm: null,
    distanceStatus: path.distanceStatus,
    rows,
    topologyAuthority: path.authority,
    diagnostics: path.status === 'RESOLVED' ? [] : [{
      code: `AIV_TOPOLOGY_${path.status}`,
      message: diagnosticMessage(path),
    }],
    notes: [
      'Topology connectivity may come from certified imported topology or the explicit AIV flare-network graph.',
      'Physical AIV source-to-assessment distance is never derived by this visualization layer or from SVG pixels.',
      'For authored flare networks, generated distance evidence is the sum of explicit segment engineering lengths on one resolved graph path.',
      'No AIV PWL, attenuation, LOF or assessment threshold is evaluated here.',
    ],
  });
}

export function assertAivTopologyViewModel(value) {
  if (value?.schema !== AIV_TOPOLOGY_VIEW_MODEL_SCHEMA) {
    throw new TypeError(`AIV topology view model must use ${AIV_TOPOLOGY_VIEW_MODEL_SCHEMA}.`);
  }
  if (value.pathStatus === 'RESOLVED' && !Array.isArray(value.rows)) {
    throw new TypeError('Resolved AIV topology view model requires rows.');
  }
  return value;
}

export { VIBRATION_TOPOLOGY_PATH_SCHEMA };
