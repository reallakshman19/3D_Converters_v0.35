/**
 * Machine-verifiable topology trace ledger projection.
 * Inputs: source model and canonical topology. Output: one explicit primary
 * disposition per branch/component, plus the producer-owned source-port
 * identity manifest. No missing mapping is repaired or silently skipped.
 */

import {
  DEFERRED_ENGINEERING,
  cleanText,
  componentCategory,
  sequenceId,
  uniqueText,
} from './topology-values.js';

/** @param {Record<string, unknown>} canonical @param {string} sourceEntityId @returns {Record<string, unknown>} */
function objectsForSource(canonical, sourceEntityId) {
  const contains = (row) => row.sourceEntityIds.includes(sourceEntityId);
  return {
    edges: canonical.edges.filter(contains),
    points: canonical.pointFeatures.filter(contains),
    junctions: canonical.junctions.filter(contains),
    boundaries: canonical.boundaries.filter(contains),
    supports: canonical.supports.filter(contains),
    rigids: canonical.rigids.filter((row) => row.sourceEntityId === sourceEntityId),
  };
}

/** @param {Record<string, unknown>} source @param {Record<string, unknown>} objects @returns {string} */
function dispositionFor(source, objects) {
  const category = componentCategory(source.sourceType);
  if (category === 'SUPPORT') {
    if (objects.supports.length) return 'EMIT_SUPPORT_ATTACHMENT';
    if (cleanText(source.supportProjection?.disposition) === 'DEFER_SUPPORT') return 'DEFER_SUPPORT';
    return 'BLOCK_AMBIGUOUS';
  }
  if (category === 'TEE') return 'EMIT_TEE_JUNCTION';
  if (category === 'OLET') return 'EMIT_OLET_JUNCTION';
  if (source.sourceType === 'BRANCH') {
    if (objects.boundaries.length) return 'EXTERNAL_BOUNDARY';
    if (objects.edges.length) return 'EMIT_ROUTE_EDGE';
    if (objects.junctions.length) return objects.junctions[0].kind === 'OLET' ? 'EMIT_OLET_JUNCTION' : 'EMIT_TEE_JUNCTION';
    if (objects.points.length) return 'EMIT_POINT_FEATURE';
    return 'BLOCK_AMBIGUOUS';
  }
  if (source.geometryClassification === 'POINT') return 'EMIT_POINT_FEATURE';
  if (source.geometryClassification === 'UNKNOWN') return 'BLOCK_AMBIGUOUS';
  if (category === 'PIPE') return 'EMIT_ROUTE_EDGE';
  if (category === 'ELBO/BEND') return 'EMIT_BEND_EDGE_SET';
  return 'EMIT_INLINE_COMPONENT_EDGE';
}

/** @param {Record<string, unknown>} source @param {string} disposition @returns {string[]} */
function deferredProperties(source, disposition) {
  const category = componentCategory(source.sourceType);
  if (disposition === 'EMIT_SUPPORT_ATTACHMENT') return [];
  if (disposition === 'DEFER_SUPPORT') return ['SUPPORT_ATTACHMENT', 'RESTRAINT'];
  if (category === 'TEE' || category === 'OLET') return ['SIF_VALUES'];
  if (category === 'VALVE' || category === 'FLANGE') return [...DEFERRED_ENGINEERING, 'RIGID', 'WEIGHT'];
  if (category === 'GASK') return [...DEFERRED_ENGINEERING, 'RIGID_MERGE_POLICY'];
  if (category === 'INST') return [...DEFERRED_ENGINEERING, 'RIGID', 'WEIGHT', 'INSTRUMENT_SEMANTICS'];
  if (category === 'REDUCER') return [...DEFERRED_ENGINEERING, 'DIAMETER_TRANSITION'];
  if (category === 'ELBO/BEND') return [...DEFERRED_ENGINEERING, 'BEND_ENGINEERING_PROPERTIES'];
  return source.sourceType === 'BRANCH' ? [] : [...DEFERRED_ENGINEERING];
}

/** @param {string} disposition @param {boolean} isMerge @returns {string} */
function lossClassification(disposition, isMerge) {
  if (isMerge) return 'EXPLICIT_CANONICAL_OVERLAP';
  if (disposition === 'EMIT_SUPPORT_ATTACHMENT') return 'LOSSLESS_SUPPORT_ATTACHMENT';
  if (disposition === 'DEFER_SUPPORT') return 'DEFERRED_NON_RESTRAINT_ATTACHMENT';
  if (disposition === 'EMIT_POINT_FEATURE') return 'POINT_FEATURE_ONLY';
  if (disposition === 'EMIT_TEE_JUNCTION' || disposition === 'EMIT_OLET_JUNCTION') return 'JUNCTION_CONNECTIVITY';
  if (disposition === 'EXTERNAL_BOUNDARY') return 'EXTERNAL_BOUNDARY';
  if (disposition === 'BLOCK_AMBIGUOUS') return 'BLOCKED_AMBIGUOUS';
  if (disposition === 'EMIT_BEND_EDGE_SET') return 'LOSSLESS_MULTI_EDGE';
  return 'LOSSLESS_TOPOLOGY';
}

/** @param {string} disposition @returns {string} */
function operationFor(disposition) {
  const operations = {
    EMIT_ROUTE_EDGE: 'emit-route-edge-set',
    EMIT_INLINE_COMPONENT_EDGE: 'emit-inline-component-edge',
    EMIT_BEND_EDGE_SET: 'emit-bend-edge-set',
    EMIT_POINT_FEATURE: 'emit-point-feature',
    EMIT_TEE_JUNCTION: 'emit-tee-junction',
    EMIT_OLET_JUNCTION: 'emit-olet-junction',
    EMIT_SUPPORT_ATTACHMENT: 'emit-support-restraint',
    DEFER_SUPPORT: 'defer-support',
    EXTERNAL_BOUNDARY: 'emit-external-boundary',
    BLOCK_AMBIGUOUS: 'block-ambiguous',
  };
  return operations[disposition] ?? 'record-topology-decision';
}

/** @param {number} edgeCount @param {string} disposition @param {boolean} isMerge @returns {string} */
function projectionCardinality(edgeCount, disposition, isMerge) {
  if (disposition === 'BLOCK_AMBIGUOUS') return 'BLOCKED';
  if (disposition === 'DEFER_SUPPORT') return 'DEFERRED';
  if ((disposition === 'EMIT_POINT_FEATURE' || disposition === 'EXTERNAL_BOUNDARY') && edgeCount === 0) return 'POINT_ONLY';
  if (edgeCount === 1 && isMerge) return 'MANY_TO_ONE';
  if (edgeCount > 1) return 'ONE_TO_MANY';
  if (edgeCount === 1) return 'ONE_TO_ONE';
  if (disposition === 'EMIT_TEE_JUNCTION' || disposition === 'EMIT_OLET_JUNCTION') return 'JUNCTION_ONLY';
  return 'POINT_ONLY';
}

/** @param {Record<string, unknown>} source @param {Record<string, unknown>} canonical @param {Record<string, unknown>} objects @returns {Record<string, unknown>[]} */
function affectedHeaderEdges(source, canonical, objects) {
  if (componentCategory(source.sourceType) !== 'OLET' || !objects.junctions.length) return [];
  const nodeId = objects.junctions[0].nodeId;
  return canonical.edges.filter((edge) => (
    edge.segmentRole !== 'CREF_BRANCH_CONNECTION'
    && (edge.fromNodeId === nodeId || edge.toNodeId === nodeId)
  ));
}

/** @param {Record<string, unknown>[]} edges @returns {string[]} */
function edgeNodeIds(edges) {
  return uniqueText(edges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]));
}

/** @param {Record<string, unknown>} source @param {Record<string, unknown>} canonical @param {number} index @returns {Record<string, unknown>} */
function ledgerRecord(source, canonical, index) {
  const objects = objectsForSource(canonical, source.sourceEntityId);
  const disposition = dispositionFor(source, objects);
  const headerEdges = affectedHeaderEdges(source, canonical, objects);
  const referenceEdges = objects.edges.filter((edge) => edge.segmentRole === 'CREF_BRANCH_CONNECTION');
  const rigidEdges = canonical.edges.filter((edge) => objects.rigids.some((rigid) => rigid.edgeId === edge.id));
  const effectiveEdgeRows = [...objects.edges, ...headerEdges, ...rigidEdges];
  const effectiveEdges = uniqueText(effectiveEdgeRows.map((edge) => edge.id));
  const nodeIds = uniqueText([
    ...edgeNodeIds(objects.edges),
    ...objects.junctions.map((junction) => junction.nodeId),
    ...objects.boundaries.map((boundary) => boundary.nodeId),
    ...objects.supports.map((support) => support.nodeId),
  ]);
  const affectedSourceEntityIds = uniqueText([
    ...objects.edges.flatMap((edge) => edge.sourceEntityIds),
    ...objects.junctions.flatMap((junction) => junction.sourceEntityIds),
    ...objects.boundaries.flatMap((boundary) => boundary.sourceEntityIds),
  ]).filter((id) => id !== source.sourceEntityId);
  const inputXmlElementIds = uniqueText(effectiveEdgeRows.flatMap((edge) => edge.inputXmlElementIds));
  const singleEdge = effectiveEdgeRows.length === 1 ? effectiveEdgeRows[0] : null;
  const mergeEdge = objects.edges.find((edge) => (
    edge.projectionCardinality === 'MANY_TO_ONE'
    && edge.mergeSourceEntityIds.includes(source.sourceEntityId)
  ));
  const isMerge = Boolean(mergeEdge);
  const projectedCategory = singleEdge ? componentCategory(singleEdge.sourceTypes[0]) : '';
  const sourceCategory = componentCategory(source.sourceType);
  return {
    id: `TL-${sequenceId(index + 1)}`,
    sourceEntityId: source.sourceEntityId,
    sourcePath: source.sourcePath,
    sourceType: source.sourceType,
    sourceRef: source.sourceRef,
    primaryDisposition: disposition,
    canonicalNodeIds: nodeIds,
    canonicalEdgeIds: uniqueText(objects.edges.map((edge) => edge.id)),
    pointFeatureIds: uniqueText(objects.points.map((point) => point.id)),
    junctionIds: uniqueText(objects.junctions.map((junction) => junction.id)),
    boundaryIds: uniqueText(objects.boundaries.map((boundary) => boundary.id)),
    affectedEdgeIds: uniqueText(headerEdges.map((edge) => edge.id)),
    branchEdgeIds: uniqueText(referenceEdges.map((edge) => edge.id)),
    affectedSourceEntityIds,
    inputXmlElementIds,
    inputXmlChildIds: uniqueText([
      ...objects.supports.flatMap((support) => support.restraints.map((_, restraintIndex) => `RESTRAINT:${support.id}:${restraintIndex + 1}`)),
      ...objects.rigids.map((rigid) => `RIGID:${rigid.edgeId}`),
    ]),
    inputXmlFromNode: singleEdge ? canonical.nodes.find((node) => node.id === singleEdge.fromNodeId)?.inputXmlNodeIds[0] ?? '' : '',
    inputXmlToNode: singleEdge ? canonical.nodes.find((node) => node.id === singleEdge.toNodeId)?.inputXmlNodeIds[0] ?? '' : '',
    projectionCardinality: projectionCardinality(effectiveEdges.length, disposition, isMerge),
    deferredProperties: deferredProperties(source, disposition),
    lossClassification: lossClassification(disposition, isMerge),
    operation: operationFor(disposition),
    evidence: {
      identityAuthority: 'SourceEnvelope.v1/UniversalSourceGraph.v1',
      geometryClassification: source.geometryClassification ?? 'BRANCH',
      sourceCref: cleanText(source.attributes.CREF),
      sourceHref: cleanText(source.attributes.HREF),
      sourceTref: cleanText(source.attributes.TREF),
      supportProjectionAuthority: cleanText(source.supportProjection?.authority),
      supportProjectionReason: cleanText(source.supportProjection?.reason),
      cardinalityReason: effectiveEdges.length > 1 ? 'EXPLICIT_COMPONENT_SEGMENTATION_OR_JUNCTION' : 'DIRECT_PROJECTION',
      mergeAuthority: mergeEdge?.projectionMergeAuthority ?? '',
      reclassification: isMerge && projectedCategory !== sourceCategory
        ? `${sourceCategory}_TO_${projectedCategory}_SHARED_COMPONENT_SPAN` : '',
      headerSegmentationAuthority: componentCategory(source.sourceType) === 'OLET' ? 'MANAGED_SOURCE_COMPONENT_BOUNDARY' : '',
    },
    status: disposition === 'BLOCK_AMBIGUOUS' ? 'ERROR' : 'ACCEPTED',
  };
}

/** @param {Record<string, unknown>} model @param {Record<string, unknown>} canonical @returns {Readonly<Record<string, unknown>>} */
export function buildTopologyTraceLedger(model, canonical) {
  const records = model.entities.map((source, index) => ledgerRecord(source, canonical, index));
  const routeRecords = records.filter((row) => model.components.some((component) => component.sourceEntityId === row.sourceEntityId && component.isRouteComponent));
  return Object.freeze({
    schema: 'TopologyTraceLedger.v1',
    sourceIdentity: model.sourceIdentity,
    sourcePorts: Object.freeze(model.sourcePorts.map((port) => ({
      sourcePortId: port.sourcePortId,
      sourceEntityId: port.sourceEntityId,
      sourcePath: port.sourcePath,
      role: port.role,
      field: port.field,
      sourceType: port.sourceType,
    }))),
    records: Object.freeze(records),
    summary: Object.freeze({
      sourceRecords: records.length,
      branchRecords: model.branches.length,
      routeRecords: routeRecords.length,
      supportRecords: model.components.filter((component) => componentCategory(component.sourceType) === 'SUPPORT').length,
      deferredSupportRecords: records.filter((row) => row.primaryDisposition === 'DEFER_SUPPORT').length,
      blockedRecords: records.filter((row) => row.primaryDisposition === 'BLOCK_AMBIGUOUS').length,
    }),
  });
}
