function t(v){return String(v??'').trim()}
function n(v,d=null){const raw=t(v); if(!raw)return d; const m=raw.replace(/,/g,'').match(/-?\d+(?:\.\d+)?/); const x=m?Number(m[0]):Number(raw); return Number.isFinite(x)?x:d}
function ensureBranch(map,name){const key=t(name)||'/CUSTOM-UNNAMED/B1'; if(!map.has(key)) map.set(key,{branchName:key,nodes:[],_nodeMap:new Map()}); return map.get(key)}
function ensureNode(branch,row){const no=t(row.nodeNumber||row.node); if(!no) return null; if(!branch._nodeMap.has(no)){const node={nodeNumber:no,branchName:branch.branchName,endpoint:t(row.endpoint)||'1',rigid:t(row.rigid)||'0',componentType:t(row.componentType)||'PIPE'}; branch._nodeMap.set(no,node); branch.nodes.push(node);} return branch._nodeMap.get(no)}
function setDefined(obj,src,fields){for(const f of fields){const v=src[f]; if(t(v)) obj[f]=t(v)}}
const CASE_FIELDS=[...Array.from({length:9},(_,i)=>`p${i+1}`),...Array.from({length:9},(_,i)=>`t${i+1}`)];
const ENGINEERING_FIELDS=['lineKey','boreMm','outsideDiameter','wallThickness','hydroPressure','fluidDensity','insulationDensity','insulationThickness','materialName','materialCode','corrosionAllowance','pipingClass','rating',...CASE_FIELDS];
const NODE_ENGINEERING_FIELDS=['boreMm','outsideDiameter','wallThickness','fluidDensity','insulationThickness','materialName','materialCode','corrosionAllowance','pipingClass','rating',...CASE_FIELDS];
function mergeBranchFields(branch,row){setDefined(branch,row,ENGINEERING_FIELDS)}
function makeRef(branch,node){return t(node.componentRefNo)||`CUSTOM/${Math.abs(hash(branch.branchName))}/${node.nodeNumber}/${node.componentType}`}
function hash(s){let h=0; for(const ch of String(s)){h=((h<<5)-h)+ch.charCodeAt(0); h|=0;} return h}
function addRestraint(node,row){node.restraints=node.restraints||[]; node.restraints.push({type:t(row.restraintType||row.type),gap:t(row.gap),stiffness:t(row.stiffness),friction:t(row.friction),direction:t(row.direction)}); if(t(row.nodeName)) node.nodeName=t(row.nodeName)}
function explicitPosition(row){
  const direct=t(row.pos||row.position); if(direct)return direct;
  const values=[n(row.x),n(row.y),n(row.z)];
  return values.every(Number.isFinite)?values.join(' '):'';
}
export function buildCustomInputModel(input={}){
  const branches=new Map();
  for(const row of input.branchRows||[]){const b=ensureBranch(branches,row.branchName); mergeBranchFields(b,row); const node=ensureNode(b,row); if(node)setDefined(node,row,NODE_ENGINEERING_FIELDS)}
  for(const row of input.coordinateRows||[]){const b=ensureBranch(branches,row.branchName); const node=ensureNode(b,row); if(!node)continue; const position=explicitPosition(row); if(position)node.position=position}
  for(const row of input.weightRows||[]){const b=ensureBranch(branches,row.branchName); const node=ensureNode(b,row); if(!node)continue; setDefined(node,row,['componentType','rigid','endpoint','weight','componentRefNo','elementLengthMm',...NODE_ENGINEERING_FIELDS])}
  for(const row of input.restraintRows||[]){const b=ensureBranch(branches,row.branchName); const node=ensureNode(b,row); if(node)addRestraint(node,row)}
  for(const row of input.dtxrRows||[]){const b=ensureBranch(branches,row.branchName); const node=ensureNode(b,row); if(node&&t(row.dtxr))node.dtxr=t(row.dtxr)}
  const model={schema:'xml-cii-custom-input/v1',branches:[...branches.values()]};
  for(const branch of model.branches){
    branch.nodes.sort((a,b)=>n(a.nodeNumber,0)-n(b.nodeNumber,0));
    for(const node of branch.nodes){
      node.componentRefNo=makeRef(branch,node);
      for(const field of NODE_ENGINEERING_FIELDS) node[field]=t(node[field]||branch[field]);
    }
  }
  return model;
}
export function summarizeCustomInputModel(model){let nodes=0,restraints=0,dtxr=0,missingPos=0,missingOutsideDiameter=0; for(const b of model?.branches||[]) for(const nd of b.nodes||[]){nodes++; restraints+=(nd.restraints||[]).length; if(nd.dtxr)dtxr++; if(!nd.position)missingPos++; if(!nd.outsideDiameter)missingOutsideDiameter++;} return {branches:model?.branches?.length||0,nodes,restraints,dtxr,missingPos,missingOutsideDiameter}}
