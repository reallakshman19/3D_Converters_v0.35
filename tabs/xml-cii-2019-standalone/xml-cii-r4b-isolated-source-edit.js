/** R4B Phase B/C: bounded one-writer edit within a complete multi-RIGID group.
 * Read-only what-if must prove isolation through the EXISTING real converter.
 * Neither ComponentRefNo nor this code asserts physical ownership or mass
 * approval. An independently supported owner-entered group total is required
 * before a source-backed commit; R4A's one-to-one rules are not weakened.
 */
import { ciiSha256 } from './xml-cii-final-property-reader.js';
import { applyXmlSourceEdits, inspectXmlWeightSources } from './xml-cii-source-weight-patch.js';
import { verifySourceEditedCii, indexAll15CiiAuxiliaryPointers }
  from './xml-cii-source-weight-cii-verify.js';
import { runXmlCii2019StandaloneEngineJob } from './xml-cii-workflow-engine-client.js';

const VALID_LINEAGE = new Set(['EXACT_UNIQUE','TRANSFORMED_WITH_LINEAGE']);
const number = value => {
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const text=String(value).trim();
  if(!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))return null;
  const n=Number(text);return Number.isFinite(n)&&n>=0?n:null;
};
const component = value => String(value||'').replace(/^=/,'').trim().toUpperCase();
const approx=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=0.00001;
const fail=(code,detail)=>{throw Error('R4B_SOURCE_HOLD '+code+': '+detail);};
function requireCheck(ok,code,detail){if(!ok)fail(code,detail);}
const simpleSource=node=>({
  identity:node.identity,branchName:node.branchName,
  branchOrdinal:node.branchOrdinal,nodeOrdinal:node.nodeOrdinal,
  nodeNumber:node.originalNodeNumber,componentRefNo:node.componentRefNo,
  originalToken:node.fields?.Weight,
});
function exactJob(custody,revisedXml){
  return {
    sourceKind:'xml',sourceText:revisedXml,sourceName:custody.sourceName,
    stagedJsonText:custody.stagedJsonText,supportConfigJson:custody.supportConfigJson,
    options:{...custody.options,outputMode:'cii-only'},
  };
}
async function runActual(custody,xml,engineRunner){
  const r=await runXmlCii2019StandaloneEngineJob(exactJob(custody,xml),
    typeof engineRunner==='function'?{engineRunner}:{});
  requireCheck(r?.ok===true&&typeof r.ciiText==='string'&&r.ciiText.length>0,
    'CONVERTER_FAILED','Real CII re-extraction did not return output');
  return r.ciiText;
}
async function assertFrozen(session,current){
  const c=session?.custody, r=session?.verifiedLineage;
  requireCheck(c&&session.noEditParity?.status==='PASS_EXACT_REPLAY'&&
    session.noEditParity.differingBytes===0&&
    r?.status==='PASS_R1_STRUCTURAL_LINEAGE_WITH_UNATTESTED_MASS'&&
    r.noEditComparison?.differingBytes===0,
    'CUSTODY_NOT_VERIFIED','Exact no-edit CII and independently validated R1 lineage are mandatory');
  requireCheck(current===session.originalResult&&current?.ciiText===c.originalCii&&
    current?.finalRigidReviewEvidence?.engineInputText===c.engineXml&&
    current?.finalRigidReviewEvidence?.supportConfigJson===c.supportConfigJson&&
    (current?.finalRigidReviewEvidence?.stagedJsonText||'')===c.stagedJsonText&&
    JSON.stringify(current.finalRigidReviewEvidence.effectiveOptions)===JSON.stringify(c.options)&&
    (current.finalRigidReviewEvidence.engineInputDigest||
      current.finalRigidReviewEvidence.engineInputSha256)===c.runId,
    'STALE_RUN','Active original run, source, support config or options changed');
  const [sourceSha,ciiSha,configSha]=await Promise.all([
    ciiSha256(c.engineXml),ciiSha256(c.originalCii),ciiSha256(c.supportConfigJson),
  ]);
  requireCheck(sourceSha===c.engineSha&&sourceSha===r.runIdentity?.sourceXmlSha256&&
    ciiSha===c.originalCiiSha&&ciiSha===r.runIdentity?.originalCiiSha256&&
    configSha===r.runIdentity?.configurationSha256&&
    r.runIdentity?.runId===c.runId,
    'CUSTODY_HASH_MISMATCH','Frozen source, CII, config or R1 run identity differs');
  requireCheck([1,10].includes(c.weightScale)&&
    c.weightScale===(c.options.kgToNewton?10:1),
    'WEIGHT_SCALE_UNVERIFIED','No verified kg-to-CII-unit scale');
  return {c,r,sourceSha,ciiSha,configSha};
}
function sourceMatch(parsed,node){
  const matches=parsed.filter(x=>x.branchName===node.branchName&&
    x.branchOrdinal===node.branchOrdinal&&x.nodeOrdinal===node.nodeOrdinal&&
    x.nodeNumber===node.originalNodeNumber&&
    component(x.componentRefNo)===component(node.componentRefNo));
  requireCheck(matches.length===1&&matches[0].weightField&&
    matches[0].weightField.value===String(node.fields?.Weight??''),
    'SOURCE_FIELD_NOT_UNIQUE','R1 node identity cannot be matched to one original XML Weight token');
  return matches[0];
}
function componentGroup(session,pointer){
  const r=session.verifiedLineage, c=session.custody;
  const index=indexAll15CiiAuxiliaryPointers(c.originalCii);
  requireCheck(index.inventory.rows.length===r.auxiliaryRecords.filter(x=>x.section==='RIGID').length,
    'POINTER_COVERAGE_INCOMPLETE','R1 and CII have different RIGID record counts');
  const auxiliary=r.auxiliaryRecords.filter(x=>x.section==='RIGID');
  const aux=auxiliary.find(x=>x.recordPointer===pointer);
  const out=index.inventory.rows.find(x=>x.rigidPointer===pointer);
  requireCheck(aux&&out&&out.linkedElements?.length===1&&
    aux.linkedElements?.length===1&&aux.linkedElements[0]===out.linkedElements[0].index,
    'POINTER_MISMATCH','Target does not link to one verified final ELEMENT');
  const nodes=new Map(r.sourceNodes.map(x=>[x.identity,x]));
  const writer=nodes.get(aux.writerWeightSourceNode);
  requireCheck(writer&&writer.componentRefNo&&
    aux.ownerCandidates?.length===1&&
    component(aux.ownerCandidates[0])===component(writer.componentRefNo),
    'OWNER_AMBIGUOUS','R1 writer and one component candidate must agree');
  const token=component(writer.componentRefNo);
  const family=r.sourceNodes.filter(x=>component(x.componentRefNo)===token);
  requireCheck(family.length>1&&
    family.every(x=>x.branchOrdinal===writer.branchOrdinal&&
      x.branchName===writer.branchName),
    'CROSS_BRANCH_OWNER','Physical ComponentRefNo is shared across branches or not a multi-node case');
  const memberRecords=auxiliary.filter(a=>(a.ownerCandidates||[])
    .some(x=>component(x)===token)||family.some(n=>n.identity===a.writerWeightSourceNode));
  const pointers=memberRecords.map(x=>x.recordPointer).sort((a,b)=>a-b);
  requireCheck(pointers.length>=2&&pointers.includes(pointer)&&
    new Set(pointers).size===pointers.length,
    'DEPENDENCY_INCOMPLETE','Not an independently enumerated multi-RIGID group');
  const parsed=inspectXmlWeightSources(c.engineXml);
  // Every representation and writer is checked against frozen original XML.
  for(const node of family)sourceMatch(parsed,node);
  const writers=new Set(), members=[];
  for(const member of memberRecords){
    const output=index.inventory.rows.find(x=>x.rigidPointer===member.recordPointer);
    const owner=nodes.get(member.writerWeightSourceNode);
    requireCheck(output?.linkedElements?.length===1&&
      member.linkedElements?.length===1&&
      member.linkedElements[0]===output.linkedElements[0].index&&
      owner&&component(owner.componentRefNo)===token&&
      !writers.has(owner.identity)&&
      member.ownerCandidates?.length===1&&
      component(member.ownerCandidates[0])===token,
      'DEPENDENCY_INCOMPLETE','Another dependent RIGID lacks a unique writer or element');
    writers.add(owner.identity);
    const element=r.elements.find(e=>e.elementIndex===output.linkedElements[0].index);
    requireCheck(element&&VALID_LINEAGE.has(element.lineageStatus)&&
      element.sourceEdgeIdentity?.length===2&&
      element.sourceEdgeIdentity.includes(owner.identity),
      'WRITER_EDGE_UNVERIFIED','R1 writer does not belong to a uniquely traced ELEMENT edge');
    const exact=sourceMatch(parsed,owner),mass=number(exact.weightField.value);
    requireCheck(mass!==null&&approx(mass*c.weightScale,output.weight)&&
      approx(mass*c.weightScale,Number(member.weight)),
      'SOURCE_WEIGHT_MISMATCH','Source writer Weight does not reproduce the original CII weight');
    members.push({
      rigidPointer:member.recordPointer,elementIndex:output.linkedElements[0].index,
      oldCiiWeight:output.weight,oldXmlWeightKg:mass,
      sourceNode:simpleSource(owner),
      element:{branchName:output.linkedElements[0].branchName,
        fromNode:output.linkedElements[0].fromNode,
        toNode:output.linkedElements[0].toNode,
        lengthMm:output.linkedElements[0].lengthMm},
    });
  }
  requireCheck(memberRecords.length===writers.size&&
    family.every(n=>!auxiliary.some(a=>a.writerWeightSourceNode===n.identity)||
      writers.has(n.identity)),
    'DEPENDENCY_INCOMPLETE','Unaccounted writer source or RIGID allocation');
  return {token,pointers,writer,originalElement:out.linkedElements[0],
    memberRecords:members,parsed,sourceMatch:sourceMatch(parsed,writer),
    sourceCandidates:family.map(simpleSource),
    originalEmittedTotalKg:members.reduce((n,m)=>n+m.oldCiiWeight/c.weightScale,0)};
}
async function probe(session,group,pointer,newMass,runner){
  const c=session.custody;
  const src=group.sourceMatch, writer=group.writer;
  const patch=await applyXmlSourceEdits({
    originalXml:c.engineXml,originalSha256:c.engineSha,edits:[{
      propertyId:'Node/Weight',approved:true,ownerApproved:true,
      zeroConfirmed:newMass===0,branchName:src.branchName,
      branchOrdinal:src.branchOrdinal,nodeOrdinal:src.nodeOrdinal,
      nodeNumber:src.nodeNumber,componentRefNo:src.componentRefNo,
      originalToken:src.weightField.value,newValue:String(newMass),
    }],
  });
  requireCheck(patch.edits.length===1&&patch.unrelatedXmlBytesChanged===0,
    'UNEXPECTED_XML_DIFF','What-if must change exactly one Node/Weight token');
  const cii=await runActual(c,patch.revisedXml,runner);
  const edge=group.originalElement;
  const originalEdgeKey=[edge.branchName,edge.fromNode,edge.toNode,
    Number(edge.lengthMm).toFixed(6),String(edge.outsideDiameterMm)].join('|');
  const delta=await verifySourceEditedCii({
    originalCiiText:c.originalCii,revisedCiiText:cii,originalSha256:c.originalCiiSha,
    approved:{rigidPointer:pointer,newValue:newMass,
      weightScale:c.weightScale,originalEdgeKey},
  });
  requireCheck(delta.status==='PASS_ENGINEERING_DIFF'&&
    delta.expectedDifferences?.length===1&&delta.unexpectedDifferences===0&&
    approx(delta.expectedDifferences[0].newWeight,newMass*c.weightScale),
    'COUPLED_OR_UNRESOLVED','Real converter changed more than one verified source-linked RIGID');
  return {patch,cii,delta};
}
export async function previewR4bIsolatedSourceEdit(session,{
  rigidPointer,newValue,
},{getCurrentResult,engineRunner=session?.engineRunner}={}){
  const current=typeof getCurrentResult==='function'?getCurrentResult():session?.originalResult;
  const {c,r}=await assertFrozen(session,current);
  const pointer=Number(rigidPointer), mass=number(newValue);
  requireCheck(Number.isSafeInteger(pointer)&&pointer>0&&mass!==null,
    'INVALID_TARGET','Need a final RIGID pointer and finite nonnegative XML mass');
  const existing=session.rows.find(x=>x.rigidPointer===pointer);
  requireCheck(existing&&!existing.eligible&&
    ['SOURCE_OWNER_AMBIGUOUS','SPLIT_ALLOCATION_UNRESOLVED'].includes(existing.reasonCode),
    'NOT_R4B_HOLD','R4B is only for existing multi-RIGID ownership HOLD rows');
  const group=componentGroup(session,pointer);
  const old=group.memberRecords.find(x=>x.rigidPointer===pointer);
  requireCheck(old&& !approx(old.oldXmlWeightKg,mass),
    'UNCHANGED_WEIGHT','Target XML Weight must differ from original');
  const trial=await probe(session,group,pointer,mass,engineRunner);
  await assertFrozen(session,current);
  const updated=group.memberRecords.map(x=>({
    ...x,proposedCiiWeight:x.rigidPointer===pointer?mass*c.weightScale:x.oldCiiWeight,
    proposedXmlWeightKg:x.rigidPointer===pointer?mass:x.oldXmlWeightKg,
  }));
  const originalTotal=group.originalEmittedTotalKg;
  const revisedTotal=updated.reduce((t,x)=>t+x.proposedCiiWeight/c.weightScale,0);
  return {
    schema:'xml-cii-r4b-isolated-writer-preview/v1',
    status:'PASS_ISOLATED_CONVERTER_TRIAL_NOT_PHYSICAL_APPROVAL',
    evidenceClass:'FROZEN_CURRENT_CONVERTER_TRIAL_NOT_HISTORICAL_OWNER_MASS_APPROVAL',
    rigidPointer:pointer,componentRefNo:group.token,
    originalWeightCii:old.oldCiiWeight,proposedWeightCii:mass*c.weightScale,
    proposedWeightKg:mass,weightScale:c.weightScale,
    sourceCandidates:group.sourceCandidates,sourceWriter:old.sourceNode,
    dependentRigidPointers:group.pointers,originalEmittedGroupKg:originalTotal,
    proposedEmittedGroupKg:revisedTotal,memberAllocations:updated,
    sourceRunId:c.runId,sourceXmlSha256:c.engineSha,
    originalCiiSha256:c.originalCiiSha,
    configurationSha256:r.runIdentity.configurationSha256,
    r1SnapshotFingerprint:r.runIdentity.snapshotFingerprint,
    trialXmlSha256:trial.patch.revisedSha256,
    trialCiiSha256:trial.delta.revisedCiiSha256,
    noEditParity:session.noEditParity,
    unrelatedXmlBytesChanged:trial.patch.unrelatedXmlBytesChanged,
    expectedCiiDiff:trial.delta.expectedDifferences,
    unexpectedCiiDifferences:trial.delta.unexpectedDifferences,
    physicalMassAuthority:'NOT_ATTESTED',
    // Never expose trial XML/CII as downloads before explicit approval.
  };
}
export async function applyR4bIsolatedSourceEdit(session,preview,{
  rigidPointer,newValue,approved,ownerApproved,approvedGroupTotalKg,
  allocationMode,referenceBasis,
},{getCurrentResult,engineRunner=session?.engineRunner}={}){
  const current=typeof getCurrentResult==='function'?getCurrentResult():session?.originalResult;
  await assertFrozen(session,current);
  requireCheck(preview?.status==='PASS_ISOLATED_CONVERTER_TRIAL_NOT_PHYSICAL_APPROVAL'&&
    preview.rigidPointer===Number(rigidPointer)&&
    approx(preview.proposedWeightKg,number(newValue))&&
    preview.sourceRunId===session.custody.runId&&
    preview.sourceXmlSha256===session.custody.engineSha&&
    preview.originalCiiSha256===session.custody.originalCiiSha&&
    preview.configurationSha256===session.verifiedLineage.runIdentity.configurationSha256&&
    preview.r1SnapshotFingerprint===session.verifiedLineage.runIdentity.snapshotFingerprint,
    'STALE_PLAN','Re-preview the exact current conversion and proposed mass');
  requireCheck(approved===true&&ownerApproved===true,
    'APPROVAL_REQUIRED','Physical owner and specific XML weight approvals required');
  const total=number(approvedGroupTotalKg);
  requireCheck(allocationMode==='OWNER_APPROVED_REVISED_GROUP_TOTAL'&&
    typeof referenceBasis==='string'&&referenceBasis.trim().length>=8&&
    total!==null&&approx(total,preview.proposedEmittedGroupKg),
    'PHYSICAL_ALLOCATION_NOT_APPROVED',
    'Enter an approved group total (kg) matching the preview and its traceable engineering reference; do not infer total from duplicated XML');
  if(session.r4bCommitted) {
    requireCheck(session.r4bCommitted.previewHash===preview.trialCiiSha256&&
      session.r4bCommitted.approvedValue===String(newValue),
      'SESSION_ALREADY_COMMITTED','Create a new session for a different approved edit');
    return session.r4bCommitted;
  }
  const group=componentGroup(session,preview.rigidPointer);
  requireCheck(JSON.stringify(group.pointers)===
      JSON.stringify(preview.dependentRigidPointers)&&
      component(group.token)===component(preview.componentRefNo),
    'SOURCE_OWNER_CHANGED','Dependency graph differs from approved preview');
  // An approver can only attest an independently recomputed emitted group.
  // Never trust mutable UI preview totals/fractions when authorizing the edit.
  const target=group.memberRecords.find(x=>x.rigidPointer===preview.rigidPointer);
  const mass=number(newValue);
  const expected=group.memberRecords.map(x=>({
    ...x,proposedCiiWeight:x.rigidPointer===preview.rigidPointer?
      mass*session.custody.weightScale:x.oldCiiWeight,
    proposedXmlWeightKg:x.rigidPointer===preview.rigidPointer?
      mass:x.oldXmlWeightKg,
  }));
  const revisedTotal=expected.reduce((sum,x)=>
    sum+x.proposedCiiWeight/session.custody.weightScale,0);
  requireCheck(target&&mass!==null&&
    approx(preview.originalWeightCii,target.oldCiiWeight)&&
    approx(preview.proposedWeightCii,mass*session.custody.weightScale)&&
    approx(preview.originalEmittedGroupKg,group.originalEmittedTotalKg)&&
    approx(preview.proposedEmittedGroupKg,revisedTotal)&&
    approx(total,revisedTotal)&&
    JSON.stringify(preview.memberAllocations)===JSON.stringify(expected)&&
    JSON.stringify(preview.sourceCandidates)===JSON.stringify(group.sourceCandidates)&&
    JSON.stringify(preview.sourceWriter)===JSON.stringify(target.sourceNode),
    'PREVIEW_ALLOCATION_TAMPERED','Source, related writer or group total differs from immutable R1 evidence');
  const result=await probe(session,group,preview.rigidPointer,
    preview.proposedWeightKg,engineRunner);
  requireCheck(result.delta.revisedCiiSha256===preview.trialCiiSha256&&
    result.patch.revisedSha256===preview.trialXmlSha256,
    'NONDETERMINISTIC_TRIAL','Approved re-extraction diverged from preview');
  await assertFrozen(session,current);
  const stem=session.custody.sourceName.replace(/\.[^.]*$/,'').replace(/[\\/:*?"|]/g,'_');
  const audit={
    schema:'xml-cii-r4b-isolated-source-weight-audit/v1',
    status:'VERIFIED_SOURCE_BACKED_REEXTRACT_USER_ATTESTED_ALLOCATION',
    evidenceClass:preview.evidenceClass,
    sourceRunId:preview.sourceRunId,
    originalEngineXmlSha256:preview.sourceXmlSha256,
    revisedEngineXmlSha256:result.patch.revisedSha256,
    originalCiiSha256:preview.originalCiiSha256,
    revisedCiiSha256:result.delta.revisedCiiSha256,
    originalWeightCii:preview.originalWeightCii,
    proposedWeightCii:preview.proposedWeightCii,
    dependentRigidPointers:preview.dependentRigidPointers,
    memberAllocations:preview.memberAllocations,
    originalEmittedGroupKg:preview.originalEmittedGroupKg,
    revisedEmittedGroupKg:preview.proposedEmittedGroupKg,
    approvedPhysicalGroupTotalKg:total,
    allocationMode,referenceBasis:referenceBasis.trim(),
    physicalMassAuthority:'USER_ATTESTED_NOT_INDEPENDENTLY_VALIDATED',
    physicalOwnerApprovedByUser:true,sourceWeightApprovedByUser:true,
    r1SnapshotFingerprint:preview.r1SnapshotFingerprint,
    sourceXmlByteDiff:result.patch.edits,
    unrelatedXmlBytesChanged:result.patch.unrelatedXmlBytesChanged,
    ciiEngineeringDiff:result.delta, noEditParity:session.noEditParity,
    unrelatedCiiEngineeringDifferences:0,
    sourceLinkedReconciliation:'PASS_SINGLE_WRITER_ISOLATED_AND_ALL_OTHER_RIGIDS_UNCHANGED',
  };
  const committed={
    status:'VERIFIED_REEXTRACT',approvedPointer:preview.rigidPointer,
    approvedValue:String(newValue),previewHash:preview.trialCiiSha256,
    originalXml:session.custody.engineXml,originalCii:session.custody.originalCii,
    revisedXml:result.patch.revisedXml,revisedCii:result.cii,
    names:{originalXml:stem+'_original_enriched.xml',
      originalCii:stem+'_original.cii',
      revisedXml:stem+'_r4b_weight_revised.xml',
      revisedCii:stem+'_r4b_weight_reextracted.cii',
      audit:stem+'_r4b_weight_change_audit.json'},
    audit,
  };
  session.r4bCommitted=committed;
  return committed;
}
