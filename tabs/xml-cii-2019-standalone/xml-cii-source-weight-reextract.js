/** Production browser path: frozen EnrichedXML -> SAME Pyodide engine -> new CII.
 * Read-only R1 structural semantics are enforced by conservative direct-edge
 * eligibility, an explicit no-edit converter replay and value reconciliation.
 * This adapter does not invoke native subprocesses or a second writer.
 */
import { runXmlCii2019StandaloneEngineJob } from './xml-cii-workflow-engine-client.js';
import { ciiSha256 } from './xml-cii-final-property-reader.js';
import { parseFinalCiiRigidInventory } from './xml-cii-final-rigid-inventory.js';
import { deriveSourceWeightEligibility, verifyFrozenCiiEngineeringValues }
  from './xml-cii-source-weight-ownership.js';
import { applyXmlSourceEdits } from './xml-cii-source-weight-patch.js';
import { indexAll15CiiAuxiliaryPointers, verifySourceEditedCii }
  from './xml-cii-source-weight-cii-verify.js';

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
export async function initializeSourceWeightSession(result, { engineRunner }={}) {
  const custody=makeCustody(result);
  await assertCustody(custody,result);
  indexAll15CiiAuxiliaryPointers(custody.originalCii);
  const inventory=parseFinalCiiRigidInventory(custody.originalCii);
  const rows=await deriveSourceWeightEligibility({result,inventory});
  verifyFrozenCiiEngineeringValues({
    originalCiiText:custody.originalCii,inventory,entries:rows });
  const noEdit=await run(exactJob(custody,custody.engineXml),engineRunner);
  assert(noEdit.ciiText===custody.originalCii,
    'no-edit real browser converter output is not byte-identical to original CII');
  assert(await ciiSha256(noEdit.ciiText)===custody.originalCiiSha,
    'no-edit converter digest mismatch');
  return {schema:'xml-cii-source-weight-session/r2',custody,inventory,
    rows,engineRunner,committed:null,originalResult:result,
    noEditParity:{status:'PASS_EXACT_REPLAY',sha256:custody.originalCiiSha,
      bytes:new TextEncoder().encode(custody.originalCii).length,differingBytes:0},
    valueIntegrity:'SERIALIZED_VALUES_VERIFIED',
    physicalMassAuthority:'USER_APPROVAL_REQUIRED',verifiedAt:Date.now()};
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
  if(session.committed){
    assert(session.committed.approvedPointer===row.rigidPointer &&
      session.committed.approvedValue===newValue &&
      request?.approved===true && request?.ownerApproved===true,
      'session already committed a different approved edit; create a new source session');
    return session.committed; // idempotent repeat; no second converter run
  }
  const patch=await applyXmlSourceEdits({
    originalXml:session.custody.engineXml,
    originalSha256:session.custody.engineSha,
    edits:[{
      propertyId:'Node/Weight',approved:true,ownerApproved:true,
      zeroConfirmed:request.zeroConfirmed===true,
      branchName:row.sourceNode.branchName,
      branchOrdinal:row.sourceNode.branchOrdinal,
      nodeOrdinal:row.sourceNode.nodeOrdinal,
      nodeNumber:row.sourceNode.nodeNumber,
      componentRefNo:row.sourceNode.componentRefNo,
      originalToken:row.sourceNode.originalWeightToken,
      newValue,
    }],
  });
  assert(patch.edits.length===1 && patch.unrelatedXmlBytesChanged===0,
    'XML byte-diff is not exactly one source Weight field');
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
    ciiEngineeringDiff:delta,
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
