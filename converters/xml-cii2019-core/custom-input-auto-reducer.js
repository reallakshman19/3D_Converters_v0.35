function bore(node,branch){const n=Number(node.boreMm||branch.boreMm);return Number.isFinite(n)?n:0}
function samePos(a,b){return String(a||'').trim()===String(b||'').trim()}
export function detectCustomInputReducers(model){
  const hits=[];
  for(const branch of model?.branches||[]) for(let i=1;i<(branch.nodes||[]).length;i++){
    const a=branch.nodes[i-1],b=branch.nodes[i],ab=bore(a,branch),bb=bore(b,branch); if(!ab||!bb||ab===bb)continue;
    hits.push({branchName:branch.branchName,fromNode:a.nodeNumber,toNode:b.nodeNumber,fromBoreMm:ab,toBoreMm:bb,type:samePos(a.position,b.position)?'ECC REDU':'CONC REDU',dtxr:`${samePos(a.position,b.position)?'ECCENTRIC':'CONCENTRIC'} REDUCER BW`,apply:true});
  }
  return hits;
}
export function applyCustomInputReducers(model){const hits=detectCustomInputReducers(model); for(const hit of hits.filter(h=>h.apply!==false)){const branch=model.branches.find(b=>b.branchName===hit.branchName); const node=branch?.nodes?.find(n=>String(n.nodeNumber)===String(hit.toNode)); if(node){node.componentType='REDU'; node.dtxr=node.dtxr||hit.dtxr; node.endBoreMm=hit.toBoreMm;}} return {model,hits};}
