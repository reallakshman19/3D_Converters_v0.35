import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { completeDecisionSet, worklistFixture } from './worklist-helpers.mjs';
import { FAMILY_FIXTURE_URL } from './family-helpers.mjs';
import { ROOT } from './helpers.mjs';

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: fileURLToPath(ROOT), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
}

function assertPass(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.error?.message || result.stderr}`);
  }
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; }
  catch { return false; }
}

const context = await worklistFixture(true);
const decisions = await completeDecisionSet(context);
const directory = await mkdtemp(join(tmpdir(), 'f2s005-'));
try {
  const buildScript = fileURLToPath(new URL('../../scripts/fbx/build-mapping-worklist.mjs', import.meta.url));
  const compileScript = fileURLToPath(new URL('../../scripts/fbx/compile-mapping-decisions.mjs', import.meta.url));
  const packageScript = fileURLToPath(new URL('../../scripts/fbx/build-mapping-package.mjs', import.meta.url));
  const sourcePath = fileURLToPath(FAMILY_FIXTURE_URL);
  const firstWorklist = join(directory, 'first.worklist.json');
  const secondWorklist = join(directory, 'second.worklist.json');
  assertPass(run(buildScript, [sourcePath, firstWorklist]), 'first worklist build');
  assertPass(run(buildScript, [sourcePath, secondWorklist]), 'second worklist build');
  assert.equal(await readFile(firstWorklist, 'utf8'), await readFile(secondWorklist, 'utf8'));
  assert.equal(await readFile(firstWorklist, 'utf8'), canonicalJson(context.worklist));

  const decisionPath = join(directory, 'decisions.json');
  const mappingPath = join(directory, 'compiled.fbxmap.json');
  await writeFile(decisionPath, canonicalJson(decisions), 'utf8');
  assertPass(run(compileScript, [sourcePath, firstWorklist, decisionPath, mappingPath]), 'decision compile');
  const compiledText = await readFile(mappingPath, 'utf8');
  assert.equal(JSON.parse(compiledText).schema, 'FbxStagedMapping.v2');

  const firstPackage = join(directory, 'first.package.json');
  const secondPackage = join(directory, 'second.package.json');
  assertPass(run(packageScript, [sourcePath, mappingPath, firstPackage]), 'first package build');
  assertPass(run(packageScript, [sourcePath, mappingPath, secondPackage]), 'second package build');
  assert.equal(await readFile(firstPackage, 'utf8'), await readFile(secondPackage, 'utf8'));

  const missing = structuredClone(decisions);
  missing.decisions.pop();
  const missingPath = join(directory, 'missing.json');
  const blockedOutput = join(directory, 'blocked.fbxmap.json');
  await writeFile(missingPath, canonicalJson(missing), 'utf8');
  const blocked = run(compileScript, [sourcePath, firstWorklist, missingPath, blockedOutput]);
  assert.notEqual(blocked.status, 0);
  assert.equal(await exists(blockedOutput), false, 'blocked compiler wrote an output mapping');
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log('test-mapping-worklist-cli: PASS');
