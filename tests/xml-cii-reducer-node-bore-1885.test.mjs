/** Regression: ASIM-1885 B4 DN300→DN150 reducer, 147 mm weldneck flange.
 *
 * User-provided numeric/geometry benchmark embedded as a BOUNDED fixture:
 * Node 5460 OD323.8, reducer outlet 5470 OD168.3, FLAN 5530→5536
 * OD168.3 / CII emitted 590 N / Class 900. NOT a full original project run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installSimpleXmlDom,_test } from './helpers/simple-xml-dom.mjs';
import { synchronizeXmlCiiNodeBoreWithOutsideDiameter }
  from '../converters/xml-cii2019-core/node-bore-od-authority.js';
import { collectXmlCiiWeightMatchRows, qualifiedXmlCiiNominalBoreFromOd }
  from '../converters/xml-cii2019-core/weight-match-model.js';
import { applyPreviewBoreWallAuthority }
  from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-bore-wall-authority.js';
import { buildFinalRigidSourceContexts }
  from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-source-context.js';
import { buildFinalCiiNearestSuggestions }
  from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-nearest-suggestions.js';

Object.defineProperty(_test.SimpleElement.prototype,'nodeType',{get(){return 1;},configurable:true});
Object.defineProperty(_test.SimpleElement.prototype,'childNodes',{get(){return this.children;},configurable:true});
installSimpleXmlDom();
const branchName='/ASIM-1885-PL-6"-S8810106-HOT-01/B4';
const node=(no,type,ep,od,x,weight,ref,dtxr='')=>
  '<Node><NodeNumber>'+no+'</NodeNumber>'+
  '<ComponentType>'+type+'</ComponentType><Endpoint>'+ep+'</Endpoint>'+
  (type==='FLAN'?'<Rigid>2</Rigid>':'')+
  '<ComponentRefNo>'+ref+'</ComponentRefNo>'+
  '<OutsideDiameter>'+od+'</OutsideDiameter>'+
  '<WallThickness>10.97</WallThickness><Position>'+x+' 0 0</Position>'+
  '<BoreMm>300.000</BoreMm><PipingClass>HOT</PipingClass>'+
  '<Rating>900</Rating><Weight>'+weight+'</Weight>'+
  (dtxr?'<DTXR_POS>'+dtxr+'</DTXR_POS>':'')+
  '</Node>';
const raw='<PipeStressExport><Pipe><Branch><Branchname>'+branchName+'</Branchname>'+
  node('5460','REDU',1,323.8,0,0,'=1006657947/64')+
  node('5470','REDU',2,168.3,203.08,0,'=1006657947/64')+
  node('5480','ELBO',0,168.3,432.08,0,'=1006657947/66')+
  node('5500','ATTA',0,168.3,600,0,'=1006649755/5711')+
  node('5530','FLAN',1,168.3,1594.6,57.25,'=1006657947/152','WELDING NECK FLANGE SCH 80 900#')+
  node('5536','FLAN',2,168.3,1741.6,59,'=1006657947/152','WELDING NECK FLANGE SCH 80 900#')+
  node('5538','PIPE',0,168.3,2354.8,0,'=1006657947/70')+
  '</Branch></Pipe></PipeStressExport>';
const document=xml=>new DOMParser().parseFromString(xml,'application/xml');
const field=(node,name)=>(node?.children||[])
  .find(child=>child.localName===name)?.textContent;
const lookup=(xml,no)=>[...document(xml).getElementsByTagName('Node')]
  .find(x=>field(x,'NodeNumber')===String(no));
const inventory={rows:[{rigidPointer:15,weight:590,rawWeight:'590',
 linkedElements:[{index:234,branchName,fromNode:'5530',toNode:'5536',
   lengthMm:147,outsideDiameterMm:168.3}]}]};
const evidence=xml=>({sourceKind:'xml',engineInputText:xml,
 engineInputDigest:'test-pinned-source',stagedJsonText:'',weightScale:10,
 supportConfigJson:JSON.stringify({weight:{masterRows:[{id:'FLAN-DN150-900'}]}})});

test('ASIM-1885 reducer OD 323.8→168.3 must yield DN300→DN150 per node',()=>{
 assert.equal(qualifiedXmlCiiNominalBoreFromOd(323.8),300);
 assert.equal(qualifiedXmlCiiNominalBoreFromOd(168.3),150);
 const synced=synchronizeXmlCiiNodeBoreWithOutsideDiameter(raw);
 assert.equal(synced.mixedBranchCount,1);
 assert.equal(synced.appliedCount,6);
 const expected={5460:300,5470:150,5480:150,5500:150,5530:150,5536:150,5538:150};
 for(const [no,dn] of Object.entries(expected)){
   const before=lookup(raw,no),after=lookup(synced.xmlText,no);
   assert.equal(field(after,'BoreMm'),dn.toFixed(3),'Node '+no);
   for(const name of ['OutsideDiameter','Weight','WallThickness','PipingClass',
     'Rating','ComponentRefNo','ComponentType','Endpoint','DTXR_POS']){
     assert.equal(field(after,name),field(before,name),no+' '+name+' is invariant');
   }
 }
 assert.equal(synchronizeXmlCiiNodeBoreWithOutsideDiameter(synced.xmlText).appliedCount,0,
   'Idempotent after first correction');
 assert.ok(synced.diagnostics.some(x=>x.branchName===branchName&&
   x.type==='mixed-diameter-branch'));
});

test('Unknown positive OD must not become DN300 from stale XML bore',()=>{
 const altered=raw.replace('<OutsideDiameter>168.3</OutsideDiameter>'+
   '<WallThickness>10.97</WallThickness><Position>1741.6',
   '<OutsideDiameter>123.45</OutsideDiameter>'+
   '<WallThickness>10.97</WallThickness><Position>1741.6');
 const synced=synchronizeXmlCiiNodeBoreWithOutsideDiameter(altered);
 assert.equal(field(lookup(synced.xmlText,5536),'BoreMm'),'300.000',
   'Unknown OD is diagnosed but never overwritten with an invented DN');
 assert.ok(synced.diagnostics.some(x=>x.type==='bore-unqualified-od'&&x.nodeNumber==='5536'));
 assert.equal(qualifiedXmlCiiNominalBoreFromOd(123.45),null);
});

test('Preview per-node size follows OD, never branch regex or first-node DN',()=>{
 const preview=applyPreviewBoreWallAuthority({
   xmlText:raw,stagedJsonText:'',config:{},
   result:{branchRows:[{branchName,sizeMm:150,size:'150mm',pipingClass:'HOT'}],
     nodeRows:[
       {branchName,nodeNumber:'5460',componentRefNo:'=1006657947/64',endpoint:'1',boreMm:300},
       {branchName,nodeNumber:'5470',componentRefNo:'=1006657947/64',endpoint:'2',boreMm:300},
       {branchName,nodeNumber:'5536',componentRefNo:'=1006657947/152',endpoint:'2',boreMm:300},
     ]},
 });
 const branch=preview.branchRows[0];
 assert.equal(branch.sizeMm,300,'first node OD323.8 is DN300 despite 6-inch line regex');
 assert.equal(branch.mixedDiameterBranch,true);
 assert.deepEqual(branch.branchNodeNominalBoresMm,[300,150]);
 assert.equal(preview.nodeRows.find(x=>x.nodeNumber==='5470').boreMm,150);
 assert.equal(preview.nodeRows.find(x=>x.nodeNumber==='5536').boreMm,150);
});

test('Final ELEMENT 234 / RIGID 15: emitted 168.3 OD always displays DN150, mass 590 unchanged',()=>{
 const source=buildFinalRigidSourceContexts(inventory,evidence(raw));
 const final=source[0];
 assert.equal(final.bore.value,150);
 assert.equal(final.bore.source,'cii-od-dn');
 assert.equal(final.bore.original,'168.3');
 assert.equal(inventory.rows[0].weight,590);
 // Ranker may return catalog comparisons only for DN150; DN300 must never
 // reach the weight ranker even if raw XML BoreMm is stale.
 const calls=[];
 const rankWeightCandidates=params=>{
   calls.push(params);
   return {candidates:params.boreMm===150?[{
     selectedWeight:59,ratingExact:true,boreDelta:0,
     lengthQualified:true,weightMethod:'master',typeDesc:'Weldneck Flange',
     rowLength:147,totalScore:1,rowData:{id:'FLAN-DN150-900'},
   }]:[]};
 };
 const candidates=buildFinalCiiNearestSuggestions(inventory,evidence(raw),source,
   {rankWeightCandidates})[0];
 assert.ok(calls.every(x=>x.boreMm===150),'Never rank DN300 for OD168.3');
 // If other source conflicts suppress suggestions, still do not show DN300.
 assert.ok(candidates.every(x=>x.basis.includes('Bore DN 150')));
 assert.ok(!candidates.some(x=>x.referenceWeight===1938.51),
   'Old DN300 approximate reference cannot be retained as authority');
});

test('Weight Match issue ranking is DN150 even on uncorrected BoreMm=300 source',()=>{
 const rows=collectXmlCiiWeightMatchRows(raw,'',{});
 const flange=rows.find(x=>x.nodeNumber==='5536');
 assert.ok(flange,'Flanged endpoint must appear in review inventory');
 assert.equal(flange.boreMm,150);
});
