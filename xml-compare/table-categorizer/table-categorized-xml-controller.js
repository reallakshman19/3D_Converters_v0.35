import { exportCategorizedGraphArtifacts } from './table-categorized-xml-exporter.js';
import { buildCategorizedGraph } from './table-categorized-xml-graph-builder.js';
import { createBlankUniversalProfile, cloneProfile, normalizeImportedProfile, parseProfileRecipeJson, serializeProfileRecipe } from './table-categorized-xml-profile-designer.js';
import { PS_MAPPING_COORDINATE_LOOKUP_SAMPLE, PS_MAPPING_TABLE_2_COORDINATE_LOOKUP_PROFILE, PS_MAPPING_TABLE_2_MODEL_SAMPLE, PS_MAPPING_TABLE_2_SAMPLE, PS_MAPPING_TABLE_2_SHADOW_PROFILE } from './table-categorized-xml-pilot-profiles.js';
import { previewStageForSetupTab } from './table-categorized-xml-stage-preview.js';
import { TABLE_CATEGORIZED_SETUP_TABS, TABLE_CATEGORIZED_XML_TABS, isSetupTabEnabledForWorkflow, renderTableCategorizedXmlShellHtml, setupTabForWorkflowTab } from './table-categorized-xml-shell.js';
import { parseTableSource } from './table-categorized-xml-source-parser.js';
import { runCategorizerValidation } from './table-categorized-xml-validation.js';

export const TABLE_CATEGORIZED_XML_CONTROLLER_SCHEMA='table-categorized-xml-controller/v7-recipe-management';

const SETUP_TAB_IDS=new Set(TABLE_CATEGORIZED_SETUP_TABS.map(([id])=>id));
const WORKFLOW_TAB_IDS=new Set(TABLE_CATEGORIZED_XML_TABS.map(([id])=>id));
const PREVIEW_STAGE_IDS=new Set(['raw','base','cluster','family','graph','xml']);
const DOWNLOAD_KINDS=new Set(['xml','graph','profile','diagnostics','audit']);
const SOURCE_ACTIONS=new Set(['load-sample','load-coordinate-sample','parse','clear','add-source','remove-source','build-graph']);
const RECIPE_ACTIONS=new Set(['new-blank-profile','load-ps-template','load-two-source-template','reset-profile']);
const POPUP_SELECTOR='[data-xml-compare-table-categorized-popup]';
const ACTIVE_WORKFLOW_SELECTOR='[data-table-categorized-tab].is-active';
const ACTIVE_SETUP_SELECTOR='[data-table-categorized-setup-tab].is-active';

export function nextTableCategorizedNavigationState(state={},action={}){
  if(action.type==='setup-tab'){
    const activeSetupTab=String(action.setupTab||'');
    if(!SETUP_TAB_IDS.has(activeSetupTab))return state;
    if(!isSetupTabEnabledForWorkflow(state.activeTab||'source',activeSetupTab))return state;
    return {...state,activeSetupTab,activePreviewStage:previewStageForSetupTab(activeSetupTab)};
  }
  if(action.type==='workflow-tab'){
    const activeTab=String(action.activeTab||'');
    if(!WORKFLOW_TAB_IDS.has(activeTab))return state;
    const activeSetupTab=setupTabForWorkflowTab(activeTab);
    return {...state,activeTab,activeSetupTab,activePreviewStage:previewStageForSetupTab(activeSetupTab)};
  }
  if(action.type==='preview-stage'){
    const activePreviewStage=String(action.previewStage||'');
    if(!PREVIEW_STAGE_IDS.has(activePreviewStage))return state;
    return {...state,activePreviewStage};
  }
  if(action.type==='toggle-fullscreen')return {...state,isFullscreen:!Boolean(state.isFullscreen||state.fullscreen)};
  if(action.type==='source-action')return nextTableCategorizedSourceActionState(state,action);
  if(action.type==='recipe-action')return nextTableCategorizedRecipeState(state,action);
  return state;
}

export function nextTableCategorizedSourceActionState(state={},action={}){
  const id=String(action.action||'');
  if(id==='load-sample')return loadPsMappingSampleState(state);
  if(id==='load-coordinate-sample')return loadCoordinateLookupSampleState(state);
  if(id==='parse')return parseActiveSourceState(state);
  if(id==='clear')return clearActiveSourceState(state);
  if(id==='add-source')return addEmptySourceState(state);
  if(id==='remove-source')return removeActiveSourceState(state);
  if(id==='build-graph')return buildPreviewGraphState(state);
  return state;
}

export function nextTableCategorizedRecipeState(state={},action={}){
  const recipeAction=String(action.action||action.recipeAction||'');
  if(!RECIPE_ACTIONS.has(recipeAction))return state;
  let profile=null;
  if(recipeAction==='new-blank-profile')profile=createBlankUniversalProfile();
  if(recipeAction==='load-ps-template')profile=cloneProfile(PS_MAPPING_TABLE_2_SHADOW_PROFILE);
  if(recipeAction==='load-two-source-template')profile=cloneProfile(PS_MAPPING_TABLE_2_COORDINATE_LOOKUP_PROFILE);
  if(recipeAction==='reset-profile')profile=cloneProfile(state.defaultProfile||PS_MAPPING_TABLE_2_SHADOW_PROFILE);
  if(!profile)return state;
  return stateWithProfileChange(state,profile,[{severity:'INFO',code:`recipe_${recipeAction}`,message:`Recipe action completed: ${recipeAction}.`,ref:profile.profileId}]);
}

export function nextTableCategorizedImportedProfileState(state={},jsonText='',fileName='recipe.json'){
  const parsed=parseProfileRecipeJson(jsonText);
  const activeSetupTab=state.activeSetupTab||'recipe';
  if(!parsed.ok)return {...state,profileMessages:parsed.diagnostics,profileImportName:fileName,activeSetupTab,activePreviewStage:previewStageForSetupTab(activeSetupTab)};
  const normalized=normalizeImportedProfile(parsed.profile);
  return stateWithProfileChange(state,normalized.profile,[...parsed.diagnostics,...normalized.diagnostics,{severity:'INFO',code:'recipe_imported',message:`Recipe JSON imported: ${fileName}.`,ref:normalized.profile.profileId}],fileName);
}

export function buildProfileRecipeDownload(profile){
  const normalized=normalizeImportedProfile(profile||PS_MAPPING_TABLE_2_SHADOW_PROFILE);
  return Object.freeze({ok:true,filename:'table-categorized-recipe.json',mimeType:'application/json',text:serializeProfileRecipe(normalized.profile),profile:normalized.profile});
}

export function createTableCategorizedDownloadArtifact(state={},kind=''){
  const exportResult=state.exportResult||{};
  if(!DOWNLOAD_KINDS.has(kind))return Object.freeze({ok:false,reason:'Unknown download kind.'});
  if(kind==='profile'&&!exportResult.ok)return buildProfileRecipeDownload(state.profile||PS_MAPPING_TABLE_2_SHADOW_PROFILE);
  if(!exportResult.ok)return Object.freeze({ok:false,reason:'Export is not ready. Build Preview Graph first.'});
  const specs={
    xml:{filename:'table-categorized.xml',mimeType:'application/xml',text:exportResult.xmlText||''},
    graph:{filename:'table-categorized-graph.json',mimeType:'application/json',text:exportResult.graphJson||''},
    profile:{filename:'table-categorized-recipe.json',mimeType:'application/json',text:exportResult.profileJson||serializeProfileRecipe(state.profile||PS_MAPPING_TABLE_2_SHADOW_PROFILE)},
    diagnostics:{filename:'table-categorized-diagnostics.json',mimeType:'application/json',text:exportResult.diagnosticsJson||''},
    audit:{filename:'table-categorized-audit.json',mimeType:'application/json',text:exportResult.auditJson||''}
  };
  const artifact=specs[kind];
  if(!artifact?.text)return Object.freeze({ok:false,reason:'Export is not ready. Build Preview Graph first.'});
  return Object.freeze({ok:true,...artifact});
}

export function triggerTableCategorizedDownload(artifact,doc=globalThis.document){
  if(!artifact?.ok)return artifact;
  if(!doc?.createElement||typeof Blob==='undefined'||!globalThis.URL?.createObjectURL)return artifact;
  const blob=new Blob([artifact.text],{type:artifact.mimeType});
  const url=globalThis.URL.createObjectURL(blob);
  const anchor=doc.createElement('a');
  anchor.href=url;
  anchor.download=artifact.filename;
  anchor.style.display='none';
  doc.body?.appendChild?.(anchor);
  anchor.click?.();
  anchor.remove?.();
  globalThis.URL.revokeObjectURL?.(url);
  return artifact;
}

export const triggerProfileRecipeDownload=triggerTableCategorizedDownload;

export function tableCategorizedNavigationActionFromTarget(target){
  const setupButton=target?.closest?.('[data-table-categorized-setup-tab]');
  if(setupButton?.dataset?.tableCategorizedSetupTab){
    if(setupButton.disabled||setupButton.dataset.setupEnabled==='false')return null;
    return {type:'setup-tab',setupTab:setupButton.dataset.tableCategorizedSetupTab};
  }
  const workflowButton=target?.closest?.('[data-table-categorized-tab]');
  if(workflowButton?.dataset?.tableCategorizedTab)return {type:'workflow-tab',activeTab:workflowButton.dataset.tableCategorizedTab};
  const previewButton=target?.closest?.('[data-table-categorized-preview-stage]');
  if(previewButton?.dataset?.tableCategorizedPreviewStage)return {type:'preview-stage',previewStage:previewButton.dataset.tableCategorizedPreviewStage};
  const downloadButton=target?.closest?.('[data-table-categorized-download]');
  if(downloadButton?.dataset?.tableCategorizedDownload)return {type:'download',kind:downloadButton.dataset.tableCategorizedDownload};
  const actionButton=target?.closest?.('[data-table-categorized-action]');
  const action=actionButton?.dataset?.tableCategorizedAction;
  if(action==='toggle-fullscreen')return {type:'toggle-fullscreen'};
  if(SOURCE_ACTIONS.has(action))return {type:'source-action',action};
  if(RECIPE_ACTIONS.has(action))return {type:'recipe-action',action};
  return null;
}

export function tableCategorizedNavigationStateFromPopup(popup,state={}){
  const activeTab=popup?.querySelector?.(ACTIVE_WORKFLOW_SELECTOR)?.dataset?.tableCategorizedTab||state.activeTab||'source';
  const wanted=popup?.querySelector?.(ACTIVE_SETUP_SELECTOR)?.dataset?.tableCategorizedSetupTab||state.activeSetupTab||setupTabForWorkflowTab(activeTab);
  const activeSetupTab=isSetupTabEnabledForWorkflow(activeTab,wanted)?wanted:setupTabForWorkflowTab(activeTab);
  const activePreviewStage=state.activePreviewStage||previewStageForSetupTab(activeSetupTab);
  return syncSourceDraftFromPopup(popup,{...state,activeTab,activeSetupTab,activePreviewStage});
}

export function handleTableCategorizedNavigationClick(event,state={},render,options={}){
  const action=tableCategorizedNavigationActionFromTarget(event?.target);
  if(!action)return {handled:false,state};
  event.preventDefault?.();
  if(action.type==='download'){
    const artifact=createTableCategorizedDownloadArtifact(state,action.kind);
    if(artifact.ok){
      if(typeof options.download==='function')options.download(artifact);
      else if(action.kind==='profile'&&typeof options.downloadRecipe==='function')options.downloadRecipe(artifact);
      else triggerTableCategorizedDownload(artifact,options.document||globalThis.document);
    }
    return {handled:true,state,action,artifact,download:artifact};
  }
  const nextState=nextTableCategorizedNavigationState(state,action);
  render?.(nextState);
  return {handled:true,state:nextState,action};
}

export function handleTableCategorizedProfileFileImport(file,state={},render){
  if(!file?.text)return Promise.resolve({handled:false,state});
  return file.text().then((text)=>{
    const nextState=nextTableCategorizedImportedProfileState(state,text,file.name||'recipe.json');
    render?.(nextState);
    return {handled:true,state:nextState,fileName:file.name||'recipe.json'};
  });
}

export function wireTableCategorizedSetupTabNavigation(container,{state={},render,download,downloadRecipe}={}){
  let currentState={...state};
  const applyRender=(nextState)=>{currentState=nextState;if(typeof render==='function')render(nextState);else if(container)container.innerHTML=renderTableCategorizedXmlShellHtml(nextState);};
  const onClick=(event)=>{const popup=event?.target?.closest?.(POPUP_SELECTOR)||container?.querySelector?.(POPUP_SELECTOR)||container;const syncedState=tableCategorizedNavigationStateFromPopup(popup,currentState);const result=handleTableCategorizedNavigationClick(event,syncedState,applyRender,{download,downloadRecipe});if(result.handled)currentState=result.state;};
  const onChange=(event)=>{const input=event?.target?.closest?.('[data-table-categorized-profile-file]');if(!input)return;const file=input.files?.[0];if(!file)return;event.preventDefault?.();handleTableCategorizedProfileFileImport(file,currentState,applyRender).then((result)=>{if(result.handled)currentState=result.state;});};
  container?.addEventListener?.('click',onClick);
  container?.addEventListener?.('change',onChange);
  return {getState:()=>currentState,setState:(nextState={})=>{currentState={...nextState};},render:()=>applyRender(currentState),destroy:()=>{container?.removeEventListener?.('click',onClick);container?.removeEventListener?.('change',onChange);}};
}

export function installTableCategorizedSetupTabNavigation(root,initialState={}){
  if(!root?.addEventListener)return {destroy(){},getState:()=>({...initialState})};
  let currentState={...initialState};
  const renderPopup=(popup,nextState)=>{currentState=nextState;popup.outerHTML=renderTableCategorizedXmlShellHtml(nextState);};
  const onClick=(event)=>{const popup=event?.target?.closest?.(POPUP_SELECTOR);if(!popup)return;const popupState=tableCategorizedNavigationStateFromPopup(popup,currentState);const result=handleTableCategorizedNavigationClick(event,popupState,(nextState)=>renderPopup(popup,nextState));if(result.handled)currentState=result.state;};
  const onChange=(event)=>{const input=event?.target?.closest?.('[data-table-categorized-profile-file]');if(!input)return;const popup=event?.target?.closest?.(POPUP_SELECTOR);if(!popup)return;const file=input.files?.[0];if(!file)return;event.preventDefault?.();const popupState=tableCategorizedNavigationStateFromPopup(popup,currentState);handleTableCategorizedProfileFileImport(file,popupState,(nextState)=>renderPopup(popup,nextState)).then((result)=>{if(result.handled)currentState=result.state;});};
  root.addEventListener('click',onClick);
  root.addEventListener('change',onChange);
  return {getState:()=>currentState,destroy:()=>{root.removeEventListener?.('click',onClick);root.removeEventListener?.('change',onChange);}};
}

function syncSourceDraftFromPopup(popup,state={}){if(!popup?.querySelector)return state;const activeSourceId=popup.querySelector('[data-table-categorized-active-source]')?.value||state.activeSourceId||'S1';const sourceName=popup.querySelector('[data-table-categorized-source-name]')?.value;const sourceText=popup.querySelector('[data-table-categorized-source-text]')?.value;if(sourceName===undefined&&sourceText===undefined)return state;const sources=ensureSources(state.sources,state.source,activeSourceId).map((source)=>source.sourceId===activeSourceId?{...source,sourceName:sourceName??source.sourceName,sourceText:sourceText??source.sourceText}:source);return {...state,sources,activeSourceId};}
function ensureSources(sources=[],source=null,activeSourceId='S1'){const items=Array.isArray(sources)&&sources.length?sources:(source?[source]:[]);return items.length?items:[emptySource(activeSourceId||'S1')];}
function emptySource(sourceId='S1',sourceName=`Source ${sourceId}`){return {sourceId,sourceName,sourceType:'pasteText',sourceText:'',headers:[],rows:[],diagnostics:[]};}
function replaceSource(sources=[],nextSource){return ensureSources(sources,null,nextSource.sourceId).some((source)=>source.sourceId===nextSource.sourceId)?sources.map((source)=>source.sourceId===nextSource.sourceId?nextSource:source):[...sources,nextSource];}
function parsedSource(text,options){const parsed=parseTableSource(text,options);return {...parsed,sourceText:text};}
function clearDerived(state){return {...state,graph:null,validationResults:[],exportResult:null,exportStatus:''};}
function keepSourceTab(state,activePreviewStage='raw'){return {...state,activeTab:'source',activeSetupTab:'source',activePreviewStage};}
function loadPsMappingSampleState(state={}){const source=parsedSource(PS_MAPPING_TABLE_2_SAMPLE,{sourceId:'S1',sourceName:'PS Mapping Table 2 Sample',sourceType:'sample'});return keepSourceTab(clearDerived({...state,sources:[source],activeSourceId:'S1',profile:PS_MAPPING_TABLE_2_SHADOW_PROFILE,sourceActionMessage:'Loaded PS Mapping Table 2 sample.'}));}
function loadCoordinateLookupSampleState(state={}){const model=parsedSource(PS_MAPPING_TABLE_2_MODEL_SAMPLE,{sourceId:'S1',sourceName:'Table 2 Model Data',sourceType:'sample'});const lookup=parsedSource(PS_MAPPING_COORDINATE_LOOKUP_SAMPLE,{sourceId:'S2',sourceName:'Coordinate Lookup Sample',sourceType:'sample'});return keepSourceTab(clearDerived({...state,sources:[model,lookup],activeSourceId:'S1',profile:PS_MAPPING_TABLE_2_COORDINATE_LOOKUP_PROFILE,sourceActionMessage:'Loaded model table plus coordinate lookup sample.'}));}
function parseActiveSourceState(state={}){const activeSourceId=state.activeSourceId||'S1';const sources=ensureSources(state.sources,state.source,activeSourceId);const source=sources.find((item)=>item.sourceId===activeSourceId)||sources[0]||emptySource(activeSourceId);const parsed=parsedSource(source.sourceText||'',{sourceId:source.sourceId,sourceName:source.sourceName||source.sourceId,sourceType:source.sourceType||'pasteText'});return keepSourceTab(clearDerived({...state,sources:replaceSource(sources,parsed),activeSourceId:source.sourceId,sourceActionMessage:'Read active table.'}));}
function clearActiveSourceState(state={}){const activeSourceId=state.activeSourceId||'S1';const sources=ensureSources(state.sources,state.source,activeSourceId).map((source)=>source.sourceId===activeSourceId?emptySource(source.sourceId,source.sourceName||`Source ${source.sourceId}`):source);return keepSourceTab(clearDerived({...state,sources,activeSourceId,sourceActionMessage:'Cleared active table.'}));}
function addEmptySourceState(state={}){const sources=ensureSources(state.sources,state.source,state.activeSourceId||'S1');const ids=new Set(sources.map((source)=>source.sourceId));let index=1;while(ids.has(`S${index}`))index+=1;const source=emptySource(`S${index}`);return keepSourceTab(clearDerived({...state,sources:[...sources,source],activeSourceId:source.sourceId,sourceActionMessage:`Added ${source.sourceId}.`}));}
function removeActiveSourceState(state={}){const activeSourceId=state.activeSourceId||'S1';const remaining=ensureSources(state.sources,state.source,activeSourceId).filter((source)=>source.sourceId!==activeSourceId);const sources=remaining.length?remaining:[emptySource('S1')];return keepSourceTab(clearDerived({...state,sources,activeSourceId:sources[0].sourceId,sourceActionMessage:`Removed ${activeSourceId}.`}));}
function buildPreviewGraphState(state={}){const sources=ensureSources(state.sources,state.source,state.activeSourceId||'S1');const parsedSources=sources.map((source)=>(source.rows?.length?source:parsedSource(source.sourceText||'',{sourceId:source.sourceId,sourceName:source.sourceName||source.sourceId,sourceType:source.sourceType||'pasteText'})));const profile=state.profile||PS_MAPPING_TABLE_2_SHADOW_PROFILE;const graph=buildCategorizedGraph(profile,parsedSources);const validationResults=runCategorizerValidation({profile,sources:parsedSources,graph});const exportResult=exportCategorizedGraphArtifacts({graph,profile,validationResults,sources:parsedSources});return {...state,sources:parsedSources,profile,graph,validationResults,exportResult,exportStatus:exportResult?.ok?'Export preview ready.':'Export blocked or not ready.',activeTab:'graph',activeSetupTab:'structure',activePreviewStage:'graph'};}
function stateWithProfileChange(state,profile,profileMessages=[],profileImportName=''){const activeSetupTab=state.activeSetupTab||'recipe';return {...clearDerived(state),profile,profileMessages,profileImportName,activeSetupTab,activePreviewStage:previewStageForSetupTab(activeSetupTab)};}
