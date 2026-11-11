/** Per-node nominal DN authority after effective outside diameter is frozen.
 *
 * BoreMm is nominal DN, NOT an inner diameter or branch/line-name designation.
 * A reducer changes section OD at its outlet; every downstream node with a
 * qualified OD must carry its own matching DN. Do not alter physical OD,
 * WallThickness, CII RIGID mass, or any mass-approval state here.
 */
import { qualifiedXmlCiiNominalBoreFromOd } from './weight-match-model.js';

const clean=value=>String(value??'').trim();
const num=value=>{
  const s=clean(value);
  if(!/^(?:\+)?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s))return null;
  const n=Number(s);return Number.isFinite(n)&&n>0?n:null;
};
const localName=node=>clean(node?.localName||node?.nodeName).replace(/^.*:/,'');
const child=(parent,name)=>[...(parent?.childNodes||[])]
  .find(x=>x.nodeType===1&&localName(x)===name)||null;
const val=(parent,name)=>clean(child(parent,name)?.textContent);
function set(document,parent,name,content){
  let element=child(parent,name);
  if(!element){
    element=parent?.namespaceURI
      ?document.createElementNS(parent.namespaceURI,name)
      :document.createElement(name);
    parent.appendChild(element);
  }
  if(clean(element.textContent)===content)return false;
  element.textContent=content;return true;
}
function branchNodes(branch){
  return [...(branch?.childNodes||[])].filter(x=>x.nodeType===1&&localName(x)==='Node');
}
function validXmlDocument(xml){
  if(typeof DOMParser==='undefined'||typeof XMLSerializer==='undefined')
    throw Error('BORE_OD_AUTHORITY_HOLD: DOMParser/XMLSerializer unavailable');
  const doc=new DOMParser().parseFromString(clean(xml),'application/xml');
  if(doc.getElementsByTagName('parsererror').length)
    throw Error('BORE_OD_AUTHORITY_HOLD: Invalid enriched XML');
  return doc;
}
export function nominalBoreFromNodeOd(node){
  const od=num(val(node,'OutsideDiameter')||val(node,'OuterDiameter')||val(node,'OD'));
  return od===null?null:qualifiedXmlCiiNominalBoreFromOd(od);
}

/** Idempotent post-geometry transformation, plus searchable source evidence.
 * Only BoreMm text can change. A nonstandard/unknown positive OD is diagnosed,
 * never converted by rounding it or by reading the line-name regex.
 */
export function synchronizeXmlCiiNodeBoreWithOutsideDiameter(xmlText){
  const doc=validXmlDocument(xmlText);
  const updated=[],unresolved=[],mixedBranches=[];
  const branches=[...doc.getElementsByTagName('Branch')];
  for(let branchOrdinal=0;branchOrdinal<branches.length;branchOrdinal++){
    const branch=branches[branchOrdinal],branchName=val(branch,'Branchname');
    const bores=new Set(),nodes=branchNodes(branch);
    for(let nodeOrdinal=0;nodeOrdinal<nodes.length;nodeOrdinal++){
      const node=nodes[nodeOrdinal],nodeNumber=val(node,'NodeNumber'),
        odRaw=val(node,'OutsideDiameter')||val(node,'OuterDiameter')||val(node,'OD'),
        oldRaw=val(node,'BoreMm'),od=num(odRaw),
        dn=od===null?null:qualifiedXmlCiiNominalBoreFromOd(od);
      if(dn===null){
        if(od!==null)unresolved.push({
          type:'bore-unqualified-od',branchName,branchOrdinal,
          nodeOrdinal,nodeNumber,outsideDiameterMm:od,
          existingBoreMm:oldRaw||null,
          reason:'Positive OD has no qualified standard OD-to-DN mapping; line name cannot establish nominal DN',
        });
        continue;
      }
      bores.add(dn);
      const revised=Number(dn).toFixed(3);
      if(set(doc,node,'BoreMm',revised)){
        updated.push({
          type:'node-bore-rederived-from-outside-diameter',
          branchName,branchOrdinal,nodeOrdinal,nodeNumber,
          componentRefNo:val(node,'ComponentRefNo'),
          outsideDiameterMm:od,previousBoreMm:oldRaw||null,
          revisedBoreMm:dn,authority:'effective-node-outside-diameter',
        });
      }
    }
    if(bores.size>1)mixedBranches.push({
      type:'mixed-diameter-branch',
      branchName,branchOrdinal,nominalBoresMm:[...bores].sort((a,b)=>a-b),
      reason:'A reducer or size transition prevents using one branch-wide BoreMm',
    });
  }
  const xmlOut=updated.length?new XMLSerializer().serializeToString(doc):xmlText;
  const diagnostics=[...updated,...unresolved,...mixedBranches];
  return {
    xmlText:xmlOut,appliedCount:updated.length,
    unresolvedCount:unresolved.length,
    mixedBranchCount:mixedBranches.length,
    appliedRows:updated,diagnostics,
    stats:{nodeBoreRecomputedFromEffectiveOd:updated.length,
      nodeBoreUnresolvedOd:unresolved.length,
      mixedDiameterBranches:mixedBranches.length},
  };
}
