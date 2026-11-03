function key(pos){const nums=String(pos||'').match(/-?\d+(?:\.\d+)?/g)?.map(Number)||[];return nums.length>=3?nums.map(v=>Math.round(v*1000)/1000).join('|'):''}
function bore(node,branch){const n=Number(node.boreMm||branch.boreMm);return Number.isFinite(n)?n:0}
export function detectCustomInputTees(model){
  const byPos=new Map();
  for(const branch of model?.branches||[]) for(const node of branch.nodes||[]){const k=key(node.position); if(!k)continue; if(!byPos.has(k))byPos.set(k,[]); byPos.get(k).push({branch,node});}
  const hits=[];
  for(const nodes of byPos.values()) if(nodes.length>=3){const sorted=[...nodes].sort((a,b)=>bore(b.node,b.branch)-bore(a.node,a.branch)); const main=sorted[0]; for(const item of sorted.slice(1)){const mb=bore(main.node,main.branch),bb=bore(item.node,item.branch); hits.push({mainBranch:main.branch.branchName,branchName:item.branch.branchName,nodeNumber:item.node.nodeNumber,mainBoreMm:mb,branchBoreMm:bb,type:mb===bb?'TEE':'OLET',dtxr:mb===bb?'TEE EQUAL BW':'BRANCH OUTLET BW',apply:true});}}
  return hits;
}
export function applyCustomInputTees(model){const hits=detectCustomInputTees(model); for(const hit of hits.filter(h=>h.apply!==false)){const branch=model.branches.find(b=>b.branchName===hit.branchName); const node=branch?.nodes?.find(n=>String(n.nodeNumber)===String(hit.nodeNumber)); if(node){node.componentType=hit.type; node.dtxr=node.dtxr||hit.dtxr; node.sif='0';}} return {model,hits};}
