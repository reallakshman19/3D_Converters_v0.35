/**
 * Builds the source-neutral TopologySvgScene.v1 contract. Inputs are limited to
 * CanonicalTopology.v1, TopologyTraceLedger.v1, and producer diagnostics. The
 * scene preserves canonical three-dimensional world geometry; no screen
 * projection, route inference, carrier selection, or topology repair occurs.
 */

import { deterministicHash, stampArtifactHash, TOPOLOGY_HASH_ALGORITHM } from './topology-deterministic-hash.js';
import { cleanText, uniqueText } from './topology-values.js';

/** @param {Record<string, unknown>} row @returns {Readonly<Record<string, unknown>>} */
function sceneNode(row) {
  return Object.freeze({
    id: cleanText(row.id),
    canonicalNodeId: cleanText(row.id),
    inputXmlNodeId: cleanText(row.inputXmlNodeIds?.[0]),
    position: Object.freeze({ ...row.position }),
    sourceEntityIds: Object.freeze(uniqueText(row.sourceEntityIds ?? [])),
    sourcePortIds: Object.freeze(uniqueText(row.sourcePortIds ?? [])),
    sourcePaths: Object.freeze(uniqueText(row.sourcePaths ?? [])),
    branchIds: Object.freeze(uniqueText(row.branchIds ?? [])),
    positionAuthority: cleanText(row.positionAuthority),
    connectionAuthority: Object.freeze(uniqueText(row.connectionAuthority ?? [])),
    connectionResidual: Number(row.connectionResidual ?? 0),
  });
}

/** @param {Record<string, unknown>} row @param {Map<string,Record<string,unknown>>} nodes @returns {Readonly<Record<string, unknown>>} */
function sceneEdge(row, nodes) {
  const from = nodes.get(cleanText(row.fromNodeId));
  const to = nodes.get(cleanText(row.toNodeId));
  if (!from || !to) throw new Error(`SVG scene edge ${row.id} references a missing canonical node.`);
  return Object.freeze({
    id: cleanText(row.id),
    canonicalEdgeId: cleanText(row.id),
    inputXmlElementId: cleanText(row.inputXmlElementIds?.[0]),
    fromCanonicalNodeId: cleanText(row.fromNodeId),
    toCanonicalNodeId: cleanText(row.toNodeId),
    fromPosition: Object.freeze({ ...from.position }),
    toPosition: Object.freeze({ ...to.position }),
    sourceEntityIds: Object.freeze(uniqueText(row.sourceEntityIds ?? [])),
    sourcePortIds: Object.freeze(uniqueText(row.sourcePortIds ?? [])),
    sourcePaths: Object.freeze(uniqueText(row.sourcePaths ?? [])),
    branchIds: Object.freeze(uniqueText(row.branchIds ?? [])),
    sourceTypes: Object.freeze(uniqueText(row.sourceTypes ?? [])),
    segmentRole: cleanText(row.segmentRole),
    topologyOperation: cleanText(row.topologyOperation ?? row.segmentRole),
    projectionCardinality: cleanText(row.projectionCardinality || 'ONE_TO_ONE'),
    mergeAuthority: cleanText(row.projectionMergeAuthority),
    mergeSourceEntityIds: Object.freeze(uniqueText(row.mergeSourceEntityIds ?? [])),
    connectionAuthority: cleanText(row.connectionAuthority),
    connectionResidual: Number(row.connectionResidual ?? 0),
  });
}

/** @param {Record<string, unknown>} row @returns {Readonly<Record<string, unknown>>} */
function sceneSupport(row) {
  return Object.freeze({
    id: cleanText(row.id),
    canonicalSupportId: cleanText(row.id),
    canonicalNodeId: cleanText(row.nodeId),
    inputXmlNodeId: cleanText(row.inputXmlNodeId),
    inputXmlRestraintIds: Object.freeze((row.restraints ?? []).map((_item, index) => `RESTRAINT:${row.id}:${index + 1}`)),
    tag: cleanText(row.tag),
    position: Object.freeze({ ...row.position }),
    sourcePosition: Object.freeze({ ...row.sourcePosition }),
    attachmentPosition: Object.freeze({ ...(row.attachmentPosition ?? row.position) }),
    sourceEntityIds: Object.freeze(uniqueText(row.sourceEntityIds ?? [])),
    sourcePaths: Object.freeze(uniqueText(row.sourcePaths ?? [])),
    branchIds: Object.freeze(uniqueText(row.branchIds ?? [])),
    attachmentAuthority: cleanText(row.attachmentAuthority),
    attachmentReferences: Object.freeze(uniqueText(row.attachmentReferences ?? [])),
    attachedComponentEntityIds: Object.freeze(uniqueText(row.attachedComponentEntityIds ?? [])),
    connectionResidual: Number(row.connectionResidual ?? 0),
    restraintCount: (row.restraints ?? []).length,
    topologyBearing: true,
  });
}

/** @param {Record<string, unknown>} record @returns {Readonly<Record<string, unknown>>} */
function deferredSupport(record) {
  const evidence = record.evidence ?? {};
  const position = evidence.sourcePosition ?? record.sourcePosition ?? null;
  return Object.freeze({
    id: cleanText(record.id),
    ledgerRecordId: cleanText(record.id),
    sourceEntityId: cleanText(record.sourceEntityId),
    sourceEntityIds: Object.freeze(uniqueText([record.sourceEntityId, ...(record.affectedSourceEntityIds ?? [])])),
    sourcePath: cleanText(record.sourcePath),
    sourcePaths: Object.freeze(uniqueText([record.sourcePath])),
    sourceRef: cleanText(record.sourceRef),
    branchIds: Object.freeze(uniqueText(record.branchIds ?? [])),
    position: position ? Object.freeze({ ...position }) : null,
    primaryDisposition: cleanText(record.primaryDisposition),
    projectionCardinality: cleanText(record.projectionCardinality),
    lossClassification: cleanText(record.lossClassification),
    status: cleanText(record.status),
    supportTag: cleanText(evidence.supportTag),
    attachmentAuthority: cleanText(evidence.attachmentAuthority ?? evidence.supportProjectionAuthority),
    topologyBearing: false,
    deferred: true,
  });
}

/** @param {Record<string, unknown>[]} rows @returns {ReadonlyArray<Readonly<Record<string, unknown>>>} */
function sceneRigids(rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.edgeId, [...(groups.get(row.edgeId) ?? []), row]);
  return Object.freeze([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([edgeId, group]) => Object.freeze({
    id: `RIGID:${edgeId}`,
    canonicalEdgeId: edgeId,
    inputXmlElementId: cleanText(group[0]?.inputXmlElementId),
    sourceEntityIds: Object.freeze(uniqueText(group.flatMap((row) => row.sourceEntityIds ?? [row.sourceEntityId]))),
    sourcePaths: Object.freeze(uniqueText(group.flatMap((row) => row.sourcePaths ?? [row.sourcePath]))),
    branchIds: Object.freeze(uniqueText(group.flatMap((row) => row.branchIds ?? []))),
    assignmentAuthorities: Object.freeze(uniqueText(group.map((row) => row.assignmentAuthority))),
    connectionResidual: Math.max(0, ...group.map((row) => Number(row.connectionResidual) || 0)),
    componentTypes: Object.freeze(uniqueText(group.map((row) => row.componentType))),
    sourceBodyCount: group.length,
    weightKg: group.reduce((sum, row) => sum + (Number(row.weightKg) || 0), 0),
  })));
}

/** @param {Record<string, unknown>} canonical @param {Record<string, unknown>} ledger @param {Record<string, unknown>[]} [producerDiagnostics] @returns {Readonly<Record<string, unknown>>} */
export function buildTopologySvgScene(canonical, ledger, producerDiagnostics = []) {
  if (canonical.schema !== 'CanonicalTopology.v1') throw new TypeError(`TopologySvgScene requires CanonicalTopology.v1; received ${canonical.schema || '(missing)'}.`);
  if (ledger.schema !== 'TopologyTraceLedger.v1') throw new TypeError(`TopologySvgScene requires TopologyTraceLedger.v1; received ${ledger.schema || '(missing)'}.`);
  const canonicalTopologyHash = cleanText(canonical.canonicalTopologyHash) || deterministicHash(canonical);
  if (cleanText(ledger.canonicalTopologyHash) && cleanText(ledger.canonicalTopologyHash) !== canonicalTopologyHash) {
    throw new Error('Topology trace ledger canonicalTopologyHash does not match the canonical snapshot.');
  }
  const nodes = Object.freeze((canonical.nodes ?? []).map(sceneNode));
  const nodeById = new Map(nodes.map((row) => [row.canonicalNodeId, row]));
  const edges = Object.freeze((canonical.edges ?? []).map((row) => sceneEdge(row, nodeById)));
  const supports = Object.freeze((canonical.supports ?? []).map(sceneSupport));
  const deferredSupports = Object.freeze((ledger.records ?? []).filter((row) => row.primaryDisposition === 'DEFER_SUPPORT').map(deferredSupport));
  const rigids = sceneRigids(canonical.rigids ?? []);
  const junctions = Object.freeze((canonical.junctions ?? []).map((row) => Object.freeze({
    ...row,
    canonicalJunctionId: cleanText(row.id),
    canonicalNodeId: cleanText(row.nodeId),
    position: Object.freeze({ ...row.position }),
    participatingCanonicalEdgeIds: Object.freeze(uniqueText(row.participatingEdgeIds ?? edges.filter((edge) => edge.fromCanonicalNodeId === row.nodeId || edge.toCanonicalNodeId === row.nodeId).map((edge) => edge.canonicalEdgeId))),
    sourceEntityIds: Object.freeze(uniqueText(row.sourceEntityIds ?? [])),
    sourcePaths: Object.freeze(uniqueText(row.sourcePaths ?? [])),
    branchIds: Object.freeze(uniqueText(row.branchIds ?? [])),
  })));
  const boundaries = Object.freeze((canonical.boundaries ?? []).map((row) => Object.freeze({
    ...row,
    canonicalBoundaryId: cleanText(row.id),
    canonicalNodeId: cleanText(row.nodeId),
    position: Object.freeze({ ...row.position }),
    participatingCanonicalEdgeIds: Object.freeze(uniqueText(row.participatingEdgeIds ?? edges.filter((edge) => edge.fromCanonicalNodeId === row.nodeId || edge.toCanonicalNodeId === row.nodeId).map((edge) => edge.canonicalEdgeId))),
    sourceEntityIds: Object.freeze(uniqueText(row.sourceEntityIds ?? [])),
    sourcePaths: Object.freeze(uniqueText(row.sourcePaths ?? [])),
    branchIds: Object.freeze(uniqueText(row.branchIds ?? [])),
  })));
  const pointFeatures = Object.freeze((canonical.pointFeatures ?? []).map((row) => Object.freeze({
    ...row,
    canonicalPointFeatureId: cleanText(row.id),
    position: Object.freeze({ ...row.position }),
    sourceEntityIds: Object.freeze(uniqueText(row.sourceEntityIds ?? [])),
    sourcePaths: Object.freeze(uniqueText(row.sourcePaths ?? [])),
    branchIds: Object.freeze(uniqueText(row.branchIds ?? [])),
    topologyBearing: false,
  })));
  const issues = Object.freeze([...(canonical.buildIssues ?? []), ...producerDiagnostics].map((row, index) => Object.freeze({
    id: cleanText(row.id) || `SCENE-ISSUE-${String(index + 1).padStart(6, '0')}`,
    ...row,
  })));
  const scene = Object.freeze({
    schema: 'TopologySvgScene.v1',
    sourceIdentity: canonical.sourceIdentity,
    hashAlgorithm: TOPOLOGY_HASH_ALGORITHM,
    canonicalTopologyHash,
    topologyTraceLedgerHash: cleanText(ledger.topologyTraceLedgerHash) || deterministicHash(ledger),
    coordinateFrame: canonical.coordinateFrame,
    worldCoordinatePrecision: Object.freeze({ unit: 'mm', decimals: null, authority: 'CanonicalTopology.v1' }),
    nodes,
    edges,
    supports,
    deferredSupports,
    rigids,
    junctions,
    boundaries,
    pointFeatures,
    issues,
    summary: Object.freeze({
      nodes: nodes.length,
      edges: edges.length,
      supports: supports.length,
      deferredSupports: deferredSupports.length,
      rigids: rigids.length,
      junctions: junctions.length,
      boundaries: boundaries.length,
      pointFeatures: pointFeatures.length,
      issues: issues.length,
    }),
  });
  return stampArtifactHash(scene, 'svgSceneHash');
}

export const _test = Object.freeze({ sceneNode, sceneEdge, sceneSupport, deferredSupport, sceneRigids });
