export const XML_COMPARE_CANVAS_NAVIGATION_SCHEMA='xml-compare-canvas-navigation/v1';
export const XML_COMPARE_NAV_MODES=Object.freeze({SELECT:'select',ORBIT:'orbit',PAN:'pan',ZOOM:'zoom'});
const clean=(v)=>String(v??'').trim();
function mode(value){const v=clean(value).toLowerCase();return Object.values(XML_COMPARE_NAV_MODES).includes(v)?v:XML_COMPARE_NAV_MODES.SELECT;}
export function createXmlCompareNavigationState({side='source',mode:navMode=XML_COMPARE_NAV_MODES.SELECT,camera=null,selectedUid='',hoveredUid=''}={}){return Object.freeze({schema:XML_COMPARE_CANVAS_NAVIGATION_SCHEMA,side:clean(side)||'source',mode:mode(navMode),camera:camera?Object.freeze({...camera}):null,selectedUid:clean(selectedUid),hoveredUid:clean(hoveredUid)});}
export function reduceXmlCompareNavigationState(state={},action={}){const current=createXmlCompareNavigationState(state);const type=clean(action.type).toUpperCase();if(type==='SET_MODE')return createXmlCompareNavigationState({...current,mode:action.mode});if(type==='SELECT')return createXmlCompareNavigationState({...current,selectedUid:action.uid});if(type==='HOVER')return createXmlCompareNavigationState({...current,hoveredUid:action.uid});if(type==='CAMERA')return createXmlCompareNavigationState({...current,camera:action.camera});return current;}
export const _test=Object.freeze({clean,mode});
