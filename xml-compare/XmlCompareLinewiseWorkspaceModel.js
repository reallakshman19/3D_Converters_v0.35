export const XML_COMPARE_LINEWISE_WORKSPACE_MODEL_SCHEMA='xml-compare-linewise-workspace-model/v2';

const clean=(value)=>String(value??'').trim();
const num=(value)=>{const n=Number(clean(value));return Number.isFinite(n)?n:null;};
const SENTINEL=-1.0101;
const ELEMENT_END_RE=/<\/?(?:RESTRAINT|DISPLACEMENTS|FORCESMOMENTS|ALLOWABLESTRESS|PIPINGMODEL|CAESARII)\b/i;
const CHILD_TAGS=Object.freeze(['BEND','SIF','RIGID','FLANGES']);
const NODE_TAGS=Object.freeze(['RESTRAINT','DISPLACEMENTS','FORCESMOMENTS']);
const BLOCK_HINTS=Object.freeze(['NameBlock','RouteGeometryBlock','SectionDimensionBlock','DerivedBlock','DerivedCoordinateBlock','BendBlock','SifBlock','RigidBlock','FlangeBlock','RestraintsBlock','DisplacementBlock','ForceMomentBlock','MiscBlock','OriginalElement']);
const LINE_BLOCK_HINTS=Object.freeze(['LineBlocks','ProcessBlock','MaterialBlock','AllowableStressBlock']);

function attrsOf(tag=''){
  const out={};
  String(tag).replace(/([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g,(_,key,_q,dq,sq)=>{out[key]=dq??sq??'';return _;});
  return out;
}
function normalizeNode(value){const text=clean(value);const n=Number(text);return Number.isFinite(n)&&Math.abs(n-Math.round(n))<1e-6?String(Math.round(n)):text.replace(/\.0+$/,'');}
function isUnset(value){const n=num(value);return !clean(value)||(n!=null&&Math.abs(n-SENTINEL)<1e-4);}
function lineId(attrs={}){return clean(attrs.LINE_ID||attrs.LineId||attrs['PIPELINE-REFERENCE']||attrs.PipelineReference||attrs.lineId||'UNSPECIFIED_LINE');}
function elementKey(attrs={}){return `${normalizeNode(attrs.FROM_NODE||attrs.fromNode)}->${normalizeNode(attrs.TO_NODE||attrs.toNode)}`;}
function splitLooseBlocks(xml='',tagName=''){
  const matches=[];
  const re=new RegExp(`<${tagName}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tagName}>)`,'gi');
  let match;while((match=re.exec(String(xml))))matches.push(match[0]);
  return matches;
}
function firstOpenTag(xml=''){return String(xml).match(/^<PIPINGELEMENT\b[^>]*>/i)?.[0]||'';}
function splitPipingElements(xml=''){
  const text=String(xml??''),starts=[];
  const re=/<PIPINGELEMENT\b[^>]*>/gi;
  let match;while((match=re.exec(text)))starts.push(match.index);
  const elements=[];
  for(let i=0;i<starts.length;i+=1){
    const start=starts[i],end=starts[i+1]??text.length;
    let chunk=text.slice(start,end).trim();
    const closeIndex=chunk.search(/<\/PIPINGELEMENT>/i);
    if(closeIndex>=0)chunk=chunk.slice(0,closeIndex+'</PIPINGELEMENT>'.length).trim();
    else{
      const open=firstOpenTag(chunk),rest=chunk.slice(open.length),external=rest.search(ELEMENT_END_RE);
      if(external>=0)chunk=(open+rest.slice(0,external)).trim();
    }
    if(chunk)elements.push(chunk);
  }
  return elements;
}
function childBlockCounts(elementXml=''){
  const out={};
  for(const tag of CHILD_TAGS){const count=splitLooseBlocks(elementXml,tag).length;if(count)out[tag]=count;}
  return out;
}
function activeNodeBlocks(xml=''){
  const out=[];
  for(const tag of NODE_TAGS){for(const block of splitLooseBlocks(xml,tag)){const attrs=attrsOf(block),node=normalizeNode(tag==='RESTRAINT'?attrs.NODE:attrs.NODE_NUM);if(!isUnset(node))out.push({tag,node,block});}}
  return out;
}
function elementLength(attrs={}){const dx=isUnset(attrs.DELTA_X)?0:num(attrs.DELTA_X),dy=isUnset(attrs.DELTA_Y)?0:num(attrs.DELTA_Y),dz=isUnset(attrs.DELTA_Z)?0:num(attrs.DELTA_Z);if([dx,dy,dz].every((v)=>v==null))return '';const value=Math.sqrt((dx||0)*(dx||0)+(dy||0)*(dy||0)+(dz||0)*(dz||0));return Number.isFinite(value)&&value>0?value.toFixed(3):'';}
function derivePipingClass(attrs={},line=''){const direct=clean(attrs.PipingClass||attrs.PIPING_CLASS||attrs.PIPINGCLASS);if(direct)return direct;const text=clean(line||attrs.LINE_ID||'').replace(/^\/+/, '').replace(/\/B\d+$/i,'');const parts=text.split('-').filter(Boolean);return parts.find((part)=>/[A-Z]{1,}\d{2,}|\d{3,}[A-Z]/i.test(part))||'';}
function deriveRating(attrs={},pipingClass=''){const direct=clean(attrs.Rating||attrs.RATING||attrs.CLASS_GRADE||'');if(direct)return direct;const hit=clean(pipingClass).match(/(?:CL|CLASS|RATING)?\s*([0-9]{2,4})/i);return hit?.[1]||'';}
function deriveBore(attrs={},line=''){const direct=clean(attrs.BoreMm||attrs.BORE_MM||'');if(direct)return direct;const text=clean(line||attrs.LINE_ID||'');const quoted=text.match(/(\d+(?:\.\d+)?)\s*"/);if(quoted){const n=Number(quoted[1]);return Number.isFinite(n)?(n*25.4).toFixed(3):'';}const size=text.match(/(?:^|[-_/])(\d+(?:\.\d+)?)(?:[-_/]|$)/);return size?.[1]||'';}
function deriveMaterial(attrs={}){return clean(attrs.MaterialName||attrs.MATERIAL_NAME||attrs.MATERIAL||'');}
function derivedFacts(attrs={},line=''){
  const pipingClass=derivePipingClass(attrs,line),rating=deriveRating(attrs,pipingClass),boreMm=deriveBore(attrs,line),length=elementLength(attrs),materialName=deriveMaterial(attrs),out={};
  if(pipingClass)out.PipingClass={value:pipingClass,source:attrs.PipingClass||attrs.PIPING_CLASS?'existing-field':'line-token'};
  if(rating)out.Rating={value:rating,source:attrs.Rating||attrs.RATING?'existing-field':'piping-class'};
  if(boreMm)out.BoreMm={value:boreMm,source:attrs.BoreMm||attrs.BORE_MM?'existing-field':'line-size-token'};
  if(length)out.ElementLengthMm={value:length,source:'delta-vector'};
  if(materialName)out.MaterialName={value:materialName,source:'existing-field'};
  return out;
}
function lineBlockNamesForInputElement(attrs={}){
  const names=[];
  if(['TEMP_EXP_C1','PRESSURE1','HYDRO_PRESSURE','FLUID_DENSITY','INSUL_DENSITY'].some((key)=>!isUnset(attrs[key])))names.push('ProcessBlock');
  if(['MATERIAL_NUM','MATERIAL_NAME','CORR_ALLOW','MODULUS','PIPE_DENSITY'].some((key)=>!isUnset(attrs[key])))names.push('MaterialBlock');
  return names;
}
function blockNamesForInputElement(elementXml='',attrs={},nodeBlocks=[]){
  const names=[];
  if(['FROM_NAME','TO_NAME','LINE_ID','NAME'].some((key)=>clean(attrs[key])))names.push('NameBlock');
  if(['DELTA_X','DELTA_Y','DELTA_Z'].some((key)=>!isUnset(attrs[key])))names.push('RouteGeometryBlock');
  if(['DIAMETER','WALL_THICK','INSUL_THICK'].some((key)=>!isUnset(attrs[key])))names.push('SectionDimensionBlock');
  if(['FROM_GLOBAL_X','TO_GLOBAL_X','FROM_GLOBAL_Z','TO_GLOBAL_Z'].some((key)=>!isUnset(attrs[key])))names.push('DerivedCoordinateBlock');
  const childCounts=childBlockCounts(elementXml);
  if(childCounts.BEND)names.push('BendBlock');
  if(childCounts.SIF)names.push('SifBlock');
  if(childCounts.RIGID)names.push('RigidBlock');
  if(childCounts.FLANGES)names.push('FlangeBlock');
  if(nodeBlocks.some((item)=>item.tag==='RESTRAINT'))names.push('RestraintsBlock');
  if(nodeBlocks.some((item)=>item.tag==='DISPLACEMENTS'))names.push('DisplacementBlock');
  if(nodeBlocks.some((item)=>item.tag==='FORCESMOMENTS'))names.push('ForceMomentBlock');
  if(Object.keys(derivedFacts(attrs,lineId(attrs))).length)names.push('DerivedBlock');
  names.push('OriginalElement');
  return [...new Set(names)];
}
function buildInputModel(text='',fileName=''){
  const external=activeNodeBlocks(text),byNode=new Map(),lineMap=new Map(),elements=splitPipingElements(text);
  for(const item of external){if(!byNode.has(item.node))byNode.set(item.node,[]);byNode.get(item.node).push(item);}
  for(const [index,elementXml] of elements.entries()){
    const attrs=attrsOf(firstOpenTag(elementXml));
    const from=normalizeNode(attrs.FROM_NODE),to=normalizeNode(attrs.TO_NODE),line=lineId(attrs),key=elementKey(attrs),attached=[...(byNode.get(from)||[]),...(byNode.get(to)||[])];
    if(!lineMap.has(line))lineMap.set(line,{lineId:line,lineBlockNames:[],elements:[]});
    const lineEntry=lineMap.get(line);
    lineEntry.lineBlockNames=[...new Set([...lineEntry.lineBlockNames,...lineBlockNamesForInputElement(attrs)])];
    const facts=derivedFacts(attrs,line);
    lineEntry.elements.push({index,fromNode:from,toNode:to,elementKey:key,lineId:line,attrs,childCounts:childBlockCounts(elementXml),nodeBlockCounts:attached.reduce((acc,item)=>{acc[item.tag]=(acc[item.tag]||0)+1;return acc;},{}),blockNames:blockNamesForInputElement(elementXml,attrs,attached),derivedFacts:facts,originalElement:elementXml});
  }
  const lines=[...lineMap.values()];
  return {schema:XML_COMPARE_LINEWISE_WORKSPACE_MODEL_SCHEMA,format:'InputXML',fileName:fileName||'',lineCount:lines.length,elementCount:elements.length,nodeBlockCount:external.length,lines};
}
function blockNamesForCategorizedElement(xml=''){return BLOCK_HINTS.filter((name)=>new RegExp(`<${name}\\b`,'i').test(xml));}
function lineBlockNamesForCategorizedLine(xml=''){return LINE_BLOCK_HINTS.filter((name)=>new RegExp(`<${name}\\b`,'i').test(xml));}
function textBetween(xml='',tag=''){return String(xml).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1]?.trim()||'';}
function buildCategorizedModel(text='',fileName=''){
  const lineMatches=[...String(text).matchAll(/<Line\b([^>]*)>([\s\S]*?)<\/Line>/gi)],lines=[];
  for(const lineMatch of lineMatches){
    const lineAttrs=attrsOf(`<Line ${lineMatch[1]}>`),lineIdValue=clean(lineAttrs.id||lineAttrs.lineId||`LINE_${lines.length+1}`),elements=[],lineBlockNames=lineBlockNamesForCategorizedLine(lineMatch[2]);
    const elementMatches=[...lineMatch[2].matchAll(/<Element\b([^>]*)>([\s\S]*?)<\/Element>/gi)];
    for(const [index,match] of elementMatches.entries()){
      const attrs=attrsOf(`<Element ${match[1]}>`),body=match[2],facts={},derived=textBetween(body,'DerivedBlock');
      for(const field of ['PipingClass','Rating','BoreMm','ElementLengthMm','MaterialName']){const value=textBetween(derived,field);if(value)facts[field]={value,source:'categorized'};}
      elements.push({index,fromNode:normalizeNode(attrs.fromNode),toNode:normalizeNode(attrs.toNode),elementKey:clean(attrs.elementKey)||`${normalizeNode(attrs.fromNode)}->${normalizeNode(attrs.toNode)}`,lineId:lineIdValue,attrs,childCounts:{},nodeBlockCounts:{},blockNames:blockNamesForCategorizedElement(body),derivedFacts:facts,originalElement:textBetween(body,'OriginalElement')});
    }
    lines.push({lineId:lineIdValue,lineBlockNames,elements});
  }
  return {schema:XML_COMPARE_LINEWISE_WORKSPACE_MODEL_SCHEMA,format:'CategorizedInputXML',fileName:fileName||'',lineCount:lines.length,elementCount:lines.reduce((sum,line)=>sum+line.elements.length,0),nodeBlockCount:0,lines};
}
export function detectXmlCompareLinewiseFormat(text=''){
  if(/<CategorizedInputXML\b/i.test(String(text)))return 'CategorizedInputXML';
  if(/<PIPINGELEMENT\b/i.test(String(text)))return 'InputXML';
  return 'UnknownXML';
}
export function buildXmlCompareLinewiseWorkspaceModel(text='',fileName=''){
  const format=detectXmlCompareLinewiseFormat(text);
  if(format==='CategorizedInputXML')return buildCategorizedModel(text,fileName);
  if(format==='InputXML')return buildInputModel(text,fileName);
  return {schema:XML_COMPARE_LINEWISE_WORKSPACE_MODEL_SCHEMA,format,lineCount:0,elementCount:0,nodeBlockCount:0,fileName:fileName||'',lines:[]};
}
export function selectedLine(model=null,lineIndex=0){return model?.lines?.[Math.max(0,Number(lineIndex)||0)]||model?.lines?.[0]||null;}
export function selectedElement(line=null,elementIndex=0){return line?.elements?.[Math.max(0,Number(elementIndex)||0)]||line?.elements?.[0]||null;}
export const _test=Object.freeze({attrsOf,splitPipingElements,detectXmlCompareLinewiseFormat,buildXmlCompareLinewiseWorkspaceModel,derivePipingClass,deriveBore,elementLength,lineBlockNamesForInputElement});
