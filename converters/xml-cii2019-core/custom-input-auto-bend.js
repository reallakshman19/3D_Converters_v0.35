function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function p(pos){const a=String(pos||'').match(/-?\d+(?:\.\d+)?/g)?.map(Number)||[];return a.length>=3?a:null}
function v(a,b){return [b[0]-a[0],b[1]-a[1],b[2]-a[2]]}
function mag(x){return Math.hypot(x[0],x[1],x[2])}
function angle(a,b,c){const ab=v(b,a),bc=v(b,c),m=mag(ab)*mag(bc);if(!m)return null;let cos=(ab[0]*bc[0]+ab[1]*bc[1]+ab[2]*bc[2])/m;cos=Math.max(-1,Math.min(1,cos));return Math.round((Math.acos(cos)*180/Math.PI)*10)/10}
function sch(node){return String(node.dtxr||'').match(/\bSCH\s*([0-9]+)\b/i)?.[1]||''}
export function detectCustomInputBends(model,{toleranceDeg=3}={}){
  const hits=[];
  for(const branch of model?.branches||[]) for(let i=1;i<(branch.nodes||[]).length-1;i++){
    const a=branch.nodes[i-1],b=branch.nodes[i],c=branch.nodes[i+1]; const pa=p(a.position),pb=p(b.position),pc=p(c.position); if(!pa||!pb||!pc)continue;
    const deg=angle(pa,pb,pc); if(deg===null)continue; const target=Math.abs(deg-90)<=toleranceDeg?90:(Math.abs(deg-45)<=toleranceDeg?45:null); if(!target)continue;
    hits.push({branchName:branch.branchName,nodeNumber:b.nodeNumber,angleDeg:deg,bendType:`ELBOW ${target}`,dtxr:`ELBOW ${target} DEG LR BW${sch(b)?` Sch ${sch(b)}`:''}`,apply:true});
  }
  return hits;
}
export function applyCustomInputBends(model,options={}){const hits=detectCustomInputBends(model,options); for(const hit of hits.filter(h=>h.apply!==false)){const branch=model.branches.find(b=>b.branchName===hit.branchName); const node=branch?.nodes?.find(n=>String(n.nodeNumber)===String(hit.nodeNumber)); if(node){node.componentType='BEND'; node.dtxr=node.dtxr||hit.dtxr; node.bendRadius=node.bendRadius||'0'; node.sif=node.sif||'0';}} return {model,hits};}
