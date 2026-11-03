/**
 * Adds topology trace identity derived only from producer-owned source,
 * canonical, ledger, and engineering records. No geometry or connectivity is
 * reconstructed here.
 */

import {
  cleanText,
  sequenceId,
  strictPoint,
  uniqueText,
} from './topology-values.js';

function sourceIndexes(model) {
  const branchByEntity = new Map(), pathByEntity = new Map(), refByEntity = new Map();
  for (const branch of model.branches ?? []) {
    branchByEntity.set(branch.sourceEntityId, branch.sourceEntityId);
    pathByEntity.set(branch.sourceEntityId, branch.sourcePath);
    refByEntity.set(branch.sourceEntityId, branch.sourceRef || branch.name || '');
  }
  for (const component of model.components ?? []) {
    branchByEntity.set(component.sourceEntityId, component.sourceBranchEntityId);
    pathByEntity.set(component.sourceEntityId, component.sourcePath);
    refByEntity.set(component.sourceEntityId, component.sourceRef || component.name || '');
  }
  return { branchByEntity, pathByEntity, refByEntity };
}

function indexedValues(sourceIds, index) {
  return uniqueText(sourceIds.flatMap((id) => index.has(cleanText(id)) ? [index.get(cleanText(id))] : []));
}

function traceRow(row, indexes) {
  const sourceEntityIds = uniqueText(row.sourceEntityIds ?? []);
  return {
    ...row,
    sourceEntityIds,
    sourcePaths: uniqueText([...(row.sourcePaths ?? []), ...indexedValues(sourceEntityIds, indexes.pathByEntity)]),
    branchIds: uniqueText([...(row.branchIds ?? row.sourceBranchEntityIds ?? []), ...indexedValues(sourceEntityIds, indexes.branchByEntity)]),
  };
}

export function enrichCanonicalTopologyIdentity(canonical, model) {
  const indexes = sourceIndexes(model);
  const edges = (canonical.edges ?? []).map((edge) => ({
    ...traceRow(edge, indexes),
    ownerBranchId: indexedValues([edge.sourceEntityIds?.[0]], indexes.branchByEntity)[0]
      ?? indexedValues(edge.sourceEntityIds ?? [], indexes.branchByEntity)[0]
      ?? '',
    topologyOperation: cleanText(edge.topologyOperation ?? edge.segmentRole),
  }));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const nodes = (canonical.nodes ?? []).map((node) => traceRow(node, indexes));
  const pointFeatures = (canonical.pointFeatures ?? []).map((row) => traceRow(row, indexes));
  const junctions = (canonical.junctions ?? []).map((row) => ({
    ...traceRow(row, indexes),
    participatingEdgeIds: uniqueText(edges.filter((edge) => (
      edge.fromNodeId === row.nodeId || edge.toNodeId === row.nodeId
    )).map((edge) => edge.id)),
  }));
  const boundaries = (canonical.boundaries ?? []).map((row) => ({
    ...traceRow(row, indexes),
    participatingEdgeIds: uniqueText(edges.filter((edge) => (
      edge.fromNodeId === row.nodeId || edge.toNodeId === row.nodeId
    )).map((edge) => edge.id)),
  }));
  const supports = (canonical.supports ?? []).map((row) => traceRow(row, indexes));
  const rigids = (canonical.rigids ?? []).map((row, index) => {
    const branchIds = indexedValues([row.sourceEntityId], indexes.branchByEntity);
    const edge = edgeById.get(row.edgeId);
    const assignmentAuthority = edge?.sourceEntityIds?.includes(row.sourceEntityId)
      ? 'SOURCE_COMPONENT_EDGE'
      : edge?.sourceEntityIds?.some((id) => branchIds.includes(id))
        ? 'SOURCE_BRANCH_EDGE'
        : 'GLOBAL_PROXIMITY_FALLBACK';
    return {
      ...row,
      id: cleanText(row.id) || `CR-${sequenceId(index + 1)}`,
      sourceEntityIds: uniqueText([row.sourceEntityId]),
      sourcePaths: uniqueText([row.sourcePath, ...indexedValues([row.sourceEntityId], indexes.pathByEntity)]),
      branchIds,
      assignmentAuthority,
    };
  });
  return Object.freeze({
    ...canonical,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    pointFeatures: Object.freeze(pointFeatures),
    junctions: Object.freeze(junctions),
    boundaries: Object.freeze(boundaries),
    supports: Object.freeze(supports),
    rigids: Object.freeze(rigids),
  });
}

function sourcePosition(source) {
  const positions = source.positions ?? {};
  return strictPoint(positions.POS) ?? strictPoint(positions.APOS) ?? strictPoint(positions.LPOS);
}

export function enrichTopologyTraceLedgerIdentity(ledger, canonical, model, engineering, configuration) {
  const indexes = sourceIndexes(model);
  const sourceEntities = [...(model.branches ?? []), ...(model.components ?? [])];
  const sourceById = new Map(sourceEntities.map((row) => [row.sourceEntityId, row]));
  const supportBySource = new Map();
  for (const support of canonical.supports ?? []) {
    for (const sourceEntityId of support.sourceEntityIds ?? []) supportBySource.set(sourceEntityId, support);
  }
  const deferredBySource = new Map((engineering.deferredSupports ?? []).map((row) => [row.sourceEntityId, row]));
  const records = (ledger.records ?? []).map((record) => {
    const source = sourceById.get(record.sourceEntityId) ?? {};
    const support = supportBySource.get(record.sourceEntityId) ?? null;
    const deferred = deferredBySource.get(record.sourceEntityId) ?? null;
    const sourcePos = support?.sourcePosition ?? sourcePosition(source);
    const evidence = {
      ...(record.evidence ?? {}),
      sourcePosition: sourcePos,
      attachmentPosition: support?.attachmentPosition ?? null,
      attachmentAuthority: support?.attachmentAuthority ?? cleanText(deferred?.policy?.authority),
      attachmentReferences: support?.attachmentReferences ?? [],
      connectionResidual: support?.connectionResidual ?? null,
      supportTag: support?.tag ?? cleanText(source.attributes?.NAME ?? source.name),
    };
    return {
      ...record,
      branchIds: indexedValues([record.sourceEntityId, ...(record.affectedSourceEntityIds ?? [])], indexes.branchByEntity),
      sourcePosition: sourcePos,
      canonicalSupportIds: support ? [support.id] : [],
      evidence,
    };
  });
  return Object.freeze({
    ...ledger,
    canonicalTopologyHash: canonical.canonicalTopologyHash,
    topologyConfiguration: Object.freeze({ ...configuration }),
    records: Object.freeze(records),
  });
}

export const _test = Object.freeze({ sourceIndexes, indexedValues, traceRow, sourcePosition });
