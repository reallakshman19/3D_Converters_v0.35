/**
 * RvmPcfAcceptedTopologyHandoff.js
 *
 * Agent 15: Accepted Topology Handoff Map.
 *
 * Purpose:
 * - Convert UXML topologyDecision.acceptedConnections into a legacy-friendly
 *   handoff structure.
 * - Provide traceable accepted topology evidence for the existing Extract PCF
 *   route without changing the PCF writer or master mappers.
 *
 * Important:
 * - Does not emit PCF.
 * - Does not resolve masters.
 * - Does not mutate coordinates.
 * - Does not apply fixes.
 */

import {
  RVM_PCF_TOPOLOGY_MODES,
} from './RvmPcfTopologyModes.js';

export const RVM_PCF_ACCEPTED_TOPOLOGY_HANDOFF_SCHEMA =
  'rvm-pcf-accepted-topology-handoff/v1';

function clean(value) {
  return String(value ?? '').trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function safeId(value, fallback) {
  const raw = clean(value);
  if (!raw) return fallback;
  return raw.replace(/[^\w:.-]+/g, '-');
}

function rowNo(row, index) {
  return clean(row?.rowNo ?? row?.row ?? row?.index ?? index + 1);
}

function componentIdFromRow(row, index) {
  return safeId(
    row?.componentId ||
      row?.id ||
      row?.canonicalId ||
      row?.rowId ||
      row?.refNo ||
      row?.CA97 ||
      `ROW-${rowNo(row, index)}`,
    `ROW-${index + 1}`
  );
}

function identityFromRow(row, index) {
  return {
    componentId: componentIdFromRow(row, index),
    rowNo: rowNo(row, index),
    refNo: clean(row?.refNo || row?.CA97 || row?.ca97 || row?.ref || ''),
    seqNo: clean(row?.seqNo || row?.CA98 || row?.ca98 || rowNo(row, index)),
    lineNo: clean(row?.lineNo || row?.lineNoKey || row?.lineKey || ''),
    pipelineRef: clean(row?.pipelineRef || row?.pipeline || ''),
    type: clean(row?.type || row?.componentType || row?.normalizedType || ''),
    name: clean(row?.name || row?.tag || ''),
  };
}

function buildIdentityIndexes(rows = [], rowIdentityByComponentId = {}) {
  const byComponentId = new Map();
  const byRowNo = new Map();

  rows.forEach((row, index) => {
    const identity = {
      ...identityFromRow(row, index),
      ...(rowIdentityByComponentId?.[componentIdFromRow(row, index)] || {}),
    };

    if (identity.componentId) byComponentId.set(identity.componentId, identity);
    if (identity.rowNo) byRowNo.set(String(identity.rowNo), identity);
  });

  for (const [componentId, identity] of Object.entries(rowIdentityByComponentId || {})) {
    if (!byComponentId.has(componentId)) {
      byComponentId.set(componentId, {
        componentId,
        rowNo: clean(identity.rowNo),
        refNo: clean(identity.refNo),
        seqNo: clean(identity.seqNo),
        lineNo: clean(identity.lineNo),
        pipelineRef: clean(identity.pipelineRef),
        type: clean(identity.type),
        name: clean(identity.name),
      });
    }
  }

  return { byComponentId, byRowNo };
}

function componentPairKey(a, b) {
  return [clean(a), clean(b)].sort().join('|');
}

function getConnectionComponentIds(connection = {}) {
  const sourceComponentId =
    connection.sourceComponentId ||
    connection.universalEdge?.sourceComponentId ||
    connection.rayCandidate?.sourceComponentId ||
    '';

  const targetComponentId =
    connection.targetComponentId ||
    connection.universalEdge?.targetComponentId ||
    connection.rayCandidate?.targetComponentId ||
    '';

  return {
    sourceComponentId: clean(sourceComponentId),
    targetComponentId: clean(targetComponentId),
  };
}

function getPipelineRef(connection = {}, sourceIdentity = {}, targetIdentity = {}) {
  return clean(
    connection.pipelineRef ||
      connection.universalEdge?.pipelineRef ||
      connection.rayCandidate?.pipelineRef ||
      sourceIdentity.pipelineRef ||
      targetIdentity.pipelineRef ||
      ''
  );
}

function makeHandoffConnection(connection, index, identityIndex) {
  const {
    sourceComponentId,
    targetComponentId,
  } = getConnectionComponentIds(connection);

  const sourceIdentity = identityIndex.byComponentId.get(sourceComponentId) || {
    componentId: sourceComponentId,
  };

  const targetIdentity = identityIndex.byComponentId.get(targetComponentId) || {
    componentId: targetComponentId,
  };

  const id = `AT-HANDOFF-${String(index + 1).padStart(5, '0')}`;

  return {
    id,
    topologyMode: RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY,
    acceptedConnectionId: clean(connection.id),
    source: clean(connection.source),
    decision: clean(connection.decision),
    confidence: clean(connection.confidence),
    action: clean(connection.action || 'NO_MUTATION'),
    sourceComponentId,
    targetComponentId,
    componentPairKey: componentPairKey(sourceComponentId, targetComponentId),
    pipelineRef: getPipelineRef(connection, sourceIdentity, targetIdentity),
    sourceIdentity: { ...sourceIdentity },
    targetIdentity: { ...targetIdentity },
    universalEdgeId: clean(connection.universalEdge?.id),
    rayCandidateId: clean(connection.rayCandidate?.id),
    rayPass: clean(connection.rayCandidate?.pass),
    rayDistanceAlongMm: connection.rayCandidate?.distanceAlongRayMm ?? null,
    rayPerpendicularMissMm: connection.rayCandidate?.perpendicularMissMm ?? null,
    reason: clean(connection.reason),
    exportReady: connection.exportReady !== false,
  };
}

function pushToMapList(map, key, value) {
  const k = clean(key);
  if (!k) return;

  if (!map[k]) map[k] = [];
  map[k].push(value);
}

function addUnique(arr, value) {
  const v = clean(value);
  if (!v) return;
  if (!arr.includes(v)) arr.push(v);
}

function buildRowAnnotations(rows, handoffConnections) {
  const annotationByComponentId = new Map();

  for (const connection of handoffConnections) {
    const sourceId = connection.sourceComponentId;
    const targetId = connection.targetComponentId;

    if (!annotationByComponentId.has(sourceId)) {
      annotationByComponentId.set(sourceId, {
        _uxmlAcceptedTopologyCount: 0,
        _uxmlAcceptedTopologySources: [],
        _uxmlAcceptedTopologyTargets: [],
        _uxmlAcceptedTopologyConnectionIds: [],
      });
    }

    if (!annotationByComponentId.has(targetId)) {
      annotationByComponentId.set(targetId, {
        _uxmlAcceptedTopologyCount: 0,
        _uxmlAcceptedTopologySources: [],
        _uxmlAcceptedTopologyTargets: [],
        _uxmlAcceptedTopologyConnectionIds: [],
      });
    }

    const sourceAnn = annotationByComponentId.get(sourceId);
    const targetAnn = annotationByComponentId.get(targetId);

    sourceAnn._uxmlAcceptedTopologyCount += 1;
    targetAnn._uxmlAcceptedTopologyCount += 1;

    addUnique(sourceAnn._uxmlAcceptedTopologyTargets, targetId);
    addUnique(targetAnn._uxmlAcceptedTopologySources, sourceId);

    addUnique(sourceAnn._uxmlAcceptedTopologyConnectionIds, connection.id);
    addUnique(targetAnn._uxmlAcceptedTopologyConnectionIds, connection.id);
  }

  return rows.map((row, index) => {
    const componentId = componentIdFromRow(row, index);
    const annotation = annotationByComponentId.get(componentId) || {
      _uxmlAcceptedTopologyCount: 0,
      _uxmlAcceptedTopologySources: [],
      _uxmlAcceptedTopologyTargets: [],
      _uxmlAcceptedTopologyConnectionIds: [],
    };

    return {
      componentId,
      rowNo: rowNo(row, index),
      ...annotation,
    };
  });
}

function makeSummary(handoffConnections, rowAnnotations) {
  const confidenceCounts = {};
  const sourceCounts = {};
  const actionCounts = {};
  const pipelines = new Set();

  for (const connection of handoffConnections) {
    const confidence = connection.confidence || 'UNKNOWN';
    const source = connection.source || 'UNKNOWN';
    const action = connection.action || 'UNKNOWN';

    confidenceCounts[confidence] = (confidenceCounts[confidence] || 0) + 1;
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    actionCounts[action] = (actionCounts[action] || 0) + 1;

    if (connection.pipelineRef) pipelines.add(connection.pipelineRef);
  }

  return {
    handoffConnectionCount: handoffConnections.length,
    annotatedRowCount: rowAnnotations.filter(r => r._uxmlAcceptedTopologyCount > 0).length,
    totalRowCount: rowAnnotations.length,
    pipelineCount: pipelines.size,
    pipelines: [...pipelines].sort(),
    confidenceCounts,
    sourceCounts,
    actionCounts,
    legacyRoutingContinues: true,
    mastersDeferredToLegacyRoute: true,
    pcfEmitterDeferredToLegacyRoute: true,
    coordinatesMutated: false,
  };
}

export function buildRvmPcfAcceptedTopologyHandoff({
  rows = [],
  topologyDecision = null,
  rowIdentityByComponentId = {},
} = {}) {
  const identityIndex = buildIdentityIndexes(rows, rowIdentityByComponentId);

  const acceptedConnections = list(topologyDecision?.acceptedConnections);

  const handoffConnections = acceptedConnections
    .filter(connection => connection && connection.exportReady !== false)
    .map((connection, index) => makeHandoffConnection(connection, index, identityIndex));

  const byComponentId = {};
  const byRowNo = {};
  const acceptedComponentPairs = [];

  for (const connection of handoffConnections) {
    pushToMapList(byComponentId, connection.sourceComponentId, connection);
    pushToMapList(byComponentId, connection.targetComponentId, connection);

    pushToMapList(byRowNo, connection.sourceIdentity?.rowNo, connection);
    pushToMapList(byRowNo, connection.targetIdentity?.rowNo, connection);

    addUnique(acceptedComponentPairs, connection.componentPairKey);
  }

  const rowAnnotations = buildRowAnnotations(rows, handoffConnections);

  return {
    schema: RVM_PCF_ACCEPTED_TOPOLOGY_HANDOFF_SCHEMA,
    ok: true,
    topologyMode: RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY,
    handoffConnections,
    byComponentId,
    byRowNo,
    acceptedComponentPairs,
    rowAnnotations,
    summary: makeSummary(handoffConnections, rowAnnotations),
  };
}

export function annotateRowsWithAcceptedTopologyHandoff(rows = [], handoff = null) {
  const annotations = new Map(
    list(handoff?.rowAnnotations).map(item => [clean(item.componentId), item])
  );

  return rows.map((row, index) => {
    const componentId = componentIdFromRow(row, index);
    const annotation = annotations.get(componentId) || {
      _uxmlAcceptedTopologyCount: 0,
      _uxmlAcceptedTopologySources: [],
      _uxmlAcceptedTopologyTargets: [],
      _uxmlAcceptedTopologyConnectionIds: [],
    };

    return {
      ...row,
      _uxmlAcceptedTopologyCount: annotation._uxmlAcceptedTopologyCount,
      _uxmlAcceptedTopologySources: [...annotation._uxmlAcceptedTopologySources],
      _uxmlAcceptedTopologyTargets: [...annotation._uxmlAcceptedTopologyTargets],
      _uxmlAcceptedTopologyConnectionIds: [...annotation._uxmlAcceptedTopologyConnectionIds],
    };
  });
}

export const createRvmPcfAcceptedTopologyHandoff =
  buildRvmPcfAcceptedTopologyHandoff;