export const VIBRATION_TOPOLOGY_GRAPH_SCHEMA = 'VibrationTopologyGraph.v1';
export const VIBRATION_TOPOLOGY_PATH_SCHEMA = 'VibrationTopologyPath.v1';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw fail('VIBRATION_TOPOLOGY_IDENTITY_REQUIRED', `${label} is required.`);
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function authority(exchange) {
  const source = exchange?.authority ?? {};
  return {
    sourceSchema: exchange?.sourceSchema ?? null,
    sourceFormat: exchange?.sourceFormat ?? null,
    integrityStatus: exchange?.integrityStatus ?? null,
    canonicalHash: source.canonicalHash ?? null,
    projectionHash: source.projectionHash ?? null,
    sourceHash: source.sourceHash ?? null,
    datasetId: source.datasetId ?? null,
    datasetVersion: source.datasetVersion ?? null,
    sourceExportHash: source.sourceExportHash ?? null,
  };
}

function elementRecord(element) {
  return {
    canonicalId: text(element?.canonicalId, 'Element canonicalId'),
    tag: element?.tag ?? null,
    type: element?.type ?? null,
    line: element?.line ?? null,
    lengthMm: Number.isFinite(element?.lengthMm) ? element.lengthMm : null,
    sourceStatus: element?.sourceStatus ?? null,
    catalogueAuthority: element?.catalogueAuthority ?? null,
  };
}

export function buildVibrationTopologyGraph(exchange = {}) {
  const elements = Array.isArray(exchange.elements) ? exchange.elements : [];
  const connections = Array.isArray(exchange.connections) ? exchange.connections : [];
  const records = elements.map(elementRecord);
  const recordById = new Map();
  for (const record of records) {
    if (recordById.has(record.canonicalId)) {
      throw fail('VIBRATION_TOPOLOGY_DUPLICATE_CANONICAL_ID', `Duplicate Canonical ID ${record.canonicalId}.`);
    }
    recordById.set(record.canonicalId, record);
  }

  const nodeMembers = new Map();
  for (const row of connections) {
    const canonicalId = text(row?.canonicalId, 'Connection canonicalId');
    const nodeId = text(row?.nodeId, 'Connection nodeId');
    if (!recordById.has(canonicalId)) {
      throw fail('VIBRATION_TOPOLOGY_ORPHAN_CONNECTION', `Connection references unknown Canonical ID ${canonicalId}.`);
    }
    if (!nodeMembers.has(nodeId)) nodeMembers.set(nodeId, new Set());
    nodeMembers.get(nodeId).add(canonicalId);
  }

  const adjacency = new Map(records.map((record) => [record.canonicalId, new Set()]));
  for (const members of nodeMembers.values()) {
    const ids = [...members].sort((a, b) => a.localeCompare(b));
    for (let index = 0; index < ids.length; index += 1) {
      for (let other = index + 1; other < ids.length; other += 1) {
        adjacency.get(ids[index]).add(ids[other]);
        adjacency.get(ids[other]).add(ids[index]);
      }
    }
  }

  const graph = {
    schema: VIBRATION_TOPOLOGY_GRAPH_SCHEMA,
    authority: authority(exchange),
    elements: records.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId)),
    adjacency: Object.fromEntries([...adjacency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([canonicalId, neighbors]) => [canonicalId, [...neighbors].sort((a, b) => a.localeCompare(b))])),
    nodeBindings: [...nodeMembers.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nodeId, members]) => ({ nodeId, canonicalIds: [...members].sort((a, b) => a.localeCompare(b)) })),
  };
  return deepFreeze(graph);
}

function assertGraph(graph) {
  if (graph?.schema !== VIBRATION_TOPOLOGY_GRAPH_SCHEMA) {
    throw fail('VIBRATION_TOPOLOGY_GRAPH_REQUIRED', `Expected ${VIBRATION_TOPOLOGY_GRAPH_SCHEMA}.`);
  }
  return graph;
}

function unresolved(graph, sourceCanonicalId, assessmentCanonicalId, status, details = {}) {
  return deepFreeze({
    schema: VIBRATION_TOPOLOGY_PATH_SCHEMA,
    status,
    sourceCanonicalId,
    assessmentCanonicalId,
    orderedCanonicalIds: [],
    elements: [],
    physicalDistanceMm: null,
    distanceStatus: 'NOT_DERIVED_BY_TOPOLOGY_VIEW',
    authority: graph.authority,
    ...details,
  });
}

function edgeKey(a, b) {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function reachableWithoutEdge(graph, sourceCanonicalId, assessmentCanonicalId, blockedEdge) {
  const queue = [sourceCanonicalId];
  const visited = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const neighbor of graph.adjacency[current] ?? []) {
      if (edgeKey(current, neighbor) === blockedEdge || visited.has(neighbor)) continue;
      if (neighbor === assessmentCanonicalId) return true;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return sourceCanonicalId === assessmentCanonicalId;
}

function alternateRouteExists(graph, orderedCanonicalIds) {
  if (orderedCanonicalIds.length < 2) return false;
  const sourceCanonicalId = orderedCanonicalIds[0];
  const assessmentCanonicalId = orderedCanonicalIds.at(-1);
  for (let index = 0; index < orderedCanonicalIds.length - 1; index += 1) {
    const blockedEdge = edgeKey(orderedCanonicalIds[index], orderedCanonicalIds[index + 1]);
    if (reachableWithoutEdge(graph, sourceCanonicalId, assessmentCanonicalId, blockedEdge)) return true;
  }
  return false;
}

export function resolveVibrationTopologyPath(graphInput, input = {}) {
  const graph = assertGraph(graphInput);
  const sourceCanonicalId = text(input.sourceCanonicalId, 'sourceCanonicalId');
  const assessmentCanonicalId = text(input.assessmentCanonicalId, 'assessmentCanonicalId');
  const elementById = new Map(graph.elements.map((record) => [record.canonicalId, record]));

  if (!elementById.has(sourceCanonicalId) || !elementById.has(assessmentCanonicalId)) {
    return unresolved(graph, sourceCanonicalId, assessmentCanonicalId, 'IDENTITY_NOT_FOUND', {
      missingCanonicalIds: [sourceCanonicalId, assessmentCanonicalId].filter((id) => !elementById.has(id)),
    });
  }
  if (sourceCanonicalId === assessmentCanonicalId) {
    return deepFreeze({
      schema: VIBRATION_TOPOLOGY_PATH_SCHEMA,
      status: 'RESOLVED',
      sourceCanonicalId,
      assessmentCanonicalId,
      orderedCanonicalIds: [sourceCanonicalId],
      elements: [{ ...elementById.get(sourceCanonicalId), role: 'SOURCE_AND_ASSESSMENT' }],
      physicalDistanceMm: null,
      distanceStatus: 'NOT_DERIVED_BY_TOPOLOGY_VIEW',
      shortestPathCount: 1,
      alternateRouteDetected: false,
      authority: graph.authority,
    });
  }

  const queue = [sourceCanonicalId];
  const distance = new Map([[sourceCanonicalId, 0]]);
  const pathCount = new Map([[sourceCanonicalId, 1]]);
  const predecessor = new Map();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const nextDistance = distance.get(current) + 1;
    for (const neighbor of graph.adjacency[current] ?? []) {
      if (!distance.has(neighbor)) {
        distance.set(neighbor, nextDistance);
        pathCount.set(neighbor, pathCount.get(current));
        predecessor.set(neighbor, current);
        queue.push(neighbor);
      } else if (distance.get(neighbor) === nextDistance) {
        pathCount.set(neighbor, pathCount.get(neighbor) + pathCount.get(current));
      }
    }
  }

  if (!distance.has(assessmentCanonicalId)) {
    return unresolved(graph, sourceCanonicalId, assessmentCanonicalId, 'NO_PATH');
  }
  const shortestPathCount = pathCount.get(assessmentCanonicalId) ?? 0;
  if (shortestPathCount !== 1) {
    return unresolved(graph, sourceCanonicalId, assessmentCanonicalId, 'AMBIGUOUS_SHORTEST_PATH', {
      shortestPathCount,
      shortestHopCount: distance.get(assessmentCanonicalId),
    });
  }

  const orderedCanonicalIds = [];
  for (let cursor = assessmentCanonicalId; cursor; cursor = predecessor.get(cursor)) {
    orderedCanonicalIds.push(cursor);
    if (cursor === sourceCanonicalId) break;
  }
  orderedCanonicalIds.reverse();
  if (alternateRouteExists(graph, orderedCanonicalIds)) {
    return unresolved(graph, sourceCanonicalId, assessmentCanonicalId, 'AMBIGUOUS_TOPOLOGY_PATH', {
      shortestPathCount,
      shortestHopCount: distance.get(assessmentCanonicalId),
      alternateRouteDetected: true,
    });
  }

  const elements = orderedCanonicalIds.map((canonicalId, index) => ({
    ...elementById.get(canonicalId),
    role: index === 0 ? 'SOURCE' : index === orderedCanonicalIds.length - 1 ? 'ASSESSMENT' : 'PROPAGATION_PATH',
  }));

  return deepFreeze({
    schema: VIBRATION_TOPOLOGY_PATH_SCHEMA,
    status: 'RESOLVED',
    sourceCanonicalId,
    assessmentCanonicalId,
    orderedCanonicalIds,
    elements,
    physicalDistanceMm: null,
    distanceStatus: 'NOT_DERIVED_BY_TOPOLOGY_VIEW',
    shortestPathCount,
    shortestHopCount: distance.get(assessmentCanonicalId),
    alternateRouteDetected: false,
    authority: graph.authority,
  });
}
