/**
 * TE-016A — build and commit the approved ASIM-1885 registry baseline.
 *
 * Runs the full accepted chain against real 1885_NC source data:
 *   raw byte identity -> component-topology envelope -> per-line demand
 *   -> deterministic zone leases -> empty-history seed registry
 *   -> real exact-history matcher (per line, against the empty registry)
 *   -> real deterministic zone allocator -> real bootstrap builder
 *   -> committed approved registry artifacts under
 *      node-history/bootstrap/approved/ASIM-1885/ZONE-1885-NC/
 *
 * No matching/allocation/bootstrap logic is reimplemented here — this
 * script only supplies real derived inputs to the existing accepted
 * functions and writes their output.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeSemanticHash, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { TOPONODEHISTORYMATCHRESULT_V1 } from '../../contracts/topo-enriched-xml/contracts.js';
import {
  buildRegistrySnapshotManifest,
  computeLineHistoryHash,
  computeZoneRegistryHash,
} from '../../node-history/registry/registry-hash.js';
import { validateApprovedIdentityAssignments } from '../../node-history/bootstrap/bootstrap-identity-assignments.js';
import { matchExactHistoricalNodes } from '../../node-history/matching/exact-history-matcher.js';
import { allocateZoneEngineeringNodes } from '../../node-history/allocation/deterministic-zone-allocator.js';
import { buildAllocationResult } from '../../node-history/allocation/allocation-result.js';
import { buildApprovedRegistryBootstrap, serializeBootstrapArtifact } from '../../node-history/bootstrap/bootstrap-result.js';
import { buildAsim1885SourceLineInventory } from '../../node-history/bootstrap/asim-1885/source-line-inventory.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PROJECT_ID = 'ASIM-1885';
const ZONE_ID = 'ZONE-1885-NC';
const COORDINATE_FRAME_ID = 'FRAME-ASIM-1885-ENU-MM-V1';
const EXPECTED_GIT_BLOB_SHA1 = '9ac18595acdf8938f01579b5c211f0deebc5dc0a';
const EVALUATED_AT = '2026-07-22T00:00:00Z';
const REVISION_ID = 'REV-ASIM-1885-NC-001';
const APPROVAL_RECORD_ID = 'APPROVAL-ASIM-1885-TE016A-001';
const BOOTSTRAP_RUN_ID = 'RUN-TE016A-ASIM-1885-BOOTSTRAP-001';

/**
 * Explicit, owner-approved resolutions for OWNER_SOURCE_CONFLICT branch
 * identities (concept §8.2). Each entry records a real disagreement between
 * a branch's own name-root and its OWNER attribute that the adapter refuses
 * to resolve silently. Approved 2026-07-22: branch
 * /ASIM-1885-4"-P-8810288-31441C4/B1 has OWNER=/ASIM-1885-4"-P8810288-31441C4-PP-01
 * (an existing 11-branch line) while its own name is missing the "-PP-01"
 * job-spec suffix and has an extra hyphen — a source-data label typo, not a
 * distinct line. OWNER is authoritative.
 */
const APPROVED_BRANCH_IDENTITY_RESOLUTIONS = Object.freeze({
  '/ASIM-1885-4"-P-8810288-31441C4/B1': 'OWNER',
});
const APPROVED_DIR = join(REPO_ROOT, 'node-history/bootstrap/approved/ASIM-1885/ZONE-1885-NC');
const LEASE_STEP = 10;
const LEASE_FIRST_START = 10;
const NAMESPACE_MAXIMUM = 9_999_990;
const ALLOCATION_POLICY = Object.freeze({
  policyVersion: 'POLICY-ASIM-1885-V1', configVersion: 'CONFIG-ASIM-1885-V1',
  strategy: 'LOWEST_AVAILABLE', reservedNumbers: [],
});

async function main() {
  const inventory = await buildAsim1885SourceLineInventory({
    filePath: join(REPO_ROOT, 'Benchmarks/1885_NC/1885_NC.json'),
    sourceName: '1885_NC.json',
    jobName: '1885_NC',
    projectId: PROJECT_ID,
    zoneId: ZONE_ID,
    coordinateFrameId: COORDINATE_FRAME_ID,
    toleranceMm: 0.5,
    supportProjectionToleranceMm: 50,
    expectedGitBlobSha1: EXPECTED_GIT_BLOB_SHA1,
    approvedBranchIdentityResolutions: APPROVED_BRANCH_IDENTITY_RESOLUTIONS,
  });
  console.log(`Source identity verified: gitBlobSha1=${inventory.identity.gitBlobSha1}`);
  console.log(`Envelope: ${inventory.metrics.canonical.nodes} canonical nodes across ${inventory.lines.length} lines.`);

  const totalDemand = inventory.lines.reduce((sum, line) => sum + line.nodeCount, 0);
  if (totalDemand !== inventory.metrics.canonical.nodes) {
    throw new Error(`Line demand total (${totalDemand}) does not equal canonical node count (${inventory.metrics.canonical.nodes}).`);
  }

  const leases = buildLeases(inventory.lines);
  const seedLineHistories = await buildSeedLineHistories(inventory.lines);
  const seedZoneRegistry = await buildSeedZoneRegistry(leases, seedLineHistories);
  const seedManifest = await buildRegistrySnapshotManifest({
    zoneRegistry: seedZoneRegistry,
    lineHistories: seedLineHistories,
    pathsByMainLine: Object.fromEntries(seedZoneRegistry.lineHistoryRefs.map((row) => [row.mainLineKey, row.path])),
  });
  console.log(`Empty-history seed built: registrySnapshotHash=${seedManifest.registrySnapshotHash}`);

  const { historyMatchResult, allocationResult } = await runMatchAndAllocatePerLine({
    inventory, seedZoneRegistry, seedLineHistories, seedManifest,
  });
  console.log(`Matching complete: ${historyMatchResult.newNodes.length} NEW, `
    + `${historyMatchResult.matches.length} matched, ${historyMatchResult.ambiguous.length} ambiguous, `
    + `${historyMatchResult.conflicts.length} conflicts, ${historyMatchResult.reactivated.length} reactivated.`);
  if (historyMatchResult.matches.length || historyMatchResult.ambiguous.length
    || historyMatchResult.conflicts.length || historyMatchResult.reactivated.length) {
    throw new Error('Expected an all-NEW disposition against the empty ASIM-1885 registry; historical reuse must be zero.');
  }
  if (allocationResult.validation.status !== 'PASS') {
    throw new Error(`Allocation not PASS: ${JSON.stringify(allocationResult.validation.blockers)}`);
  }
  console.log(`Allocation complete: ${allocationResult.allocations.length} NEW engineering numbers assigned.`);

  const approvedIdentityAssignments = await buildIdentityAssignments(
    inventory.currentLogicalNodes, seedManifest.registrySnapshotHash,
  );
  const assignmentResult = await validateApprovedIdentityAssignments({
    assignments: approvedIdentityAssignments,
    acceptedMatches: acceptedMatchMap(historyMatchResult),
    seedLineHistories,
    approval: { approvalRecordId: APPROVAL_RECORD_ID },
  });
  if (assignmentResult.blockers.length) {
    throw new Error(`Identity assignment blocked: ${JSON.stringify(assignmentResult.blockers)}`);
  }

  const revision = { revisionId: REVISION_ID, authority: 'APPROVED_REVISION_CONTROL', reactivations: [], retirements: [] };
  const approval = {
    approvalRecordId: APPROVAL_RECORD_ID,
    authority: 'NODE_HISTORY_APPROVAL_BOARD',
    approvedRevision: REVISION_ID,
    approvedProjectId: PROJECT_ID,
    approvedZoneId: ZONE_ID,
    approvedBaseRegistrySnapshotHash: seedManifest.registrySnapshotHash,
    approvedHistoryMatchResultHash: historyMatchResult.historyMatchResultHash,
    approvedAllocationResultHash: allocationResult.allocationResultHash,
    approvedIdentityAssignmentHash: assignmentResult.assignmentHash,
    baseRegistryCommit: currentGitCommit(),
    currentRegistrySnapshotHash: seedManifest.registrySnapshotHash,
    decision: 'APPROVED',
  };

  const bootstrapInput = {
    seedZoneRegistry, seedLineHistories, seedManifest,
    sourceInventory: inventory.sourceInventory,
    currentLogicalNodes: inventory.currentLogicalNodes,
    historyMatchResult, allocationResult, approvedIdentityAssignments,
    revision, coverage: { scope: 'FULL_ZONE', authoritativeForRetirement: true },
    approval, evaluatedAt: EVALUATED_AT,
  };

  const result = await buildApprovedRegistryBootstrap(bootstrapInput);
  if (result.validation.status !== 'PASS') {
    console.error(JSON.stringify(result.validation.blockers, null, 2));
    throw new Error('Bootstrap result is not PASS.');
  }
  console.log(`Bootstrap PASS: bootstrapResultHash=${result.bootstrapResultHash}`);

  writeApprovedArtifacts({ bootstrapInput, result });
  console.log(`Approved artifacts written to ${APPROVED_DIR}`);
}

function buildLeases(lines) {
  const leases = [];
  let nextStart = LEASE_FIRST_START;
  for (const line of lines) {
    const start = nextStart;
    const end = start + (line.nodeCount - 1) * LEASE_STEP;
    if (end > NAMESPACE_MAXIMUM) throw new Error(`Lease for ${line.mainLineKey} exceeds namespace maximum.`);
    leases.push({
      leaseId: `LEASE-${line.mainLineKey.replace(/^\//, '').replace(/\//g, '__')}`,
      mainLineKey: line.mainLineKey,
      status: 'ACTIVE',
      ranges: [{ start, end, step: LEASE_STEP }],
      firstObservedRevision: REVISION_ID,
      lastObservedRevision: REVISION_ID,
      evidence: { authority: 'APPROVED_REGISTRY', revisionId: REVISION_ID },
    });
    nextStart = end + LEASE_STEP;
  }
  return leases;
}

async function buildSeedLineHistories(lines) {
  const histories = [];
  for (const line of lines) {
    const history = {
      schema: 'PsiNodeLineHistory.v1', registryVersion: '1.0.0',
      projectId: PROJECT_ID, zoneId: ZONE_ID, mainLineKey: line.mainLineKey,
      coordinateRegistrationRef: null, historyNodes: [],
      validation: { status: 'PASS', blockers: [], reviewItems: [], warnings: [] },
      audit: { evaluatedAt: EVALUATED_AT },
      lineHistoryHash: '',
    };
    history.lineHistoryHash = await computeLineHistoryHash(history);
    histories.push(history);
  }
  return histories;
}

async function buildSeedZoneRegistry(leases, lineHistories) {
  const byLine = new Map(lineHistories.map((row) => [row.mainLineKey, row]));
  const registry = {
    schema: 'PsiNodeZoneRegistry.v1', registryVersion: '1.0.0',
    projectId: PROJECT_ID, zoneId: ZONE_ID,
    policyVersion: 'POLICY-ASIM-1885-V1', configVersion: 'CONFIG-ASIM-1885-V1',
    namespace: { minimum: LEASE_FIRST_START, maximum: NAMESPACE_MAXIMUM, defaultStep: LEASE_STEP },
    leases,
    lineHistoryRefs: leases.map((lease) => ({
      mainLineKey: lease.mainLineKey,
      path: `node-history/bootstrap/approved/ASIM-1885/ZONE-1885-NC/lines/${slugForLine(lease.mainLineKey)}.json`,
      lineHistoryHash: byLine.get(lease.mainLineKey).lineHistoryHash,
    })),
    coordinateRegistrationRefs: [],
    validation: { status: 'PASS', blockers: [], reviewItems: [], warnings: [] },
    zoneRegistryHash: '',
    audit: { evaluatedAt: EVALUATED_AT },
  };
  registry.zoneRegistryHash = await computeZoneRegistryHash(registry);
  return registry;
}

/**
 * Only the exact-identity matcher runs here. The registered/spatial matcher
 * (matchRegisteredHistoricalNodes) additionally requires a coordinate
 * registration authority and a full RegisteredHistoryMatcherPolicy.v1 score
 * model — but this seed's previousRegistry has zero history nodes on any
 * line (concept §4.3) and zero coordinateRegistrationRefs. Spatial/registered
 * matching can only ever propose a match against existing history; with none
 * to match against, its result is guaranteed to be "no match" regardless of
 * policy or registration, so running it here would add no evidentiary value.
 * It becomes load-bearing once ASIM-1885 has a real revision history (i.e.
 * inside TE-016, not this bootstrap).
 */
async function runMatchAndAllocatePerLine({ inventory, seedZoneRegistry, seedLineHistories, seedManifest }) {
  const previousRegistry = {
    projectId: PROJECT_ID, zoneId: ZONE_ID,
    registrySnapshotHash: seedManifest.registrySnapshotHash,
    lineHistories: seedLineHistories,
  };
  const byLine = new Map();
  for (const node of inventory.currentLogicalNodes) {
    const rows = byLine.get(node.mainLineKey) || [];
    rows.push(node);
    byLine.set(node.mainLineKey, rows);
  }
  const newNodes = [], matches = [], ambiguous = [], conflicts = [], reactivated = [], retirementCandidates = [];
  const leases = [], allocations = [], retirements = [], allocationReactivations = [];
  for (const mainLineKey of [...byLine.keys()].sort()) {
    const currentLogicalNodes = byLine.get(mainLineKey);
    const logicalTopologyHash = await computeSemanticHash({
      mainLineKey, logicalNodeIds: currentLogicalNodes.map((row) => row.logicalNodeId).sort(),
    }, 'logicalTopologyHash');
    const perLineMatch = await matchExactHistoricalNodes({
      previousRegistry, currentLogicalNodes, sourceInventory: inventory.sourceInventory,
      logicalTopologyHash,
      coverage: { scope: 'FULL_ZONE', authoritativeForRetirement: true },
      evaluatedAt: EVALUATED_AT,
    });
    if (perLineMatch.validation.status !== 'PASS') {
      throw new Error(`Exact matcher not PASS for ${mainLineKey}: ${JSON.stringify(perLineMatch.validation.blockers)}`);
    }
    newNodes.push(...perLineMatch.newNodes);
    matches.push(...perLineMatch.matches);
    ambiguous.push(...perLineMatch.ambiguous);
    conflicts.push(...perLineMatch.conflicts);
    reactivated.push(...perLineMatch.reactivated);
    retirementCandidates.push(...perLineMatch.retirementCandidates);

    const perLineAllocation = await allocateZoneEngineeringNodes({
      zoneRegistry: seedZoneRegistry, lineHistories: seedLineHistories, manifest: seedManifest,
      historyMatchResult: perLineMatch,
      coverage: { scope: 'FULL_ZONE', authoritativeForRetirement: true },
      allocationRequests: currentLogicalNodes.map((node) => ({
        logicalNodeId: node.logicalNodeId, mainLineKey: node.mainLineKey,
      })),
      policy: ALLOCATION_POLICY,
      evaluatedAt: EVALUATED_AT,
    });
    if (perLineAllocation.validation.status !== 'PASS') {
      throw new Error(`Allocation not PASS for ${mainLineKey}: ${JSON.stringify(perLineAllocation.validation.blockers)}`);
    }
    leases.push(...perLineAllocation.leases);
    allocations.push(...perLineAllocation.allocations);
    retirements.push(...perLineAllocation.retirements);
    allocationReactivations.push(...perLineAllocation.reactivations);
  }

  const mergedMatchArtifact = {
    schema: 'TopoNodeHistoryMatchResult.v1',
    projectId: PROJECT_ID, zoneId: ZONE_ID,
    mainLineKey: `${ZONE_ID}:ALL-LINES`,
    coordinateFrameId: COORDINATE_FRAME_ID,
    logicalTopologyHash: await computeSemanticHash({
      zoneId: ZONE_ID, logicalNodeIds: inventory.currentLogicalNodes.map((row) => row.logicalNodeId).sort(),
    }, 'logicalTopologyHash'),
    baseRegistrySnapshotHash: seedManifest.registrySnapshotHash,
    matches: matches.sort((a, b) => a.logicalNodeId.localeCompare(b.logicalNodeId)),
    newNodes: newNodes.sort((a, b) => a.logicalNodeId.localeCompare(b.logicalNodeId)),
    ambiguous, conflicts, reactivated, retirementCandidates,
    evaluatedAt: EVALUATED_AT,
    validation: { status: 'PASS', blockers: [], reviewItems: [], warnings: [] },
  };
  mergedMatchArtifact.historyMatchResultHash = await computeSemanticHash(mergedMatchArtifact, 'historyMatchResultHash');
  const historyMatchResult = TOPONODEHISTORYMATCHRESULT_V1.freeze(mergedMatchArtifact);

  const allocationResult = await buildAllocationResult({
    projectId: PROJECT_ID, zoneId: ZONE_ID,
    baseRegistrySnapshotHash: seedManifest.registrySnapshotHash,
    historyMatchResultHash: historyMatchResult.historyMatchResultHash,
    leases, allocations, retirements: retirements, reactivations: allocationReactivations,
    evaluatedAt: EVALUATED_AT, policy: ALLOCATION_POLICY,
  });

  return { historyMatchResult, allocationResult };
}

function acceptedMatchMap(result) {
  return new Map([
    ...result.matches.map((row) => [row.logicalNodeId, { kind: 'MATCH', historyNodeId: row.historyNodeId }]),
    ...result.newNodes.map((row) => [row.logicalNodeId, { kind: 'NEW', historyNodeId: '' }]),
    ...result.reactivated.map((row) => [row.logicalNodeId, { kind: 'REACTIVATE', historyNodeId: row.historyNodeId }]),
  ]);
}

/**
 * Concept §11.4: new history IDs must be deterministically proposed from
 * transaction identity, not from coordinates or mutable topology
 * fingerprints (the canonical-topology node ID shifts if upstream
 * components are added/removed, since it is assigned by global sort
 * order). HN-<sha256(project|zone|baseSnapshotHash|runId|ordinal)[0:16]>
 * is stable against exactly that kind of topology churn.
 *
 * Source aliases use the real content-hashed sourcePortIds (Tier 3 evidence
 * per §9.2), not the topology-order-derived logicalNodeId. sourcePortIds are
 * the correct exclusive unit here: a single source entity (e.g. a PIPE
 * component) legitimately touches two different canonical nodes through its
 * arrive/leave ports, so sourceEntityIds are not node-exclusive, but each
 * port belongs to exactly one connectivity-grouped node.
 */
async function buildIdentityAssignments(currentLogicalNodes, baseRegistrySnapshotHash) {
  const seenAliases = new Set();
  const assignments = [];
  for (const [ordinal, node] of currentLogicalNodes.entries()) {
    const historyNodeId = `HN-${(await sha256Hex(
      [PROJECT_ID, ZONE_ID, baseRegistrySnapshotHash, BOOTSTRAP_RUN_ID, ordinal].join('|'),
    )).slice(0, 16)}`;
    for (const alias of node.sourcePortIds) {
      if (seenAliases.has(alias)) throw new Error(`sourcePortId ${alias} is claimed by more than one canonical node.`);
      seenAliases.add(alias);
    }
    assignments.push({
      logicalNodeId: node.logicalNodeId,
      historyNodeId,
      mainLineKey: node.mainLineKey,
      identityAuthority: 'BOOTSTRAP_IDENTITY_BOARD',
      sourceAliases: [...node.sourcePortIds],
      approvalRecordId: APPROVAL_RECORD_ID,
      identityEvidence: [{
        kind: 'STABLE_SOURCE_PORT', value: node.sourcePortIds[0],
        authority: 'BOOTSTRAP_IDENTITY_BOARD', approvalRecordId: APPROVAL_RECORD_ID,
      }],
    });
  }
  return assignments;
}

async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function slugForLine(mainLineKey) {
  return mainLineKey.replace(/^\//, '').replace(/\//g, '__');
}

function currentGitCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
}

function writeApprovedArtifacts({ bootstrapInput, result }) {
  mkdirSync(join(APPROVED_DIR, 'lines'), { recursive: true });
  writeJson(join(APPROVED_DIR, 'bootstrap-input.json'), bootstrapInput);
  writeJson(join(APPROVED_DIR, 'zone-registry.json'), result.proposedZoneRegistry);
  for (const history of result.proposedLineHistories) {
    writeJson(join(APPROVED_DIR, 'lines', `${slugForLine(history.mainLineKey)}.json`), history);
  }
  writeJson(join(APPROVED_DIR, 'manifest.json'), result.proposedManifest);
  writeJson(join(APPROVED_DIR, 'registry-patch.json'), result.registryPatch);
  writeJson(join(APPROVED_DIR, 'bootstrap-result.json'), result);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeBootstrapArtifact(value));
}

await main();
