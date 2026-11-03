import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeSemanticHash } from '../contracts/topo-enriched-xml/contract-core.js';
import { TOPONODEALLOCATIONRESULT_V1 } from '../contracts/topo-enriched-xml/contracts.js';
import { computeLineHistoryHash, computeZoneRegistryHash, buildRegistrySnapshotManifest } from '../node-history/registry/registry-hash.js';
import { allocateZoneEngineeringNodes } from '../node-history/allocation/deterministic-zone-allocator.js';

const allocationFixture=JSON.parse(readFileSync(new URL('./fixtures/node-history/allocation/zone-allocation.json',import.meta.url),'utf8'));
const registryFixture=JSON.parse(readFileSync(new URL('./fixtures/node-history/registry/foundation.json',import.meta.url),'utf8'));

async function makeInput(mutate=()=>{}){
  const data=structuredClone(registryFixture), cfg=structuredClone(allocationFixture);
  mutate(data,cfg);
  for(const h of data.lineHistories) h.lineHistoryHash=await computeLineHistoryHash(h);
  for(const ref of data.zoneRegistry.lineHistoryRefs) ref.lineHistoryHash=data.lineHistories.find(h=>h.mainLineKey===ref.mainLineKey).lineHistoryHash;
  data.zoneRegistry.zoneRegistryHash=await computeZoneRegistryHash(data.zoneRegistry);
  const manifest=await buildRegistrySnapshotManifest({zoneRegistry:data.zoneRegistry,lineHistories:data.lineHistories});
  cfg.matchResult.baseRegistrySnapshotHash=manifest.registrySnapshotHash;
  cfg.matchResult.historyMatchResultHash=await computeSemanticHash(cfg.matchResult,'historyMatchResultHash');
  return {zoneRegistry:data.zoneRegistry,lineHistories:data.lineHistories,manifest,historyMatchResult:cfg.matchResult,allocationRequests:cfg.requests,policy:cfg.policy,coverage:cfg.coverage,evaluatedAt:'2026-07-20T11:00:00Z'};
}
const codes=r=>r.validation.blockers.map(x=>x.code);
const map=r=>Object.fromEntries(r.allocations.map(x=>[x.logicalNodeId,x.engineeringNodeNumber]));

test('preserves matched and reactivated numbers and allocates lowest available deterministically',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput());
 assert.equal(r.validation.status,'PASS');
 assert.deepEqual(map(r),{'LN-A-EXISTING':100,'LN-A-REACT':110,'LN-A-NEW-1':120,'LN-A-NEW-2':130});
 assert.equal(r.reactivations.length,1); assert.equal(r.allocations.length,4); assert.deepEqual(TOPONODEALLOCATIONRESULT_V1.validate(r),[]); assert.equal(Object.isFrozen(r),true);
});

test('shuffled requests and semantic registry arrays produce identical allocations and hash',async()=>{
 const a=await allocateZoneEngineeringNodes(await makeInput());
 const b=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{c.requests.reverse();d.lineHistories.reverse();d.zoneRegistry.leases.reverse();d.zoneRegistry.leases[1].ranges.reverse();}));
 assert.deepEqual(map(a),map(b)); assert.equal(a.allocationResultHash,b.allocationResultHash);
});

test('audit timestamp does not change allocation hash',async()=>{
 const input=await makeInput(),a=await allocateZoneEngineeringNodes(input),b=await allocateZoneEngineeringNodes({...input,evaluatedAt:'2099-01-01T00:00:00Z'});
 assert.equal(a.allocationResultHash,b.allocationResultHash); assert.deepEqual(map(a),map(b));
});

test('reserved and all historical lifecycle numbers are skipped for new allocation',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{c.policy.reservedNumbers=[120];c.requests=c.requests.filter(x=>x.logicalNodeId==='LN-A-NEW-1');c.matchResult.matches=[];c.matchResult.reactivated=[];c.matchResult.newNodes=[{logicalNodeId:'LN-A-NEW-1',outcome:'NO_EXACT_MATCH'}];}));
 assert.equal(map(r)['LN-A-NEW-1'],130);
});

test('allocates independently from the correct line lease',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{c.requests=[{logicalNodeId:'LN-B-NEW',mainLineKey:'/LINE-B'}];c.matchResult.mainLineKey='/LINE-B';c.matchResult.matches=[];c.matchResult.reactivated=[];c.matchResult.newNodes=[{logicalNodeId:'LN-B-NEW',outcome:'NO_EXACT_MATCH'}];c.coverage.coveredMainLines=['/LINE-B'];}));
 assert.equal(map(r)['LN-B-NEW'],510);
});

test('lease exhaustion blocks atomically with no partial allocations',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{d.lineHistories[0].historyNodes=d.lineHistories[0].historyNodes.filter(n=>n.engineeringNodeNumber!==300);d.zoneRegistry.leases[0].ranges=[{start:100,end:110,step:10}];c.requests=[{logicalNodeId:'LN-A-NEW',mainLineKey:'/LINE-A'}];c.matchResult.matches=[];c.matchResult.reactivated=[];c.matchResult.newNodes=[{logicalNodeId:'LN-A-NEW',outcome:'NO_EXACT_MATCH'}];}));
 assert.ok(codes(r).includes('LEASE_EXHAUSTED')); assert.deepEqual(r.allocations,[]);
});

test('duplicate requests, cross-line use and relative numbering block',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{c.requests.push({...c.requests[0],mainLineKey:'/LINE-B',startNodeNumber:900});}));
 assert.ok(codes(r).includes('ALLOCATION_REQUEST_DUPLICATE'));assert.ok(codes(r).includes('ALLOCATION_MAIN_LINE_MISMATCH'));assert.ok(codes(r).includes('ALLOCATION_REQUEST_RELATIVE_NUMBERING_PROHIBITED'));assert.deepEqual(r.allocations,[]);
});

test('stale registry and match hashes block',async()=>{
 const a=await makeInput();a.manifest=structuredClone(a.manifest);a.manifest.registrySnapshotHash='sha256:stale';const r1=await allocateZoneEngineeringNodes(a);assert.ok(codes(r1).includes('REGISTRY_SNAPSHOT_HASH_MISMATCH'));
 const b=await makeInput();b.historyMatchResult=structuredClone(b.historyMatchResult);b.historyMatchResult.historyMatchResultHash='sha256:stale';const r2=await allocateZoneEngineeringNodes(b);assert.ok(codes(r2).includes('HISTORY_MATCH_RESULT_HASH_MISMATCH'));
});

test('overlapping leases and review matcher input block',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{d.zoneRegistry.leases[1].ranges=[{start:150,end:250,step:10}];c.matchResult.validation={status:'REVIEW_REQUIRED',blockers:[],reviewItems:[{code:'AMBIGUOUS'}],warnings:[]};}));
 assert.ok(codes(r).includes('LEASE_OVERLAP'));assert.ok(codes(r).includes('HISTORY_MATCH_RESULT_NOT_PASS'));assert.deepEqual(r.allocations,[]);
});

test('detects every nested overlap and rejects malformed reserved-number policy',async()=>{
 const nested=await allocateZoneEngineeringNodes(await makeInput((d)=>{d.zoneRegistry.leases[0].ranges=[{start:100,end:300,step:10}];d.zoneRegistry.leases[1].ranges=[{start:150,end:160,step:10},{start:170,end:180,step:10}];}));
 assert.equal(nested.validation.blockers.filter(x=>x.code==='LEASE_OVERLAP').length,2);
 const policy=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{c.policy.reservedNumbers=[120,'130',999999];}));
 assert.ok(codes(policy).includes('ALLOCATION_POLICY_MISMATCH'));assert.deepEqual(policy.allocations,[]);
});

test('partial coverage cannot emit retirement intent',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{c.coverage={scope:'PARTIAL_LINE',authoritativeForRetirement:false,coveredMainLines:['/LINE-A']};c.matchResult.retirementCandidates=[{historyNodeId:'HN-A-300',mainLineKey:'/LINE-A',reason:'NOT_OBSERVED'}];}));
 assert.ok(codes(r).includes('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED'));assert.deepEqual(r.retirements,[]);
});

test('reactivation ownership, retired preservation and step alignment fail closed',async()=>{
 const a=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{c.requests.find(x=>x.logicalNodeId==='LN-A-REACT').historyNodeId='HN-A-300';}));
 assert.ok(codes(a).includes('REACTIVATION_OWNER_MISMATCH'));
 const b=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{const row=c.matchResult.reactivated[0];c.matchResult.reactivated=[];c.matchResult.matches.push(row);}));
 assert.ok(codes(b).includes('RETIRED_NUMBER_REUSE_PROHIBITED'));
 const c=await allocateZoneEngineeringNodes(await makeInput((d)=>{const n=d.lineHistories[0].historyNodes.find(x=>x.historyNodeId==='HN-A-110');n.engineeringNodeNumber=115;n.immutableFacts.engineeringNodeNumber=115;}));
 assert.ok(codes(c).includes('LEASE_STEP_MISMATCH'));
});

test('full-zone ownership conflicts and missing or inactive leases block',async()=>{
 const a=await allocateZoneEngineeringNodes(await makeInput((d)=>{d.lineHistories[1].historyNodes[0].engineeringNodeNumber=100;d.lineHistories[1].historyNodes[0].immutableFacts.engineeringNodeNumber=100;}));
 assert.ok(codes(a).includes('ENGINEERING_NODE_NUMBER_CONFLICT'));
 const b=await allocateZoneEngineeringNodes(await makeInput((d)=>{d.zoneRegistry.leases=d.zoneRegistry.leases.filter(x=>x.mainLineKey!=='/LINE-A');}));
 assert.ok(codes(b).includes('LEASE_MISSING'));
 const c=await allocateZoneEngineeringNodes(await makeInput((d)=>{d.zoneRegistry.leases.find(x=>x.mainLineKey==='/LINE-A').status='RETIRED';}));
 assert.ok(codes(c).includes('LEASE_INACTIVE'));
});

test('crosses non-contiguous lease ranges only after exhausting the lower range',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{const ids=Array.from({length:9},(_,i)=>`LN-A-N${i+1}`);c.requests=ids.map(logicalNodeId=>({logicalNodeId,mainLineKey:'/LINE-A'}));c.matchResult.matches=[];c.matchResult.reactivated=[];c.matchResult.newNodes=ids.map(logicalNodeId=>({logicalNodeId,outcome:'NO_EXACT_MATCH'}));}));
 assert.equal(r.validation.status,'PASS');
 assert.deepEqual(r.allocations.map(x=>x.engineeringNodeNumber),[120,130,140,150,160,170,180,190,310]);
});

test('authoritative full-line coverage carries only explicit retirement intent',async()=>{
 const r=await allocateZoneEngineeringNodes(await makeInput((d,c)=>{c.matchResult.retirementCandidates=[{historyNodeId:'HN-A-300',mainLineKey:'/LINE-A',reason:'NOT_OBSERVED_IN_COMPLETE_AUTHORITATIVE_COVERAGE'}];}));
 assert.equal(r.validation.status,'PASS');assert.deepEqual(r.retirements.map(x=>x.historyNodeId),['HN-A-300']);
});

test('does not mutate inputs and uses no registry writes, matching or patch authority',async()=>{
 const input=await makeInput(),before=structuredClone(input);await allocateZoneEngineeringNodes(input);assert.deepEqual(input,before);assert.equal(Object.isFrozen(input.historyMatchResult.matches[0]),false);assert.equal(Object.isFrozen(input.lineHistories[0].historyNodes[0]),false);
 for(const file of ['allocation-request-normalizer.js','zone-lease-index.js','allocation-result.js','deterministic-zone-allocator.js']){
  const src=readFileSync(new URL(`../node-history/allocation/${file}`,import.meta.url),'utf8');
  for(const token of ['writeFile(','appendFile(','createWriteStream(','buildTopoNodeRegistryPatch(','matchExactHistoricalNodes(','spatialCandidate'])assert.equal(src.includes(token),false,`${file}: ${token}`);
  assert.ok(src.split('\n').length<=300,`${file} line limit`);
 }
});
