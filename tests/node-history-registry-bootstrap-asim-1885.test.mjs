import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  computeLineHistoryHash,
  computeRegistrySnapshotHash,
  computeZoneRegistryHash,
} from '../node-history/registry/registry-hash.js';
import { validateRegistrySnapshot } from '../node-history/registry/registry-validator.js';
import { buildApprovedRegistryBootstrap, serializeBootstrapArtifact } from '../node-history/bootstrap/bootstrap-result.js';
import {
  BranchIdentityConflictError,
  buildAsim1885SourceLineInventory,
} from '../node-history/bootstrap/asim-1885/source-line-inventory.js';

const APPROVED = new URL('../node-history/bootstrap/approved/ASIM-1885/ZONE-1885-NC/', import.meta.url);
const EXPECTED_GIT_BLOB_SHA1 = '9ac18595acdf8938f01579b5c211f0deebc5dc0a';
const APPROVED_BRANCH_IDENTITY_RESOLUTIONS = Object.freeze({
  '/ASIM-1885-4"-P-8810288-31441C4/B1': 'OWNER',
});

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, APPROVED), 'utf8'));
}

function inventoryOptions(overrides = {}) {
  return {
    filePath: new URL('../Benchmarks/1885_NC/1885_NC.json', import.meta.url),
    sourceName: '1885_NC.json',
    jobName: '1885_NC',
    projectId: 'ASIM-1885',
    zoneId: 'ZONE-1885-NC',
    coordinateFrameId: 'FRAME-ASIM-1885-ENU-MM-V1',
    toleranceMm: 0.5,
    supportProjectionToleranceMm: 50,
    expectedGitBlobSha1: EXPECTED_GIT_BLOB_SHA1,
    approvedBranchIdentityResolutions: APPROVED_BRANCH_IDENTITY_RESOLUTIONS,
    ...overrides,
  };
}

test('an unresolved OWNER/source-root branch-identity conflict fails closed rather than silently picking a side', async () => {
  await assert.rejects(
    () => buildAsim1885SourceLineInventory(inventoryOptions({ approvedBranchIdentityResolutions: {} })),
    (error) => {
      assert.ok(error instanceof BranchIdentityConflictError);
      assert.equal(error.conflicts.length, 1);
      assert.equal(error.conflicts[0].sourceBranch, '/ASIM-1885-4"-P-8810288-31441C4/B1');
      return true;
    },
  );
});

test('TE-016A source identity and topology envelope reproduce exactly from committed benchmark bytes', async () => {
  const inventory = await buildAsim1885SourceLineInventory(inventoryOptions());
  assert.equal(inventory.identity.gitBlobSha1, EXPECTED_GIT_BLOB_SHA1);
  assert.equal(inventory.metrics.source.branches, 278);
  assert.equal(inventory.metrics.source.childRecords, 4320);
  assert.equal(inventory.metrics.source.routeComponents, 2939);
  assert.equal(inventory.metrics.source.supports, 1381);
  assert.deepEqual(inventory.metrics.source.componentCounts, {
    'ELBO/BEND': 351, PIPE: 880, OLET: 58, SUPPORT: 1381, FLANGE: 571,
    GASK: 599, VALVE: 203, INST: 77, REDUCER: 52, TEE: 148,
  });
  assert.equal(inventory.metrics.canonical.nodes, 3926);
  assert.equal(inventory.metrics.canonical.zeroLengthEdges, 0);
  assert.equal(inventory.metrics.ledger.blockedRecords, 0);

  const totalDemand = inventory.lines.reduce((sum, line) => sum + line.nodeCount, 0);
  assert.equal(totalDemand, inventory.metrics.canonical.nodes);
  assert.equal(new Set(inventory.lines.map((line) => line.mainLineKey)).size, inventory.lines.length);
  const MAIN_LINE_PATTERN = /^\/[A-Z0-9][A-Z0-9._-]*(?:\/[A-Z0-9][A-Z0-9._-]*)*$/;
  assert.ok(inventory.lines.every((line) => MAIN_LINE_PATTERN.test(line.mainLineKey)));
});

test('reproduces the committed approved ASIM-1885 bootstrap byte-for-byte', async () => {
  const input = readJson('bootstrap-input.json');
  const result = await buildApprovedRegistryBootstrap(input);
  assert.equal(result.validation.status, 'PASS', JSON.stringify(result.validation.blockers));
  assert.equal(result.historyMatchResultHash, input.historyMatchResult.historyMatchResultHash);
  assert.equal(result.allocationResultHash, input.allocationResult.allocationResultHash);

  const expected = new Map([
    ['bootstrap-input.json', input],
    ['zone-registry.json', result.proposedZoneRegistry],
    ['manifest.json', result.proposedManifest],
    ['registry-patch.json', result.registryPatch],
    ['bootstrap-result.json', result],
  ]);
  for (const history of result.proposedLineHistories) {
    expected.set(`lines/${history.mainLineKey.replace(/^\//, '').replace(/\//g, '__')}.json`, history);
  }
  for (const [path, value] of expected) {
    assert.equal(readFileSync(new URL(path, APPROVED), 'utf8'), serializeBootstrapArtifact(value), path);
  }
});

test('ASIM-1885 approved bootstrap disposition is all-NEW with zero historical reuse', async () => {
  const result = readJson('bootstrap-result.json');
  const input = readJson('bootstrap-input.json');
  assert.equal(result.validation.status, 'PASS');
  assert.equal(input.historyMatchResult.matches.length, 0);
  assert.equal(input.historyMatchResult.ambiguous.length, 0);
  assert.equal(input.historyMatchResult.conflicts.length, 0);
  assert.equal(input.historyMatchResult.reactivated.length, 0);
  assert.equal(input.historyMatchResult.newNodes.length, 3926);
  assert.equal(input.allocationResult.allocations.length, 3926);
  assert.ok(input.allocationResult.allocations.every((row) => row.allocationKind === 'NEW'));
  const numbers = new Set(input.allocationResult.allocations.map((row) => `${row.mainLineKey}:${row.engineeringNodeNumber}`));
  assert.equal(numbers.size, 3926);
  const proposedHistoryNodeCount = result.proposedLineHistories.reduce((sum, row) => sum + row.historyNodes.length, 0);
  assert.equal(proposedHistoryNodeCount, 3926);
  assert.ok(result.proposedLineHistories.every((row) => row.historyNodes.every((node) => node.lifecycleStatus === 'ACTIVE')));
});

test('independently re-reads and recomputes the complete ASIM-1885 registry hash chain', async () => {
  const zoneRegistry = readJson('zone-registry.json');
  const manifest = readJson('manifest.json');
  const lineHistories = manifest.lineHistories.map((ref) => readJson(
    `lines/${ref.mainLineKey.replace(/^\//, '').replace(/\//g, '__')}.json`,
  ));

  assert.equal(await computeZoneRegistryHash(zoneRegistry), zoneRegistry.zoneRegistryHash);
  for (const history of lineHistories) {
    assert.equal(await computeLineHistoryHash(history), history.lineHistoryHash);
  }
  const rebuiltManifest = await import('../node-history/registry/registry-hash.js')
    .then(({ buildRegistrySnapshotManifest }) => buildRegistrySnapshotManifest({
      zoneRegistry, lineHistories,
      pathsByMainLine: Object.fromEntries(zoneRegistry.lineHistoryRefs.map((row) => [row.mainLineKey, row.path])),
    }));
  assert.equal(rebuiltManifest.registrySnapshotHash, manifest.registrySnapshotHash);
  assert.equal(await computeRegistrySnapshotHash(manifest), manifest.registrySnapshotHash);

  const snapshotValidation = await validateRegistrySnapshot({ zoneRegistry, lineHistories, manifest });
  assert.equal(snapshotValidation.status, 'PASS', JSON.stringify(snapshotValidation.blockers));
});

test('is deterministic across three independent bootstrap builds from the committed input', async () => {
  const input = readJson('bootstrap-input.json');
  const runs = await Promise.all([1, 2, 3].map(() => buildApprovedRegistryBootstrap(structuredClone(input))));
  const hashes = new Set(runs.map((run) => run.bootstrapResultHash));
  assert.equal(hashes.size, 1);
  assert.equal(runs[0].validation.status, 'PASS');
});
