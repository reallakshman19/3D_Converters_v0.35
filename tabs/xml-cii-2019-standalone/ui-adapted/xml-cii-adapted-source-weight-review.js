/** Explicit source-backed XML mode in existing fullscreen Final Weight Review.
 * Deliberately separate from the unchanged direct-CII edit transaction.
 */
import { initializeSourceWeightSession, applySourceBackedWeightChange }
  from '../xml-cii-source-weight-reextract.js';
import { numericalValue } from '../xml-cii-final-property-validation.js';
import { sourceWeightFromCiiTarget,ciiTargetFromSourceWeight }
  from '../xml-cii-source-weight-output-target.js';
import { previewR4bIsolatedSourceEdit,applyR4bIsolatedSourceEdit }
  from '../xml-cii-r4b-isolated-source-edit.js';
import { buildR4bRigidOwnershipReport, r4bOwnershipAuditCsv }
  from '../xml-cii-r4b-ownership-audit.js';

function el(tag, text, attrs={}){
  const n=document.createElement(tag);
  if(text!==undefined && text!==null)n.textContent=String(text);
  for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));
  return n;
}
function download(name,text,mime){
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const link=el('a');link.href=url;link.download=name;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}
function add(parent,tag,text,attrs){const n=el(tag,text,attrs);parent.appendChild(n);return n;}
function button(parent,text,attr){
  const b=add(parent,'button',text,{'type':'button',...attr});
  b.style.cssText='padding:8px 12px;border-radius:5px;border:1px solid #64748b;background:#1d4ed8;color:#fff;cursor:pointer;';
  return b;
}
function valueLabel(parent,title,value){
  const cell=add(parent,'div',null,{style:'min-width:170px;flex:1;'});
  add(cell,'div',title,{style:'font-size:10px;color:#93c5fd;'});
  const v=add(cell,'div',value,{style:'font-size:12px;overflow-wrap:anywhere;'});
  return v;
}

export function installSourceBackedWeightReview({
  overlay,result,inventory,getCurrentResult,
  engineRunner, // tests only; default invokes actual browser/Pyodide converter
}){
  const prior=overlay.querySelector('[data-final-rigid-bottom-close]');
  if(!prior)return null;
  const panel=el('section',null,{'data-source-backed-weight-review':'',
    style:'border:1px solid #475569;background:#111e30;padding:12px;border-radius:8px;margin-top:16px;'});
  prior.insertAdjacentElement('beforebegin',panel);
  const bar=add(panel,'div',null,{style:'display:flex;flex-wrap:wrap;align-items:center;gap:10px;'});
  add(bar,'strong','Source-backed XML edit',{style:'color:#93c5fd;font-size:14px;'});
  const open=button(bar,'Open source-backed XML edit mode',{'data-source-weight-open':''});
  const info=add(bar,'span','Source-backed XML editing requires verified physical ownership. Advisory CII warnings use the separate direct-CII transaction.',
    {style:'font-size:11px;color:#cbd5e1;'});
  const direct=button(bar,'Go to Direct-CII Weight Review',{'data-source-weight-direct-cii':''});
  direct.style.cssText='padding:8px 12px;border-radius:5px;border:1px solid #60a5fa;background:#1e293b;color:#dbeafe;cursor:pointer;';
  const content=add(panel,'div',null,{'data-source-weight-content':'',
    style:'display:none;padding-top:12px;'});
  // A compact source status/inspect cell per existing emitted RIGID row.
  // All prior columns, suggestion buttons, reference and direct-CII actions
  // remain untouched. Details appear in the separate panel, not clipped cells.
  const table=overlay.querySelector('[data-final-rigid-table-wrap] table');
  const header=table?.querySelector('thead tr');
  if(header){
    const th=el('th','Source XML',{style:'padding:9px;white-space:nowrap;'});
    header.lastElementChild?.insertAdjacentElement('beforebegin',th);
    th.dataset.sourceWeightHeader='';
  }
  const rowCells=new Map();
  for(const tr of overlay.querySelectorAll('[data-final-rigid-row]')){
    const pointer=Number(tr.dataset.pointer);
    const td=el('td',null,{style:'padding:8px;min-width:150px;'});
    // Existing Status must stay the LAST cell; old code/tests use that index.
    tr.lastElementChild?.insertAdjacentElement('beforebegin',td);
    const state=add(td,'div','Not qualified',{'data-source-weight-cell-status':pointer,
      style:'font-size:10px;color:#fbbf24;'});
    const inspect=button(td,'Inspect source',{'data-source-weight-inspect':pointer});
    inspect.style.cssText='font-size:10px;padding:4px 7px;color:#e2e8f0;background:#334155;border:1px solid #64748b;border-radius:5px;';
    rowCells.set(pointer,{state,inspect});
  }
  const status=add(content,'pre','Not initialized.',{'data-source-weight-status':'',
    role:'status',style:'white-space:pre-wrap;color:#fbbf24;font-size:12px;'});
  const form=add(content,'div',null,{style:'display:flex;flex-wrap:wrap;gap:12px;align-items:end;'});
  const searchWrap=add(form,'label','Search RIGID pointer / ComponentRefNo',
    {style:'font-size:11px;'});
  const search=add(searchWrap,'input',null,{
    'data-source-weight-search':'',type:'search',
    placeholder:'RIGID 56 / ComponentRefNo',
    style:'display:block;min-width:200px;padding:7px;background:#0b1220;color:#f8fafc;border:1px solid #64748b;'});
  const pickWrap=add(form,'label','RIGID pointer · verified source', {style:'font-size:11px;'});
  const picker=add(pickWrap,'select',null,{'data-source-weight-pointer':'',
    style:'display:block;min-width:180px;background:#0b1220;color:#f8fafc;padding:7px;'});
  const valueWrap=add(form,'label','Proposed XML Weight (kg)',{style:'font-size:11px;'});
  const proposed=add(valueWrap,'input',null,{'data-source-weight-value':'',
    type:'text',inputmode:'decimal',placeholder:'e.g. 2.984',
    style:'display:block;max-width:190px;padding:7px;background:#0b1220;color:#fff;border:1px solid #64748b;'});
  proposed.disabled=true; // No editable source is presumed before exact run qualification.
  const outputWrap=add(form,'label','Desired final CII RIGID weight (output units)',{
    style:'font-size:11px;'});
  const outputTarget=add(outputWrap,'input',null,{
    'data-source-weight-output-target':'',type:'text',inputmode:'decimal',
    placeholder:'e.g. 0.001',title:'Edits exported CII weight via verified XML source; not the reference used for Error %.',
    style:'display:block;max-width:190px;padding:7px;background:#0b1220;color:#fff;border:1px solid #64748b;'});
  outputTarget.disabled=true;
  const outputHint=add(outputWrap,'small','Output units are N only when the frozen run has the ×10 conversion.',{
    'data-source-weight-output-hint':'',
    style:'display:block;max-width:230px;color:#93c5fd;font-size:10px;white-space:normal;'});
  const eligibility=add(valueWrap,'small','HOLD: Source owner not yet verified.',{
    'data-source-weight-eligibility-detail':'',
    style:'display:block;max-width:280px;color:#fbbf24;font-size:10px;white-space:normal;'});
  const approvals=add(content,'div',null,{style:'margin-top:12px;display:flex;flex-wrap:wrap;gap:15px;'});
  const ownerLabel=add(approvals,'label',null,{style:'font-size:11px;color:#fde68a;'});
  const owner=add(ownerLabel,'input',null,{'type':'checkbox','data-source-weight-owner-approved':''});
  ownerLabel.append(' I authorize the physical-component ownership and full weight allocation shown.');
  const approvalLabel=add(approvals,'label',null,{style:'font-size:11px;color:#e2e8f0;'});
  const approval=add(approvalLabel,'input',null,{'type':'checkbox','data-source-weight-approved':''});
  approvalLabel.append(' I explicitly approve this XML Weight change (not a catalog suggestion).');
  const groupPlan=add(content,'fieldset',null,{
    'data-source-weight-r4b-plan':'',
    style:'display:none;border:1px solid #64748b;padding:12px;margin-top:12px;'});
  add(groupPlan,'legend','R4B/R4C verified source-writer allocation approval');
  add(groupPlan,'p','A real-converter trial must prove exact isolation for one or more RIGID writers. Repeated ComponentRefNo is not physical mass approval. Enter a separately approved revised physical group total and its engineering reference before Apply.',
    {style:'font-size:12px;color:#fde68a;'});
  const planTotalLabel=add(groupPlan,'label','Approved revised physical group total (kg) ',{style:'font-size:11px;'});
  const planTotal=add(planTotalLabel,'input',null,{
    'data-source-weight-r4b-total':'',type:'text',inputmode:'decimal',
    placeholder:'e.g. 17.6',style:'margin:5px;padding:6px;background:#0b1220;color:#fff;'});
  const basisLabel=add(groupPlan,'label','Engineering reference / signed allocation basis ',{style:'font-size:11px;'});
  const planBasis=add(basisLabel,'input',null,{
    'data-source-weight-r4b-basis':'',type:'text',
    placeholder:'Approved document, revision and owner',
    style:'margin:5px;padding:6px;min-width:280px;background:#0b1220;color:#fff;'});
  const zeroLabel=add(approvals,'label',null,{style:'font-size:11px;color:#e2e8f0;'});
  const zero=add(zeroLabel,'input',null,{'type':'checkbox','data-source-weight-zero':''});
  zeroLabel.append(' Confirm approved numeric zero');
  const facts=add(content,'div',null,{'data-source-weight-facts':'',
    style:'display:flex;flex-wrap:wrap;gap:12px;margin:12px 0;padding:10px;border:1px solid #334155;border-radius:6px;'});
  const actions=add(content,'div',null,{style:'display:flex;flex-wrap:wrap;gap:8px;'});
  const preview=button(actions,'Preview approved source change',{'data-source-weight-preview':''});
  const apply=button(actions,'Apply to EnrichedXML & Re-extract CII',{'data-source-weight-apply':''});
  apply.disabled=true;
  const dl=add(content,'div',null,{style:'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;'});
  const downloads={
    originalXml:button(dl,'Original EnrichedXML',{'data-source-weight-original-xml':''}),
    originalCii:button(dl,'Original CII',{'data-source-weight-original-cii':''}),
    ownershipReport:button(dl,'Download RIGID source/HOLD report',{'data-source-weight-ownership-report':''}),
    ownershipR4bJson:button(dl,'Download detailed R4B ownership JSON',{'data-source-weight-r4b-json':''}),
    ownershipCsv:button(dl,'Download detailed R4B ownership CSV',{'data-source-weight-ownership-csv':''}),
    revisedXml:button(dl,'Download revised EnrichedXML',{'data-source-weight-revised-xml':''}),
    revisedCii:button(dl,'Download re-extracted CII',{'data-source-weight-revised-cii':''}),
    audit:button(dl,'Download verified change audit',{'data-source-weight-audit':''}),
  };
  Object.values(downloads).forEach(b=>b.disabled=true);
  const report=add(content,'pre','Source ownership and no-edit parity not yet verified.',{
    'data-source-weight-report':'',style:'white-space:pre-wrap;max-height:210px;overflow:auto;color:#cbd5e1;font-size:11px;'});
  let session=null, committed=null, ready=false, applying=false, previewSignature='';
  let pendingPointer=null;
  let version=0, r4bPreview=null;
  const r4bCanProbe=row=>Boolean(row&&!row.eligible&&
    ['SOURCE_OWNER_AMBIGUOUS','SPLIT_ALLOCATION_UNRESOLVED'].includes(row.reasonCode)&&
    session?.verifiedLineage?.status==='PASS_R1_STRUCTURAL_LINEAGE_WITH_UNATTESTED_MASS'&&
    session?.r4bAuditByPointer?.get(row.rigidPointer)?.probeCandidate===true);
  const current=()=>typeof getCurrentResult==='function'?getCurrentResult():result;
  direct.addEventListener('click',()=>{
    if(content.style.display!=='none'){
      content.style.display='none';
      open.textContent='Open source-backed XML edit mode';
    }
    const toolbar=overlay.querySelector('[data-final-rigid-batch-toolbar]');
    if(toolbar){
      toolbar.scrollIntoView({block:'center'});
      toolbar.querySelector('[data-final-rigid-batch-preview]')?.focus();
    }
  });
  const markDirty=()=>{
    version++;committed=null;previewSignature='';r4bPreview=null;apply.disabled=true;
    for(const key of ['revisedXml','revisedCii','audit'])downloads[key].disabled=true;
  };
  const selectedRow=()=>session?.rows.find(r=>r.rigidPointer===Number(picker.value));
  function renderFacts(){
    facts.replaceChildren();
    const row=selectedRow();
    if(!row){
      proposed.disabled=outputTarget.disabled=owner.disabled=approval.disabled=true;
      eligibility.textContent='HOLD: No verified RIGID/source owner selected.';
      proposed.title=eligibility.textContent;
      valueLabel(facts,'Source status','Not resolved');return;
    }
    const src=row.sourceNode;
    const diagnostic=session?.r4bAuditByPointer?.get(row.rigidPointer);
    const pieces=[
      ['Status',row.status],['Reason',row.reason],
      ['RIGID pointer',row.rigidPointer],
      ['Linked ELEMENT',row.originalElement?.index??(diagnostic?.elementIndex!=null?diagnostic.elementIndex+' (R1 observed, allocation unverified)':'Not verified')],
      ['Source ComponentRefNo',src?.componentRefNo||diagnostic?.componentRefNo||'Unresolved'],
      ['Source NodeNumber',src?.nodeNumber||((diagnostic?.sourceNode||'')+' (R1 observed, physical owner unverified)')||'Unresolved'],
      ['Writer source node',row.sourceIdentity||diagnostic?.writerSourceIdentity||'Unresolved'],
      ['Original XML Weight',src?.originalXmlWeight??diagnostic?.originalXmlWeightKg??'Unresolved'],
      ['Original CII Weight',row.originalCiiWeight??'Unresolved'],
      ['Weight scale',row.weightScale??diagnostic?.weightScale??'Unresolved'],
      ['Rejection / approval code',row.reasonCode||'R2_DIRECT_EDGE_ONLY'],
      ['Physical owner',row.physicalComponentRefNo||diagnostic?.componentRefNo||'UNRESOLVED'],
      ['Source Node/Weight candidates',(row.sourceNodeCandidates||
        diagnostic?.sourceNodeCandidates||[]).map(n=>
        n.branchName+' Node '+n.nodeNumber+' (ordinal '+n.nodeOrdinal+
        ', Endpoint '+(n.endpoint||'none')+', Rigid '+(n.rigidFlag||'none')+
        ', Weight '+(n.weightRaw==null || n.weightRaw===''?'MISSING':n.weightRaw)+
        ' kg, writer RIGIDs '+(n.writerPointers?.join(', ')||'none')+')'
      ).join('; ')||'Not resolved'],
      ['Specific ownership conflicts',(row.ambiguityReasons||
        diagnostic?.ambiguityReasons||[]).join(', ')||'No granular conflict recorded'],
      ['Conflict evidence',(row.ambiguityIssues||diagnostic?.ambiguityIssues||[])
        .map(x=>x.code+' · Node '+(x.sourceNodeNumber||'?')+
          ' · '+(x.branchName||'?')+' · '+x.detail).join('; ')||
          'No granular conflict details available'],
      ['Owner representation evidence',row.representationBasis||row.resolutionAdvice||'No verified allocation'],
      ['Source Weight fields to update together',row.sourceWeightFieldsToEdit?.length??'UNQUALIFIED'],
      ['Original physical mass (kg)',row.originalPhysicalMassKg??'UNVERIFIED'],
      ['Original allocated CII mass (kg)',row.totalAllocatedMassKg??'UNVERIFIED'],
      ['Mass-allocation reason',row.allocationRule||'UNRESOLVED'],
      ['Dependent RIGID pointers',diagnostic?.dependentRigidPointers?.join(', ')||row.dependentPointers?.join(', ')||'NOT_QUALIFIED'],
      ['R4B ELEMENT FROM / TO',diagnostic?.elements?.map(e=>e.fromNode+' → '+e.toNode).join('; ')||'UNVERIFIED'],
      ['R4B element lengths (mm)',diagnostic?.elements?.map(e=>e.lengthMm).join('; ')||'UNVERIFIED'],
      ['R1 writer side',diagnostic?.writerSourceSelection||'UNVERIFIED'],
      ['Dependent allocation status',diagnostic?.dependentSetStatus||'UNVERIFIED'],
      ['Independent physical reference',diagnostic?.referenceBasis||'UNAVAILABLE'],
      ['Transformations',row.transformationHistory?.map(x=>x.stage).join(', ')||'None or not qualified'],
      ['Expected CII impact',row.expectedImpact?.map(x=>x.fromNode+' → '+x.toNode).join(', ')||'Unknown'],
    ];
    for(const [title,value]of pieces)valueLabel(facts,title,value);
    const multi=r4bCanProbe(row);
    groupPlan.style.display=multi?'block':'none';
    proposed.disabled=outputTarget.disabled=!(row.eligible||multi);
    approval.disabled=owner.disabled=!(row.eligible||multi);
    const scale=row.weightScale??diagnostic?.weightScale??session?.custody?.weightScale;
    outputHint.textContent=Number(scale)===10
      ? 'Frozen scale ×10: 0.001 N becomes 0.0001 kg in EnrichedXML. This is NOT the Error % reference.'
      : Number(scale)===1
        ? 'Frozen scale ×1: output weight equals source kg numerically. Do not assume N.'
        : 'HOLD: frozen kg-to-output scale not available.';
    eligibility.textContent=row.eligible
      ? 'Verified source owner (one-to-one). Enter an approved XML Weight (kg).'
      : multi
        ? 'R4B/R4C: physical owner remains unapproved. Enter proposed kg or desired CII weight, then Preview to prove isolated writer impact. Apply still requires approved group mass and reference.'
        : 'HOLD: '+(row.reasonCode||'SOURCE_OWNER_UNRESOLVED')+
          '. '+row.reason+' Use Direct-CII Weight Review for output-only changes.';
    eligibility.style.color=row.eligible?'#86efac':multi?'#93c5fd':'#fbbf24';
    proposed.title=eligibility.textContent;
    if(!row.eligible&&!multi){report.textContent='HOLD: '+row.reason;}
  }
  const proposal=()=>({
    rigidPointer:Number(picker.value),newValue:proposed.value.trim(),
    requestedOutputWeight:outputTarget.value.trim(),
    approved:approval.checked,ownerApproved:owner.checked,zeroConfirmed:zero.checked,
    allocationMode:'OWNER_APPROVED_REVISED_GROUP_TOTAL',
    approvedGroupTotalKg:planTotal.value.trim(),referenceBasis:planBasis.value.trim(),
  });
  const signature=()=>JSON.stringify(proposal());
  const clearApproval=()=>{
    owner.checked=false;approval.checked=false;zero.checked=false;
    planTotal.value='';planBasis.value='';markDirty();
  };
  const resetPicker=()=>{
    const rows=session?.rows||[];
    const previous=picker.value;
    const needle=search.value.trim().toLowerCase();
    picker.replaceChildren();
    const options=rows.filter(row=>!needle||
      String(row.rigidPointer).includes(needle.replace(/^rigid\s*/,'').trim()) ||
      String(row.physicalComponentRefNo||row.sourceNode?.componentRefNo||
        session?.r4bAuditByPointer?.get(row.rigidPointer)?.componentRefNo||'')
        .toLowerCase().includes(needle) ||
      String(row.reasonCode||'').toLowerCase().includes(needle));
    for(const row of options){
      const opt=el('option',
        'RIGID '+row.rigidPointer+' · '+(row.eligible?
          'SOURCE QUALIFIED · explicit approval':'HOLD · '+(row.reasonCode||row.reason)),
        {value:row.rigidPointer});
      picker.appendChild(opt);
    }
    if(!options.length)picker.appendChild(el('option','No RIGIDs match search',{value:''}));
    if(options.some(x=>String(x.rigidPointer)===previous))picker.value=previous;
    renderFacts();
  };
  async function init(){
    ready=false;session=null;markDirty();open.disabled=true;
    status.textContent='RUNNING: exact original-CII no-edit replay through existing browser converter…';
    try {
      const built=await initializeSourceWeightSession(result,{engineRunner});
      if(!overlay.isConnected||current()!==result)throw Error('Stale result/modal during no-edit replay.');
      // Read-only diagnostics must not prevent verified R4A source edits.
      try {
        built.r4bAudit=await buildR4bRigidOwnershipReport(built);
        built.r4bAuditByPointer=new Map(built.r4bAudit.rows.map(x=>[x.rigidPointer,x]));
      } catch(error) {
        built.r4bAuditError=String(error?.message||error);
        built.r4bAudit=null;
        built.r4bAuditByPointer=new Map();
      }
      session=built;ready=true;
      const qualified=built.rows.filter(r=>r.eligible).length;
      const breakdown=built.ownership?.breakdown||Object.fromEntries(
        Object.entries(built.rows.filter(x=>!x.eligible).reduce((t,x)=>{
          const name=x.reasonCode||'R2_DIRECT_EDGE_HOLD';t[name]=(t[name]||0)+1;return t;
        },{})));
      const reasons=Object.entries(breakdown)
        .map(([k,v])=>k+': '+v).join(' | ');
      status.textContent='PASS: original CII byte-exact replay ('+built.noEditParity.bytes+
        ' bytes); all 15 auxiliary pointers validated; serialized RIGID/OD values checked. '+
        qualified+'/'+built.rows.length+
        ' source owners structurally eligible; physical mass approval is still required.'+
        '\nR4A ownership HOLD breakdown: '+(reasons||'none')+
        (built.r4aReason ? '\nR4A independent Python lineage unavailable: '+built.r4aReason : '')+
        (qualified===0 ? '\nWARNING: No verified XML physical source owner is eligible. Original files remain downloadable. Revised source/CII outputs stay locked.' : '')+
        (built.r4bAuditError ? '\nR4B diagnostic report unavailable (source editor remains operational): '+built.r4bAuditError : '');
      resetPicker();
      for(const row of built.rows) {
        const item=rowCells.get(row.rigidPointer);
        if(item){
          item.state.textContent=row.eligible?'ELIGIBLE · approve owner':'HOLD · '+row.reason;
          item.state.style.color=row.eligible?'#86efac':'#fbbf24';
        }
      }
      if(pendingPointer!=null){
        picker.value=String(pendingPointer);
        pendingPointer=null;
        renderFacts();
      }
      downloads.originalXml.disabled=false;downloads.originalCii.disabled=false;
      downloads.ownershipReport.disabled=false;
      downloads.ownershipR4bJson.disabled=!built.r4bAudit;
      downloads.ownershipCsv.disabled=!built.r4bAudit;
    } catch(e){
      status.textContent='HOLD: '+(e?.message||e);
      report.textContent='No source-backed Apply or revised downloads are available.';
      proposed.disabled=owner.disabled=approval.disabled=true;
      eligibility.textContent='HOLD: '+String(e?.message||e);
      proposed.title=eligibility.textContent;
      Object.values(downloads).forEach(b=>b.disabled=true);
    }finally{open.disabled=false;}
  }
  open.addEventListener('click',()=>{
    const on=content.style.display==='none';
    content.style.display=on?'block':'none';
    open.textContent=on?'Close source-backed XML edit mode':'Open source-backed XML edit mode';
    if(on&&!ready&&!session)init();
  });
  for(const [pointer,{inspect}] of rowCells){
    inspect.addEventListener('click',()=>{
      pendingPointer=pointer;
      if(content.style.display==='none')open.click();
      if(ready){
        picker.value=String(pointer);
        pendingPointer=null;
        proposed.value='';outputTarget.value='';
        clearApproval();
        renderFacts();
        panel.scrollIntoView({block:'nearest'});
      }
    });
  }
  search.addEventListener('input',()=>{resetPicker();proposed.value='';outputTarget.value='';clearApproval();});
  picker.addEventListener('change',()=>{proposed.value='';outputTarget.value='';clearApproval();renderFacts();});
  const selectedScale=()=>Number(selectedRow()?.weightScale??
    session?.r4bAuditByPointer?.get(Number(picker.value))?.weightScale??
    session?.custody?.weightScale);
  proposed.addEventListener('input',()=>{
    try{
      outputTarget.value=proposed.value.trim()
        ? String(ciiTargetFromSourceWeight(proposed.value,selectedScale()).targetOutputWeight)
        : '';
    }catch{outputTarget.value='';}
    markDirty();
  });
  outputTarget.addEventListener('input',()=>{
    try{
      proposed.value=outputTarget.value.trim()
        ? sourceWeightFromCiiTarget(outputTarget.value,selectedScale()).sourceToken
        : '';
    }catch{proposed.value='';}
    markDirty();
  });
  for(const control of [approval,owner,zero,planTotal,planBasis])
    control.addEventListener('change',markDirty);
  for(const control of [planTotal,planBasis])control.addEventListener('input',markDirty);
  preview.addEventListener('click',async()=>{
    markDirty();
    const ticket=version;
    try {
      if(!ready||current()!==result)throw Error('Stale or unverified source conversion session.');
      const row=selectedRow();
      if(!row)throw Error('Select a final RIGID.');
      const text=proposed.value.trim();
      const parsed=numericalValue(text);
      if(parsed.number<0||parsed.number>1e12)throw Error('Negative/out-of-range XML Weight.');
      if(outputTarget.value.trim()){
        const conversion=sourceWeightFromCiiTarget(outputTarget.value,selectedScale());
        if(Math.abs(parsed.number-conversion.sourceWeightKg)>
            Math.max(1e-10,conversion.sourceWeightKg*1e-12))
          throw Error('Source kg field and desired emitted CII weight disagree.');
      }
      if(parsed.number===0&&!zero.checked)throw Error('Confirm numeric zero explicitly.');
      if(r4bCanProbe(row)){
        report.textContent='RUNNING source ownership resolution trial through the real converter. No source has been saved…';
        const trial=await previewR4bIsolatedSourceEdit(session,{
          rigidPointer:row.rigidPointer,newValue:text,
        },{getCurrentResult:current,engineRunner});
        if(ticket!==version||current()!==result||!overlay.isConnected)
          throw Error('Stale R4B trial. Restart after any source/config/input change.');
        r4bPreview=trial;
        let total=null;
        try {if(planTotal.value.trim())total=numericalValue(planTotal.value.trim()).number;}catch{}
        const documented=planBasis.value.trim().length>=8;
        const canCommit=owner.checked&&approval.checked&&documented&&
          Math.abs(total-trial.proposedEmittedGroupKg)<=0.00001;
        previewSignature=signature();
        apply.disabled=!canCommit;
        report.textContent='R4B/R4C REAL-CONVERTER ISOLATION TRIAL: PASS (not yet applied)'+
          '\nOwner topology: '+trial.ownershipTopology+
          '\nZero-mass source witnesses: '+trial.zeroMassSourceWitnesses
            .map(x=>'Node '+x.nodeNumber+' ('+x.originalToken+' kg)').join(', ')+
          '\nComponentRefNo: '+trial.componentRefNo+
          '\nRIGID '+trial.rigidPointer+': '+trial.originalWeightCii+' → '+trial.proposedWeightCii+' N'+
          '\nOther RIGID writers: '+trial.memberAllocations.filter(x=>x.rigidPointer!==trial.rigidPointer)
            .map(x=>'RIGID '+x.rigidPointer+' '+x.oldCiiWeight+' → '+x.proposedCiiWeight+' N').join('; ')+
          '\nAll dependent pointers: '+trial.dependentRigidPointers.join(', ')+
          '\nOriginal emitted group: '+trial.originalEmittedGroupKg+' kg'+
          '\nProposed emitted group: '+trial.proposedEmittedGroupKg+' kg'+
          '\nOther XML bytes changed: 0; unrelated CII engineering differences: 0.'+
          '\nPhysical mass remains UNVERIFIED. '+
            (canCommit?'Owner-backed allocation documented; Apply may be staged.':
              'For source-backed Apply, approve the source, enter the same revised total kg and a signed engineering reference, then Preview again.')+
          '\nTrial is not an independently approved physical-mass value.';
        return;
      }
      if(!row.eligible)throw Error(row.reason||'Source ownership not eligible.');
      if(!owner.checked||!approval.checked)throw Error('Two explicit engineering approvals required.');
      if(parsed.number===row.sourceNode.originalXmlWeight)throw Error('No source Weight change.');
      previewSignature=signature();
      apply.disabled=false;
      const allocationPlan=row.completeAllocation ? (
        '\nORIGINAL verified component mass: '+row.originalPhysicalMassKg+' kg'+
        '\nAPPROVED proposed component mass: '+parsed.number+' kg'+
        '\nComplete allocation rule: '+row.allocationRule+
        '\nAffected RIGID pointers: '+row.dependentPointers.join(', ')+
        '\nAllocation (kg): '+row.allocations.map(a=>
          'RIGID '+a.oldRigidPointer+': '+a.originalAllocatedMassKg+
          ' → '+(parsed.number*a.fraction)+' (fraction '+a.fraction+')').join('; ')
      ):'\nR2 direct-edge-only owner; no R4A transformed allocation claim.';
      report.textContent='APPROVED PREVIEW (not applied):\n'+
        'Source '+row.sourceIdentity+' ComponentRefNo '+row.sourceNode.componentRefNo+
        '\nXML Weight '+row.sourceNode.originalXmlWeight+' → '+text+
        '\nApproved source Node/Weight fields to update atomically: '+
        (row.sourceWeightFieldsToEdit?.length||1)+
        '\nExpected CII Weight '+row.originalCiiWeight+' → '+parsed.number*row.weightScale+
        (outputTarget.value.trim()? ' (explicit output target '+outputTarget.value.trim()+')':'')+
        allocationPlan+
        '\nOnly the verified source Node/Weight token(s) may change. New CII must reparse and reconcile before download.';
    } catch(e){report.textContent='HOLD: '+(e?.message||e);}
  });
  apply.addEventListener('click',async()=>{
    if(applying)return;
    const issued=signature(), ticket=version;
    if(!ready||!previewSignature||issued!==previewSignature) {
      report.textContent='HOLD: Preview the approved unchanged transaction first.';return;
    }
    applying=true;apply.disabled=true;
    report.textContent='RUNNING real browser/Pyodide XML→CII re-extraction; revised downloads locked…';
    try{
      const output=r4bPreview ?
        await applyR4bIsolatedSourceEdit(session,r4bPreview,proposal(),{
          getCurrentResult:current,engineRunner }) :
        await applySourceBackedWeightChange(session,proposal(),{
          getCurrentResult:current,engineRunner });
      if(ticket!==version||current()!==result||!overlay.isConnected)
        throw Error('Stale UI transaction; discard verified outputs.');
      committed=output;
      downloads.revisedXml.disabled=false;downloads.revisedCii.disabled=false;
      downloads.audit.disabled=false;
      report.textContent='VERIFIED SOURCE-BACKED RE-EXTRACTION\n'+
        output.audit.ciiEngineeringDiff.expectedDifferences.map(x=>
          'RIGID '+x.oldRigidPointer+' → '+x.newRigidPointer+
          ': '+x.oldWeight+' → '+x.newWeight).join('\n')+
        (output.audit.requestedOutputVerification
          ? '\nEXPLICIT CII OUTPUT TARGET VERIFIED: '+
            output.audit.requestedOutputVerification.actualCiiOutputWeight:'')+
        '\nOriginal files immutable. Unrelated XML bytes changed: 0'+
        '\nUnexpected CII engineering differences: 0'+
        (output.audit.massReconciliation ?
          '\nVerified physical component mass (kg): '+
          output.audit.massReconciliation.originalPhysicalMassKg+' → '+
          output.audit.massReconciliation.approvedRevisedPhysicalMassKg+
          '\nOriginal → final RIGID pointer: '+
          output.audit.massReconciliation.originalRigidPointer+' → '+
          output.audit.massReconciliation.revisedRigidPointer : '')+
        (output.audit.memberAllocations?
          '\nR4B complete dependent set: '+output.audit.dependentRigidPointers.join(', ')+
          '\nApproved revised total: '+output.audit.approvedPhysicalGroupTotalKg+
            ' kg (USER ATTESTED, NOT INDEPENDENTLY VERIFIED)':'')+
        '\nDownload revised EnrichedXML, regenerated CII and change audit.';
    }catch(e){
      committed=null;
      for(const k of ['revisedXml','revisedCii','audit'])downloads[k].disabled=true;
      report.textContent='HOLD: '+(e?.message||e)+'\nNo revised output has been published.';
    }finally{applying=false;}
  });
  downloads.originalXml.addEventListener('click',()=>{
    if(session&&current()===result)download('original_enriched_engine_input.xml',
      session.custody.engineXml,'application/xml;charset=utf-8');
  });
  downloads.originalCii.addEventListener('click',()=>{
    if(session&&current()===result)download(result.ciiName||'original.cii',
      session.custody.originalCii,'text/plain;charset=utf-8');
  });
  downloads.ownershipR4bJson.addEventListener('click',()=>{
    if(!session?.r4bAudit||current()!==result)return;
    download('final_rigid_r4b_source_ownership_detailed.json',
      JSON.stringify(session.r4bAudit,null,2)+'\n','application/json;charset=utf-8');
  });
  downloads.ownershipCsv.addEventListener('click',()=>{
    if(!session?.r4bAudit||current()!==result)return;
    download('final_rigid_r4b_source_ownership_detailed.csv',
      r4bOwnershipAuditCsv(session.r4bAudit),'text/csv;charset=utf-8');
  });
  downloads.ownershipReport.addEventListener('click',()=>{
    if(!session||current()!==result)return;
    const rows=session.rows.map(row=>({
      rigidPointer:row.rigidPointer,
      ownershipStatus:row.status,
      eligibleForSourceEdit:row.eligible===true,
      holdCode:row.reasonCode||(row.eligible?'PHYSICAL_MASS_APPROVAL_REQUIRED':'R2_DIRECT_EDGE_HOLD'),
      reason:row.reason,
      physicalComponentRefNo:row.physicalComponentRefNo||null,
      sourceNodeIdentity:row.sourceIdentity||null,
      transformationHistory:row.transformationHistory||[],
      originalCiiWeight:row.originalCiiWeight,
      originalPhysicalMassKg:row.originalPhysicalMassKg??null,
      dependentPointers:row.dependentPointers||[],
      allocationRule:row.allocationRule||null,
      completeAllocation:row.completeAllocation===true,
    }));
    const counts=Object.fromEntries(Object.entries(rows.reduce((t,row)=>{
      if(!row.eligible)t[row.holdCode]=(t[row.holdCode]||0)+1;
      return t;
    },{})).sort());
    const output={
      schema:'xml-cii-r4a-rigid-source-hold-report/v1',
      evidenceClass:'CURRENT_BROWSER_CONVERSION_ONLY',
      status:'READ_ONLY_OWNER_DIAGNOSTIC_NOT_ENGINEERING_APPROVAL',
      sourceXmlSha256:session.custody.engineSha,
      originalCiiSha256:session.custody.originalCiiSha,
      sourceRunId:session.custody.runId,
      noEditParity:session.noEditParity,
      r1LineageStatus:session.verifiedLineage?.status||'NOT_VERIFIED',
      r1SnapshotFingerprint:session.verifiedLineage?.runIdentity?.snapshotFingerprint||null,
      r4aLineageError:session.r4aReason||null,
      counts:{total:rows.length,structurallyQualified:rows.filter(x=>x.eligible).length,
        held:rows.filter(x=>!x.eligible).length,reasons:counts},
      physicalMassApproval:'NOT_ATTESTED_BEFORE_EXPLICIT_TRANSACTION',
      rows,
    };
    download('final_rigid_source_ownership_hold_report.json',
      JSON.stringify(output,null,2)+'\n','application/json;charset=utf-8');
  });
  for(const [key,contentKey,mime]of [
    ['revisedXml','revisedXml','application/xml;charset=utf-8'],
    ['revisedCii','revisedCii','text/plain;charset=utf-8'],
    ['audit','audit','application/json']]){
    downloads[key].addEventListener('click',()=>{
      if(!committed||current()!==result)return;
      const data=key==='audit'?JSON.stringify(committed.audit,null,2)+'\n':committed[contentKey];
      download(committed.names[key],data,mime);
    });
  }
  return {panel,open,init,getSession:()=>session,getCommitted:()=>committed};
}
