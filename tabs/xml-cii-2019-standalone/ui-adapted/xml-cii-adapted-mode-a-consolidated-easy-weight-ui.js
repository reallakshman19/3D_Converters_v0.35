import { modeARawState } from './xml-cii-adapted-mode-a-propagation.js';
import { applyModeAWeightChanges, undoModeAWeightChanges } from './xml-cii-adapted-mode-a-weight-actions.js';
import { buildModeAWeightFillPlan, buildModeAWeightProjectMatchPlan, buildModeAWeightUsePlan, modeAQualifiedExactWeightRow } from './xml-cii-adapted-mode-a-bulk-weight.js';

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function styleButton(button, primary = false, warning = false) {
  Object.assign(button.style, { padding:'4px 8px', border:`1px solid ${warning?'#d97706':(primary?'#2563eb':'#475569')}`, borderRadius:'5px', background:warning?'#3a240f':(primary?'#1d4ed8':'#172033'), color:warning?'#fde68a':'#e2e8f0', cursor:'pointer', fontSize:'10px', whiteSpace:'nowrap' });
}
function rebuild(panel) { panel.querySelector('[data-mode-a-consolidated-build="weight"]')?.click(); }
function rowClass(row) { return row?.mapped?'mapped':(modeAQualifiedExactWeightRow(row)?'exact':'review'); }

function markAppliedRows(panel,result,changes=[]) {
  const byIdentity=new Map(changes.map((change)=>[`${change.sourceId}::${change.key}`,change]));
  const tableRows=[...panel.querySelectorAll('[data-mode-a-weight-consolidated-row]')];
  for(const row of result.rows||[]){
    const change=byIdentity.get(`${row.sourceId}::${row.key}`); if(!change) continue;
    row.mapped=true; row.weight=Number(change.weight); row.weightSource='override';
    const tr=tableRows.find((item)=>item.dataset.sourceId===String(row.sourceId||'')&&item.dataset.issueKey===String(row.key||''));
    if(!tr) continue;
    tr.dataset.weightClass='mapped';
    if(tr.children[9]) tr.children[9].textContent=`${Number(change.weight)} kg`;
    if(tr.children[10]) tr.children[10].textContent='override';
    if(tr.children[11]) tr.children[11].textContent='MAPPED';
    tr.children[12]?.querySelectorAll('button')?.forEach((button)=>button.remove());
  }
}

function apply(panel,result,stateRef,changes,label) {
  if(!applyModeAWeightChanges(stateRef,changes,label)) return false;
  markAppliedRows(panel,result,changes);
  return true;
}

function addRowActions(panel,result,stateRef) {
  const body=panel.querySelector('[data-mode-a-weight-consolidated-body]');
  const trs=[...(body?.querySelectorAll('tr')||[])];
  (result.rows||[]).forEach((row,index)=>{
    const tr=trs[index]; if(!tr) return;
    tr.dataset.modeAWeightConsolidatedRow='true'; tr.dataset.sourceId=row.sourceId||''; tr.dataset.issueKey=row.key||''; tr.dataset.weightClass=rowClass(row);
    tr.dataset.searchText=[row.fileName,row.branchName,row.nodeNumberDisplay,row.componentType,row.componentRefNo,row.rating,row.bestDescription].map((v)=>text(v).toLowerCase()).join(' ');
    if(row.mapped) return;
    const cell=tr.children[12]; if(!cell) return;
    const usePlan=buildModeAWeightUsePlan(row);
    if(usePlan){
      const use=document.createElement('button'); use.type='button'; use.textContent='Use'; styleButton(use,usePlan.qualifiedExact,usePlan.requiresReview); use.style.marginLeft='5px';
      use.title=usePlan.qualifiedExact?`Use qualified 100% Project Data weight ${usePlan.change.weight} kg.`:`Engineer review: ${row.bestScore||'no score'} · ${row.bestDescription||'suggestion'}.`;
      use.addEventListener('click',()=>{
        if(usePlan.requiresReview&&typeof confirm==='function'&&!confirm(`Candidate requires review.\n\n${row.bestScore||'No score'} · ${row.bestDescription||'Suggestion'}\nWeight: ${usePlan.change.weight} kg\n\nApply this single engineer override?`)) return;
        apply(panel,result,stateRef,[usePlan.change],`Use Weight Match ${usePlan.change.weight} kg`);
      });
      cell.appendChild(use);
    }
    const fillPlan=buildModeAWeightFillPlan(result.rows||[],row);
    if(fillPlan.changes.length){
      const fill=document.createElement('button'); fill.type='button'; fill.textContent='↓'; styleButton(fill); fill.style.marginLeft='4px'; fill.title=`Apply each row's own qualified 100% Project Data weight to ${fillPlan.changes.length} equivalent component(s).`;
      fill.addEventListener('click',()=>{
        const own=buildModeAWeightUsePlan(row)?.change; const changes=[own,...fillPlan.changes].filter(Boolean);
        if(typeof confirm==='function'&&!confirm(`Apply qualified 100% Project Data weights to ${changes.length} equivalent component(s)?\n\nMapped/manual rows will not change.`)) return;
        apply(panel,result,stateRef,changes,`Fill similar exact weights (${changes.length})`);
      });
      cell.appendChild(fill);
    }
  });
}

function makeToolbar(panel,result,stateRef) {
  const bar=document.createElement('div'); bar.dataset.modeAWeightEasyToolbar='true'; Object.assign(bar.style,{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',margin:'8px 0 10px',padding:'8px',border:'1px solid #334155',borderRadius:'7px',background:'#0f172a'});
  const match=document.createElement('button'); match.type='button'; match.textContent='⚡ Find Exact Weight Matches'; match.title='Find only direct 100% Project Data weight candidates that are safe for bulk acceptance.'; styleButton(match,true);
  const undo=document.createElement('button'); undo.type='button'; undo.textContent='↶ Undo Last Change'; styleButton(undo); undo.disabled=!modeARawState(stateRef).modeAConsolidatedWeightUndo;
  const search=document.createElement('input'); search.type='search'; search.placeholder='Search source / branch / component...'; Object.assign(search.style,{minWidth:'220px',padding:'5px 8px',background:'#0b1220',color:'#e2e8f0',border:'1px solid #475569',borderRadius:'5px'});
  const source=document.createElement('select'); Object.assign(source.style,{padding:'5px 8px',background:'#0b1220',color:'#e2e8f0',border:'1px solid #475569',borderRadius:'5px'}); source.appendChild(new Option('All XML files','')); [...new Map((result.rows||[]).map((r)=>[r.sourceId,r.fileName])).entries()].forEach(([id,name])=>source.appendChild(new Option(name,id)));
  const status=document.createElement('select'); Object.assign(status.style,{padding:'5px 8px',background:'#0b1220',color:'#e2e8f0',border:'1px solid #475569',borderRadius:'5px'}); [['all','All rows'],['review','Review'],['exact','Exact 100%'],['mapped','Mapped']].forEach(([v,l])=>status.appendChild(new Option(l,v)));
  const note=document.createElement('span'); note.className='xml-cii-phase-help'; note.style.marginLeft='auto'; note.textContent='Weight Match only: bulk apply accepts direct 100% weight-master candidates. Interpolated/extrapolated/inferred candidates remain Review.';
  bar.append(match,undo,search,source,status,note); panel.querySelector('[data-mode-a-consolidated-build="weight"]')?.closest('div')?.after(bar);
  const rows=[...panel.querySelectorAll('[data-mode-a-weight-consolidated-row]')];
  const filter=()=>{const q=text(search.value).toLowerCase(); for(const tr of rows){const okStatus=status.value==='all'||status.value===tr.dataset.weightClass; const okSource=!source.value||source.value===tr.dataset.sourceId; const okSearch=!q||(tr.dataset.searchText||'').includes(q); tr.style.display=okStatus&&okSource&&okSearch?'':'none';}};
  search.addEventListener('input',filter); source.addEventListener('change',filter); status.addEventListener('change',filter);
  undo.addEventListener('click',()=>{if(undoModeAWeightChanges(stateRef)) rebuild(panel);});
  match.addEventListener('click',()=>{
    bar.querySelectorAll('[data-weight-project-preview],[data-weight-project-apply]').forEach((n)=>n.remove());
    const plan=buildModeAWeightProjectMatchPlan(result.rows||[]); const preview=document.createElement('span'); preview.dataset.weightProjectPreview='true'; preview.className='xml-cii-phase-help'; preview.textContent=`${plan.changes.length} exact 100% · ${plan.review.length} review · ${plan.mapped.length} already mapped.`; bar.appendChild(preview);
    if(plan.changes.length){const applyBtn=document.createElement('button'); applyBtn.type='button'; applyBtn.dataset.weightProjectApply='true'; applyBtn.textContent=`Apply ${plan.changes.length} Exact Weights`; styleButton(applyBtn,true); applyBtn.addEventListener('click',()=>{if(apply(panel,result,stateRef,plan.changes,`Project Data exact weights (${plan.changes.length})`)){applyBtn.remove(); preview.textContent=`Applied ${plan.changes.length} exact 100% weight(s).`;}}); bar.appendChild(applyBtn);}
  });
}

export function installModeAConsolidatedWeightEasyUi(panel,result,stateRef) {
  const body=panel?.querySelector('[data-mode-a-weight-consolidated-body]'); if(!body||!Array.isArray(result?.rows)) return false;
  addRowActions(panel,result,stateRef); makeToolbar(panel,result,stateRef); return true;
}
