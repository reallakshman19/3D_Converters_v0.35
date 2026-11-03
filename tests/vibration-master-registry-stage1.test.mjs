import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVibrationMasterRegistry,
  inspectVibrationMasterCandidate,
  resolveVibrationMaster,
  transitionVibrationMasterPublication,
} from '../converters/vibration/masters/index.js';

function master(overrides = {}) {
  return {
    schema: 'VibrationMaster.v1', masterId: 'TEST.MASTER', methodId: 'TEST.METHOD',
    edition: 'test', revision: 'R1', authorityClass: 'EI_METHOD_MASTER',
    source: {
      repository: 'owner/repo', commit: 'a'.repeat(40), path: 'source.md',
      gitBlobSha1: 'b'.repeat(40), sizeBytes: 10,
      locator: { sourceType: 'TABLE', identifier: 'T1', printedPage: 1, pdfPage: 2 },
    },
    dataSchema: 'TestTable.v1', data: [{ key: 'A', value: 1 }],
    publicationState: 'CANDIDATE', ...overrides,
  };
}

test('candidate is hash-sealed but cannot resolve through ACTIVE runtime path', async () => {
  const registry = await buildVibrationMasterRegistry([master()]);
  assert.match(registry.records[0].contentHash, /^sha256:[0-9a-f]{64}$/u);
  assert.throws(() => resolveVibrationMaster(registry, 'TEST.MASTER'), /VIBRATION_MASTER_NOT_ACTIVE/u);
  const inspected = await inspectVibrationMasterCandidate(registry, 'TEST.MASTER');
  assert.equal(inspected.status, 'CANDIDATE_ONLY');
  assert.equal(inspected.authority.engineeringAuthority, 'NONE');
  assert.equal(inspected.provenance.authorityClass, 'EI_METHOD_MASTER');
});

test('candidate activation is explicit and preserves engineering content hash', async () => {
  const candidate = await buildVibrationMasterRegistry([master()]);
  const hash = candidate.records[0].contentHash;
  const active = await transitionVibrationMasterPublication(candidate, 'TEST.MASTER', 'R1', 'ACTIVE');
  assert.equal(active.records[0].contentHash, hash);
  const resolved = resolveVibrationMaster(active, 'TEST.MASTER');
  assert.equal(resolved.master.publicationState, 'ACTIVE');
  assert.equal(resolved.provenance.masterContentHash, hash);
});

test('multiple active revisions and retired reactivation fail closed', async () => {
  await assert.rejects(() => buildVibrationMasterRegistry([
    master({ publicationState: 'ACTIVE' }),
    master({ revision: 'R2', publicationState: 'ACTIVE' }),
  ]), /VIBRATION_MASTER_ACTIVE_CONFLICT/u);
  const retired = await buildVibrationMasterRegistry([master({ publicationState: 'RETIRED' })]);
  await assert.rejects(
    () => transitionVibrationMasterPublication(retired, 'TEST.MASTER', 'R1', 'ACTIVE'),
    /VIBRATION_MASTER_PUBLICATION_TRANSITION_INVALID/u,
  );
});

test('authority class and source identity participate in content hash', async () => {
  const base = await buildVibrationMasterRegistry([master()]);
  const ref = base.records[0].contentHash;
  const changedClass = await buildVibrationMasterRegistry([master({ authorityClass: 'EI_REFERENCE_LOOKUP' })]);
  const changedSource = await buildVibrationMasterRegistry([master({
    source: { ...master().source, gitBlobSha1: 'c'.repeat(40) },
  })]);
  assert.notEqual(changedClass.records[0].contentHash, ref);
  assert.notEqual(changedSource.records[0].contentHash, ref);
});