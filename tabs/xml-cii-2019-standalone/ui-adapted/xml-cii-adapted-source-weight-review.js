/** Explicit source-backed XML mode in existing fullscreen Final Weight Review.
 * Deliberately separate from the unchanged direct-CII edit transaction.
 */
import { initializeSourceWeightSession, applySourceBackedWeightChange }
  from '../xml-cii-source-weight-reextract.js';
import { numericalValue } from '../xml-cii-final-property-validation.js';

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
  const info=add(bar,'span','Separate from direct-CII editing; no automatic catalog suggestion is approved.',
    {style:'font-size:11px;color:#cbd5e1;'});
  const content=add(panel,'div',null,{'data-source-weight-content':'',
    style:'display:none;padding-top:12px;'});
  const status=add(content,'pre','Not initialized.',{'data-source-weight-status':'',
    role:'status',style:'white-space:pre-wrap;color:#fbbf24;font-size:12px;'});
  const form=add(content,'div',null,{style:'display:flex;flex-wrap:wrap;gap:12px;align-items:end;'});
  const pickWrap=add(form,'label','RIGID pointer · verified source', {style:'font-size:11px;'});
  const picker=add(pickWrap,'select',null,{'data-source-weight-pointer':'',
    style:'display:block;min-width:180px;background:#0b1220;color:#f8fafc;padding:7px;'});
  const valueWrap=add(form,'label','Proposed XML Weight (kg)',{style:'font-size:11px;'});
  const proposed=add(valueWrap,'input',null,{'data-source-weight-value':'',
    type:'text',inputmode:'decimal',placeholder:'e.g. 2.984',
    style:'display:block;max-width:190px;padding:7px;background:#0b1220;color:#fff;border:1px solid #64748b;'});
  const approvals=add(content,'div',null,{style:'margin-top:12px;display:flex;flex-wrap:wrap;gap:15px;'});
  const ownerLabel=add(approvals,'label',null,{style:'font-size:11px;color:#fde68a;'});
  const owner=add(ownerLabel,'input',null,{'type':'checkbox','data-source-weight-owner-approved':''});
  ownerLabel.append(' I authorize the physical-component ownership and full weight allocation shown.');
  const approvalLabel=add(approvals,'label',null,{style:'font-size:11px;color:#e2e8f0;'});
  const approval=add(approvalLabel,'input',null,{'type':'checkbox','data-source-weight-approved':''});
  approvalLabel.append(' I explicitly approve this XML Weight change (not a catalog suggestion).');
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
    revisedXml:button(dl,'Download revised EnrichedXML',{'data-source-weight-revised-xml':''}),
    revisedCii:button(dl,'Download re-extracted CII',{'data-source-weight-revised-cii':''}),
    audit:button(dl,'Download verified change audit',{'data-source-weight-audit':''}),
  };
  Object.values(downloads).forEach(b=>b.disabled=true);
  const report=add(content,'pre','Source ownership and no-edit parity not yet verified.',{
    'data-source-weight-report':'',style:'white-space:pre-wrap;max-height:210px;overflow:auto;color:#cbd5e1;font-size:11px;'});
  let session=null, committed=null, ready=false, applying=false, previewSignature='';
  let version=0;
  const current=()=>typeof getCurrentResult==='function'?getCurrentResult():result;
  const markDirty=()=>{
    version++;committed=null;previewSignature='';apply.disabled=true;
    for(const key of ['revisedXml','revisedCii','audit'])downloads[key].disabled=true;
  };
  const selectedRow=()=>session?.rows.find(r=>r.rigidPointer===Number(picker.value));
  function renderFacts(){
    facts.replaceChildren();
    const row=selectedRow();
    if(!row){valueLabel(facts,'Source status','Not resolved');return;}
    const src=row.sourceNode;
    const pieces=[
      ['Status',row.status],['Reason',row.reason],
      ['RIGID pointer',row.rigidPointer],
      ['Linked ELEMENT',row.originalElement?.index??'Not verified'],
      ['Source ComponentRefNo',src?.componentRefNo||'Unresolved'],
      ['Source NodeNumber',src?.nodeNumber||'Unresolved'],
      ['Writer source node',row.sourceIdentity||'Unresolved'],
      ['Original XML Weight',src?.originalXmlWeight??'Unresolved'],
      ['Original CII Weight',row.originalCiiWeight??'Unresolved'],
      ['Weight scale',row.weightScale??'Unresolved'],
      ['Expected CII impact',row.expectedImpact?.map(x=>x.fromNode+' → '+x.toNode).join(', ')||'Unknown'],
    ];
    for(const [title,value]of pieces)valueLabel(facts,title,value);
    proposed.disabled=!row.eligible;
    approval.disabled=owner.disabled=!row.eligible;
    if(!row.eligible){report.textContent='HOLD: '+row.reason;}
  }
  const proposal=()=>({
    rigidPointer:Number(picker.value),newValue:proposed.value.trim(),
    approved:approval.checked,ownerApproved:owner.checked,zeroConfirmed:zero.checked,
  });
  const signature=()=>JSON.stringify(proposal());
  const clearApproval=()=>{
    owner.checked=false;approval.checked=false;zero.checked=false;
    markDirty();
  };
  const resetPicker=()=>{
    const rows=session?.rows||[];
    picker.replaceChildren();
    for(const row of rows) {
      const opt=el('option',
        'RIGID '+row.rigidPointer+' · '+(row.eligible?'ELIGIBLE (approval required)':'HOLD'),
        {value:row.rigidPointer});
      picker.appendChild(opt);
    }
    if(!rows.length) picker.appendChild(el('option','No RIGID records',{value:''}));
    renderFacts();
  };
  async function init(){
    ready=false;session=null;markDirty();open.disabled=true;
    status.textContent='RUNNING: exact original-CII no-edit replay through existing browser converter…';
    try {
      const built=await initializeSourceWeightSession(result,{engineRunner});
      if(!overlay.isConnected||current()!==result)throw Error('Stale result/modal during no-edit replay.');
      session=built;ready=true;
      status.textContent='PASS: original CII byte-exact replay ('+built.noEditParity.bytes+
        ' bytes); all 15 auxiliary pointers validated; serialized RIGID/OD values checked. '+
        built.rows.filter(r=>r.eligible).length+'/'+built.rows.length+
        ' source owners structurally eligible; physical mass approval is still required.';
      resetPicker();
      downloads.originalXml.disabled=false;downloads.originalCii.disabled=false;
    } catch(e){
      status.textContent='HOLD: '+(e?.message||e);
      report.textContent='No source-backed Apply or revised downloads are available.';
      Object.values(downloads).forEach(b=>b.disabled=true);
    }finally{open.disabled=false;}
  }
  open.addEventListener('click',()=>{
    const on=content.style.display==='none';
    content.style.display=on?'block':'none';
    open.textContent=on?'Close source-backed XML edit mode':'Open source-backed XML edit mode';
    if(on&&!ready&&!session)init();
  });
  picker.addEventListener('change',()=>{proposed.value='';clearApproval();renderFacts();});
  for(const control of [proposed,approval,owner,zero])
    control.addEventListener(control.type==='checkbox'?'change':'input',markDirty);
  preview.addEventListener('click',()=>{
    markDirty();
    try {
      if(!ready||current()!==result)throw Error('Stale or unverified source conversion session.');
      const row=selectedRow();
      if(!row?.eligible)throw Error(row?.reason||'Source ownership not eligible.');
      if(!owner.checked||!approval.checked)throw Error('Two explicit engineering approvals required.');
      const text=proposed.value.trim();
      const parsed=numericalValue(text);
      if(parsed.number<0||parsed.number>1e12)throw Error('Negative/out-of-range XML Weight.');
      if(parsed.number===0&&!zero.checked)throw Error('Confirm numeric zero explicitly.');
      if(parsed.number===row.sourceNode.originalXmlWeight)throw Error('No source Weight change.');
      previewSignature=signature();
      apply.disabled=false;
      report.textContent='APPROVED PREVIEW (not applied):\n'+
        'Source '+row.sourceIdentity+' ComponentRefNo '+row.sourceNode.componentRefNo+
        '\nXML Weight '+row.sourceNode.originalXmlWeight+' → '+text+
        '\nExpected CII Weight '+row.originalCiiWeight+' → '+parsed.number*row.weightScale+
        '\nOnly the source Node/Weight token may change. New CII must reparse and reconcile before download.';
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
      const output=await applySourceBackedWeightChange(session,proposal(),{
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
        '\nOriginal files immutable. Unrelated XML bytes changed: 0'+
        '\nUnexpected CII engineering differences: 0'+
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
