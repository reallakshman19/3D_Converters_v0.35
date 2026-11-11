/** R4B read-only, complete final-RIGID ownership/HOLD inventory.
 * This is a diagnostic over the existing frozen R4A session, not an allocator.
 * Inferred component candidates never become edit authority or mass references.
 */
import { ciiSha256 } from './xml-cii-final-property-reader.js';

const observedNumber = value => {
  if(value === null || value === undefined || String(value).trim() === '') return null;
  const n=Number(String(value).trim());
  return Number.isFinite(n) && n>=0 ? n : null;
};
const componentToken=value=>String(value||'').replace(/^=/,'').trim().toUpperCase();
const unique=values=>[...new Set(values.filter(x=>x!==null && x!==undefined && x!==''))];
const byPointer=(a,b)=>a-b;
const sortedPointers=values=>unique(values).map(Number).filter(Number.isSafeInteger).sort(byPointer);
const groupKey=(node,component)=>String(node?.branchOrdinal??'UNKNOWN_BRANCH')+'|'+componentToken(component);
const csvCell=value=>{
  const raw=typeof value==='string'?value:JSON.stringify(value??'');
  // Also protect spreadsheet consumers from formula injection in source names.
  const safe=/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
};
function requireRun(ok,message){if(!ok)throw Error('R4B_AUDIT_HOLD: '+message);}
function sourceSelection(aux,elementByIndex){
  const writer=aux?.writerWeightSourceNode;
  const linked=aux?.linkedElements||[];
  if(!writer || linked.length!==1)return 'UNVERIFIED';
  const ids=elementByIndex.get(linked[0])?.sourceEdgeIdentity||[];
  if(ids.length!==2)return 'UNVERIFIED';
  if(ids[0]===writer && ids[1]!==writer)return 'FROM';
  if(ids[1]===writer && ids[0]!==writer)return 'TO';
  return 'UNVERIFIED';
}
function addIndex(map,key,value){
  if(!key)return;
  if(!map.has(key))map.set(key,new Set());
  map.get(key).add(value);
}
/** Full inventory, including ambiguous and unreferenced final RIGID records. */
export async function buildR4bRigidOwnershipReport(session){
  const custody=session?.custody,inventory=session?.inventory,rows=session?.rows;
  requireRun(custody && inventory && Array.isArray(rows),'frozen source session missing');
  requireRun(session.noEditParity?.status==='PASS_EXACT_REPLAY' &&
    session.noEditParity.differingBytes===0,'no-edit byte parity not proven');
  requireRun(Array.isArray(inventory.rows) &&
    inventory.rows.length===inventory.declared?.rigids &&
    rows.length===inventory.rows.length,'one row per declared final RIGID required');
  const [sourceSha,ciiSha,configSha]=await Promise.all([
    ciiSha256(custody.engineXml),ciiSha256(custody.originalCii),
    ciiSha256(custody.supportConfigJson),
  ]);
  requireRun(sourceSha===custody.engineSha && ciiSha===custody.originalCiiSha,
    'source or final CII changed since conversion');
  const lineage=session.verifiedLineage;
  const r1Verified=Boolean(lineage?.status==='PASS_R1_STRUCTURAL_LINEAGE_WITH_UNATTESTED_MASS'
    && lineage.runIdentity?.sourceXmlSha256===sourceSha
    && lineage.runIdentity?.originalCiiSha256===ciiSha
    && lineage.runIdentity?.configurationSha256===configSha
    && lineage.noEditComparison?.differingBytes===0);
  const elementByIndex=new Map((lineage?.elements||[]).map(e=>[e.elementIndex,e]));
  const auxByPointer=new Map((lineage?.auxiliaryRecords||[])
    .filter(a=>a.section==='RIGID').map(a=>[a.recordPointer,a]));
  const nodes=new Map((lineage?.sourceNodes||[]).map(n=>[n.identity,n]));
  const eventsBySource=new Map();
  for(const event of lineage?.transformations||[]){
    if(event.sourceIdentity){
      if(!eventsBySource.has(event.sourceIdentity))eventsBySource.set(event.sourceIdentity,[]);
      eventsBySource.get(event.sourceIdentity).push(event);
    }
  }
  const selectedByPointer=new Map(rows.map(row=>[row.rigidPointer,row]));
  const writerDependents=new Map(), componentDependents=new Map(), groupBranches=new Map();
  for(const aux of auxByPointer.values()){
    addIndex(writerDependents,aux.writerWeightSourceNode,aux.recordPointer);
    for(const component of aux.ownerCandidates||[]){
      const token=componentToken(component);
      if(!token)continue;
      const writerNode=nodes.get(aux.writerWeightSourceNode);
      const key=groupKey(writerNode,token);
      addIndex(componentDependents,key,aux.recordPointer);
      if(!groupBranches.has(token))groupBranches.set(token,new Set());
      groupBranches.get(token).add(writerNode?.branchOrdinal??'UNKNOWN_BRANCH');
    }
  }
  const output=[], seen=new Set();
  for(const rigid of inventory.rows){
    const p=rigid.rigidPointer;
    requireRun(Number.isSafeInteger(p) && p>0 && !seen.has(p),'duplicate/invalid output pointer');
    seen.add(p);
    const existing=selectedByPointer.get(p);
    requireRun(existing,'source projection omitted final RIGID '+p);
    const aux=r1Verified?auxByPointer.get(p):null;
    const writerId=aux?.writerWeightSourceNode||null;
    const writerNode=nodes.get(writerId);
    const verifiedNode=existing.eligible && r1Verified?existing.sourceNode:null;
    const component=verifiedNode?.componentRefNo || writerNode?.componentRefNo ||
      aux?.ownerCandidates?.[0] || null;
    const token=componentToken(component),key=groupKey(writerNode,token);
    const components=aux?.ownerCandidates||[];
    const dependent=sortedPointers([
      ...(existing.dependentPointers||[]),
      ...(writerDependents.get(writerId)||[]),
      ...(componentDependents.get(key)||[]),
      p,
    ]);
    const elements=rigid.linkedElements.map(e=>({
      elementIndex:e.index,fromNode:e.fromNode,toNode:e.toNode,
      branchName:e.branchName,lengthMm:e.lengthMm,outsideDiameterMm:e.outsideDiameterMm,
      r1LineageStatus:elementByIndex.get(e.index)?.lineageStatus||'UNVERIFIED',
      sourceEdgeIdentities:elementByIndex.get(e.index)?.sourceEdgeIdentity||[],
    }));
    const originalMass=verifiedNode?
      observedNumber(verifiedNode.originalXmlWeight):
      observedNumber(writerNode?.fields?.Weight);
    const structural=Boolean(existing.eligible && r1Verified &&
      existing.completeAllocation===true);
    const transformations=unique([
      ...(existing.transformationHistory||[]),
      ...(eventsBySource.get(writerId)||[]),
      ...elements.flatMap(e=>e.sourceEdgeIdentities.flatMap(id=>eventsBySource.get(id)||[])),
    ].map(v=>JSON.stringify(v))).map(s=>JSON.parse(s));
    const code=!r1Verified ?
      (lineage ? 'CONFIGURATION_NOT_FROZEN' : 'R1_LINEAGE_UNAVAILABLE') :
      (existing.reasonCode||
        (structural?'PHYSICAL_MASS_APPROVAL_REQUIRED':'SOURCE_OWNER_AMBIGUOUS'));
    const reason=!r1Verified ?
      'Independent R1 conversion custody/lineage not established: '+
        (session.r4aReason||'Frozen R1 fingerprints or no-edit evidence unavailable') :
      (existing.reason||code);
    output.push({
      rigidPointer:p,elementIndex:elements.length===1?elements[0].elementIndex:null,
      elements,fromNode:elements.length===1?elements[0].fromNode:null,
      toNode:elements.length===1?elements[0].toNode:null,
      lengthMm:elements.length===1?elements[0].lengthMm:null,
      ciiWeight:rigid.weight,weightScale:custody.weightScale??null,
      sourceBranch:verifiedNode?.branchName||writerNode?.branchName||null,
      sourceNode:verifiedNode?.nodeNumber||writerNode?.originalNodeNumber||null,
      sourceIdentity:existing.sourceIdentity||writerId,
      componentRefNo:component,componentCandidates:components,
      componentType:verifiedNode?.componentType||writerNode?.componentType||null,
      originalXmlWeightKg:originalMass,
      sourceMassBasis:verifiedNode?'R4A_UNIQUE_SOURCE_FIELD':'OBSERVED_R1_WRITER_FIELD_NOT_PHYSICAL_APPROVAL',
      referenceWeightKg:null,referenceBasis:'INDEPENDENT_APPROVED_PHYSICAL_REFERENCE_UNAVAILABLE',
      errorPercent:null,errorStatus:'REFERENCE_UNAVAILABLE',
      allocatedComponentMassKg:structural?existing.originalAllocatedMassKg:null,
      physicalComponentTotalMassKg:structural?existing.originalPhysicalMassKg:null,
      dependentRigidPointers:dependent,
      dependentSetStatus:structural?'VERIFIED_ONE_TO_ONE':'CANDIDATE_SET_NOT_ALLOCATION_PROOF',
      writerSourceIdentity:writerId,
      writerSourceSelection:sourceSelection(aux,elementByIndex),
      transformationHistory:transformations,
      r1LineageStatus:aux?.ownershipStatus||'NOT_VERIFIED',
      ownershipStatus:existing.status||'HOLD',
      structurallyQualified:structural,
      sourceEditEligible:structural,
      holdReasonCode:code,holdExplanation:reason,
      allocationRule:structural?existing.allocationRule:null,
      physicallyApproved:false,
      evidence:{sourceXmlSha256:sourceSha,originalCiiSha256:ciiSha,
        configurationSha256:configSha,
        r1SnapshotFingerprint:r1Verified?lineage.runIdentity.snapshotFingerprint:null,
        r1WriterSource:writerId,
        physicalOwnershipApproval:'NOT_ATTESTED_BY_READ_ONLY_AUDIT'},
      candidateGroupKey:token?key:null,
      duplicateRefAcrossBranches:token?(groupBranches.get(token)?.size||0)>1:false,
    });
  }
  requireRun(output.length===inventory.rows.length &&
    seen.size===inventory.rows.length,'inventory coverage incomplete');
  const breakdown={};
  for(const row of output)if(!row.structurallyQualified)
    breakdown[row.holdReasonCode]=(breakdown[row.holdReasonCode]||0)+1;
  const candidateGroups=new Map();
  for(const row of output){
    if(!row.candidateGroupKey)continue;
    if(!candidateGroups.has(row.candidateGroupKey))candidateGroups.set(row.candidateGroupKey,[]);
    candidateGroups.get(row.candidateGroupKey).push(row);
  }
  const multiRigidCandidateGroups=[];
  for(const [key,items] of candidateGroups){
    const pointers=sortedPointers(items.flatMap(x=>x.dependentRigidPointers));
    if(pointers.length<2)continue;
    const sourceWeights=unique(items.map(x=>x.originalXmlWeightKg).filter(x=>x!==null));
    const emittedCiiMass=Number.isFinite(custody.weightScale)&&custody.weightScale>0?
      items.reduce((t,x)=>t+x.ciiWeight/custody.weightScale,0):null;
    const duplicateMassRisk=sourceWeights.length===1 && emittedCiiMass!==null &&
      emittedCiiMass>sourceWeights[0]+1e-5;
    multiRigidCandidateGroups.push({
      groupKey:key,componentRefNo:items[0].componentRefNo,
      rigidPointers:pointers,sourceWeightsKg:sourceWeights,
      emittedCiiMassKg:emittedCiiMass,
      duplicateMassRisk,
      status:'UNAPPROVED_CANDIDATE_ONLY',
      allocationFractions:null,reason:'Writer-source/component association is not an approved mass allocation',
    });
  }
  const qualified=output.filter(x=>x.structurallyQualified);
  const summary={
    finalRigidCount:output.length,
    qualifiedStructuralOwners:qualified.length,
    sourceEditEligible:qualified.length,
    heldOwners:output.length-qualified.length,
    holdReasons:Object.fromEntries(Object.entries(breakdown).sort()),
    multiRigidCandidateGroups:multiRigidCandidateGroups.length,
    unresolvedPhysicalComponents:output.filter(x=>!x.componentRefNo).length,
    conflictingSourceWeights:output.filter(x=>x.holdReasonCode==='SOURCE_WEIGHT_MISMATCH').length,
    possibleDuplicateMassGroups:multiRigidCandidateGroups.filter(x=>x.duplicateMassRisk).length,
    verifiedOneToOneSourceMassKg:qualified.reduce((t,x)=>t+x.originalXmlWeightKg,0),
    totalPhysicalMassForUnresolvedGroupsKg:null,
    physicalMassApprovalCount:0,
  };
  requireRun(summary.sourceEditEligible+summary.heldOwners===summary.finalRigidCount,
    'summary coverage mismatch');
  return {
    schema:'xml-cii-r4b-rigid-ownership-audit/v1',
    evidenceClass:'CURRENT_FROZEN_BROWSER_RUN_NOT_HISTORICAL_GLRD_PARITY',
    status:r1Verified?'READ_ONLY_R1_SOURCE_OWNERSHIP_AUDIT':'READ_ONLY_R1_LINEAGE_UNAVAILABLE',
    scope:'DIAGNOSTIC_ONLY_NO_NEW_SOURCE_EDIT_ELIGIBILITY',
    runIdentity:{sourceRunId:custody.runId,sourceXmlSha256:sourceSha,
      originalCiiSha256:ciiSha,configurationSha256:configSha,
      stagedJsonSha256:lineage?.runIdentity?.stagedJsonSha256||null,
      converterCodeIdentity:lineage?.runIdentity?.converterCodeIdentity||null,
      converterRuntimeIdentity:lineage?.runIdentity?.runtimeIdentity||null,
      r1SnapshotFingerprint:r1Verified?lineage.runIdentity.snapshotFingerprint:null},
    noEditParity:session.noEditParity,r1Verified,r4aLineageError:session.r4aReason||null,summary,
    multiRigidCandidateGroups,
    rows:output,
    engineeringNote:'Component groups and observed weights are not mass approval; SPLIT_ALLOCATION_UNRESOLVED stays HOLD until actual allocation proof exists.',
  };
}

export function r4bOwnershipAuditCsv(report){
  if(!Array.isArray(report?.rows))throw Error('R4B_AUDIT_HOLD: no verified audit rows');
  const keys=['rigidPointer','elementIndex','fromNode','toNode','lengthMm','ciiWeight',
    'weightScale','sourceBranch','sourceNode','sourceIdentity','componentRefNo',
    'componentType','originalXmlWeightKg','sourceMassBasis','referenceWeightKg',
    'referenceBasis','errorPercent','errorStatus','allocatedComponentMassKg',
    'physicalComponentTotalMassKg','dependentRigidPointers','writerSourceIdentity',
    'writerSourceSelection','r1LineageStatus','ownershipStatus','structurallyQualified',
    'sourceEditEligible','holdReasonCode','holdExplanation','allocationRule',
    'transformationHistory','elements','evidence'];
  return [keys.map(csvCell).join(','),
    ...report.rows.map(row=>keys.map(key=>csvCell(row[key])).join(','))].join('\n')+'\n';
}
