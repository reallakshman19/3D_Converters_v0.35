/**
 * Functionality: creates the sole TopoNodePlan numbering authority and applies it to serialization views.
 * Parameters: number-free CanonicalTopology.v2, producer source model, and optional reviewed legacy numbers.
 * Outputs: immutable node plan, numbered projection, shadow report, and migration-only v1 view.
 * Fallback: none; incomplete, duplicate, or stale node mappings raise explicit errors.
 */
import { computeSemanticHash } from '../../../../contracts/topo-enriched-xml/contract-core.js';
import { TOPONODEPLAN_V1 } from '../../../../contracts/topo-enriched-xml/contracts.js';
import { hashReleaseJson } from '../../../../converters/inputxml-release/inputxml-release-hash.js';
import { cleanText, sequenceId, uniqueText } from './topology-values.js';

function branchIndexBySourceEntity(model) {
  const result = new Map();
  for (const [branchIndex, branch] of (model.branches ?? []).entries()) {
    for (const component of branch.components ?? []) result.set(component.sourceEntityId, branchIndex);
  }
  return result;
}

function allocatedNumbers(canonical, model) {
  const branchIndexes = branchIndexBySourceEntity(model), counters = new Map();
  return new Map(canonical.nodes.map((node) => {
    const authority = cleanText(node.numberingAuthoritySourceEntityId);
    const branchIndex = branchIndexes.get(authority) ?? 0;
    const ordinal = (counters.get(branchIndex) ?? 0) + 1;
    counters.set(branchIndex, ordinal);
    return [node.id, (branchIndex + 1) * 10000 + ordinal * 10];
  }));
}

function requiredNumber(numberByNode, nodeId) {
  const number = Number(numberByNode.get(nodeId));
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`Canonical node ${nodeId} has no positive engineering node allocation.`);
  }
  return number;
}

function nodeRows(canonical, numberByNode) {
  return canonical.nodes.map((node, index) => ({
    logicalNodeId: `LN-${sequenceId(index + 1)}`,
    historyNodeId: node.id,
    engineeringNodeNumber: requiredNumber(numberByNode, node.id),
    allocationKind: 'COMPONENT_TOPOLOGY_AUTHORITY',
    matchDisposition: 'MATCHED',
  }));
}

function occurrenceRows(canonical, logicalNodes) {
  return canonical.nodes.map((node, index) => ({
    occurrenceId: `NO-${sequenceId(index + 1)}`,
    logicalNodeId: logicalNodes[index].logicalNodeId,
    historyNodeId: logicalNodes[index].historyNodeId,
    componentProjectionId: `CP-${sequenceId(index + 1)}`,
    engineeringNodeNumber: logicalNodes[index].engineeringNodeNumber,
    disposition: 'EMITTED',
    sourceEntityId: cleanText(node.numberingAuthoritySourceEntityId || node.sourceEntityIds?.[0]),
  }));
}

function rawPortMappings(canonical, logicalNodes) {
  return canonical.nodes.flatMap((node, index) => uniqueText(node.sourcePortIds ?? []).map((sourcePortId) => ({
    sourcePortId,
    logicalNodeId: logicalNodes[index].logicalNodeId,
  }))).sort((left, right) => left.sourcePortId.localeCompare(right.sourcePortId));
}

function componentProjection(occurrences) {
  return occurrences.map((row) => ({
    componentProjectionId: row.componentProjectionId,
    sourceEntityId: row.sourceEntityId || row.historyNodeId,
    emittedOccurrenceIds: [row.occurrenceId],
    reservedOccurrenceIds: [],
  }));
}

async function buildNodePlan(canonical, numberByNode) {
  const logicalNodes = nodeRows(canonical, numberByNode);
  const emittedOccurrences = occurrenceRows(canonical, logicalNodes);
  const anchor = `sha256:${canonical.canonicalTopologyHashSha256}`;
  const candidate = {
    schema: 'TopoNodePlan.v1', projectId: cleanText(canonical.sourceIdentity?.sourceName) || 'component-topology',
    zoneId: 'component-topology', sourceInventoryHash: anchor, logicalTopologyHash: anchor,
    sequencePlanHash: anchor, baseRegistrySnapshotHash: anchor, configHash: anchor,
    logicalNodes, emittedOccurrences, reservedOccurrences: [],
    rawPortMappings: rawPortMappings(canonical, logicalNodes),
    componentProjection: componentProjection(emittedOccurrences),
    validation: { status: 'PASS', blockers: [], reviewItems: [], warnings: [] },
  };
  candidate.nodePlanHash = await computeSemanticHash(candidate, 'nodePlanHash');
  const errors = TOPONODEPLAN_V1.validate(candidate);
  if (errors.length) throw new TypeError(`Generated TopoNodePlan.v1 is invalid: ${errors.join('; ')}`);
  return TOPONODEPLAN_V1.freeze(candidate);
}

async function buildProjection(canonical, nodePlan) {
  const logicalById = new Map(nodePlan.logicalNodes.map((row) => [row.logicalNodeId, row]));
  const logicalByPort = new Map(nodePlan.rawPortMappings.map((row) => [row.sourcePortId, row.logicalNodeId]));
  const nodes = canonical.nodes.map((node) => {
    const logicalIds = uniqueText(node.sourcePortIds.map((portId) => logicalByPort.get(portId)));
    if (logicalIds.length !== 1) throw new Error(`Canonical node ${node.id} maps to ${logicalIds.length} logical nodes.`);
    const logical = logicalById.get(logicalIds[0]);
    return { canonicalNodeId: node.id, logicalNodeId: logical.logicalNodeId, engineeringNodeNumber: logical.engineeringNodeNumber };
  });
  const base = { schema: 'NumberedTopologyProjection.v1', canonicalTopologyHashSha256: canonical.canonicalTopologyHashSha256, topoNodePlanHashSha256: nodePlan.nodePlanHash.replace(/^sha256:/, ''), authority: 'TopoNodePlan.v1', nodes };
  return Object.freeze({ ...base, numberedTopologyProjectionHashSha256: await hashReleaseJson(base, 'numberedTopologyProjectionHashSha256') });
}

function shadowReport(canonical, expectedNumbers, projection) {
  const actual = new Map(projection.nodes.map((row) => [row.canonicalNodeId, row.engineeringNodeNumber]));
  const differences = canonical.nodes.flatMap((node) => {
    const expected = requiredNumber(expectedNumbers, node.id), observed = actual.get(node.id);
    return expected === observed ? [] : [{ canonicalNodeId: node.id, expected, actual: observed ?? null }];
  });
  return Object.freeze({ schema: 'TopologyNumberingShadowReport.v1', status: differences.length ? 'BLOCKED' : 'PASS', differences: Object.freeze(differences) });
}

export async function stampCanonicalTopologyV2(canonical) {
  if (canonical.schema !== 'CanonicalTopology.v2') throw new TypeError('CanonicalTopology.v2 is required.');
  const summary = { nodes: canonical.nodes.length, edges: canonical.edges.length, supports: canonical.supports.length };
  const base = { ...canonical, summary };
  return Object.freeze({ ...base, canonicalTopologyHashSha256: await hashReleaseJson(base, 'canonicalTopologyHashSha256') });
}

export async function buildTopologyNumberingArtifacts(canonical, model, suppliedNumbers) {
  const expectedNumbers = allocatedNumbers(canonical, model);
  const numberByNode = suppliedNumbers instanceof Map ? suppliedNumbers : expectedNumbers;
  const topoNodePlan = await buildNodePlan(canonical, numberByNode);
  const numberedTopologyProjection = await buildProjection(canonical, topoNodePlan);
  const numberingShadowReport = shadowReport(canonical, expectedNumbers, numberedTopologyProjection);
  if (numberingShadowReport.status !== 'PASS') throw new Error('Node-plan numbering differs from the legacy allocation baseline.');
  return Object.freeze({ topoNodePlan, numberedTopologyProjection, numberingShadowReport });
}

export function applyNumberedTopologyProjection(canonical, projection) {
  if (projection?.schema !== 'NumberedTopologyProjection.v1') throw new TypeError('NumberedTopologyProjection.v1 is required.');
  if (projection.canonicalTopologyHashSha256 !== canonical.canonicalTopologyHashSha256) throw new Error('Numbered topology projection targets a different canonical topology.');
  const byNode = new Map(projection.nodes.map((row) => [row.canonicalNodeId, row.engineeringNodeNumber]));
  if (byNode.size !== canonical.nodes.length) throw new Error('Numbered topology projection does not cover every canonical node.');
  const nodes = canonical.nodes.map((node) => ({ ...node, inputXmlNodeIds: [String(requiredNumber(byNode, node.id))] }));
  const supports = canonical.supports.map((support) => ({ ...support, inputXmlNodeId: String(requiredNumber(byNode, support.nodeId)) }));
  const edgeById = new Map(canonical.edges.map((edge) => [edge.id, edge]));
  const rigids = canonical.rigids.map((rigid) => {
    const edge = edgeById.get(rigid.edgeId);
    if (!edge) throw new Error(`Rigid ${rigid.id || rigid.sourceEntityId} references missing edge ${rigid.edgeId}.`);
    return { ...rigid, inputXmlNodeId: String(requiredNumber(byNode, edge.toNodeId)) };
  });
  return Object.freeze({ ...canonical, schema: 'CanonicalTopology.v1', nodes: Object.freeze(nodes), supports: Object.freeze(supports), rigids: Object.freeze(rigids) });
}

export async function canonicalTopologyV2FromLegacy(canonical) {
  const nodes = canonical.nodes.map(({ inputXmlNodeIds: _numbers, ...node }) => node);
  const supports = canonical.supports.map(({ inputXmlNodeId: _number, ...support }) => support);
  const rigids = canonical.rigids.map(({ inputXmlNodeId: _number, ...rigid }) => rigid);
  const { canonicalTopologyHash: _legacyHash, canonicalTopologyHashSha256: _sha, ...rest } = canonical;
  return stampCanonicalTopologyV2({ ...rest, schema: 'CanonicalTopology.v2', nodes, supports, rigids });
}

export function legacyNumberMap(canonical) {
  return new Map(canonical.nodes.map((node) => [node.id, Number(node.inputXmlNodeIds?.[0])]));
}
