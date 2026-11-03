import { reduceXmlCompareNavigationState } from './XmlCompareCanvasNavigation.js';
export const XML_COMPARE_CANVAS_RECORD_INTERACTION_SCHEMA='xml-compare-canvas-record-interaction/v1';
const clean=(v)=>String(v??'').trim();
function find(records=[],uid=''){const key=clean(uid);return (records||[]).find((record)=>clean(record.uid)===key)||null;}
function entry(code,message,side,uid){return Object.freeze({ts:'',level:'info',code:clean(code),source:clean(side),uid:clean(uid),message:clean(message)});}
export function selectXmlCompareCanvasRecord(navState,records=[],uid=''){const record=find(records,uid);const next=reduceXmlCompareNavigationState(navState,{type:'SELECT',uid:record?.uid||uid});return Object.freeze({navState:next,record,log:entry('XML-COMPARE-CANVAS-SELECT',`${next.side} select ${clean(record?.uid||uid)}`,next.side,record?.uid||uid)});}
export function hoverXmlCompareCanvasRecord(navState,records=[],uid=''){const record=find(records,uid);const next=reduceXmlCompareNavigationState(navState,{type:'HOVER',uid:record?.uid||uid});return Object.freeze({navState:next,record,log:entry('XML-COMPARE-CANVAS-HOVER',`${next.side} hover ${clean(record?.uid||uid)}`,next.side,record?.uid||uid)});}
export const _test=Object.freeze({clean,find,entry});
