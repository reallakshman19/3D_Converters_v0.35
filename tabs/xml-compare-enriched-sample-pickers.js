import { loadXmlCompareEnrichedSample } from './xml-compare-enriched-samples-data.js?v=20260701-bm-cii-categorized-samples-1';

const STYLE_ID='xml-compare-enriched-sample-pickers-style';
const ROW_ATTR='data-xml-compare-enriched-sample-pickers';
const SAMPLES=Object.freeze({
  a:{label:'BM_CII Source → Line-wise workflow',fileName:'BM_CII_INPUT_SOURCE FILE_sideloaded_categorized_enriched.xml',title:'Open Source sample in Line-wise XML Enrichment workflow'},
  b:{label:'BM_CII Target → Line-wise workflow',fileName:'BM_CII_LINEBASIS_INPUT_TARGET FILE_categorized_enriched.xml',title:'Open Target sample in Line-wise XML Enrichment workflow'}
});

function injectStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`.xml-compare-enriched-sample-pickers{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 10px;border-top:1px solid rgba(96,165,250,.18);border-bottom:1px solid rgba(96,165,250,.18);background:rgba(2,6,23,.36)}.xml-compare-enriched-sample-pickers button{display:flex;align-items:center;justify-content:center;gap:7px;min-height:34px;border:1px solid rgba(168,85,247,.50);border-radius:10px;background:rgba(88,28,135,.36);color:#f3e8ff;font-size:12px;font-weight:850;cursor:pointer}.xml-compare-enriched-sample-pickers button:hover{border-color:rgba(216,180,254,.88);background:rgba(107,33,168,.58)}.xml-compare-enriched-sample-pickers button[disabled]{opacity:.65;cursor:wait}.xml-compare-enriched-sample-pickers small{display:block;color:#ddd6fe;font-size:10px;font-weight:700;line-height:1.15}@media(max-width:900px){.xml-compare-enriched-sample-pickers{grid-template-columns:1fr}}`;
  document.head.append(style);
}

function pickerHtml(){
  return `<div class="xml-compare-enriched-sample-pickers" ${ROW_ATTR}>
    <button type="button" data-xml-compare-pick-enriched="a" title="${SAMPLES.a.title}">🧪 <span>${SAMPLES.a.label}<small>${SAMPLES.a.fileName}</small></span></button>
    <button type="button" data-xml-compare-pick-enriched="b" title="${SAMPLES.b.title}">🎯 <span>${SAMPLES.b.label}<small>${SAMPLES.b.fileName}</small></span></button>
  </div>`;
}

function injectPickers(){
  const tab=document.querySelector('.xml-compare-tab');
  const toolbar=tab?.querySelector('.xml-compare-toolbar');
  if(!tab||!toolbar||tab.querySelector(`[${ROW_ATTR}]`))return;
  injectStyle();
  toolbar.insertAdjacentHTML('afterend',pickerHtml());
}

function setInputFile(input,file){
  const transfer=new DataTransfer();
  transfer.items.add(file);
  input.files=transfer.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

function openLinewiseWorkflow(){
  const button=document.querySelector('[data-xml-compare-categorized-open]');
  if(!button)return null;
  let popup=document.querySelector('[data-xml-compare-categorized-popup]');
  if(!popup){button.click();popup=document.querySelector('[data-xml-compare-categorized-popup]');}
  return popup;
}

function importControl(){
  return document.querySelector('[data-xml-compare-categorized-popup] input[data-xml-compare-categorized-import]');
}

function ensureImportTab(){
  const popup=openLinewiseWorkflow();
  if(!popup)return null;
  let input=importControl();
  if(input)return input;
  popup.querySelector('[data-xml-compare-linewise-tab="import"]')?.click();
  input=importControl();
  return input||null;
}

function selectCanvasSide(side){
  const selector=`input[name="xml-compare-canvas-side"][value="${side}"]`;
  const radio=document.querySelector(selector);
  if(radio&&!radio.checked){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));}
}

function importIntoLinewiseWorkflow(file,side){
  const input=ensureImportTab();
  if(!input)return false;
  selectCanvasSide(side);
  setInputFile(input,file);
  return true;
}

function isCategorizedCanvasFile(file){
  return /categorized/i.test(String(file?.name||''));
}

async function gateDirectCanvasLoad(event){
  const input=event.target?.closest?.('input[data-xml-compare-load]');
  if(!input)return;
  const file=input.files?.[0];
  if(!file||isCategorizedCanvasFile(file))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const side=input.dataset.xmlCompareLoad==='b'?'b':'a';
  const copy=new File([await file.text()],file.name,{type:file.type||'application/xml'});
  input.value='';
  importIntoLinewiseWorkflow(copy,side);
}

async function loadSample(side,button){
  button.disabled=true;
  const oldText=button.dataset.oldText||button.innerHTML;
  button.dataset.oldText=oldText;
  button.textContent='Opening line-wise workflow...';
  try{
    const sample=await loadXmlCompareEnrichedSample(side==='b'?'target':'source');
    const file=new File([sample.text],sample.fileName,{type:'application/xml'});
    const imported=importIntoLinewiseWorkflow(file,side);
    if(!imported)throw new Error('Line-wise workflow import control not found');
  }catch(error){
    console.error('[XML Compare Samples] Failed to open enriched sample in line-wise workflow',error);
    const fallback=document.querySelector('[data-xml-compare-categorized-open]');
    fallback?.click();
  }finally{
    button.disabled=false;
    button.innerHTML=side==='b'
      ? `🎯 <span>${SAMPLES.b.label}<small>${SAMPLES.b.fileName}</small></span>`
      : `🧪 <span>${SAMPLES.a.label}<small>${SAMPLES.a.fileName}</small></span>`;
  }
}

function clickHandler(event){
  const button=event.target.closest('[data-xml-compare-pick-enriched]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  const side=button.dataset.xmlComparePickEnriched==='b'?'b':'a';
  loadSample(side,button);
}

function install(){
  if(typeof document==='undefined')return;
  document.addEventListener('click',clickHandler,{capture:true});
  document.addEventListener('change',(event)=>{gateDirectCanvasLoad(event).catch((error)=>console.error('[XML Compare Samples] Direct load gate failed',error));},{capture:true});
  injectPickers();
  const observer=new MutationObserver(()=>injectPickers());
  observer.observe(document.body,{childList:true,subtree:true});
}

install();
export const _test=Object.freeze({importControl,ensureImportTab,openLinewiseWorkflow});
