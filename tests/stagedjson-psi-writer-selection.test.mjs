import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(repoRoot, 'tabs', 'stagedjson-to-enrichxml');
const tempRoot = mkdtempSync(join(tmpdir(), 'stagedjson-writer-selection-'));
writeFileSync(join(tempRoot, 'package.json'), '{"type":"module"}\n');

for (const file of [
  'sj-audit.js',
  'sj-branch-identity.js',
  'sj-corrosion-resolver.js',
  'sj-enrichment-authority.js',
  'sj-enrichment-engine.js',
  'sj-node-contract.js',
  'sj-parser.js',
  'sj-point-resolver.js',
  'sj-psi-sequence-planner.js',
  'sj-rating-resolver.js',
  'sj-restraint-resolver.js',
  'sj-sequential-writer-shadow.js',
  'sj-type-mapper.js',
  'sj-wall-resolver.js',
  'sj-weight-db.js',
  'sj-weight-resolver.js',
  'sj-xml-writer-parity.js',
  'sj-xml-writer.js',
]) copyFileSync(join(sourceRoot, file), join(tempRoot, file));

const { runEnrichment } = await import(pathToFileURL(join(tempRoot, 'sj-enrichment-engine.js')).href);
test.after(() => rmSync(tempRoot, { recursive: true, force: true }));

function pipeBranch(sourceName, owner, ref, start, conditions = {}) {
  return {
    name: sourceName,
    type: 'BRANCH',
    attributes: { OWNER: owner },
    children: [{
      name: ref,
      type: 'PIPE',
      enrichedAttributes: {
        nominalBoreMm: 100,
        pipeOdMm: 114.3,
        wallThicknessMm: 6.02,
        corrosionAllowanceMm: 1.5,
        insulationThicknessMm: 50,
      },
      attributes: {
        REF: ref,
        ABORE: '100mm',
        APOS: { x: start, y: 0, z: 0 },
        LPOS: { x: start + 10, y: 0, z: 0 },
        ...conditions,
      },
    }],
  };
}

function branchNames(xml) {
  return [...xml.matchAll(/<Branchname>([\s\S]*?)<\/Branchname>/g)].map((match) => match[1]);
}

function nodeAllocations(records) {
  return Object.fromEntries(records.map((record) => [record.ref, record.xmlNodeNum]));
}

const interleaved = [
  pipeBranch('/LINE-A/B1', '/LINE-A', 'A1', 0),
  pipeBranch('/LINE-B/B1', '/LINE-B', 'B1', 100),
  pipeBranch('/LINE-A/B2', '/LINE-A', 'A2', 20),
];

test('canonical writer remains the default production output', () => {
  const result = runEnrichment({ stagedJsonText: interleaved, config: {} });

  assert.equal(result.writerSelection.requestedMode, 'canonical');
  assert.equal(result.writerSelection.effectiveMode, 'canonical');
  assert.equal(result.writerSelection.fallbackApplied, false);
  assert.equal(result.writerSelection.gate.reason, 'CANONICAL_DEFAULT');
  assert.equal(result.xmlText, result.canonicalXmlText);
  assert.deepEqual(branchNames(result.xmlText), ['/LINE-A', '/LINE-B']);
  assert.equal(result.audit.totalBranches, 2);
  assert.deepEqual(nodeAllocations(result.records), { A1: 10, B1: 50, A2: 30 });
});

test('explicit sequential mode selects XML and trace allocations atomically', () => {
  const result = runEnrichment({
    stagedJsonText: interleaved,
    config: { psiWriterMode: 'sequential' },
  });

  assert.equal(result.writerShadow.parity.switchGate.allowed, false);
  assert.equal(result.writerShadow.parity.selectionGate.allowed, true);
  assert.equal(result.writerShadow.parity.summary.sequenceEquivalent, false);
  assert.equal(result.writerShadow.parity.summary.numberingEquivalent, false);
  assert.equal(result.writerSelection.requestedMode, 'sequential');
  assert.equal(result.writerSelection.effectiveMode, 'sequential');
  assert.equal(result.writerSelection.fallbackApplied, false);
  assert.equal(result.writerSelection.gate.reason, 'SEQUENTIAL_PARITY_PROVEN');
  assert.equal(result.xmlText, result.writerShadow.xmlText);
  assert.deepEqual(branchNames(result.xmlText), ['/LINE-A/B1', '/LINE-B/B1', '/LINE-A/B2']);
  assert.equal(result.audit.totalBranches, 3);
  assert.deepEqual(nodeAllocations(result.records), { A1: 10, B1: 30, A2: 50 });
  assert.deepEqual(nodeAllocations(result.canonicalRecords), { A1: 10, B1: 50, A2: 30 });
  assert.deepEqual(result.records.map((record) => record.branchName), [
    '/LINE-A/B1', '/LINE-B/B1', '/LINE-A/B2',
  ]);
});

test('sequential request falls back to canonical when branch conditions drift', () => {
  const input = [
    pipeBranch('/LINE-C/B1', '/LINE-C', 'C1', 0, { T1: '100' }),
    pipeBranch('/LINE-C/B2', '/LINE-C', 'C2', 20, { T1: '200' }),
  ];
  const result = runEnrichment({
    stagedJsonText: input,
    config: { psiWriterMode: 'sequential' },
  });

  assert.equal(result.writerShadow.parity.validation.ok, true);
  assert.equal(result.writerShadow.parity.summary.branchConditionsEquivalent, false);
  assert.equal(result.writerShadow.parity.selectionGate.allowed, false);
  assert.ok(result.writerShadow.parity.selectionGate.blockers.includes('BRANCH_CONDITION_MISMATCH'));
  assert.equal(result.writerSelection.requestedMode, 'sequential');
  assert.equal(result.writerSelection.effectiveMode, 'canonical');
  assert.equal(result.writerSelection.fallbackApplied, true);
  assert.equal(result.writerSelection.gate.reason, 'SEQUENTIAL_BLOCKED');
  assert.ok(result.writerSelection.gate.blockers.includes('BRANCH_CONDITION_MISMATCH'));
  assert.equal(result.xmlText, result.canonicalXmlText);
  assert.deepEqual(branchNames(result.xmlText), ['/LINE-C']);
  assert.equal(result.audit.totalBranches, 1);
});

test('real 1885 benchmark is eligible for sequential production selection', () => {
  const stagedJson = JSON.parse(readFileSync(
    join(repoRoot, 'Benchmarks', '1885Sjson', 'Sjson.json'),
    'utf8',
  ));
  const result = runEnrichment({
    stagedJsonText: stagedJson,
    config: { psiWriterMode: 'sequential' },
  });

  assert.equal(result.writerShadow.parity.selectionGate.allowed, true);
  assert.equal(result.writerSelection.effectiveMode, 'sequential');
  assert.equal(result.writerSelection.fallbackApplied, false);
  assert.equal(result.audit.totalBranches, result.sequencePlan.summary.sourceBranchCount);
  assert.equal(branchNames(result.xmlText).length, result.sequencePlan.summary.sourceBranchCount);
  assert.equal(result.records.length, result.canonicalRecords.length);
  assert.ok(result.records.every((record) => record.branchName === record.sourceBranchName));
});
