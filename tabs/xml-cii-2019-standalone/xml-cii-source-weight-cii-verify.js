/** Read-only full 15-field CII integrity and source-keyed R2 engineering diff.
 * Uses existing output inventory, no second CII writer or direct output patch.
 */
import { parseFinalCiiRigidInventory } from './xml-cii-final-rigid-inventory.js';
import { ciiSha256 } from './xml-cii-final-property-reader.js';

const IEL = Object.freeze({
  BEND:[12,0,1,3], RIGID:[12,1,7,1], EXPJT:[12,2,7,1],
  RESTRANT:[12,3,7,24], DISPLMNT:[12,4,7,20], FORCMNT:[12,5,7,20],
  UNIFORM:[13,0,12,6], WIND:[13,1,12,1], OFFSETS:[13,2,12,1],
  ALLOWBLS:[13,3,12,26], 'SIF&TEES':[13,4,12,10], NODENAME:[13,5,0,1],
  REDUCERS:[14,0,0,1], FLANGES:[14,1,5,12], EQUIPMNT:[14,2,18,6],
});
const names = Object.keys(IEL);
function hold(message) { throw Error('HOLD_CII_ENGINEERING_DIFF: ' + message); }
function equal(a,b) { if(a!==b)hold('Unexpected change to '+a+' vs '+b); }
const numeric=(raw) => {const x=Number(String(raw).trim().replace(/[dD]/g,'E'));if(!Number.isFinite(x))hold('nonfinite CII number');return x;};
const numbers=(line,n)=>{const values=String(line).trim().split(/\s+/).filter(Boolean).map(numeric);
  if(values.length!==n||values.some(x=>!Number.isSafeInteger(x)||x<0))hold('invalid 15-field IEL integer row');
  return values;};

export function indexAll15CiiAuxiliaryPointers(text) {
  if(typeof text!=='string'||!text.trim())hold('empty CII');
  const lines=text.replace(/\r\n?/g,'\n').split('\n');
  if(lines.at(-1)==='')lines.pop();
  const section=new Map();let active=null;
  for(const line of lines) {
    const header=/^\s*#\$\s+([A-Z0-9_&]+)\s*$/i.exec(line);
    if(header){
      const label=header[1].toUpperCase();
      if(section.has(label))hold('duplicate section '+label);
      active=label;section.set(label,[]);
    } else if(active)section.get(active).push(line);
    else if(line.trim())hold('nonempty CII preamble');
  }
  const inventory=parseFinalCiiRigidInventory(text);
  const control=section.get('CONTROL')||[];
  if(control.length!==4)hold('CONTROL payload must be four rows');
  const counters=control.map((line,i)=>numbers(line,i===3?1:6));
  const declared = {
    BEND:counters[1][0],RIGID:counters[1][1],EXPJT:counters[1][2],
    RESTRANT:counters[1][3],DISPLMNT:counters[1][4],FORCMNT:counters[1][5],
    UNIFORM:counters[2][0],WIND:counters[2][1],OFFSETS:counters[2][2],
    ALLOWBLS:counters[2][3],'SIF&TEES':counters[2][4],NODENAME:counters[0][3],
    REDUCERS:counters[0][4],FLANGES:counters[0][5],EQUIPMNT:counters[3][0],
  };
  const physical={};
  for(const name of names){
    const width=IEL[name][3], rows=section.get(name)||[];
    if(rows.length%width!==0)hold(name+' block width invalid');
    physical[name]=rows.length/width;
    if(physical[name]!==declared[name])hold(name+' CONTROL/physical record mismatch');
  }
  const elementRows=section.get('ELEMENTS')||[];
  if(elementRows.length!==counters[0][0]*15)hold('ELEMENT payload/CONTROL mismatch');
  const elements=[];
  for(let i=0;i<counters[0][0];i++){
    const block=elementRows.slice(15*i,15*i+15);
    const integerRows={12:numbers(block[12],6),13:numbers(block[13],6),
      14:numbers(block[14],3)};
    const pointers={};
    for(const [name,[row,index]]of Object.entries(IEL)){
      const ptr=integerRows[row][index];
      if(ptr>physical[name])hold('ELEMENT '+(i+1)+' '+name+' pointer '+ptr+' out of bounds');
      pointers[name]=ptr;
    }
    const parsed=inventory.rows.flatMap(r=>r.linkedElements)
      .find(e=>e.index===i+1); // zero-pointer elements use ELEMENT metadata below
    elements.push({index:i+1,pointers,block});
  }
  // Check existing independent RIGID inventory parser agrees on every RIGID link.
  for(const row of inventory.rows)for(const link of row.linkedElements){
    if(elements[link.index-1]?.pointers.RIGID!==row.rigidPointer)
      hold('RIGID inventory and complete IEL parser disagree');
  }
  return {section,physical,declared,inventory,elements,pointerFieldsValidated:15};
}

function elementKey(element){return [
  element.branchName,element.fromNode,element.toNode,
  Number(element.lengthMm).toFixed(6),String(element.outsideDiameterMm)].join('|');}
function linkedMap(index) {
  const map=new Map();
  for(const r of index.inventory.rows){
    if(r.linkedElements.length!==1)hold('unreferenced/shared RIGID cannot be source-reconciled');
    const key=elementKey(r.linkedElements[0]);
    if(map.has(key))hold('duplicate emitted source geometry maps to multiple RIGIDs');
    map.set(key,{row:r,element:r.linkedElements[0]});
  }
  return map;
}
function firstRigidToken(line){
  // Actual RIGID record starts with a 15-character real field.
  const field=String(line||'').slice(0,15);
  const tail=String(line||'').slice(15);
  if(!field.trim())hold('blank emitted RIGID weight');
  return {weight:numeric(field),tail};
}
function stableElementBlock(before,after){
  for(let i=0;i<15;i++){
    if(i===12||i===13||i===14)continue;
    if(before[i]!==after[i])hold('Unapproved ELEMENT engineering change row '+(i+1));
  }
}
function sameUnchangedSections(a,b){
  if(JSON.stringify([...a.section.keys()])!==JSON.stringify([...b.section.keys()]))
    hold('CII section sequence changed');
  for(const [name,rows] of a.section) {
    if(name==='ELEMENTS'||name==='RIGID')continue;
    if(JSON.stringify(rows)!==JSON.stringify(b.section.get(name)))
      hold('Unapproved CII section changed: '+name);
  }
}
/** Reconciles from/to+branch+length/OD, not the original RIGID pointer number. */
export async function verifySourceEditedCii({originalCiiText,revisedCiiText,approved,originalSha256}) {
  if(await ciiSha256(originalCiiText)!==originalSha256)hold('stale original CII digest');
  const old=indexAll15CiiAuxiliaryPointers(originalCiiText);
  const now=indexAll15CiiAuxiliaryPointers(revisedCiiText);
  sameUnchangedSections(old,now);
  if(old.elements.length!==now.elements.length)hold('ELEMENT count changed');
  // Weight edit must not change the actual ELEMENT engineering fields or
  // other auxiliary pointers. New RIGID record indices may be renumbered.
  const sourceElementKeys = new Map();
  const originalAll = new Map();
  for(let i=0;i<old.elements.length;i++){
    const elem = old.elements[i];
    const k=elem.block.slice(0,12).join('\n');
    if(sourceElementKeys.has(k))hold('nonunique ELEMENT immutable key');
    sourceElementKeys.set(k,elem);
    originalAll.set(i+1,elem);
  }
  for(const elem of now.elements){
    const key=elem.block.slice(0,12).join('\n');
    const original=sourceElementKeys.get(key);
    if(!original)hold('CII ELEMENT engineering geometry/metadata changed');
    stableElementBlock(original.block,elem.block);
    for(const n of names){
      if(n!=='RIGID' && original.pointers[n]!==elem.pointers[n])
        hold('Non-RIGID auxiliary pointer changed: '+n);
    }
    sourceElementKeys.delete(key);
  }
  if(sourceElementKeys.size)hold('missing original emitted ELEMENT');
  const oldLinks=linkedMap(old), newLinks=linkedMap(now);
  if(oldLinks.size!==newLinks.size)hold('source-backed RIGID edge keys differ');
  const target = old.inventory.rows[approved.rigidPointer-1];
  if(target?.linkedElements?.length!==1)hold('approved target pointer is not uniquely linked');
  const selected=elementKey(target.linkedElements[0]);
  if(selected!==approved.originalEdgeKey)hold('stale approved source edge');
  const expected=approved.newValue * approved.weightScale;
  let modified=0, oldPointer=approved.rigidPointer,newPointer=null;
  const diffRows=[];
  for(const [key,{row:original}]of oldLinks){
    const fresh=newLinks.get(key);
    if(!fresh)hold('RIGID emitted source edge missing/modified');
    const beforeRecord=firstRigidToken(old.section.get('RIGID')[original.rigidPointer-1]);
    const afterRecord=firstRigidToken(now.section.get('RIGID')[fresh.row.rigidPointer-1]);
    if(beforeRecord.tail!==afterRecord.tail)
      hold('Unexpected RIGID type/second-field difference for edge '+key);
    const isApproved = key===selected;
    const anticipated = isApproved?expected:beforeRecord.weight;
    if(Math.abs(afterRecord.weight-anticipated) > 0.00001)
      hold('Unapproved or missing RIGID weight change at edge '+key);
    if(isApproved){
      modified++;newPointer=fresh.row.rigidPointer;
      if(afterRecord.weight===beforeRecord.weight)hold('Approved edited Weight was overwritten');
      diffRows.push({oldRigidPointer:original.rigidPointer,
        newRigidPointer:fresh.row.rigidPointer, linkedElement:fresh.element.index,
        oldWeight:beforeRecord.weight,newWeight:afterRecord.weight,
        newSourceWeight:approved.newValue,unit:'CII_OUTPUT_WEIGHT'});
    }
  }
  if(modified!==1)hold('expected exactly one approved RIGID source edge');
  return {status:'PASS_ENGINEERING_DIFF',valueIntegrity:'SERIALIZED_VALUES_VERIFIED',
    all15PointersValid:true,expectedDifferences:diffRows,
    unexpectedDifferences:0,pointerReconciledBySource:true,
    originalCiiSha256:originalSha256,
    revisedCiiSha256:await ciiSha256(revisedCiiText), oldPointer,newPointer };
}
