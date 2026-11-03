import { renderXmlCiiCustomInputPanel, bindXmlCiiCustomInputPanel } from './custom-input-panel.js?v=20260625-custom-input-2';
const FLAG='xmlCiiCustomInputWorkflowTabBound';
function mount(root=document){
  const overlay=[...document.querySelectorAll('[data-xml-cii-workflow-overlay],.model-converters-workflow-popup-overlay')].at(-1);
  const body=overlay?.querySelector('[data-xml-cii-workflow-body]');
  const modalRoot=overlay?.querySelector('[data-xml-cii-workflow-root]')||root;
  if(!body) return false;
  body.innerHTML=renderXmlCiiCustomInputPanel();
  bindXmlCiiCustomInputPanel(body,modalRoot,{phaseId:'custom-input',modal:null});
  return true;
}
function schedule(root){requestAnimationFrame(()=>{mount(root)||setTimeout(()=>mount(root),40);});}
export function installXmlCiiCustomInputWorkflowTab(container=document){
  const root=container?.querySelector?.('.model-converters-root')||container||document;
  if(!root||root.dataset?.[FLAG]==='true')return; root.dataset[FLAG]='true';
  root.addEventListener('click',(event)=>{const tab=event.target?.closest?.('[data-modal-tab="custom-input"]'); if(!tab)return; schedule(root);},true);
  document.addEventListener('click',(event)=>{const tab=event.target?.closest?.('[data-modal-tab="custom-input"]'); if(!tab)return; schedule(root);},true);
  if(document.querySelector('[data-modal-tab="custom-input"].is-active,[data-modal-tab="custom-input"][aria-selected="true"]')) schedule(root);
}
