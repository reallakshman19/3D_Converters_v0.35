import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ciiSha256 } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js';
import { buildFrozenCiiRunPackage,verifyFrozenCiiRunPackage,FROZEN_CII_RUN_SCHEMA }
  from '../tabs/xml-cii-2019-standalone/xml-cii-frozen-run-package.js';

const dir=process.env.R4A_FIXTURE_DIR;
if(!dir)throw Error('R4A_FIXTURE_DIR is required; use actual native-converter fixture.');
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const xml=read('original.xml'),cii=read('original.cii');
const options={coordsMode:'first',kgToNewton:true,
  splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
  outputMode:'both',analyzeTopology:false,generateTopoFix:false,useTopoFixForCii:false};

async function result(){
  return {ok:true,ciiInputSource:'original',ciiText:cii,ciiName:'synthetic-original.cii',
    diagnostics:{runParityEvidence:{ok:true,status:'PASS',comparisons:7}},
    finalRigidReviewEvidence:{
      sourceKind:'xml',engineInputText:xml,stagedJsonText:'',
      supportConfigJson:'{}',weightScale:10,engineInputDigest:'synthetic-current-writer',
      engineInputSha256:await ciiSha256(xml),
      originalCiiSha256:await ciiSha256(cii),
      effectiveSourceName:'original.xml',effectiveOptions:options,
      originalCiiName:'synthetic-original.cii',
    }};
}

test('current CII run bundle captures actual native-writer EnrichedXML/CII/config exact bytes and re-verifies',async()=>{
 const run=await result();
 const pkg=await buildFrozenCiiRunPackage(run);
 assert.equal(pkg.schema,FROZEN_CII_RUN_SCHEMA);
 assert.equal(pkg.payloads.engineInputXml,xml);
 assert.equal(pkg.payloads.originalCii,cii);
 assert.equal(pkg.payloads.supportConfigJson,'{}');
 assert.equal(pkg.payloads.stagedJsonText,'');
 assert.deepEqual(pkg.payloads.effectiveOptions,options);
 assert.equal(pkg.currentRun.elementCount,11);
 assert.equal(pkg.currentRun.rigidCount,6);
 assert.equal(pkg.currentRun.weightScale,10);
 assert.equal(pkg.currentRun.runParity.status,'PASS');
 assert.equal(pkg.originalRawUpload,'NOT_CAPTURED_BY_CONVERTER_BOUNDARY');
 assert.equal(pkg.importedMasterBinaryFiles,'NOT_CAPTURED_USE_OWNER_ORIGINALS_WITH_HASHES');
 const verified=await verifyFrozenCiiRunPackage(JSON.parse(JSON.stringify(pkg)));
 assert.equal(verified.elements,11);
 assert.equal(verified.status,'PASS_FROZEN_CONVERTER_BOUNDARY');
 assert.equal(verified.rigids,6);
});
test('staged JSON and config bytes are preserved rather than replaced by inferred defaults',async()=>{
 const run=await result();
 run.finalRigidReviewEvidence.stagedJsonText='[{"name":"/BRANCH","type":"BRANCH"}]';
 run.finalRigidReviewEvidence.supportConfigJson='{"weight":{"masterRows":[{"id":"OWNER-MASTER"}]}}';
 const pkg=await buildFrozenCiiRunPackage(run);
 assert.equal(pkg.payloads.stagedJsonText,run.finalRigidReviewEvidence.stagedJsonText);
 assert.equal(pkg.payloads.supportConfigJson,run.finalRigidReviewEvidence.supportConfigJson);
 assert.equal((await verifyFrozenCiiRunPackage(pkg)).rigids,6);
 const bad=structuredClone(pkg);bad.payloads.stagedJsonText+=' ';
 await assert.rejects(()=>verifyFrozenCiiRunPackage(bad),/SHA-256 mismatch for stagedJsonSha256/);
});
test('frozen package fails closed on stale source/CII, missing config/options or mislabelled counts',async()=>{
 const run=await result();
 const cases=[
  [{...run,ciiText:cii+'\n'},/SHA-256/],
  [{...run,finalRigidReviewEvidence:{...run.finalRigidReviewEvidence,
    supportConfigJson:''}},/Exact effective EnrichedXML/],
  [{...run,finalRigidReviewEvidence:{...run.finalRigidReviewEvidence,
    effectiveOptions:{...options,kgToNewton:'yes'}}},/Exact converter options/],
  [{...run,ciiInputSource:'topofix'},/successful normal XML-to-CII/],
 ];
 for(const [bad,re]of cases)
  await assert.rejects(()=>buildFrozenCiiRunPackage(bad),re);
 const pkg=await buildFrozenCiiRunPackage(run);
 const badCount=structuredClone(pkg);badCount.currentRun.rigidCount=145;
 await assert.rejects(()=>verifyFrozenCiiRunPackage(badCount),/counts or weight scale/);
 const badCii=structuredClone(pkg);badCii.payloads.originalCii+=' ';
 await assert.rejects(()=>verifyFrozenCiiRunPackage(badCii),/SHA-256 mismatch/);
 const badOptions=structuredClone(pkg);badOptions.payloads.effectiveOptions.kgToNewton=false;
 await assert.rejects(()=>verifyFrozenCiiRunPackage(badOptions),/SHA-256 mismatch/);
});
test('missing frozen provenance refuses export rather than inventing the absent historical 145-RIGID config',async()=>{
 const run=await result();
 delete run.finalRigidReviewEvidence;
 await assert.rejects(()=>buildFrozenCiiRunPackage(run),/normal XML-to-CII/);
 const future=await result();
 future.finalRigidReviewEvidence.engineInputSha256='a'.repeat(64);
 await assert.rejects(()=>buildFrozenCiiRunPackage(future),/SHA-256/);
});
