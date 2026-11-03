import assert from 'node:assert/strict';
import { evaluateExactHeadEvidence, FBX_EXACT_HEAD_IDENTITY_FIELDS } from '../../tabs/model-converters/converters/fbx/benchmark-audit/exact-head-evidence.js';
const sha1=(char)=>char.repeat(40),sha256=(char)=>char.repeat(64);
function identity(){return Object.fromEntries(FBX_EXACT_HEAD_IDENTITY_FIELDS.map((field)=>{
  if(['repositoryCommit','repositoryTree','benchmarkCommit','benchmarkBlobSha'].includes(field))return[field,sha1('a')];
  if(field==='checkoutState')return[field,'CLEAN'];if(field==='benchmarkPath')return[field,'Benchmarks/fbx BM/StaggedJsonBMforFBX'];if(field==='benchmarkByteLength')return[field,123];return[field,sha256('b')];}));}
function evidence(){const authority=identity();return{schema:'FbxExactHeadEvidence.v3',authority,observed:structuredClone(authority),regressionStatus:'PASS',determinismStatus:'PASS'};}
assert.equal(evaluateExactHeadEvidence(evidence()).status,'PASS');
for(const field of FBX_EXACT_HEAD_IDENTITY_FIELDS){const mismatch=evidence();if(field==='benchmarkByteLength')mismatch.observed[field]+=1;else if(field==='benchmarkPath')mismatch.observed[field]+='.wrong';else if(field==='checkoutState')mismatch.observed[field]='DIRTY';else if(mismatch.observed[field].length===40)mismatch.observed[field]=sha1('f');else mismatch.observed[field]=sha256('f');const result=evaluateExactHeadEvidence(mismatch);assert.equal(result.status,'FAIL');assert.ok(result.failedCheckIds.includes(field));}
const repeat=evidence();repeat.observed.run2EvidenceIndexSha256=sha256('c');repeat.authority.run2EvidenceIndexSha256=sha256('c');assert.ok(evaluateExactHeadEvidence(repeat).failedCheckIds.includes('repeatEvidenceIndexSha256'));
console.log('test-benchmark-exact-head-evidence: PASS');
