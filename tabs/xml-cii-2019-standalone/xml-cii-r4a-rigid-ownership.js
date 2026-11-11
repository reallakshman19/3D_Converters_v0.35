/** R4A final-RIGID ownership projection from independently revalidated R1 Python
 * lineage. This is an engineering *candidate* map, not physical-mass approval.
 * Complete source impacts and mass totals are required for edit eligibility.
 */
import { inspectXmlWeightSources } from './xml-cii-source-weight-patch.js';
import { ciiSha256 } from './xml-cii-final-property-reader.js';

const VERIFIED = new Set(['EXACT_UNIQUE','TRANSFORMED_WITH_LINEAGE']);
const HOLD_CODES = Object.freeze([
  'CONFIGURATION_NOT_FROZEN','SOURCE_OWNER_AMBIGUOUS',
  'SPLIT_ALLOCATION_UNRESOLVED','RIGID_POINTER_MISMATCH',
  'SOURCE_FIELD_NOT_UNIQUE','RIGID_WRITER_SOURCE_UNRESOLVED',
  'SOURCE_WEIGHT_MISMATCH','PHYSICAL_MASS_APPROVAL_REQUIRED',
  'SOURCE_TRANSFORMATION_NOT_VERIFIED',
  'SOURCE_DEPENDENCY_INCOMPLETE',
]);
const numeric = value => {
  const raw=String(value??'').trim();
  if(!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw))return null;
  const n=Number(raw); return Number.isFinite(n)&&n>=0?n:null;
};
const sourceKey=(branchOrdinal,nodeOrdinal)=>branchOrdinal+':'+nodeOrdinal;
const edgeKey=e=>[e.branchName,e.fromNode,e.toNode,
  Number(e.lengthMm).toFixed(6),String(e.outsideDiameterMm)].join('|');
const reject=(row,code,detail,extra={})=>({
  rigidPointer:row.rigidPointer,eligible:false,status:'HOLD',
  reasonCode:code,reason:code+': '+detail,sourceIdentity:null,sourceNode:null,
  originalCiiWeight:row.weight,expectedImpact:[],...extra,
});
const approx=(a,b,tol=1e-5)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol;
const matchingRows=(source,n)=>{
  return source.filter(x=>x.branchOrdinal===n.branchOrdinal &&
    x.nodeOrdinal===n.nodeOrdinal &&
    x.branchName===n.branchName &&
    x.componentRefNo.replace(/^=/,'').toUpperCase()===n.componentRefNo &&
    x.nodeNumber===n.originalNodeNumber);
};
/** A repeated ComponentRefNo is common in source endpoint representation.
 * Only non-writer, explicitly ZERO-mass witnesses may be ignored. A second
 * writer or a positive/missing duplicate mass keeps the entire owner HOLD.
 * R1 independently validates source identity and all emitted RIGID pointers.
 */
export function classifyR4aComponentRepresentations({componentNodes,selectedSourceIdentity,
  writerDependents}) {
  const nodes=Array.isArray(componentNodes)?componentNodes:[];
  const writers=writerDependents instanceof Map?writerDependents:new Map();
  const detail=nodes.map(node=>({
    identity:node.identity,branchName:node.branchName,
    nodeNumber:node.originalNodeNumber,
    branchOrdinal:node.branchOrdinal,nodeOrdinal:node.nodeOrdinal,
    componentRefNo:node.componentRefNo,componentType:node.componentType,
    endpoint:node.fields?.Endpoint??null,rigidFlag:node.fields?.Rigid??null,
    position:node.fields?.Position??null,weightRaw:node.fields?.Weight??null,
    writerPointers:[...(writers.get(node.identity)||new Set())].sort((a,b)=>a-b),
  }));
  const selected=detail.find(n=>n.identity===selectedSourceIdentity);
  const selectedMass=numeric(selected?.weightRaw),issues=[];
  const issue=(code,node,detail)=>issues.push({
    code,sourceIdentity:node?.identity??null,
    sourceNodeNumber:node?.nodeNumber??null,
    branchName:node?.branchName??null,detail,
  });
  if(!selected)issue('WRITER_IDENTITY_NOT_FOUND',null,
    'No selected R1 writer matches a source node in this component');
  else if(selectedMass===null)issue('WRITER_WEIGHT_MISSING_OR_INVALID',selected,
    'Selected R1 writer lacks a finite nonnegative source Weight');
  for(const n of detail){
    if(!selected||n.identity===selectedSourceIdentity)continue;
    if(n.branchOrdinal!==selected.branchOrdinal||n.branchName!==selected.branchName)
      issue('CROSS_BRANCH_COMPONENT_REF',n,
        'Same ComponentRefNo appears in another branch; shared physical ownership is unproven');
    if(n.writerPointers.length)
      issue('ADDITIONAL_RIGID_WRITER',n,
        'Another source representation writes RIGID '+n.writerPointers.join(', '));
    const otherMass=numeric(n.weightRaw);
    if(otherMass===null)
      issue('NON_WRITER_WEIGHT_MISSING_OR_INVALID',n,'Additional source Weight is not numeric');
    else if(selectedMass!==null&&otherMass!==0&&otherMass!==selectedMass)
      issue('NON_WRITER_WEIGHT_CONFLICT',n,
        'Additional nonzero source Weight differs from selected writer');
  }
  if(selected&&nodes.length>1&&!selected.writerPointers.length)
    issue('SELECTED_SOURCE_NOT_A_WRITER',selected,
      'Selected source has no final RIGID writer dependency');
  const failureCodes=[...new Set(issues.map(x=>x.code))];
  if(issues.length)return {qualified:false,reason:issues.map(x=>
    x.code+(x.sourceNodeNumber?' (Node '+x.sourceNodeNumber+')':'')).join('; '),
    failureCodes,issues,nodes:detail,aliases:[]};
  const aliases=detail.filter(n=>n.identity!==selectedSourceIdentity &&
    numeric(n.weightRaw)===selectedMass && selectedMass>0);
  return {qualified:true,reason:nodes.length>1
    ? aliases.length
      ? 'Unique R1 writer plus identical positive non-writer aliases; update all matching XML tokens atomically.'
      : 'Unique R1 writer plus explicitly zero-weight non-writer endpoint witnesses.'
    : 'Single physical source node.',
    failureCodes:[],issues:[],nodes:detail,aliases:aliases.map(n=>n.identity)};
}

const transformFor=(ledger,sourceId,edges)=>{
  const identities=new Set([sourceId,...edges.flatMap(x=>x.sourceEdgeIdentity||[])]);
  return ledger.transformations.filter(t=>identities.has(t.sourceIdentity));
};

/** Produces one record per actual emitted CII RIGID and a breakdown of HOLD
 * reasons. Never claim physical authorization from a unique source token. */
export async function projectR4aOwnership({result,inventory,verifiedLineage}) {
  const evidence=result?.finalRigidReviewEvidence||{};
  const rows=inventory?.rows||[];
  const globalHold=(code,detail)=>({
    schema:'xml-cii-r4a-ownership-projection/v1',
    status:'HOLD',reasonCode:code,
    rows:rows.map(x=>reject(x,code,detail)),
    breakdown:{[code]:rows.length},
    qualifiedStructuralOwners:0,physicalMassApprovals:0,
  });
  if(!verifiedLineage || verifiedLineage.status!=='PASS_R1_STRUCTURAL_LINEAGE_WITH_UNATTESTED_MASS' ||
      !evidence.engineInputText || !evidence.supportConfigJson ||
      !evidence.effectiveOptions || !evidence.engineInputSha256 ||
      !evidence.originalCiiSha256) {
    return globalHold('CONFIGURATION_NOT_FROZEN','Verified Python R1 lineage and exact conversion custody missing.');
  }
  const ledger=verifiedLineage;
  const hash=[await ciiSha256(evidence.engineInputText),
              await ciiSha256(result.ciiText),
              await ciiSha256(evidence.supportConfigJson)];
  if(hash[0]!==ledger.runIdentity.sourceXmlSha256 ||
     hash[0]!==evidence.engineInputSha256 ||
     hash[1]!==ledger.runIdentity.originalCiiSha256 ||
     hash[1]!==evidence.originalCiiSha256 ||
     hash[2]!==ledger.runIdentity.configurationSha256 ||
     ledger.runIdentity.runId !== evidence.engineInputDigest ||
     ledger.noEditComparison?.differingBytes!==0) {
    return globalHold('CONFIGURATION_NOT_FROZEN','R1 source/CII/config digest differs from actual current run.');
  }
  const scale=evidence.weightScale;
  if(![1,10].includes(scale) ||
     scale!==(evidence.effectiveOptions.kgToNewton===false?1:10)) {
    return globalHold('CONFIGURATION_NOT_FROZEN','Run weight scale not pinned to existing converter invocation.');
  }
  let source;
  try {source=inspectXmlWeightSources(evidence.engineInputText);}
  catch(err){return globalHold('SOURCE_FIELD_NOT_UNIQUE',String(err));}
  const sourceById=new Map(ledger.sourceNodes.map(x=>[x.identity,x]));
  const componentToNodes=new Map();
  for(const n of ledger.sourceNodes){
    if(!n.componentRefNo)continue;
    const a=componentToNodes.get(n.componentRefNo)||new Set();
    a.add(n.identity);componentToNodes.set(n.componentRefNo,a);
  }
  const elements=new Map(ledger.elements.map(x=>[x.elementIndex,x]));
  const output=new Map(rows.map(x=>[x.rigidPointer,x]));
  const auxiliaries=new Map(ledger.auxiliaryRecords.map(x=>[x.recordPointer,x]));
  const writerDependents=new Map();
  for(const aux of ledger.auxiliaryRecords){
    if(aux.writerWeightSourceNode){
      const dependents=writerDependents.get(aux.writerWeightSourceNode)||new Set();
      dependents.add(aux.recordPointer);
      writerDependents.set(aux.writerWeightSourceNode,dependents);
    }
  }
  const componentToRigids=new Map();
  for(const aux of ledger.auxiliaryRecords){
    for(const component of aux.ownerCandidates||[]){
      const group=componentToRigids.get(component)||new Set();
      group.add(aux.recordPointer);componentToRigids.set(component,group);
    }
  }
  const rejected = [];
  for(const row of rows){
    const aux=auxiliaries.get(row.rigidPointer);
    if(!aux || aux.section!=='RIGID' ||
      !Array.isArray(aux.linkedElements) ||
      aux.linkedElements.length!==row.linkedElements.length ||
      aux.linkedElements.some(x=>!row.linkedElements.some(e=>e.index===x))) {
      rejected.push(reject(row,'RIGID_POINTER_MISMATCH',
        'R1 auxiliary pointer does not equal final CII linked ELEMENT identities.'));continue;
    }
    if(row.linkedElements.length!==1){
      rejected.push(reject(row,'SPLIT_ALLOCATION_UNRESOLVED',
        'A RIGID pointer is unreferenced or shared by several ELEMENTs.'));continue;
    }
    const edge=row.linkedElements[0], e=elements.get(edge.index);
    if(!e || e.branchName!==edge.branchName ||
      String(e.fromNode)!==String(edge.fromNode) ||
      String(e.toNode)!==String(edge.toNode) ||
      !VERIFIED.has(e.lineageStatus) ||
      !Array.isArray(e.sourceEdgeIdentity) || e.sourceEdgeIdentity.length!==2){
      rejected.push(reject(row,'SOURCE_TRANSFORMATION_NOT_VERIFIED',
        'No unique R1 preprocessed-source edge matches final branch/FROM/TO.'));continue;
    }
    // R1 is intentionally conservative about *any* repeated ComponentRefNo.
    // Preserve its raw AMBIGUOUS finding, but independently check the exact
    // writer + every original source representation below. No other R1
    // ambiguity may be elevated to a structurally editable candidate.
    const repeatOnly=aux.ownershipStatus==='AMBIGUOUS' &&
      aux.reason==='Multiple source nodes carry ComponentRefNo; mass allocation unproved' &&
      Array.isArray(aux.ownerCandidates) && aux.ownerCandidates.length===1 &&
      (aux.sourceOwners||[]).length===0;
    if((!VERIFIED.has(aux.ownershipStatus) && !repeatOnly) ||
       !aux.writerWeightSourceNode ||
       (!repeatOnly && (aux.sourceOwners||[]).length!==1) ||
       !sourceById.has(aux.writerWeightSourceNode)){
      rejected.push(reject(row,'SOURCE_OWNER_AMBIGUOUS',
        aux.reason||'R1 writer selection or component owner remains ambiguous.'));continue;
    }
    const node=sourceById.get(aux.writerWeightSourceNode);
    if(!e.sourceEdgeIdentity.includes(node.identity)){
      rejected.push(reject(row,'RIGID_WRITER_SOURCE_UNRESOLVED',
        'Writer-selected source node does not belong to R1 ELEMENT source endpoints.'));continue;
    }
    const matches=matchingRows(source,node);
    if(matches.length!==1 || !matches[0].weightField ||
      !matches[0].componentRefNo){
      rejected.push(reject(row,'SOURCE_FIELD_NOT_UNIQUE',
        'No unique editable Node/Weight token at exact R1 original branch/ordinal identity.'));continue;
    }
    const component=node.componentRefNo;
    if(repeatOnly && aux.ownerCandidates[0]!==component){
      rejected.push(reject(row,'SOURCE_OWNER_AMBIGUOUS',
        'R1 writer source component differs from the repeated owner candidates.'));continue;
    }
    const componentGroup=[...(componentToNodes.get(component)||new Set())]
      .map(id=>sourceById.get(id)).filter(Boolean);
    const representation=classifyR4aComponentRepresentations({
      componentNodes:componentGroup,
      selectedSourceIdentity:node.identity,
      writerDependents,
    });
    // Do not trust the ledger's duplicate nodes without matching their exact
    // original source identity and mass token in the immutable XML.
    const sourceGroupMatches=componentGroup.every(n=>{
      const matches=matchingRows(source,n);
      return matches.length===1 &&
        matches[0].weightField?.value===(n.fields?.Weight??'');
    });
    if(!representation.qualified || !sourceGroupMatches){
      rejected.push(reject(row,'SOURCE_OWNER_AMBIGUOUS',
        sourceGroupMatches?representation.reason:
          'R1 repeated-source candidates do not match original frozen XML Node/Weight tokens.',{
          physicalComponentRefNo:component,
          sourceNodeCandidates:representation.nodes,
          ambiguityReasons:representation.failureCodes?.length?
            representation.failureCodes:['SOURCE_XML_REPRESENTATION_MISMATCH'],
          ambiguityIssues:representation.issues||[],
          dependentPointers:[...new Set(representation.nodes.flatMap(n=>n.writerPointers))],
          resolutionAdvice:'Inspect every XML representation and writer dependency. A single writer with zero-mass non-writer witnesses may use an isolated converter trial; extra writers, conflicting masses or cross-branch reuse need approved allocation.',
        }));
      continue;
    }
    const candidate=matches[0], originalMass=numeric(candidate.weightField.value);
    if(originalMass===null || !approx(originalMass*scale,row.weight) ||
      !approx(originalMass*scale,Number(aux.weight))) {
      rejected.push(reject(row,'SOURCE_WEIGHT_MISMATCH',
        'Frozen source mass, writer-selected value and emitted CII RIGID weight disagree.'));continue;
    }
    const componentPointers=componentToRigids.get(component)||new Set();
    const writerPointers=writerDependents.get(node.identity)||new Set();
    // Any second output RIGID tied to this physical component or writer source
    // requires a complete, approved split allocation, not a duplicated mass.
    if(componentPointers.size!==1 || !componentPointers.has(row.rigidPointer) ||
      writerPointers.size!==1 || !writerPointers.has(row.rigidPointer)){
      rejected.push(reject(row,'SPLIT_ALLOCATION_UNRESOLVED',
        'Writer source or ComponentRefNo controls multiple emitted RIGIDs; no complete physical mass allocation.',
        {physicalComponentRefNo:component,dependentPointers:[...new Set([...componentPointers,...writerPointers])]}));
      continue;
    }
    // The source may be an endpoint of more than one RIGID. This is not by
    // itself an owner conflict; exact R1 writer-source references above must
    // show all physically dependent masses have been captured.
    const sourceIdentity=node.identity;
    const history=transformFor(ledger,sourceIdentity,[e]);
    const sourceNode={branchName:node.branchName,branchOrdinal:node.branchOrdinal,
      nodeOrdinal:node.nodeOrdinal,nodeNumber:node.originalNodeNumber,
      componentRefNo:component,componentType:node.componentType,
      originalWeightToken:candidate.weightField.value,originalXmlWeight:originalMass};
    rejected.push({
      rigidPointer:row.rigidPointer,eligible:true,
      status:'SOURCE_MAPPING_VERIFIED_APPROVAL_REQUIRED',
      reasonCode:'PHYSICAL_MASS_APPROVAL_REQUIRED',
      reason:'R1 source owner and complete one-pointer allocation verified. Explicit physical ownership and weight approval still required.',
      sourceIdentity,writerSourceNode:candidate,sourceNode,
      originalCiiWeight:row.weight,weightScale:scale,
      originalElement:edge,originalEdgeKey:edgeKey(edge),sourceInputSha256:hash[0],
      physicalComponentRefNo:component,sourceMassKg:originalMass,
      originalPhysicalMassKg:originalMass,
      originalAllocatedMassKg:row.weight/scale,
      totalAllocatedMassKg:row.weight/scale,
      dependentPointers:[row.rigidPointer],
      sourceNodeCandidates:representation.nodes,
      sourceWeightFieldsToEdit:[node.identity,...representation.aliases],
      representationBasis:representation.reason,
      completeAllocation:true,
      allocationRule:'ONE_UNIQUE_WRITER_SOURCE_ONE_EMITTED_RIGID',
      allocations:[{oldRigidPointer:row.rigidPointer,
        elementIndex:edge.index,originalWeightCii:row.weight,
        originalAllocatedMassKg:row.weight/scale,
        fraction:1,sourceNodeIdentity:sourceIdentity,
        allocationRule:'ONE_TO_ONE_VERIFIED_SOURCE'}],
      originalSourceNodeIdentity:sourceIdentity,
      sourceEdgeIdentities:e.sourceEdgeIdentity,
      pythonTransformedNodeIdentities:(ledger.index?.pythonNodeToOriginalSourceNode?
        Object.entries(ledger.index.pythonNodeToOriginalSourceNode)
          .filter(([,sid])=>e.sourceEdgeIdentity.includes(sid))
          .map(([pid])=>pid):[]),
      transformationHistory:history,
      expectedImpact:[{elementIndex:edge.index,rigidPointer:row.rigidPointer,
        branchName:edge.branchName,fromNode:edge.fromNode,toNode:edge.toNode}],
      evidence:{sourceXmlSha256:hash[0],originalCiiSha256:hash[1],
        configurationSha256:hash[2],
        r1SnapshotFingerprint:ledger.runIdentity.snapshotFingerprint,
        r1OwnerStatus:aux.ownershipStatus,
        r1ElementStatus:e.lineageStatus},
    });
  }
  const breakdown={};for(const r of rejected){
    if(!r.eligible)breakdown[r.reasonCode]=(breakdown[r.reasonCode]||0)+1;
  }
  return {schema:'xml-cii-r4a-ownership-projection/v1',
    status:'READ_ONLY_STRUCTURAL_CANDIDATES',rows:rejected,
    breakdown,qualifiedStructuralOwners:rejected.filter(r=>r.eligible).length,
    physicalMassApprovals:0,
    verification:{sourceXmlSha256:hash[0],ciiSha256:hash[1],
      configurationSha256:hash[2],r1Fingerprint:ledger.runIdentity.snapshotFingerprint,
      all15PointersRevalidatedInPython:true,completeOwnerArrayChecked:true,
      noEditByteDifferences:0},
    policy:'Qualified physical owner requires explicit per-transaction approval; no catalog/suggestion authority.',
    holdReasonCodes:HOLD_CODES};
}

export function summarizeR4aOwnership(rows) {
  const reasons={};
  for(const row of rows||[]){
    if(row.eligible)continue;
    const code=row.reasonCode||'SOURCE_OWNER_AMBIGUOUS';
    reasons[code]=(reasons[code]||0)+1;
  }
  return {total:(rows||[]).length,qualified:(rows||[]).filter(x=>x.eligible).length,
    held:(rows||[]).filter(x=>!x.eligible).length,reasons};
}
