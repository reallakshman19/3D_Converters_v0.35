import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ciiSha256 } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js';
import { inspectXmlWeightSources, applyXmlSourceEdits } from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-patch.js';
import { deriveSourceWeightEligibility, verifyFrozenCiiEngineeringValues } from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-ownership.js';
import { initializeSourceWeightSession, applySourceBackedWeightChange } from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js';
import { indexAll15CiiAuxiliaryPointers, verifySourceEditedCii } from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-cii-verify.js';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';

const root=process.env.R2_SYNTHETIC_DIR;
if(!root) throw Error('R2_SYNTHETIC_DIR required; run tests/r2_prepare_synthetic_fixture.py first');
const originalXml=readFileSync(join(root,'original.xml'),'utf8');
const revisedXml=readFileSync(join(root,'approved.xml'),'utf8');
const originalCii=readFileSync(join(root,'original.cii'),'utf8');
const revisedCii=readFileSync(join(root,'approved.cii'),'utf8');

async function setup(xml=originalXml,cii=originalCii,options={}){
  return {
    ok:true,ciiText:cii,ciiName:'r2-synthetic-original.cii',ciiInputSource:'original',
    finalRigidReviewEvidence:{
      sourceKind:'xml',engineInputText:xml,engineInputSha256:await ciiSha256(xml),
      originalCiiSha256:await ciiSha256(cii),engineInputDigest:'R2-SYNTHETIC-CURRENT-WRITER',
      sourceName:'r2-synthetic.xml',effectiveSourceName:'r2-synthetic.xml',
      weightScale:10,stagedJsonText:'',supportConfigJson:'{}',
      effectiveOptions:{
        coordsMode:'first',kgToNewton:true,splitCondensedValveFlange:true,
        useRestraintTypeBasedOnJson:true,outputMode:'both',
        analyzeTopology:false,generateTopoFix:false,useTopoFixForCii:false,
        ...options},
    },
  };
}
const engineCalls=[];
function engineRunner(job){
  engineCalls.push(structuredClone(job));
  return {ok:true,ciiText:job.sourceText===originalXml?originalCii:
    job.sourceText===revisedXml?revisedCii:null,
    error:job.sourceText===originalXml||job.sourceText===revisedXml ? null :'Unexpected XML mutated beyond approved field'};
}
function r40(session){
  return session.rows.find(x=>x.sourceNode?.componentRefNo==='/RIGID-40');
}
function transaction(pointer,newValue='2.984'){
  return {rigidPointer:pointer,newValue,approved:true,ownerApproved:true,zeroConfirmed:false};
}
test('R2 no-edit browser-compatible engine adapter receives original XML/options unchanged',async()=>{
  engineCalls.length=0;
  const result=await setup();
  const session=await initializeSourceWeightSession(result,{engineRunner});
  assert.equal(session.noEditParity.status,'PASS_EXACT_REPLAY');
  assert.equal(session.valueIntegrity,'SERIALIZED_VALUES_VERIFIED');
  assert.equal(engineCalls.length,1);
  assert.equal(engineCalls[0].sourceText,originalXml);
  assert.equal(engineCalls[0].supportConfigJson,'{}');
  assert.equal(engineCalls[0].options.outputMode,'cii-only');
  assert.equal(engineCalls[0].options.kgToNewton,true);
  assert.ok(r40(session)?.eligible);
});
test('R2 one explicitly approved unique source Weight edit regenerates correct 29.84 CII',async()=>{
  engineCalls.length=0;
  const result=await setup();
  const originalDigest=await ciiSha256(originalXml);
  const session=await initializeSourceWeightSession(result,{engineRunner});
  const row=r40(session);
  assert.equal(row.sourceNode.originalXmlWeight,6);
  assert.equal(row.originalCiiWeight,60);
  const verified=await applySourceBackedWeightChange(session,transaction(row.rigidPointer),
    {getCurrentResult:()=>result});
  assert.equal(verified.status,'VERIFIED_REEXTRACT');
  assert.equal(verified.revisedXml,revisedXml);
  assert.equal(verified.revisedCii,revisedCii);
  assert.equal(verified.audit.ciiEngineeringDiff.expectedDifferences.length,1);
  assert.equal(verified.audit.ciiEngineeringDiff.expectedDifferences[0].newWeight,29.84);
  assert.equal(verified.audit.ciiEngineeringDiff.unexpectedDifferences,0);
  assert.equal(verified.audit.unrelatedXmlBytesChanged,0);
  assert.equal(await ciiSha256(originalXml),originalDigest);
  assert.equal(result.ciiText,originalCii);
  assert.equal(engineCalls.length,2);
  assert.equal(engineCalls[1].sourceText,revisedXml);
  assert.equal(engineCalls[1].options.kgToNewton,true);
  const repeat=await applySourceBackedWeightChange(session,transaction(row.rigidPointer),
    {getCurrentResult:()=>result});
  assert.equal(repeat,verified);
  assert.equal(engineCalls.length,2,'second Apply must not rerun same edit');
});
test('R2 strict physical ownership refuses real conflict, not only missing selector',async()=>{
  const result=await setup();
  const session=await initializeSourceWeightSession(result,{engineRunner});
  const shared=session.rows.find(x=>x.reason.includes('shared by multiple source nodes'));
  assert.ok(shared,'the real synthetic input has one ComponentRefNo repeated across different source nodes');
  assert.equal(shared.eligible,false);
  await assert.rejects(()=>applySourceBackedWeightChange(session,transaction(shared.rigidPointer)),
    /shared by multiple source nodes/);
});
test('R2 physical approval and suggestion separation and stale conversion inputs',async()=>{
  const result=await setup();
  const session=await initializeSourceWeightSession(result,{engineRunner});
  const p=r40(session).rigidPointer;
  await assert.rejects(()=>applySourceBackedWeightChange(session,{
    rigidPointer:p,newValue:'2.984',approved:false,ownerApproved:true}),/explicit weight approval/);
  await assert.rejects(()=>applySourceBackedWeightChange(session,{
    rigidPointer:p,newValue:'2.984',approved:true,ownerApproved:false}),/physical-owner authorization/);
  result.finalRigidReviewEvidence.supportConfigJson='{"changed":true}';
  await assert.rejects(()=>applySourceBackedWeightChange(session,transaction(p),
    {getCurrentResult:()=>result}),/stale current run/);
});
test('R2 writer overwrite failure never exposes revised outputs',async()=>{
  const result=await setup();
  const sticky=(job)=>({ok:true,ciiText:originalCii});
  const session=await initializeSourceWeightSession(result,{engineRunner:sticky});
  await assert.rejects(()=>applySourceBackedWeightChange(session,
    transaction(r40(session).rigidPointer)),/overwritten|missing RIGID weight change/);
  assert.equal(session.committed,null);
});
test('R2 noedit mismatch fails closed before enabling source edit',async()=>{
  const result=await setup();
  await assert.rejects(()=>initializeSourceWeightSession(result,{
    engineRunner:()=>({ok:true,ciiText:revisedCii})}),/not byte-identical/);
});
test('R2 full 15 pointer fields valid and missing or invalid pointer refused',()=>{
  const index=indexAll15CiiAuxiliaryPointers(originalCii);
  assert.equal(index.pointerFieldsValidated,15);
  assert.ok(index.inventory.rows.length>=6);
  const corrupted=originalCii.replace(/(#\$\s+ELEMENTS\s*\n(?:[^\n]*\n){12})([^\n]*)/,
    (all,prefix,row)=>prefix+row.slice(0,15)+'         9999'+row.slice(28));
  assert.notEqual(corrupted,originalCii);
  assert.throws(()=>indexAll15CiiAuxiliaryPointers(corrupted),/pointer|RIGID/);
});
test('R2 ledger-only RIGID.weight and ELEMENT.OD mutations are refused',async()=>{
  const result=await setup();
  const inv=parseFinalCiiRigidInventory(originalCii);
  const entries=await deriveSourceWeightEligibility({result,inventory:inv});
  assert.equal(verifyFrozenCiiEngineeringValues({originalCiiText:originalCii,
    inventory:inv,entries}).status,'SERIALIZED_VALUES_VERIFIED');
  const alt1=structuredClone(inv);
  alt1.rows[0].weight+=100;
  assert.throws(()=>verifyFrozenCiiEngineeringValues({originalCiiText:originalCii,
    inventory:alt1,entries}),/HOLD_VALUE_MISMATCH/);
  const alt2=structuredClone(inv);
  alt2.rows.find(r=>r.linkedElements.length).linkedElements[0].outsideDiameterMm+=10;
  assert.throws(()=>verifyFrozenCiiEngineeringValues({originalCiiText:originalCii,
    inventory:alt2,entries}),/HOLD_VALUE_MISMATCH/);
});
test('R2 XML patch preserves original bytes, rejects duplicate field, invalid/negative/blank and missing Weight',async()=>{
  const source=inspectXmlWeightSources(originalXml);
  const row=source.find(x=>x.componentRefNo==='/RIGID-40');
  assert.ok(row?.weightField);
  const identity={branchName:row.branchName,branchOrdinal:row.branchOrdinal,
    nodeOrdinal:row.nodeOrdinal,nodeNumber:row.nodeNumber,componentRefNo:row.componentRefNo};
  const edit={propertyId:'Node/Weight',approved:true,ownerApproved:true,
    originalToken:'6',newValue:'2.984',...identity};
  const originalSha256=await ciiSha256(originalXml);
  const patch=await applyXmlSourceEdits({originalXml,originalSha256,edits:[edit]});
  assert.equal(patch.revisedXml,revisedXml);
  assert.equal(patch.unrelatedXmlBytesChanged,0);
  assert.equal(patch.edits.length,1);
  await assert.rejects(()=>applyXmlSourceEdits({originalXml,originalSha256,
    edits:[edit,edit]}),/duplicate|overlapping/);
  for(const newValue of ['', '-3', 'NaN', 'Infinity']) {
    await assert.rejects(()=>applyXmlSourceEdits({originalXml,originalSha256,
      edits:[{...edit,newValue}]}));
  }
  await assert.rejects(()=>applyXmlSourceEdits({originalXml,originalSha256:'stale',
    edits:[edit]}),/stale EnrichedXML/);
  await assert.rejects(()=>applyXmlSourceEdits({originalXml,originalSha256,
    edits:[{...edit,componentRefNo:'/WRONG'}]}),/exactly one/);
  await assert.rejects(()=>applyXmlSourceEdits({originalXml,originalSha256,
    edits:[{...edit,originalToken:'5'}]}),/stale source/);
  const missing=originalXml.replace('<Weight>6</Weight>','');
  const missingSha256=await ciiSha256(missing);
  await assert.rejects(()=>applyXmlSourceEdits({originalXml:missing,
    originalSha256:missingSha256,edits:[edit]}),/missing/);
});
test('R2 other property descriptors can reuse byte patch core but production whitelist remains Weight only',async()=>{
  const row=inspectXmlWeightSources(originalXml).find(x=>x.componentRefNo==='/RIGID-40');
  assert.ok(row.weightField);
  assert.equal((await setup()).finalRigidReviewEvidence.sourceKind,'xml');
  const source=await ciiSha256(originalXml);
  await assert.rejects(()=>applyXmlSourceEdits({originalXml,
    originalSha256:source,edits:[{branchName:row.branchName,
      branchOrdinal:row.branchOrdinal,nodeOrdinal:row.nodeOrdinal,
      nodeNumber:row.nodeNumber,componentRefNo:row.componentRefNo,
      propertyId:'Node/Rating',originalToken:'300',newValue:'600',
      approved:true,ownerApproved:true}]}),/unsupported/);
});
test('R2 unapproved RIGID Type/OD or other engineering changes refuse revised output',async()=>{
  const result=await setup();
  const session=await initializeSourceWeightSession(result,{engineRunner});
  const row=r40(session);
  const params={originalCiiText:originalCii,originalSha256:await ciiSha256(originalCii),
    approved:{...row,newValue:2.984}};
  assert.equal((await verifySourceEditedCii({...params,revisedCiiText:revisedCii})).status,
    'PASS_ENGINEERING_DIFF');
  const odChange=revisedCii.replace('6.030000E+01','6.040000E+01');
  if(odChange!==revisedCii)
    await assert.rejects(()=>verifySourceEditedCii({...params,revisedCiiText:odChange}),
      /engineering|HOLD_CII/);
  const extras=revisedCii.replace('#$ RIGID\n','#$ RIGID\n   0.0\n');
  await assert.rejects(()=>verifySourceEditedCii({...params,revisedCiiText:extras}),
    /CONTROL|record|section|HOLD_CII/);
});
