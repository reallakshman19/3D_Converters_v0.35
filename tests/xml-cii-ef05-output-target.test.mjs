import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ciiSha256 } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js';
import { initializeSourceWeightSession,applySourceBackedWeightChange }
  from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js';
import { sourceWeightFromCiiTarget,ciiTargetFromSourceWeight,verifyRequestedCiiOutputWeight }
  from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-output-target.js';

const folder=process.env.EF05_OUTPUT_FIXTURE_DIR;
if(!folder)throw Error('EF05_OUTPUT_FIXTURE_DIR required; generate actual native converter fixture');
const get=name=>fs.readFileSync(path.join(folder,name),'utf8');
const source=get('original.xml'),baseline=get('original.cii');
const updatedSource=get('approved.xml'),updatedCii=get('approved.cii');
const ledger=JSON.parse(get('r4a-r1-verified-lineage.json'));
const engineRunner=job=>({ok:true,ciiText:job.sourceText===source?baseline:
  job.sourceText===updatedSource?updatedCii:null,
  error:'Only actual current-writer baseline/target CII bytes are admitted'});
async function setup(){
 const result={ok:true,ciiText:baseline,ciiName:'output-regression.cii',ciiInputSource:'original',
   finalRigidReviewEvidence:{sourceKind:'xml',engineInputText:source,
     engineInputSha256:await ciiSha256(source),
     originalCiiSha256:await ciiSha256(baseline),
     engineInputDigest:'R4A_SYNTHETIC_CURRENT_WRITER',
     effectiveSourceName:'output-regression.xml',
     supportConfigJson:'{}',stagedJsonText:'',weightScale:10,
     effectiveOptions:{coordsMode:'first',kgToNewton:true,
       splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
       outputMode:'both',analyzeTopology:false,
       generateTopoFix:false,useTopoFixForCii:false},
   }};
 const session=await initializeSourceWeightSession(result,{
   engineRunner,lineageRunner:async()=>structuredClone(ledger),requireR4aLineage:true});
 const row=session.rows.find(x=>x.sourceNode?.componentRefNo==='/RIGID-40');
 assert.ok(row?.eligible,'R1 must link the exact writer source');
 return {result,session,row};
}
test('EF-05: user enters 0.001 CII N; frozen x10 yields exactly 0.0001 kg XML',()=>{
 const target=sourceWeightFromCiiTarget('0.001',10);
 assert.deepEqual([target.sourceToken,target.sourceWeightKg,target.targetOutputWeight],
   ['0.0001',0.0001,0.001]);
 assert.equal(ciiTargetFromSourceWeight('0.0001',10).targetOutputWeight,0.001);
 assert.equal(sourceWeightFromCiiTarget('0.001',1).sourceToken,'0.001');
 for(const [weight,scale] of [['-0.001',10],['0.001',0],['0.001',4],
   ['abc',10],['',10],['0.001',null]]){
   assert.throws(()=>sourceWeightFromCiiTarget(weight,scale),
     /SOURCE_OUTPUT_WEIGHT_HOLD/);
 }
});
test('EF-05 full source CII: real writer 1050.70 to 0.001, exact source XML, no unrelated changes',async()=>{
 const {result,session,row}=await setup();
 assert.equal(row.originalCiiWeight,1050.7);
 assert.equal(row.sourceNode.originalXmlWeight,105.07);
 const target=sourceWeightFromCiiTarget('0.001',session.custody.weightScale);
 const edited=await applySourceBackedWeightChange(session,{
   rigidPointer:row.rigidPointer,newValue:target.sourceToken,
   requestedOutputWeight:'0.001',approved:true,ownerApproved:true,
 },{getCurrentResult:()=>result});
 assert.equal(edited.status,'VERIFIED_REEXTRACT');
 assert.equal(edited.revisedXml,updatedSource);
 assert.equal(edited.revisedCii,updatedCii);
 assert.equal(edited.originalXml,source);
 assert.equal(edited.originalCii,baseline);
 assert.equal(edited.audit.unrelatedXmlBytesChanged,0);
 assert.equal(edited.audit.sourceXmlByteDiff.length,1);
 assert.equal(edited.audit.ciiEngineeringDiff.expectedDifferences.length,1);
 assert.equal(edited.audit.ciiEngineeringDiff.unexpectedDifferences,0);
 assert.equal(edited.audit.requestedOutputVerification.status,
   'EXACT_REQUESTED_RIGID_WEIGHT_VERIFIED');
 assert.equal(edited.audit.requestedOutputVerification.actualCiiOutputWeight,0.001);
 assert.equal(edited.audit.ciiEngineeringDiff.expectedDifferences[0].oldWeight,1050.7);
 assert.equal(result.ciiText,baseline,'input CII is immutable');
});
test('EF-05 fail closed: wrong requested output cannot authorize revised output or a stale pointer',async()=>{
 const {result,session,row}=await setup();
 const target={rigidPointer:row.rigidPointer,newValue:'0.0001',
   approved:true,ownerApproved:true};
 await assert.rejects(()=>applySourceBackedWeightChange(session,{
   ...target,requestedOutputWeight:'0.002'},{getCurrentResult:()=>result}),
   /SOURCE_OUTPUT_WEIGHT_HOLD TARGET_NOT_EMITTED/);
 assert.equal(session.committed,null);
 assert.throws(()=>verifyRequestedCiiOutputWeight({
   requestedOutputWeight:'0.001',rigidPointer:row.rigidPointer,
   ciiEngineeringDiff:{status:'PASS_ENGINEERING_DIFF',unexpectedDifferences:0,
     expectedDifferences:[{oldRigidPointer:row.rigidPointer+1,newWeight:0.001}]}}),
   /SOURCE_OUTPUT_WEIGHT_HOLD TARGET_NOT_EMITTED/);
});
