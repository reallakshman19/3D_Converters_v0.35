import assert from 'node:assert/strict';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { prepareRegistryPublication } from '../node-history/operations/registry-publication/registry-publication.js';
import { canonicalBytes } from '../node-history/operations/registry-operations-common.js';
import { makeOperationsCase } from './fixtures/node-history/operations/operations-fixture.mjs';

const clone = structuredClone;

test('materializes one exact complete candidate and emits a publishable package', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const before = await currentBytes(fixture);
  const result = await prepareRegistryPublication(fixture.input);
  assert.equal(result.status, 'PASS', JSON.stringify(result.validation));
  assert.equal(result.publishablePackage.schema, 'TopoRegistryPublicationPackage.v1');
  assert.equal(result.materializedSnapshotHash, fixture.artifacts.proposed.manifest.registrySnapshotHash);
  assert.equal(result.reReadSnapshotHash, result.materializedSnapshotHash);
  assert.equal(result.rollbackProof.status, 'PASS');
  assert.equal(result.rollbackProof.restoredSnapshotHash, fixture.input.expectedCurrentSnapshotHash);
  assert.equal(result.liveRegistryMutated, false);
  console.log(`TE015_PROOF ${JSON.stringify({
    currentSnapshotHash: fixture.input.expectedCurrentSnapshotHash,
    patchHash: fixture.input.approvedPatch.proposedRegistryHash,
    proposedSnapshotHash: fixture.input.approvedPatch.proposedRegistrySnapshotHash,
    materializedSnapshotHash: result.materializedSnapshotHash,
    publicationPackageHash: result.publicationPackageHash,
    rollbackRestoredSnapshotHash: result.rollbackProof.restoredSnapshotHash,
  })}`);
  assert.deepEqual(await currentBytes(fixture), before);
  for (const target of fixture.input.targetManifest.files) {
    const actual = await readFile(path.join(result.acceptedMaterializedRoot, target.path));
    const expected = artifactFor(target, fixture.artifacts.proposed);
    assert.deepEqual(actual, canonicalBytes(expected));
  }
});

test('repeated semantic runs produce byte-identical packages and package hashes', async (t) => {
  const left = await makeOperationsCase(), right = await makeOperationsCase();
  t.after(left.cleanup); t.after(right.cleanup);
  right.input.evaluatedAt = '2030-01-01T00:00:00Z';
  const [first, second] = await Promise.all([
    prepareRegistryPublication(left.input), prepareRegistryPublication(right.input),
  ]);
  assert.equal(first.status, 'PASS');
  assert.equal(second.status, 'PASS');
  assert.equal(first.publicationPackageHash, second.publicationPackageHash);
  assert.deepEqual(first.publishablePackage, second.publishablePackage);
});

test('independently read stale or incomplete current registry blocks publication', async (t) => {
  const stale = await makeOperationsCase();
  t.after(stale.cleanup);
  stale.input.expectedCurrentSnapshotHash = fakeHash('stale');
  const staleResult = await prepareRegistryPublication(stale.input);
  assertCode(staleResult, 'STALE_CURRENT_REGISTRY_SNAPSHOT');
  assertBlocked(staleResult);

  const missing = await makeOperationsCase();
  t.after(missing.cleanup);
  const line = missing.input.targetManifest.files.find((row) => row.mainLineKey === '/LINE-B');
  await rm(path.join(missing.input.currentRegistryRoot, line.path));
  const missingResult = await prepareRegistryPublication(missing.input);
  assertCode(missingResult, 'TARGET_FILE_MISSING');
  assertBlocked(missingResult);
});

test('stale base commit and proposed snapshot drift fail closed', async (t) => {
  const commit = await makeOperationsCase();
  t.after(commit.cleanup);
  commit.input.expectedBaseCommit = 'a'.repeat(40);
  const commitResult = await prepareRegistryPublication(commit.input);
  assertCode(commitResult, 'STALE_BASE_COMMIT');
  assertBlocked(commitResult);

  const proposed = await makeOperationsCase();
  t.after(proposed.cleanup);
  proposed.input.approvedPatch = clone(proposed.input.approvedPatch);
  proposed.input.approvedPatch.proposedRegistrySnapshotHash = fakeHash('wrong');
  const proposedResult = await prepareRegistryPublication(proposed.input);
  assert.ok(codes(proposedResult).some((code) => [
    'PATCH_BOOTSTRAP_BUNDLE_MISMATCH', 'PROPOSED_REGISTRY_HASH_MISMATCH', 'PATCH_PROPOSED_SNAPSHOT_MISMATCH',
  ].includes(code)));
  assertBlocked(proposedResult);
});

test('input artifacts remain unchanged and result is deeply frozen', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const before = clone({
    approvedPatch: fixture.input.approvedPatch,
    bootstrapResult: fixture.input.bootstrapResult,
    targetManifest: fixture.input.targetManifest,
  });
  const result = await prepareRegistryPublication(fixture.input);
  assert.deepEqual({
    approvedPatch: fixture.input.approvedPatch,
    bootstrapResult: fixture.input.bootstrapResult,
    targetManifest: fixture.input.targetManifest,
  }, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.publishablePackage.recoveryManifest.files[0]), true);
});

async function currentBytes(fixture) {
  const output = {};
  for (const target of fixture.input.targetManifest.files) {
    output[target.path] = (await readFile(path.join(fixture.input.currentRegistryRoot, target.path))).toString('base64');
  }
  return output;
}

function artifactFor(target, snapshot) {
  if (target.role === 'ZONE_REGISTRY') return snapshot.zoneRegistry;
  if (target.role === 'REGISTRY_MANIFEST') return snapshot.manifest;
  return snapshot.lineHistories.find((row) => row.mainLineKey === target.mainLineKey);
}

function codes(result) { return result.validation.blockers.map((row) => row.code); }
function assertCode(result, code) { assert.ok(codes(result).includes(code), `${code}: ${codes(result).join(', ')}`); }
function assertBlocked(result) { assert.equal(result.status, 'BLOCKED'); assert.equal(result.publishablePackage, null); assert.equal(result.acceptedMaterializedRoot, null); }
function fakeHash(label) { return `sha256:${label.padEnd(64, '0').slice(0, 64).replace(/[^a-f0-9]/g, 'a')}`; }
