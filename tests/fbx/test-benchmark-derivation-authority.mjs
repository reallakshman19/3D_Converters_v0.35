import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildFbxBenchmarkDerivationAuthority } from '../../tabs/model-converters/converters/fbx/benchmark/derivation-authority.js';
import { sealFbxBenchmarkSourceBinding } from '../../tabs/model-converters/converters/fbx/benchmark/source-binding.js';
import {
  gitBlobSha1, sealProducerAuthority, verifyProducerAuthority, verifyProducerFiles,
} from '../../tabs/model-converters/converters/fbx/benchmark/producer-authority.js';

const producerPath = new URL('../../Benchmarks/fbx BM/StaggedJsonBMforFBX.producer-authority.json', import.meta.url);
const producer = await verifyProducerAuthority(JSON.parse(await readFile(producerPath, 'utf8')));
const binding = await sealFbxBenchmarkSourceBinding({
  schema: 'FbxBenchmarkSourceBinding.v1',
  source: {
    fileName: 'fbxtaya.fbx',
    byteLength: 71486048,
    sha256: '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8',
    storage: {
      fileId: '1febjASkHnzLA667P81YuLF3pZqjI2ySM',
      provider: 'GOOGLE_DRIVE',
      revisionId: '0B3VXl1aCZ-GkVmM3S3grcTROdjBOTEpadFptaGRIZXUxN01BPQ',
    },
    fbx: {
      creationTime: '2026-07-21 16:23:48:291',
      creator: 'FBX SDK/FBX Plugins version 2019.0 build=b92b15b23',
      encoding: 'BINARY',
      fileId: '2cbf26e1bc28c2ccb3cdb625a327f2fc',
      globalSettings: {
        coordAxis: 0, coordAxisSign: -1, frontAxis: 1, frontAxisSign: 1,
        originalUnitScaleFactor: 1, unitScaleFactor: 100, upAxis: 2, upAxisSign: 1,
      },
      version: 7500,
    },
  },
  benchmark: {
    commit: producer.benchmarkCommit,
    gitBlobSha1: 'e4ce63f180d3bcc3cba0e85137ce9811cef477e9',
    inventory: { branchRecords: 1, childRecords: 3, supportRecords: 1, totalRecords: 4 },
    path: 'Benchmarks/fbx BM/StaggedJsonBMforFBX',
    repository: 'reallaksh19/3D_Converters',
  },
  lineage: {
    benchmarkBranchCount: 1, benchmarkChildCount: 3, certificationStatus: 'BLOCKED',
    commonModelStatus: 'STRONGLY_SUPPORTED', derivationStatus: 'UNPROVEN',
    netAdditionalBenchmarkRecords: 0, sourceBranchRootCount: 1, sourceDirectBranchChildCount: 3,
  },
});
const branch = { name: '/SITE/PIPE/B1', type: 'BRANCH', attributes: { OWNER_SITE: '/SITE' }, children: [] };
const flange = { name: 'FLAN =1/2', type: 'FLAN', attributes: { NAME: '=1/2', RAW_TYPE: 'FLANGE' } };
const pipe = { name: 'PIPE AUTO /SITE/PIPE/B1 HEAD', type: 'PIPE', attributes: {
  APOS: { x: 0, y: 0, z: 0 }, LPOS: { x: 2, y: 0, z: 0 }, AUTO_GENERATED_PIPE: 'true',
  GAP_MM: '2.000', ROUTE_TIER: 'BRANCH_HEAD', BORE_SOURCE: 'inherited from ABORE of adjacent fitting',
} };
const support = { name: 'SUPPORT PS-1', type: 'SUPPORT', attributes: {
  NAME: '/PS-1.1', RAW_TYPE: 'ATTA', CMPSUPREFN: 'PS-1', CMPSUPTYPE: 'REST', DTXR: 'Pipe Rest',
  SUPPORT_TAG: 'PS-1', SUPPORT_TYPE: 'REST', SUPPORT_KIND: 'REST', SUPPORT_MAPPER_KIND: 'REST',
} };
branch.children = [flange, pipe, support];
const occurrences = [
  { occurrenceId: 'branch:0', branchOccurrenceId: 'branch:0', recordRole: 'BRANCH_RECORD', record: branch },
  ...branch.children.map((record, index) => ({ occurrenceId: `branch:0/child:${index}`,
    branchOccurrenceId: 'branch:0', recordRole: 'CHILD_RECORD', record })),
];
const loaded = { schema: 'FbxBenchmarkLoaded.v1', identity: { contentSha256: 'b'.repeat(64), byteLength: 100 }, occurrences };
const lineage = {
  schema: 'FbxBenchmarkLineageAccounting.v1',
  executionIdentity: { sourceBindingSha256: binding.bindingSha256,
    benchmarkContentSha256: loaded.identity.contentSha256, benchmarkByteLength: loaded.identity.byteLength },
  branchLedger: [{ benchmarkOccurrenceIds: ['branch:0'], disposition: 'DIRECT_ENGINEERING_RECORD' }],
  benchmarkChildLedger: [
    { benchmarkOccurrenceId: 'branch:0/child:0', disposition: 'DIRECT_ENGINEERING_RECORD' },
    { benchmarkOccurrenceId: 'branch:0/child:1', disposition: 'UNRESOLVED' },
    { benchmarkOccurrenceId: 'branch:0/child:2', disposition: 'DIRECT_ENGINEERING_RECORD' },
  ],
};
const artifact = await buildFbxBenchmarkDerivationAuthority({
  loadedBenchmark: loaded, sourceBinding: binding, lineageAccounting: lineage, producerAuthority: producer,
});
assert.equal(artifact.summary.status, 'BLOCKED');
assert.equal(artifact.summary.invalidClaimCount, 0);
assert.equal(artifact.summary.benchmarkRecordsCoveredExactlyOnce, true);
assert.ok(artifact.recordLedger.find((item) => item.benchmarkOccurrenceId.endsWith('child:1'))
  .claims.some((claim) => claim.claimType === 'SYNTHETIC_PIPE' && claim.conformance === 'PASS'));
assert.deepEqual(artifact, await buildFbxBenchmarkDerivationAuthority({
  loadedBenchmark: loaded, sourceBinding: binding, lineageAccounting: lineage, producerAuthority: producer,
}));
const badPipeLoaded = structuredClone(loaded);
badPipeLoaded.occurrences[2].record.attributes.GAP_MM = '3.000';
const badPipe = await buildFbxBenchmarkDerivationAuthority({
  loadedBenchmark: badPipeLoaded, sourceBinding: binding, lineageAccounting: lineage, producerAuthority: producer,
});
assert.equal(badPipe.summary.status, 'FAIL');
assert.ok(badPipe.summary.invalidClaimCount > 0);
const badSupportLoaded = structuredClone(loaded);
badSupportLoaded.occurrences[3].record.attributes.SUPPORT_KIND = 'UNKNOWN';
const badSupport = await buildFbxBenchmarkDerivationAuthority({
  loadedBenchmark: badSupportLoaded, sourceBinding: binding, lineageAccounting: lineage, producerAuthority: producer,
});
assert.equal(badSupport.summary.status, 'FAIL');
const forged = structuredClone(producer);
forged.invocation.routingOptionsStatus = 'BOUND';
await assert.rejects(() => verifyProducerAuthority(forged), /UNBOUND|hash mismatch/);
const bytes = new TextEncoder().encode('producer');
const synthetic = await sealProducerAuthority({
  schema: producer.schema, benchmarkCommit: producer.benchmarkCommit, status: 'BLOCKED',
  authoritySha256: '0'.repeat(64), invocation: structuredClone(producer.invocation),
  producers: [{ producerId: 'P', path: 'p.js', blobSha1: await gitBlobSha1(bytes), entrypoints: ['run'], ruleIds: ['R'] }],
});
await verifyProducerFiles(synthetic, { 'p.js': bytes });
await assert.rejects(() => verifyProducerFiles(synthetic, { 'p.js': new TextEncoder().encode('other') }), /blob mismatch/);
const schemaProgram = `import json,sys; from jsonschema import Draft202012Validator; p=json.load(sys.stdin); Draft202012Validator.check_schema(p['schema']); e=list(Draft202012Validator(p['schema']).iter_errors(p['value'])); print(json.dumps([x.message for x in e]))`;
for (const [schemaName, value] of [
  ['fbx-benchmark-producer-authority-v1.schema.json', producer],
  ['fbx-benchmark-derivation-authority-v1.schema.json', artifact],
]) {
  const schema = JSON.parse(await readFile(new URL(`../../contracts/fbx/${schemaName}`, import.meta.url), 'utf8'));
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', schemaProgram], {
    input: JSON.stringify({ schema, value }), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
}
console.log('test-benchmark-derivation-authority: PASS');
