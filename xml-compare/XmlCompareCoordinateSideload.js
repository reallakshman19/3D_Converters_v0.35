import { normalizeCoordinateDiagnostic, summarizeCoordinateDiagnostics } from './XmlCompareCoordinateDiagnostics.js';
export const XML_COMPARE_COORDINATE_SIDELOAD_SCHEMA='xml-compare-coordinate-sideload/v1';
const clean=(v)=>String(v??'').trim();
const num=(v)=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const field=(o,...names)=>names.map((n)=>o?.[n]??o?.attrs?.[n]??o?.attributes?.[n]).find((v)=>v!=null);
export function parseCoordinateValue(value){const m=clean(value).replace(/,/g,'').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);return m?num(m[0]):null;}
export function normalizeNodeKey(value){const raw=clean(value).replace(/^["']|["']$/g,''),n=num(raw);return n!=null&&Math.abs(n-Math.round(n))<1e-6?String(Math.round(n)):raw.replace(/\.0+$/,'');}
export function createCoordinatePoint(x,y,z){const p={x:num(x),y:num(y),z:num(z)};return Object.values(p).every((v)=>v!=null)?Object.freeze(p):null;}
export function isCaesarUnsetNumber(value){const n=parseCoordinateValue(value);return n!=null&&Math.abs(n+1.0101)<1e-6;}
export function deltaComponent(value){const n=parseCoordinateValue(value);return n==null||isCaesarUnsetNumber(value)?0:n;}
export function addPoint(a,b){return createCoordinatePoint(Number(a?.x)+Number(b?.x),Number(a?.y)+Number(b?.y),Number(a?.z)+Number(b?.z));}
export function subtractPoint(a,b){return createCoordinatePoint(Number(a?.x)-Number(b?.x),Number(a?.y)-Number(b?.y),Number(a?.z)-Number(b?.z));}
export function distancePoint(a,b){if(!a||!b)return Number.POSITIVE_INFINITY;const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
export function formatCoordinate(value){const n=num(value);return n==null?'':n.toFixed(3);}
export function deltaVectorFromElement(element={}){return createCoordinatePoint(deltaComponent(field(element,'DELTA_X','deltaX','dx')),deltaComponent(field(element,'DELTA_Y','deltaY','dy')),deltaComponent(field(element,'DELTA_Z','deltaZ','dz')))||createCoordinatePoint(0,0,0);}
function nums(line){return [...clean(line).replace(/,/g,' ').matchAll(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((m)=>Number(m[0]));}
function headerLike(line){return /node|global|coord|x\b|y\b|z\b/i.test(line)&&nums(line).length<4;}
function diag(code,message,details={}){return Object.freeze({severity:code==='coordinate_conflict'?'WARNING':'INFO',code,message,details:Object.freeze(details)});}
export function parseCoordinateSideloadTable(text=''){
  const diagnostics=[],byNode=new Map();
  for(const [i,line] of String(text||'').split(/\r?\n/).entries()){
    if(!clean(line))continue;if(headerLike(line))continue;
    const values=nums(line),sourceRow=i+1;
    if(values.length<4){diagnostics.push(diag('coordinate_row_incomplete','Coordinate row has fewer than 4 numeric values.',{sourceRow}));continue;}
    const row=Object.freeze({node:normalizeNodeKey(values[0]),x:values[1],y:values[2],z:values[3],sourceRow});
    const old=byNode.get(row.node);
    if(old){const d=distancePoint(old,row);diagnostics.push(diag(d>1e-6?'coordinate_conflict':'coordinate_duplicate_node',`Duplicate coordinate for node ${row.node}.`,{sourceRow,firstRow:old.sourceRow,distance:d}));continue;}
    byNode.set(row.node,row);
  }
  if(!byNode.size&&clean(text))diagnostics.push(diag('coordinate_table_empty','No valid coordinate rows were parsed.'));
  return Object.freeze({coordinates:Object.freeze([...byNode.values()]),diagnostics:Object.freeze(diagnostics)});
}
function elementNodes(element={}){return{fromNode:normalizeNodeKey(field(element,'fromNode','FROM_NODE','from','FROM')),toNode:normalizeNodeKey(field(element,'toNode','TO_NODE','to','TO'))};}
function origins(input){if(Array.isArray(input))return input;if(input instanceof Map)return [...input.entries()].map(([node,p])=>({node,...p}));return Object.entries(input||{}).map(([node,p])=>({node,...p}));}
function addSolved(map,basis,node,point,basisNode,source,diagnostics,tol){if(!node||!point)return false;const current=map[node];if(current){const d=distancePoint(current,point);if(d>tol)diagnostics.push(diag('coordinate_conflict',`Coordinate conflict for node ${node}.`,{node,existing:current,candidate:point,distance:d}));return false;}map[node]=Object.freeze({node,x:point.x,y:point.y,z:point.z,basisNode:basisNode||node,source:source||'propagated'});basis[node]=basisNode||node;return true;}
export function applySolvedCoordinatesToElements({elements=[],solvedNodes={},basisNodeByNode={}}={}){return Object.freeze((elements||[]).map((element,index)=>{const nodes=elementNodes(element),from=solvedNodes[nodes.fromNode]||null,to=solvedNodes[nodes.toNode]||null;return Object.freeze({index,fromNode:nodes.fromNode,toNode:nodes.toNode,from,to,delta:deltaVectorFromElement(element),basisNode:basisNodeByNode[nodes.fromNode]||basisNodeByNode[nodes.toNode]||from?.basisNode||to?.basisNode||'',status:from&&to?'SOLVED':'UNRESOLVED'});}));}
export function buildCoordinatePropagationReport({elements=[],solvedNodes={},diagnostics=[],toleranceMm=1}={}){const applied=applySolvedCoordinatesToElements({elements,solvedNodes,basisNodeByNode:Object.fromEntries(Object.entries(solvedNodes||{}).map(([k,v])=>[k,v.basisNode]))});const unresolved=applied.filter((e)=>e.status!=='SOLVED').length;return summarizeCoordinateDiagnostics(diagnostics,{originCount:Object.values(solvedNodes).filter((n)=>n.source==='table4').length,solvedNodeCount:Object.keys(solvedNodes).length,solvedElementCount:applied.length-unresolved,unresolvedElementCount:unresolved,toleranceMm});}
function addElementConflict(diagnostics,seen,nodes,distance){const key=`${nodes.fromNode}->${nodes.toNode}`;if(seen.has(key))return;seen.add(key);diagnostics.push(diag('coordinate_conflict','Element delta conflicts with solved node coordinates.',{fromNode:nodes.fromNode,toNode:nodes.toNode,distance}));}
export function solveElementCoordinates({elements=[],originCoordinates=[],toleranceMm=1}={}){
  const tolerance=Number.isFinite(Number(toleranceMm))?Number(toleranceMm):1,solvedNodes={},basisNodeByNode={},diagnostics=[],conflictsSeen=new Set();
  for(const row of origins(originCoordinates)){const node=normalizeNodeKey(row.node);addSolved(solvedNodes,basisNodeByNode,node,createCoordinatePoint(row.x,row.y,row.z),node,'table4',diagnostics,tolerance);}
  let changed=true,guard=0;
  while(changed&&guard++<(elements.length+1)*4){changed=false;for(const element of elements){const nodes=elementNodes(element),delta=deltaVectorFromElement(element),from=solvedNodes[nodes.fromNode],to=solvedNodes[nodes.toNode];if(from&&!to)changed=addSolved(solvedNodes,basisNodeByNode,nodes.toNode,addPoint(from,delta),from.basisNode,'propagated',diagnostics,tolerance)||changed;else if(to&&!from)changed=addSolved(solvedNodes,basisNodeByNode,nodes.fromNode,subtractPoint(to,delta),to.basisNode,'propagated',diagnostics,tolerance)||changed;else if(from&&to){const d=distancePoint(addPoint(from,delta),to);if(d>tolerance)addElementConflict(diagnostics,conflictsSeen,nodes,d);}}}
  const elementCoordinates=applySolvedCoordinatesToElements({elements,solvedNodes,basisNodeByNode});
  for(const item of elementCoordinates)if(item.status!=='SOLVED')diagnostics.push(diag('coordinate_unresolved_element','Element coordinates could not be fully solved.',{fromNode:item.fromNode,toNode:item.toNode}));
  return Object.freeze({schema:XML_COMPARE_COORDINATE_SIDELOAD_SCHEMA,solvedNodes:Object.freeze(solvedNodes),elementCoordinates,diagnostics:Object.freeze(diagnostics.map(normalizeCoordinateDiagnostic)),summary:Object.freeze(buildCoordinatePropagationReport({elements,solvedNodes,diagnostics,toleranceMm:tolerance}))});
}
