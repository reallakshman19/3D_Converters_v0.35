export const TABLE_CATEGORIZED_XML_GRAPH_CANVAS_ADAPTER_SCHEMA='table-categorized-xml-graph-canvas-adapter/v1';
export const CATEGORIZED_GRAPH_CANVAS_MODEL_SCHEMA='table-categorized-xml-graph-canvas-model/v1';

const SUPPORTED_LEVEL_IDS=new Set(['supportFamily','supportOccurrence','supportFeature','gap']);
const STRUCTURAL_LEVEL_IDS=new Set(['categorizedTableGraph','rootPartition']);
const LEVEL_ORDER=Object.freeze(['SupportFamily','SupportOccurrence','SupportFeature','Gap']);

export function createCategorizedGraphCanvasModel({graph=null,side='source',title='',profileId=''}={}){
  const diagnostics=[];
  const safeSide=side==='target'?'target':'source';
  const model={
    schema:CATEGORIZED_GRAPH_CANVAS_MODEL_SCHEMA,
    side:safeSide,
    title:title||`${safeSide==='target'?'Target':'Source'} Graph`,
    profileId:profileId||graph?.profileId||'',
    records:[],
    levelViews:createEmptyLevelViews(),
    levelView:null,
    diagnostics,
    hierarchy:{rootKeys:[],familyToOccurrences:{},occurrenceToFeatures:{},featureToGaps:{}}
  };
  if(!graph){diagnostics.push(diag('ERROR','missing_graph','Categorized graph is required.'));return finalize(model);}
  if(!Array.isArray(graph.nodes)||!graph.nodes.length){diagnostics.push(diag('WARNING','graph_has_no_nodes','Categorized graph has no nodes.'));return finalize(model);}

  const index=createGraphIndex(graph);
  const recordsByUid=new Set();
  for(const node of graph.nodes){
    if(STRUCTURAL_LEVEL_IDS.has(node.levelId))continue;
    if(!SUPPORTED_LEVEL_IDS.has(node.levelId)){diagnostics.push(diag('INFO','unsupported_level_ignored',`Unsupported graph level ignored: ${node.levelId}.`,{nodeId:node.id,levelId:node.levelId}));continue;}
    if(!String(node.key||''))diagnostics.push(diag('WARNING','missing_key_on_graph_node','Graph node has no key.',{nodeId:node.id,levelId:node.levelId}));
    const record=createRecordForNode(node,index,model.hierarchy,diagnostics,safeSide);
    if(!record)continue;
    addRecord(model,record,recordsByUid,diagnostics);
  }
  return finalize(model);
}

function createRecordForNode(node,index,hierarchy,diagnostics,side){
  if(node.levelId==='supportFamily')return createFamilyRecord(node,hierarchy,side);
  if(node.levelId==='supportOccurrence')return createOccurrenceRecord(node,index,hierarchy,side);
  if(node.levelId==='supportFeature')return createFeatureRecord(node,index,hierarchy,diagnostics,side);
  if(node.levelId==='gap')return createGapRecord(node,index,hierarchy,diagnostics,side);
  return null;
}

function createFamilyRecord(node,hierarchy,side){
  const familyKey=String(node.key||'');
  pushUnique(hierarchy.rootKeys,familyKey);
  ensureArrayMap(hierarchy.familyToOccurrences,familyKey);
  return freezeRecord({uid:uid(side,'SupportFamily',familyKey),graphNodeId:node.id,compareLevel:'SupportFamily',levelId:'supportFamily',familyKey,displayName:String(node.displayName||familyKey),key:familyKey,sourceRefs:normalizeSourceRefs(node.sourceRefs)});
}

function createOccurrenceRecord(node,index,hierarchy,side){
  const family=ancestor(index,node,'supportFamily');
  const familyKey=String(family?.key||'');
  const occurrenceKey=String(node.key||'');
  const fields=evidenceFields(node);
  if(familyKey)pushUnique(ensureArrayMap(hierarchy.familyToOccurrences,familyKey),occurrenceKey);
  ensureArrayMap(hierarchy.occurrenceToFeatures,occurrenceKey);
  return freezeRecord({uid:uid(side,'SupportOccurrence',occurrenceKey),graphNodeId:node.id,compareLevel:'SupportOccurrence',levelId:'supportOccurrence',familyKey,occurrenceKey,displayName:String(node.displayName||occurrenceKey),key:occurrenceKey,bore:fields.bore,pipe:fields.pipe,mandatory:fields.mandatory,sourceRefs:refsWithParent(node,family)});
}

function createFeatureRecord(node,index,hierarchy,diagnostics,side){
  const occurrence=ancestor(index,node,'supportOccurrence');
  if(!occurrence){diagnostics.push(diag('WARNING','orphan_feature_without_occurrence','SupportFeature has no SupportOccurrence ancestor.',{nodeId:node.id,key:node.key}));return null;}
  const family=ancestor(index,occurrence,'supportFamily');
  const occurrenceKey=String(occurrence.key||'');
  const familyKey=String(family?.key||'');
  const featureKey=String(node.key||'');
  const fields=evidenceFields(node,occurrence);
  const featureType=String(node.fields?.featureType||fields.dtxr||node.displayName||'');
  const gap=firstChild(index,node,'gap');
  const gapValue=gapValueFromNode(gap);
  pushUnique(ensureArrayMap(hierarchy.occurrenceToFeatures,occurrenceKey),featureKey);
  ensureArrayMap(hierarchy.featureToGaps,featureKey);
  return freezeRecord({uid:uid(side,'SupportFeature',featureKey),graphNodeId:node.id,compareLevel:'SupportFeature',levelId:'supportFeature',familyKey,occurrenceKey,featureKey,featureType,gapValue,bore:fields.bore,pipe:fields.pipe,mandatory:fields.mandatory,dtxr:fields.dtxr||featureType,displayName:`${occurrenceKey} ${featureType}`.trim(),key:featureKey,sourceRefs:refsWithParent(node,occurrence)});
}

function createGapRecord(node,index,hierarchy,diagnostics,side){
  const feature=ancestor(index,node,'supportFeature');
  if(!feature){diagnostics.push(diag('WARNING','orphan_gap_without_feature','Gap node has no SupportFeature ancestor.',{nodeId:node.id,key:node.key}));return null;}
  const occurrence=ancestor(index,feature,'supportOccurrence');
  if(!occurrence){diagnostics.push(diag('WARNING','orphan_feature_without_occurrence','Gap parent SupportFeature has no SupportOccurrence ancestor.',{nodeId:node.id,key:node.key,featureId:feature.id}));return null;}
  const family=ancestor(index,occurrence,'supportFamily');
  const featureFields=evidenceFields(feature,occurrence);
  const familyKey=String(family?.key||'');
  const occurrenceKey=String(occurrence.key||'');
  const featureKey=String(feature.key||'');
  const featureType=String(feature.fields?.featureType||featureFields.dtxr||feature.displayName||'');
  const gapValue=gapValueFromNode(node);
  pushUnique(ensureArrayMap(hierarchy.featureToGaps,featureKey),String(node.key||''));
  return freezeRecord({uid:uid(side,'Gap',String(node.key||'')),graphNodeId:node.id,compareLevel:'Gap',levelId:'gap',familyKey,occurrenceKey,featureKey,featureType,gapValue,displayName:`${occurrenceKey} ${featureType} Gap ${gapValue}`.trim(),key:String(node.key||''),sourceRefs:refsWithParent(node,feature)});
}

function addRecord(model,record,recordsByUid,diagnostics){
  if(recordsByUid.has(record.uid)){diagnostics.push(diag('ERROR','duplicate_generated_uid','Duplicate generated canvas record UID.',{uid:record.uid,graphNodeId:record.graphNodeId}));return;}
  recordsByUid.add(record.uid);
  model.records.push(record);
  model.levelViews[record.compareLevel].records.push(record);
}

function finalize(model){
  for(const level of LEVEL_ORDER)Object.freeze(model.levelViews[level].records);
  model.levelView=model.levelViews.SupportFeature;
  Object.freeze(model.records);
  Object.freeze(model.levelViews);
  Object.freeze(model.hierarchy.rootKeys);
  Object.freeze(model.hierarchy.familyToOccurrences);
  Object.freeze(model.hierarchy.occurrenceToFeatures);
  Object.freeze(model.hierarchy.featureToGaps);
  Object.freeze(model.hierarchy);
  Object.freeze(model.diagnostics);
  return Object.freeze(model);
}

function createEmptyLevelViews(){
  return {
    SupportFamily:{layout:'cards',label:'Support Families',displayField:'displayName',keyField:'familyKey',fields:['familyKey','sourceRefs'],records:[]},
    SupportOccurrence:{layout:'cards',label:'Support Occurrences',displayField:'displayName',keyField:'occurrenceKey',fields:['familyKey','bore','pipe','mandatory','sourceRefs'],records:[]},
    SupportFeature:{layout:'cards',label:'Support Features',displayField:'displayName',keyField:'featureKey',fields:['featureType','gapValue','bore','pipe','mandatory','sourceRefs'],records:[]},
    Gap:{layout:'cards',label:'Support Gaps',displayField:'displayName',keyField:'key',fields:['featureType','gapValue','sourceRefs'],records:[]}
  };
}

function createGraphIndex(graph){
  const nodesById=new Map((graph.nodes||[]).map((node)=>[node.id,node]));
  const parentById=new Map();
  const childrenById=new Map();
  for(const node of graph.nodes||[])if(node.parentId)parentById.set(node.id,node.parentId);
  for(const edge of graph.edges||[]){
    if(edge.edgeType&&edge.edgeType!=='owns')continue;
    parentById.set(edge.toNodeId,edge.fromNodeId);
    if(!childrenById.has(edge.fromNodeId))childrenById.set(edge.fromNodeId,[]);
    childrenById.get(edge.fromNodeId).push(edge.toNodeId);
  }
  return {nodesById,parentById,childrenById};
}

function ancestor(index,node,levelId){let current=node;const seen=new Set();while(current&&!seen.has(current.id)){seen.add(current.id);const parentId=index.parentById.get(current.id);current=parentId?index.nodesById.get(parentId):null;if(current?.levelId===levelId)return current;}return null;}
function firstChild(index,node,levelId){return (index.childrenById.get(node.id)||[]).map((id)=>index.nodesById.get(id)).find((child)=>child?.levelId===levelId)||null;}
function evidenceFields(node,parent=null){const raw={...(parent?.evidence?.[0]?.rawByHeader||{}),...(node?.evidence?.[0]?.rawByHeader||{})};const fields=node?.fields||{};return {bore:stringValue(fields.bore??fields.Bore??raw.Bore??raw.bore),pipe:stringValue(fields.pipe??fields.Pipe??raw.pipe??raw.Pipe),mandatory:stringValue(fields.mandatory??fields.Mandatory??raw.Mandatory),dtxr:stringValue(fields.dtxr??fields.DTXR??raw.DTXR??raw.dtxr)};}
function gapValueFromNode(node){if(!node)return '';const raw=node.evidence?.[0]?.rawByHeader||{};return stringValue(node.fields?.Gap??node.fields?.gap??node.fields?.value??node.fields?.rawValue??raw.Gap??raw.value??raw.rawValue??raw['Support Gap']);}
function refsWithParent(node,parent){const refs=normalizeSourceRefs(node?.sourceRefs);return refs.length?refs:normalizeSourceRefs(parent?.sourceRefs);}
function normalizeSourceRefs(sourceRefs=[]){return Object.freeze([...new Set((sourceRefs||[]).map((ref)=>String(ref||'').trim()).filter(Boolean))]);}
function uid(side,level,key){return `graph:${side}:${level}:${String(key||'')}`;}
function ensureArrayMap(map,key){if(!map[key])map[key]=[];return map[key];}
function pushUnique(list,value){if(value&&!list.includes(value))list.push(value);}
function stringValue(value){return value==null?'':String(value);}
function freezeRecord(record){return Object.freeze(record);}
function diag(severity,code,message,details={}){return Object.freeze({severity,code,message,details:Object.freeze(details||{})});}
