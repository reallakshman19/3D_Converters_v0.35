import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { occurrence, reconciliationInput, terminal } from '../../tabs/model-converters/converters/fbx/benchmark-audit/adapter-common.js';
import { reconcileCoverage } from '../../tabs/model-converters/converters/fbx/benchmark-audit/coverage-reconciliation.js';
import { adaptComponentBenchmarkReport } from '../../tabs/model-converters/converters/fbx/benchmark-audit/zone-component-adapters.js';
import { adaptTopologyBenchmarkReport } from '../../tabs/model-converters/converters/fbx/benchmark-audit/support-topology-adapters.js';
import { auditLineageDerivationAuthority } from '../../tabs/model-converters/converters/fbx/benchmark-audit/lineage-derivation-audit.js';
import { observeRepositoryExactHeadIdentity } from '../../tabs/model-converters/converters/fbx/benchmark-audit/exact-head-observer.js';
import { FBX_EXACT_HEAD_IDENTITY_FIELDS } from '../../tabs/model-converters/converters/fbx/benchmark-audit/exact-head-evidence.js';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';
import { computeFbxBenchmarkSourceBindingSha256 } from '../../tabs/model-converters/converters/fbx/benchmark/source-binding.js';
import { computeProducerAuthoritySha256 } from '../../tabs/model-converters/converters/fbx/benchmark/producer-authority.js';

function expectThrow(fn, pattern) { assert.throws(fn, pattern); }
const ref = occurrence('r1'), act = occurrence('a1');
expectThrow(() => reconcileCoverage(reconciliationInput('p','COMPONENT','FbxComponentBenchmarkReport.v1',[ref],[act],
  [terminal('b','BLOCKED_IDENTITY',['r1'],['a1'])])), /BLOCKED_AUDIT_CARDINALITY/);
const producerFail = reconcileCoverage(reconciliationInput('p','COMPONENT','FbxComponentBenchmarkReport.v1',[ref],[act],
  [terminal('x','EXACT_MATCH',['r1'],['a1'])], [], 'FAIL'));
assert.equal(producerFail.independentStatus, 'PASS');
assert.equal(producerFail.status, 'FAIL');

function loaded(types, digest) {
  const branch = { type:'BRANCH', attributes:{}, children:types.map((type) => ({ type, attributes:{} })) };
  const occurrences = [{ occurrenceId:'branch:0', branchOccurrenceId:'branch:0', parentOccurrenceId:null,
    branchIndex:0, childIndex:null, recordRole:'BRANCH_RECORD', record:branch }];
  branch.children.forEach((record, index) => occurrences.push({ occurrenceId:`branch:0/child:${index}`,
    branchOccurrenceId:'branch:0', parentOccurrenceId:'branch:0', branchIndex:0, childIndex:index,
    recordRole:'CHILD_RECORD', record }));
  const occurrenceById = Object.fromEntries(occurrences.map((item) => [item.occurrenceId, item]));
  return { schema:'FbxBenchmarkLoaded.v1', identity:{ contentSha256:digest, byteLength:10 }, branches:[branch], occurrences, occurrenceById };
}
function row(side, subjectId, occurrenceId, state, counterpart = null) {
  return { ledgerRecordId:`L-${side}-${subjectId}`, side, subjectId,
    subjectLocator:{ sourceOccurrenceId:occurrenceId }, identityEvidence:{ candidateKeys:[], collisionGroupIds:[] },
    match:{ state, counterpartSubjectIds:counterpart ? [counterpart] : [], passingCounterpartSubjectId:counterpart } };
}
function componentReport(refLoaded, actualLoaded, ledger, count = 2, status = 'PASS') {
  return { schema:'FbxComponentBenchmarkReport.v1', collisionGroups:[], ledger,
    executionIdentity:{ benchmarkLoads:{ reference:{ schema:refLoaded.schema, ...refLoaded.identity }, actual:{ schema:actualLoaded.schema, ...actualLoaded.identity } } },
    inventory:{ referenceComponentCount:count, actualComponentCount:count },
    summary:{ referenceCoverageCount:count, actualCoverageCount:count, referenceCoverageComplete:true,
      actualCoverageComplete:true, componentStatus:status } };
}
const refLoaded = loaded(['PIPE','VALV'], '1'.repeat(64)), actualLoaded = loaded(['PIPE','VALV'], '2'.repeat(64));
const reduced = componentReport(refLoaded, actualLoaded, [
  row('REFERENCE','R1','branch:0/child:0','EXACT_MATCH','A1'), row('ACTUAL','A1','branch:0/child:0','EXACT_MATCH','R1'),
]);
const reducedResult = reconcileCoverage(adaptComponentBenchmarkReport(reduced, refLoaded, actualLoaded));
assert.equal(reducedResult.status, 'FAIL');
assert.equal(reducedResult.unreconciledRecords.length, 2);
const badActual = componentReport(refLoaded, actualLoaded, [
  row('REFERENCE','R1','branch:0/child:0','MISSING_ACTUAL'), row('ACTUAL','A2','branch:0/child:1','EXACT_MATCH'),
], 2, 'FAIL');
expectThrow(() => adaptComponentBenchmarkReport(badActual, refLoaded, actualLoaded), /unconsumed actual component/);

function topologyReport(overrides = {}) {
  const relation = { relationshipId:'rel', matchState:'EXACT_MATCH', reference:{ relationshipId:'r' }, actual:{ relationshipId:'a' } };
  return { schema:'FbxTopologyBenchmarkReport.v1', branches:[], relationships:[relation], junctions:[], boundaries:[],
    coverage:{ referenceEntityCount:0, actualEntityCount:0, referenceRelationshipCount:1, actualRelationshipCount:1,
      relationshipLedgerCount:1, unrepresentedReferenceEntities:[], unrepresentedActualEntities:[],
      unrepresentedReferenceRelationships:[], unrepresentedActualRelationships:[] },
    summary:{ topologyStatus:'FAIL' }, status:'FAIL', ...overrides };
}
const topology = reconcileCoverage(adaptTopologyBenchmarkReport(topologyReport(), 'TOPOLOGY_RELATIONSHIP'));
assert.equal(topology.independentStatus, 'PASS'); assert.equal(topology.status, 'FAIL');
const incomplete = topologyReport(); incomplete.coverage.unrepresentedReferenceRelationships = ['r2'];
expectThrow(() => adaptTopologyBenchmarkReport(incomplete, 'TOPOLOGY_RELATIONSHIP'), /must be empty/);

async function sealedBinding() {
  const value = { schema:'FbxBenchmarkSourceBinding.v1', bindingSha256:'0'.repeat(64),
    source:{ fileName:'x.fbx', storage:{provider:'GOOGLE_DRIVE',fileId:'f',revisionId:'r'}, byteLength:1,
      sha256:'a'.repeat(64), fbx:{encoding:'BINARY',version:7500,fileId:'b'.repeat(32),creator:'c',creationTime:'t',
        globalSettings:{upAxis:2,upAxisSign:1,frontAxis:1,frontAxisSign:1,coordAxis:0,coordAxisSign:-1,unitScaleFactor:100,originalUnitScaleFactor:1}}},
    benchmark:{repository:'r',commit:'c'.repeat(40),path:'b.json',gitBlobSha1:'d'.repeat(40),
      inventory:{totalRecords:3,branchRecords:1,childRecords:2,supportRecords:0}},
    lineage:{sourceBranchRootCount:1,sourceDirectBranchChildCount:2,benchmarkBranchCount:1,benchmarkChildCount:2,
      netAdditionalBenchmarkRecords:0,commonModelStatus:'STRONGLY_SUPPORTED',derivationStatus:'UNPROVEN',certificationStatus:'BLOCKED'} };
  value.bindingSha256 = await computeFbxBenchmarkSourceBindingSha256(value); return value;
}
async function sealedProducer() {
  const value = { schema:'FbxBenchmarkProducerAuthority.v1', benchmarkCommit:'c'.repeat(40), producers:[{
    producerId:'P',path:'p',blobSha1:'e'.repeat(40),entrypoints:['x'],ruleIds:['r']}],
    invocation:{candidateInputKind:'RMSS_ATTRIBUTE_TEXT',inputIdentityStatus:'UNBOUND',generationCommandStatus:'UNBOUND',
      routingOptionsStatus:'UNBOUND',supportMapperConfigStatus:'UNBOUND'},status:'BLOCKED',authoritySha256:'0'.repeat(64) };
  value.authoritySha256 = await computeProducerAuthoritySha256(value); return value;
}
const binding = await sealedBinding(), producer = await sealedProducer(), benchmark = loaded(['PIPE','VALV'],'1'.repeat(64));
benchmark.identity.byteLength = 10;
const lineage = { schema:'FbxBenchmarkLineageAccounting.v1', executionIdentity:{ sourceBindingSha256:binding.bindingSha256,
  benchmarkContentSha256:benchmark.identity.contentSha256,benchmarkByteLength:10 },
  branchLedger:[{benchmarkOccurrenceIds:['branch:0']}], benchmarkChildLedger:[
    {benchmarkOccurrenceId:'branch:0/child:0'},{benchmarkOccurrenceId:'branch:0/child:1'}],
  summary:{benchmarkChildrenCoveredExactlyOnce:true,duplicateBenchmarkConsumptionCount:0,status:'BLOCKED'} };
const derivation = { schema:'FbxBenchmarkDerivationAuthority.v1', executionIdentity:{ sourceBindingSha256:binding.bindingSha256,
  lineageAccountingSha256:await sha256Hex(canonicalJson(lineage)), benchmarkContentSha256:benchmark.identity.contentSha256,
  benchmarkByteLength:10,producerAuthoritySha256:producer.authoritySha256 }, producerStatus:'BLOCKED',
  recordLedger:benchmark.occurrences.map((item)=>({benchmarkOccurrenceId:item.occurrenceId})),
  summary:{benchmarkRecordsCoveredExactlyOnce:true,status:'BLOCKED'} };
const chain = await auditLineageDerivationAuthority({loadedBenchmark:benchmark,sourceBinding:binding,lineageAccounting:lineage,
  producerAuthority:producer,derivationAuthority:derivation});
assert.equal(chain.status,'BLOCKED');

const root = await mkdtemp(join(tmpdir(),'agent-q-observer-'));
execFileSync('git',['init','-q',root]); execFileSync('git',['-C',root,'config','user.email','a@b.c']);
execFileSync('git',['-C',root,'config','user.name','t']);
const benchmarkBytes = Buffer.from('[]\n'), blob = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${benchmarkBytes.length}\0`),benchmarkBytes])).digest('hex');
await mkdir(join(root,'Benchmarks'),{recursive:true}); await writeFile(join(root,'Benchmarks','b.json'),benchmarkBytes);
await writeFile(join(root,'identity.txt'),'identity');
await writeFile(join(root,'source.json'),JSON.stringify({benchmark:{path:'Benchmarks/b.json',commit:'f'.repeat(40),gitBlobSha1:blob},bindingSha256:'a'.repeat(64)}));
await writeFile(join(root,'producer.json'),JSON.stringify({authoritySha256:'b'.repeat(64)}));
const derived = new Set(['repositoryCommit','repositoryTree','checkoutState','benchmarkCommit','benchmarkPath','benchmarkBlobSha','benchmarkContentSha256','benchmarkByteLength']);
const sources = {};
for (const field of FBX_EXACT_HEAD_IDENTITY_FIELDS.filter((field)=>!derived.has(field))) {
  if (field === 'sourceBindingSha256') sources[field]={path:'source.json',mode:'JSON_FIELD',jsonField:'bindingSha256'};
  else if (field === 'producerAuthoritySha256') sources[field]={path:'producer.json',mode:'JSON_FIELD',jsonField:'authoritySha256'};
  else sources[field]={path:'identity.txt',mode:'FILE_SHA256',jsonField:''};
}
await writeFile(join(root,'spec.json'),JSON.stringify({schema:'FbxExactHeadObservationSpec.v1',sourceBindingPath:'source.json',identitySources:sources}));
execFileSync('git',['-C',root,'add','.']); execFileSync('git',['-C',root,'commit','-qm','fixture']);
const observed = await observeRepositoryExactHeadIdentity(JSON.parse(await readFile(join(root,'spec.json'),'utf8')),{rootPath:root});
assert.equal(observed.checkoutState,'CLEAN'); assert.equal(observed.benchmarkBlobSha,blob);
console.log('test-benchmark-audit-stage4-closure: PASS');
