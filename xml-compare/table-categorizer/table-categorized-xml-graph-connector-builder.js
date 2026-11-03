export const TABLE_CATEGORIZED_XML_GRAPH_CONNECTOR_BUILDER_SCHEMA='table-categorized-xml-graph-connector-builder/v1';
export const CATEGORIZED_GRAPH_CONNECTORS_SCHEMA='table-categorized-xml-graph-connectors/v1';
export const CATEGORIZED_GRAPH_MATCH_MAP_SCHEMA='table-categorized-xml-graph-match-map/v1';
export const CATEGORIZED_GRAPH_CONNECTOR_CANDIDATES_SCHEMA='table-categorized-xml-graph-connector-candidates/v1';

const SUPPORTED_LEVELS=new Set(['SupportFamily','SupportOccurrence','SupportFeature','Gap']);

export function buildCategorizedGraphConnectors({sourceCanvasModel=null,targetCanvasModel=null,graphCompareResult=null}={}){
  const diagnostics=[];
  const output={
    schema:CATEGORIZED_GRAPH_CONNECTORS_SCHEMA,
    matchMap:{schema:CATEGORIZED_GRAPH_MATCH_MAP_SCHEMA,request:{scope:'categorized-graph',sourceSide:'source',targetSide:'target'},matches:[]},
    connectorCandidates:{schema:CATEGORIZED_GRAPH_CONNECTOR_CANDIDATES_SCHEMA,summary:{enabled:true,candidateCount:0,missingCount:0,extraCount:0,mismatchCount:0},candidates:[]},
    diagnostics
  };
  if(!sourceCanvasModel)diagnostics.push(diag('ERROR','missing_source_canvas_model','sourceCanvasModel is required.'));
  if(!targetCanvasModel)diagnostics.push(diag('ERROR','missing_target_canvas_model','targetCanvasModel is required.'));
  if(!graphCompareResult)diagnostics.push(diag('ERROR','missing_graph_compare_result','graphCompareResult is required.'));
  if(!sourceCanvasModel||!targetCanvasModel||!graphCompareResult)return finalize(output);

  const sourceIndex=indexCanvasModel(sourceCanvasModel,'source',diagnostics);
  const targetIndex=indexCanvasModel(targetCanvasModel,'target',diagnostics);
  for(const item of graphCompareResult.mapped||[])addMappedConnector(output,item,sourceIndex,targetIndex,diagnostics);
  for(const item of graphCompareResult.mismatches||[])addMismatchConnector(output,item,sourceIndex,targetIndex,diagnostics);
  for(const item of graphCompareResult.missing||[])addMissingMarker(output,item,sourceIndex,diagnostics);
  for(const item of graphCompareResult.extra||[])addExtraMarker(output,item,targetIndex,diagnostics);
  output.connectorCandidates.summary={enabled:true,candidateCount:output.connectorCandidates.candidates.length,missingCount:output.connectorCandidates.candidates.filter((c)=>c.matchType==='MISSING_IN_TARGET').length,extraCount:output.connectorCandidates.candidates.filter((c)=>c.matchType==='EXTRA_IN_TARGET').length,mismatchCount:output.matchMap.matches.filter((c)=>c.matchType==='MISMATCH').length};
  return finalize(output);
}

function addMappedConnector(output,item,sourceIndex,targetIndex,diagnostics){
  if(!validItem(item,diagnostics))return;
  const source=resolveRecord(sourceIndex,item.level,item.sourcePath||item.path,item,'source',diagnostics);
  const target=resolveRecord(targetIndex,item.level,item.targetPath||item.path,item,'target',diagnostics);
  if(!source||!target)return;
  output.matchMap.matches.push(createConnector({level:item.level,type:'EXACT',matchType:'MATCHED',severity:'INFO',source,target,item}));
}

function addMismatchConnector(output,item,sourceIndex,targetIndex,diagnostics){
  if(!validItem(item,diagnostics))return;
  const source=resolveRecord(sourceIndex,item.level,item.sourcePath||item.path,item,'source',diagnostics);
  const target=resolveRecord(targetIndex,item.level,item.targetPath||item.path,item,'target',diagnostics);
  if(!source||!target)return;
  output.matchMap.matches.push(createConnector({level:item.level,type:'CANDIDATE',matchType:'MISMATCH',severity:'WARNING',source,target,item}));
}

function addMissingMarker(output,item,sourceIndex,diagnostics){
  if(!validItem(item,diagnostics))return;
  const source=resolveRecord(sourceIndex,item.level,item.sourcePath||item.path,item,'source',diagnostics);
  if(!source)return;
  output.connectorCandidates.candidates.push(createConnector({level:item.level,type:'MISSING',matchType:'MISSING_IN_TARGET',severity:'BLOCKER',source,target:null,item}));
}

function addExtraMarker(output,item,targetIndex,diagnostics){
  if(!validItem(item,diagnostics))return;
  const target=resolveRecord(targetIndex,item.level,item.targetPath||item.path,item,'target',diagnostics);
  if(!target)return;
  output.connectorCandidates.candidates.push(createConnector({level:item.level,type:'EXTRA',matchType:'EXTRA_IN_TARGET',severity:'WARNING',source:null,target,item}));
}

function createConnector({level,type,matchType,severity,source,target,item}){
  const key=sourceKeyForLevel(source||target,level);
  return Object.freeze({
    id:`graph-conn:${level}:${key}`,
    sourceUid:source?.uid||'',
    targetUid:target?.uid||'',
    type,
    connectorKind:'GRAPH_COMPARE',
    compareLevel:level,
    matchType,
    severity,
    sourceKey:sourceKeyForLevel(source,level),
    targetKey:sourceKeyForLevel(target,level),
    sourcePath:item.sourcePath||item.path||'',
    targetPath:item.targetPath||item.path||'',
    diagnostics:Object.freeze(item.diagnostics||[]),
    finding:item.finding||item.message||'',
    sourceRefs:Object.freeze([...(item.sourceRefs||source?.sourceRefs||[])]),
    targetRefs:Object.freeze([...(item.targetRefs||target?.sourceRefs||[])])
  });
}

function resolveRecord(index,level,path,item,side,diagnostics){
  if(!SUPPORTED_LEVELS.has(level)){diagnostics.push(diag('WARNING','unsupported_compare_level',`Unsupported compare level: ${level}.`,{level,path,side,item}));return null;}
  const key=keyFromCompareItem(level,path,item,side);
  const record=index.byLevelKey.get(`${level}\u0000${key}`);
  if(record)return record;
  diagnostics.push(diag('WARNING',side==='source'?'unresolved_source_key':'unresolved_target_key',`Unable to resolve ${side} ${level} key: ${key}.`,{level,path,key,side,item}));
  return null;
}

function keyFromCompareItem(level,path,item,side){
  const pathText=String(path||'');
  if(level==='SupportFamily')return lastPathSegment(pathText)||sideKey(item,side)||pathText;
  if(level==='SupportOccurrence')return lastPathSegment(pathText)||sideKey(item,side)||pathText;
  if(level==='SupportFeature')return lastPathSegment(pathText)||sideKey(item,side)||pathText;
  if(level==='Gap'){
    const last=lastPathSegment(pathText);
    if(last&&last!=='Gap')return last;
    const parent=pathText.split('/').filter(Boolean).at(-2)||sideKey(item,side)||'';
    return parent?`${parent}_Gap`:last;
  }
  return sideKey(item,side)||lastPathSegment(pathText)||pathText;
}

function sideKey(item,side){const path=side==='source'?item.sourcePath:item.targetPath;return lastPathSegment(path)||lastPathSegment(item.path)||'';}
function lastPathSegment(value){const parts=String(value||'').split('/').filter(Boolean);return parts.at(-1)||'';}

function indexCanvasModel(model,side,diagnostics){
  const byLevelKey=new Map();
  for(const record of model.records||[]){
    const level=record.compareLevel;
    if(!SUPPORTED_LEVELS.has(level))continue;
    for(const key of keysForRecord(record)){
      const mapKey=`${level}\u0000${key}`;
      if(byLevelKey.has(mapKey)&&byLevelKey.get(mapKey).uid!==record.uid)diagnostics.push(diag('WARNING','duplicate_canvas_key',`Duplicate ${side} canvas key for ${level}: ${key}.`,{side,level,key,firstUid:byLevelKey.get(mapKey).uid,duplicateUid:record.uid}));
      else byLevelKey.set(mapKey,record);
    }
  }
  return {byLevelKey};
}

function keysForRecord(record){
  const keys=[];
  if(record.compareLevel==='SupportFamily')keys.push(record.familyKey,record.key);
  else if(record.compareLevel==='SupportOccurrence')keys.push(record.occurrenceKey,record.key);
  else if(record.compareLevel==='SupportFeature')keys.push(record.featureKey,record.key);
  else if(record.compareLevel==='Gap')keys.push(record.key,record.featureKey?`${record.featureKey}_Gap`:'');
  return [...new Set(keys.map((key)=>String(key||'').trim()).filter(Boolean))];
}

function sourceKeyForLevel(record,level){
  if(!record)return '';
  if(level==='SupportFamily')return record.familyKey||record.key||'';
  if(level==='SupportOccurrence')return record.occurrenceKey||record.key||'';
  if(level==='SupportFeature')return record.featureKey||record.key||'';
  if(level==='Gap')return record.key||`${record.featureKey||''}_Gap`;
  return record.key||'';
}

function validItem(item,diagnostics){
  if(!item||typeof item!=='object'){diagnostics.push(diag('ERROR','malformed_compare_item','Compare item is not an object.',{item}));return false;}
  if(!item.level||!String(item.path||item.sourcePath||item.targetPath||'')){diagnostics.push(diag('ERROR','malformed_compare_item','Compare item requires level and path/sourcePath/targetPath.',{item}));return false;}
  return true;
}

function finalize(output){
  Object.freeze(output.matchMap.matches);
  Object.freeze(output.matchMap.request);
  Object.freeze(output.matchMap);
  Object.freeze(output.connectorCandidates.summary);
  Object.freeze(output.connectorCandidates.candidates);
  Object.freeze(output.connectorCandidates);
  Object.freeze(output.diagnostics);
  return Object.freeze(output);
}

function diag(severity,code,message,details={}){return Object.freeze({severity,code,message,details:Object.freeze(details||{})});}
