import { computeSemanticHash } from '../../../../contracts/topo-enriched-xml/contract-core.js';
import { TOPONODEHISTORYMATCHRESULT_V1 } from '../../../../contracts/topo-enriched-xml/contracts.js';
import {
  buildRegistrySnapshotManifest,
  computeLineHistoryHash,
  computeZoneRegistryHash,
} from '../../../../node-history/registry/registry-hash.js';
import { buildAllocationResult } from '../../../../node-history/allocation/allocation-result.js';
import { validateApprovedIdentityAssignments } from '../../../../node-history/bootstrap/bootstrap-identity-assignments.js';

const PASS = () => ({ status: 'PASS', blockers: [], reviewItems: [], warnings: [] });

export async function makeApprovedBootstrapInput() {
  const seedLineHistories = await buildSeedHistories();
  const seedZoneRegistry = await buildSeedRegistry(seedLineHistories);
  const seedManifest = await buildRegistrySnapshotManifest({
    zoneRegistry: seedZoneRegistry,
    lineHistories: seedLineHistories,
    pathsByMainLine: Object.fromEntries(seedZoneRegistry.lineHistoryRefs.map((row) => [row.mainLineKey, row.path])),
  });
  const historyMatchResult = await buildMatchResult(seedManifest.registrySnapshotHash);
  const allocationResult = await buildAllocations(seedManifest.registrySnapshotHash, historyMatchResult.historyMatchResultHash);
  const approvedIdentityAssignments = identityAssignments();
  const assignmentResult = await validateApprovedIdentityAssignments({
    assignments: approvedIdentityAssignments,
    acceptedMatches: acceptedMatchMap(historyMatchResult),
    seedLineHistories,
    approval: { approvalRecordId: 'APPROVAL-TE012-001' },
  });
  const revision = revisionEvidence();
  const approval = {
    approvalRecordId: 'APPROVAL-TE012-001',
    authority: 'NODE_HISTORY_APPROVAL_BOARD',
    approvedRevision: revision.revisionId,
    approvedProjectId: 'PROJECT-TE012',
    approvedZoneId: 'ZONE-01',
    approvedBaseRegistrySnapshotHash: seedManifest.registrySnapshotHash,
    approvedHistoryMatchResultHash: historyMatchResult.historyMatchResultHash,
    approvedAllocationResultHash: allocationResult.allocationResultHash,
    approvedIdentityAssignmentHash: assignmentResult.assignmentHash,
    baseRegistryCommit: '89f1105cd3c38cb257fe541924482d0e4add2d50',
    currentRegistrySnapshotHash: seedManifest.registrySnapshotHash,
    decision: 'APPROVED',
  };
  return {
    seedZoneRegistry, seedLineHistories, seedManifest,
    sourceInventory: sourceInventory(), currentLogicalNodes: currentLogicalNodes(),
    historyMatchResult, allocationResult, approvedIdentityAssignments,
    revision, coverage: { scope: 'FULL_ZONE', authoritativeForRetirement: true },
    approval, evaluatedAt: '2026-07-20T12:00:00Z',
  };
}

async function buildSeedHistories() {
  const histories = [
    lineHistory('/LINE-A', [
      historyNode('HN-A-100', 100, 'ACTIVE', 'SRC-A-100', 'REV-001'),
      historyNode('HN-A-110', 110, 'RETIRED', 'SRC-A-110', 'REV-001', {
        retirementEvidence: lifecycleEvidence('REV-002', 'Removed in approved revision'),
        lastObservedRevision: 'REV-001',
      }),
      historyNode('HN-A-120', 120, 'ACTIVE', 'SRC-A-120', 'REV-001'),
    ]),
    lineHistory('/LINE-B', [historyNode('HN-B-500', 500, 'ACTIVE', 'SRC-B-500', 'REV-001')]),
  ];
  for (const row of histories) row.lineHistoryHash = await computeLineHistoryHash(row);
  return histories;
}

async function buildSeedRegistry(histories) {
  const byLine = new Map(histories.map((row) => [row.mainLineKey, row]));
  const registry = {
    schema: 'PsiNodeZoneRegistry.v1', registryVersion: '1.0.0',
    projectId: 'PROJECT-TE012', zoneId: 'ZONE-01', policyVersion: 'POLICY-1', configVersion: 'CONFIG-1',
    namespace: { minimum: 0, maximum: 9990, defaultStep: 10 },
    leases: [
      lease('LEASE-LINE-A', '/LINE-A', [{ start: 100, end: 190, step: 10 }]),
      lease('LEASE-LINE-B', '/LINE-B', [{ start: 500, end: 590, step: 10 }]),
    ],
    lineHistoryRefs: ['/LINE-A', '/LINE-B'].map((mainLineKey) => ({
      mainLineKey,
      path: `node-history/bootstrap/approved/PROJECT-TE012/ZONE-01/lines/${mainLineKey.slice(1)}.json`,
      lineHistoryHash: byLine.get(mainLineKey).lineHistoryHash,
    })),
    coordinateRegistrationRefs: ['COORD-REG-TE012'], validation: PASS(),
    zoneRegistryHash: zeroHash(), audit: { evaluatedAt: '2026-07-20T11:00:00Z' },
  };
  registry.zoneRegistryHash = await computeZoneRegistryHash(registry);
  return registry;
}

async function buildMatchResult(baseRegistrySnapshotHash) {
  const result = {
    schema: 'TopoNodeHistoryMatchResult.v1', projectId: 'PROJECT-TE012', zoneId: 'ZONE-01',
    mainLineKey: '/LINE-A', coordinateFrameId: 'FRAME-TE012', logicalTopologyHash: hash('logical'),
    baseRegistrySnapshotHash,
    matches: [
      matchRow('LN-A-100', 'HN-A-100', 'EXACT_MATCHED'),
      matchRow('LN-B-500', 'HN-B-500', 'REGISTERED_GLOBAL_MATCHED'),
    ],
    newNodes: [newRow('LN-A-NEW'), newRow('LN-B-NEW')],
    ambiguous: [], conflicts: [],
    reactivated: [matchRow('LN-A-110', 'HN-A-110', 'REACTIVATION_CANDIDATE')],
    retirementCandidates: [{
      historyNodeId: 'HN-A-120', mainLineKey: '/LINE-A',
      disposition: 'RETIREMENT_CANDIDATE_ONLY', reason: 'NOT_OBSERVED_IN_COMPLETE_AUTHORITATIVE_COVERAGE',
    }],
    registeredAssignment: [], registeredPolicyHash: hash('policy'),
    evaluatedAt: '2026-07-20T11:30:00Z', validation: PASS(),
  };
  result.historyMatchResultHash = await computeSemanticHash(result, 'historyMatchResultHash');
  return TOPONODEHISTORYMATCHRESULT_V1.freeze(result);
}

async function buildAllocations(baseRegistrySnapshotHash, historyMatchResultHash) {
  return buildAllocationResult({
    projectId: 'PROJECT-TE012', zoneId: 'ZONE-01', baseRegistrySnapshotHash, historyMatchResultHash,
    leases: [
      { leaseId: 'LEASE-LINE-A', mainLineKey: '/LINE-A', start: 100, end: 190, step: 10 },
      { leaseId: 'LEASE-LINE-B', mainLineKey: '/LINE-B', start: 500, end: 590, step: 10 },
    ],
    allocations: [
      allocation('LN-A-100', '/LINE-A', 100, 'HISTORICAL_PRESERVE', 'HN-A-100'),
      allocation('LN-A-110', '/LINE-A', 110, 'REACTIVATION', 'HN-A-110'),
      allocation('LN-A-NEW', '/LINE-A', 130, 'NEW'),
      allocation('LN-B-500', '/LINE-B', 500, 'HISTORICAL_PRESERVE', 'HN-B-500'),
      allocation('LN-B-NEW', '/LINE-B', 510, 'NEW'),
    ],
    retirements: [{
      historyNodeId: 'HN-A-120', mainLineKey: '/LINE-A', engineeringNodeNumber: 120,
      disposition: 'RETIREMENT_INTENT_ONLY', reason: 'NOT_OBSERVED_IN_COMPLETE_AUTHORITATIVE_COVERAGE',
    }],
    reactivations: [{
      logicalNodeId: 'LN-A-110', historyNodeId: 'HN-A-110', mainLineKey: '/LINE-A', engineeringNodeNumber: 110,
      disposition: 'REACTIVATE_SAME_HISTORY_OWNER',
    }],
    evaluatedAt: '2026-07-20T11:45:00Z', policy: { strategy: 'LOWEST_AVAILABLE' },
  });
}

function sourceInventory() {
  const ids = ['LN-A-100', 'LN-A-110', 'LN-A-NEW', 'LN-B-500', 'LN-B-NEW'];
  return {
    schema: 'TopoSourceInventory.v1', projectId: 'PROJECT-TE012', zoneId: 'ZONE-01', coordinateFrameId: 'FRAME-TE012',
    sourceIdentity: { sourceHash: hash('source') },
    branches: [{ sourceBranch: '/LINE-A/B1' }, { sourceBranch: '/LINE-B/B1' }],
    entities: ids.map((id) => ({ sourceEntityId: `SE-${id}` })),
    ports: ids.map((id) => ({ sourcePortId: `SP-${id}`, sourceEntityId: `SE-${id}` })),
    validation: PASS(),
  };
}

function currentLogicalNodes() {
  return [
    current('LN-A-100', '/LINE-A'), current('LN-A-110', '/LINE-A'), current('LN-A-NEW', '/LINE-A'),
    current('LN-B-500', '/LINE-B'), current('LN-B-NEW', '/LINE-B'),
  ];
}

function identityAssignments() {
  return [
    assignment('LN-A-NEW', 'HN-A-130', '/LINE-A', 'SRC-A-NEW'),
    assignment('LN-B-NEW', 'HN-B-510', '/LINE-B', 'SRC-B-NEW'),
  ];
}

function revisionEvidence() {
  return {
    revisionId: 'REV-003', authority: 'APPROVED_REVISION_CONTROL',
    reactivations: [{ historyNodeId: 'HN-A-110', ...lifecycleEvidence('REV-003', 'Same durable identity returned') }],
    retirements: [{ historyNodeId: 'HN-A-120', ...lifecycleEvidence('REV-003', 'Absent from authoritative full-zone revision') }],
  };
}

function lineHistory(mainLineKey, historyNodes) {
  return {
    schema: 'PsiNodeLineHistory.v1', registryVersion: '1.0.0', projectId: 'PROJECT-TE012', zoneId: 'ZONE-01',
    mainLineKey, coordinateRegistrationRef: 'COORD-REG-TE012', historyNodes,
    validation: PASS(), lineHistoryHash: zeroHash(), audit: { evaluatedAt: '2026-07-20T11:00:00Z' },
  };
}
function historyNode(historyNodeId, engineeringNodeNumber, lifecycleStatus, alias, firstObservedRevision, overrides = {}) {
  return {
    historyNodeId, engineeringNodeNumber, lifecycleStatus, sourceAliases: [alias],
    identityEvidence: [{ kind: 'SOURCE_REF', value: alias, authority: 'APPROVED_SOURCE' }],
    immutableFacts: { historyNodeId, engineeringNodeNumber, mainLineKey: historyNodeId.includes('-A-') ? '/LINE-A' : '/LINE-B', firstObservedRevision },
    firstObservedRevision, lastObservedRevision: 'REV-002', retirementEvidence: null,
    reactivationEvidence: null, supersessionEvidence: null, supersededByHistoryNodeId: null,
    ...overrides,
  };
}
function lease(leaseId, mainLineKey, ranges) {
  return {
    leaseId, mainLineKey, status: 'ACTIVE', ranges,
    firstObservedRevision: 'REV-001', lastObservedRevision: 'REV-002',
    evidence: { authority: 'APPROVED_REGISTRY', revisionId: 'REV-002' },
  };
}
function matchRow(logicalNodeId, historyNodeId, outcome) { return { logicalNodeId, historyNodeId, outcome, candidates: [], rejectedCandidates: [] }; }
function newRow(logicalNodeId) { return { logicalNodeId, outcome: 'NO_REGISTERED_MATCH', candidates: [], rejectedCandidates: [] }; }
function current(logicalNodeId, mainLineKey) { return { logicalNodeId, mainLineKey, projectId: 'PROJECT-TE012', zoneId: 'ZONE-01' }; }
function allocation(logicalNodeId, mainLineKey, engineeringNodeNumber, allocationKind, historyNodeId = '') {
  return {
    logicalNodeId, ...(historyNodeId ? { historyNodeId } : {}), engineeringNodeNumber, mainLineKey,
    leaseId: mainLineKey === '/LINE-A' ? 'LEASE-LINE-A' : 'LEASE-LINE-B',
    leaseRange: mainLineKey === '/LINE-A' ? { start: 100, end: 190, step: 10 } : { start: 500, end: 590, step: 10 },
    allocationKind,
  };
}
function assignment(logicalNodeId, historyNodeId, mainLineKey, alias) {
  return {
    logicalNodeId, historyNodeId, mainLineKey, identityAuthority: 'BOOTSTRAP_IDENTITY_BOARD',
    sourceAliases: [alias], approvalRecordId: 'APPROVAL-TE012-001',
    identityEvidence: [{
      kind: 'DURABLE_SOURCE_ALIAS', value: alias, authority: 'BOOTSTRAP_IDENTITY_BOARD',
      approvalRecordId: 'APPROVAL-TE012-001',
    }],
  };
}
function lifecycleEvidence(revisionId, reason) { return { authority: 'NODE_HISTORY_APPROVAL_BOARD', revisionId, reason }; }
function acceptedMatchMap(result) {
  return new Map([
    ...result.matches.map((row) => [row.logicalNodeId, { kind: 'MATCH', historyNodeId: row.historyNodeId }]),
    ...result.newNodes.map((row) => [row.logicalNodeId, { kind: 'NEW', historyNodeId: '' }]),
    ...result.reactivated.map((row) => [row.logicalNodeId, { kind: 'REACTIVATE', historyNodeId: row.historyNodeId }]),
  ]);
}
function hash(label) { return `sha256:${label.padEnd(64, '0').slice(0, 64).replace(/[^a-f0-9]/g, 'a')}`; }
function zeroHash() { return `sha256:${'0'.repeat(64)}`; }

export async function makeAllNewBootstrapInput() {
  const seedLineHistories = [lineHistory('/LINE-A', []), lineHistory('/LINE-B', [])];
  for (const row of seedLineHistories) row.lineHistoryHash = await computeLineHistoryHash(row);
  const seedZoneRegistry = await buildSeedRegistry(seedLineHistories);
  const seedManifest = await buildRegistrySnapshotManifest({
    zoneRegistry: seedZoneRegistry, lineHistories: seedLineHistories,
    pathsByMainLine: Object.fromEntries(seedZoneRegistry.lineHistoryRefs.map((row) => [row.mainLineKey, row.path])),
  });
  const historyMatchResult = {
    schema: 'TopoNodeHistoryMatchResult.v1', projectId: 'PROJECT-TE012', zoneId: 'ZONE-01',
    mainLineKey: '/LINE-A', coordinateFrameId: 'FRAME-TE012', logicalTopologyHash: hash('logical'),
    baseRegistrySnapshotHash: seedManifest.registrySnapshotHash,
    matches: [], newNodes: [newRow('LN-A-NEW'), newRow('LN-B-NEW')], ambiguous: [], conflicts: [],
    reactivated: [], retirementCandidates: [], evaluatedAt: '2026-07-20T11:30:00Z', validation: PASS(),
  };
  historyMatchResult.historyMatchResultHash = await computeSemanticHash(historyMatchResult, 'historyMatchResultHash');
  const frozenMatch = TOPONODEHISTORYMATCHRESULT_V1.freeze(historyMatchResult);
  const allocationResult = await buildAllocationResult({
    projectId: 'PROJECT-TE012', zoneId: 'ZONE-01', baseRegistrySnapshotHash: seedManifest.registrySnapshotHash,
    historyMatchResultHash: frozenMatch.historyMatchResultHash,
    leases: [
      { leaseId: 'LEASE-LINE-A', mainLineKey: '/LINE-A', start: 100, end: 190, step: 10 },
      { leaseId: 'LEASE-LINE-B', mainLineKey: '/LINE-B', start: 500, end: 590, step: 10 },
    ],
    allocations: [allocation('LN-A-NEW', '/LINE-A', 100, 'NEW'), allocation('LN-B-NEW', '/LINE-B', 500, 'NEW')],
    evaluatedAt: '2026-07-20T11:45:00Z', policy: { strategy: 'LOWEST_AVAILABLE' },
  });
  const approvedIdentityAssignments = identityAssignments();
  const assignmentResult = await validateApprovedIdentityAssignments({
    assignments: approvedIdentityAssignments, acceptedMatches: acceptedMatchMap(frozenMatch), seedLineHistories,
    approval: { approvalRecordId: 'APPROVAL-TE012-001' },
  });
  const revision = { revisionId: 'REV-001', authority: 'APPROVED_REVISION_CONTROL', reactivations: [], retirements: [] };
  return {
    seedZoneRegistry, seedLineHistories, seedManifest, sourceInventory: sourceInventory(),
    currentLogicalNodes: [current('LN-A-NEW', '/LINE-A'), current('LN-B-NEW', '/LINE-B')],
    historyMatchResult: frozenMatch, allocationResult, approvedIdentityAssignments, revision,
    coverage: { scope: 'FULL_ZONE', authoritativeForRetirement: true },
    approval: {
      approvalRecordId: 'APPROVAL-TE012-001', authority: 'NODE_HISTORY_APPROVAL_BOARD', approvedRevision: 'REV-001',
      approvedProjectId: 'PROJECT-TE012', approvedZoneId: 'ZONE-01',
      approvedBaseRegistrySnapshotHash: seedManifest.registrySnapshotHash,
      approvedHistoryMatchResultHash: frozenMatch.historyMatchResultHash,
      approvedAllocationResultHash: allocationResult.allocationResultHash,
      approvedIdentityAssignmentHash: assignmentResult.assignmentHash,
      baseRegistryCommit: '89f1105cd3c38cb257fe541924482d0e4add2d50',
      currentRegistrySnapshotHash: seedManifest.registrySnapshotHash, decision: 'APPROVED',
    },
    evaluatedAt: '2026-07-20T12:00:00Z',
  };
}
