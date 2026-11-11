import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const fixture=path.resolve(root,'tests/.r2-synthetic-runtime');
const server=createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const resolved=path.resolve(root,'.'+name);
    if(!resolved.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(resolved);
    res.setHeader('Content-Type',/\.(?:mjs|js)$/.test(resolved)?'application/javascript':
      /\.wasm$/.test(resolved)?'application/wasm':
      /\.html$/.test(resolved)?'text/html':
      /\.xml$/.test(resolved)?'application/xml':
      'application/octet-stream');
    res.end(bytes);
  }catch(e){res.writeHead(404);res.end(e.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1360,height:850}});
page.setDefaultTimeout(220000);
const errors=[];page.on('pageerror',error=>errors.push(String(error)));

try{
  await test('R4A ACTUAL Chromium/Pyodide: frozen Python R1 lineage, source ownership, re-extract and verified UI downloads',async()=>{
    await page.goto(origin+'/tests/fixtures/r2-source-weight-browser-host.html');
    const result=await page.evaluate(async()=>{
      const xml=await fetch('/tests/.r2-synthetic-runtime/original.xml').then(r=>r.text());
      const cii=await fetch('/tests/.r2-synthetic-runtime/original.cii').then(r=>r.text());
      const {ciiSha256}=await import('/tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js');
      const {initializeSourceWeightSession,applySourceBackedWeightChange}=
        await import('/tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js');
      const run={ok:true,ciiText:cii,ciiName:'r4a-real-pyodide-synthetic.cii',
        ciiInputSource:'original',
        finalRigidReviewEvidence:{
          sourceKind:'xml',engineInputText:xml,
          engineInputSha256:await ciiSha256(xml),
          originalCiiSha256:await ciiSha256(cii),
          engineInputDigest:'R4A_REAL_PYODIDE_SYNTHETIC',
          effectiveSourceName:'r4a-synthetic.xml',weightScale:10,
          supportConfigJson:'{}',stagedJsonText:'',
          effectiveOptions:{
            coordsMode:'first',kgToNewton:true,
            splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
            outputMode:'both',analyzeTopology:false,
            generateTopoFix:false,useTopoFixForCii:false,
          },
        },
      };
      window.__r4a={xml,cii,run,applySourceBackedWeightChange};
      const session=await initializeSourceWeightSession(run,{requireR4aLineage:true});
      window.__r4a.session=session;
      const owner=session.rows.find(x=>x.sourceNode?.componentRefNo==='/RIGID-40');
      if(!owner)throw Error('R1 Python lineage did not identify original physical /RIGID-40 source');
      return {
        reason:session.r4aReason,
        structural:session.ownership?.qualifiedStructuralOwners,
        total:session.rows.length,
        owner:{pointer:owner.rigidPointer,eligible:owner.eligible,
          originalSourceWeight:owner.originalPhysicalMassKg,
          originalEmittedCii:owner.originalCiiWeight,
          status:owner.status,reasonCode:owner.reasonCode,
          transformations:owner.transformationHistory?.map(x=>x.stage)},
        pythonNodeCount:session.verifiedLineage?.pythonPreprocessedNodes?.length,
        R1SnapshotFingerprint:session.verifiedLineage?.runIdentity?.snapshotFingerprint,
        noEdit:session.noEditParity,
        holdBreakdown:session.ownership?.breakdown,
      };
    });
    assert.equal(result.reason,null);
    assert.equal(result.noEdit.status,'PASS_EXACT_REPLAY');
    assert.equal(result.noEdit.differingBytes,0);
    assert.ok(result.R1SnapshotFingerprint);
    assert.ok(result.pythonNodeCount>0);
    assert.equal(result.total,6);
    assert.ok(result.structural>=1);
    assert.equal(result.owner.eligible,true);
    assert.equal(result.owner.originalSourceWeight,6);
    assert.equal(result.owner.originalEmittedCii,60);

    const output=await page.evaluate(async(pointer)=>{
      const {session,run,applySourceBackedWeightChange}=window.__r4a;
      const changed=await applySourceBackedWeightChange(session,{
        rigidPointer:pointer,newValue:'2.984',ownerApproved:true,
        approved:true,zeroConfirmed:false,
      },{getCurrentResult:()=>run});
      window.__r4a.output=changed;
      return {status:changed.status,revisedXml:changed.revisedXml,
        revisedCii:changed.revisedCii,
        audit:changed.audit};
    },result.owner.pointer);
    const expectedXml=await readFile(path.join(fixture,'approved.xml'),'utf8');
    const expectedCii=await readFile(path.join(fixture,'approved.cii'),'utf8');
    assert.equal(output.status,'VERIFIED_REEXTRACT');
    assert.equal(output.revisedXml,expectedXml);
    assert.equal(output.revisedCii,expectedCii);
    assert.equal(output.audit.massReconciliation.status,
      'PASS_PHYSICAL_MASS_CONSERVATION_AFTER_APPROVAL');
    assert.equal(output.audit.massReconciliation.originalEmittedCiiWeight,60);
    assert.equal(output.audit.massReconciliation.newEmittedCiiWeight,29.84);
    assert.equal(output.audit.ciiEngineeringDiff.unexpectedDifferences,0);
    assert.equal(output.audit.unrelatedXmlBytesChanged,0);

    // Open the existing actual fullscreen Final Weight Review and repeat the
    // user journey with two explicit approvals and gated download buttons.
    await page.evaluate(async()=>{
      const {openFinalRigidWeightReview}=await import(
        '/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      openFinalRigidWeightReview(window.__r4a.run,
        {getCurrentResult:()=>window.__r4a.run});
    });
    assert.equal(await page.locator('[data-final-rigid-row]').count(),6);
    assert.equal(await page.locator('[data-final-rigid-apply]').count(),1,
      'legacy direct-CII editor must remain present');
    await page.locator('[data-source-weight-open]').click();
    await page.waitForFunction(()=>document.querySelector('[data-source-weight-status]')?.textContent.includes('PASS:'),
      null,{timeout:220000});
    await page.locator('[data-source-weight-search]').fill(String(result.owner.pointer));
    await page.locator('[data-source-weight-pointer]').selectOption(String(result.owner.pointer));
    await page.locator('[data-source-weight-value]').fill('2.984');
    await page.locator('[data-source-weight-owner-approved]').check();
    await page.locator('[data-source-weight-approved]').check();
    await page.locator('[data-source-weight-preview]').click();
    const preview=await page.locator('[data-source-weight-report]').textContent();
    assert.match(preview,/APPROVED PREVIEW/);
    assert.match(preview,/Complete allocation rule/);
    assert.equal(await page.locator('[data-source-weight-apply]').isDisabled(),false);
    await page.locator('[data-source-weight-apply]').click();
    await page.waitForFunction(()=>document.querySelector('[data-source-weight-report]')?.textContent.includes('VERIFIED SOURCE-BACKED RE-EXTRACTION'),
      null,{timeout:220000});
    const files=[['revised-xml',expectedXml],['revised-cii',expectedCii]];
    for(const [label,expected] of files){
      const button=page.locator('[data-source-weight-'+label+']');
      assert.equal(await button.isDisabled(),false);
      const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
      assert.equal(await readFile(await download.path(),'utf8'),expected);
    }
    const [auditDownload]=await Promise.all([
      page.waitForEvent('download'),page.locator('[data-source-weight-audit]').click()]);
    const audit=JSON.parse(await readFile(await auditDownload.path(),'utf8'));
    assert.equal(audit.massReconciliation.status,'PASS_PHYSICAL_MASS_CONSERVATION_AFTER_APPROVAL');
    assert.equal(audit.ciiEngineeringDiff.unexpectedDifferences,0);
    assert.deepEqual(errors,[],errors.join('\n'));
  });

  await test('R4A 135th source-backed RIGID: actual Python/Pyodide XML Weight 15→2.984, CII 150→29.84 and exact downloads',async()=>{
    const origXml=await readFile(path.join(fixture,'pointer135-original.xml'),'utf8');
    const origCii=await readFile(path.join(fixture,'pointer135-original.cii'),'utf8');
    const expectedXml=await readFile(path.join(fixture,'pointer135-approved.xml'),'utf8');
    const expectedCii=await readFile(path.join(fixture,'pointer135-approved.cii'),'utf8');
    await page.goto(origin+'/tests/fixtures/r2-source-weight-browser-host.html');
    const imported=await page.evaluate(async({xml,cii})=>{
      const {ciiSha256}=await import('/tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js');
      const {initializeSourceWeightSession}=await import(
        '/tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js');
      const {parseFinalCiiRigidInventory}=await import(
        '/tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js');
      const run={ok:true,ciiText:cii,ciiName:'pointer135-source-backed-SYNTHETIC.cii',
        ciiInputSource:'original',
        finalRigidReviewEvidence:{
          sourceKind:'xml',engineInputText:xml,
          engineInputSha256:await ciiSha256(xml),
          originalCiiSha256:await ciiSha256(cii),
          engineInputDigest:'R4A_WRITER_SYNTHETIC_POINTER135',
          effectiveSourceName:'pointer135-original.xml',weightScale:10,
          supportConfigJson:'{}',stagedJsonText:'',
          effectiveOptions:{coordsMode:'first',kgToNewton:true,
            splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
            outputMode:'both',analyzeTopology:false,
            generateTopoFix:false,useTopoFixForCii:false},
        }};
      const before=parseFinalCiiRigidInventory(cii);
      if(before.rows.length!==135)throw Error('Expected actual final 135 RIGID records');
      const target=before.rows[134];
      if(target.linkedElements.length!==1 || target.linkedElements[0].index!==384 ||
          target.linkedElements[0].fromNode!=='3429' ||
          target.linkedElements[0].toNode!=='10120' ||
          target.linkedElements[0].lengthMm!==19.1 ||
          target.weight!==150)throw Error('Actual Python writer did not generate exact 135 / #384 19.1 mm shape');
      window.__source135={xml,cii,run};
      const session=await initializeSourceWeightSession(run,{requireR4aLineage:true});
      const owner=session.rows.find(r=>r.rigidPointer===135);
      return {n:before.rows.length,owner:{
        eligible:owner.eligible,reason:owner.reason,reasonCode:owner.reasonCode,
        componentRefNo:owner.physicalComponentRefNo,
        sourceMass:owner.originalPhysicalMassKg,outputMass:owner.originalCiiWeight,
        allocationRule:owner.allocationRule,element:owner.originalElement?.index,
        from:owner.originalElement?.fromNode,to:owner.originalElement?.toNode},
        noEdit:session.noEditParity,
        held:session.rows.find(r=>!r.eligible)?.rigidPointer ?? null};
    },{xml:origXml,cii:origCii});
    assert.equal(imported.n,135);
    assert.equal(imported.noEdit.status,'PASS_EXACT_REPLAY');
    assert.equal(imported.noEdit.differingBytes,0);
    assert.equal(imported.owner.eligible,true,JSON.stringify(imported.owner));
    assert.equal(imported.owner.componentRefNo,'/POINTER-135-UNIQUE');
    assert.equal(imported.owner.sourceMass,15);
    assert.equal(imported.owner.outputMass,150);
    assert.equal(imported.owner.allocationRule,'ONE_UNIQUE_WRITER_SOURCE_ONE_EMITTED_RIGID');
    assert.equal(imported.owner.element,384);

    await page.evaluate(async()=>{
      const {openFinalRigidWeightReview}=await import(
        '/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js');
      openFinalRigidWeightReview(window.__source135.run,
        {getCurrentResult:()=>window.__source135.run});
    });
    assert.equal(await page.locator('[data-final-rigid-row]').count(),135);
    await page.locator('[data-final-rigid-row][data-pointer="135"] [data-source-weight-inspect]').click();
    await page.waitForFunction(()=>document.querySelector('[data-source-weight-status]')?.textContent.includes('PASS:'),
      null,{timeout:220000});
    await page.locator('[data-source-weight-pointer]').selectOption('135');
    const input=page.locator('[data-source-weight-value]');
    assert.equal(await input.isDisabled(),false,'A qualified unique 135 source must become editable');
    assert.match(await page.locator('[data-source-weight-eligibility-detail]').innerText(),/Verified source owner/);
    assert.match(await page.locator('[data-source-weight-facts]').innerText(),/POINTER-135-UNIQUE/);
    assert.equal(await page.locator('[data-source-weight-apply]').isDisabled(),true);
    await input.fill('2.984');
    await page.locator('[data-source-weight-owner-approved]').check();
    await page.locator('[data-source-weight-approved]').check();
    await page.locator('[data-source-weight-preview]').click();
    assert.match(await page.locator('[data-source-weight-report]').innerText(),/APPROVED PREVIEW/);
    assert.equal(await page.locator('[data-source-weight-apply]').isDisabled(),false);
    await page.locator('[data-source-weight-apply]').click();
    await page.waitForFunction(()=>document.querySelector('[data-source-weight-report]')?.textContent.includes('VERIFIED SOURCE-BACKED RE-EXTRACTION'),
      null,{timeout:220000});

    const downloads=[['revised-xml',expectedXml],['revised-cii',expectedCii]];
    for(const [label,expected] of downloads){
      const button=page.locator('[data-source-weight-'+label+']');
      assert.equal(await button.isDisabled(),false);
      const [file]=await Promise.all([page.waitForEvent('download'),button.click()]);
      assert.equal(await readFile(await file.path(),'utf8'),expected,
        label+' not equal to fresh native Python converter output');
    }
    const [auditDownload]=await Promise.all([page.waitForEvent('download'),
      page.locator('[data-source-weight-audit]').click()]);
    const audit=JSON.parse(await readFile(await auditDownload.path(),'utf8'));
    assert.equal(audit.approval.originalRigidPointer,135);
    assert.equal(audit.approval.approvedNewXmlWeight,2.984);
    assert.equal(audit.sourceXmlByteDiff.length,1);
    assert.equal(audit.unrelatedXmlBytesChanged,0);
    assert.equal(audit.ciiEngineeringDiff.unexpectedDifferences,0);
    assert.equal(audit.massReconciliation.status,'PASS_PHYSICAL_MASS_CONSERVATION_AFTER_APPROVAL');
    assert.equal(audit.massReconciliation.originalRigidPointer,135);
    assert.equal(audit.massReconciliation.newEmittedCiiWeight,29.84);
    assert.equal(await page.evaluate(()=>window.__source135.run.ciiText),origCii);
    assert.deepEqual(errors,[],errors.join('\n'));
  });

}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
