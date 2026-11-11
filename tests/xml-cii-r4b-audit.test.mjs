import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ciiSha256 } from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-reader.js';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import { projectR4aOwnership } from '../tabs/xml-cii-2019-standalone/xml-cii-r4a-rigid-ownership.js';
import { buildR4bRigidOwnershipReport, r4bOwnershipAuditCsv }
  from '../tabs/xml-cii-2019-standalone/xml-cii-r4b-ownership-audit.js';

// The actual existing converter generates these CII bytes. This is NOT Owner GLRD.
const root=process.env.R4A_FIXTURE_DIR;
if(!root)throw Error('R4A_FIXTURE_DIR missing: prepare actual current-writer synthetic fixture');
const get=name=>fs.readFileSync(path.join(root,name),'utf8');
const xml=get('original.xml'),cii=get('original.cii');
const r1=JSON.parse(get('r4a-r1-verified-lineage.json'));

async function session(){
  const xmlHash=await ciiSha256(xml),ciiHash=await ciiSha256(cii);
  const result={ok:true,ciiText:cii,ciiInputSource:'original',
    finalRigidReviewEvidence:{
      sourceKind:'xml',engineInputText:xml,engineInputSha256:xmlHash,
      originalCiiSha256:ciiHash,engineInputDigest:'R4A_SYNTHETIC_CURRENT_WRITER',
      sourceName:'r4a-synthetic.xml',effectiveSourceName:'r4a-synthetic.xml',
      supportConfigJson:'{}',stagedJsonText:'',weightScale:10,
      effectiveOptions:{coordsMode:'first',kgToNewton:true,
        splitCondensedValveFlange:true,useRestraintTypeBasedOnJson:true,
        outputMode:'both',analyzeTopology:false,generateTopoFix:false,
        useTopoFixForCii:false},
    }};
  const inventory=parseFinalCiiRigidInventory(cii);
  const projection=await projectR4aOwnership({result,inventory,verifiedLineage:r1});
  return {
    custody:{engineXml:xml,originalCii:cii,engineSha:xmlHash,
      originalCiiSha:ciiHash,supportConfigJson:'{}',weightScale:10,
      runId:'R4A_SYNTHETIC_CURRENT_WRITER'},
    inventory,rows:projection.rows,verifiedLineage:r1,ownership:projection,
    noEditParity:{status:'PASS_EXACT_REPLAY',differingBytes:0,
      sha256:ciiHash,bytes:Buffer.byteLength(cii)},
  };
}
test('R4B read-only report covers every actual current-writer RIGID including HOLD',async()=>{
  const s=await session(),report=await buildR4bRigidOwnershipReport(s);
  assert.equal(report.r1Verified,true);
  assert.equal(report.rows.length,s.inventory.declared.rigids);
  assert.equal(report.summary.finalRigidCount,s.inventory.rows.length);
  assert.equal(report.summary.qualifiedStructuralOwners+report.summary.heldOwners,report.rows.length);
  assert.deepEqual(report.rows.map(x=>x.rigidPointer),
    s.inventory.rows.map(x=>x.rigidPointer));
  for(const row of report.rows){
    const original=s.inventory.rows.find(x=>x.rigidPointer===row.rigidPointer);
    assert.equal(row.ciiWeight,original.weight);
    assert.equal(row.elements.length,original.linkedElements.length);
    assert.equal(row.weightScale,10);
    assert.equal(row.referenceWeightKg,null,'source/CII output cannot be its own independent reference');
    assert.equal(row.errorPercent,null);
    assert.equal(row.physicallyApproved,false);
    assert.equal(row.sourceEditEligible,s.rows.find(x=>x.rigidPointer===row.rigidPointer).eligible);
    assert.ok(row.evidence.sourceXmlSha256);
    assert.ok(row.evidence.originalCiiSha256);
    assert.ok(row.evidence.configurationSha256);
  }
  const known=report.rows.find(x=>x.componentRefNo==='/RIGID-40');
  assert.ok(known?.structurallyQualified);
  assert.equal(known.originalXmlWeightKg,6);
  assert.equal(known.allocatedComponentMassKg,6);
  assert.equal(known.dependentSetStatus,'VERIFIED_ONE_TO_ONE');
  assert.ok(['FROM','TO'].includes(known.writerSourceSelection));
  const csv=r4bOwnershipAuditCsv(report);
  assert.equal(csv.trimEnd().split('\n').length,report.rows.length+1);
  assert.ok(csv.includes('"holdReasonCode"'));
  assert.ok(csv.includes('"writerSourceSelection"'));
});

test('R4B held rows remain visible; candidate source does not become approval',async()=>{
  const s=await session(),report=await buildR4bRigidOwnershipReport(s);
  assert.ok(report.summary.heldOwners>0);
  for(const row of report.rows.filter(x=>!x.structurallyQualified)){
    assert.equal(row.sourceEditEligible,false);
    assert.equal(row.physicallyApproved,false);
    assert.equal(row.allocatedComponentMassKg,null);
    assert.ok(row.holdReasonCode);
  }
  assert.equal(report.summary.physicalMassApprovalCount,0);
  assert.equal(report.scope,'DIAGNOSTIC_ONLY_NO_NEW_SOURCE_EDIT_ELIGIBILITY');
  assert.ok(report.multiRigidCandidateGroups.every(group=>
    group.status==='UNAPPROVED_CANDIDATE_ONLY' &&
    group.allocationFractions===null));
});

test('R4B refuses missing inventory, stale config, failed replay and omitted RIGIDs',async()=>{
  const s=await session();
  const changed={...s,custody:{...s.custody,supportConfigJson:'{"unapproved":true}'}};
  // A config mismatch against the independent lineage remains visible as unverified.
  const diagnostic=await buildR4bRigidOwnershipReport(changed);
  assert.equal(diagnostic.r1Verified,false);
  assert.equal(diagnostic.summary.sourceEditEligible,0);
  await assert.rejects(()=>buildR4bRigidOwnershipReport({...s,
    noEditParity:{status:'HOLD_NO_EDIT_PARITY',differingBytes:1}}),/no-edit byte parity/);
  await assert.rejects(()=>buildR4bRigidOwnershipReport({...s,
    rows:s.rows.slice(1)}),/one row per declared final RIGID/);
  await assert.rejects(()=>buildR4bRigidOwnershipReport({...s,
    custody:{...s.custody,engineSha:'stale'}}),/source or final CII changed/);
});

test('R4B grouped multi-RIGID writer-source association is explicitly advisory',async()=>{
  const s=await session();
  const originals=s.verifiedLineage.auxiliaryRecords;
  const candidates=originals.filter(x=>x.section==='RIGID'&&x.writerWeightSourceNode);
  assert.ok(candidates.length>=2);
  const modified=structuredClone(s.verifiedLineage);
  const a=modified.auxiliaryRecords.find(x=>x.recordPointer===candidates[0].recordPointer);
  const b=modified.auxiliaryRecords.find(x=>x.recordPointer===candidates[1].recordPointer);
  b.writerWeightSourceNode=a.writerWeightSourceNode;
  b.ownerCandidates=[...a.ownerCandidates];
  const readOnly=await buildR4bRigidOwnershipReport({...s,verifiedLineage:modified});
  const group=readOnly.multiRigidCandidateGroups.find(g=>
    g.rigidPointers.includes(a.recordPointer)&&g.rigidPointers.includes(b.recordPointer));
  assert.ok(group,'multi-RIGID candidate grouping should be indexed');
  assert.equal(group.status,'UNAPPROVED_CANDIDATE_ONLY');
  assert.equal(group.allocationFractions,null);
  // No proposal, mass patch, source edit or qualification can arise from this report.
});
