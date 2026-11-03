import { computeSemanticHash } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { computeOccurrencePlanHash } from '../../../tabs/stagedjson-to-enrichxml/psi-serialization-plan.js';
import { computeNormalizationPolicyHash } from '../../../tabs/stagedjson-to-enrichxml/topology-normalization/normalization-policy.js';

const V = () => ({ status: 'PASS', blockers: [], reviewItems: [], warnings: [] });

export async function makeShadowFixture() {
  const policy = await makePolicy();
  const sourceInventory = sourceFixture();
  const sourceInventoryHash = await computeSemanticHash(sourceInventory, 'sourceInventoryHash');
  const logicalGraph = graphFixture(sourceInventoryHash);
  const logicalTopologyHash = await computeSemanticHash(logicalGraph, 'logicalTopologyHash');
  const occurrencePlan = occurrenceFixture(sourceInventoryHash, logicalTopologyHash);
  occurrencePlan.occurrencePlanHash = await computeOccurrencePlanHash(occurrencePlan);
  const exactHistoryEvidence = historyFixture(logicalTopologyHash);
  exactHistoryEvidence.historyMatchResultHash = await computeSemanticHash(exactHistoryEvidence, 'historyMatchResultHash');
  return {
    sourceInventory, logicalGraph, occurrencePlan, exactHistoryEvidence, policy,
    evaluatedAt: '2026-07-20T10:30:00Z',
  };
}

export async function rehash(data) {
  const sourceInventoryHash = await computeSemanticHash(data.sourceInventory, 'sourceInventoryHash');
  data.logicalGraph.sourceInventoryHash = sourceInventoryHash;
  const logicalTopologyHash = await computeSemanticHash(data.logicalGraph, 'logicalTopologyHash');
  data.occurrencePlan.sourceInventoryHash = sourceInventoryHash;
  data.occurrencePlan.logicalTopologyHash = logicalTopologyHash;
  data.occurrencePlan.occurrencePlanHash = await computeOccurrencePlanHash(data.occurrencePlan);
  data.exactHistoryEvidence.logicalTopologyHash = logicalTopologyHash;
  data.exactHistoryEvidence.historyMatchResultHash = await computeSemanticHash(data.exactHistoryEvidence, 'historyMatchResultHash');
  data.policy.policyHash = await computeNormalizationPolicyHash(data.policy);
  return data;
}

export function addGapCandidate(data, spec) {
  data.sourceInventory.entities.push({
    sourceEntityId: spec.id, sourcePath: `$.gaps.${spec.id}`, sourceBranch: spec.branch || '/L/B1',
    canonicalMainLine: spec.line || '/L', normalizationCandidateKind: 'MICRO_GAP',
    normalizationRequested: spec.requested !== false, normalizationAuthorityId: `AUTH-${spec.id}`,
    sourcePortIds: [spec.fromPort, spec.toPort], gapMm: spec.gapMm,
  });
  data.occurrencePlan.occurrences.push(occ(spec.id, spec.id, spec.branch || '/L/B1', 'GAP'));
  data.occurrencePlan.componentProjection.push({ componentProjectionId: `CP-${spec.id}`, occurrenceIds: [spec.id] });
}

export function addNodePort(data, id, entityId, nodeId, x, branch = '/L/B1', line = '/L', role = 'FROM') {
  data.sourceInventory.ports.push(port(id, entityId, nodeId, x, branch, line, role));
  const node = data.logicalGraph.nodes.find((row) => row.logicalNodeId === nodeId);
  if (node) node.sourcePortIds.push(id);
}

async function makePolicy() {
  const policy = {
    schema: 'TopoNormalizationPolicy.v1', policyVersion: 'TE-009.1', configVersion: 'CFG-1',
    units: 'mm', coordinateToleranceMm: 0.001, clusterDiameterLimitMm: 5,
    survivorRule: 'EXACT_HISTORY_THEN_LEXICAL', historyConflictBehavior: 'BLOCK',
    prohibitedComponentCategories: ['PIPE', 'TEE', 'BRANCH', 'SUPPORT', 'ANCHOR'],
    exclusions: { branch: true, junction: true, boundary: true, support: true, restraint: true, anchor: true },
    componentRules: [{
      ruleId: 'RULE-CONSUME-SYNTHETIC', action: 'CONSUME_MICRO_COMPONENT', authority: 'ADR-010/POLICY-COMP-1',
      eligibleRawTypes: ['SYNTHETIC_MICRO'], eligibleNormalizedTypes: ['MICRO'], candidateKinds: ['MICRO_COMPONENT'],
      maxLengthMm: 5, requiredPortRoles: ['FROM', 'TO'], allowedDegreePatterns: [[2, 2]],
      sameSourceBranch: true, sameCanonicalMainLine: true,
    }],
    gapRules: [{
      ruleId: 'RULE-SNAP-GAP', action: 'SNAP_MICRO_GAP', authority: 'ADR-010/POLICY-GAP-1',
      eligibleRawTypes: [], eligibleNormalizedTypes: [], candidateKinds: ['MICRO_GAP'],
      maxGapMm: 5, requiredPortRoles: ['FROM', 'TO'], allowedDegreePatterns: [[1, 1], [1, 2], [2, 2]],
      sameSourceBranch: true, sameCanonicalMainLine: true,
    }],
  };
  policy.policyHash = await computeNormalizationPolicyHash(policy);
  return policy;
}

function sourceFixture() {
  const entities = [
    entity('E-LEFT', 'PIPE', ['P0', 'P1'], 100),
    entity('E-MIC', 'SYNTHETIC_MICRO', ['P2', 'P3'], 2, true),
    entity('E-RIGHT', 'PIPE', ['P4', 'P5'], 100),
    entity('E-GAP', 'GAP_MARKER', ['P6', 'P7'], null, true, 'MICRO_GAP', 1),
    entity('E-GAP-L', 'PIPE', ['P8', 'P6'], 100),
    entity('E-GAP-R', 'PIPE', ['P7', 'P9'], 100),
  ];
  const ports = [
    port('P0', 'E-LEFT', 'N0', -100, '/L/B1', '/L', 'FROM'), port('P1', 'E-LEFT', 'N1', 0, '/L/B1', '/L', 'TO'),
    port('P2', 'E-MIC', 'N1', 0, '/L/B1', '/L', 'FROM'), port('P3', 'E-MIC', 'N2', 2, '/L/B1', '/L', 'TO'),
    port('P4', 'E-RIGHT', 'N2', 2, '/L/B1', '/L', 'FROM'), port('P5', 'E-RIGHT', 'N3', 102, '/L/B1', '/L', 'TO'),
    port('P8', 'E-GAP-L', 'N4', 200, '/L/B1', '/L', 'FROM'), port('P6', 'E-GAP-L', 'N5', 300, '/L/B1', '/L', 'TO'),
    port('P7', 'E-GAP-R', 'N6', 301, '/L/B1', '/L', 'FROM'), port('P9', 'E-GAP-R', 'N7', 401, '/L/B1', '/L', 'TO'),
  ];
  return {
    schema: 'TopoSourceInventory.v1', projectId: 'P', zoneId: 'Z', coordinateFrameId: 'FRAME-MM',
    sourceIdentity: { sourceHash: 'sha256:raw' }, branches: [{ sourceBranch: '/L/B1', canonicalMainLine: '/L' }],
    entities, ports, validation: V(),
  };
}

function graphFixture(sourceInventoryHash) {
  const nodes = Array.from({ length: 8 }, (_, index) => ({
    logicalNodeId: `N${index}`, logicalRole: 'ROUTE', sourcePortIds: [], aliases: [`NODE-${index}`],
  }));
  for (const row of sourceFixture().ports) nodes.find((node) => node.logicalNodeId === row.logicalNodeId).sourcePortIds.push(row.sourcePortId);
  return {
    schema: 'TopoLogicalGraph.v1', projectId: 'P', zoneId: 'Z', coordinateFrameId: 'FRAME-MM', sourceInventoryHash,
    nodes, edges: [
      edge('LE-LEFT', 'N0', 'N1', 'E-LEFT'), edge('LE-MIC', 'N1', 'N2', 'E-MIC'), edge('LE-RIGHT', 'N2', 'N3', 'E-RIGHT'),
      edge('LE-GAP-L', 'N4', 'N5', 'E-GAP-L'), edge('LE-GAP-R', 'N6', 'N7', 'E-GAP-R'),
    ], junctions: [], boundaries: [], supports: [], validation: V(),
  };
}

function occurrenceFixture(sourceInventoryHash, logicalTopologyHash) {
  const occurrences = ['E-LEFT', 'E-MIC', 'E-RIGHT', 'E-GAP', 'E-GAP-L', 'E-GAP-R'].map((id) => occ(`O-${id}`, id, '/L/B1', id === 'E-GAP' ? 'GAP' : 'PIPE'));
  return {
    schema: 'PsiWriterOccurrencePlan.v1', projectId: 'P', zoneId: 'Z', sourceInventoryHash, logicalTopologyHash,
    sequencePlanHash: 'sha256:sequence', occurrences,
    componentProjection: occurrences.map((row) => ({ componentProjectionId: row.componentProjectionId, occurrenceIds: [row.occurrenceId] })),
    validation: V(),
  };
}

function historyFixture(logicalTopologyHash) {
  return {
    schema: 'TopoNodeHistoryMatchResult.v1', projectId: 'P', zoneId: 'Z', mainLineKey: '/L', coordinateFrameId: 'FRAME-MM',
    logicalTopologyHash, baseRegistrySnapshotHash: 'sha256:registry', matches: [{ logicalNodeId: 'N1', historyNodeId: 'H1' }],
    newNodes: [], ambiguous: [], conflicts: [], reactivated: [], retirementCandidates: [], validation: V(),
  };
}

function entity(id, type, sourcePortIds, lengthMm, requested = false, kind = null, gapMm = null) {
  return { sourceEntityId: id, sourcePath: `$.entities.${id}`, sourceBranch: '/L/B1', canonicalMainLine: '/L', rawComponentType: type, normalizedComponentType: type === 'SYNTHETIC_MICRO' ? 'MICRO' : type, sourcePortIds, ...(lengthMm !== null ? { lengthMm } : {}), ...(gapMm !== null ? { gapMm } : {}), ...(requested ? { normalizationRequested: true, normalizationAuthorityId: `AUTH-${id}` } : {}), ...(kind ? { normalizationCandidateKind: kind } : {}) };
}
function port(id, sourceEntityId, logicalNodeId, x, sourceBranch, canonicalMainLine, role) { return { sourcePortId: id, sourceEntityId, logicalNodeId, sourcePath: `$.ports.${id}`, sourceBranch, canonicalMainLine, role, position: { x, y: 0, z: 0 } }; }
function edge(id, from, to, sourceEntityId) { return { logicalEdgeId: id, fromLogicalNodeId: from, toLogicalNodeId: to, sourceEntityIds: [sourceEntityId], sourceBranch: '/L/B1', canonicalMainLine: '/L' }; }
function occ(occurrenceId, sourceEntityId, sourceBranch, type) { return { occurrenceId, sourceEntityId, sourceBranch, canonicalMainLine: '/L', componentProjectionId: `CP-${sourceEntityId}`, projectionRole: 'PRIMARY', endpoint: 1, psiComponentType: type, coordinateRole: 'BEST', disposition: 'EMITTED' }; }
