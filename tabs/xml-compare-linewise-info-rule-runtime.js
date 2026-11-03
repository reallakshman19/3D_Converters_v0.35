const RUNTIME_SCHEMA='xml-compare-linewise-info-rule-runtime/v1';
const STYLE_ID='xml-compare-linewise-info-rule-style';
const INFO_ATTR='data-xml-compare-linewise-info-rule';
const MODAL_ATTR='data-xml-compare-linewise-info-rule-modal';
let installed=false;
const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const RULE_TEXT=`Line-wise Categorized XML ownership rule

Root
  One XML document root only.

LineBlock
  Line-owned fields only:
    Branchname
    LineNo
    PipingClass
    Rating

Element
  Element owns the route span and element blocks:
    fromNode
    toNode
    elementKey
    NameBlock
    RouteGeometryBlock
      DELTA_X
      DELTA_Y
      DELTA_Z
    DerivedBlock
    RigidBlock
    MiscBlock
    OriginalElement

  Only DELTA_X / DELTA_Y / DELTA_Z are element-level route geometry.

NodesBlock
  NodesBlock is a child of Element.
  Node is a child of NodesBlock.
  Each Element has its own FROM and TO node occurrence.

Node
  Node-owned data is only data tied to node number or endpoint role:
    nodeNumber
    role = FROM / TO
    elementKey
    FROM_GLOBAL_X / FROM_GLOBAL_Y / FROM_GLOBAL_Z for FROM node
    TO_GLOBAL_X / TO_GLOBAL_Y / TO_GLOBAL_Z for TO node
    non-sentinel Temperature cases visible for that node occurrence
    DISPLACEMENTS by NODE_NUM
    FORCESMOMENTS by NODE_NUM
    SIF by NODE

  RestraintsBlock is a child of Node.
  RESTRAINT rows belong under the matching Node where RESTRAINT NODE equals nodeNumber.

Sentinel suppression
  Suppress -1.010100, -1.0101, blank, null, undefined.
  Suppress DISPLACEMENTS / FORCESMOMENTS / SIF / RESTRAINT rows where the owning NODE or NODE_NUM is sentinel.
  Suppress VECTOR rows where all engineering values are sentinel.

Canonical nesting
  Element
    NodesBlock
      Node role="FROM"
        RestraintsBlock
        DisplacementsBlock
        ForcesMomentsBlock
        SifBlock
      Node role="TO"
        RestraintsBlock
        DisplacementsBlock
        ForcesMomentsBlock
        SifBlock`;
function injectStyle(){let style=document.getElementById(STYLE_ID);if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.append(style);}style.textContent='.xml-compare-linewise-info-rule-btn{display:inline-grid;place-items:center;width:26px;height:26px;margin-left:8px;border:1px solid rgba(191,219,254,.52);border-radius:999px;background:rgba(30,64,175,.38);color:#bfdbfe;font-weight:900;cursor:pointer}.xml-compare-linewise-info-rule-modal{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:rgba(2,6,23,.72)}.xml-compare-linewise-info-rule-dialog{width:min(900px,calc(100vw - 28px));max-height:min(760px,calc(100vh - 28px));display:grid;grid-template-rows:auto 1fr auto;border:1px solid rgba(147,197,253,.44);border-radius:16px;background:#0f172a;color:#dbeafe;box-shadow:0 24px 80px rgba(0,0,0,.56);overflow:hidden}.xml-compare-linewise-info-rule-dialog header{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.18);background:linear-gradient(90deg,rgba(30,64,175,.35),rgba(15,23,42,.74))}.xml-compare-linewise-info-rule-dialog h3{margin:0;color:#bfdbfe}.xml-compare-linewise-info-rule-dialog pre{margin:0;padding:14px;overflow:auto;white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.48;background:#020617;color:#dbeafe}.xml-compare-linewise-info-rule-dialog footer{display:flex;justify-content:flex-end;padding:10px 14px;border-top:1px solid rgba(148,163,184,.18)}.xml-compare-linewise-info-rule-dialog button{border:1px solid rgba(147,197,253,.42);border-radius:10px;background:rgba(30,41,59,.95);color:#bfdbfe;padding:7px 10px;font-weight:800}';}
function openRule(){injectStyle();document.querySelector(`[${MODAL_ATTR}]`)?.remove();document.body.insertAdjacentHTML('beforeend',`<div class="xml-compare-linewise-info-rule-modal" ${MODAL_ATTR}><section class="xml-compare-linewise-info-rule-dialog" role="dialog" aria-modal="true" aria-label="Line-wise XML ownership rule"><header><h3>Line-wise XML ownership rule</h3><button type="button" data-xml-compare-linewise-info-close>Close</button></header><pre>${esc(RULE_TEXT)}</pre><footer><button type="button" data-xml-compare-linewise-info-close>Close</button></footer></section></div>`);}
function closeRule(){document.querySelector(`[${MODAL_ATTR}]`)?.remove();}
function injectInfoButton(){const popup=document.querySelector('[data-xml-compare-categorized-popup]');const h3=popup?.querySelector('header h3');if(!h3||h3.parentElement?.querySelector(`[${INFO_ATTR}]`))return;injectStyle();const btn=document.createElement('button');btn.type='button';btn.className='xml-compare-linewise-info-rule-btn';btn.setAttribute(INFO_ATTR,'');btn.setAttribute('aria-label','Show Line-wise XML ownership rule');btn.title='Show Line-wise XML ownership rule';btn.textContent='i';h3.insertAdjacentElement('afterend',btn);}
function onClick(event){if(event.target.closest(`[${INFO_ATTR}]`)){event.preventDefault();openRule();return;}if(event.target.closest('[data-xml-compare-linewise-info-close]')){event.preventDefault();closeRule();}}
export function installXmlCompareLinewiseInfoRuleRuntime(){if(installed||typeof document==='undefined')return;installed=true;document.addEventListener('click',onClick,{capture:true});new MutationObserver(()=>injectInfoButton()).observe(document.body,{childList:true,subtree:true});injectInfoButton();document.documentElement.dataset.xmlCompareLinewiseInfoRuleRuntime=RUNTIME_SCHEMA;}
installXmlCompareLinewiseInfoRuleRuntime();
export const _test=Object.freeze({esc,RULE_TEXT});
