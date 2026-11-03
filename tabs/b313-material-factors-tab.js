import {
  B313_MATERIAL_FACTOR_MASTER,
  calculateB313MaterialDesign,
  getB313MaterialFactorCoverage,
} from '../converters/b313-material-factors/index.js';

const DRAFT_KEY = 'format-converters.b313-material-factor-draft.v1';
const FACTORS = ['S', 'E', 'W', 'Y'];
const STATUSES = new Set(['DRAFT', 'BENCHMARK_ONLY', 'SCREENING', 'PROJECT_APPROVED', 'VERIFIED', 'RETIRED']);
const KSI_TO_MPA = 6.894757293168361;

function ensureStylesheet() {
  if (document.querySelector('link[data-engineering-masters-style="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './tabs/engineering-masters.css?v=engineering-1';
  link.dataset.engineeringMastersStyle = 'true';
  document.head.appendChild(link);
}
function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function saveText(name,text,type='application/json'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
function loadDraft(){try{const raw=localStorage.getItem(DRAFT_KEY);return raw?JSON.parse(raw):null;}catch{return null;}}
function factorRecords(master,factor){return master?.factors?.[factor]?.records||[];}
function materialMap(master){return new Map((master.materials||[]).map((row)=>[row.materialId,row]));}

function validateMaster(master){
  const errors=[];const warnings=[];const ids=new Set();
  for(const [index,row] of (master.materials||[]).entries()){
    if(!row.materialId)errors.push({path:`materials.${index}.materialId`,message:'materialId is required'});
    else if(ids.has(row.materialId))errors.push({path:`materials.${index}.materialId`,message:'materialId must be unique'});else ids.add(row.materialId);
    if(!(master.families||[]).includes(row.family))errors.push({path:`materials.${index}.family`,message:'Unknown material family'});
  }
  for(const factor of FACTORS){
    const seen=new Set();
    for(const [index,row] of factorRecords(master,factor).entries()){
      const path=`factors.${factor}.records.${index}`;
      if(!ids.has(row.materialId))errors.push({path:`${path}.materialId`,message:'Unknown materialId'});
      if(!Number.isFinite(Number(row.temperatureC)))errors.push({path:`${path}.temperatureC`,message:'Temperature must be finite'});
      const value=Number(row.value);
      if(!Number.isFinite(value))errors.push({path:`${path}.value`,message:'Value must be finite'});
      if(factor==='S'&&!(value>0))errors.push({path:`${path}.value`,message:'S must be positive'});
      if(['E','W'].includes(factor)&&(!(value>0)||value>1))errors.push({path:`${path}.value`,message:`${factor} must satisfy 0 < ${factor} ≤ 1`});
      if(factor==='Y'&&value<0)errors.push({path:`${path}.value`,message:'Y must be non-negative'});
      if(!STATUSES.has(String(row.status||'').toUpperCase()))errors.push({path:`${path}.status`,message:'Unknown status'});
      if(['VERIFIED','PROJECT_APPROVED'].includes(String(row.status||'').toUpperCase())&&!row.sourceAuthority)errors.push({path:`${path}.sourceAuthority`,message:'Approved rows require sourceAuthority'});
      const key=[row.materialId,row.productForm||'',row.manufacturingRoute||'',Number(row.temperatureC)].join('|');
      if(seen.has(key))warnings.push({path,message:'Potential duplicate authority key'});else seen.add(key);
    }
  }
  return{ok:errors.length===0,errors,warnings};
}

function recordToMpa(record){if(!record)return null;const unit=String(record.unit||'MPa').toUpperCase();const value=Number(record.value);return unit==='KSI'?value*KSI_TO_MPA:unit==='MPA'?value:null;}
function draftFactorsAt(master,materialId,temperatureC){
  const find=(factor)=>factorRecords(master,factor).find((row)=>row.materialId===materialId&&Math.abs(Number(row.temperatureC)-Number(temperatureC))<1e-9);
  const S=find('S'),E=find('E'),W=find('W'),Y=find('Y');
  return{records:{S,E,W,Y},overrides:{S:recordToMpa(S),E:E?Number(E.value):null,W:W?Number(W.value):null,Y:Y?Number(Y.value):null}};
}

function coverageFor(master){
  return (master.materials||[]).map((material)=>({
    materialId:material.materialId,family:material.family,spec:material.spec,grade:material.grade,
    S:factorRecords(master,'S').some((r)=>r.materialId===material.materialId),
    E:factorRecords(master,'E').some((r)=>r.materialId===material.materialId),
    W:factorRecords(master,'W').some((r)=>r.materialId===material.materialId),
    Y:factorRecords(master,'Y').some((r)=>r.materialId===material.materialId),
  }));
}

export function renderB313MaterialFactorsTab(container,{context=null,emit}={}){
  ensureStylesheet();
  const saved=loadDraft();
  let baseline=clone(B313_MATERIAL_FACTOR_MASTER);
  let draft=saved?.master?clone(saved.master):clone(baseline);
  let view='coverage';
  let factor='S';
  let family=String(context?.family||'ALL').toUpperCase();
  let selectedMaterial=context?.materialId||draft.materials?.[0]?.materialId||'';
  let previewTemperature=Number(context?.temperatureC??0);

  function filteredMaterials(){return(draft.materials||[]).filter((m)=>family==='ALL'||m.family===family);}
  function filteredFactorRows(){const map=materialMap(draft);return factorRecords(draft,factor).map((row,index)=>({row,index,material:map.get(row.materialId)})).filter(({material})=>family==='ALL'||material?.family===family);}
  function dirty(){return JSON.stringify(draft)!==JSON.stringify(baseline);}

  function preview(){
    const resolved=draftFactorsAt(draft,selectedMaterial,previewTemperature);const values=resolved.overrides;
    if(!values.S||!values.E||!values.W||values.Y==null)return{ok:false,code:'DRAFT_FACTORS_INCOMPLETE',missing:FACTORS.filter((key)=>key==='S'?!values.S:key==='Y'?values.Y==null:!values[key]),records:resolved.records};
    return calculateB313MaterialDesign({
      material:{materialId:selectedMaterial},designTemperature:previewTemperature,temperatureUnit:'C',manufacturingRoute:'SEAMLESS',
      designPressure:51.1,pressureUnit:'barg',outsideDiameter:273,lengthUnit:'mm',dn:250,corrosionAllowance:6,
      negativeMillTolerance:{basis:'percent',value:12.5},dimensionStandard:'ASME B36.10M',factorOverrides:values,
    });
  }

  function navHtml(){return[
    ['coverage','Coverage'],['materials','Materials'],...FACTORS.map((f)=>[`factor-${f}`,`${f} ${f==='S'?'Allowable Stress':f==='E'?'Quality Factor':f==='W'?'Weld Strength':'Coefficient'}`]),['preview','Preview'],['validation','Validation']
  ].map(([id,label])=>`<button class="engineering-master-nav-btn ${view===id?'is-active':''}" data-view="${id}">${esc(label)}</button>`).join('');}

  function coverageHtml(){const rows=coverageFor(draft);const strictReady=rows.filter((r)=>r.S&&r.E&&r.W&&r.Y).length;return`
    <div class="engineering-master-grid">
      <div class="engineering-master-card"><h3>Material identities</h3><div class="engineering-master-metric">${rows.length}</div></div>
      <div class="engineering-master-card"><h3>Families</h3><div class="engineering-master-metric">${new Set(rows.map(r=>r.family)).size}</div></div>
      <div class="engineering-master-card"><h3>All four factors present</h3><div class="engineering-master-metric">${strictReady}</div><div class="engineering-master-muted">Presence only; status qualification is separate.</div></div>
      <div class="engineering-master-card"><h3>API baseline coverage</h3><div class="engineering-master-metric">${getB313MaterialFactorCoverage().filter(r=>r.hasS&&r.hasE&&r.hasW&&r.hasY).length}</div></div>
    </div>
    <div class="engineering-master-table-wrap"><table class="engineering-master-table"><thead><tr><th>Family</th><th>Material</th><th>Spec</th><th>Grade</th><th>S</th><th>E</th><th>W</th><th>Y</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.family)}</td><td>${esc(r.materialId)}</td><td>${esc(r.spec)}</td><td>${esc(r.grade)}</td>${FACTORS.map(f=>`<td><span class="engineering-master-pill ${r[f]?'ok':'bad'}">${r[f]?'present':'missing'}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}

  function materialsHtml(){return`<div class="engineering-master-table-wrap"><table class="engineering-master-table"><thead><tr><th>Material ID</th><th>Family</th><th>Spec</th><th>Grade</th><th>Product</th><th>Identity status</th></tr></thead><tbody>${filteredMaterials().map((m)=>`<tr><td>${esc(m.materialId)}</td><td>${esc(m.family)}</td><td>${esc(m.spec)}</td><td>${esc(m.grade)}</td><td>${esc(m.productForm)}</td><td>${esc(m.identityStatus)}</td></tr>`).join('')}</tbody></table></div>`;}

  function factorHtml(){const rows=filteredFactorRows();return`
    <div class="engineering-master-banner warn">Edits are candidate data only. Saving a draft does not change the active B31.3 resolver or design-authority status.</div>
    <div class="engineering-master-toolbar"><button class="engineering-master-btn" data-action="add-factor">Add ${factor} row</button><span class="engineering-master-muted">${rows.length} visible records</span></div>
    <div class="engineering-master-table-wrap"><table class="engineering-master-table"><thead><tr><th>Material</th><th>Family</th><th>Temp °C</th><th>${factor}</th>${factor==='S'?'<th>Unit</th>':''}<th>Product</th>${['E','W'].includes(factor)?'<th>Route</th>':''}<th>Status</th><th>Source authority</th><th></th></tr></thead><tbody>${rows.map(({row,index,material})=>`<tr>
      <td><select class="engineering-master-select" data-factor-index="${index}" data-key="materialId">${(draft.materials||[]).map(m=>`<option value="${esc(m.materialId)}" ${m.materialId===row.materialId?'selected':''}>${esc(m.materialId)}</option>`).join('')}</select></td>
      <td>${esc(material?.family||'')}</td><td><input class="engineering-master-input" type="number" step="any" data-factor-index="${index}" data-key="temperatureC" value="${esc(row.temperatureC)}"></td>
      <td><input class="engineering-master-input" type="number" step="any" data-factor-index="${index}" data-key="value" value="${esc(row.value)}"></td>
      ${factor==='S'?`<td><select class="engineering-master-select" data-factor-index="${index}" data-key="unit"><option ${String(row.unit).toUpperCase()==='MPA'?'selected':''}>MPa</option><option ${String(row.unit).toUpperCase()==='KSI'?'selected':''}>ksi</option></select></td>`:''}
      <td><input class="engineering-master-input" data-factor-index="${index}" data-key="productForm" value="${esc(row.productForm||'PIPE')}"></td>
      ${['E','W'].includes(factor)?`<td><input class="engineering-master-input" data-factor-index="${index}" data-key="manufacturingRoute" value="${esc(row.manufacturingRoute||'')}"></td>`:''}
      <td><select class="engineering-master-select" data-factor-index="${index}" data-key="status">${[...STATUSES].map(s=>`<option ${s===row.status?'selected':''}>${s}</option>`).join('')}</select></td>
      <td><input class="engineering-master-input" data-factor-index="${index}" data-key="sourceAuthority" value="${esc(row.sourceAuthority||'')}"></td>
      <td><button class="engineering-master-btn" data-action="delete-factor" data-index="${index}">Retire/Delete</button></td></tr>`).join('')}</tbody></table></div>`;}

  function previewHtml(){const result=preview();return`<div class="engineering-master-preview"><div class="engineering-master-card"><h3>Candidate calculation preview</h3>
    <label>Material<select class="engineering-master-select" data-preview="material">${(draft.materials||[]).map(m=>`<option value="${esc(m.materialId)}" ${m.materialId===selectedMaterial?'selected':''}>${esc(m.materialId)}</option>`).join('')}</select></label><br><br>
    <label>Temperature °C <input class="engineering-master-input" type="number" step="any" data-preview="temperature" value="${esc(previewTemperature)}"></label>
    <p class="engineering-master-muted">Preview uses the candidate factor rows as explicit API overrides with the DN250 / 51.1 barg benchmark geometry. It does not activate the candidate master.</p></div>
    <div class="engineering-master-card"><h3>API result</h3><pre class="engineering-master-json">${esc(JSON.stringify(result,null,2))}</pre></div></div>`;}

  function validationHtml(){const v=validateMaster(draft);return`<div class="engineering-master-grid"><div class="engineering-master-card"><h3>Errors</h3><div class="engineering-master-metric">${v.errors.length}</div></div><div class="engineering-master-card"><h3>Warnings</h3><div class="engineering-master-metric">${v.warnings.length}</div></div><div class="engineering-master-card"><h3>Status</h3><div class="engineering-master-metric">${v.ok?'PASS':'BLOCKED'}</div></div></div><div class="engineering-master-validation">${[...v.errors.map(x=>({...x,bad:true})),...v.warnings].map(x=>`<div class="engineering-master-issue ${x.bad?'bad':''}"><strong>${esc(x.path)}</strong><div>${esc(x.message)}</div></div>`).join('')||'<div class="engineering-master-banner">No validation findings.</div>'}</div>`;}

  function panelHtml(){if(view==='coverage')return coverageHtml();if(view==='materials')return materialsHtml();if(view.startsWith('factor-')){factor=view.slice(7);return factorHtml();}if(view==='preview')return previewHtml();return validationHtml();}

  function render(){
    const validation=validateMaster(draft);container.innerHTML=`<div class="engineering-master-root"><div class="engineering-master-header"><div><div class="engineering-master-title">B31.3 Material Factors</div><div class="engineering-master-subtitle">Governed working copy for material identity and S / E / W / Y factor data. Active resolver data remains unchanged until a reviewed generated master is published.</div></div><div class="engineering-master-actions"><button class="engineering-master-btn" data-action="revert" ${dirty()?'':'disabled'}>Revert</button><button class="engineering-master-btn" data-action="save" ${dirty()?'':'disabled'}>Save Draft</button><button class="engineering-master-btn" data-action="export">Export JSON</button><label class="engineering-master-btn">Import JSON<input hidden type="file" accept=".json" data-action="import"></label></div></div>
      <div class="engineering-master-layout"><aside class="engineering-master-sidebar">${navHtml()}<div class="engineering-master-banner ${validation.ok?'':'bad'}">${dirty()?'Candidate has unsaved changes':'Working copy saved/clean'}<br>${validation.errors.length} errors · ${validation.warnings.length} warnings</div></aside><main class="engineering-master-panel"><div class="engineering-master-toolbar"><label>Family <select class="engineering-master-select" data-filter="family"><option>ALL</option>${(draft.families||[]).map(f=>`<option ${f===family?'selected':''}>${esc(f)}</option>`).join('')}</select></label></div>${panelHtml()}</main></div></div>`;
    bind();
  }

  function bind(){
    container.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{view=btn.dataset.view;render();}));
    container.querySelector('[data-filter="family"]')?.addEventListener('change',(e)=>{family=e.target.value;render();});
    container.querySelectorAll('[data-factor-index]').forEach(input=>input.addEventListener('change',()=>{const index=Number(input.dataset.factorIndex),key=input.dataset.key,row=factorRecords(draft,factor)[index];if(!row)return;row[key]=['temperatureC','value'].includes(key)?Number(input.value):input.value;render();}));
    container.querySelector('[data-action="add-factor"]')?.addEventListener('click',()=>{const material=filteredMaterials()[0]||draft.materials?.[0];if(!material)return;const row={materialId:material.materialId,productForm:'PIPE',temperatureC:0,value:factor==='S'?1:factor==='Y'?0.4:1,status:'DRAFT',sourceAuthority:'UI_DRAFT'};if(factor==='S')row.unit='MPa';if(['E','W'].includes(factor))row.manufacturingRoute='SEAMLESS';factorRecords(draft,factor).push(row);render();});
    container.querySelectorAll('[data-action="delete-factor"]').forEach(btn=>btn.addEventListener('click',()=>{factorRecords(draft,factor).splice(Number(btn.dataset.index),1);render();}));
    container.querySelector('[data-preview="material"]')?.addEventListener('change',(e)=>{selectedMaterial=e.target.value;render();});
    container.querySelector('[data-preview="temperature"]')?.addEventListener('change',(e)=>{previewTemperature=Number(e.target.value);render();});
    container.querySelector('[data-action="revert"]')?.addEventListener('click',()=>{draft=clone(baseline);render();});
    container.querySelector('[data-action="save"]')?.addEventListener('click',()=>{localStorage.setItem(DRAFT_KEY,JSON.stringify({savedAt:new Date().toISOString(),master:draft}));baseline=clone(draft);emit?.('b313-master:draft-saved',{savedAt:new Date().toISOString(),validation:validateMaster(draft)});render();});
    container.querySelector('[data-action="export"]')?.addEventListener('click',()=>saveText('b313-material-factor-candidate.json',JSON.stringify(draft,null,2)));
    container.querySelector('[data-action="import"]')?.addEventListener('change',async(e)=>{const file=e.target.files?.[0];if(!file)return;try{draft=JSON.parse(await file.text());render();}finally{e.target.value='';}});
  }
  render();
}
