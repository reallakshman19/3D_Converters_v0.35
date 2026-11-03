export const XML_COMPARE_CATEGORIZED_INPUTXML_CANVAS_MODEL_SCHEMA='xml-compare-categorized-inputxml-canvas-model/v1';

const clean=(v)=>String(v??'').trim();
const decode=(v)=>clean(String(v??'').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&'));
const escKey=(v)=>decode(v).replace(/\s+/g,'_').replace(/[^A-Za-z0-9_.:@/\->|]+/g,'_')||'unknown';
const uniq=(items)=>Object.freeze([...new Set((items||[]).map(clean).filter(Boolean))]);
const textTags=(node)=>Object.fromEntries((node?.children||[]).filter((child)=>!(child.children||[]).length&&clean(child.text)).map((child)=>[child.name,decode(child.text)]));
const stripCdata=(xml='')=>String(xml||'').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,'');
const parseAttrs=(text='')=>{const attrs={};String(text||'').replace(/([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g,(_,key,_q,dq,sq)=>{attrs[key]=decode(dq??sq??'');return _;});return attrs;};
function tagEnd(xml,start){let quote='',i=start+1;for(;i<String(xml||'').length;i+=1){const ch=xml[i];if(quote){if(ch===quote)quote='';continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='>')return i;}return -1;}
function parseXmlLite(xml=''){
  const source=String(xml||'');
  const root={name:'#document',attrs:{},children:[],text:'',cdata:''};
  const stack=[root];
  let i=0,last=0;
  const appendText=(end)=>{if(end>last)stack[stack.length-1].text+=source.slice(last,end);};
  while(i<source.length){
    const lt=source.indexOf('<',i);
    if(lt<0)break;
    if(source.startsWith('<![CDATA[',lt)){
      appendText(lt);
      const end=source.indexOf(']]>',lt+9);
      const stop=end<0?source.length:end;
      stack[stack.length-1].cdata+=(stack[stack.length-1].cdata?'\n':'')+source.slice(lt+9,stop);
      i=end<0?source.length:end+3;last=i;continue;
    }
    if(source.startsWith('<!--',lt)){
      appendText(lt);
      const end=source.indexOf('-->',lt+4);
      i=end<0?source.length:end+3;last=i;continue;
    }
    appendText(lt);
    const end=tagEnd(source,lt);
    if(end<0)break;
    const raw=clean(source.slice(lt+1,end));
    if(!raw||raw.startsWith('?')||raw.startsWith('!')){i=end+1;last=i;continue;}
    if(raw.startsWith('/')){const closeName=raw.slice(1).split(/\s+/)[0];while(stack.length>1){const node=stack.pop();if(node.name===closeName)break;}i=end+1;last=i;continue;}
    const selfClosing=/\/\s*$/.test(raw);
    const tagRaw=selfClosing?raw.replace(/\/\s*$/,'').trim():raw;
    const name=tagRaw.split(/\s+/)[0];
    const attrText=tagRaw.slice(name.length);
    const node={name,attrs:parseAttrs(attrText),children:[],text:'',cdata:'',parent:stack[stack.length-1]};
    stack[stack.length-1].children.push(node);
    if(!selfClosing)stack.push(node);
    i=end+1;last=i;
  }
  if(last<source.length)stack[stack.length-1].text+=source.slice(last);
  return root;
}
const children=(node,name=null)=>Object.freeze((node?.children||[]).filter((child)=>!name||child.name===name));
const descendants=(node,name=null,out=[])=>{for(const child of node?.children||[]){if(!name||child.name===name)out.push(child);descendants(child,name,out);}return out;};
const firstChild=(node,name)=>children(node,name)[0]||null;
const firstText=(node,names=[],recursive=true)=>{for(const name of names){const list=recursive?descendants(node,name,[]):children(node,name);for(const child of list){const value=decode(child.text);if(value)return value;}}return '';};
const directBlockNames=(node)=>children(node).map((child)=>child.name).filter((name)=>/Block$|Blocks$/i.test(name));
const leafFields=(node)=>{const out={};for(const child of descendants(node,null,[])){if((child.children||[]).length)continue;const value=decode(child.text);if(value)out[child.name]=value;}return out;};
function itemCount(block){if(!block)return 0;const direct=children(block).filter((child)=>!/Block$|Blocks$/i.test(child.name));return direct.length;}
function compactFields(block){const attrs={...block?.attrs};const fields={...attrs,...textTags(block)};return Object.freeze(Object.fromEntries(Object.entries(fields).slice(0,10).map(([k,v])=>[k,decode(v)])));}
function lineKey(line,index){return decode(line.attrs.id)||firstText(firstChild(line,'LineBlock')||line,['LineNo'],true)||firstText(firstChild(line,'LineBlock')||line,['Branchname'],true)||firstText(line,['LINE_ID'],true)||`Line ${index}`;}
function elementKey(element,index){const a=element.attrs||{};return decode(a.elementKey)||(decode(a.fromNode)&&decode(a.toNode)?`${decode(a.fromNode)}->${decode(a.toNode)}`:'')||firstText(element,['NAME'],true)||`Element ${index}`;}
function nodePoint(fields){const x=fields.FROM_GLOBAL_X||fields.TO_GLOBAL_X||fields.GLOBAL_X||fields.X;const y=fields.FROM_GLOBAL_Y||fields.TO_GLOBAL_Y||fields.GLOBAL_Y||fields.Y;const z=fields.FROM_GLOBAL_Z||fields.TO_GLOBAL_Z||fields.GLOBAL_Z||fields.Z;return {globalX:decode(x),globalY:decode(y),globalZ:decode(z),position:x&&y&&z?{x:Number(x),y:Number(y),z:Number(z)}:null};}
function temperatureFields(fields){const out={};for(let i=1;i<=9;i++){const key=`Temperature${i}`;if(clean(fields[key]))out[key]=clean(fields[key]);}return out;}
function countIn(node,tag){return descendants(node,tag,[]).length;}
function makeLevel(levelId,label,records,layout,fields){return Object.freeze({levelId,label,levelType:levelId==='lineBlock'?'group':levelId==='nodeEvidence'?'evidence':'occurrence',recordCount:records.length,layout,fields:Object.freeze(fields),records:Object.freeze(records)});}
function fieldsFor(records=[],preferred=[]){const keys=[];const add=(key)=>{if(clean(key)&&!keys.includes(key))keys.push(key);};preferred.forEach(add);for(const record of records)for(const [key,value] of Object.entries(record||{})){if(['raw','rawSummary','position','points','diagnostics','compactFields'].includes(key))continue;if(value==null||typeof value==='object')continue;if(clean(value))add(key);}return keys;}
function childBlockSummary(node){return Object.freeze(children(node).map((child)=>child.name).filter((name)=>/Block$|Blocks$|OriginalElement/i.test(name)));}
function sourceRef(sourceName,lineIndex,elementIndex=null,nodeIndex=null,blockName=''){return [sourceName||'CategorizedInputXML',`Line ${lineIndex}`,elementIndex!=null?`Element ${elementIndex}`:'',nodeIndex!=null?`Node ${nodeIndex}`:'',blockName].filter(Boolean).join(' / ');}
export function createCategorizedInputXmlCanvasModel({sourceName='',xmlText='',side='source'}={}){
  const diagnostics=[];
  const parsed=parseXmlLite(xmlText);
  const root=(parsed.children||[]).find((child)=>child.name==='CategorizedInputXML')||parsed.children?.[0]||null;
  if(!root||root.name!=='CategorizedInputXML')diagnostics.push(Object.freeze({severity:'ERROR',code:'categorized_inputxml_root_missing',message:'CategorizedInputXML root was not found.',details:Object.freeze({rootTag:root?.name||''})}));
  const rootTag=root?.name||'';
  const schema=decode(root?.attrs?.schema||'');
  const detectedSourceName=decode(root?.attrs?.sourceName||sourceName);
  const lineRecords=[],elementRecords=[],nodeRecords=[],evidenceRecords=[];
  const hierarchy={lineKeys:[],lineToElements:{},elementToNodes:{},nodeToEvidence:{}};
  let elementTotal=0,nodeTotal=0,evidenceTotal=0;
  const lineNodes=children(root,'Line');
  lineNodes.forEach((line,lineIdx)=>{
    const lIndex=lineIdx+1,lKey=lineKey(line,lIndex),uidKey=escKey(lKey)||String(lIndex);
    const lineBlock=firstChild(line,'LineBlock')||line;
    const lineNo=firstText(lineBlock,['LineNo'],true)||lKey;
    const branchName=firstText(lineBlock,['Branchname'],true)||lineNo||lKey;
    const elements=descendants(line,'Element',[]);
    const detectedBlockNames=uniq(directBlockNames(line).filter((name)=>name!=='Element'));
    const record={uid:`categorized:lineBlock:${uidKey}`,levelId:'lineBlock',recordKind:'LINE_BLOCK',lineKey:lKey,lineNo,branchName,displayName:lineNo||branchName||lKey,key:lKey,elementCount:elements.length,nodeCount:0,evidenceCount:0,detectedBlockNames,sourceRefs:Object.freeze([sourceRef(detectedSourceName,lIndex)]),rawSummary:Object.freeze({...textTags(lineBlock),detectedBlockNames:detectedBlockNames.join(', ')})};
    hierarchy.lineKeys.push(lKey);hierarchy.lineToElements[lKey]=[];
    let lineNodeCount=0,lineEvidenceCount=0;
    elements.forEach((element,elementIdx)=>{
      const eIndex=elementIdx+1,eKey=elementKey(element,eIndex),eUidKey=escKey(eKey),attrs=element.attrs||{},fields=leafFields(element),name=fields.NAME||eKey;
      const elementNodes=descendants(element,'Node',[]);
      const childBlockNames=childBlockSummary(element);
      const er={uid:`categorized:element:${uidKey}:${eUidKey}`,levelId:'element',recordKind:'ELEMENT',lineKey:lKey,lineNo,branchName,elementKey:eKey,fromNode:decode(attrs.fromNode),toNode:decode(attrs.toNode),displayName:name,key:eKey,DELTA_X:fields.DELTA_X||'',DELTA_Y:fields.DELTA_Y||'',DELTA_Z:fields.DELTA_Z||'',ElementLengthMm:fields.ElementLengthMm||'',MaterialName:fields.MaterialName||'',DIAMETER:fields.DIAMETER||'',WALL_THICK:fields.WALL_THICK||'',INSUL_THICK:fields.INSUL_THICK||'',FROM_NAME:fields.FROM_NAME||decode(attrs.FROM_NAME),TO_NAME:fields.TO_NAME||decode(attrs.TO_NAME),NAME:fields.NAME||'',LINE_ID:fields.LINE_ID||decode(attrs.LINE_ID),childBlockNames,nodeCount:elementNodes.length,evidenceCount:0,sourceRefs:Object.freeze([sourceRef(detectedSourceName,lIndex,eIndex)]),rawSummary:Object.freeze(Object.fromEntries(Object.entries({...fields,...attrs}).slice(0,18)))};
      elementRecords.push(Object.freeze(er));elementTotal+=1;hierarchy.lineToElements[lKey].push(eKey);hierarchy.elementToNodes[`${lKey}|${eKey}`]=[];
      let elementEvidenceCount=0;
      elementNodes.forEach((node,nodeIdx)=>{
        const nIndex=nodeIdx+1,attrs=node.attrs||{},nodeNumber=decode(attrs.nodeNumber),role=decode(attrs.role)||'NODE',nKey=`${lineNo||lKey}/${eKey}/${role}/${nodeNumber||nIndex}`,nodeUidKey=escKey(`${role}:${nodeNumber||nIndex}`),nFields=leafFields(node),point=nodePoint(nFields),blockNames=uniq(directBlockNames(node));
        const nr={uid:`categorized:node:${uidKey}:${eUidKey}:${nodeUidKey}`,levelId:'node',recordKind:'NODE',lineKey:lKey,lineNo,branchName,elementKey:eKey,nodeNumber,role,displayName:`${role} ${nodeNumber||nIndex}`,key:nKey,globalX:point.globalX,globalY:point.globalY,globalZ:point.globalZ,coordinateBasisNode:nFields.GLOBAL_COORD_BASIS_NODE||nFields.CoordinateBasisNode||nFields.BasisNode||'',...temperatureFields(nFields),restraintCount:countIn(node,'RESTRAINT'),displacementsCount:countIn(node,'DISPLACEMENTS'),forcesMomentsCount:countIn(node,'FORCESMOMENTS'),sifCount:countIn(node,'SIF'),detectedBlockNames:blockNames,position:point.position,points:point.position?[point.position]:[],sourceRefs:Object.freeze([sourceRef(detectedSourceName,lIndex,eIndex,nIndex)])};
        nodeRecords.push(Object.freeze(nr));nodeTotal+=1;lineNodeCount+=1;hierarchy.elementToNodes[`${lKey}|${eKey}`].push(nKey);hierarchy.nodeToEvidence[`${lKey}|${eKey}|${nKey}`]=[];
        for(const block of children(node)){
          if(!/Block$|Blocks$/i.test(block.name))continue;
          const itemTotal=itemCount(block);
          const evidenceKey=`${nKey}/${block.name}`;
          const ev={uid:`categorized:nodeEvidence:${uidKey}:${eUidKey}:${nodeUidKey}:${escKey(block.name)}`,levelId:'nodeEvidence',recordKind:'NODE_EVIDENCE',lineKey:lKey,lineNo,branchName,elementKey:eKey,nodeNumber,role,evidenceKind:block.name,blockName:block.name,itemCount:itemTotal,displayName:`${role} ${nodeNumber||nIndex} · ${block.name}`,key:evidenceKey,compactFields:compactFields(block),sourceRefs:Object.freeze([sourceRef(detectedSourceName,lIndex,eIndex,nIndex,block.name)])};
          evidenceRecords.push(Object.freeze(ev));evidenceTotal+=1;lineEvidenceCount+=1;elementEvidenceCount+=1;hierarchy.nodeToEvidence[`${lKey}|${eKey}|${nKey}`].push(evidenceKey);
        }
      });
      elementRecords[elementRecords.length-1]=Object.freeze({...elementRecords[elementRecords.length-1],evidenceCount:elementEvidenceCount});
    });
    lineRecords.push(Object.freeze({...record,nodeCount:lineNodeCount,evidenceCount:lineEvidenceCount}));
  });
  const allRecords=Object.freeze([...lineRecords,...elementRecords,...nodeRecords,...evidenceRecords]);
  const levels=Object.freeze([
    makeLevel('lineBlock','LineBlock',lineRecords,lineRecords.length>60?'compact-list':'tiles',fieldsFor(lineRecords,['displayName','lineNo','branchName','elementCount','nodeCount','evidenceCount','detectedBlockNames'])),
    makeLevel('element','Element',elementRecords,elementRecords.length>80?'grouped-compact-tree':'grouped-tree',fieldsFor(elementRecords,['displayName','elementKey','fromNode','toNode','lineNo','DELTA_X','DELTA_Y','DELTA_Z','ElementLengthMm','MaterialName','nodeCount','evidenceCount'])),
    makeLevel('node','Node',nodeRecords,nodeRecords.length>120?'grouped-compact-tree':'grouped-tree',fieldsFor(nodeRecords,['displayName','nodeNumber','role','elementKey','lineNo','globalX','globalY','globalZ','coordinateBasisNode','restraintCount','displacementsCount','forcesMomentsCount','sifCount'])),
    makeLevel('nodeEvidence','Node Evidence',evidenceRecords,'grouped-compact-tree',fieldsFor(evidenceRecords,['displayName','evidenceKind','blockName','itemCount','nodeNumber','role','elementKey','lineNo']))
  ]);
  const summary=Object.freeze({schema,sourceName:detectedSourceName,recordCount:allRecords.length,lineBlockCount:lineRecords.length,lineCount:lineRecords.length,elementCount:elementTotal,nodeCount:nodeTotal,evidenceCount:evidenceTotal,pipingElementCount:(stripCdata(xmlText).match(/<PIPINGELEMENT\b/gi)||[]).length,detectedBlockNames:uniq([...lineRecords.flatMap((r)=>r.detectedBlockNames),...elementRecords.flatMap((r)=>r.childBlockNames),...nodeRecords.flatMap((r)=>r.detectedBlockNames)])});
  return Object.freeze({schema:XML_COMPARE_CATEGORIZED_INPUTXML_CANVAS_MODEL_SCHEMA,sourceName:detectedSourceName,profile:'categorized-inputxml',side:clean(side)||'source',rootTag,levels,records:allRecords,hierarchy:Object.freeze(hierarchy),summary,diagnostics:Object.freeze(diagnostics)});
}
export const _test=Object.freeze({clean,decode,stripCdata,parseAttrs,parseXmlLite,children,descendants,firstText,lineKey,elementKey,itemCount,compactFields,tagEnd});
