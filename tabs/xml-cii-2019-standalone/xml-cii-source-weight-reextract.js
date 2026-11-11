/** Production browser path: frozen EnrichedXML -> SAME Pyodide engine -> new CII.
 * Read-only R1 structural semantics are enforced by conservative direct-edge
 * eligibility, an explicit no-edit converter replay and value reconciliation.
 * This adapter does not invoke native subprocesses or a second writer.
 */
import { runXmlCii2019StandaloneEngineJob } from './xml-cii-workflow-engine-client.js';
import { ciiSha256 } from './xml-cii-final-property-reader.js';
import { verifyRequestedCiiOutputWeight } from './xml-cii-source-weight-output-target.js';
import { parseFinalCiiRigidInventory } from './xml-cii-final-rigid-inventory.js';
import { deriveSourceWeightEligibility, verifyFrozenCiiEngineeringValues }
  from './xml-cii-source-weight-ownership.js';
import { applyXmlSourceEdits } from './xml-cii-source-weight-patch.js';
import { indexAll15CiiAuxiliaryPointers, verifySourceEditedCii }
  from './xml-cii-source-weight-cii-verify.js';
import { projectR4aOwnership } from './xml-cii-r4a-rigid-ownership.js';
import { reconcileR4aPhysicalMass } from './xml-cii-r4a-mass-reconcile.js';

function fail(message){throw Error('Source-backed R2 HOLD: '+message);}
function assert(condition,message){if(!condition)fail(message);}
function deepClone(value){return JSON.parse(JSON.stringify(value));}
function exactJob(custody, xml) {
  return {
    sourceKind:'xml', sourceText:xml,
    sourceName:custody.sourceName,
    stagedJsonText:custody.stagedJsonText,
    supportConfigJson:custody.supportConfigJson,
    options:{...custody.options,outputMode:'cii-only'},
  };
}
async function run(job,engineRunner){
  const result=await runXmlCii2019StandaloneEngineJob(job,
    typeof engineRunner === 'function' ? {engineRunner} : {});
  assert(result?.ok === true && typeof result.ciiText==='string' && result.ciiText.length>0,
    'real browser converter failed; no verified output available: '+String(result?.error||'unknown'));
  return result;
}
function makeCustody(result){
  const evidence=result?.finalRigidReviewEvidence;
  assert(result?.ok===true && result?.ciiInputSource!=='topofix' && evidence?.sourceKind==='xml',
    'source-backed mode requires a successful normal XML→CII conversion');
  assert(typeof evidence.engineInputText==='string' && evidence.engineInputText.length &&
    typeof evidence.supportConfigJson==='string' && evidence.supportConfigJson.length &&
    typeof evidence.originalCiiSha256==='string' &&
    typeof evidence.engineInputSha256==='string' &&
    evidence.effectiveOptions && typeof evidence.effectiveOptions==='object' &&
    typeof evidence.effectiveSourceName==='string' && evidence.effectiveSourceName.length,
    'original run is missing exact engine XML/configuration/CII custody');
  const opts=deepClone(evidence.effectiveOptions);
  assert(['first','all','none'].includes(opts.coordsMode) &&
    typeof opts.kgToNewton==='boolean' &&
    typeof opts.splitCondensedValveFlange==='boolean' &&
    typeof opts.useRestraintTypeBasedOnJson==='boolean',
    'original converter flags not pinned; inferred defaults forbidden');
  assert(!opts.useTopoFixForCii && !opts.analyzeTopology && !opts.generateTopoFix,
    'TopoFix/topology branches require separate source impact qualification');
  const cfg=JSON.parse(evidence.supportConfigJson);
  assert(cfg && typeof cfg==='object' && !Array.isArray(cfg),
    'run-pinned support configuration invalid');
  return {
    engineXml:evidence.engineInputText,originalCii:result.ciiText,
    engineSha:evidence.engineInputSha256,originalCiiSha:evidence.originalCiiSha256,
    supportConfigJson:evidence.supportConfigJson,
    stagedJsonText:evidence.stagedJsonText||'',
    sourceName:evidence.effectiveSourceName,
    options:opts,weightScale:evidence.weightScale,
    runId:evidence.engineInputDigest || evidence.engineInputSha256,
  };
}
async function assertCustody(custody,current){
  assert(await ciiSha256(custody.engineXml)===custody.engineSha &&
    await ciiSha256(custody.originalCii)===custody.originalCiiSha,
    'frozen source/CII hash changed');
  if(current){
    const evidence=current.finalRigidReviewEvidence;
    assert(current.ok===true && current.ciiText===custody.originalCii &&
      evidence?.engineInputText===custody.engineXml &&
      evidence?.supportConfigJson===custody.supportConfigJson &&
      (evidence?.stagedJsonText||'')===custody.stagedJsonText &&
      evidence?.effectiveSourceName===custody.sourceName &&
      JSON.stringify(evidence.effectiveOptions)===JSON.stringify(custody.options) &&
      evidence.engineInputSha256===custody.engineSha &&
      evidence.originalCiiSha256===custody.originalCiiSha,
      'stale current run/config/master input changed after frozen custody');
  }
}
/** The real original CII is the frozen result, not a synthesized baseline. */
export async function initializeSourceWeightSession(result, { engineRunner,
  lineageRunner, requireR4aLineage=false }={}) {
  const custody=makeCustody(result);
  await assertCustody(custody,result);
  indexAll15CiiAuxiliaryPointers(custody.originalCii);
  const inventory=parseFinalCiiRigidInventory(custody.originalCii);
  const legacy=await deriveSourceWeightEligibility({result,inventory});
  verifyFrozenCiiEngineeringValues({
    originalCiiText:custody.originalCii,inventory,entries:legacy });
  // Independently re-execute exact source with actual original Python converter
  // before any transformation-lineage claim or source editing is possible.
  const noEdit=await run(exactJob(custody,custody.engineXml),engineRunner);
  assert(noEdit.ciiText===custody.originalCii,
    'no-edit real browser converter output is not byte-identical to original CII');
  assert(await ciiSha256(noEdit.ciiText)===custody.originalCiiSha,
    'no-edit converter digest mismatch');
  let rows=legacy,verifiedLineage=null,ownership=null,r4aReason=null;
  try {
    if(typeof lineageRunner==='function') {
      verifiedLineage=await lineageRunner({
        engineInputText:custody.engineXml,
        originalCiiText:custody.originalCii,
        noEditCiiText:noEdit.ciiText,
        supportConfigJson:custody.supportConfigJson,
        stagedJsonText:custody.stagedJsonText,
        effectiveOptions:custody.options,
        runId:custody.runId,
      });
    } else if(typeof engineRunner!=='function') {
      // In production, no mock or client-supplied lineage is admitted.
      const module=await import('../../converters/xml-cii-2019-standalone/engine.js');
      verifiedLineage=await module.buildR4aBrowserSourceLineage({
        engineInputText:custody.engineXml,originalCiiText:custody.originalCii,
        noEditCiiText:noEdit.ciiText,supportConfigJson:custody.supportConfigJson,
        stagedJsonText:custody.stagedJsonText,effectiveOptions:custody.options,
        runId:custody.runId,
      });
    } else {
      r4aReason='R4A lineage not claimed by injected test engineRunner.';
    }
    if(verifiedLineage) {
      ownership=await projectR4aOwnership({result,inventory,verifiedLineage});
      // A contradictory but qualified R1 projection overrides weaker legacy
      // direct-edge eligibility. Never use old fallback to bypass R1 conflicts.
      rows=ownership.rows;
    }
  } catch(error) {
    r4aReason=String(error?.message||error);
    if(requireR4aLineage) throw Error('R4A_LINEAGE_HOLD: '+r4aReason);
    // Preserve R2's strictly qualified direct-edge-only behavior if Python
    // lineage is genuinely unavailable, but never release transformed rows.
    rows=legacy;
  }
  verifyFrozenCiiEngineeringValues({
    originalCiiText:custody.originalCii,inventory,entries:rows });
  return {schema:'xml-cii-source-weight-session/r2',custody,inventory,
    rows,verifiedLineage,ownership,r4aReason,
    engineRunner,committed:null,originalResult:result,
    noEditParity:{status:'PASS_EXACT_REPLAY',sha256:custody.originalCiiSha,
      bytes:new TextEncoder().encode(custody.originalCii).length,differingBytes:0},
    valueIntegrity:'SERIALIZED_VALUES_VERIFIED',
    physicalMassAuthority:'USER_APPROVAL_REQUIRED',verifiedAt:Date.now()};
}
function securityRelevantR4aOwner(row) {
  // Source parser field metadata carries a cyclic element→parent DOM tree.
  // Compare the immutable approval-affecting values, not UI/parser nodes.
  if(!row)return null;
  return {
    rigidPointer:row.rigidPointer,eligible:row.eligible,status:row.status,
    sourceIdentity:row.sourceIdentity,sourceNode:row.sourceNode,
    physicalComponentRefNo:row.physicalComponentRefNo,
    weightScale:row.weightScale,originalCiiWeight:row.originalCiiWeight,
    sourceInputSha256:row.sourceInputSha256,
    originalEdgeKey:row.originalEdgeKey,
    originalElementIndex:row.originalElement?.index,
    originalPhysicalMassKg:row.originalPhysicalMassKg,
    originalAllocatedMassKg:row.originalAllocatedMassKg,
    totalAllocatedMassKg:row.totalAllocatedMassKg,
    completeAllocation:row.completeAllocation,
    allocationRule:row.allocationRule,
    dependentPointers:row.dependentPointers,
    sourceNodeCandidates:row.sourceNodeCandidates,
    sourceWeightFieldsToEdit:row.sourceWeightFieldsToEdit,
    allocations:row.allocations,
    expectedImpact:row.expectedImpact,
    sourceEdgeIdentities:row.sourceEdgeIdentities,
    pythonTransformedNodeIdentities:row.pythonTransformedNodeIdentities,
    transformationHistory:row.transformationHistory,
    evidence:row.evidence,
    writerFieldToken:row.writerSourceNode?.weightField?.value,
    writerFieldNode:row.writerSourceNode?.nodeNumber,
    writerFieldComponent:row.writerSourceNode?.componentRefNo,
  };
}
function stagedRequest(session, request){
  assert(session?.schema==='xml-cii-source-weight-session/r2',
    'source-backed edit session not initialized');
  const pointer=Number(request?.rigidPointer);
  const row=session.rows.find(r=>r.rigidPointer===pointer);
  assert(row?.eligible===true,'RIGID '+pointer+' is HOLD: '+(row?.reason||'no qualified source mapping'));
  assert(request?.approved===true && request?.ownerApproved===true,
    'explicit weight approval and verified physical-owner authorization required');
  const candidate=String(request.newValue??'').trim();
  assert(candidate.length>0,'new weight cannot be blank');
  return {row,newValue:candidate};
}
export async function applySourceBackedWeightChange(session,request,{
  getCurrentResult,engineRunner=session?.engineRunner,
}={}){
  const {row,newValue}=stagedRequest(session,request);
  const current=typeof getCurrentResult==='function' ? getCurrentResult() : session.originalResult;
  assert(current===session.originalResult,'stale UI conversion run replaced during review');
  await assertCustody(session.custody,current);
  // Approval flags are user intent only, not ownership evidence. Before
  // writing a source token, re-derive current owner/impact identities from
  // the independent Python R1 ledger and immutable original CII bytes.
  if(session.ownership){
    const checked=await projectR4aOwnership({
      result:current,inventory:session.inventory,
      verifiedLineage:session.verifiedLineage,
    });
    const again=checked.rows.find(x=>x.rigidPointer===row.rigidPointer);
    assert(again?.eligible===true &&
      JSON.stringify(securityRelevantR4aOwner(again))===
        JSON.stringify(securityRelevantR4aOwner(row)) &&
      checked.verification?.noEditByteDifferences===0,
      'R4A_SOURCE_OWNER_CHANGED: source, dependency set or allocation changed after qualification');
  }
  if(session.committed){
    assert(session.committed.approvedPointer===row.rigidPointer &&
      session.committed.approvedValue===newValue &&
      request?.approved===true && request?.ownerApproved===true,
      'session already committed a different approved edit; create a new source session');
    return session.committed; // idempotent repeat; no second converter run
  }
  // Repeated positive XML Weight fields may describe the same physical
  // component on multiple non-writer source nodes. These are changed together
  // only after R1 proves one emitted writer and all original tokens agree.
  // Zero-weight endpoint representations remain zero.
  const sourceFields=row.sourceWeightFieldsToEdit?.length
    ? row.sourceWeightFieldsToEdit : [row.sourceIdentity];
  const candidates=new Map((row.sourceNodeCandidates||[]).map(n=>[n.identity,n]));
  const editedNodes=sourceFields.map(identity=>{
    const alias=candidates.get(identity);
    if(!alias && identity!==row.sourceIdentity)
      fail('Missing independently verified alias source identity '+identity);
    return {
      propertyId:'Node/Weight',approved:true,ownerApproved:true,
      zeroConfirmed:request.zeroConfirmed===true,
      branchName:alias?.branchName||row.sourceNode.branchName,
      branchOrdinal:alias?.branchOrdinal??row.sourceNode.branchOrdinal,
      nodeOrdinal:alias?.nodeOrdinal??row.sourceNode.nodeOrdinal,
      nodeNumber:alias?.nodeNumber||row.sourceNode.nodeNumber,
      componentRefNo:alias?.componentRefNo||row.sourceNode.componentRefNo,
      originalToken:alias?.weightRaw??row.sourceNode.originalWeightToken,
      newValue,
    };
  });
  assert(new Set(sourceFields).size===sourceFields.length &&
    editedNodes.length>=1,'Repeated source-weight edit identity is incomplete.');
  const patch=await applyXmlSourceEdits({
    originalXml:session.custody.engineXml,
    originalSha256:session.custody.engineSha,
    edits:editedNodes,
  });
  assert(patch.edits.length===editedNodes.length && patch.unrelatedXmlBytesChanged===0,
    'XML byte-diff does not match exactly the approved same-component Weight fields');
  const normalizedNew=patch.edits[0].revisedValue;
  if(!Number.isFinite(normalizedNew) || normalizedNew<0) fail('invalid approved source mass');
  const revised=await run(exactJob(session.custody,patch.revisedXml),engineRunner);
  const delta=await verifySourceEditedCii({
    originalCiiText:session.custody.originalCii,
    revisedCiiText:revised.ciiText,
    originalSha256:session.custody.originalCiiSha,
    approved:{...row,newValue:normalizedNew},
  });
  assert(delta.status==='PASS_ENGINEERING_DIFF' &&
    delta.expectedDifferences.length===1 && delta.unexpectedDifferences===0,
    'unexplained engineering difference in regenerated CII');
  const requestedOutputVerification=verifyRequestedCiiOutputWeight({
    requestedOutputWeight:request.requestedOutputWeight,rigidPointer:row.rigidPointer,
    ciiEngineeringDiff:delta,
  });
  const massReconciliation = row.completeAllocation ?
    reconcileR4aPhysicalMass({ownership:row,sourceWeightKg:normalizedNew,
      reextractDiff:delta}) : null;
  const latest=typeof getCurrentResult==='function'?getCurrentResult():current;
  assert(latest===current && latest===session.originalResult,
    'run changed during asynchronous browser re-extraction');
  await assertCustody(session.custody,latest);
  const stem=session.custody.sourceName.replace(/\.[^.]*$/,'').replace(/[\\/:*?"|]/g,'_');
  const audit={
    schema:'xml-cii-source-backed-weight-audit/r2',
    status:'VERIFIED_REEXTRACT',
    sourceRunId:session.custody.runId,
    originalEngineXmlSha256:session.custody.engineSha,
    revisedEngineXmlSha256:patch.revisedSha256,
    originalCiiSha256:session.custody.originalCiiSha,
    revisedCiiSha256:delta.revisedCiiSha256,
    approval:{componentRefNo:row.sourceNode.componentRefNo,
      writerSourceNode:row.sourceIdentity,
      approvedByUser:true,physicalOwnerApprovedByUser:true,
      originalXmlWeight:row.sourceNode.originalXmlWeight,
      approvedNewXmlWeight:normalizedNew,weightScale:row.weightScale,
      originalRigidPointer:row.rigidPointer},
    sourceXmlByteDiff:patch.edits,unrelatedXmlBytesChanged:0,
    sourceWeightFieldCount:patch.edits.length,
    sourceOwnerRepresentationBasis:row.representationBasis||null,
    ciiEngineeringDiff:delta,
    ...(requestedOutputVerification?{requestedOutputVerification}:{}),
    ...(massReconciliation ? {massReconciliation,
      R1LineageFingerprint:session.verifiedLineage?.runIdentity?.snapshotFingerprint,
      sourceTransformationHistory:row.transformationHistory,
      dependentFinalRigidPointers:row.dependentPointers,
      affectedFinalElements:row.expectedImpact,
      sourceOwnerQualification:row.evidence,
      editAllocationApprovedAtTransaction:true} : {}),
    sourceLinkedReconciliation:'PASS',
    noEditParity:session.noEditParity,
  };
  const committed={status:'VERIFIED_REEXTRACT',
    approvedPointer:row.rigidPointer,approvedValue:newValue,
    originalXml:session.custody.engineXml,
    originalCii:session.custody.originalCii,
    revisedXml:patch.revisedXml,revisedCii:revised.ciiText,
    names:{originalXml:stem+'_original_enriched.xml',
      originalCii:session.originalResult.ciiName||stem+'_original.cii',
      revisedXml:stem+'_source_weight_revised.xml',
      revisedCii:stem+'_source_weight_reextracted.cii',
      audit:stem+'_source_weight_change_audit.json'},
    audit};
  session.committed=committed;
  return committed;
}
