import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deepFreeze } from '../../../../contracts/topo-enriched-xml/contract-core.js';
import {
  buildRegistrySnapshotManifest,
  computeLineHistoryHash,
  computeZoneRegistryHash,
} from '../../../../node-history/registry/registry-hash.js';
import { buildTopoNodeRegistryPatch } from '../../../../node-history/registry/registry-patch.js';
import { hashCanonical, canonicalBytes } from '../../../../node-history/operations/registry-operations-common.js';
import { createNodeFileSystemAdapter } from '../../../../node-history/operations/registry-publication/registry-filesystem.js';

const BASE_COMMIT = '89f1105cd3c38cb257fe541924482d0e4add2d50';
const EVALUATED_AT = '2026-07-21T08:00:00Z';
const REGISTRY_ROOT = 'node-history/registry/current/PROJECT-TE015/ZONE-01';
const PASS = () => ({ status: 'PASS', blockers: [], reviewItems: [], warnings: [] });

export async function makeOperationsCase() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'te015-'));
  const currentRegistryRoot = path.join(parent, 'current-repository');
  const temporaryRoot = path.join(parent, 'candidate-publication');
  const rollbackProofRoot = path.join(parent, 'rollback-proof');
  const artifacts = await buildArtifacts();
  const targetManifest = makeTargetManifest(temporaryRoot, rollbackProofRoot);
  const fileSystem = createNodeFileSystemAdapter();
  await fileSystem.createDirectoryExclusive(currentRegistryRoot);
  await writeSnapshot(currentRegistryRoot, artifacts.base, targetManifest, fileSystem);
  const input = {
    currentRegistryRoot,
    approvedPatch: artifacts.patch,
    bootstrapResult: artifacts.bootstrapResult,
    expectedBaseCommit: BASE_COMMIT,
    expectedCurrentSnapshotHash: artifacts.base.manifest.registrySnapshotHash,
    targetManifest,
    evaluatedAt: EVALUATED_AT,
  };
  return {
    input,
    artifacts,
    parent,
    fileSystem,
    cleanup: () => rm(parent, { recursive: true, force: true }),
  };
}

export function makeTargetManifest(temporaryRoot, rollbackProofRoot, overrides = {}) {
  return {
    schema: 'TopoRegistryPublicationTargetManifest.v1',
    registryRootPath: REGISTRY_ROOT,
    temporaryRoot,
    rollbackProofRoot,
    files: [
      { role: 'ZONE_REGISTRY', path: `${REGISTRY_ROOT}/zone-registry.json` },
      { role: 'LINE_HISTORY', mainLineKey: '/LINE-A', path: `${REGISTRY_ROOT}/lines/LINE-A.json` },
      { role: 'LINE_HISTORY', mainLineKey: '/LINE-B', path: `${REGISTRY_ROOT}/lines/LINE-B.json` },
      { role: 'REGISTRY_MANIFEST', path: `${REGISTRY_ROOT}/manifest.json` },
    ],
    ...overrides,
  };
}

export function wrapFileSystem(base, overrides = {}) {
  return Object.freeze({ ...base, ...overrides });
}

async function buildArtifacts() {
  const baseLines = await hashLines([
    line('/LINE-A', [node('HN-A-100', 100, 'SRC-A-100')]),
    line('/LINE-B', [node('HN-B-500', 500, 'SRC-B-500')]),
  ]);
  const baseZone = await zoneRegistry(baseLines, '2026-07-21T07:00:00Z');
  const baseManifest = await manifest(baseZone, baseLines);
  const proposedLines = await hashLines([
    line('/LINE-A', [node('HN-A-100', 100, 'SRC-A-100'), node('HN-A-110', 110, 'SRC-A-110', 'REV-002')]),
    line('/LINE-B', [node('HN-B-500', 500, 'SRC-B-500')]),
  ]);
  const proposedZone = await zoneRegistry(proposedLines, EVALUATED_AT);
  const proposedManifest = await manifest(proposedZone, proposedLines);
  const operation = addNodeOperation();
  const patch = await buildTopoNodeRegistryPatch({
    baseRegistryCommit: BASE_COMMIT,
    baseZoneRegistry: baseZone,
    baseLineHistories: baseLines,
    baseManifest,
    proposedZoneRegistry: proposedZone,
    proposedLineHistories: proposedLines,
    proposedManifest,
    currentRegistrySnapshotHash: baseManifest.registrySnapshotHash,
    coverage: { scope: 'FULL_ZONE', authoritativeForRetirement: true },
    operations: [operation],
    preconditions: [{ type: 'SNAPSHOT_EQUALS', registrySnapshotHash: baseManifest.registrySnapshotHash }],
    evaluatedAt: EVALUATED_AT,
    sourceHash: fakeHash('source'),
  });
  const bootstrapResult = bootstrap({ baseManifest, proposedZone, proposedLines, proposedManifest, patch });
  return deepFreeze({
    base: { zoneRegistry: baseZone, lineHistories: baseLines, manifest: baseManifest },
    proposed: { zoneRegistry: proposedZone, lineHistories: proposedLines, manifest: proposedManifest },
    patch,
    bootstrapResult,
  });
}

function bootstrap({ baseManifest, proposedZone, proposedLines, proposedManifest, patch }) {
  const semantic = {
    schema: 'TopoNodeRegistryBootstrapResult.v1',
    projectId: 'PROJECT-TE015',
    zoneId: 'ZONE-01',
    baseRegistrySnapshotHash: baseManifest.registrySnapshotHash,
    historyMatchResultHash: fakeHash('match'),
    allocationResultHash: fakeHash('allocation'),
    approvedIdentityAssignmentHash: fakeHash('identity'),
    proposedZoneRegistry: proposedZone,
    proposedLineHistories: proposedLines,
    proposedManifest,
    registryPatch: patch,
    approvalEvidence: {
      approvalRecordId: 'APPROVAL-TE015-001', authority: 'NODE_HISTORY_APPROVAL_BOARD',
      baseRegistryCommit: BASE_COMMIT, currentRegistrySnapshotHash: baseManifest.registrySnapshotHash,
      decision: 'APPROVED',
    },
    revisionEvidence: { revisionId: 'REV-002', authority: 'APPROVED_REVISION_CONTROL', reactivations: [], retirements: [] },
    coverageEvidence: { scope: 'FULL_ZONE', authoritativeForRetirement: true, coveredMainLines: [] },
    validation: PASS(),
  };
  return deepFreeze({ ...semantic, bootstrapResultHash: hashCanonical(semantic), evaluatedAt: EVALUATED_AT });
}

async function writeSnapshot(root, snapshot, targetManifest, fileSystem) {
  for (const target of targetManifest.files) {
    const artifact = target.role === 'ZONE_REGISTRY' ? snapshot.zoneRegistry
      : target.role === 'REGISTRY_MANIFEST' ? snapshot.manifest
        : snapshot.lineHistories.find((row) => row.mainLineKey === target.mainLineKey);
    await fileSystem.writeFileExclusive(path.join(root, target.path), canonicalBytes(artifact));
  }
}

async function hashLines(lines) {
  const result = [];
  for (const value of lines) {
    value.lineHistoryHash = await computeLineHistoryHash(value);
    result.push(value);
  }
  return result;
}

async function zoneRegistry(lines, evaluatedAt) {
  const byLine = new Map(lines.map((row) => [row.mainLineKey, row]));
  const value = {
    schema: 'PsiNodeZoneRegistry.v1', registryVersion: '1.0.0',
    projectId: 'PROJECT-TE015', zoneId: 'ZONE-01', policyVersion: 'POLICY-1', configVersion: 'CONFIG-1',
    namespace: { minimum: 0, maximum: 9990, defaultStep: 10 },
    leases: [lease('LEASE-A', '/LINE-A', 100, 190), lease('LEASE-B', '/LINE-B', 500, 590)],
    lineHistoryRefs: ['/LINE-A', '/LINE-B'].map((mainLineKey) => ({
      mainLineKey,
      path: `${REGISTRY_ROOT}/lines/${mainLineKey.slice(1)}.json`,
      lineHistoryHash: byLine.get(mainLineKey).lineHistoryHash,
    })),
    coordinateRegistrationRefs: ['COORD-REG-TE015'], validation: PASS(),
    zoneRegistryHash: fakeHash('zero'), audit: { evaluatedAt },
  };
  value.zoneRegistryHash = await computeZoneRegistryHash(value);
  return value;
}

function manifest(zoneRegistryValue, lines) {
  return buildRegistrySnapshotManifest({
    zoneRegistry: zoneRegistryValue,
    lineHistories: lines,
    pathsByMainLine: Object.fromEntries(zoneRegistryValue.lineHistoryRefs.map((row) => [row.mainLineKey, row.path])),
  });
}

function line(mainLineKey, historyNodes) {
  return {
    schema: 'PsiNodeLineHistory.v1', registryVersion: '1.0.0',
    projectId: 'PROJECT-TE015', zoneId: 'ZONE-01', mainLineKey,
    coordinateRegistrationRef: 'COORD-REG-TE015', historyNodes,
    validation: PASS(), lineHistoryHash: fakeHash('zero'), audit: { evaluatedAt: EVALUATED_AT },
  };
}

function node(historyNodeId, engineeringNodeNumber, alias, firstObservedRevision = 'REV-001') {
  const mainLineKey = historyNodeId.includes('-A-') ? '/LINE-A' : '/LINE-B';
  return {
    historyNodeId, engineeringNodeNumber, lifecycleStatus: 'ACTIVE', sourceAliases: [alias],
    identityEvidence: [{ kind: 'SOURCE_REF', value: alias, authority: 'APPROVED_SOURCE' }],
    immutableFacts: { historyNodeId, engineeringNodeNumber, mainLineKey, firstObservedRevision },
    firstObservedRevision, lastObservedRevision: 'REV-002', retirementEvidence: null,
    reactivationEvidence: null, supersessionEvidence: null, supersededByHistoryNodeId: null,
  };
}

function lease(leaseId, mainLineKey, start, end) {
  return {
    leaseId, mainLineKey, status: 'ACTIVE', ranges: [{ start, end, step: 10 }],
    firstObservedRevision: 'REV-001', lastObservedRevision: 'REV-002',
    evidence: { authority: 'APPROVED_REGISTRY', revisionId: 'REV-002' },
  };
}

function addNodeOperation() {
  return {
    operationId: 'TE015:ADD_NODE:HN-A-110', type: 'ADD_NODE', historyNodeId: 'HN-A-110',
    logicalNodeId: 'LN-A-110', mainLineKey: '/LINE-A', engineeringNodeNumber: 110,
    evidence: { authority: 'NODE_HISTORY_APPROVAL_BOARD', revisionId: 'REV-002', reason: 'APPROVED_ADD_NODE' },
  };
}

function fakeHash(label) {
  return `sha256:${label.padEnd(64, '0').slice(0, 64).replace(/[^a-f0-9]/g, 'a')}`;
}
