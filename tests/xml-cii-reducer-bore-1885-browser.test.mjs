import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const fixture=path.resolve(root,'tests/.1885-reducer-runtime');
const server=createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(file);
    res.setHeader('Content-Type',/\.(?:mjs|js)$/.test(file)?'application/javascript':
      /\.html$/.test(file)?'text/html':/\.xml$/.test(file)?'application/xml':
      'application/octet-stream');
    res.end(bytes);
  }catch(error){res.writeHead(404);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1520,height:960}});
page.setDefaultTimeout(120000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
 await test('1885 actual native CII: Final Review renders DN150 for OD168.3 with 590 N unchanged',async()=>{
   const oldCii=await readFile(path.join(fixture,'original.cii'),'utf8');
   const newCii=await readFile(path.join(fixture,'corrected.cii'),'utf8');
   assert.equal(newCii,oldCii,
     'Correcting metadata BoreMm may not rewrite emitted CII geometry, mass or properties');
   await page.goto(origin+'/tests/fixtures/final-cii-property-ui-host.html');
   const observed=await page.evaluate(async()=>{
     const original=await fetch('/tests/.1885-reducer-runtime/original.xml').then(r=>r.text());
     const ciiText=await fetch('/tests/.1885-reducer-runtime/original.cii').then(r=>r.text());
     const {parseFinalCiiRigidInventory}=await import(
       '/tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js');
     const {openFinalRigidWeightReview}=await import(
       '/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
     const {synchronizeXmlCiiNodeBoreWithOutsideDiameter}=await import(
       '/converters/xml-cii2019-core/node-bore-od-authority.js');
     const sync=synchronizeXmlCiiNodeBoreWithOutsideDiameter(original);
     const readBore=(xml,no)=>{
       const doc=new DOMParser().parseFromString(xml,'application/xml');
       const nodes=[...doc.querySelectorAll('Node')];
       return nodes.find(n=>n.querySelector('NodeNumber')?.textContent===no)
         ?.querySelector('BoreMm')?.textContent||'';
     };
     const rows=parseFinalCiiRigidInventory(ciiText).rows;
     const row=rows.find(x=>x.linkedElements.some(e=>e.fromNode==='5530'&&e.toNode==='5536'));
     if(!row)throw Error('Native writer has no 5530 → 5536 flange RIGID');
     const element=row.linkedElements.find(e=>e.fromNode==='5530'&&e.toNode==='5536');
     window.__as1885={pointer:row.rigidPointer,run:{
       ok:true,ciiText,ciiName:'ASIM-1885-bore.cii',ciiInputSource:'original',
       finalRigidReviewEvidence:{
         sourceKind:'xml',engineInputText:original,
         engineInputDigest:'ASIM1885_NATIVE_CII_BOUNDED',
         effectiveSourceName:'ASIM-1885-B4.xml',
         supportConfigJson:'{}',stagedJsonText:'',weightScale:10,
       },
     }};
     openFinalRigidWeightReview(window.__as1885.run,
       {getCurrentResult:()=>window.__as1885.run});
     return {
       pointer:row.rigidPointer,
       elementIndex:element.index,od:element.outsideDiameterMm,
       weight:row.weight,length:element.lengthMm,
       initialBore5530:readBore(original,'5530'),
       correctedBore5530:readBore(sync.xmlText,'5530'),
       correctedBore5536:readBore(sync.xmlText,'5536'),
       upstreamBore:readBore(sync.xmlText,'5460'),
       changes:sync.appliedCount,mixed:sync.mixedBranchCount,
     };
   });
   assert.equal(observed.od,168.3);
   assert.equal(observed.length,147);
   assert.equal(observed.weight,590);
   assert.equal(observed.initialBore5530,'300.000');
   assert.equal(observed.correctedBore5530,'150.000');
   assert.equal(observed.correctedBore5536,'150.000');
   assert.equal(observed.upstreamBore,'300.000');
   assert.equal(observed.changes,6);
   assert.equal(observed.mixed,1);
   const row=page.locator('[data-final-rigid-row][data-pointer="'+observed.pointer+'"]');
   assert.equal(await row.count(),1);
   const bore=row.locator('[data-final-rigid-bore-source]');
   assert.match(await bore.innerText(),/DN 150/);
   assert.match(await bore.innerText(),/CII OD 168\.3 mm/);
   assert.equal(await bore.getAttribute('data-final-rigid-bore-source'),'cii-od-dn');
   assert.doesNotMatch(await bore.innerText(),/DN 300/);
   const edited=row.locator('[data-final-rigid-edited]');
   assert.equal(Number(await edited.inputValue()),590,
     'Bore repair must NOT silently edit the emitted physical RIGID mass');
   assert.deepEqual(errors,[],errors.join('\n'));
 });
} finally {
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
