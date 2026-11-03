import assert from 'node:assert/strict';
import {
  mkdir, readFile, rename, symlink, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { computeProposedRegistryHash } from '../node-history/registry/registry-hash.js';
import { prepareRegistryPublication } from '../node-history/operations/registry-publication/registry-publication.js';
import { canonicalBytes, hashCanonical } from '../node-history/operations/registry-operations-common.js';
import {
  makeOperationsCase,
  wrapFileSystem,
} from './fixtures/node-history/operations/operations-fixture.mjs';

const clone = structuredClone;

test('extra current files block without accepted output', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const unexpected = path.join(fixture.input.currentRegistryRoot, fixture.input.targetManifest.registryRootPath, 'unexpected.json');
  await writeFile(unexpected, '{}\n');
  const result = await prepareRegistryPublication(fixture.input);
  assertCode(result, 'UNEXPECTED_EXISTING_FILE');
  await assertNoAcceptedOutput(result, fixture);
});

test('pre-existing candidate and rollback roots remain byte-identical', async (t) => {
  for (const field of ['temporaryRoot', 'rollbackProofRoot']) {
    const fixture = await makeOperationsCase();
    t.after(fixture.cleanup);
    const root = fixture.input.targetManifest[field];
    await mkdir(root);
    const sentinel = path.join(root, 'sentinel.txt');
    await writeFile(sentinel, `${field}-sentinel`);
    const result = await prepareRegistryPublication(fixture.input);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(await readFile(sentinel, 'utf8'), `${field}-sentinel`);
    assertCode(result, field === 'temporaryRoot' ? 'MATERIALIZATION_ROOT_ALREADY_EXISTS' : 'ROLLBACK_ROOT_ALREADY_EXISTS');
  }
});

test('early blockers never delete caller-owned roots', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const sentinels = [];
  for (const field of ['temporaryRoot', 'rollbackProofRoot']) {
    const root = fixture.input.targetManifest[field];
    await mkdir(root);
    const sentinel = path.join(root, `${field}.txt`);
    await writeFile(sentinel, field);
    sentinels.push([sentinel, field]);
  }
  fixture.input.expectedBaseCommit = 'invalid';
  const result = await prepareRegistryPublication(fixture.input);
  assertCode(result, 'REGISTRY_PUBLICATION_COMMIT_INVALID');
  for (const [sentinel, expected] of sentinels) assert.equal(await readFile(sentinel, 'utf8'), expected);
});

test('duplicate, case-colliding, traversal and absolute target paths are rejected', async (t) => {
  const duplicate = await makeOperationsCase();
  t.after(duplicate.cleanup);
  duplicate.input.targetManifest.files.push(clone(duplicate.input.targetManifest.files[0]));
  assertCode(await prepareRegistryPublication(duplicate.input), 'DUPLICATE_TARGET_PATH');

  const collision = await makeOperationsCase();
  t.after(collision.cleanup);
  collision.input.targetManifest.files[1].path = collision.input.targetManifest.files[1].path.toLowerCase();
  collision.input.targetManifest.files.push({
    ...collision.input.targetManifest.files[1],
    path: collision.input.targetManifest.files[1].path.toUpperCase(),
    mainLineKey: '/LINE-X',
  });
  assertCode(await prepareRegistryPublication(collision.input), 'TARGET_PATH_CASE_COLLISION');

  for (const badPath of ['../escape.json', '/absolute/escape.json']) {
    const unsafe = await makeOperationsCase();
    t.after(unsafe.cleanup);
    unsafe.input.targetManifest.files[0].path = badPath;
    assertCode(await prepareRegistryPublication(unsafe.input), 'TARGET_PATH_UNSAFE');
  }
});

test('candidate and rollback roots cannot overlap in either direction', async (t) => {
  for (const direction of ['candidate-parent', 'rollback-parent']) {
    const fixture = await makeOperationsCase();
    t.after(fixture.cleanup);
    const temporary = fixture.input.targetManifest.temporaryRoot;
    const rollback = fixture.input.targetManifest.rollbackProofRoot;
    if (direction === 'candidate-parent') fixture.input.targetManifest.rollbackProofRoot = path.join(temporary, 'rollback');
    else fixture.input.targetManifest.temporaryRoot = path.join(rollback, 'candidate');
    assertCode(await prepareRegistryPublication(fixture.input), 'TEMPORARY_ROOT_COLLISION');
  }
});

test('symlinked custody roots and ancestors fail closed', async (t) => {
  if (process.platform === 'win32') { t.skip('symlink custody proof runs on POSIX'); return; }
  const cases = [symlinkCurrentRoot, symlinkRegistrySubtree, symlinkCandidateParent, symlinkRollbackParent];
  for (const configure of cases) {
    const fixture = await makeOperationsCase();
    t.after(fixture.cleanup);
    await configure(fixture);
    const result = await prepareRegistryPublication(fixture.input);
    assertCode(result, 'SYMBOLIC_LINK_PROHIBITED');
    assert.equal(result.publishablePackage, null);
  }
});

test('simulated write failure removes only the invocation-owned candidate root', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const base = fixture.fileSystem;
  const candidateRoot = fixture.input.targetManifest.temporaryRoot;
  let candidateWrites = 0;
  fixture.input.fileSystem = wrapFileSystem(base, {
    writeFileExclusive: async (filePath, bytes) => {
      if (String(filePath).startsWith(candidateRoot) && ++candidateWrites === 2) {
        const error = new Error('simulated write failure');
        error.code = 'SIMULATED_WRITE_FAILURE';
        throw error;
      }
      return base.writeFileExclusive(filePath, bytes);
    },
  });
  const result = await prepareRegistryPublication(fixture.input);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(await base.exists(candidateRoot), false);
  assert.equal(result.publishablePackage, null);
});

test('cleanup requires the exact canonical ownership claim', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const root = fixture.input.targetManifest.temporaryRoot;
  await mkdir(root);
  await assert.rejects(
    fixture.fileSystem.removeTree(root),
    (error) => error?.code === 'CUSTODY_OWNERSHIP_CLAIM_REQUIRED',
  );
  assert.equal(await fixture.fileSystem.exists(root), true);
  const canonical = await fixture.fileSystem.resolveCustodyPath(root, { mustExist: true, expectedType: 'directory' });
  await assert.rejects(
    fixture.fileSystem.removeTree(root, `${canonical}-wrong`),
    (error) => error?.code === 'CUSTODY_ROOT_CHANGED',
  );
  assert.equal(await fixture.fileSystem.exists(root), true);
});

test('simulated candidate re-read corruption cannot become publishable', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const base = fixture.fileSystem;
  const candidateRoot = fixture.input.targetManifest.temporaryRoot;
  fixture.input.fileSystem = wrapFileSystem(base, {
    readFile: async (filePath) => {
      const bytes = await base.readFile(filePath);
      return String(filePath).startsWith(candidateRoot) && String(filePath).endsWith('LINE-A.json')
        ? Buffer.from(`${bytes.toString('utf8')} `) : bytes;
    },
  });
  const result = await prepareRegistryPublication(fixture.input);
  assertCode(result, 'MATERIALIZED_FILE_HASH_MISMATCH');
  assert.equal(await base.exists(candidateRoot), false);
});

test('live-registry mutation and failed final proof are reported truthfully', async (t) => {
  const mutated = await makeOperationsCase();
  t.after(mutated.cleanup);
  injectFinalCurrentRead(mutated, async () => mutateCurrentAudit(mutated));
  const mutationResult = await prepareRegistryPublication(mutated.input);
  assertCode(mutationResult, 'LIVE_REGISTRY_MUTATED');
  assert.equal(mutationResult.liveRegistryMutated, true);

  const unknown = await makeOperationsCase();
  t.after(unknown.cleanup);
  injectFinalCurrentRead(unknown, async () => {
    const error = new Error('final read unavailable');
    error.code = 'SIMULATED_FINAL_READ_FAILURE';
    throw error;
  });
  const unknownResult = await prepareRegistryPublication(unknown.input);
  assertCode(unknownResult, 'LIVE_REGISTRY_REREAD_FAILED');
  assert.equal(unknownResult.liveRegistryMutated, null);
});

test('partial authority cannot remove or retire registry history', async (t) => {
  const fixture = await makeOperationsCase();
  t.after(fixture.cleanup);
  const patch = clone(fixture.input.approvedPatch);
  patch.coverage = { scope: 'PARTIAL_LINE', authoritativeForRetirement: false };
  patch.operations.push({
    operationId: 'TE015:RETIRE_NODE:HN-A-100', type: 'RETIRE_NODE',
    historyNodeId: 'HN-A-100', mainLineKey: '/LINE-A',
    evidence: { authority: 'BOARD', revisionId: 'REV-003', reason: 'not-authoritative' },
  });
  patch.proposedRegistryHash = await computeProposedRegistryHash(patch);
  fixture.input.approvedPatch = patch;
  fixture.input.bootstrapResult = rehashBootstrap({ ...clone(fixture.input.bootstrapResult), registryPatch: patch });
  assertCode(await prepareRegistryPublication(fixture.input), 'PARTIAL_AUTHORITY_HISTORY_REMOVAL_PROHIBITED');
});

test('production files contain no GitHub, VCS, conversion, clock or random write authority', async () => {
  const files = [
    'registry-operations-common.js', 'registry-publication/registry-filesystem.js',
    'registry-publication/registry-snapshot-io.js', 'registry-publication/registry-publication-authority.js',
    'registry-publication/registry-publication-package.js', 'registry-publication/registry-publication.js',
    'registry-recovery/registry-recovery.js',
  ];
  const forbidden = [
    /api\.github/i, /@octokit/i, /\bgit\s+(?:commit|push|merge)\b/i,
    /matchExactHistoricalNodes\s*\(/, /allocateZoneEngineeringNodes\s*\(/,
    /serialize.*xml\s*\(/i, /Date\.now\s*\(/, /Math\.random\s*\(/,
  ];
  for (const relative of files) {
    const source = await readFile(new URL(`../node-history/operations/${relative}`, import.meta.url), 'utf8');
    assert.ok(source.split('\n').length <= 300, `${relative} exceeds 300 lines`);
    forbidden.forEach((pattern) => assert.doesNotMatch(source, pattern, `${relative}: ${pattern}`));
  }
});

async function symlinkCurrentRoot(fixture) {
  const link = path.join(fixture.parent, 'current-link');
  await symlink(fixture.input.currentRegistryRoot, link, 'dir');
  fixture.input.currentRegistryRoot = link;
}

async function symlinkRegistrySubtree(fixture) {
  const original = path.join(fixture.input.currentRegistryRoot, fixture.input.targetManifest.registryRootPath);
  const real = path.join(fixture.parent, 'registry-subtree-real');
  await rename(original, real);
  await symlink(real, original, 'dir');
}

async function symlinkCandidateParent(fixture) {
  fixture.input.targetManifest.temporaryRoot = await symlinkedChild(fixture, 'candidate-parent', 'candidate');
}

async function symlinkRollbackParent(fixture) {
  fixture.input.targetManifest.rollbackProofRoot = await symlinkedChild(fixture, 'rollback-parent', 'rollback');
}

async function symlinkedChild(fixture, name, child) {
  const real = path.join(fixture.parent, `${name}-real`);
  const link = path.join(fixture.parent, `${name}-link`);
  await mkdir(real);
  await symlink(real, link, 'dir');
  return path.join(link, child);
}

function injectFinalCurrentRead(fixture, action) {
  const base = fixture.fileSystem;
  const registryRoot = path.join(fixture.input.currentRegistryRoot, fixture.input.targetManifest.registryRootPath);
  let currentReads = 0;
  fixture.input.fileSystem = wrapFileSystem(base, {
    listFiles: async (directory) => {
      if (path.resolve(directory) === path.resolve(registryRoot) && ++currentReads === 2) await action();
      return base.listFiles(directory);
    },
  });
}

async function mutateCurrentAudit(fixture) {
  const target = fixture.input.targetManifest.files.find((row) => row.role === 'ZONE_REGISTRY');
  const filePath = path.join(fixture.input.currentRegistryRoot, target.path);
  const value = JSON.parse(await readFile(filePath, 'utf8'));
  value.audit = { evaluatedAt: '2026-07-21T09:00:00Z' };
  await writeFile(filePath, canonicalBytes(value));
}

function rehashBootstrap(value) {
  const { bootstrapResultHash: _hash, evaluatedAt, ...semantic } = value;
  return { ...semantic, bootstrapResultHash: hashCanonical(semantic), evaluatedAt };
}

async function assertNoAcceptedOutput(result, fixture) {
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.publishablePackage, null);
  assert.equal(result.acceptedMaterializedRoot, null);
  assert.equal(await fixture.fileSystem.exists(fixture.input.targetManifest.temporaryRoot), false);
}

function codes(result) { return result.validation.blockers.map((row) => row.code); }
function assertCode(result, code) { assert.ok(codes(result).includes(code), `${code}: ${codes(result).join(', ')}`); }
