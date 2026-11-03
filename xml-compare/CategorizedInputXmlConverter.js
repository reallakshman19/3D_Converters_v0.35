import { solveElementCoordinates } from './XmlCompareCoordinateSideload.js';

export const CATEGORIZED_INPUTXML_CONVERTER_SCHEMA='categorized-inputxml-converter/v7';

const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const clean=(value)=>String(value??'').trim();
const normalizeNode=(value)=>{const raw=clean(value);const n=Number(raw);return Number.isFinite(n)&&Math.abs(n-Math.round(n))<1e-6?String(Math.round(n)):raw.replace(/\.0+$/,'');};
const SENTINEL=-1.0101;

const BLOCK_FIELDS=Object.freeze({
  NameBlock:['FROM_NAME','TO_NAME','LINE_ID','NAME'],
  RouteGeometryBlock:['DELTA_X','DELTA_Y','DELTA_Z'],
  SectionDimensionBlock:['DIAMETER','WALL_THICK','INSUL_THICK'],
  ProcessBlock:['TEMP_EXP_C1','TEMP_EXP_C2','TEMP_EXP_C3','TEMP_EXP_C4','TEMP_EXP_C5','TEMP_EXP_C6','TEMP_EXP_C7','TEMP_EXP_C8','TEMP_EXP_C9','PRESSURE1','PRESSURE2','PRESSURE3','PRESSURE4','PRESSURE5','PRESSURE6','PRESSURE7','PRESSURE8','PRESSURE9','HYDRO_PRESSURE','INSUL_DENSITY','FLUID_DENSITY','REFRACTORY_DENSITY','REFRACTORY_THK','CLADDING_DEN','CLADDING_THK','INSUL_CLAD_UNIT_WEIGHT','INSUL_CLAD_UNIT_WEIGH'],
  TemperatureBlock:['TEMP_EXP_C1','TEMP_EXP_C2','TEMP_EXP_C3','TEMP_EXP_C4','TEMP_EXP_C5','TEMP_EXP_C6','TEMP_EXP_C7','TEMP_EXP_C8','TEMP_EXP_C9'],
  MaterialBlock:['MATERIAL_NUM','MATERIAL_NAME','CORR_ALLOW','MODULUS','HOT_MOD1','HOT_MOD2','HOT_MOD3','HOT_MOD4','HOT_MOD5','HOT_MOD6','HOT_MOD7','HOT_MOD8','HOT_MOD9','POISSONS','PIPE_DENSITY','MILL_TOL_PLUS','MILL_TOL_MINUS','SEAM_WELD'],
  FromCoordinateBlock:['FROM_GLOBAL_X','FROM_GLOBAL_Y','FROM_GLOBAL_Z','GLOBAL_COORD_BASIS_NODE'],
  ToCoordinateBlock:['TO_GLOBAL_X','TO_GLOBAL_Y','TO_GLOBAL_Z','GLOBAL_COORD_BASIS_NODE']
});
const CHILD_BLOCKS=Object.freeze({BEND:'BendBlock',RIGID:'RigidBlock',FLANGES:'FlangeBlock'});
const NODE_BLOCKS=Object.freeze({RESTRAINT:'RestraintsBlock',DISPLACEMENTS:'DisplacementsBlock',FORCESMOMENTS:'ForcesMomentsBlock'});
const BRANCH_BLOCKS=Object.freeze({ALLOWABLESTRESS:'AllowableStressBlock'});
const CONTROL_ATTRS=new Set(['NUM','NUMBER','SIF_NUM','DISP_NUM','FORCMNT_NUM','NODE','NODE_NUM','NODE1','NODE2','NODE3','CNODE']);
const EXTERNAL_START_RE=/<\/?(?:RESTRAINT|DISPLACEMENTS|FORCESMOMENTS|ALLOWABLESTRESS|PIPINGMODEL|CAESARII)\b/i;

function attrsOf(tag=''){
  const out={};
  String(tag).replace(/([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g,(_,key,_q,dq,sq)=>{out[key]=dq??sq??'';return _;});
  return out;
}
function openName(tag=''){return clean(tag).match(/^<\/?\s*([A-Za-z_][\w:.-]*)/)?.[1]||'';}
function num(value){const n=Number(clean(value));return Number.isFinite(n)?n:null;}
function isUnset(value,{zeroUnset=false}={}){const text=clean(value);if(!text)return true;const n=num(text);if(n==null)return false;if(Math.abs(n-SENTINEL)<1e-4)return true;if(zeroUnset&&Math.abs(n)<1e-9)return true;return false;}
function hasMeaningfulAttrs(xml='',{zeroUnset=false,ignoreControls=true}={}){for(const [key,value] of Object.entries(attrsOf(xml))){if(ignoreControls&&CONTROL_ATTRS.has(key))continue;if(!isUnset(value,{zeroUnset}))return true;}return false;}
function hasMeaningfulDescendantAttrs(xml='',options={}){if(hasMeaningfulAttrs(xml,options))return true;const tagRe=/<[A-Za-z_][\w:.-]*\b[^>]*>/g;let match;while((match=tagRe.exec(String(xml))))if(hasMeaningfulAttrs(match[0],options))return true;return false;}
function activeChildBlock(xml=''){return hasMeaningfulDescendantAttrs(xml);}
function activeSifBlock(xml=''){if(openName(xml)!=='SIF'||isUnset(attrsOf(xml).NODE))return false;return hasMeaningfulDescendantAttrs(xml);}
function activeNodeBlock(xml=''){const tag=openName(xml),attrs=attrsOf(xml),node=tag==='RESTRAINT'?attrs.NODE:attrs.NODE_NUM;if(isUnset(node))return false;return hasMeaningfulDescendantAttrs(xml);}
function activeBranchBlock(xml=''){return hasMeaningfulDescendantAttrs(xml,{zeroUnset:true});}
function elementKey(attrs={}){return `${normalizeNode(attrs.FROM_NODE)}->${normalizeNode(attrs.TO_NODE)}`;}
function lineId(attrs={}){return clean(attrs.LINE_ID||attrs['PIPELINE-REFERENCE']||'UNSPECIFIED_LINE');}
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
      const open=firstOpenTag(chunk),rest=chunk.slice(open.length),external=rest.search(EXTERNAL_START_RE);
      if(external>=0)chunk=(open+rest.slice(0,external)).trim();
    }
    if(chunk)elements.push(chunk);
  }
  return elements;
}
function splitLooseBlocks(xml='',tagName=''){
  const matches=[];
  const re=new RegExp(`<${tagName}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tagName}>)`,'gi');
  let match;while((match=re.exec(String(xml))))matches.push(match[0]);
  return matches;
}
function elementBody(elementXml=''){return elementXml.replace(/^<PIPINGELEMENT\b[^>]*>/i,'').replace(/<\/PIPINGELEMENT>\s*$/i,'');}
function childrenOfElement(elementXml=''){
  const body=elementBody(elementXml),children=[];
  for(const tagName of Object.keys(CHILD_BLOCKS))children.push(...splitLooseBlocks(body,tagName).filter(activeChildBlock));
  return children;
}
function sifBlocksOfElement(elementXml=''){return splitLooseBlocks(elementBody(elementXml),'SIF').filter(activeSifBlock);}
function nodeBlockKey(xml='',tag=''){
  const attrs=attrsOf(xml);
  if(tag==='RESTRAINT')return normalizeNode(attrs.NODE);
  if(tag==='SIF')return normalizeNode(attrs.NODE);
  return normalizeNode(attrs.NODE_NUM);
}
function nodeBlocks(xml=''){
  const map=new Map();
  for(const tagName of Object.keys(NODE_BLOCKS)){
    for(const block of splitLooseBlocks(xml,tagName).filter(activeNodeBlock)){
      const key=nodeBlockKey(block,tagName);if(!key||isUnset(key))continue;
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(block);
    }
  }
  return map;
}
function branchBlocks(xml=''){
  const groups={};
  for(const [tag,blockName] of Object.entries(BRANCH_BLOCKS)){
    const blocks=splitLooseBlocks(xml,tag).filter(activeBranchBlock);
    if(blocks.length)groups[blockName]=blocks;
  }
  return groups;
}
function blockXml(blockName='',attrs={},used=new Set()){
  const keys=BLOCK_FIELDS[blockName]||[],rows=[];
  for(const key of keys){if(attrs[key]==null||clean(attrs[key])==='')continue;used.add(key);if(!isUnset(attrs[key]))rows.push(`      <${key}>${esc(attrs[key])}</${key}>`);}
  return rows.length?`    <${blockName}>\n${rows.join('\n')}\n    </${blockName}>`:'';
}
function fieldRows(blockName='',attrs={},indent='      '){
  const rows=[];
  for(const key of BLOCK_FIELDS[blockName]||[]){if(attrs[key]!=null&&clean(attrs[key])!==''&&!isUnset(attrs[key]))rows.push(`${indent}<${key}>${esc(attrs[key])}</${key}>`);}
  return rows;
}
function mergeLineAttrs(target={},attrs={}){
  for(const key of [...BLOCK_FIELDS.ProcessBlock,...BLOCK_FIELDS.MaterialBlock]){
    if(target[key]==null&&attrs[key]!=null&&clean(attrs[key])!==''&&!isUnset(attrs[key]))target[key]=attrs[key];
  }
  return target;
}
function childBlockXml(blockName='',children=[]){const active=children.filter((child)=>clean(child));return active.length?`    <${blockName}>\n${active.map((child)=>`      ${clean(child)}`).join('\n')}\n    </${blockName}>`:'';}
function nestedChildBlockXml(blockName='',children=[],indent='        '){const active=children.filter((child)=>clean(child));return active.length?`${indent}<${blockName}>\n${active.map((child)=>`${indent}  ${clean(child)}`).join('\n')}\n${indent}</${blockName}>`:`${indent}<${blockName} />`;}
function miscXml(attrs={},used=new Set()){
  const rows=[];
  const lineOwned=new Set([...BLOCK_FIELDS.ProcessBlock,...BLOCK_FIELDS.MaterialBlock]);
  for(const [key,value] of Object.entries(attrs)){if(key==='FROM_NODE'||key==='TO_NODE'||lineOwned.has(key)||used.has(key)||isUnset(value))continue;rows.push(`      <UnmappedAttribute name="${esc(key)}">${esc(value)}</UnmappedAttribute>`);}
  return rows.length?`    <MiscBlock>\n${rows.join('\n')}\n    </MiscBlock>`:'    <MiscBlock />';
}
function deltaLength(attrs={}){const dx=isUnset(attrs.DELTA_X)?0:num(attrs.DELTA_X),dy=isUnset(attrs.DELTA_Y)?0:num(attrs.DELTA_Y),dz=isUnset(attrs.DELTA_Z)?0:num(attrs.DELTA_Z);if([dx,dy,dz].every((v)=>v==null))return '';const value=Math.sqrt((dx||0)*(dx||0)+(dy||0)*(dy||0)+(dz||0)*(dz||0));return Number.isFinite(value)&&value>0?value.toFixed(3):'';}
function derivePipingClass(attrs={},line=''){const direct=clean(attrs.PipingClass||attrs.PIPING_CLASS||attrs.PIPINGCLASS);if(direct)return{value:direct,source:'existing-field'};const parts=clean(line).replace(/^\/+/, '').replace(/\/B\d+$/i,'').split('-').filter(Boolean);const value=parts.find((part)=>/[A-Z]{1,}\d{2,}|\d{3,}[A-Z]/i.test(part))||'';return value?{value,source:'line-token'}:null;}
function deriveRating(attrs={},pipingClass=''){const direct=clean(attrs.Rating||attrs.RATING||attrs.CLASS_GRADE);if(direct)return{value:direct,source:'existing-field'};const hit=clean(pipingClass).match(/(?:CL|CLASS|RATING)?\s*([0-9]{2,4})/i);return hit?{value:hit[1],source:'piping-class'}:null;}
function deriveBore(attrs={},line=''){const direct=clean(attrs.BoreMm||attrs.BORE_MM);if(direct)return{value:direct,source:'existing-field'};const quoted=clean(line).match(/(\d+(?:\.\d+)?)\s*"/);if(quoted){const n=Number(quoted[1]);return Number.isFinite(n)?{value:(n*25.4).toFixed(3),source:'line-size-token'}:null;}return null;}
function derivedBlockXml(attrs={},line=''){
  const bore=deriveBore(attrs,line),length=deltaLength(attrs),material=clean(attrs.MaterialName||attrs.MATERIAL_NAME||attrs.MATERIAL||'');
  const rows=[];
  if(bore)rows.push(`      <BoreMm source="${esc(bore.source)}">${esc(bore.value)}</BoreMm>`);
  if(length)rows.push(`      <ElementLengthMm source="delta-vector">${esc(length)}</ElementLengthMm>`);
  if(material)rows.push(`      <MaterialName source="existing-field">${esc(material)}</MaterialName>`);
  return rows.length?`    <DerivedBlock>\n${rows.join('\n')}\n    </DerivedBlock>`:'';
}
function lineBlockXml(line='',lineAttrs={}){
  const pc=derivePipingClass(lineAttrs,line),rating=deriveRating(lineAttrs,pc?.value||''),rows=[];
  rows.push(`    <Branchname>${esc(line)}</Branchname>`);
  rows.push(`    <LineNo>${esc(line)}</LineNo>`);
  if(pc)rows.push(`    <PipingClass source="${esc(pc.source)}">${esc(pc.value)}</PipingClass>`);
  if(rating)rows.push(`    <Rating source="${esc(rating.source)}">${esc(rating.value)}</Rating>`);
  return `  <LineBlock>\n${rows.join('\n')}\n  </LineBlock>`;
}
function lineBlocksXml(lineAttrs={},branchGroups={}){
  const processRows=fieldRows('ProcessBlock',lineAttrs,'      ');
  const materialRows=fieldRows('MaterialBlock',lineAttrs,'      ');
  const allowables=branchGroups.AllowableStressBlock||[];
  const blocks=[];
  if(processRows.length)blocks.push(`    <ProcessBlock scope="line">\n${processRows.join('\n')}\n    </ProcessBlock>`);
  if(materialRows.length||allowables.length){
    const rows=[...materialRows];
    if(allowables.length)rows.push(`      <AllowableStressBlock>\n${allowables.map((block)=>`        ${clean(block)}`).join('\n')}\n      </AllowableStressBlock>`);
    blocks.push(`    <MaterialBlock scope="line">\n${rows.join('\n')}\n    </MaterialBlock>`);
  }
  return blocks.length?`  <LineBlocks>\n${blocks.join('\n')}\n  </LineBlocks>`:'';
}
function temperatureBlockXml(attrs={},used=new Set()){
  const rows=[];
  for(const key of BLOCK_FIELDS.TemperatureBlock){if(attrs[key]!=null&&clean(attrs[key])!==''&&!isUnset(attrs[key])){used.add(key);const idx=key.replace('TEMP_EXP_C','');rows.push(`          <Temperature${esc(idx)} sourceField="${esc(key)}">${esc(attrs[key])}</Temperature${esc(idx)}>`);}}
  return rows.length?`        <TemperatureBlock source="element-non-sentinel">\n${rows.join('\n')}\n        </TemperatureBlock>`:'';
}
const GLOBAL_KEYS=Object.freeze(['FROM_GLOBAL_X','FROM_GLOBAL_Y','FROM_GLOBAL_Z','TO_GLOBAL_X','TO_GLOBAL_Y','TO_GLOBAL_Z']);
const DELTA_KEYS=Object.freeze(['DELTA_X','DELTA_Y','DELTA_Z']);
function coordText(value){const n=Number(value);return Number.isFinite(n)?n.toFixed(3):'';}
function hasAnyGlobal(list=[]){return list.some((attrs)=>GLOBAL_KEYS.some((key)=>attrs[key]!=null&&!isUnset(attrs[key])));}
function hasAnyDelta(list=[]){return list.some((attrs)=>DELTA_KEYS.some((key)=>attrs[key]!=null&&!isUnset(attrs[key])));}
// Root-cause fix: line-basis inputs carry only DELTA_* (no global coords). Reuse the existing
// solveElementCoordinates propagator to integrate the delta chain from a seeded basis so the
// categorized output emits DerivedCoordinateBlock per node. No-op when globals already exist.
function solveGlobalsForElements(list=[]){
  if(!list.length||hasAnyGlobal(list)||!hasAnyDelta(list))return null;
  const firstFrom=normalizeNode(list[0].FROM_NODE);
  if(!firstFrom||isUnset(firstFrom))return null;
  const {solvedNodes}=solveElementCoordinates({elements:list,originCoordinates:[{node:firstFrom,x:0,y:0,z:0}],toleranceMm:1});
  const map=new Map();
  for(const [node,point] of Object.entries(solvedNodes||{}))map.set(node,point);
  return map.size?map:null;
}
function withSolvedGlobals(attrs={},from='',to='',solvedNodes=null){
  if(!solvedNodes)return attrs;
  const out={...attrs};
  const apply=(node,prefix)=>{
    const point=solvedNodes.get(node);if(!point)return;
    for(const axis of ['X','Y','Z']){const key=`${prefix}_GLOBAL_${axis}`;if(out[key]==null||isUnset(out[key]))out[key]=coordText(point[axis.toLowerCase()]);}
    if(out.GLOBAL_COORD_BASIS_NODE==null||clean(out.GLOBAL_COORD_BASIS_NODE)===''||isUnset(out.GLOBAL_COORD_BASIS_NODE))out.GLOBAL_COORD_BASIS_NODE=clean(point.basisNode||node);
  };
  apply(from,'FROM');apply(to,'TO');
  return out;
}
function coordinateBlockXml(attrs={},role='FROM',used=new Set()){
  const blockName=role==='TO'?'ToCoordinateBlock':'FromCoordinateBlock',rows=[];
  for(const key of BLOCK_FIELDS[blockName]||[]){if(attrs[key]!=null&&clean(attrs[key])!==''&&!isUnset(attrs[key])){used.add(key);rows.push(`          <${key}>${esc(attrs[key])}</${key}>`);}}
  return rows.length?`        <DerivedCoordinateBlock>\n${rows.join('\n')}\n        </DerivedCoordinateBlock>`:'';
}
function groupNodeBlocks(blocks=[]){const groups={};for(const block of blocks){const tag=openName(block);const group=tag==='SIF'?'SifBlock':NODE_BLOCKS[tag];if(group){groups[group] ||= [];groups[group].push(block);}}return groups;}
function roleForNode(node='',from='',to=''){if(node===from)return'FROM';if(node===to)return'TO';return'NODE';}
function nodesBlockXml({attrs={},key='',from='',to='',attachedByNode=new Map(),sifByNode=new Map(),used=new Set()}={}){
  const nodes=[from,to,...sifByNode.keys()].map(normalizeNode).filter((node,index,all)=>node&&!isUnset(node)&&all.indexOf(node)===index);
  const nodeRows=[];
  for(const node of nodes){
    const role=roleForNode(node,from,to);
    const groups=groupNodeBlocks([...(attachedByNode.get(node)||[]),...(sifByNode.get(node)||[])]);
    const blocks=[coordinateBlockXml(attrs,role,used),temperatureBlockXml(attrs,used),nestedChildBlockXml('RestraintsBlock',groups.RestraintsBlock||[]),nestedChildBlockXml('DisplacementsBlock',groups.DisplacementsBlock||[]),nestedChildBlockXml('ForcesMomentsBlock',groups.ForcesMomentsBlock||[]),nestedChildBlockXml('SifBlock',groups.SifBlock||[])].filter((part)=>clean(part));
    nodeRows.push(`      <Node nodeNumber="${esc(node)}" role="${esc(role)}" elementKey="${esc(key)}">\n${blocks.join('\n')}\n      </Node>`);
  }
  return nodeRows.length?`    <NodesBlock>\n${nodeRows.join('\n')}\n    </NodesBlock>`:'';
}
function cdata(text=''){return String(text).replaceAll(']]>',']]]]><![CDATA[>');}
function decdata(text=''){return String(text).replaceAll(']]]]><![CDATA[>',']]>');}
function categorizedElementXml(elementXml='',nodeBlockMap=new Map(),solvedNodes=null){
  const open=firstOpenTag(elementXml)||elementXml.match(/^<PIPINGELEMENT\b[^>]*\/>/i)?.[0]||'';
  const rawAttrs=attrsOf(open);
  const from=normalizeNode(rawAttrs.FROM_NODE),to=normalizeNode(rawAttrs.TO_NODE);
  const attrs=withSolvedGlobals(rawAttrs,from,to,solvedNodes);
  const key=elementKey(attrs),line=lineId(attrs),used=new Set();
  const children=childrenOfElement(elementXml);
  const childGroups={};for(const child of children){const group=CHILD_BLOCKS[openName(child)];if(group){childGroups[group] ||= [];childGroups[group].push(child);}}
  const sifByNode=new Map();for(const block of sifBlocksOfElement(elementXml)){const node=nodeBlockKey(block,'SIF');if(!node||isUnset(node))continue;if(!sifByNode.has(node))sifByNode.set(node,[]);sifByNode.get(node).push(block);}
  const attachedByNode=new Map([[from,nodeBlockMap.get(from)||[]],[to,nodeBlockMap.get(to)||[]]]);
  const blocks=[];
  blocks.push(blockXml('NameBlock',{...attrs,NAME:attrs.NAME||key},used));
  blocks.push(blockXml('RouteGeometryBlock',attrs,used));
  blocks.push(blockXml('SectionDimensionBlock',attrs,used));
  blocks.push(derivedBlockXml(attrs,line));
  for(const name of ['BendBlock','RigidBlock','FlangeBlock'])blocks.push(childBlockXml(name,childGroups[name]||[]));
  blocks.push(miscXml(attrs,used));
  blocks.push(nodesBlockXml({attrs,key,from,to,attachedByNode,sifByNode,used}));
  blocks.push(`    <OriginalElement><![CDATA[${cdata(elementXml)}]]></OriginalElement>`);
  return {line,attrs,xml:`  <Element fromNode="${esc(from)}" toNode="${esc(to)}" elementKey="${esc(key)}">\n${blocks.filter(Boolean).join('\n')}\n  </Element>`};
}
function categorizedExternalBlocks(categorizedText=''){
  const unique=new Map();
  for(const tagName of Object.keys(NODE_BLOCKS))for(const block of splitLooseBlocks(categorizedText,tagName).filter(activeNodeBlock))unique.set(clean(block),clean(block));
  return [...unique.values()];
}
function originalDocument(categorizedText=''){const match=String(categorizedText).match(/<OriginalDocument>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/OriginalDocument>/i);return match?decdata(match[1]):'';}
export function inputXmlToCategorizedInputXml(xmlText='',{sourceName='InputXML'}={}){
  const nodeBlockMap=nodeBlocks(xmlText),branchGroups=branchBlocks(xmlText),byLine=new Map(),lineAttrsByLine=new Map();
  const elementXmls=splitPipingElements(xmlText);
  const elementAttrsList=elementXmls.map((element)=>attrsOf(firstOpenTag(element)||element.match(/^<PIPINGELEMENT\b[^>]*\/>/i)?.[0]||''));
  const solvedNodes=solveGlobalsForElements(elementAttrsList);
  for(const element of elementXmls){
    const entry=categorizedElementXml(element,nodeBlockMap,solvedNodes);
    if(!byLine.has(entry.line))byLine.set(entry.line,[]);
    if(!lineAttrsByLine.has(entry.line))lineAttrsByLine.set(entry.line,{});
    mergeLineAttrs(lineAttrsByLine.get(entry.line),entry.attrs);
    byLine.get(entry.line).push(entry.xml);
  }
  const lines=[...byLine.entries()].map(([line,elements])=>{
    const attrs=lineAttrsByLine.get(line)||{};
    const lineBlocks=lineBlocksXml(attrs,branchGroups);
    return ` <Line id="${esc(line)}">\n${lineBlockXml(line,attrs)}\n${lineBlocks?`${lineBlocks}\n`:''}${elements.join('\n')}\n </Line>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CategorizedInputXML schema="categorized-inputxml/v3" sourceName="${esc(sourceName)}">\n${lines}\n</CategorizedInputXML>\n`;
}
export function categorizedInputXmlToInputXml(categorizedText=''){
  const original=originalDocument(categorizedText);
  if(original)return original;
  const originals=[];
  const re=/<OriginalElement>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/OriginalElement>/gi;
  let match;while((match=re.exec(String(categorizedText))))originals.push(decdata(match[1]));
  const external=categorizedExternalBlocks(categorizedText);
  if(originals.length)return `<?xml version="1.0" encoding="UTF-8"?>\n<CAESARII XML_TYPE="Input">\n<PIPINGMODEL>\n${[...originals,...external].join('\n')}\n</PIPINGMODEL>\n</CAESARII>\n`;
  return String(categorizedText).replace(/<CategorizedInputXML[\s\S]*?>|<\/CategorizedInputXML>/gi,'');
}
export function convertCategorizedInputXml(text='',direction='input-to-categorized',options={}){
  return direction==='categorized-to-input'?categorizedInputXmlToInputXml(text):inputXmlToCategorizedInputXml(text,options);
}
export function categorizedFileName(name='',direction='input-to-categorized'){
  const base=clean(name||'input.xml').replace(/\.(xml|txt)$/i,'');
  return direction==='categorized-to-input'?`${base}_inputxml.xml`:`${base}_categorized_enriched.xml`;
}
export const _test=Object.freeze({attrsOf,isUnset,activeChildBlock,activeNodeBlock,activeBranchBlock,activeSifBlock,splitPipingElements,splitLooseBlocks,nodeBlocks,branchBlocks,categorizedExternalBlocks,originalDocument,deltaLength,derivedBlockXml,lineBlockXml,lineBlocksXml,mergeLineAttrs,temperatureBlockXml,coordinateBlockXml,groupNodeBlocks,nodesBlockXml,inputXmlToCategorizedInputXml,categorizedInputXmlToInputXml,categorizedFileName,solveGlobalsForElements,withSolvedGlobals,hasAnyGlobal,hasAnyDelta});
