export const XML_COMPARE_OWNERSHIP_INDEX_SCHEMA='xml-compare-ownership-index/v1';

const clean=(value)=>String(value??'').trim();
const num=(value)=>{const n=Number(clean(value));return Number.isFinite(n)?n:null;};
const SENTINEL=-1.0101;
const EXTERNAL_START_RE=/<\/?(?:RESTRAINT|DISPLACEMENTS|FORCESMOMENTS|ALLOWABLESTRESS|PIPINGMODEL|CAESARII)\b/i;
const NODE_BLOCK_TAGS=Object.freeze(['RESTRAINT','DISPLACEMENTS','FORCESMOMENTS']);
const ELEMENT_CHILD_TAGS=Object.freeze(['BEND','SIF','RIGID','FLANGES']);

const LINE_BLOCK_FIELDS=Object.freeze({
  ProcessBlock:['TEMP_EXP_C1','TEMP_EXP_C2','TEMP_EXP_C3','TEMP_EXP_C4','TEMP_EXP_C5','TEMP_EXP_C6','TEMP_EXP_C7','TEMP_EXP_C8','TEMP_EXP_C9','PRESSURE1','PRESSURE2','PRESSURE3','PRESSURE4','PRESSURE5','PRESSURE6','PRESSURE7','PRESSURE8','PRESSURE9','HYDRO_PRESSURE','INSUL_DENSITY','FLUID_DENSITY','REFRACTORY_DENSITY','REFRACTORY_THK','CLADDING_DEN','CLADDING_THK','INSUL_CLAD_UNIT_WEIGHT','INSUL_CLAD_UNIT_WEIGH'],
  MaterialBlock:['MATERIAL_NUM','MATERIAL_NAME','CORR_ALLOW','MODULUS','HOT_MOD1','HOT_MOD2','HOT_MOD3','HOT_MOD4','HOT_MOD5','HOT_MOD6','HOT_MOD7','HOT_MOD8','HOT_MOD9','POISSONS','PIPE_DENSITY','MILL_TOL_PLUS','MILL_TOL_MINUS','SEAM_WELD']
});

const ELEMENT_BLOCK_FIELDS=Object.freeze({
  RouteGeometryBlock:['DELTA_X','DELTA_Y','DELTA_Z'],
  SectionDimensionBlock:['DIAMETER','WALL_THICK','INSUL_THICK']
});

const NODE_COORD_FIELDS=Object.freeze({
  from:['FROM_GLOBAL_X','FROM_GLOBAL_Y','FROM_GLOBAL_Z','FROM_NAME'],
  to:['TO_GLOBAL_X','TO_GLOBAL_Y','TO_GLOBAL_Z','TO_NAME']
});

function attrsOf(tag=''){
  const out={};
  String(tag).replace(/([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g,(_,key,_q,dq,sq)=>{out[key]=dq??sq??'';return _;});
  return out;
}
function normalizeNode(value){const raw=clean(value);const n=Number(raw);return Number.isFinite(n)&&Math.abs(n-Math.round(n))<1e-6?String(Math.round(n)):raw.replace(/\.0+$/,'');}
function isUnset(value,{zeroUnset=false}={}){const text=clean(value);if(!text)return true;const n=num(text);if(n==null)return false;if(Math.abs(n-SENTINEL)<1e-4)return true;if(zeroUnset&&Math.abs(n)<1e-9)return true;return false;}
function firstOpenTag(xml=''){return String(xml).match(/^<PIPINGELEMENT\b[^>]*>/i)?.[0]||'';}
function lineId(attrs={}){return clean(attrs.LINE_ID||attrs['PIPELINE-REFERENCE']||attrs.PipelineReference||attrs.LineId||'UNSPECIFIED_LINE');}
function elementKey(fromNode='',toNode=''){return `${normalizeNode(fromNode)}->${normalizeNode(toNode)}`;}
function hasMeaningfulField(attrs={},fields=[]){return fields.some((field)=>attrs[field]!=null&&!isUnset(attrs[field]));}
function fieldSubset(attrs={},fields=[]){const out={};for(const field of fields)if(attrs[field]!=null&&!isUnset(attrs[field]))out[field]=attrs[field];return out;}
function splitLooseBlocks(xml='',tagName=''){
  const matches=[];
  const re=new RegExp(`<${tagName}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tagName}>)`,'gi');
  let match;while((match=re.exec(String(xml))))matches.push(match[0]);
  return matches;
}
function splitPipingElements(xml=''){
  const text=String(xml??''),starts=[];
  const re=/<PIPINGELEMENT\b[^>]*>/gi;
  let match;while((match=re.exec(text)))starts.push(match.index);
  const elements=[];
  for(let index=0;index<starts.length;index+=1){
    const start=starts[index],end=starts[index+1]??text.length;
    let chunk=text.slice(start,end).trim();
    const closeIndex=chunk.search(/<\/PIPINGELEMENT>/i);
    if(closeIndex>=0)chunk=chunk.slice(0,closeIndex+'</PIPINGELEMENT>'.length).trim();
    else{
      const open=firstOpenTag(chunk),rest=chunk.slice(open.length),external=rest.search(EXTERNAL_START_RE);
      if(external>=0)chunk=(open+rest.slice(0,external)).trim();
    }
    if(chunk)elements.push(chunk);
  }
  return elements;
}
function nodeBlockNode(block='',tag=''){
  const attrs=attrsOf(block);
  return normalizeNode(tag==='RESTRAINT'?attrs.NODE:attrs.NODE_NUM);
}
function meaningfulNodeBlock(block='',tag=''){
  const node=nodeBlockNode(block,tag);
  if(isUnset(node))return false;
  const attrs=attrsOf(block);
  return Object.entries(attrs).some(([key,value])=>!['NUM','NUMBER','DISP_NUM','FORCMNT_NUM','NODE','NODE_NUM','CNODE'].includes(key)&&!isUnset(value));
}
function getOrCreateLine(index,lineIdValue){
  if(!index.lines[lineIdValue])index.lines[lineIdValue]={lineId:lineIdValue,lineBlocks:{},elements:{},nodes:{}};
  return index.lines[lineIdValue];
}
function getOrCreateNode(index,line,nodeNumber){
  const key=normalizeNode(nodeNumber);
  if(!index.nodes[key])index.nodes[key]={nodeNumber:key,nodeBlocks:{},connectedElements:[]};
  if(!line.nodes[key])line.nodes[key]=index.nodes[key];
  return index.nodes[key];
}
function addLineBlock(line,blockName,value){
  if(!value)return;
  if(!line.lineBlocks[blockName])line.lineBlocks[blockName]=[];
  line.lineBlocks[blockName].push(value);
}
function addNodeBlock(node,blockName,value){
  if(!value)return;
  if(!node.nodeBlocks[blockName])node.nodeBlocks[blockName]=[];
  node.nodeBlocks[blockName].push(value);
}
function elementChildBlocks(elementXml=''){
  const out={};
  for(const tag of ELEMENT_CHILD_TAGS){const blocks=splitLooseBlocks(elementXml,tag);if(blocks.length)out[`${tag[0]}${tag.slice(1).toLowerCase()}Block`]=blocks;}
  return out;
}
function lineBlocksFromElementAttrs(attrs={}){
  const out={};
  for(const [blockName,fields] of Object.entries(LINE_BLOCK_FIELDS)){
    if(hasMeaningfulField(attrs,fields))out[blockName]=fieldSubset(attrs,fields);
  }
  return out;
}
function elementBlocksFromAttrs(attrs={}){
  const out={};
  for(const [blockName,fields] of Object.entries(ELEMENT_BLOCK_FIELDS)){
    if(hasMeaningfulField(attrs,fields))out[blockName]=fieldSubset(attrs,fields);
  }
  return out;
}
function applyNodeEndpointAttrs(node,attrs={},side='from'){
  const fields=NODE_COORD_FIELDS[side]||[];
  const coordFields=fieldSubset(attrs,fields);
  if(Object.keys(coordFields).length)addNodeBlock(node,side==='from'?'FromNodeFacts':'ToNodeFacts',coordFields);
}
function attachExternalNodeBlocks(index,xmlText=''){
  for(const tag of NODE_BLOCK_TAGS){
    for(const block of splitLooseBlocks(xmlText,tag)){
      if(!meaningfulNodeBlock(block,tag))continue;
      const nodeNumber=nodeBlockNode(block,tag);
      const node=getOrCreateNode(index,{nodes:{}},nodeNumber);
      addNodeBlock(node,tag==='RESTRAINT'?'RestraintBlock':tag==='DISPLACEMENTS'?'DisplacementBlock':'ForceMomentBlock',block);
    }
  }
}
function attachAllowables(index,xmlText=''){
  const blocks=splitLooseBlocks(xmlText,'ALLOWABLESTRESS').filter((block)=>Object.values(attrsOf(block)).some((value)=>!isUnset(value,{zeroUnset:true})));
  if(!blocks.length)return;
  const lines=Object.values(index.lines);
  const target=lines[0]||getOrCreateLine(index,'UNSPECIFIED_LINE');
  for(const block of blocks)addLineBlock(target,'AllowableStressBlock',block);
}
export function createXmlCompareOwnershipIndex(xmlText='',{sourceName='InputXML'}={}){
  const index={schema:XML_COMPARE_OWNERSHIP_INDEX_SCHEMA,sourceName,lines:{},elements:{},nodes:{},links:{elementToLine:{},elementToNodes:{},nodeToElements:{}}};
  const elements=splitPipingElements(xmlText);
  for(const [order,elementXml] of elements.entries()){
    const attrs=attrsOf(firstOpenTag(elementXml));
    const fromNode=normalizeNode(attrs.FROM_NODE),toNode=normalizeNode(attrs.TO_NODE),lineIdValue=lineId(attrs),key=elementKey(fromNode,toNode);
    const line=getOrCreateLine(index,lineIdValue);
    const from=getOrCreateNode(index,line,fromNode),to=getOrCreateNode(index,line,toNode);
    applyNodeEndpointAttrs(from,attrs,'from');
    applyNodeEndpointAttrs(to,attrs,'to');
    const lineBlocks=lineBlocksFromElementAttrs(attrs);
    for(const [blockName,value] of Object.entries(lineBlocks))addLineBlock(line,blockName,value);
    const element={elementKey:key,fromNode,toNode,lineId:lineIdValue,order,elementBlocks:{...elementBlocksFromAttrs(attrs),...elementChildBlocks(elementXml)},originalElement:elementXml};
    line.elements[key]=element;
    index.elements[key]=element;
    index.links.elementToLine[key]=lineIdValue;
    index.links.elementToNodes[key]=[fromNode,toNode];
    for(const nodeNumber of [fromNode,toNode]){
      if(!index.links.nodeToElements[nodeNumber])index.links.nodeToElements[nodeNumber]=[];
      index.links.nodeToElements[nodeNumber].push(key);
      if(!index.nodes[nodeNumber].connectedElements.includes(key))index.nodes[nodeNumber].connectedElements.push(key);
    }
  }
  attachExternalNodeBlocks(index,xmlText);
  attachAllowables(index,xmlText);
  return index;
}
export const _test=Object.freeze({attrsOf,isUnset,splitPipingElements,lineBlocksFromElementAttrs,elementBlocksFromAttrs,createXmlCompareOwnershipIndex});
