import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRegistrySnapshotManifest,
  computeLineHistoryHash,
  computeRegistrySnapshotHash,
  computeZoneRegistryHash,
} from '../node-history/registry/registry-hash.js';
import {
  buildTopoNodeRegistryPatch,
  verifyTopoNodeRegistryPatch,
} from '../node-history/registry/registry-patch.js';
import {
  validateLifecycleChanges,
  validateRegistrySnapshot,
} from '../node-history/registry/registry-validator.js';

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/node-history/registry/foundation.json', import.meta.url,
), 'utf8'));
const PASS = Object.freeze({ status: 'PASS', blockers: [], reviewItems: [], warnings: [] });
const evaluatedAt = '2026-07-20T06:45:00Z';

async function materialize(raw = fixture) {
  const data = structuredClone(raw);
  for (const history of data.lineHistories) history.lineHistoryHash = await computeLineHistoryHash(history);
  for (const reference of data.zoneRegistry.lineHistoryRefs) {
    const history = data.lineHistories.find((row) => row.mainLineKey === reference.mainLineKey);
    reference.lineHistoryHash = history?.lineHistoryHash || reference.lineHistoryHash;
  }
  data.zoneRegistry.zoneRegistryHash = await computeZoneRegistryHash(data.zoneRegistry);
  const pathsByMainLine = Object.fromEntries(data.zoneRegistry.lineHistoryRefs.map((row) => [row.mainLineKey, row.path]));
  data.manifest = await buildRegistrySnapshotManifest({
    zoneRegistry: data.zoneRegistry,
    lineHistories: data.lineHistories,
    pathsByMainLine,
  });
  return data;
}

async function materializeMutation(mutate) {
  const raw = structuredClone(fixture);
  mutate(raw);
  return materialize(raw);
}

function node(data, historyNodeId) {
  return data.lineHistories.flatMap((row) => row.historyNodes).find((row) => row.historyNodeId === historyNodeId);
}

function codes(validation) {
  const result = [];
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (value.code) result.push(value.code);
    Object.values(value).forEach(walk);
  };
  walk(validation);
  return result;
}

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
}

function retirementOperation(historyNodeId) {
  return {
    operationId: `RETIRE-${historyNodeId}`,
    type: 'RETIRE_NODE',
    historyNodeId,
    evidence: { authority: 'FULL_LINE_REVIEW', revisionId: 'REV-003', reason: 'Removed from authoritative revision' },
  };
}

function reactivationOperation(historyNodeId) {
  return {
    operationId: `REACTIVATE-${historyNodeId}`,
    type: 'REACTIVATE_NODE',
    historyNodeId,
    evidence: { authority: 'APPROVED_REVIEW', revisionId: 'REV-003', reason: 'Same historical identity returned' },
  };
}

async function buildPatch(base, proposed, operations, coverage = {
  scope: 'FULL_LINE', authoritativeForRetirement: true, mainLineKeys: ['/LINE-A'],
}) {
  return buildTopoNodeRegistryPatch({
    baseRegistryCommit: '69dd834af5bbe5d820abd590dfd70c0fbadbf474',
    baseZoneRegistry: base.zoneRegistry,
    baseLineHistories: base.lineHistories,
    baseManifest: base.manifest,
    proposedZoneRegistry: proposed.zoneRegistry,
    proposedLineHistories: proposed.lineHistories,
    proposedManifest: proposed.manifest,
    currentRegistrySnapshotHash: base.manifest.registrySnapshotHash,
    coverage,
    operations,
    preconditions: [{ type: 'SNAPSHOT_EQUALS', registrySnapshotHash: base.manifest.registrySnapshotHash }],
    evaluatedAt,
    sourceHash: 'sha256:source',
    configHash: 'sha256:config',
    nodePlanHash: 'sha256:node-plan',
  });
}

test('implements exact registry schema names and readable Draft 2020-12 documents', () => {
  const files = [
    ['PsiNodeZoneRegistry.v1.schema.json', 'PsiNodeZoneRegistry.v1'],
    ['PsiNodeLineHistory.v1.schema.json', 'PsiNodeLineHistory.v1'],
    ['RegistrySnapshotManifest.v1.schema.json', 'RegistrySnapshotManifest.v1'],
  ];
  for (const [file, title] of files) {
    const schema = JSON.parse(readFileSync(new URL(`../node-history/schemas/${file}`, import.meta.url), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.title, title);
    assert.equal(schema.type, 'object');
    assert.equal(schema.properties.schema.const, title);
  }
});

test('accepts an empty bootstrap registry and a valid non-contiguous zone registry', async () => {
  const bootstrap = structuredClone(fixture.zoneRegistry);
  bootstrap.leases = [];
  bootstrap.lineHistoryRefs = [];
  bootstrap.coordinateRegistrationRefs = [];
  bootstrap.zoneRegistryHash = await computeZoneRegistryHash(bootstrap);
  const bootstrapManifest = await buildRegistrySnapshotManifest({ zoneRegistry: bootstrap, lineHistories: [] });
  assert.deepEqual(await validateRegistrySnapshot({
    zoneRegistry: bootstrap, lineHistories: [], manifest: bootstrapManifest,
  }), PASS);

  const data = await materialize();
  assert.deepEqual(await validateRegistrySnapshot(data), PASS);
  assert.equal(data.zoneRegistry.leases[0].ranges.length, 2);
  assert.match(data.zoneRegistry.zoneRegistryHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(data.manifest.registrySnapshotHash, /^sha256:[a-f0-9]{64}$/);
});

test('snapshot hashing is reproducible across object-key, file and semantic-array order', async () => {
  const base = await materialize();
  const reorderedRaw = reverseKeys(structuredClone(fixture));
  reorderedRaw.lineHistories.reverse();
  reorderedRaw.zoneRegistry.lineHistoryRefs.reverse();
  reorderedRaw.zoneRegistry.leases.reverse();
  for (const lease of reorderedRaw.zoneRegistry.leases) lease.ranges.reverse();
  for (const history of reorderedRaw.lineHistories) {
    history.historyNodes.reverse();
    for (const historyNode of history.historyNodes) {
      historyNode.sourceAliases.reverse();
      historyNode.identityEvidence.reverse();
    }
  }
  const reordered = await materialize(reorderedRaw);
  assert.equal(base.zoneRegistry.zoneRegistryHash, reordered.zoneRegistry.zoneRegistryHash);
  assert.equal(base.manifest.registrySnapshotHash, reordered.manifest.registrySnapshotHash);
  const baseHashes = Object.fromEntries(base.lineHistories.map((row) => [row.mainLineKey, row.lineHistoryHash]));
  const reorderedHashes = Object.fromEntries(reordered.lineHistories.map((row) => [row.mainLineKey, row.lineHistoryHash]));
  assert.deepEqual(baseHashes, reorderedHashes);
});

test('audit metadata is excluded while semantic registry changes alter hashes', async () => {
  const base = await materialize();
  const auditOnly = await materializeMutation((raw) => {
    raw.zoneRegistry.audit.evaluatedAt = '2099-01-01T00:00:00Z';
    for (const history of raw.lineHistories) history.audit.evaluatedAt = '2099-01-01T00:00:00Z';
  });
  assert.equal(base.zoneRegistry.zoneRegistryHash, auditOnly.zoneRegistry.zoneRegistryHash);
  assert.equal(base.manifest.registrySnapshotHash, auditOnly.manifest.registrySnapshotHash);
  const semantic = await materializeMutation((raw) => {
    raw.zoneRegistry.leases[0].lastObservedRevision = 'REV-099';
  });
  assert.notEqual(base.zoneRegistry.zoneRegistryHash, semantic.zoneRegistry.zoneRegistryHash);
  assert.notEqual(base.manifest.registrySnapshotHash, semantic.manifest.registrySnapshotHash);
});

test('builds immutable retirement and same-identity reactivation patch bundles', async () => {
  const base = await materialize();
  const retired = await materializeMutation((raw) => {
    const target = raw.lineHistories[0].historyNodes.find((row) => row.historyNodeId === 'HN-A-100');
    target.lifecycleStatus = 'RETIRED';
    target.lastObservedRevision = 'REV-003';
    target.retirementEvidence = retirementOperation('HN-A-100').evidence;
  });
  const retirementPatch = await buildPatch(base, retired, [retirementOperation('HN-A-100')]);
  assert.equal(retirementPatch.validation.status, 'PASS');
  assert.equal(retirementPatch.proposedRegistrySnapshotHash, retired.manifest.registrySnapshotHash);
  assert.equal(Object.isFrozen(retirementPatch), true);
  assert.equal(Object.isFrozen(retirementPatch.operations), true);
  assert.deepEqual(await verifyTopoNodeRegistryPatch({
    patch: retirementPatch,
    baseZoneRegistry: base.zoneRegistry,
    baseLineHistories: base.lineHistories,
    baseManifest: base.manifest,
    proposedZoneRegistry: retired.zoneRegistry,
    proposedLineHistories: retired.lineHistories,
    proposedManifest: retired.manifest,
    currentRegistrySnapshotHash: base.manifest.registrySnapshotHash,
  }), PASS);

  const reactivated = await materializeMutation((raw) => {
    const target = raw.lineHistories[0].historyNodes.find((row) => row.historyNodeId === 'HN-A-110');
    target.lifecycleStatus = 'REACTIVATED';
    target.lastObservedRevision = 'REV-003';
    target.reactivationEvidence = reactivationOperation('HN-A-110').evidence;
  });
  const reactivationPatch = await buildPatch(base, reactivated, [reactivationOperation('HN-A-110')]);
  assert.equal(reactivationPatch.validation.status, 'PASS');
  assert.equal(node(reactivated, 'HN-A-110').engineeringNodeNumber, 110);
});

test('blocks overlapping leases, duplicate active zone numbers and active nodes outside leases', async () => {
  const overlap = await materializeMutation((raw) => {
    raw.zoneRegistry.leases[1].ranges[0].start = 180;
  });
  assert.ok(codes(await validateRegistrySnapshot(overlap)).includes('OVERLAPPING_RANGE_LEASE'));

  const duplicate = await materializeMutation((raw) => {
    const target = raw.lineHistories[0].historyNodes.find((row) => row.historyNodeId === 'HN-A-300');
    target.engineeringNodeNumber = 100;
    target.immutableFacts.engineeringNodeNumber = 100;
  });
  assert.ok(codes(await validateRegistrySnapshot(duplicate)).includes('DUPLICATE_ACTIVE_ZONE_NODE_NUMBER'));

  const outside = await materializeMutation((raw) => {
    const target = raw.lineHistories[1].historyNodes[0];
    target.engineeringNodeNumber = 600;
    target.immutableFacts.engineeringNodeNumber = 600;
  });
  assert.ok(codes(await validateRegistrySnapshot(outside)).includes('ACTIVE_NODE_OUTSIDE_OWNER_LEASE'));
});

test('blocks duplicate identities, unsupported versions and noncanonical main-line keys', async () => {
  const duplicateId = await materializeMutation((raw) => {
    const target = raw.lineHistories[1].historyNodes[0];
    target.historyNodeId = 'HN-A-100';
    target.immutableFacts.historyNodeId = 'HN-A-100';
  });
  assert.ok(codes(await validateRegistrySnapshot(duplicateId)).includes('DUPLICATE_HISTORY_IDENTITY'));

  const unsupported = await materializeMutation((raw) => {
    raw.zoneRegistry.registryVersion = '2.0.0';
    for (const history of raw.lineHistories) history.registryVersion = '2.0.0';
  });
  assert.ok(codes(await validateRegistrySnapshot(unsupported)).includes('UNSUPPORTED_REGISTRY_VERSION'));

  const noncanonical = await materializeMutation((raw) => {
    raw.zoneRegistry.leases[0].mainLineKey = '/line-a';
    raw.zoneRegistry.lineHistoryRefs[0].mainLineKey = '/line-a';
    raw.lineHistories[0].mainLineKey = '/line-a';
    for (const historyNode of raw.lineHistories[0].historyNodes) historyNode.immutableFacts.mainLineKey = '/line-a';
  });
  assert.ok(codes(await validateRegistrySnapshot(noncanonical)).includes('MAIN_LINE_KEY_NONCANONICAL'));
});

test('blocks retired-number reassignment, invalid transitions and changed immutable facts', async () => {
  const proposed = structuredClone(fixture.lineHistories);
  const newNode = structuredClone(proposed[1].historyNodes[0]);
  newNode.historyNodeId = 'HN-B-NEW';
  newNode.engineeringNodeNumber = 110;
  newNode.immutableFacts = {
    historyNodeId: 'HN-B-NEW', engineeringNodeNumber: 110,
    mainLineKey: '/LINE-B', firstObservedRevision: 'REV-003',
  };
  newNode.firstObservedRevision = 'REV-003';
  proposed[1].historyNodes.push(newNode);
  const reassigned = validateLifecycleChanges({
    baseLineHistories: fixture.lineHistories,
    proposedLineHistories: proposed,
    operations: [{ operationId: 'ADD-NEW', type: 'ADD_NODE', historyNodeId: 'HN-B-NEW' }],
  });
  assert.ok(codes(reassigned).includes('RETIRED_NUMBER_REASSIGNED'));

  const invalidTransition = structuredClone(fixture.lineHistories);
  invalidTransition[0].historyNodes[0].lifecycleStatus = 'REACTIVATED';
  invalidTransition[0].historyNodes[0].reactivationEvidence = reactivationOperation('HN-A-100').evidence;
  assert.ok(codes(validateLifecycleChanges({
    baseLineHistories: fixture.lineHistories,
    proposedLineHistories: invalidTransition,
    operations: [reactivationOperation('HN-A-100')],
  })).includes('INVALID_LIFECYCLE_TRANSITION'));

  const changedFacts = structuredClone(fixture.lineHistories);
  changedFacts[0].historyNodes[0].immutableFacts.firstObservedRevision = 'REV-999';
  assert.ok(codes(validateLifecycleChanges({
    baseLineHistories: fixture.lineHistories,
    proposedLineHistories: changedFacts,
    operations: [],
  })).includes('IMMUTABLE_HISTORICAL_FACT_CHANGED'));
});

test('blocks stale bases, omitted line histories and partial-run retirement proposals', async () => {
  const base = await materialize();
  const proposed = await materializeMutation((raw) => {
    const target = raw.lineHistories[0].historyNodes[0];
    target.lifecycleStatus = 'RETIRED';
    target.lastObservedRevision = 'REV-003';
    target.retirementEvidence = retirementOperation('HN-A-100').evidence;
  });
  const stale = await buildTopoNodeRegistryPatch({
    baseRegistryCommit: '69dd834af5bbe5d820abd590dfd70c0fbadbf474',
    baseZoneRegistry: base.zoneRegistry,
    baseLineHistories: base.lineHistories,
    baseManifest: base.manifest,
    proposedZoneRegistry: proposed.zoneRegistry,
    proposedLineHistories: proposed.lineHistories,
    proposedManifest: proposed.manifest,
    currentRegistrySnapshotHash: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    coverage: { scope: 'FULL_LINE', authoritativeForRetirement: true, mainLineKeys: ['/LINE-A'] },
    operations: [retirementOperation('HN-A-100')],
    evaluatedAt,
  });
  assert.ok(codes(stale.validation).includes('PATCH_BASE_SNAPSHOT_MISMATCH'));

  const omitted = structuredClone(base.manifest);
  omitted.lineHistories = omitted.lineHistories.filter((row) => row.mainLineKey !== '/LINE-B');
  omitted.registrySnapshotHash = await computeRegistrySnapshotHash(omitted);
  assert.ok(codes(await validateRegistrySnapshot({
    zoneRegistry: base.zoneRegistry, lineHistories: base.lineHistories, manifest: omitted,
  })).includes('SNAPSHOT_LINE_HISTORY_OMITTED'));

  await assert.rejects(() => buildPatch(base, proposed, [retirementOperation('HN-A-100')], {
    scope: 'PARTIAL_LINE', authoritativeForRetirement: false, mainLineKeys: ['/LINE-A'],
  }), /Partial or non-authoritative runs cannot retire historical nodes/);
});

test('validators and hash builders do not mutate source artifacts', async () => {
  const data = await materialize();
  const before = structuredClone(data);
  await validateRegistrySnapshot(data);
  await computeZoneRegistryHash(data.zoneRegistry);
  for (const history of data.lineHistories) await computeLineHistoryHash(history);
  await computeRegistrySnapshotHash(data.manifest);
  assert.deepEqual(data, before);
});

test('static registry authority scan finds no allocation, matching or direct-write implementation', () => {
  const files = [
    '../node-history/registry/registry-contracts.js',
    '../node-history/registry/registry-hash.js',
    '../node-history/registry/registry-validator.js',
    '../node-history/registry/registry-patch.js',
  ];
  const forbidden = [
    /findFree/i, /nextAvailable/i, /chooseFree/i, /allocateNode/i,
    /spatialCandidate/i, /matchCandidate/i, /writeFile\s*\(/,
    /appendFile\s*\(/, /createWriteStream\s*\(/,
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
});
