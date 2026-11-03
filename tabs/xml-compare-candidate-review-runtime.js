const RUNTIME_SCHEMA='xml-compare-candidate-review-runtime/v1';
let installed=false;
function clean(value){return String(value??'').trim();}
function findRecordButton(side,uid){const host=document.querySelector(`[data-xml-compare-canvas-host="${side}"]`);if(!host)return null;return [...host.querySelectorAll('[data-xml-compare-record-uid]')].find((button)=>clean(button.dataset.xmlCompareRecordUid)===clean(uid))||null;}
function acceptRow(row){const sourceUid=clean(row?.dataset?.sourceUid),targetUid=clean(row?.dataset?.targetUid);if(!sourceUid||!targetUid)return false;const sourceButton=findRecordButton('source',sourceUid);if(!sourceButton)return false;sourceButton.click();setTimeout(()=>{const targetButton=findRecordButton('target',targetUid);if(targetButton)targetButton.click();},0);return true;}
function rejectRow(row){if(!row)return false;row.hidden=true;row.setAttribute('data-xml-compare-candidate-hidden','true');return true;}
function onClick(event){const button=event.target.closest('[data-xml-compare-candidate-action]');if(!button)return;const row=button.closest('[data-xml-compare-candidate-row]');const action=clean(button.dataset.xmlCompareCandidateAction);if(action==='accept'||action==='reject')event.preventDefault();if(action==='accept')acceptRow(row);if(action==='reject')rejectRow(row);}
export function installXmlCompareCandidateReviewRuntime(){if(installed||typeof document==='undefined')return;installed=true;document.addEventListener('click',onClick,true);document.documentElement.dataset.xmlCompareCandidateReviewRuntime=RUNTIME_SCHEMA;}
installXmlCompareCandidateReviewRuntime();
export const _test=Object.freeze({clean,findRecordButton,acceptRow,rejectRow});
