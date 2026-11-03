import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { calculateWorklistId } from '../../tabs/model-converters/converters/fbx/mapping-worklist.js';
import { buildReviewBundle } from '../../tabs/model-converters/converters/fbx/mapping-review-bundle.js';
import { calculateFragmentId } from '../../tabs/model-converters/converters/fbx/mapping-decision-fragment.js';
import { buildBoundedReviewBundle } from '../../tabs/model-converters/converters/fbx/review-execution/bounded-bundle.js';
import { assembleBoundedFragments } from '../../tabs/model-converters/converters/fbx/review-execution/bounded-assembly.js';
import {
  assertAbsentFile, commitDirectoryPublication, prepareDirectoryTarget,
  publishFile, withPrivateWorkspace,
} from '../../tabs/model-converters/converters/fbx/review-execution/atomic-publication.js';
import {
  closeWritable, writeChunk,
} from '../../tabs/model-converters/converters/fbx/review-execution/canonical-spool.js';
import { createSyntheticWorklist } from './review-scale-helpers.mjs';

async function assertAbsent(path) {
  await assert.rejects(access(path), (error) => error.code === 'ENOENT');
}

async function assertNoWorkspace(parent, target) {
  const prefix = `.${basename(target)}.f2s007-`;
  assert.equal((await readdir(parent)).filter((name) => name.startsWith(prefix)).length, 0);
}

async function expectBundleFailure(root, worklist, name, expected) {
  const input = join(root, `${name}.json`);
  const output = join(root, `${name}-bundle`);
  await writeFile(input, canonicalJson(worklist));
  await assert.rejects(
    buildBoundedReviewBundle({
      worklistPath: input, outputDir: output, maxItemsPerShard: 1,
      sortRunItems: 1, inputChunkBytes: 3,
    }),
    expected,
  );
  await assertAbsent(output);
  await assertNoWorkspace(root, output);
}

async function expectRawBundleFailure(root, name, bytes, expected) {
  const input = join(root, `${name}.json`);
  const output = join(root, `${name}-bundle`);
  await writeFile(input, bytes);
  await assert.rejects(buildBoundedReviewBundle({
    worklistPath: input, outputDir: output,
    maxItemsPerShard: 1, sortRunItems: 1, inputChunkBytes: 1,
  }), expected);
  await assertAbsent(output);
  await assertNoWorkspace(root, output);
}

async function assertCancellationCleanup(root) {
  const target = join(root, 'cancelled-output.json');
  await assert.rejects(withPrivateWorkspace(target, async (workspace, checkCancellation) => {
    await writeFile(join(workspace, 'partial'), 'partial');
    process.emit('SIGTERM', 'SIGTERM');
    checkCancellation();
  }), (error) => error.code === 'F2S007_CANCELLED');
  await assertAbsent(target);
  await assertNoWorkspace(root, target);
}

async function assertWriteFailureCleanup(root) {
  try { await access('/dev/full'); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const target = join(root, 'write-failure-output.json');
  await assert.rejects(withPrivateWorkspace(target, async () => {
    const stream = createWriteStream('/dev/full');
    await writeChunk(stream, 'injected write failure');
    await closeWritable(stream);
  }), (error) => error.code === 'ENOSPC');
  await assertAbsent(target);
  await assertNoWorkspace(root, target);
}

async function assertDirectoryPublicationRaceCleanup(root) {
  const target = join(root, 'publication-directory-target');
  await assert.rejects(withPrivateWorkspace(target, async (workspace) => {
    const staged = join(workspace, 'staged');
    await mkdir(staged);
    await writeFile(join(staged, 'manifest.json'), 'mission artifact');
    await mkdir(target);
    await prepareDirectoryTarget(target);
    await mkdir(target);
    await writeFile(join(target, 'sentinel.txt'), 'external sentinel');
    await commitDirectoryPublication(staged, target);
  }), (error) => error.code === 'ENOTEMPTY' || error.code === 'EEXIST');
  assert.equal(await readFile(join(target, 'sentinel.txt'), 'utf8'), 'external sentinel');
  await assertAbsent(join(target, 'manifest.json'));
  assert.deepEqual(await readdir(target), ['sentinel.txt']);
  await assertNoWorkspace(root, target);
  await rm(target, { recursive: true, force: true });
}

async function assertFilePublicationRaceCleanup(root) {
  const target = join(root, 'publication-file-target.json');
  await assert.rejects(withPrivateWorkspace(target, async (workspace) => {
    const staged = join(workspace, 'staged.json');
    await writeFile(staged, 'mission artifact');
    await assertAbsentFile(target);
    await writeFile(target, 'external sentinel');
    await publishFile(staged, target);
  }), (error) => error.code === 'EEXIST');
  assert.equal(await readFile(target, 'utf8'), 'external sentinel');
  await assertNoWorkspace(root, target);
  await rm(target, { force: true });
}

async function sourceFiles(path) {
  const { stat } = await import('node:fs/promises');
  if ((await stat(path)).isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => sourceFiles(join(path, entry.name))))).flat();
}

function namedFunctionLengths(text) {
  const lines = text.split('\n');
  const lengths = [];
  for (let start = 0; start < lines.length; start += 1) {
    if (!/\bfunction\s+\w+\s*\(/.test(lines[start])) continue;
    let depth = 0;
    let opened = false;
    for (let end = start; end < lines.length; end += 1) {
      depth += (lines[end].match(/\{/g) || []).length;
      depth -= (lines[end].match(/\}/g) || []).length;
      opened ||= lines[end].includes('{');
      if (opened && depth === 0) {
        lengths.push({ line: start + 1, length: end - start + 1 });
        break;
      }
    }
  }
  return lengths;
}

function isJavaScript(path) {
  return path.endsWith('.js') || path.endsWith('.mjs');
}

function assertSourceShape(path, text, repositoryRoot) {
  const label = relative(repositoryRoot, path);
  assert.ok(text.split('\n').length <= 300, `${label} exceeds 300 lines`);
  for (const fn of namedFunctionLengths(text)) {
    assert.ok(fn.length <= 40, `${label} function at line ${fn.line} exceeds 40 lines`);
  }
}

async function filesAtRoots(roots) {
  return (await Promise.all(roots.map(sourceFiles))).flat().filter(isJavaScript);
}

async function assertStaticGuards() {
  const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
  const productionRoots = [
    join(repositoryRoot, 'tabs/model-converters/converters/fbx/review-execution'),
    join(repositoryRoot, 'scripts/fbx/review-scale'),
    join(repositoryRoot, 'scripts/fbx/build-mapping-review-bundle.mjs'),
    join(repositoryRoot, 'scripts/fbx/assemble-mapping-decision-fragments.mjs'),
  ];
  const testRoots = [
    join(repositoryRoot, 'tests/fbx/review-scale-helpers.mjs'),
    join(repositoryRoot, 'tests/fbx/test-review-scale-parity.mjs'),
    join(repositoryRoot, 'tests/fbx/test-review-scale-failures.mjs'),
    join(repositoryRoot, 'tests/fbx/test-review-resource-bounds.mjs'),
  ];
  const production = await filesAtRoots(productionRoots);
  const all = [...new Set([...production, ...await filesAtRoots(testRoots)])];
  const prohibited = [
    /localeCompare/, /Intl\.Collator/, /Math\.random/, /Date\.now/,
    /randomUUID/, /\.normalize\(/, /export\s+default\b/, /https?:\/\//,
  ];
  for (const path of all) assertSourceShape(path, await readFile(path, 'utf8'), repositoryRoot);
  for (const path of production) {
    const text = await readFile(path, 'utf8');
    for (const pattern of prohibited) assert.doesNotMatch(text, pattern, `${path} violates ${pattern}`);
  }
}

function exclusionFragment(bundle, shard) {
  return {
    schema: 'FbxMappingDecisionFragment.v1',
    bundleId: bundle.bundleId,
    worklistId: shard.worklistId,
    sourceGraphCanonicalSha256: shard.sourceGraphCanonicalSha256,
    shardId: shard.shardId,
    fragmentId: '0'.repeat(64),
    decisions: shard.workItems.map((item) => ({
      workItemId: item.workItemId,
      disposition: 'exclude-with-reason',
      reason: 'failure proof',
    })),
  };
}

const root = await mkdtemp(join(tmpdir(), 'f2s007-failures-'));
try {
  const corpus = await createSyntheticWorklist(root, 8);
  const family = { worklist: JSON.parse(await readFile(corpus.worklistPath, 'utf8')) };
  const duplicate = structuredClone(family.worklist);
  duplicate.workItems.push(structuredClone(duplicate.workItems[0]));
  duplicate.worklistId = '0'.repeat(64);
  duplicate.worklistId = await calculateWorklistId(duplicate);
  await expectBundleFailure(root, duplicate, 'duplicate', /contains duplicates/);

  const duplicateAndStale = structuredClone(family.worklist);
  duplicateAndStale.workItems.push(structuredClone(duplicateAndStale.workItems[0]));
  duplicateAndStale.worklistId = '0'.repeat(64);
  await expectBundleFailure(root, duplicateAndStale, 'duplicate-and-stale', /contains duplicates/);

  const stale = structuredClone(family.worklist);
  stale.worklistId = '0'.repeat(64);
  await expectBundleFailure(root, stale, 'stale', /worklistId is stale or tampered/);

  const canonical = canonicalJson(family.worklist);
  await expectRawBundleFailure(root, 'malformed', Buffer.from(canonical).subarray(0, Buffer.byteLength(canonical) - 2), /Malformed JSON/);
  await expectRawBundleFailure(root, 'non-json-whitespace', canonical.replace('{\n', '{\u00a0'), /Malformed JSON/);

  const worklistPath = join(root, 'assembly-worklist.json');
  await writeFile(worklistPath, canonicalJson(family.worklist));
  const reference = await buildReviewBundle(family.worklist, 1);
  const bundlePath = join(root, 'assembly-bundle.json');
  await writeFile(bundlePath, canonicalJson(reference.bundle));
  const fragment = exclusionFragment(reference.bundle, reference.shards[0]);
  fragment.fragmentId = await calculateFragmentId(fragment);
  const fragmentPath = join(root, 'fragment.json');
  await writeFile(fragmentPath, canonicalJson(fragment));
  const outputPath = join(root, 'missing-fragments.json');
  await assert.rejects(assembleBoundedFragments({
    worklistPath, bundlePath, fragmentPaths: [fragmentPath], outputPath,
    sortRunItems: 1, inputChunkBytes: 2,
  }), /Not all shards/);
  await assertAbsent(outputPath);
  await assertNoWorkspace(root, outputPath);
  await assertCancellationCleanup(root);
  await assertWriteFailureCleanup(root);
  await assertDirectoryPublicationRaceCleanup(root);
  await assertFilePublicationRaceCleanup(root);
  assert.ok((await readFile(worklistPath)).length > 0);
  await assertStaticGuards();
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log('test-review-scale-failures: PASS');
