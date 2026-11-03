export const XML_COMPARE_HOVER_INSPECTOR_SCHEMA='xml-compare-hover-inspector/v1';
const clean=(v)=>String(v??'').trim();
const esc=(v)=>clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function value(record,key){return key.split('.').reduce((acc,k)=>acc?.[k],record);}
export const XML_COMPARE_HOVER_FIELDS=Object.freeze(['nodeNumber','componentType','componentRefNo','branchName','lineNo','pipelineReference','pipingClass','rating','materialCode','dtxrPs','dtxrPos','lengthMm','process.pressure1','process.temperature1','process.fluidDensity']);
export function createXmlCompareHoverCard(record=null,{fields=XML_COMPARE_HOVER_FIELDS}={}){if(!record)return Object.freeze({schema:XML_COMPARE_HOVER_INSPECTOR_SCHEMA,ok:false,rows:Object.freeze([])});const rows=fields.map((key)=>Object.freeze({key,value:clean(value(record,key))})).filter((row)=>row.value);return Object.freeze({schema:XML_COMPARE_HOVER_INSPECTOR_SCHEMA,ok:true,uid:clean(record.uid),rows:Object.freeze(rows)});}
export function renderXmlCompareHoverCardHtml(record=null){const card=createXmlCompareHoverCard(record);return `<div class="xml-compare-hover-card" data-xml-compare-hover-card>${card.ok?card.rows.map((row)=>`<div><b>${esc(row.key)}</b><span>${esc(row.value)}</span></div>`).join(''):'<span>No hover target</span>'}</div>`;}
export const _test=Object.freeze({clean,esc,value});
