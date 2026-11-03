import { computeSemanticHash } from '../../../../contracts/topo-enriched-xml/contract-core.js';
import { buildPsiWriterOccurrencePlan } from '../../../../tabs/stagedjson-to-enrichxml/psi-writer-occurrence-planner.js';
import { computeTopologyNormalizationHash } from '../../../../tabs/stagedjson-to-enrichxml/topology-normalization/topology-normalizer-shadow.js';
import { buildAllocationResult } from '../../../../node-history/allocation/allocation-result.js';
import { buildApprovedRegistryBootstrap } from '../../../../node-history/bootstrap/bootstrap-result.js';
import { makeApprovedBootstrapInput } from '../../../fixtures/node-history/bootstrap/bootstrap-fixture.mjs';
import {
  computeApprovedActionHash, computeNormalizationApprovalHash,
} from '../../../../tabs/stagedjson-to-enrichxml/production/topology-normalization-approval.js';

const PASS = () => ({ status: 'PASS', blockers: [], reviewItems: [], warnings: [] });

export async function makeProductionFixture(overrides = {}) {
  const sourceInventory = buildSourceInventory();
  const sourceInventoryHash = await computeSemanticHash(sourceInventory, 'sourceInventoryHash');
  const logicalGraph = buildLogicalGraph(sourceInventoryHash);
  const logicalTopologyHash = await computeSemanticHash(logicalGraph, 'logicalTopologyHash');
  const sequencePlan = buildSequencePlan(sourceInventoryHash, logicalTopologyHash);
  sequencePlan.sequencePlanHash = await computeSemanticHash(sequencePlan, 'sequencePlanHash');
  const records = buildRecords();
  const occurrencePlan = await buildPsiWriterOccurrencePlan({
    projectId: sourceInventory.projectId,
    zoneId: sourceInventory.zoneId,
    sourceInventoryHash,
    logicalTopologyHash,
    sequencePlanHash: sequencePlan.sequencePlanHash,
    sequencePlan,
    records,
    logicalNodeBySourceEntityId: logicalNodeMapping(),
    evaluatedAt: '2026-07-21T01:00:00Z',
  });
  const bootstrap = await buildBootstrap(sourceInventory, logicalTopologyHash);
  const normalization = await buildNormalization({
    sourceInventory, logicalGraph, occurrencePlan, historyMatchResult: bootstrap.historyMatchResult,
  });
  const config = {
    projectName: 'TE013 PROJECT',
    mdbName: '/TE013',
    pipeName: '/TE013-PIPE',
  };
  const configHash = await computeSemanticHash({ config }, 'configHash');
  return {
    records,
    sourceInventory,
    logicalGraph,
    topologyNormalizationResult: normalization.result,
    topologyNormalizationApproval: normalization.approval,
    sequencePlan,
    occurrencePlan,
    historyMatchResult: bootstrap.historyMatchResult,
    allocationResult: bootstrap.allocationResult,
    bootstrapResult: bootstrap.bootstrapResult,
    currentRegistryEvidence: bootstrap.currentRegistryEvidence,
    config,
    configHash,
    operatingMode: 'ENFORCED',
    requestedWriter: 'CANONICAL',
    evaluatedAt: '2026-07-21T01:15:00Z',
    legacyOutput: null,
    ...structuredClone(overrides),
  };
}

async function buildBootstrap(sourceInventory, logicalTopologyHash) {
  const input = await makeApprovedBootstrapInput();
  const historyMatchResult = structuredClone(input.historyMatchResult);
  historyMatchResult.logicalTopologyHash = logicalTopologyHash;
  historyMatchResult.historyMatchResultHash = await computeSemanticHash(
    historyMatchResult, 'historyMatchResultHash',
  );
  const allocationResult = await buildAllocationResult({
    projectId: input.allocationResult.projectId,
    zoneId: input.allocationResult.zoneId,
    baseRegistrySnapshotHash: input.allocationResult.baseRegistrySnapshotHash,
    historyMatchResultHash: historyMatchResult.historyMatchResultHash,
    leases: input.allocationResult.leases,
    allocations: input.allocationResult.allocations,
    retirements: input.allocationResult.retirements,
    reactivations: input.allocationResult.reactivations,
    evaluatedAt: input.allocationResult.evaluatedAt,
    policy: input.allocationResult.policyEvidence,
  });
  input.sourceInventory = sourceInventory;
  input.historyMatchResult = historyMatchResult;
  input.allocationResult = allocationResult;
  input.approval.approvedHistoryMatchResultHash = historyMatchResult.historyMatchResultHash;
  input.approval.approvedAllocationResultHash = allocationResult.allocationResultHash;
  const bootstrapResult = await buildApprovedRegistryBootstrap(input);
  if (bootstrapResult.validation.status !== 'PASS') throw new Error(JSON.stringify(bootstrapResult.validation));
  return {
    historyMatchResult,
    allocationResult,
    bootstrapResult,
    currentRegistryEvidence: {
      schema: 'TopoCurrentRegistryEvidence.v1',
      projectId: bootstrapResult.projectId,
      zoneId: bootstrapResult.zoneId,
      bootstrapResultHash: bootstrapResult.bootstrapResultHash,
      zoneRegistry: bootstrapResult.proposedZoneRegistry,
      lineHistories: bootstrapResult.proposedLineHistories,
      manifest: bootstrapResult.proposedManifest,
      registrySnapshotHash: bootstrapResult.proposedManifest.registrySnapshotHash,
      validation: PASS(),
    },
  };
}

async function buildNormalization({ sourceInventory, logicalGraph, occurrencePlan, historyMatchResult }) {
  const inputLogicalTopologyHash = await computeSemanticHash(logicalGraph, 'logicalTopologyHash');
  const proposedLogicalGraph = structuredClone(logicalGraph);
  const outputLogicalTopologyHash = await computeSemanticHash(proposedLogicalGraph, 'logicalTopologyHash');
  const normalization = await buildNormalizationArtifact({
    sourceInventory, occurrencePlan, historyMatchResult,
    inputLogicalTopologyHash, outputLogicalTopologyHash,
  });
  const result = {
    schema: 'TopoTopologyNormalizationShadowResult.v1',
    operatingMode: 'SHADOW', authoritative: false, selectable: false,
    proposedLogicalGraph, normalization,
    comparison: {
      inputNodeCount: logicalGraph.nodes.length,
      outputNodeCount: proposedLogicalGraph.nodes.length,
      inputEdgeCount: logicalGraph.edges.length,
      outputEdgeCount: proposedLogicalGraph.edges.length,
      consumedCount: 0, snappedCount: 0, blockedCount: 0, preservedCount: 0,
    },
    validation: PASS(),
  };
  const approval = await buildNormalizationApproval(sourceInventory, normalization,
    inputLogicalTopologyHash, outputLogicalTopologyHash);
  return { result, approval };
}

async function buildNormalizationArtifact(context) {
  const normalization = {
    schema: 'TopoNodeTopologyNormalization.v1',
    projectId: context.sourceInventory.projectId,
    zoneId: context.sourceInventory.zoneId,
    sourceInventoryHash: await computeSemanticHash(context.sourceInventory, 'sourceInventoryHash'),
    inputLogicalTopologyHash: context.inputLogicalTopologyHash,
    outputLogicalTopologyHash: context.outputLogicalTopologyHash,
    occurrencePlanHash: context.occurrencePlan.occurrencePlanHash,
    exactHistoryEvidenceHash: context.historyMatchResult.historyMatchResultHash,
    policyHash: hash('normalization-policy'),
    rawPortMappings: context.sourceInventory.ports.map((row) => ({
      sourcePortId: row.sourcePortId, logicalNodeId: row.logicalNodeId,
    })).sort((a, b) => a.sourcePortId.localeCompare(b.sourcePortId)),
    actions: [], evaluatedAt: '2026-07-21T00:50:00Z', validation: PASS(),
  };
  normalization.normalizationHash = await computeTopologyNormalizationHash(normalization);
  return normalization;
}

async function buildNormalizationApproval(sourceInventory, normalization, inputHash, outputHash) {
  const approval = {
    schema: 'TopoTopologyNormalizationApproval.v1',
    approvalRecordId: 'APPROVAL-TE013-NORMALIZATION-001',
    authority: 'TOPOLOGY_APPROVAL_BOARD', decision: 'APPROVED',
    projectId: sourceInventory.projectId, zoneId: sourceInventory.zoneId,
    inputLogicalTopologyHash: inputHash, outputLogicalTopologyHash: outputHash,
    topologyNormalizationHash: normalization.normalizationHash,
    policyHash: normalization.policyHash,
    approvedActionHash: await computeApprovedActionHash([]),
  };
  approval.normalizationApprovalHash = await computeNormalizationApprovalHash(approval);
  return approval;
}

function buildSourceInventory() {
  const specs = [
    ['SE-ELBO', 'SP-A-100', 'LN-A-100', '/LINE-A/B1', '/LINE-A'],
    ['SE-VALV', 'SP-A-NEW', 'LN-A-NEW', '/LINE-A/B1', '/LINE-A'],
    ['SE-A-110', 'SP-A-110', 'LN-A-110', '/LINE-A/B1', '/LINE-A'],
    ['SE-FLAN', 'SP-B-500', 'LN-B-500', '/LINE-B/B1', '/LINE-B'],
    ['SE-B-NEW', 'SP-B-NEW', 'LN-B-NEW', '/LINE-B/B1', '/LINE-B'],
  ];
  return {
    schema: 'TopoSourceInventory.v1',
    projectId: 'PROJECT-TE012',
    zoneId: 'ZONE-01',
    coordinateFrameId: 'FRAME-TE012',
    sourceIdentity: { sourceHash: hash('source-root') },
    branches: [
      { sourceBranch: '/LINE-A/B1', canonicalMainLine: '/LINE-A' },
      { sourceBranch: '/LINE-B/B1', canonicalMainLine: '/LINE-B' },
    ],
    entities: specs.map(([sourceEntityId, , , sourceBranch, canonicalMainLine]) => ({
      sourceEntityId,
      sourcePath: `$.entities.${sourceEntityId}`,
      sourceBranch,
      canonicalMainLine,
    })),
    ports: specs.map(([sourceEntityId, sourcePortId, logicalNodeId, sourceBranch, canonicalMainLine], index) => ({
      sourcePortId,
      sourceEntityId,
      logicalNodeId,
      sourcePath: `$.ports.${sourcePortId}`,
      sourceBranch,
      canonicalMainLine,
      role: 'PRIMARY',
      position: { x: index * 100, y: 0, z: 0 },
    })),
    validation: PASS(),
  };
}

function buildLogicalGraph(sourceInventoryHash) {
  const nodes = [
    ['LN-A-100', 'SP-A-100'], ['LN-A-NEW', 'SP-A-NEW'], ['LN-A-110', 'SP-A-110'],
    ['LN-B-500', 'SP-B-500'], ['LN-B-NEW', 'SP-B-NEW'],
  ].map(([logicalNodeId, sourcePortId]) => ({ logicalNodeId, sourcePortIds: [sourcePortId], aliases: [] }));
  return {
    schema: 'TopoLogicalGraph.v1', projectId: 'PROJECT-TE012', zoneId: 'ZONE-01',
    coordinateFrameId: 'FRAME-TE012', sourceInventoryHash, nodes,
    edges: [
      edge('LE-A-1', 'LN-A-100', 'LN-A-NEW', 'SE-ELBO', '/LINE-A/B1', '/LINE-A'),
      edge('LE-A-2', 'LN-A-NEW', 'LN-A-110', 'SE-VALV', '/LINE-A/B1', '/LINE-A'),
      edge('LE-B-1', 'LN-B-500', 'LN-B-NEW', 'SE-FLAN', '/LINE-B/B1', '/LINE-B'),
    ],
    junctions: [], boundaries: [], supports: [], validation: PASS(),
  };
}

function buildSequencePlan(sourceInventoryHash, logicalTopologyHash) {
  return {
    schema: 'TopoSequencePlan.v1', projectId: 'PROJECT-TE012', zoneId: 'ZONE-01',
    sourceInventoryHash, logicalTopologyHash,
    branches: [
      { sourceBranch: '/LINE-A/B1', canonicalMainLine: '/LINE-A' },
      { sourceBranch: '/LINE-B/B1', canonicalMainLine: '/LINE-B' },
    ],
    components: [
      { sourceEntityId: 'SE-ELBO', sourceBranch: '/LINE-A/B1' },
      { sourceEntityId: 'SE-VALV', sourceBranch: '/LINE-A/B1' },
      { sourceEntityId: 'SE-FLAN', sourceBranch: '/LINE-B/B1' },
    ],
    validation: PASS(),
  };
}

function buildRecords() {
  return [
    record('SE-ELBO', 'ELBO', 'ELBOW-1', { APOS: point(0), RADI: 152.4 }),
    record('SE-VALV', 'VALV', 'VALVE-1', { POS: point(100) }),
    record('SE-FLAN', 'FLAN', 'FLANGE-1', { POS: point(300) }),
  ];
}

function logicalNodeMapping() {
  return {
    'SE-ELBO': { ARRIVE: 'LN-A-100', RESERVED_AFTER: 'LN-A-100' },
    'SE-VALV': { PRIMARY: 'LN-A-NEW' },
    'SE-FLAN': { PRIMARY: 'LN-B-500' },
  };
}

function record(sourceEntityId, componentType, name, attrs) {
  return {
    sourceEntityId, sourceRecordId: `REC-${sourceEntityId}`, componentType, name,
    ref: `REF-${sourceEntityId}`, attrs, boreMm: 100,
    resolved: { odMm: 114.3, wallMm: 6.02, corrMm: 1.5, weightKg: 12 },
  };
}

function edge(logicalEdgeId, fromLogicalNodeId, toLogicalNodeId, sourceEntityId, sourceBranch, canonicalMainLine) {
  return { logicalEdgeId, fromLogicalNodeId, toLogicalNodeId, sourceEntityIds: [sourceEntityId], sourceBranch, canonicalMainLine };
}

function point(x) { return { x, y: 0, z: 0 }; }
function hash(label) { return `sha256:${label.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'a')}`; }
