import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ciiSha256 } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js';
import { initializeSourceWeightSession } from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js';
import { classifyR4aComponentRepresentations }
  from '../tabs/xml-cii-2019-standalone/xml-cii-r4a-rigid-ownership.js';
import { buildR4bRigidOwnershipReport }
  from '../tabs/xml-cii-2019-standalone/xml-cii-r4b-ownership-audit.js';
import { previewR4bIsolatedSourceEdit,applyR4bIsolatedSourceEdit }
  from '../tabs/xml-cii-2019-standalone/xml-cii-r4b-isolated-source-edit.js';

const root=process.env.R4C_FIXTURE_DIR;
if(!root)throw Error('R4C_FIXTURE_DIR required');
const read=(name,alt='')=>fs.readFileSync(path.join(root,alt,name),'utf8');

async function session(alt=''){
 const xml=read('original.xml',alt),cii=read('original.cii',alt);
 const lineage=JSON.parse(read('r4a-r1-verified-lineage.json',alt));
 const result={ok:true,ciiText:cii,ciiName:'r4c-verified.cii',ciiInputSource:'original',
  finalRigidReviewEvidence:{
    sourceKind:'xml',engineInputText:xml,
    engineInputSha256:await ciiSha256(xml),
    originalCiiSha256:await ciiSha256(cii),
    engineInputDigest:'R4A_SYNTHETIC_CURRENT_WRITER',
    effectiveSourceName:'r4c-original.xml',
    supportConfigJson:'{}',stagedJsonText:'',weightScale:10,
    effectiveOptions:{
      coordsMode:'first',kgToNewton:true,splitCondensedValveFlange:true,
      useRestraintTypeBasedOnJson:true,outputMode:'both',
      analyzeTopology:false,generateTopoFix:false,useTopoFixForCii:false,
    },
  }};
 const originalApproved=alt?'':read('r4c-approved.xml');
 const revisedCii=alt?'':read('r4c-approved.cii');
 const engineRunner=job=>({ok:true,
   ciiText:job.sourceText===xml?cii:job.sourceText===originalApproved?revisedCii:null,
   error:'Only exact native converter baseline/revised CII are admitted'});
 const s=await initializeSourceWeightSession(result,{
   engineRunner,lineageRunner:async()=>structuredClone(lineage),requireR4aLineage:true});
 const writer=lineage.sourceNodes.find(x=>x.componentRefNo==='/SHARED-COMP'&&
   x.originalNodeNumber==='20');
 assert.ok(writer);
 const aux=lineage.auxiliaryRecords.find(x=>x.writerWeightSourceNode===writer.identity);
 assert.ok(aux);
 const pointer=aux.recordPointer,row=s.rows.find(x=>x.rigidPointer===pointer);
 assert.equal(row.originalCiiWeight,150);
 // Emulate the reported conservative HOLD without falsifying frozen source,
 // current converter no-edit parity, source identity, or R1 ledger.
 s.rows=s.rows.map(x=>x.rigidPointer===pointer?{
   ...x,eligible:false,completeAllocation:false,status:'HOLD',
   reasonCode:'SOURCE_OWNER_AMBIGUOUS',
   reason:'Repeated component endpoint representation awaiting isolation',
 }:x);
 const report=await buildR4bRigidOwnershipReport(s);
 s.r4bAudit=report;
 s.r4bAuditByPointer=new Map(report.rows.map(x=>[x.rigidPointer,x]));
 return {s,result,pointer,writer,lineage,engineRunner};
}

test('R4C classifier explains exact branch, mass, writer conflicts',()=>{
 const writer={identity:'W',branchName:'/B',branchOrdinal:0,nodeOrdinal:1,
   originalNodeNumber:'346',componentRefNo:'134234934/24681',fields:{Weight:'9.689'}};
 const witness={identity:'Z',branchName:'/B',branchOrdinal:0,nodeOrdinal:0,
   originalNodeNumber:'340',componentRefNo:'134234934/24681',fields:{Weight:'0'}};
 const map=new Map([['W',new Set([9])]]);
 const okay=classifyR4aComponentRepresentations({
   componentNodes:[writer,witness],selectedSourceIdentity:'W',writerDependents:map});
 assert.equal(okay.qualified,true);
 assert.deepEqual(okay.failureCodes,[]);
 const cases=[
   [{...witness,branchOrdinal:1,branchName:'/X'},'CROSS_BRANCH_COMPONENT_REF'],
   [{...witness,fields:{Weight:'3.2'}},'NON_WRITER_WEIGHT_CONFLICT'],
   [{...witness,fields:{Weight:''}},'NON_WRITER_WEIGHT_MISSING_OR_INVALID'],
 ];
 for(const [n,code] of cases){
   const got=classifyR4aComponentRepresentations({
     componentNodes:[writer,n],selectedSourceIdentity:'W',writerDependents:map});
   assert.equal(got.qualified,false);
   assert.ok(got.failureCodes.includes(code));
   assert.ok(got.issues.some(x=>x.code===code));
 }
 const extra=classifyR4aComponentRepresentations({
  componentNodes:[writer,witness],selectedSourceIdentity:'W',
  writerDependents:new Map([['W',new Set([9])],['Z',new Set([10])]])});
 assert.ok(extra.failureCodes.includes('ADDITIONAL_RIGID_WRITER'));
});

test('R4C one 150N writer and 0kg endpoint witness: source what-if emits only 26N',async()=>{
 const {s,result,pointer}=await session();
 assert.equal(s.r4bAuditByPointer.get(pointer).probeCandidate,true);
 const preview=await previewR4bIsolatedSourceEdit(s,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result});
 assert.equal(preview.status,'PASS_ISOLATED_CONVERTER_TRIAL_NOT_PHYSICAL_APPROVAL');
 assert.equal(preview.ownershipTopology,'ONE_WRITER_MULTIPLE_ZERO_MASS_ENDPOINTS');
 assert.deepEqual(preview.dependentRigidPointers,[pointer]);
 assert.equal(preview.zeroMassSourceWitnesses.length,1);
 assert.equal(preview.zeroMassSourceWitnesses[0].nodeNumber,'30');
 assert.equal(preview.zeroMassSourceWitnesses[0].originalToken,'0');
 assert.equal(preview.originalWeightCii,150);
 assert.equal(preview.proposedWeightCii,26);
 assert.equal(preview.originalEmittedGroupKg,15);
 assert.equal(preview.proposedEmittedGroupKg,2.6);
 assert.equal(preview.unexpectedCiiDifferences,0);
 assert.equal(preview.expectedCiiDiff.length,1);
 assert.equal(s.r4bCommitted,undefined);
 assert.equal(result.ciiText,read('original.cii'));
});

test('R4C isolated writer Apply requires documented total and explicit owner approval',async()=>{
 const {s,result,pointer}=await session();
 const preview=await previewR4bIsolatedSourceEdit(s,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result});
 const approval={rigidPointer:pointer,newValue:'2.6',requestedOutputWeight:'26',
   approved:true,ownerApproved:true,approvedGroupTotalKg:'2.6',
   allocationMode:'OWNER_APPROVED_REVISED_GROUP_TOTAL',
   referenceBasis:'Approved physical allocation test record REVIEW-24681'};
 for(const bad of [
   {...approval,ownerApproved:false},
   {...approval,approvedGroupTotalKg:'15'},
   {...approval,requestedOutputWeight:'27'},
   {...approval,referenceBasis:'unknown'},
 ]){
   await assert.rejects(()=>applyR4bIsolatedSourceEdit(s,preview,bad,
     {getCurrentResult:()=>result}),/HOLD/);
   assert.equal(s.r4bCommitted,undefined);
 }
 const output=await applyR4bIsolatedSourceEdit(s,preview,approval,
   {getCurrentResult:()=>result});
 assert.equal(output.status,'VERIFIED_REEXTRACT');
 assert.equal(output.revisedXml,read('r4c-approved.xml'));
 assert.equal(output.revisedCii,read('r4c-approved.cii'));
 assert.equal(output.audit.ownershipTopology,'ONE_WRITER_MULTIPLE_ZERO_MASS_ENDPOINTS');
 assert.equal(output.audit.zeroMassSourceWitnesses.length,1);
 assert.equal(output.audit.ciiEngineeringDiff.unexpectedDifferences,0);
 assert.equal(output.audit.requestedOutputVerification.actualCiiOutputWeight,26);
 assert.equal(output.audit.physicalMassAuthority,'USER_ATTESTED_NOT_INDEPENDENTLY_VALIDATED');
});

test('R4C real positive-mass non-writer fails before trial or download',async()=>{
 const {s,result,pointer}=await session('conflict');
 assert.equal(s.rows.find(x=>x.rigidPointer===pointer).eligible,false);
 await assert.rejects(()=>previewR4bIsolatedSourceEdit(s,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result}),
   /NON_WRITER_MASS_CONFLICT/);
 assert.equal(s.r4bCommitted,undefined);
});

test('R4C mismatched branch, lost writer, and incomplete related RIGID remain HOLD',async()=>{
 const {s,result,pointer,writer}=await session();
 const copy={...s,verifiedLineage:structuredClone(s.verifiedLineage)};
 const witness=copy.verifiedLineage.sourceNodes.find(x=>
   x.componentRefNo===writer.componentRefNo&&x.identity!==writer.identity);
 witness.branchOrdinal=999;witness.branchName='/OTHER';
 await assert.rejects(()=>previewR4bIsolatedSourceEdit(copy,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result}),
   /CROSS_BRANCH_OWNER/);
 const missing={...s,verifiedLineage:structuredClone(s.verifiedLineage)};
 missing.verifiedLineage.auxiliaryRecords
   .find(x=>x.recordPointer===pointer).writerWeightSourceNode=null;
 await assert.rejects(()=>previewR4bIsolatedSourceEdit(missing,{
   rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result}),
   /OWNER_AMBIGUOUS/);
});
