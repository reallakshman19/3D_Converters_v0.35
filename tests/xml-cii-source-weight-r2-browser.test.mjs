/** ACTUAL Chromium + vendored Pyodide + production browser CII engine E2E.
 * Input/output pairs are generated in CI by existing Python converter and
 * explicitly do not claim archival Owner CII independence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { chromium } from 'playwright';

const root=resolve(import.meta.dirname,'..');
const generated=resolve(root,'tests/.r2-synthetic-runtime');
const serve=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    const path=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);
    res.setHeader('Content-Type',/\.(?:js|mjs)$/.test(path) ? 'application/javascript' :
      /\.wasm$/.test(path) ? 'application/wasm' :
      /\.xml$/.test(path) ? 'application/xml' :
      /\.html$/.test(path) ? 'text/html' : 'application/octet-stream');
    res.end(bytes);
  }catch(e){res.writeHead(404);res.end(e.message);}
});
await new Promise(resolve=>serve.listen(0,'127.0.0.1',resolve));
const address='http://127.0.0.1:'+serve.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1360,height:850}});
page.setDefaultTimeout(180000);
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
  await test('R2 ACTUAL Chromium/Pyodide: no-edit parity, source Weight 6→2.984, CII 60→29.84 and verified browser downloads',async()=>{
    await page.goto(address+'/tests/fixtures/r2-source-weight-browser-host.html');
    const started=await page.evaluate(async()=>{
      const xml=await (await fetch('/tests/.r2-synthetic-runtime/original.xml')).text();
      const cii=await (await fetch('/tests/.r2-synthetic-runtime/original.cii')).text();
      const {ciiSha256}=await import('/tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js');
      const {initializeSourceWeightSession,applySourceBackedWeightChange}=
        await import('/tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js');
      const result={ok:true,ciiText:cii,ciiName:'current-writer-synthetic.cii',
        ciiInputSource:'original',
        finalRigidReviewEvidence:{
          sourceKind:'xml',engineInputText:xml,
          engineInputSha256:await ciiSha256(xml),originalCiiSha256:await ciiSha256(cii),
          engineInputDigest:'R2-BROWSER-PYODIDE-SYNTHETIC',
          effectiveSourceName:'r2-synthetic.xml',weightScale:10,
          supportConfigJson:'{}',stagedJsonText:'',
          effectiveOptions:{coordsMode:'first',kgToNewton:true,
            splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
            outputMode:'both',analyzeTopology:false,
            generateTopoFix:false,useTopoFixForCii:false},
        }};
      window.__r2={xml,cii,result,initializeSourceWeightSession,applySourceBackedWeightChange};
      return {xmlLength:xml.length,ciiLength:cii.length};
    });
    assert.ok(started.ciiLength>0);
    const noedit=await page.evaluate(async()=>{
      const {initializeSourceWeightSession,result}=window.__r2;
      const session=await initializeSourceWeightSession(result);
      window.__r2.session=session;
      const chosen=session.rows.find(x=>x.sourceNode?.componentRefNo==='/RIGID-40');
      return {status:session.noEditParity.status,valid:session.valueIntegrity,
        allowed:chosen.eligible,ownerStatus:chosen.status,pointer:chosen.rigidPointer,
        ownersHeld:session.rows.filter(x=>!x.eligible).length,
        ownersQualified:session.rows.filter(x=>x.eligible).length,
        totalRigids:session.rows.length,
        duplicateComponentRefs:(()=>{const counts=new Map();for(const n of session.verifiedLineage?.sourceNodes||[]) if(n.componentRefNo)counts.set(n.componentRefNo,(counts.get(n.componentRefNo)||0)+1);return [...counts.values()].filter(x=>x>1).length;})()};
    });
    assert.equal(noedit.status,'PASS_EXACT_REPLAY');
    assert.equal(noedit.valid,'SERIALIZED_VALUES_VERIFIED');
    assert.equal(noedit.allowed,true);
    assert.equal(noedit.ownersHeld+noedit.ownersQualified,noedit.totalRigids,
      'all CII RIGIDs must be accounted for, whether newly requalified or held');
    assert.ok(noedit.duplicateComponentRefs>=1,'actual R1 Python evidence must retain repeated physical source identity');
    const output=await page.evaluate(async(pointer)=>{
      const {session,result,applySourceBackedWeightChange}=window.__r2;
      const committed=await applySourceBackedWeightChange(session,
        {rigidPointer:pointer,newValue:'2.984',approved:true,ownerApproved:true,zeroConfirmed:false},
        {getCurrentResult:()=>result});
      window.__r2.committed=committed;
      return {status:committed.status,originalCii:committed.originalCii,
        revisedCii:committed.revisedCii,
        xml:committed.revisedXml,
        audit:committed.audit};
    },noedit.pointer);
    assert.equal(output.status,'VERIFIED_REEXTRACT');
    const expected=await readFile(resolve(generated,'approved.cii'),'utf8');
    const expectedXml=await readFile(resolve(generated,'approved.xml'),'utf8');
    assert.equal(output.revisedCii,expected,'Pyodide generated exact expected real native-writer CII');
    assert.equal(output.xml,expectedXml,'exactly one approved original XML Weight token changed');
    assert.equal(output.originalCii,await readFile(resolve(generated,'original.cii'),'utf8'));
    assert.equal(output.audit.ciiEngineeringDiff.expectedDifferences.length,1);
    assert.equal(output.audit.ciiEngineeringDiff.expectedDifferences[0].newWeight,29.84);
    assert.equal(output.audit.ciiEngineeringDiff.unexpectedDifferences,0);
    assert.equal(output.audit.unrelatedXmlBytesChanged,0);

    // Test through the ACTUAL production Final Weight Review popup, not an
    // isolated source-mode component. Existing direct-CII tools stay visible.
    await page.evaluate(async()=>{
      const mod=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      const opened=mod.openFinalRigidWeightReview(window.__r2.result,
        {getCurrentResult:()=>window.__r2.result});
      if(!opened)throw Error('Actual Final Weight Review modal did not open');
    });
    assert.equal(await page.locator('[data-final-rigid-preview]').count(),1);
    assert.equal(await page.locator('[data-final-rigid-apply]').count(),1);
    assert.equal(await page.locator('[data-final-rigid-row]').count(),6);
    assert.equal(await page.locator('[data-source-weight-inspect]').count(),6);
    await page.locator('[data-source-weight-open]').click();
    await page.waitForFunction(()=>document.querySelector('[data-source-weight-status]')?.textContent.includes('PASS:'),
      null,{timeout:180000});
    await page.locator('[data-source-weight-pointer]').selectOption(String(noedit.pointer));
    await page.locator('[data-source-weight-value]').fill('2.984');
    await page.locator('[data-source-weight-owner-approved]').check();
    await page.locator('[data-source-weight-approved]').check();
    await page.locator('[data-source-weight-preview]').click();
    assert.equal(await page.locator('[data-source-weight-apply]').isDisabled(),false);
    await page.locator('[data-source-weight-apply]').click();
    await page.waitForFunction(()=>document.querySelector('[data-source-weight-report]')?.textContent.includes('VERIFIED SOURCE-BACKED'),
      null,{timeout:180000});
    const [ciiDownload]=await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-source-weight-revised-cii]').click(),
    ]);
    assert.equal(await readFile(await ciiDownload.path(),'utf8'),expected);
    const [xmlDownload]=await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-source-weight-revised-xml]').click(),
    ]);
    assert.equal(await readFile(await xmlDownload.path(),'utf8'),expectedXml);
    const [auditDownload]=await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-source-weight-audit]').click(),
    ]);
    const audit=JSON.parse(await readFile(await auditDownload.path(),'utf8'));
    assert.equal(audit.status,'VERIFIED_REEXTRACT');
    assert.equal(audit.unrelatedXmlBytesChanged,0);
    assert.equal(audit.ciiEngineeringDiff.unexpectedDifferences,0);
    assert.deepEqual(errors,[],errors.join('\n'));
  });
  await test('R2 actual Chromium/Pyodide Owner example: uniquely-owned XML 15→2.984, output CII 150→29.84',async()=>{
    await page.goto(address+'/tests/fixtures/r2-source-weight-browser-host.html');
    const received=await page.evaluate(async()=>{
      const [xml,cii] = await Promise.all([
        fetch('/tests/.r2-synthetic-runtime/original15.xml').then(r=>r.text()),
        fetch('/tests/.r2-synthetic-runtime/original15.cii').then(r=>r.text()),
      ]);
      const {ciiSha256}=await import('/tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js');
      const {initializeSourceWeightSession,applySourceBackedWeightChange}=
        await import('/tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js');
      const result={
        ok:true,ciiText:cii,ciiName:'r2-exact-owner-example-synthetic.cii',ciiInputSource:'original',
        finalRigidReviewEvidence:{
          sourceKind:'xml',engineInputText:xml,
          engineInputSha256:await ciiSha256(xml),originalCiiSha256:await ciiSha256(cii),
          engineInputDigest:'R2_EXACT_VALUES_CURRENT_WRITER_SYNTHETIC',
          effectiveSourceName:'r2-synthetic-owner-example.xml',weightScale:10,
          supportConfigJson:'{}',stagedJsonText:'',
          effectiveOptions:{coordsMode:'first',kgToNewton:true,
            splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,outputMode:'both',
            analyzeTopology:false,generateTopoFix:false,useTopoFixForCii:false},
        },
      };
      const session=await initializeSourceWeightSession(result);
      const owner=session.rows.find(row=>row.sourceNode?.componentRefNo==='/RIGID-40');
      if(!owner?.eligible) throw Error('Expected uniquely qualified synthetic source owner');
      const original={xml:owner.sourceNode.originalXmlWeight,cii:owner.originalCiiWeight};
      const edited=await applySourceBackedWeightChange(session,{
        rigidPointer:owner.rigidPointer,newValue:'2.984',
        approved:true,ownerApproved:true,zeroConfirmed:false,
      },{getCurrentResult:()=>result});
      return {original,revisedXml:edited.revisedXml,revisedCii:edited.revisedCii,
        differences:edited.audit.ciiEngineeringDiff.expectedDifferences,
        unrelatedXmlBytesChanged:edited.audit.unrelatedXmlBytesChanged,
        unexpectedCiiDifferences:edited.audit.ciiEngineeringDiff.unexpectedDifferences,
        originalCiiUnchanged:result.ciiText===cii};
    });
    assert.deepEqual(received.original,{xml:15,cii:150});
    assert.equal(received.revisedXml,await readFile(resolve(generated,'approved.xml'),'utf8'));
    assert.equal(received.revisedCii,await readFile(resolve(generated,'approved.cii'),'utf8'));
    assert.equal(received.differences.length,1);
    assert.deepEqual([received.differences[0].oldWeight,received.differences[0].newWeight],[150,29.84]);
    assert.equal(received.unrelatedXmlBytesChanged,0);
    assert.equal(received.unexpectedCiiDifferences,0);
    assert.equal(received.originalCiiUnchanged,true);
  });
}finally{
  await browser.close();
  await new Promise(resolve=>serve.close(resolve));
}
