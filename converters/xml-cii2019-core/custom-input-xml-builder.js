import { createXmlBuilderDiagnostic } from './custom-input-diagnostics.js';

function t(v){return String(v??'').trim()}
function esc(v){return t(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function n(v){const x=Number(String(v??'').replace(/,/g,'')); return Number.isFinite(x)?x:null}
function pos(v){const a=t(v).match(/-?\d+(?:\.\d+)?/g)?.map(Number)||[]; return a.length>=3?a:null}
function dist(a,b){const p=pos(a),q=pos(b); if(!p||!q)return null; const d=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]); return Number.isFinite(d)&&d>0?d:null}
function tag(name,value){return `<${name}>${esc(value)}</${name}>`}
function optionalTag(name,value){return t(value)?tag(name,value):''}
function val(node,branch,key,fallback=''){return t(node?.[key]||branch?.[key]||fallback)}
function add(records,input){records.push(createXmlBuilderDiagnostic({module:'custom-input-xml-builder',...input}))}

export function recalcCustomInputElementLengths(model){
  for(const branch of model?.branches||[]){let prev=null; const byRef=new Map();
    for(const node of branch.nodes||[]){const ref=t(node.componentRefNo); if(ref){if(!byRef.has(ref))byRef.set(ref,[]); byRef.get(ref).push(node)}}
    for(const group of byRef.values()) if(group.length>1){let best=0; for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)best=Math.max(best,dist(group[i].position,group[j].position)||0); if(best>0)group.forEach(nd=>{nd.elementLengthMm=best.toFixed(3)})}
    for(const node of branch.nodes||[]){if(!t(node.elementLengthMm)&&prev){const d=dist(prev.position,node.position); if(d)node.elementLengthMm=d.toFixed(3)} prev=node.position?node:prev}
  }
  return model;
}

export function dropShortCustomInputNodes(model,{enabled=true,thresholdMm=6,records=[]}={}){
  if(!enabled)return model;
  for(const branch of model?.branches||[]) branch.nodes=(branch.nodes||[]).filter(node=>{
    const length=n(node.elementLengthMm); const keep=length===null||length>thresholdMm;
    if(!keep)add(records,{severity:'WARNING',code:'XML_BUILDER_SHORT_NODE_DROPPED',stage:'node-xml',action:'drop',branch:branch.branchName,node:node.nodeNumber,sourceField:'ElementLengthMm',count:1,context:{lengthMm:length,thresholdMm},message:`Node was removed because ElementLengthMm ${length} is at or below ${thresholdMm} mm.`});
    return keep;
  });
  return model;
}

const CONCRETE_RESTRAINT_TYPES=new Set(['+Y','Y','LIM','GUI','ANC','ANCHOR']);
function concreteRestraintType(value){const raw=t(value).toUpperCase(); return CONCRETE_RESTRAINT_TYPES.has(raw)||Number.isFinite(Number(raw))?t(value):''}
function restraintType(restraint,records,branch,node){
  const direct=concreteRestraintType(restraint.type);
  if(direct)return direct;
  const direction=concreteRestraintType(restraint.direction);
  if(direction){add(records,{severity:'INFO',code:'XML_BUILDER_RESTRAINT_DIRECTION_FALLBACK',stage:'node-xml',branch,node,sourceField:'Direction',outputField:'Restraint/Type',context:{sourceType:t(restraint.type),sourceDirection:t(restraint.direction)},message:'Recognized Direction is used because RestraintType is blank or generic.'}); return direction}
  const preserved=t(restraint.type||restraint.direction);
  add(records,{severity:'WARNING',code:'XML_BUILDER_RESTRAINT_TYPE_UNRESOLVED',stage:'node-xml',branch,node,sourceField:'RestraintType/Direction',outputField:'Restraint/Type',context:{sourceType:t(restraint.type),sourceDirection:t(restraint.direction)},message:'Restraint type is preserved as text but is not recognized or numeric; downstream InputXML will diagnose a sentinel type.'});
  return preserved;
}

function restraintXml(restraint,records,branch,node){
  const type=restraintType(restraint,records,branch,node);
  return `<Restraint>${tag('Type',type)}${tag('Stiffness',restraint.stiffness)}${tag('Gap',restraint.gap)}${tag('Friction',restraint.friction)}</Restraint>`;
}

function nodeXml(branch,node,records){
  const comp=val(node,branch,'componentType','PIPE');
  const position=t(node.position);
  const outsideDiameter=val(node,branch,'outsideDiameter');
  if(!position)add(records,{severity:'WARNING',code:'XML_BUILDER_POSITION_OMITTED',stage:'node-xml',action:'omit',branch:branch.branchName,node:node.nodeNumber,sourceField:'Position',outputField:'Node/Position',message:'Position is unknown and is omitted; origin coordinates are not fabricated.'});
  if(!outsideDiameter)add(records,{severity:'WARNING',code:'XML_BUILDER_OUTSIDE_DIAMETER_MISSING',stage:'node-xml',branch:branch.branchName,node:node.nodeNumber,sourceField:'OutsideDiameter',outputField:'Node/OutsideDiameter',message:'OutsideDiameter is absent. BoreMm is retained separately and is not treated as OD.'});
  if(!t(node.componentType))add(records,{severity:'INFO',code:'XML_BUILDER_DEFAULT_SUBSTITUTED',stage:'node-xml',action:'default',branch:branch.branchName,node:node.nodeNumber,sourceField:'ComponentType',context:{defaultValue:'PIPE'},message:'Default component type PIPE is emitted.'});
  const lines=['<Node>',tag('NodeNumber',node.nodeNumber),tag('NodeName',node.nodeName||''),tag('Endpoint',node.endpoint||'1'),tag('Rigid',node.rigid||'0'),tag('ComponentType',comp),tag('Weight',node.weight||'0'),tag('ComponentRefNo',node.componentRefNo),tag('ConnectionType',''),tag('OutsideDiameter',outsideDiameter),tag('WallThickness',val(node,branch,'wallThickness','0')),tag('CorrosionAllowance',val(node,branch,'corrosionAllowance','0')),tag('InsulationThickness',val(node,branch,'insulationThickness','0')),optionalTag('Position',position),tag('BendRadius',node.bendRadius||'0'),tag('SIF',node.sif||'0'),tag('PipingClass',val(node,branch,'pipingClass')),tag('Rating',val(node,branch,'rating')),tag('BoreMm',val(node,branch,'boreMm')),tag('ElementLengthMm',node.elementLengthMm||''),tag('MaterialName',val(node,branch,'materialName')),tag('MaterialCode',val(node,branch,'materialCode'))].filter(Boolean);
  if(node.dtxr)lines.push(tag('DTXR_POS',node.dtxr));
  for(const restraint of node.restraints||[])lines.push(restraintXml(restraint,records,branch.branchName,node.nodeNumber));
  lines.push('</Node>'); return lines.join('');
}

function numberedBlock(name,prefix,branch){const values=Array.from({length:9},(_,index)=>tag(`${prefix}${index+1}`,branch?.[`${prefix.toLowerCase()[0]}${index+1}`]||'')); return `<${name}>${values.join('')}</${name}>`}

export function buildCustomInputXmlResult(model,options={}){
  const work=JSON.parse(JSON.stringify(model||{branches:[]}));
  const records=[];
  recalcCustomInputElementLengths(work);
  dropShortCustomInputNodes(work,{enabled:options.dropShortElementLengthNodes!==false,thresholdMm:Number(options.shortElementLengthDropThresholdMm||6),records});
  const out=['<?xml version="1.0" encoding="UTF-8"?>','<Root>'];
  for(const branch of work.branches||[]){
    const pressure=numberedBlock('Pressure','Pressure',Object.fromEntries(Array.from({length:9},(_,i)=>[`p${i+1}`,branch[`p${i+1}`]||'']))).replace('</Pressure>',`${tag('HydroPressure',branch.hydroPressure||'')}</Pressure>`);
    const temperature=numberedBlock('Temperature','Temperature',Object.fromEntries(Array.from({length:9},(_,i)=>[`t${i+1}`,branch[`t${i+1}`]||''])));
    out.push('<Branch>',tag('Branchname',branch.branchName),tag('LineNo',branch.lineKey||''),pressure,temperature,tag('MaterialNumber',branch.materialCode||''),tag('InsulationDensity',branch.insulationDensity||''),tag('FluidDensity',branch.fluidDensity||''));
    for(const node of branch.nodes||[])out.push(nodeXml(branch,node,records));
    out.push('</Branch>');
  }
  out.push('</Root>');
  return {xmlText:out.join('\n'),diagnostics:{records}};
}

export function buildCustomInputXml(model,options={}){return buildCustomInputXmlResult(model,options).xmlText}
