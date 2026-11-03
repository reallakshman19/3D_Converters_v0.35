export const TABLE_CATEGORIZED_XML_PS_MAPPING_COMPARE_SCHEMA='table-categorized-xml-ps-mapping-compare/v1';

export const PS_MAPPING_COMPARE_FIELDS=Object.freeze(['Bore','pipe','Mandatory','DTXR','Gap']);

export function comparePsMappingCategorizedGraphs({sourceGraph=null,targetGraph=null,sourceName='Source categorized graph',targetName='Target categorized graph'}={}){
  const source=indexPsMappingGraph(sourceGraph);
  const target=indexPsMappingGraph(targetGraph);
  const result={schema:TABLE_CATEGORIZED_XML_PS_MAPPING_COMPARE_SCHEMA,mode:'shadow',sourceName,targetName,summary:{mapped:0,missing:0,extra:0,mismatch:0},mapped:[],missing:[],extra:[],mismatches:[],diagnostics:[],findings:[]};
  compareFamilies(source,target,result);
  result.summary={mapped:result.mapped.length,missing:result.missing.length,extra:result.extra.length,mismatch:result.mismatches.length};
  result.findings=result.diagnostics.map(diagnosticToFinding);
  return deepFreeze(result);
}

export function indexPsMappingGraph(graph){
  const childrenByParent=childrenMap(graph);
  const nodesById=new Map((graph?.nodes||[]).map((node)=>[node.id,node]));
  const families=new Map();
  for(const family of (graph?.nodes||[]).filter((node)=>node.levelId==='supportFamily')){
    const familyRecord={node:family,key:family.key,displayName:family.displayName,occurrences:new Map(),sourceRefs:[...(family.sourceRefs||[])]};
    for(const occurrence of childrenOf(childrenByParent,nodesById,family.id).filter((node)=>node.levelId==='supportOccurrence')){
      const occurrenceRecord={node:occurrence,key:occurrence.key,displayName:occurrence.displayName,features:new Map(),fields:rowFields(occurrence),sourceRefs:[...(occurrence.sourceRefs||[])]};
      for(const feature of childrenOf(childrenByParent,nodesById,occurrence.id).filter((node)=>node.levelId==='supportFeature')){
        const featureType=String(feature.fields?.featureType||feature.displayName||feature.key||'').trim();
        const featureRecord={node:feature,key:feature.key,featureType,fields:{...rowFields(feature),DTXR:featureType},measures:new Map(),sourceRefs:[...(feature.sourceRefs||[])]};
        for(const measure of childrenOf(childrenByParent,nodesById,feature.id)){if(measure.levelId==='gap')featureRecord.measures.set('Gap',{node:measure,value:measure.fields?.value??measure.fields?.rawValue??measure.displayName,rawValue:measure.fields?.rawValue,sourceRefs:[...(measure.sourceRefs||[])]});}
        occurrenceRecord.features.set(featureType||feature.key,featureRecord);
      }
      familyRecord.occurrences.set(occurrence.key,occurrenceRecord);
    }
    families.set(family.key,familyRecord);
  }
  return deepFreeze({graph,families});
}

function compareFamilies(source,target,result){const sourceKeys=new Set(source.families.keys());const targetKeys=new Set(target.families.keys());for(const key of sourceKeys){if(!targetKeys.has(key)){pushMissing(result,'SupportFamily',key,source.families.get(key));continue;}result.mapped.push(record('SupportFamily',key,key,'mapped','SupportFamily mapped.',source.families.get(key),target.families.get(key)));compareOccurrences(key,source.families.get(key),target.families.get(key),result);}for(const key of targetKeys)if(!sourceKeys.has(key))pushExtra(result,'SupportFamily',key,target.families.get(key));}
function compareOccurrences(familyKey,sourceFamily,targetFamily,result){const sourceKeys=new Set(sourceFamily.occurrences.keys());const targetKeys=new Set(targetFamily.occurrences.keys());for(const key of sourceKeys){const path=`${familyKey}/${key}`;if(!targetKeys.has(key)){pushMissing(result,'SupportOccurrence',path,sourceFamily.occurrences.get(key));continue;}const sourceOccurrence=sourceFamily.occurrences.get(key);const targetOccurrence=targetFamily.occurrences.get(key);result.mapped.push(record('SupportOccurrence',path,path,'mapped','SupportOccurrence mapped.',sourceOccurrence,targetOccurrence));compareOccurrenceFields(path,sourceOccurrence,targetOccurrence,result);compareFeatures(path,sourceOccurrence,targetOccurrence,result);}for(const key of targetKeys)if(!sourceKeys.has(key))pushExtra(result,'SupportOccurrence',`${familyKey}/${key}`,targetFamily.occurrences.get(key));}
function compareFeatures(occurrencePath,sourceOccurrence,targetOccurrence,result){const sourceKeys=new Set(sourceOccurrence.features.keys());const targetKeys=new Set(targetOccurrence.features.keys());for(const key of sourceKeys){const path=`${occurrencePath}/${key}`;if(!targetKeys.has(key)){pushMissing(result,'SupportFeature',path,sourceOccurrence.features.get(key));continue;}const sourceFeature=sourceOccurrence.features.get(key);const targetFeature=targetOccurrence.features.get(key);result.mapped.push(record('SupportFeature',path,path,'mapped','SupportFeature mapped.',sourceFeature,targetFeature));compareValue(result,'SupportFeature',path,'DTXR',sourceFeature.fields.DTXR,targetFeature.fields.DTXR,sourceFeature,targetFeature);compareValue(result,'Gap',`${path}/Gap`,'Gap',sourceFeature.measures.get('Gap')?.value,targetFeature.measures.get('Gap')?.value,sourceFeature.measures.get('Gap'),targetFeature.measures.get('Gap'));}for(const key of targetKeys)if(!sourceKeys.has(key))pushExtra(result,'SupportFeature',`${occurrencePath}/${key}`,targetOccurrence.features.get(key));}
function compareOccurrenceFields(path,sourceOccurrence,targetOccurrence,result){for(const field of ['Bore','pipe','Mandatory'])compareValue(result,'SupportOccurrence',path,field,sourceOccurrence.fields[field],targetOccurrence.fields[field],sourceOccurrence,targetOccurrence);}
function compareValue(result,level,path,field,sourceValue,targetValue,sourceRecord,targetRecord){const s=normalizeValue(sourceValue),t=normalizeValue(targetValue);if(s===''&&t==='')return;if(s!==t){const mismatch={kind:'mismatch',level,path,field,sourceValue:sourceValue??'',targetValue:targetValue??'',sourceRefs:refs(sourceRecord),targetRefs:refs(targetRecord),message:`${field} mismatch at ${path}: source=${sourceValue??''}, target=${targetValue??''}.`};result.mismatches.push(mismatch);result.diagnostics.push({...mismatch,severity:'WARNING',code:'graph_compare_mismatch'});}}
function pushMissing(result,level,path,sourceRecord){const item=record(level,path,'','missing',`${level} missing in target graph.`,sourceRecord,null);result.missing.push(item);result.diagnostics.push({...item,severity:'BLOCKER',code:'graph_compare_missing'});}
function pushExtra(result,level,path,targetRecord){const item=record(level,'',path,'extra',`${level} extra in target graph.`,null,targetRecord);result.extra.push(item);result.diagnostics.push({...item,severity:'WARNING',code:'graph_compare_extra'});}
function record(level,sourcePath,targetPath,kind,message,sourceRecord,targetRecord){return {kind,level,path:sourcePath||targetPath,sourcePath,targetPath,message,sourceRefs:refs(sourceRecord),targetRefs:refs(targetRecord)};}
function rowFields(node){const evidence=node.evidence?.[0]?.rawByHeader||{};return {Bore:evidence.Bore??evidence.bore??node.fields?.Bore??'',pipe:evidence.pipe??evidence.Pipe??node.fields?.pipe??node.fields?.Pipe??'',Mandatory:evidence.Mandatory??node.fields?.Mandatory??'',DTXR:evidence.DTXR??node.fields?.DTXR??''};}
function refs(record){return [...new Set(record?.sourceRefs||record?.node?.sourceRefs||[])];}
function normalizeValue(value){return String(value??'').trim().toUpperCase().replace(/\s+/g,' ');}
function childrenMap(graph){const map=new Map();for(const edge of graph?.edges||[]){if(edge.edgeType&&edge.edgeType!=='owns')continue;if(!map.has(edge.fromNodeId))map.set(edge.fromNodeId,[]);map.get(edge.fromNodeId).push(edge.toNodeId);}return map;}
function childrenOf(childrenByParent,nodesById,parentId){return (childrenByParent.get(parentId)||[]).map((id)=>nodesById.get(id)).filter(Boolean);}
function diagnosticToFinding(d){if(d.kind==='missing')return `MISSING ${d.level}: ${d.path}. ${d.message}`;if(d.kind==='extra')return `EXTRA ${d.level}: ${d.path}. ${d.message}`;if(d.kind==='mismatch')return `MISMATCH ${d.field}: ${d.path}. Source=${d.sourceValue}; Target=${d.targetValue}.`;return d.message||'';}
function deepFreeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;}
