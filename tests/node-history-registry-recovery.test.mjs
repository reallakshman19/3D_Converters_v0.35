import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { prepareRegistryPublication } from '../node-history/operations/registry-publication/registry-publication.js';
import { restoreRegistrySnapshot } from '../node-history/operations/registry-recovery/registry-recovery.js';
import { normalizeTargetManifest } from '../node-history/operations/registry-operations-common.js';
import { makeOperationsCase, wrapFileSystem } from './fixtures/node-history/operations/operations-fixture.mjs';

test('recovery package restores exact before-bytes and original snapshot hash', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const result = await prepareRegistryPublication(fixture.input);
  assert.equal(result.status, 'PASS');
  const restoreRoot = path.join(fixture.parent, 'independent-recovery');
  const targetManifest = normalizeTargetManifest({
    ...fixture.input.targetManifest,
    temporaryRoot: path.join(fixture.parent, 'unused-candidate'),
    rollbackProofRoot: path.join(fixture.parent, 'unused-proof'),
  });
  const proof = await restoreRegistrySnapshot({
    recoveryManifest: result.publishablePackage.recoveryManifest,
    restoreRoot,
    targetManifest,
    fileSystem: fixture.fileSystem,
  });
  assert.equal(proof.status, 'PASS', JSON.stringify(proof.validation));
  assert.equal(proof.restoredSnapshotHash, fixture.input.expectedCurrentSnapshotHash);
  for (const target of fixture.input.targetManifest.files) {
    const original = await readFile(path.join(fixture.input.currentRegistryRoot, target.path));
    const restored = await readFile(path.join(restoreRoot, target.path));
    assert.deepEqual(restored, original, target.path);
  }
});

test('tampered recovery manifest is rejected before any accepted restoration', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const result = await prepareRegistryPublication(fixture.input);
  const manifest = structuredClone(result.publishablePackage.recoveryManifest);
  manifest.files[0].bytesBase64 = Buffer.from('corrupt').toString('base64');
  const proof = await restoreRegistrySnapshot({
    recoveryManifest: manifest,
    restoreRoot: path.join(fixture.parent, 'tampered-recovery'),
    targetManifest: normalizeTargetManifest(fixture.input.targetManifest),
    fileSystem: fixture.fileSystem,
  });
  assert.equal(proof.status, 'BLOCKED');
  assert.ok(proof.validation.blockers.some((row) => row.code === 'RECOVERY_MANIFEST_HASH_MISMATCH'));
});

test('simulated rollback corruption blocks the publication package', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const base = fixture.fileSystem;
  const rollbackRoot = fixture.input.targetManifest.rollbackProofRoot;
  fixture.input.fileSystem = wrapFileSystem(base, {
    writeFileExclusive: async (filePath, bytes) => {
      if (String(filePath).startsWith(rollbackRoot) && String(filePath).endsWith('LINE-A.json')) {
        return base.writeFileExclusive(filePath, Buffer.from(`${bytes.toString('utf8')} `));
      }
      return base.writeFileExclusive(filePath, bytes);
    },
  });
  const result = await prepareRegistryPublication(fixture.input);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.validation.blockers.some((row) => row.code === 'ROLLBACK_PROOF_NOT_PASS'));
  assert.equal(result.publishablePackage, null);
  assert.equal(result.acceptedMaterializedRoot, null);
});
