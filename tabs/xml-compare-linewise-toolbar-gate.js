export const XML_COMPARE_LINEWISE_TOOLBAR_GATE_SCHEMA='xml-compare-linewise-toolbar-gate/v5-runtime-ownership';

const STYLE_ID='xml-compare-linewise-toolbar-gate-style';
const WORKFLOW_BUTTON='data-xml-compare-categorized-open';
const CONVERTER_SHORTCUT_BUTTON='data-xml-compare-categorized-converter-shortcut';
const TABLE_WORKFLOW_BUTTON='data-xml-compare-table-categorized-open';

let installed=false;
let toolbarObserver=null;

function injectStyle(){
  let style=document.getElementById(STYLE_ID);
  if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.append(style);}
  style.textContent=`.xml-compare-toolbar{gap:8px}.xml-compare-toolbar>label.xml-compare-file-btn,.xml-compare-toolbar>button:not([${WORKFLOW_BUTTON}]):not([${CONVERTER_SHORTCUT_BUTTON}]):not([${TABLE_WORKFLOW_BUTTON}]){position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;opacity:0!important;pointer-events:none!important}.xml-compare-toolbar>[${WORKFLOW_BUTTON}],.xml-compare-toolbar>[${CONVERTER_SHORTCUT_BUTTON}],.xml-compare-toolbar>[${TABLE_WORKFLOW_BUTTON}]{min-width:min(330px,100%);justify-content:center}.xml-compare-toolbar>[${CONVERTER_SHORTCUT_BUTTON}]{border:1px solid rgba(216,180,254,.45);border-radius:8px;background:rgba(88,28,135,.28);color:#f3e8ff;font-weight:850}`;
}
function categorizedFile(file){return /categorized/i.test(String(file?.name||''));}
function setInputFile(input,file){const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
function openWorkflow(){const button=document.querySelector(`[${WORKFLOW_BUTTON}]`);button?.click();return document.querySelector('[data-xml-compare-categorized-popup]');}
function ensureShortcutButton(){
  const toolbar=document.querySelector('.xml-compare-tab .xml-compare-toolbar');
  if(!toolbar)return;
  let shortcut=toolbar.querySelector(`[${CONVERTER_SHORTCUT_BUTTON}]`);
  if(!shortcut){
    shortcut=document.createElement('button');
    shortcut.type='button';
    shortcut.setAttribute(CONVERTER_SHORTCUT_BUTTON,'');
    shortcut.textContent='Categorized XML ↔ Enriched XML';
    shortcut.title='Open the existing CategorizedInputXML / enriched XML converter workflow';
  }
  const table=toolbar.querySelector(`[${TABLE_WORKFLOW_BUTTON}]`);
  const linewise=toolbar.querySelector(`[${WORKFLOW_BUTTON}]`);
  if(table&&table.previousElementSibling!==shortcut)table.insertAdjacentElement('beforebegin',shortcut);
  else if(!table&&linewise&&linewise.nextElementSibling!==shortcut)linewise.insertAdjacentElement('afterend',shortcut);
  else if(!table&&!linewise&&!shortcut.parentElement)toolbar.append(shortcut);
}
function setWorkflowSide(side){const radio=document.querySelector(`[data-xml-compare-categorized-popup] input[name="xml-compare-canvas-side"][value="${side}"]`);if(radio&&!radio.checked){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));}}
async function importIntoWorkflow(file,side){openWorkflow();setWorkflowSide(side);const input=document.querySelector('[data-xml-compare-categorized-popup] input[data-xml-compare-categorized-import]');if(!input)throw new Error('Line-wise workflow import input not found');const copy=new File([await file.text()],file.name,{type:file.type||'application/xml'});setInputFile(input,copy);}
function gateRawXmlLoad(event){const input=event.target?.closest?.('input[data-xml-compare-load]');if(!input)return;const file=input.files?.[0];if(!file||categorizedFile(file))return;event.preventDefault();event.stopImmediatePropagation();const side=input.dataset.xmlCompareLoad==='b'?'b':'a';input.value='';importIntoWorkflow(file,side).catch((error)=>console.error('[XML Compare Line-wise Gate] failed to route raw XML to workflow',error));}
function clickShortcut(event){const button=event.target?.closest?.(`[${CONVERTER_SHORTCUT_BUTTON}]`);if(!button)return;event.preventDefault();event.stopPropagation();openWorkflow();}
export function installXmlCompareLinewiseToolbarGate(doc=globalThis.document){
  if(installed||!doc?.addEventListener)return false;
  installed=true;
  injectStyle();
  ensureShortcutButton();
  doc.addEventListener('change',gateRawXmlLoad,{capture:true});
  doc.addEventListener('click',clickShortcut,{capture:true});
  if(typeof MutationObserver!=='undefined'&&doc.body){
    toolbarObserver=new MutationObserver(()=>{injectStyle();ensureShortcutButton();});
    toolbarObserver.observe(doc.body,{childList:true,subtree:true});
  }
  return true;
}
installXmlCompareLinewiseToolbarGate();
export const _test=Object.freeze({ensureShortcutButton,openWorkflow,installXmlCompareLinewiseToolbarGate,getToolbarObserver:()=>toolbarObserver});
