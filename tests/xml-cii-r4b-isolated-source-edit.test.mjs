import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ciiSha256 } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js';
import { initializeSourceWeightSession } from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js';
import { previewR4bIsolatedSourceEdit,applyR4bIsolatedSourceEdit }
  from '../tabs/xml-cii-2019-standalone/xml-cii-r4b-isolated-source-edit.js';
const folder=process.env.R4B_FIXTURE_DIR;
if(!folder)throw Error('R4B_FIXTURE_DIR missing');
const read=n=>readFileSync(path.join(folder,n),'utf8');
const originalXml=read('original.xml'),originalCii=read('original.cii');
const revisedXml=read('approved.xml'),revisedCii=read('approved.cii');
const lineage=JSON.parse(read('r4a-r1-verified-lineage.json'));
const runner=job=>({ok:true,ciiText:job.sourceText===originalXml?originalCii:
  job.sourceText===revisedXml?revisedCii:null,
  error:'Generated actual converter CII is available only for exact original/revised fixture'});
async function buildResult(){
 return {ok:true,ciiText:originalCii,ciiName:'r4b-two-writer.cii',
   ciiInputSource:'original',finalRigidReviewEvidence:{
     sourceKind:'xml',engineInputText:originalXml,
     engineInputSha256:await ciiSha256(originalXml),
     originalCiiSha256:await ciiSha256(originalCii),
     engineInputDigest:'R4A_SYNTHETIC_CURRENT_WRITER',
     effectiveSourceName:'r4b-two-writer.xml',supportConfigJson:'{}',
     stagedJsonText:'',weightScale:10,
     effectiveOptions:{coordsMode:'first',kgToNewton:true,
       splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
       outputMode:'both',analyzeTopology:false,generateTopoFix:false,useTopoFixForCii:false},
   }};
}
async function session(){
 const result=await buildResult();
 const s=await initializeSourceWeightSession(result,{
   engineRunner:runner,lineageRunner:async()=>structuredClone(lineage),
   requireR4aLineage:true,
 });
 const owner=lineage.sourceNodes.find(x=>x.originalNodeNumber==='40'&&
   x.componentRefNo==='/SHARED-COMP');
 assert.ok(owner,'Fixture must contain the second 15 kg writer');
 const target=lineage.auxiliaryRecords.find(x=>x.writerWeightSourceNode===owner.identity);
 assert.ok(target,'Fixture must link the second writer to a final RIGID');
 assert.equal(s.rows.find(x=>x.rigidPointer===target.recordPointer).eligible,false,
   'R4A must continue to fail closed for multi-RIGID sharing');
 return {result,s,pointer:target.recordPointer};
}
test('R4B 2-writer real-converter outputs: 150 to 26 N, other 150 N, full 15 IEL pointers',async()=>{
 const {result,s,pointer}=await session();
 const preview=await previewR4bIsolatedSourceEdit(s,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result});
 assert.equal(preview.status,'PASS_ISOLATED_CONVERTER_TRIAL_NOT_PHYSICAL_APPROVAL');
 assert.equal(preview.originalWeightCii,150);
 assert.equal(preview.proposedWeightCii,26);
 assert.equal(preview.dependentRigidPointers.length,2);
 assert.equal(preview.originalEmittedGroupKg,30);
 assert.equal(preview.proposedEmittedGroupKg,17.6);
 assert.equal(preview.unexpectedCiiDifferences,0);
 assert.equal(preview.expectedCiiDiff.length,1);
 assert.ok(preview.memberAllocations.some(x=>x.rigidPointer!==pointer&&
   x.oldCiiWeight===150&&x.proposedCiiWeight===150));
 assert.equal(preview.physicalMassAuthority,'NOT_ATTESTED');
 assert.equal(s.r4bCommitted,undefined);
 assert.equal(result.ciiText,originalCii);
});
test('R4B source commit requires explicit group total, documented basis, owner and weight approval',async()=>{
 const {result,s,pointer}=await session();
 const preview=await previewR4bIsolatedSourceEdit(s,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result});
 const approved={rigidPointer:pointer,newValue:'2.6',approved:true,ownerApproved:true,
   requestedOutputWeight:'26',approvedGroupTotalKg:'17.6',
   allocationMode:'OWNER_APPROVED_REVISED_GROUP_TOTAL',
   referenceBasis:'Signed engineering component revision EC-35/36'};
 for(const bad of [
   {...approved,approved:false},
   {...approved,ownerApproved:false},
   {...approved,approvedGroupTotalKg:'15'},
   {...approved,allocationMode:'UNVERIFIED'},
   {...approved,referenceBasis:'unknown'},
 ])await assert.rejects(()=>applyR4bIsolatedSourceEdit(s,preview,bad,
   {getCurrentResult:()=>result}),/R4B_SOURCE_HOLD/);
 assert.equal(s.r4bCommitted,undefined);
 await assert.rejects(()=>applyR4bIsolatedSourceEdit(s,preview,{
   ...approved,requestedOutputWeight:'27',
 },{getCurrentResult:()=>result}),/SOURCE_OUTPUT_WEIGHT_HOLD TARGET_NOT_EMITTED/);
 assert.equal(s.r4bCommitted,undefined);
 const output=await applyR4bIsolatedSourceEdit(s,preview,approved,
   {getCurrentResult:()=>result});
 assert.equal(output.status,'VERIFIED_REEXTRACT');
 assert.equal(output.revisedXml,revisedXml);
 assert.equal(output.revisedCii,revisedCii);
 assert.equal(output.originalXml,originalXml);
 assert.equal(output.originalCii,originalCii);
 assert.equal(output.audit.requestedOutputVerification.requestedCiiOutputWeight,26);
 assert.equal(output.audit.requestedOutputVerification.actualCiiOutputWeight,26);
 assert.equal(output.audit.unrelatedXmlBytesChanged,0);
 assert.equal(output.audit.ciiEngineeringDiff.unexpectedDifferences,0);
 assert.equal(output.audit.approvedPhysicalGroupTotalKg,17.6);
 assert.equal(output.audit.physicalMassAuthority,'USER_ATTESTED_NOT_INDEPENDENTLY_VALIDATED');
 const again=await applyR4bIsolatedSourceEdit(s,preview,approved,
   {getCurrentResult:()=>result});
 assert.equal(again,output);
});
test('R4B stale conversion, changed plan, cross-branch duplication, and wrong writer fail closed',async()=>{
 const {result,s,pointer}=await session();
 const preview=await previewR4bIsolatedSourceEdit(s,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result});
 const approved={rigidPointer:pointer,newValue:'2.6',approved:true,ownerApproved:true,
   approvedGroupTotalKg:'17.6',allocationMode:'OWNER_APPROVED_REVISED_GROUP_TOTAL',
   referenceBasis:'Signed engineering component revision EC-35/36'};
 await assert.rejects(()=>applyR4bIsolatedSourceEdit(s,preview,
   {...approved,newValue:'2.7'},{getCurrentResult:()=>result}),/STALE_PLAN/);
 await assert.rejects(()=>applyR4bIsolatedSourceEdit(s,preview,
   approved,{getCurrentResult:()=>structuredClone(result)}),/STALE_RUN/);
 const forged=structuredClone(preview);
 forged.proposedEmittedGroupKg=18.6;
 forged.memberAllocations[0].proposedCiiWeight=36;
 await assert.rejects(()=>applyR4bIsolatedSourceEdit(s,forged,
   {...approved,approvedGroupTotalKg:'18.6'},{getCurrentResult:()=>result}),
   /PREVIEW_ALLOCATION_TAMPERED/);
 const broken={...s,verifiedLineage:structuredClone(s.verifiedLineage)};
 broken.verifiedLineage.sourceNodes.push({
   ...broken.verifiedLineage.sourceNodes.find(x=>x.componentRefNo==='/SHARED-COMP'),
   identity:'CROSS-BRANCH',branchName:'/ELSEWHERE',branchOrdinal:8,
 });
 await assert.rejects(()=>previewR4bIsolatedSourceEdit(broken,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>broken.originalResult}),
   /CROSS_BRANCH_OWNER/);
 const coupled=async job=>({ok:true,ciiText:job.sourceText===originalXml?originalCii:originalCii});
 await assert.rejects(()=>previewR4bIsolatedSourceEdit(s,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result,engineRunner:coupled}),
   /HOLD_CII_ENGINEERING_DIFF|COUPLED_OR_UNRESOLVED/);
});
