import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRegistrySnapshotManifest,
  computeLineHistoryHash,
  computeRegistrySnapshotHash,
  computeZoneRegistryHash,
} from '../../../../node-history/registry/registry-hash.js';
import { buildTopoNodeRegistryPatch } from '../../../../node-history/registry/registry-patch.js';
import {
  validateLifecycleChanges,
  validateRegistrySnapshot,
} from '../../../../node-history/registry/registry-validator.js';

const fixture = JSON.parse(readFileSync(new URL('./foundation.json', import.meta.url), 'utf8'));
const evaluatedAt = '2026-07-20T08:00:00Z';

async function materialize(raw = fixture) {
  const data = structuredClone(raw);
  for (const history of data.lineHistories) history.lineHistoryHash = await computeLineHistoryHash(history);
  for (const reference of data.zoneRegistry.lineHistoryRefs) {
    const history = data.lineHistories.find((row) => row.mainLineKey === reference.mainLineKey);
    if (history) reference.lineHistoryHash = history.lineHistoryHash;
  }
  data.zoneRegistry.zoneRegistryHash = await computeZoneRegistryHash(data.zoneRegistry);
  data.manifest = await buildRegistrySnapshotManifest({
    zoneRegistry: data.zoneRegistry,
    lineHistories: data.lineHistories,
    pathsByMainLine: Object.fromEntries(data.zoneRegistry.lineHistoryRefs.map((row) => [row.mainLineKey, row.path])),
  });
  return data;
}

async function proposedFrom(base, mutate) {
  const raw = structuredClone(base);
  delete raw.manifest;
  mutate(raw);
  return materialize(raw);
}

async function patch(base, proposed, operations = [], overrides = {}) {
  return buildTopoNodeRegistryPatch({
    baseRegistryCommit: '69dd834af5bbe5d820abd590dfd70c0fbadbf474',
    baseZoneRegistry: base.zoneRegistry,
    baseLineHistories: base.lineHistories,
    baseManifest: base.manifest,
    proposedZoneRegistry: proposed.zoneRegistry,
    proposedLineHistories: proposed.lineHistories,
    proposedManifest: proposed.manifest,
    currentRegistrySnapshotHash: base.manifest.registrySnapshotHash,
    coverage: { scope: 'FULL_ZONE', authoritativeForRetirement: false },
    operations,
    preconditions: [{ type: 'SNAPSHOT_EQUALS', registrySnapshotHash: base.manifest.registrySnapshotHash }],
    evaluatedAt,
    ...overrides,
  });
}

function codes(value) {
  const found = [];
  const visit = (row) => {
    if (Array.isArray(row)) return row.forEach(visit);
    if (!row || typeof row !== 'object') return;
    if (row.code) found.push(row.code);
    Object.values(row).forEach(visit);
  };
  visit(value);
  return found;
}

function historyNode(data, historyNodeId) {
  return data.lineHistories.flatMap((row) => row.historyNodes).find((row) => row.historyNodeId === historyNodeId);
}

test('rejects stale cross-file hashes and contradictory manifest paths', async () => {
  const base = await materialize();
  const stale = structuredClone(base);
  stale.zoneRegistry.lineHistoryRefs[0].lineHistoryHash = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  stale.zoneRegistry.zoneRegistryHash = await computeZoneRegistryHash(stale.zoneRegistry);
  stale.manifest = await buildRegistrySnapshotManifest({ zoneRegistry: stale.zoneRegistry, lineHistories: stale.lineHistories });
  assert.ok(codes(await validateRegistrySnapshot(stale)).includes('LINE_HISTORY_REFERENCE_HASH_MISMATCH'));

  const wrongPath = structuredClone(base.manifest);
  wrongPath.lineHistories[0].path = 'node-history/registry/lines/OTHER.json';
  wrongPath.registrySnapshotHash = await computeRegistrySnapshotHash(wrongPath);
  assert.ok(codes(await validateRegistrySnapshot({
    zoneRegistry: base.zoneRegistry, lineHistories: base.lineHistories, manifest: wrongPath,
  })).includes('SNAPSHOT_LINE_PATH_MISMATCH'));
});

test('rejects duplicate manifest ownership and stale schema or policy authority', async () => {
  const base = await materialize();
  const duplicate = structuredClone(base.manifest);
  duplicate.lineHistories.push(structuredClone(duplicate.lineHistories[0]));
  duplicate.registrySnapshotHash = await computeRegistrySnapshotHash(duplicate);
  assert.ok(codes(await validateRegistrySnapshot({
    zoneRegistry: base.zoneRegistry, lineHistories: base.lineHistories, manifest: duplicate,
  })).includes('SNAPSHOT_LINE_HISTORY_DUPLICATE'));

  const staleAuthority = structuredClone(base.manifest);
  staleAuthority.schemaVersions.registryPatch = 'TopoNodeRegistryPatch.v0';
  staleAuthority.policy.registryConfigVersion = 'OTHER-CONFIG';
  staleAuthority.registrySnapshotHash = await computeRegistrySnapshotHash(staleAuthority);
  const authorityCodes = codes(await validateRegistrySnapshot({
    zoneRegistry: base.zoneRegistry, lineHistories: base.lineHistories, manifest: staleAuthority,
  }));
  assert.ok(authorityCodes.includes('SNAPSHOT_SCHEMA_VERSION_MISMATCH'));
  assert.ok(authorityCodes.includes('SNAPSHOT_POLICY_MISMATCH'));
});

test('requires complete lifecycle evidence and exact operation-to-record agreement', async () => {
  const base = await materialize();
  const invalid = structuredClone(base);
  const target = historyNode(invalid, 'HN-A-110');
  target.retirementEvidence = {};
  invalid.lineHistories[0].lineHistoryHash = await computeLineHistoryHash(invalid.lineHistories[0]);
  invalid.zoneRegistry.lineHistoryRefs[0].lineHistoryHash = invalid.lineHistories[0].lineHistoryHash;
  invalid.zoneRegistry.zoneRegistryHash = await computeZoneRegistryHash(invalid.zoneRegistry);
  invalid.manifest = await buildRegistrySnapshotManifest({ zoneRegistry: invalid.zoneRegistry, lineHistories: invalid.lineHistories });
  assert.ok(codes(await validateRegistrySnapshot(invalid)).includes('RETIREMENT_EVIDENCE_MISSING'));

  const proposed = await proposedFrom(base, (data) => {
    const node = historyNode(data, 'HN-A-100');
    node.lifecycleStatus = 'RETIRED';
    node.lastObservedRevision = 'REV-003';
    node.retirementEvidence = { authority: 'FULL_LINE_REVIEW', revisionId: 'REV-003', reason: 'Stored reason' };
  });
  const operation = {
    operationId: 'RETIRE-HN-A-100', type: 'RETIRE_NODE', historyNodeId: 'HN-A-100',
    evidence: { authority: 'FULL_LINE_REVIEW', revisionId: 'REV-003', reason: 'Different reason' },
  };
  const lifecycle = validateLifecycleChanges({
    baseLineHistories: base.lineHistories, proposedLineHistories: proposed.lineHistories, operations: [operation],
  });
  assert.ok(codes(lifecycle).includes('LIFECYCLE_OPERATION_EVIDENCE_MISMATCH'));
});

test('requires alias changes to have one exact UPDATE_ALIAS operation', async () => {
  const base = await materialize();
  const proposed = await proposedFrom(base, (data) => {
    historyNode(data, 'HN-A-100').sourceAliases.push('REVIEWED-ALIAS');
  });
  const missing = await patch(base, proposed, []);
  assert.ok(codes(missing).includes('REGISTRY_CHANGE_OPERATION_MISSING'));

  const mismatch = await patch(base, proposed, [{
    operationId: 'ALIAS-HN-A-100', type: 'UPDATE_ALIAS', historyNodeId: 'HN-A-100', sourceAliases: ['WRONG'],
  }]);
  assert.ok(codes(mismatch).includes('ALIAS_OPERATION_EVIDENCE_MISMATCH'));

  const accepted = await patch(base, proposed, [{
    operationId: 'ALIAS-HN-A-100', type: 'UPDATE_ALIAS', historyNodeId: 'HN-A-100',
    sourceAliases: ['SRC-A-100', 'REVIEWED-ALIAS'],
  }]);
  assert.equal(accepted.validation.status, 'PASS');
  assert.deepEqual(accepted.affectedMainLines, ['/LINE-A']);
  assert.equal(accepted.poolUpdates.length, 1);
  assert.equal(accepted.lineHistoryUpdates[0].mainLineKey, '/LINE-A');
});

test('requires lease diffs to have exact operations and full affected-line coverage', async () => {
  const base = await materialize();
  const proposed = await proposedFrom(base, (data) => {
    data.zoneRegistry.leases[0].lastObservedRevision = 'REV-003';
    data.zoneRegistry.leases[0].evidence = { authority: 'APPROVED_REGISTRY', revisionId: 'REV-003' };
  });
  const missing = await patch(base, proposed, []);
  assert.ok(codes(missing).includes('REGISTRY_CHANGE_OPERATION_MISSING'));

  const operation = {
    operationId: 'LEASE-LINE-A-UPDATE', type: 'UPDATE_LEASE', leaseId: 'LEASE-LINE-A',
  };
  const accepted = await patch(base, proposed, [operation]);
  assert.equal(accepted.validation.status, 'PASS');
  assert.deepEqual(accepted.affectedMainLines, ['/LINE-A']);
  assert.equal(accepted.poolUpdates[0].baseZoneRegistryHash, base.zoneRegistry.zoneRegistryHash);
  assert.equal(accepted.poolUpdates[0].proposedZoneRegistryHash, proposed.zoneRegistry.zoneRegistryHash);

  const wrongCoverage = await patch(base, proposed, [operation], {
    coverage: { scope: 'FULL_LINE', authoritativeForRetirement: false, mainLineKeys: ['/LINE-B'] },
  });
  assert.ok(codes(wrongCoverage).includes('AFFECTED_LINE_OUTSIDE_COVERAGE'));

  const phantom = await patch(base, base, [{
    operationId: 'LEASE-LINE-A-PHANTOM', type: 'UPDATE_LEASE', leaseId: 'LEASE-LINE-A',
  }]);
  assert.ok(codes(phantom).includes('REGISTRY_OPERATION_WITHOUT_CHANGE'));
});

test('binds the base snapshot through an exact merge precondition', async () => {
  const base = await materialize();
  const result = await patch(base, base, [], {
    preconditions: [{ type: 'SNAPSHOT_EQUALS', registrySnapshotHash: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' }],
  });
  assert.ok(codes(result).includes('PATCH_BASE_PRECONDITION_MISMATCH'));
});
