import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(repoRoot, 'tabs', 'stagedjson-to-enrichxml');
const tempRoot = mkdtempSync(join(tmpdir(), 'stagedjson-psi-sequence-'));
writeFileSync(join(tempRoot, 'package.json'), '{"type":"module"}\n');

for (const file of [
  'sj-branch-identity.js',
  'sj-parser.js',
  'sj-psi-sequence-planner.js',
  'sj-type-mapper.js',
]) copyFileSync(join(sourceRoot, file), join(tempRoot, file));

const { parseStagedJson } = await import(pathToFileURL(join(tempRoot, 'sj-parser.js')).href);
const { buildPsiSequencePlan } = await import(
  pathToFileURL(join(tempRoot, 'sj-psi-sequence-planner.js')).href
);

test.after(() => rmSync(tempRoot, { recursive: true, force: true }));

function component(name, type, attributes = {}) {
  return { name, type, attributes };
}

test('sequence plan preserves exact branch blocks and topology references', () => {
  const root = '/TEST-LINE';
  const stagedJson = [
    {
      name: `${root}/B2`,
      type: 'BRANCH',
      attributes: {
        OWNER: root,
        HREF: `${root}/B1`,
        TREF: `${root}/B3`,
        HPOS: { x: 0, y: 0, z: 0 },
        TPOS: { x: 30, y: 0, z: 0 },
      },
      children: [
        component('PIPE-1', 'PIPE', {
          APOS: { x: 0, y: 0, z: 0 },
          LPOS: { x: 10, y: 0, z: 0 },
          REF: 'PIPE-1',
        }),
        component('OLET-1', 'OLET', {
          APOS: { x: 10, y: 0, z: 0 },
          LPOS: { x: 10, y: 0, z: 0 },
          REF: 'OLET-1',
          CREF: `${root}/B4`,
        }),
      ],
    },
    {
      name: `${root}/B1`,
      type: 'BRANCH',
      attributes: { OWNER: root },
      children: [component('PIPE-0', 'PIPE', { REF: 'PIPE-0' })],
    },
    { name: `${root}/B3`, type: 'BRANCH', attributes: { OWNER: root }, children: [] },
    { name: `${root}/B4`, type: 'BRANCH', attributes: { OWNER: root }, children: [] },
  ];

  const records = parseStagedJson(stagedJson);
  const plan = buildPsiSequencePlan(stagedJson, records);

  assert.equal(plan.validation.ok, true, plan.validation.errors.join('\n'));
  assert.equal(plan.branches.length, 4);
  assert.equal(plan.branches[0].sourceBranchName, `${root}/B2`);
  assert.equal(plan.branches[0].canonicalBranchName, root);
  assert.equal(plan.branches[0].branchSuffix, 'B2');
  assert.deepEqual(plan.branches[0].headPosition, { x: 0, y: 0, z: 0 });
  assert.deepEqual(plan.branches[0].tailPosition, { x: 30, y: 0, z: 0 });
  assert.deepEqual(
    plan.branches[0].components.map((item) => item.name),
    ['PIPE-1', 'OLET-1'],
  );
  assert.deepEqual(
    plan.branches[0].references.map((item) => [item.kind, item.targetBranchName]),
    [
      ['HREF', `${root}/B1`],
      ['TREF', `${root}/B3`],
      ['CREF', `${root}/B4`],
    ],
  );
  assert.equal(plan.summary.sourceBranchCount, 4);
  assert.equal(plan.summary.canonicalBranchCount, 1);
  assert.equal(plan.summary.componentCount, records.length);
  assert.equal(plan.summary.unresolvedReferenceCount, 0);
});

test('1885 fixture exposes source branch order before canonical XML grouping', () => {
  const stagedJson = JSON.parse(readFileSync(
    join(repoRoot, 'Benchmarks', '1885Sjson', 'Sjson.json'),
    'utf8',
  ));
  const records = parseStagedJson(stagedJson);
  const plan = buildPsiSequencePlan(stagedJson, records);

  assert.equal(plan.validation.ok, true, plan.validation.errors.join('\n'));
  assert.equal(plan.summary.componentCount, records.length);
  assert.ok(plan.summary.sourceBranchCount > plan.summary.canonicalBranchCount);

  const first = plan.branches[0];
  assert.equal(first.sequence, 0);
  assert.equal(first.sourceOrder, 0);
  assert.equal(first.sourceBranchName, '/ASIM-1885-6"-S8811951-91261M7-HC-01/B2');
  assert.equal(first.canonicalBranchName, '/ASIM-1885-6"-S8811951-91261M7-HC-01');
  assert.deepEqual(
    first.references.slice(0, 2).map((item) => [item.kind, item.targetBranchName]),
    [
      ['HREF', '/ASIM-1885-6"-S8810111-91261M7-HC-01/B1'],
      ['TREF', '/ASIM-1885-6"-S8811951-91261M7-HC-01/B7'],
    ],
  );
  assert.deepEqual(
    first.components.slice(0, 3).map((item) => item.name),
    [
      'ELBO =1006649732/51228',
      'PIPE AUTO /ASIM-1885-6"-S8811951-91261M7-HC-01/B2 1',
      'OLET =1006649732/51229',
    ],
  );
});