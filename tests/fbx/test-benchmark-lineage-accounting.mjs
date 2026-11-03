import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildFbxBenchmarkLineageAccounting } from '../../tabs/model-converters/converters/fbx/benchmark/lineage-accounting.js';
import { sealFbxBenchmarkSourceBinding } from '../../tabs/model-converters/converters/fbx/benchmark/source-binding.js';

function sourceObject(id, name, domSubtype = 'Mesh') {
  return { sourceObjectId: id, ufbxElementType: 'NODE', displayName: name, domClass: 'Model', domSubtype,
    domSourceName: `Model::${name}`, sourceDocumentOrder: Number(id), sourceRecordDisposition: 'supported-occurrence' };
}

function occurrence(id, objectId, parent = null) {
  return { sourceOccurrenceId: id, sourceModelObjectId: objectId, parentOccurrenceId: parent };
}
const sourceGraph = { schema: 'FbxSourceGraph.v2', file: { version: 7500 }, sourceObjects: [
  sourceObject('1', '/PLANT/LINE/B1', 'Null'), sourceObject('2', '/SUP-1'), sourceObject('3', 'Cylinder'),
  sourceObject('4', '/PLANT/LINE/B2', 'Null'), sourceObject('5', 'DUP'), sourceObject('6', 'DUP'),
], occurrences: [occurrence('occ:1', '1'), occurrence('occ:2', '2', 'occ:1'), occurrence('occ:3', '3', 'occ:1'),
  occurrence('occ:4', '4'), occurrence('occ:5', '5', 'occ:4'), occurrence('occ:6', '6', 'occ:4')] };
const branches = [
  { name: '/PLANT/LINE/B1', type: 'BRANCH', attributes: { NAME: '/PLANT/LINE/B1' }, children: [
    { name: 'SUPPORT SUP-1', type: 'SUPPORT', attributes: { NAME: '/SUP-1' } },
    { name: 'PIPE AUTO B1 HEAD', type: 'PIPE', attributes: { AUTO_GENERATED_PIPE: 'true' } },
  ] },
  { name: '/PLANT/LINE/B2', type: 'BRANCH', attributes: { NAME: '/PLANT/LINE/B2' }, children: [
    { name: 'DUP', type: 'INST', attributes: { NAME: 'DUP' } },
    { name: 'EXTRA', type: 'VALV', attributes: { NAME: 'EXTRA' } },
  ] },
];
function loadedBenchmark() {
  const occurrences = [];
  branches.forEach((record, branchIndex) => {
    const branchOccurrenceId = `branch:${branchIndex}`;
    occurrences.push({ occurrenceId: branchOccurrenceId, branchOccurrenceId, recordRole: 'BRANCH_RECORD', record });
    record.children.forEach((child, childIndex) => occurrences.push({ occurrenceId: `${branchOccurrenceId}/child:${childIndex}`,
      branchOccurrenceId, recordRole: 'CHILD_RECORD', record: child }));
  });
  return { schema: 'FbxBenchmarkLoaded.v1', identity: { benchmarkBlobSha: 'a'.repeat(40),
    contentSha256: 'b'.repeat(64), byteLength: 123 }, occurrences };
}
const sourceBinding = await sealFbxBenchmarkSourceBinding({ schema: 'FbxBenchmarkSourceBinding.v1',
  source: { fileName: 'fixture.fbx', byteLength: 27, sha256: 'f'.repeat(64),
    storage: { provider: 'GOOGLE_DRIVE', fileId: 'fixture', revisionId: 'revision' },
    fbx: { encoding: 'BINARY', version: 7500, fileId: '1'.repeat(32), creator: 'fixture',
      creationTime: '2026-01-01 00:00:00:000', globalSettings: { upAxis: 2, upAxisSign: 1,
        frontAxis: 1, frontAxisSign: 1, coordAxis: 0, coordAxisSign: -1,
        unitScaleFactor: 100, originalUnitScaleFactor: 1 } } },
  benchmark: { repository: 'owner/repo', commit: '2'.repeat(40), path: 'benchmark.json',
    gitBlobSha1: 'a'.repeat(40), inventory: { totalRecords: 6, branchRecords: 2,
      childRecords: 4, supportRecords: 1 } },
  lineage: { sourceBranchRootCount: 2, sourceDirectBranchChildCount: 4, benchmarkBranchCount: 2,
    benchmarkChildCount: 4, netAdditionalBenchmarkRecords: 0, commonModelStatus: 'STRONGLY_SUPPORTED',
    derivationStatus: 'UNPROVEN', certificationStatus: 'BLOCKED' }, bindingSha256: null });
const parserIdentity = { provenanceSchema: 'FbxParserProvenance.v1', upstreamRevision: 'u',
  sourceSha256: 'c'.repeat(64), wasmSha256: 'd'.repeat(64) };
const artifact = await buildFbxBenchmarkLineageAccounting({ sourceGraph, loadedBenchmark: loadedBenchmark(),
  sourceBinding, parserIdentity });
assert.deepEqual(artifact.populations, { sourceBranchCount: 2, sourceChildCount: 4,
  benchmarkBranchCount: 2, benchmarkChildCount: 4, netBenchmarkChildDifference: 0 });
assert.equal(artifact.branchLedger.every((item) => item.matchState === 'EXACT_ONE_TO_ONE'), true);
assert.equal(artifact.sourceChildLedger.find((item) => item.sourceOccurrenceId === 'occ:2').disposition,
  'DIRECT_ENGINEERING_RECORD');
assert.equal(artifact.benchmarkChildLedger.find((item) => item.benchmarkOccurrenceId === 'branch:0/child:1').disposition,
  'UNRESOLVED');
assert.equal(artifact.sourceChildLedger.filter((item) => item.matchState === 'AMBIGUOUS').length, 2);
assert.equal(artifact.benchmarkChildLedger.filter((item) => item.matchState === 'AMBIGUOUS').length, 1);
assert.deepEqual(artifact.summary, { sourceChildrenCoveredExactlyOnce: true,
  benchmarkChildrenCoveredExactlyOnce: true, duplicateSourceConsumptionCount: 0,
  duplicateBenchmarkConsumptionCount: 0, unresolvedSourceCount: 3, unresolvedBenchmarkCount: 3,
  unresolvedBranchCount: 0, ambiguousGroupCount: 1, status: 'BLOCKED' });
assert.equal(Object.isFrozen(artifact), true);
const schema = JSON.parse(await readFile(new URL('../../contracts/fbx/fbx-benchmark-lineage-accounting-v1.schema.json', import.meta.url), 'utf8'));
const validation = spawnSync('python3', ['-c', String.raw`import json,sys
from jsonschema import Draft202012Validator
payload=json.load(sys.stdin)
errors=sorted(Draft202012Validator(payload['schema']).iter_errors(payload['artifact']), key=lambda e: list(e.absolute_path))
print(json.dumps([{'path':list(e.absolute_path),'message':e.message} for e in errors]))`], {
  input: JSON.stringify({ schema, artifact }), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (validation.status !== 0) throw new Error(validation.stderr);
assert.deepEqual(JSON.parse(validation.stdout), []);
const repeated = await buildFbxBenchmarkLineageAccounting({ sourceGraph: structuredClone(sourceGraph),
  loadedBenchmark: loadedBenchmark(), sourceBinding, parserIdentity });
assert.deepEqual(repeated, artifact);
const ambiguousGraph = structuredClone(sourceGraph);
for (const key of ['displayName', 'domSourceName']) ambiguousGraph.sourceObjects.find((item) => item.sourceObjectId === '4')[key]
  = key === 'displayName' ? '/PLANT/LINE/B1' : 'Model::/PLANT/LINE/B1';
const ambiguous = await buildFbxBenchmarkLineageAccounting({ sourceGraph: ambiguousGraph,
  loadedBenchmark: loadedBenchmark(), sourceBinding, parserIdentity });
assert.equal(ambiguous.summary.unresolvedBranchCount, 2);
assert.equal(ambiguous.summary.ambiguousGroupCount, 1);
assert.equal(ambiguous.sourceChildLedger.every((item) => item.matchState === 'BRANCH_UNRESOLVED'), true);
const shortGraph = structuredClone(sourceGraph); shortGraph.occurrences.pop();
await assert.rejects(() => buildFbxBenchmarkLineageAccounting({ sourceGraph: shortGraph,
  loadedBenchmark: loadedBenchmark(), sourceBinding, parserIdentity }), /source child population differs/);
const wrongBlob = loadedBenchmark(); wrongBlob.identity.benchmarkBlobSha = 'e'.repeat(40);
await assert.rejects(() => buildFbxBenchmarkLineageAccounting({ sourceGraph,
  loadedBenchmark: wrongBlob, sourceBinding, parserIdentity }), /benchmark blob differs/);
const forged = structuredClone(sourceBinding); forged.source.fbx.version = 7400;
await assert.rejects(() => buildFbxBenchmarkLineageAccounting({ sourceGraph,
  loadedBenchmark: loadedBenchmark(), sourceBinding: forged, parserIdentity }), /hash mismatch/);
console.log('test-benchmark-lineage-accounting: PASS');
