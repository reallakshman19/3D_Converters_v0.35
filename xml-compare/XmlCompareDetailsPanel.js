export const XML_COMPARE_DETAILS_PANEL_SCHEMA='xml-compare-details-panel/v1';
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function row(label,value){return `<div><b>${esc(label)}</b><span>${esc(value||'—')}</span></div>`;}
export function renderXmlCompareDetailsPanelHtml({source=null,target=null,match=null}={}){return `<section class="xml-compare-bottom-panel" data-xml-compare-details><header>Details</header><div class="xml-compare-detail-card">${row('Source',source?.label||source?.uid||'Select source item')}${row('Target',target?.label||target?.uid||'Select target item')}${row('Match',match?.id||'No match selected')}${row('Basis',(match?.basis||[]).join(', '))}${row('Status',match?.status||'—')}${row('Orientation',match?.orientation||'—')}</div></section>`;}
export const _test=Object.freeze({esc});
