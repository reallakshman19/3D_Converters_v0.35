import { DEFAULT_COORDINATE_CLUSTER_CONTRACT } from './table-categorized-xml-coordinate-cluster.js';
import { PS_MAPPING_TABLE_2_SHADOW_PROFILE } from './table-categorized-xml-pilot-profiles.js';

export const TABLE_CATEGORIZED_XML_PROFILE_DESIGNER_SCHEMA='table-categorized-xml-profile-designer/v2-recipe-management';

export const LEVEL_TYPE_OPTIONS=Object.freeze(['container','partition','group','occurrence','feature','measure','attribute','evidence','diagnostic']);
export const CREATION_MODE_OPTIONS=Object.freeze(['static','zero-or-one','one-per-key','one-per-row','many-per-row','conditional','lookup-joined','coordinate-clustered']);

export function createBlankUniversalProfile(){
  return freezeProfile({
    schema:'UniversalCategorizerProfile.v1',profileId:'blank-universal-profile',displayName:'Blank Universal Profile',version:'1.0.0',presetType:'blank',
    requiredColumns:[],optionalColumns:[],duplicateKeyPolicy:'merge-sourceRefs',multiValuePolicy:'single-value',coordinateCluster:{...DEFAULT_COORDINATE_CLUSTER_CONTRACT},joins:[],rootPartitions:[],
    levelDefinitions:[level({levelId:'categorizedTableGraph',displayName:'CategorizedTableGraph',levelType:'container',creationMode:'static',key:'CategorizedTableGraph',documentRoot:true,children:[
      level({levelId:'rootPartition',displayName:'RootPartition',levelType:'partition',creationMode:'static',key:'MODEL_SIDE',xmlTag:'RootPartition'})
    ]})]
  });
}

export function createPsMappingTable2TemplateProfile(){return cloneProfile(PS_MAPPING_TABLE_2_SHADOW_PROFILE);}
export function cloneProfile(profile){return freezeProfile(clone(profile||createBlankUniversalProfile()));}

export function normalizeImportedProfile(rawProfile={}){
  const diagnostics=[];
  const raw=isPlainObject(rawProfile)?clone(rawProfile):{};
  if(!isPlainObject(rawProfile))diagnostics.push(message('ERROR','recipe_invalid_object','Recipe JSON must contain an object at the top level.'));
  const profile={...raw};
  if(!String(profile.schema||'').trim())profile.schema='UniversalCategorizerProfile.v1';
  if(!String(profile.profileId||'').trim()){
    profile.profileId=stableProfileId(profile.displayName||'imported-recipe');
    diagnostics.push(message('WARNING','recipe_profile_id_defaulted',`Recipe profileId was missing; using ${profile.profileId}.`));
  }
  if(!String(profile.displayName||'').trim()){
    profile.displayName=String(profile.profileId||'Imported Recipe');
    diagnostics.push(message('WARNING','recipe_display_name_defaulted',`Recipe displayName was missing; using ${profile.displayName}.`));
  }
  profile.profileId=String(profile.profileId).trim();
  profile.displayName=String(profile.displayName).trim();
  profile.requiredColumns=normalizeStringArray(profile.requiredColumns);
  profile.optionalColumns=normalizeStringArray(profile.optionalColumns);
  profile.rootPartitions=normalizeArray(profile.rootPartitions).map(clone);
  profile.joins=normalizeArray(profile.joins).map(clone);
  profile.levelDefinitions=normalizeArray(profile.levelDefinitions).map(normalizeLevel);
  if(!profile.levelDefinitions.length)diagnostics.push(message('WARNING','recipe_level_definitions_empty','Recipe has no graph levels yet.'));
  if(!profile.rootPartitions.length)diagnostics.push(message('INFO','recipe_root_partitions_empty','Recipe has no explicit root partitions; a later export can still use the single document root.'));
  if(profile.coordinateCluster!=null&&!isPlainObject(profile.coordinateCluster)){
    diagnostics.push(message('WARNING','recipe_coordinate_cluster_ignored','coordinateCluster must be an object when supplied.'));
    delete profile.coordinateCluster;
  }else if(profile.coordinateCluster!=null){
    profile.coordinateCluster=clone(profile.coordinateCluster);
  }
  return {ok:diagnostics.every((item)=>item.severity!=='ERROR'),profile:freezeProfile(profile),diagnostics,messages:diagnostics};
}

export function serializeProfileRecipe(profile){return `${stableStringify(normalizeImportedProfile(profile).profile)}\n`;}
export function parseProfileRecipeJson(jsonText){
  try{
    const raw=JSON.parse(String(jsonText||''));
    const normalized=normalizeImportedProfile(raw);
    return {ok:normalized.ok,profile:normalized.profile,diagnostics:normalized.diagnostics,messages:normalized.messages};
  }catch(error){
    const diagnostics=[message('ERROR','imported-invalid',`Recipe JSON import failed: ${error.message}`)];
    return {ok:false,profile:null,diagnostics,messages:diagnostics};
  }
}

export function recipeDisplaySummary(profile){
  const normalized=normalizeImportedProfile(profile).profile;
  const flat=flattenProfileLevels(normalized.levelDefinitions);
  return Object.freeze({
    profileId:normalized.profileId,
    displayName:normalized.displayName,
    version:normalized.version||'',
    presetType:normalized.presetType||normalized.profileType||presetTypeForProfile(normalized),
    levelDefinitionCount:normalized.levelDefinitions.length,
    flattenedLevelCount:flat.length,
    joinCount:normalized.joins.length,
    rootPartitionCount:normalized.rootPartitions.length,
    hasCoordinateGrouping:Boolean(normalized.coordinateCluster),
    coordinateGrouping:normalized.coordinateCluster?'yes':'no'
  });
}

export function profileManagementMessages(profile){
  const normalized=normalizeImportedProfile(profile);
  const messages=[...normalized.diagnostics];
  const summary=recipeDisplaySummary(normalized.profile);
  if(!summary.flattenedLevelCount)messages.push(message('WARNING','recipe_no_graph_levels','Recipe has no graph levels.'));
  if(!hasDocumentRoot(normalized.profile.levelDefinitions))messages.push(message('WARNING','recipe_no_document_root','Recipe has no document-root level yet.'));
  if(!messages.length)messages.push(message('INFO','recipe_ready','Recipe is ready for shadow-mode table-to-graph use.'));
  return Object.freeze(messages.map((item)=>Object.freeze({...item})));
}

export function createLevel({levelId,displayName='',levelType='group',creationMode='one-per-key',key='',keyResolver=null,displayNameResolver=null,fieldResolvers={},documentRoot=false,children=[]}={}){
  return level({levelId,displayName,levelType,creationMode,key,keyResolver,displayNameResolver,fieldResolvers,documentRoot,children});
}

export function updateProfileHeader(profile,patch={}){
  return freezeProfile({...clone(profile),...pick(patch,['profileId','displayName','version','presetType','requiredColumns','optionalColumns','duplicateKeyPolicy','multiValuePolicy','coordinateCluster','rootPartitions','joins'])});
}

export function updateLevelAtPath(profile,path=[],patch={}){
  const copy=clone(profile);
  copy.levelDefinitions=replaceAt(copy.levelDefinitions,path,(item)=>normalizeLevel({...item,...patch}));
  return freezeProfile(copy);
}

export function setChildrenNames(profile,path=[],names=[],options={}){
  const copy=clone(profile);
  copy.levelDefinitions=replaceAt(copy.levelDefinitions,path,(item)=>{
    const existing=Array.isArray(item.children)?item.children:[];
    const children=names.map((name,index)=>namedChildFromExisting(existing[index],name,index,options)).filter(Boolean);
    return normalizeLevel({...item,children});
  });
  return freezeProfile(copy);
}

export function addChildLevel(profile,path=[],child={}){
  const copy=clone(profile);
  copy.levelDefinitions=replaceAt(copy.levelDefinitions,path,(item)=>normalizeLevel({...item,children:[...(item.children||[]),normalizeLevel(child)]}));
  return freezeProfile(copy);
}

export function deleteLevelAtPath(profile,path=[]){
  if(path.length===0)return profile;
  const copy=clone(profile);
  const parentPath=path.slice(0,-1),index=path[path.length-1];
  copy.levelDefinitions=replaceAt(copy.levelDefinitions,parentPath,(item)=>normalizeLevel({...item,children:(item.children||[]).filter((_,i)=>i!==index)}));
  return freezeProfile(copy);
}

export function serializeProfile(profile){return JSON.stringify(freezeProfile(profile),null,2);}
export function parseProfileJson(text){return freezeProfile(JSON.parse(String(text||'{}')));}

export function columnResolver(column,op='trim'){return {op,column};}
export function literalResolver(value){return {op:'literal',value};}
export function regexResolver(column,pattern='(.*)',group=1,fallback='blank'){
  const base={op:'trim',column};
  const rex={op:'regexExtract',input:base,pattern,group:Number(group)||1,severity:fallback==='blank'?'WARNING':'INFO'};
  return fallback==='full value'?{op:'fallback',resolvers:[rex],defaultResolver:base}:rex;
}
export function concatResolver(parts=[]){return {op:'concat',parts};}
export function classifierResolver(column,dictionaryText=''){
  return {op:'classifier',column,dictionary:parseDictionary(dictionaryText)};
}
export function coordinateClusterResolver({x='X',y='Y',z='Z',unit='mm',tolerance=2,roundingPrecision=3}={}){
  return {op:'coordinateCluster',contract:{...DEFAULT_COORDINATE_CLUSTER_CONTRACT,unit,tolerance:Number(tolerance),roundingPrecision:Number(roundingPrecision),axisMapping:{x,y,z}}};
}

export function previewResolver(spec,row){
  if(!spec)return '';
  if(spec.op==='literal')return spec.value??'';
  if(spec.column)return row?.rawByHeader?.[spec.column]??'';
  if(spec.input)return previewResolver(spec.input,row);
  if(spec.op==='concat')return (spec.parts||[]).map((part)=>typeof part==='string'?part:previewResolver(part,row)).join(spec.separator??'');
  return '';
}

function namedChildFromExisting(existing,name,index,options){
  const value=String(name||'').trim();
  const placeholder=isUiPlaceholder(value);
  if(existing&&placeholder)return normalizeLevel(existing);
  if(existing)return normalizeLevel({...existing,displayName:value||existing.displayName||existing.levelId});
  if(!value||placeholder)return null;
  return createNamedChild(value,index,options);
}
function isUiPlaceholder(value){return /^(Parent|Child|GrandChild) \([xyzabc]\)$/i.test(String(value||''));}
function createNamedChild(name,index,options){
  const idBase=String(name).trim().replace(/[^A-Za-z0-9]+/g,' ').trim().replace(/\s+(.)/g,(_,c)=>c.toUpperCase()).replace(/^./,(c)=>c.toLowerCase())||`${options.idPrefix||'level'}${index+1}`;
  return normalizeLevel({levelId:idBase,displayName:name,levelType:options.levelType||'group',creationMode:options.creationMode||'one-per-key',keyResolver:{op:'trim',column:options.keyColumn||'PS NO'},displayNameResolver:{op:'trim',column:options.displayColumn||options.keyColumn||'PS NO'},children:[]});
}

function level(input){return normalizeLevel(input);}
function normalizeLevel(input={}){
  const base=isPlainObject(input)?clone(input):{};
  const out={...base,levelId:String(base.levelId||base.id||'level'),levelType:String(base.levelType||'group'),creationMode:String(base.creationMode||'one-per-key')};
  if(base.key!=null)out.key=String(base.key);
  if(base.displayName!=null)out.displayName=String(base.displayName);
  if(base.xmlTag!=null)out.xmlTag=String(base.xmlTag);
  if(base.documentRoot)out.documentRoot=true;
  if(base.keyResolver)out.keyResolver=clone(base.keyResolver);
  if(base.displayNameResolver)out.displayNameResolver=clone(base.displayNameResolver);
  if(base.fieldResolvers)out.fieldResolvers=clone(base.fieldResolvers);
  out.children=normalizeArray(base.children).map(normalizeLevel);
  return out;
}

function freezeProfile(profile){
  const input=isPlainObject(profile)?profile:{};
  const out={...input};
  out.schema=String(out.schema||'UniversalCategorizerProfile.v1');
  out.profileId=String(out.profileId||'blank-universal-profile');
  out.displayName=String(out.displayName||out.profileId||'Untitled Recipe');
  out.requiredColumns=normalizeStringArray(out.requiredColumns);
  out.optionalColumns=normalizeStringArray(out.optionalColumns);
  out.rootPartitions=normalizeArray(out.rootPartitions).map(clone);
  out.joins=normalizeArray(out.joins).map(clone);
  out.levelDefinitions=normalizeArray(out.levelDefinitions).map(normalizeLevel);
  if(out.coordinateCluster!=null&&isPlainObject(out.coordinateCluster))out.coordinateCluster=clone(out.coordinateCluster);
  return deepFreeze(out);
}
function replaceAt(items,path,mapper){
  if(path.length===0)return items.map((item,index)=>index===0?mapper(item):item);
  const [head,...rest]=path;
  return items.map((item,index)=>index!==head?item:normalizeLevel({...item,children:replaceAt(item.children||[],rest,mapper)}));
}
function parseDictionary(text){return Object.fromEntries(String(text||'').split(/\r?\n/).map((line)=>line.split('=')).filter((p)=>p[0]).map(([k,v])=>[k.trim().toUpperCase(),String(v??'').trim()]));}
function pick(obj,keys){return Object.fromEntries(keys.filter((key)=>key in obj).map((key)=>[key,obj[key]]));}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function deepFreeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;}
function isPlainObject(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function normalizeArray(value){return Array.isArray(value)?value:[];}
function normalizeStringArray(value){return normalizeArray(value).map((item)=>String(item));}
function message(severity,code,messageText,ref=''){return Object.freeze({severity,code,message:messageText,ref});}
function stableProfileId(value){return String(value||'recipe').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'imported-recipe';}
function presetTypeForProfile(profile){if(profile.profileId==='blank-universal-profile')return 'blank';if(String(profile.profileId||'').includes('ps-mapping'))return 'built-in preset';return 'custom';}
function flattenProfileLevels(levelDefinitions=[]){return normalizeArray(levelDefinitions).flatMap((level)=>[level,...flattenProfileLevels(level.children||[])]);}
function hasDocumentRoot(levelDefinitions=[]){return flattenProfileLevels(levelDefinitions).some((level)=>level.documentRoot);}
function stableStringify(value){return JSON.stringify(sortForJson(value),null,2);}
function sortForJson(value){if(Array.isArray(value))return value.map(sortForJson);if(value&&typeof value==='object'){return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,sortForJson(value[key])]));}return value;}
