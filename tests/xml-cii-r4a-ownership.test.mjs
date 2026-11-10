import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ciiSha256 } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { projectR4aOwnership, summarizeR4aOwnership } from '../tabs/xml-cii-2019-standalone/xml-cii-r4a-rigid-ownership.js';
import { reconcileR4aPhysicalMass } from '../tabs/xml-cii-2019-standalone/xml-cii-r4a-mass-reconcile.js';
import { initializeSourceWeightSession, applySourceBackedWeightChange }
 from '../tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js';

const root=process.env.R4A_FIXTURE_DIR;
if(!root)throw Error('R4A_FIXTURE_DIR missing; generate existing real converter fixtures first');
const get=name=>fs.readFileSync(path.join(root,name),'utf8');
const xml=get('original.xml'),cii=get('original.cii');
const revisedXml=get('approved.xml'),revisedCii=get('approved.cii');
const r1=JSON.parse(get('r4a-r1-verified-lineage.json'));

async function makeResult(config='{}') {
 return {ok:true,ciiText:cii,ciiName:'r4a-synthetic-current-writer.cii',
  ciiInputSource:'original',
  finalRigidReviewEvidence:{
   sourceKind:'xml',engineInputText:xml,engineInputSha256:await ciiSha256(xml),
   originalCiiSha256:await ciiSha256(cii),
   engineInputDigest:'R4A_SYNTHETIC_CURRENT_WRITER',
   sourceName:'r4a-synthetic.xml',effectiveSourceName:'r4a-synthetic.xml',
   supportConfigJson:config,stagedJsonText:'',weightScale:10,
   effectiveOptions:{
     coordsMode:'first',kgToNewton:true,splitCondensedValveFlange:true,
     useRestraintTypeBasedOnJson:true,outputMode:'both',
     analyzeTopology:false,generateTopoFix:false,useTopoFixForCii:false,
   },
  }};
}
const engineRunner=job=>({ok:true,ciiText:job.sourceText===xml?cii:
  job.sourceText===revisedXml?revisedCii:null,error:'Only converter-generated fixture output permitted'});
const lineageRunner=async()=>structuredClone(r1);

async function project(lineage=r1,result=await makeResult()){
 return projectR4aOwnership({result,
  inventory:parseFinalCiiRigidInventory(result.ciiText),
  verifiedLineage:lineage});
}

test('R4A final-RIGID projection one row per CII record, real R1 Python proof',async()=>{
 const p=await project();
 assert.equal(p.rows.length,6);
 assert.equal(p.physicalMassApprovals,0);
 assert.equal(p.verification.all15PointersRevalidatedInPython,true);
 assert.equal(summarizeR4aOwnership(p.rows).total,6);
 assert.equal(summarizeR4aOwnership(p.rows).held+p.qualifiedStructuralOwners,6);
 const target=p.rows.find(row=>row.sourceNode?.componentRefNo==='/RIGID-40');
 assert.ok(target,'R1 Python should identify /RIGID-40 physical source');
 assert.equal(target.eligible,true);
 assert.equal(target.originalPhysicalMassKg,6);
 assert.equal(target.originalAllocatedMassKg,6);
 assert.equal(target.originalCiiWeight,60);
 assert.equal(target.allocationRule,'ONE_UNIQUE_WRITER_SOURCE_ONE_EMITTED_RIGID');
 assert.equal(target.completeAllocation,true);
 assert.deepEqual(target.dependentPointers,[target.rigidPointer]);
 assert.ok(target.evidence.r1SnapshotFingerprint);
 assert.equal(target.status,'SOURCE_MAPPING_VERIFIED_APPROVAL_REQUIRED');
 assert.equal(target.reasonCode,'PHYSICAL_MASS_APPROVAL_REQUIRED');
});

test('R4A uses actual R1 Python negative-renumber/short-deletion event identities',async()=>{
 const p=await project();
 assert.ok(r1.sourceNodes.length>0);
 assert.ok(r1.pythonPreprocessedNodes.length>0);
 const events=r1.transformations.map(e=>e.stage);
 assert.ok(events.includes('PYTHON_SHORT_NODE_DROP')||events.includes('PYTHON_NODE_RENUMBER'));
 const records=p.rows.filter(x=>x.eligible);
 assert.ok(records.every(x=>x.sourceEdgeIdentities.length===2));
 assert.ok(records.every(x=>x.pythonTransformedNodeIdentities.length>=1));
 assert.ok(records.every(x=>x.sourceInputSha256===r1.runIdentity.sourceXmlSha256));
});

test('R4A replay, explicit approvals, actual changed XML and CII, mass conservation',async()=>{
 const result=await makeResult();
 const session=await initializeSourceWeightSession(result,{
   engineRunner,lineageRunner,requireR4aLineage:true,
 });
 assert.equal(session.ownership.status,'READ_ONLY_STRUCTURAL_CANDIDATES');
 assert.equal(session.noEditParity.differingBytes,0);
 const row=session.rows.find(x=>x.sourceNode?.componentRefNo==='/RIGID-40');
 assert.ok(row?.eligible);
 const input={rigidPointer:row.rigidPointer,newValue:'2.984',
   approved:true,ownerApproved:true};
 await assert.rejects(()=>applySourceBackedWeightChange(session,{
   ...input,approved:false}),/explicit weight approval/);
 await assert.rejects(()=>applySourceBackedWeightChange(session,{
   ...input,ownerApproved:false}),/physical-owner authorization/);
 const output=await applySourceBackedWeightChange(session,input,{getCurrentResult:()=>result});
 assert.equal(output.status,'VERIFIED_REEXTRACT');
 assert.equal(output.revisedXml,revisedXml);
 assert.equal(output.revisedCii,revisedCii);
 assert.equal(output.originalXml,xml);
 assert.equal(output.originalCii,cii);
 assert.equal(output.audit.massReconciliation.status,'PASS_PHYSICAL_MASS_CONSERVATION_AFTER_APPROVAL');
 assert.equal(output.audit.massReconciliation.originalPhysicalMassKg,6);
 assert.equal(output.audit.massReconciliation.approvedRevisedPhysicalMassKg,2.984);
 assert.equal(output.audit.massReconciliation.originalEmittedCiiWeight,60);
 assert.equal(output.audit.massReconciliation.newEmittedCiiWeight,29.84);
 assert.equal(output.audit.massReconciliation.unexpectedEngineeringDifferences,0);
 assert.equal(output.audit.unrelatedXmlBytesChanged,0);
 assert.equal(output.audit.ciiEngineeringDiff.unexpectedDifferences,0);
 assert.equal(output.audit.sourceTransformationHistory.length>=0,true);
 assert.equal(result.ciiText,cii);
 const second=await applySourceBackedWeightChange(session,input,{getCurrentResult:()=>result});
 assert.equal(second,output,'same transaction must be idempotent');
});

test('R4A stale config, contradictory source and pointer proofs fail closed',async()=>{
 const result=await makeResult();
 for(const [key,change,code]of [
  ['config',r=>{r.finalRigidReviewEvidence.supportConfigJson='{"x":1}';},'CONFIGURATION_NOT_FROZEN'],
  ['cii',r=>{r.finalRigidReviewEvidence.originalCiiSha256='stale';},'CONFIGURATION_NOT_FROZEN'],
 ]){
  const changed=structuredClone(result);change(changed);
  const projection=await project(r1,changed);
  assert.equal(projection.qualifiedStructuralOwners,0,key);
  assert.equal(projection.rows[0].reasonCode,code);
 }
 const tampered=structuredClone(r1);
 const rigid= tampered.auxiliaryRecords.find(x=>x.writerWeightSourceNode);
 rigid.linkedElements=[999999];
 const p=await project(tampered,result);
 const affected=p.rows.find(x=>x.rigidPointer===rigid.recordPointer);
 assert.equal(affected.eligible,false);
 assert.equal(affected.reasonCode,'RIGID_POINTER_MISMATCH');
});

test('R4A ambiguous duplicate ComponentRefNo cannot become physical ownership',async()=>{
 const result=await makeResult();
 const p=await project();
 assert.equal(p.rows.filter(x=>x.eligible&&x.physicalComponentRefNo==='/SHARED-COMP').length,0);
 const target=p.rows.find(x=>x.sourceNode?.componentRefNo==='/RIGID-40');
 assert.ok(target);
 const bad=structuredClone(r1);
 const original=bad.sourceNodes.find(x=>x.identity===target.sourceIdentity);
 bad.sourceNodes.push({...original,identity:'duplicate-source',
   nodeOrdinal:original.nodeOrdinal+100});
 const projection=await project(bad,result);
 assert.equal(projection.rows.find(x=>x.rigidPointer===target.rigidPointer).eligible,false);
 assert.equal(projection.rows.find(x=>x.rigidPointer===target.rigidPointer).reasonCode,
   'SOURCE_OWNER_AMBIGUOUS');
});

test('R4A split allocation and duplicated source weight cannot silently conserve mass',async()=>{
 const p=await project();
 const target=p.rows.find(x=>x.eligible);
 assert.ok(target);
 const allocated={
   ...structuredClone(target),
   dependentPointers:[target.rigidPointer,target.rigidPointer+1],
   allocations:[...target.allocations,{...target.allocations[0],
     oldRigidPointer:target.rigidPointer+1}],
 };
 assert.throws(()=>reconcileR4aPhysicalMass({
  ownership:allocated,sourceWeightKg:2.984,
  reextractDiff:{status:'PASS_ENGINEERING_DIFF',expectedDifferences:[],unexpectedDifferences:0}
 }),/SPLIT_ALLOCATION_UNRESOLVED/);
 const duplicated={...target,totalAllocatedMassKg:target.originalPhysicalMassKg*2};
 assert.throws(()=>reconcileR4aPhysicalMass({
  ownership:duplicated,sourceWeightKg:2.984,
  reextractDiff:{status:'PASS_ENGINEERING_DIFF',expectedDifferences:[],unexpectedDifferences:0}
 }),/MASS_CONSERVATION_MISMATCH/);
});

test('R4A unexpected non-target CII change and wrong output scale refuse publish',async()=>{
 const p=await project();
 const target=p.rows.find(x=>x.eligible);
 assert.ok(target);
 const invalid={status:'PASS_ENGINEERING_DIFF',unexpectedDifferences:0,
   expectedDifferences:[{
     oldRigidPointer:target.rigidPointer,newRigidPointer:target.rigidPointer,
     oldWeight:target.originalCiiWeight,newWeight:29.840001,linkedElement:target.originalElement.index
   }]};
 assert.throws(()=>reconcileR4aPhysicalMass({
   ownership:target,sourceWeightKg:2.984,reextractDiff:invalid,
 }),/MASS_CONSERVATION_MISMATCH/);
 const other={...target,weightScale:1};
 assert.throws(()=>reconcileR4aPhysicalMass({
   ownership:other,sourceWeightKg:2.984,reextractDiff:invalid,
 }),/MASS_CONSERVATION_MISMATCH/);
});

test('R4A missing independent bridge is HOLD without claiming newly transformed owners',async()=>{
 const result=await makeResult();
 await assert.rejects(()=>initializeSourceWeightSession(result,{
  engineRunner,lineageRunner:async()=>{throw Error('R1 unavailable')},
  requireR4aLineage:true,
 }),/R4A_LINEAGE_HOLD/);
});
