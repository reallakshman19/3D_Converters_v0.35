/** Real browser/Pyodide R4C single RIGID writer, two XML endpoints.
 * No source/physical mass is imported from the Owner GLRD archive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const fixtures=path.resolve(root,'tests/.r4c-single-runtime');
const server=createServer(async(req,res)=>{
 try {
   const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const file=path.resolve(root,'.'+p);
   if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   const data=await readFile(file);
   res.setHeader('Content-Type',/\.(?:mjs|js)$/.test(file)?'application/javascript':
     /\.html$/.test(file)?'text/html':
     /\.wasm$/.test(file)?'application/wasm':'application/octet-stream');
   res.end(data);
 }catch(e){res.writeHead(404);res.end(String(e.message));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1450,height:920}});
page.setDefaultTimeout(240000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
 await test('R4C one writer two source endpoints actual Chromium/Pyodide: 150 → 26N with source XML/CII parity',async()=>{
   await page.goto(origin+'/tests/fixtures/r2-source-weight-browser-host.html');
   const evidence=await page.evaluate(async()=>{
     const get=async name=>fetch('/tests/.r4c-single-runtime/'+name).then(r=>r.text());
     const originalXml=await get('original.xml'),originalCii=await get('original.cii');
     const revisedXml=await get('r4c-approved.xml'),revisedCii=await get('r4c-approved.cii');
     const {ciiSha256}=await import('/tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js');
     const {initializeSourceWeightSession}=await import(
       '/tabs/xml-cii-2019-standalone/xml-cii-source-weight-reextract.js');
     const {previewR4bIsolatedSourceEdit,applyR4bIsolatedSourceEdit}=await import(
       '/tabs/xml-cii-2019-standalone/xml-cii-r4b-isolated-source-edit.js');
     const result={ok:true,ciiText:originalCii,ciiName:'r4c-synthetic.cii',
       ciiInputSource:'original',finalRigidReviewEvidence:{
         sourceKind:'xml',engineInputText:originalXml,
         engineInputSha256:await ciiSha256(originalXml),
         originalCiiSha256:await ciiSha256(originalCii),
         engineInputDigest:'R4A_SYNTHETIC_CURRENT_WRITER',
         effectiveSourceName:'r4c-source-witness.xml',
         supportConfigJson:'{}',stagedJsonText:'',weightScale:10,
         effectiveOptions:{coordsMode:'first',kgToNewton:true,
           splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
           outputMode:'both',analyzeTopology:false,
           generateTopoFix:false,useTopoFixForCii:false},
       }};
     const s=await initializeSourceWeightSession(result,{requireR4aLineage:true});
     const witnessSource=s.verifiedLineage.sourceNodes.find(x=>
       x.componentRefNo==='/SHARED-COMP'&&x.originalNodeNumber==='20');
     if(!witnessSource)throw Error('Original source writer not found');
     const pointer=s.verifiedLineage.auxiliaryRecords.find(a=>
       a.writerWeightSourceNode===witnessSource.identity).recordPointer;
     // R4A is intentionally conservative. Exercise an otherwise held row
     // with exact genuine R1/real converter source evidence and no code bypass.
     s.rows=s.rows.map(row=>row.rigidPointer===pointer?{
       ...row,eligible:false,completeAllocation:false,
       status:'HOLD',reasonCode:'SOURCE_OWNER_AMBIGUOUS',
       reason:'Conservative repeated ComponentRefNo R4A HOLD',
     }:row);
     const trial=await previewR4bIsolatedSourceEdit(s,{
       rigidPointer:pointer,newValue:'2.6'},{getCurrentResult:()=>result});
     const approval={rigidPointer:pointer,newValue:'2.6',approved:true,
       ownerApproved:true,requestedOutputWeight:'26',
       approvedGroupTotalKg:'2.6',
       allocationMode:'OWNER_APPROVED_REVISED_GROUP_TOTAL',
       referenceBasis:'Explicit reviewed test mass allocation R4C-26N',
     };
     const revised=await applyR4bIsolatedSourceEdit(s,trial,approval,
       {getCurrentResult:()=>result});
     return {
       pointer,trialStatus:trial.status,topology:trial.ownershipTopology,
       numberOfWriters:trial.dependentRigidPointers.length,
       zeroWitnesses:trial.zeroMassSourceWitnesses,
       originalWeight:trial.originalWeightCii,revisedWeight:trial.proposedWeightCii,
       actualReExtractedWeight:revised.audit.requestedOutputVerification.actualCiiOutputWeight,
       xmlExact:revised.revisedXml===revisedXml,ciiExact:revised.revisedCii===revisedCii,
       originalStillImmutable:result.ciiText===originalCii,
       massAuthority:revised.audit.physicalMassAuthority,
       sourceDiff:revised.audit.sourceXmlByteDiff.length,
       unrelatedCiiDifferences:revised.audit.ciiEngineeringDiff.unexpectedDifferences,
     };
   });
   assert.equal(evidence.trialStatus,'PASS_ISOLATED_CONVERTER_TRIAL_NOT_PHYSICAL_APPROVAL');
   assert.equal(evidence.topology,'ONE_WRITER_MULTIPLE_ZERO_MASS_ENDPOINTS');
   assert.equal(evidence.numberOfWriters,1);
   assert.equal(evidence.zeroWitnesses.length,1);
   assert.equal(evidence.zeroWitnesses[0].nodeNumber,'30');
   assert.equal(evidence.originalWeight,150);
   assert.equal(evidence.revisedWeight,26);
   assert.equal(evidence.actualReExtractedWeight,26);
   assert.equal(evidence.xmlExact,true);
   assert.equal(evidence.ciiExact,true);
   assert.equal(evidence.originalStillImmutable,true);
   assert.equal(evidence.sourceDiff,1);
   assert.equal(evidence.unrelatedCiiDifferences,0);
   assert.equal(evidence.massAuthority,'USER_ATTESTED_NOT_INDEPENDENTLY_VALIDATED');
   assert.deepEqual(errors,[],errors.join('\n'));
 });
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
