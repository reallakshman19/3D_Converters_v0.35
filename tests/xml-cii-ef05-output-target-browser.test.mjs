/** Real Chromium + Pyodide regression of an explicit final CII target.
 * Synthetic producer fixture is converted with actual production Python writer.
 * Private uploaded EF-05 inputs are validated separately, never committed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const fixture=path.resolve(root,'tests/.ef05-output-target-runtime');
const server=createServer(async(req,res)=>{
 try {
  const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const resolved=path.resolve(root,'.'+name);
  if(!resolved.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=await readFile(resolved);
  res.setHeader('Content-Type',/\.(?:mjs|js)$/.test(resolved)?'application/javascript':
    /\.html$/.test(resolved)?'text/html':
    /\.wasm$/.test(resolved)?'application/wasm':
    /\.xml$/.test(resolved)?'application/xml':'application/octet-stream');
  res.end(bytes);
 }catch(e){res.writeHead(404);res.end(e.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1480,height:960}});
page.setDefaultTimeout(240000);
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
try {
 await test('EF-05 output target: real Pyodide source 1050.70 N → 0.001 N and verified downloads',async()=>{
  await page.goto(origin+'/tests/fixtures/r2-source-weight-browser-host.html');
  const target=await page.evaluate(async()=>{
   const xml=await fetch('/tests/.ef05-output-target-runtime/original.xml').then(r=>r.text());
   const cii=await fetch('/tests/.ef05-output-target-runtime/original.cii').then(r=>r.text());
   const {ciiSha256}=await import('/tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js');
   const {initializeSourceWeightSession}=
     await import('/tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js');
   const run={ok:true,ciiText:cii,ciiName:'output-target-original.cii',ciiInputSource:'original',
     finalRigidReviewEvidence:{
       sourceKind:'xml',engineInputText:xml,
       engineInputSha256:await ciiSha256(xml),
       originalCiiSha256:await ciiSha256(cii),
       engineInputDigest:'R4A_SYNTHETIC_CURRENT_WRITER',
       effectiveSourceName:'output-target.xml',
       weightScale:10,supportConfigJson:'{}',stagedJsonText:'',
       effectiveOptions:{coordsMode:'first',kgToNewton:true,
         splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
         outputMode:'both',analyzeTopology:false,generateTopoFix:false,
         useTopoFixForCii:false},
     }};
   const session=await initializeSourceWeightSession(run,{requireR4aLineage:true});
   const row=session.rows.find(x=>x.sourceNode?.componentRefNo==='/RIGID-40');
   if(!row?.eligible||row.originalCiiWeight!==1050.7)
     throw Error('Source writer or original CII weight not independently qualified');
   window.__ef05={run,pointer:row.rigidPointer};
   const {openFinalRigidWeightReview}=await import(
     '/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
   openFinalRigidWeightReview(run,{getCurrentResult:()=>run});
   return {pointer:row.rigidPointer,sourceNode:row.sourceNode.nodeNumber,
     originalWeight:row.originalCiiWeight};
  });
  assert.equal(target.originalWeight,1050.7);
  await page.locator('[data-source-weight-open]').click();
  await page.waitForFunction(()=>document.querySelector('[data-source-weight-status]')?.
    textContent.includes('PASS:'),null,{timeout:240000});
  await page.locator('[data-source-weight-search]').fill(String(target.pointer));
  await page.locator('[data-source-weight-pointer]').selectOption(String(target.pointer));
  assert.equal(await page.locator('[data-source-weight-output-target]').isDisabled(),false);
  await page.locator('[data-source-weight-output-target]').fill('0.001');
  assert.equal(await page.locator('[data-source-weight-value]').inputValue(),'0.0001');
  await page.locator('[data-source-weight-owner-approved]').check();
  await page.locator('[data-source-weight-approved]').check();
  await page.locator('[data-source-weight-preview]').click();
  const preview=await page.locator('[data-source-weight-report]').textContent();
  assert.match(preview,/explicit output target 0\.001/);
  assert.equal(await page.locator('[data-source-weight-apply]').isDisabled(),false);
  await page.locator('[data-source-weight-apply]').click();
  await page.waitForFunction(()=>document.querySelector('[data-source-weight-report]')?.
    textContent.includes('VERIFIED SOURCE-BACKED RE-EXTRACTION'),null,{timeout:240000});
  const report=await page.locator('[data-source-weight-report]').textContent();
  assert.match(report,/EXPLICIT CII OUTPUT TARGET VERIFIED: 0\.001/);
  for(const [kind,filename] of [['revised-xml','approved.xml'],['revised-cii','approved.cii']]){
   const b=page.locator('[data-source-weight-'+kind+']');
   assert.equal(await b.isDisabled(),false);
   const [download]=await Promise.all([page.waitForEvent('download'),b.click()]);
   assert.equal(await readFile(await download.path(),'utf8'),
     await readFile(path.join(fixture,filename),'utf8'));
  }
  const [auditFile]=await Promise.all([
   page.waitForEvent('download'),page.locator('[data-source-weight-audit]').click()]);
  const audit=JSON.parse(await readFile(await auditFile.path(),'utf8'));
  assert.equal(audit.requestedOutputVerification.requestedCiiOutputWeight,0.001);
  assert.equal(audit.requestedOutputVerification.actualCiiOutputWeight,0.001);
  assert.equal(audit.ciiEngineeringDiff.expectedDifferences[0].oldWeight,1050.7);
  assert.equal(audit.ciiEngineeringDiff.unexpectedDifferences,0);
  assert.deepEqual(errors,[],errors.join('\n'));
 });
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
