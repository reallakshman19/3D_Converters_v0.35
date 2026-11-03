import { parseTableSource } from './table-categorized-xml-source-parser.js';

export const TABLE_CATEGORIZED_XML_SOURCE_MANAGER_SCHEMA='table-categorized-xml-source-manager/v2-delimiter-mode';
export const DELIMITER_MODE_OPTIONS=Object.freeze(['auto','tab','comma','pipe','semicolon','whitespace']);

export function createMultiSourceState(initialSources=[]){const sources=initialSources.length?initialSources:[emptySource('S1')];return Object.freeze({sources:Object.freeze(sources),activeSourceId:sources[0]?.sourceId||'S1'});}
export function emptySource(sourceId='S1',sourceName=`Source ${sourceId}`){return Object.freeze({sourceId,sourceName,sourceType:'pasteText',sourceText:'',delimiterMode:'auto',headers:Object.freeze([]),columnIds:Object.freeze([]),rows:Object.freeze([]),diagnostics:Object.freeze([])});}
export function addSource(state,name='New Source'){const ids=new Set((state.sources||[]).map((s)=>s.sourceId));let index=1;while(ids.has(`S${index}`))index+=1;const source=emptySource(`S${index}`,name);return Object.freeze({sources:Object.freeze([...(state.sources||[]),source]),activeSourceId:source.sourceId});}
export function removeSource(state,sourceId){const sources=(state.sources||[]).filter((source)=>source.sourceId!==sourceId);const safe=sources.length?sources:[emptySource('S1')];return Object.freeze({sources:Object.freeze(safe),activeSourceId:safe[0].sourceId});}
export function setActiveSource(state,sourceId){const exists=(state.sources||[]).some((source)=>source.sourceId===sourceId);return Object.freeze({...state,activeSourceId:exists?sourceId:state.activeSourceId});}
export function updateSourceDraft(state,sourceId,patch={}){return Object.freeze({...state,sources:Object.freeze((state.sources||[]).map((source)=>source.sourceId===sourceId?Object.freeze({...source,...patch}):source))});}
export function parseSourceDraft(state,sourceId){const source=(state.sources||[]).find((item)=>item.sourceId===sourceId);if(!source)return state;const parsed=parseTableSource(source.sourceText||'',{sourceId:source.sourceId,sourceName:source.sourceName,sourceType:source.sourceType||'pasteText',delimiterMode:source.delimiterMode||'auto'});return updateSourceDraft(state,sourceId,{...parsed,sourceText:source.sourceText,delimiterMode:parsed.delimiterMode||source.delimiterMode||'auto'});}
export function activeSource(state){return (state.sources||[]).find((source)=>source.sourceId===state.activeSourceId)||(state.sources||[])[0]||null;}
export function sourceById(sources=[],sourceId){return sources.find((source)=>source.sourceId===sourceId)||null;}
export function sourceSummaryRows(sources=[]){return sources.map((source)=>Object.freeze({sourceId:source.sourceId,sourceName:source.sourceName,rows:(source.rows||[]).length,columns:(source.headers||[]).length,sourceType:source.sourceType||'pasteText',status:(source.diagnostics||[]).some((d)=>d.severity==='ERROR')?'ERROR':((source.rows||[]).length?'Parsed':'Draft')}));}
