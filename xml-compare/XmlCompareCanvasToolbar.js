import { XML_COMPARE_NAV_MODES } from './XmlCompareCanvasNavigation.js';
export const XML_COMPARE_CANVAS_TOOLBAR_SCHEMA='xml-compare-canvas-toolbar/v1';
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const tools=Object.freeze([{mode:XML_COMPARE_NAV_MODES.SELECT,label:'Select'},{mode:XML_COMPARE_NAV_MODES.ORBIT,label:'Orbit'},{mode:XML_COMPARE_NAV_MODES.PAN,label:'Pan'},{mode:XML_COMPARE_NAV_MODES.ZOOM,label:'Zoom'}]);
export function renderXmlCompareCanvasToolbarHtml({side='source',activeMode=XML_COMPARE_NAV_MODES.SELECT}={}){return `<div class="xml-compare-canvas-toolbar" data-xml-compare-canvas-toolbar="${esc(side)}">${tools.map((tool)=>`<button type="button" data-xml-compare-nav-mode="${esc(tool.mode)}" class="${tool.mode===activeMode?'is-active':''}">${esc(tool.label)}</button>`).join('')}<button type="button" data-xml-compare-nav-action="fit-all">Fit All</button></div>`;}
export const _test=Object.freeze({tools});
