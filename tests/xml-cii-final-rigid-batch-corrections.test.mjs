import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  planFinalRigidBatchCorrections, prepareNearestFinalRigidBatchPreview,
  serializableNearestCiiWeight,
} from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-batch-corrections.js';
import { parseFinalCiiRigidInventory } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js';
import {
  createCiiPropertySession, stageCiiPropertyEdit, verifyCiiPropertyTransaction,
} from '../tabs/xml-cii-2019-standalone/xml-cii-final-property-transactions.js';

function candidate(referenceWeight, overrides = {}) {
  return {
    referenceWeight, masterWeightKg: referenceWeight / 10,
    approximate: false, comparisonOnly: false, sourceVerified: true, direct: true,
    title: 'Qualified master', source: 'MASTER-ID', preferred: true,
    matchPct: 100, method: 'master', basis: 'evidence from run-pinned source',
    ...overrides,
  };
}
function inventoryAndPlans(rows = 144) {
  const inventory = { rows: [] }, plans = [];
  for (let i = 1; i <= rows; i += 1) {
    const originalWeight = i === 20 ? 150 : i === 21 ? 200 : 100;
    inventory.rows.push({
      rigidPointer: i, weight: originalWeight, rawWeight: String(originalWeight),
      status: 'LINKED', linkedElements: [{ index: i, rigidPointer: i,
        fromNode: String(i), toNode: String(i + 1), branchName: '/B', lengthMm: 19.1 }],
    });
    plans.push({
      rigidPointer: i, mapping: { componentRefNo: '/C' + i, branchName: '/B' },
      sourceContext: { status: 'VERIFIED', conflicts: [], bore: { value: 50 },
        rating: { value: '900' }, dtxr: { suppressed: false } },
      nearestSuggestions: [candidate(i === 20 ? 29.84 : i === 21 ? 100 : 90)],
      autoIndex: -1,
    });
  }
  return { inventory, plans };
}
test('strict ±40% threshold and original/proposed basis, 144-pointer example', () => {
  const { inventory, plans } = inventoryAndPlans();
  const result = planFinalRigidBatchCorrections(inventory, plans);
  assert.equal(result.thresholdPct, 40);
  assert.equal(result.proposals.length, 144);
  assert.deepEqual(result.eligible.map((p) => p.pointer), [20,21]);
  const pointer20 = result.eligible.find((r) => r.pointer === 20);
  assert.equal(pointer20.originalWeight, 150);
  assert.equal(pointer20.proposedWeight, 29.84);
  assert.ok(Math.abs(pointer20.errorPct - 402.680965147453) < 1e-5,
    'use proposed as the Error % denominator; not the 150 N original');
  assert.equal(pointer20.reviewRequired, false);
  assert.equal(result.proposals[0].status, 'WARNING');
  assert.ok(result.proposals[0].warningCodes.includes('BELOW_THRESHOLD'));
  assert.equal(result.warnings.length, 142);
  assert.equal(result.warnings[0].reviewRequired, true);
  const scope = planFinalRigidBatchCorrections(inventory, plans, {
    scope: 'filtered', visiblePointers: [20],
  });
  assert.deepEqual(scope.eligible.map((r) => r.pointer), [20]);
  assert.equal(scope.proposals[20].status, 'OUT_OF_SCOPE');
  const selected = planFinalRigidBatchCorrections(inventory, plans, {
    scope: 'selected', selectedPointers: [21],
  });
  assert.deepEqual(selected.eligible.map((r) => r.pointer), [21]);
  assert.throws(() => planFinalRigidBatchCorrections(inventory, plans, { thresholdPct: -1 }), /threshold/);
  assert.throws(() => planFinalRigidBatchCorrections(inventory, plans, { thresholdPct: 'abc' }), /threshold/);
  assert.throws(() => planFinalRigidBatchCorrections(inventory, plans, { scope: 'invented' }), /scope/);
  assert.deepEqual(planFinalRigidBatchCorrections(inventory, plans, { thresholdPct: 403 }).eligible, []);
});
test('approximate 50% / unverified synthetic-source suggestion remains individually review-gated', () => {
  const { inventory, plans } = inventoryAndPlans();
  plans[19].mapping = null;
  plans[19].sourceContext.status = 'NOT_RESOLVED';
  plans[19].nearestSuggestions = [candidate(29.84, {
    approximate: true, matchPct: 50, comparisonOnly: true, sourceVerified: false,
    method: 'length-extrapolated', source: 'WELDNECK-147', preferred: false,
  })];
  const safeDefault = planFinalRigidBatchCorrections(inventory, plans);
  assert.equal(safeDefault.proposals[19].status, 'WARNING');
  assert.deepEqual(safeDefault.eligible.map((p) => p.pointer), [21]);
  assert.ok(safeDefault.proposals[19].warningCodes.includes('ADVISORY_CATALOG_REFERENCE'));
  assert.equal(safeDefault.proposals[19].reviewRequired, true);
  assert.equal(safeDefault.proposals[19].candidate.matchPct, 50);
  assert.equal(safeDefault.proposals[19].proposedWeight, 29.84);
  assert.ok(safeDefault.warnings.some((row) => row.pointer === 20),
    'approximate unmapped owner is selectable only as per-row WARNING');
  assert.equal(planFinalRigidBatchCorrections(inventory,plans,{includeReviewOnly:true}).proposals[19].status,'WARNING',
    'legacy include toggle cannot promote advisory source to bulk ELIGIBLE');
  const edited = planFinalRigidBatchCorrections(inventory, plans, {
    includeReviewOnly: true, currentEditedValues: new Map([[20,'160']]),
  });
  assert.equal(edited.proposals[19].status, 'ALREADY_EDITED');
  plans[19].sourceContext.conflicts = ['RATING_CONFLICT'];
  const conflict = planFinalRigidBatchCorrections(inventory, plans);
  assert.equal(conflict.proposals[19].status, 'WARNING');
  assert.ok(conflict.proposals[19].warningCodes.includes('RATING_CONFLICT'));
  assert.equal(conflict.proposals[19].reviewRequired, true);
  assert.equal(conflict.eligible.some((row) => row.pointer === 20), false,
    'metadata warnings must not enter bulk eligible selection');
  plans[19].sourceContext.conflicts = [];
  plans[19].sourceContext.dtxr.suppressed = true;
  const suppressed = planFinalRigidBatchCorrections(inventory, plans);
  assert.equal(suppressed.proposals[19].status, 'WARNING');
  assert.ok(suppressed.proposals[19].warningCodes.includes('DTXR_SUPPRESSED'));
});
test('Apply Nearest suggestion requalifies preview without approving or overwriting manual/HOLD rows', () => {
  const { inventory, plans } = inventoryAndPlans(23);
  plans[19].nearestSuggestions.push(candidate(120, { title: 'Alternative' }));
  plans[21].mapping = null;
  plans[21].sourceContext.status = 'NOT_RESOLVED';
  plans[21].nearestSuggestions = [candidate(29.84, {
    approximate: true, comparisonOnly: true, direct: false,
  })];
  const selectedIndices = new Map([[20, 1], [21, 1], [22, 1], [23, 1]]);
  const prepared = prepareNearestFinalRigidBatchPreview(inventory, plans, {
    scope: 'selected', selectedPointers: [20, 21, 22, 23],
    selectedIndices, currentEditedValues: new Map([[21, '160']]),
  });
  assert.equal(prepared.selectedIndices.get(20), 0);
  assert.equal(prepared.selectedIndices.get(21), 1, 'manual edit stays untouched');
  assert.equal(prepared.selectedIndices.get(22), 0, 'advisory WARNING stays previewable');
  assert.equal(prepared.selectedIndices.get(23), 0, 'below-threshold stays previewable');
  assert.equal(prepared.preparedCount, 3);
  assert.equal(selectedIndices.get(20), 1, 'caller selection map is not mutated');
  const check = planFinalRigidBatchCorrections(inventory, plans, {
    scope: 'selected', selectedPointers: [20, 21, 22, 23],
    selectedIndices: prepared.selectedIndices, currentEditedValues: new Map([[21, '160']]),
  });
  assert.equal(check.proposals[19].status, 'ELIGIBLE');
  assert.equal(check.proposals[20].status, 'ALREADY_EDITED');
  assert.equal(check.proposals[21].status, 'WARNING');
  assert.equal(check.proposals[22].status, 'WARNING');
  assert.equal(check.eligible.some((row) => row.pointer === 22), false,
    'a nearest preview never automatically approves comparison-only mass');
});

test('alternative choice is requalified against threshold, shared source owner is blocked', () => {
  const { inventory, plans } = inventoryAndPlans(22);
  plans[19].nearestSuggestions.push(candidate(120, { title: 'Farther alternative' }));
  const alt = planFinalRigidBatchCorrections(inventory, plans, {
    selectedIndices: new Map([[20, 1]]), thresholdPct: 40,
  });
  assert.equal(alt.proposals[19].proposedWeight, 120);
  assert.equal(alt.proposals[19].status, 'WARNING');
  assert.ok(alt.proposals[19].warningCodes.includes('BELOW_THRESHOLD'));
  plans[20].mapping.componentRefNo = plans[19].mapping.componentRefNo;
  const shared = planFinalRigidBatchCorrections(inventory, plans);
  assert.equal(shared.proposals[19].status, 'HOLD');
  assert.equal(shared.proposals[20].status, 'HOLD');
  inventory.rows[19].linkedElements.push(inventory.rows[19].linkedElements[0]);
  assert.equal(planFinalRigidBatchCorrections(inventory, plans).proposals[19].status, 'HOLD');
  inventory.rows[19].linkedElements.pop();
  inventory.rows[19].status = 'SHARED_POINTER';
  assert.equal(planFinalRigidBatchCorrections(inventory, plans).proposals[19].status, 'HOLD');
});

test('GLRD-shaped 134/135 approximate candidates are WARNINGS requiring per-row approval, never bulk eligible', () => {
  const { inventory, plans } = inventoryAndPlans(135);
  const cases = [
    { pointer:134, from:'3427', to:'3429', original:560, proposed:756.53, length:371.205 },
    { pointer:135, from:'3429', to:'10120', original:150, proposed:29.84, length:19.1 },
  ];
  for(const item of cases){
    const row=inventory.rows[item.pointer-1];
    row.weight=item.original;row.rawWeight=String(item.original);
    row.linkedElements=[{index:item.pointer===134?383:384,rigidPointer:item.pointer,
      fromNode:item.from,toNode:item.to,branchName:'/GLRD',lengthMm:item.length}];
    const plan=plans[item.pointer-1];
    plan.mapping=null;plan.sourceContext.status='NOT_RESOLVED';
    plan.nearestSuggestions=[candidate(item.proposed,{
      approximate:true,comparisonOnly:true,direct:false,sourceVerified:false,
      source:'',method:'length-extrapolated',matchPct:item.pointer===134?91:50,
    })];
  }
  const reviewed=planFinalRigidBatchCorrections(inventory,plans,{thresholdPct:40});
  for(const item of cases){
    const decision=reviewed.proposals[item.pointer-1];
    assert.equal(decision.status,'WARNING');
    assert.equal(decision.reviewRequired,true);
    assert.equal(decision.proposedWeight,item.proposed);
    assert.ok(decision.warningCodes.includes('ADVISORY_CATALOG_REFERENCE'));
    assert.equal(reviewed.eligible.some((r)=>r.pointer===item.pointer),false);
    assert.equal(reviewed.warnings.some((r)=>r.pointer===item.pointer),true);
  }
  assert.ok(reviewed.proposals[133].warningCodes.includes('BELOW_THRESHOLD'));
  assert.ok(!reviewed.proposals[134].warningCodes.includes('BELOW_THRESHOLD'));
});

test('three real-case shapes become warnings but cannot enter bulk approval', () => {
  const { inventory, plans } = inventoryAndPlans(18);
  for (const pointer of [16, 17]) {
    const row = inventory.rows[pointer - 1];
    row.weight = 150; row.rawWeight = '150';
    plans[pointer - 1].nearestSuggestions = [candidate(150, { title: 'Weldneck Flange' })];
    plans[pointer - 1].sourceContext.status = 'CONFLICT_REVIEW';
    plans[pointer - 1].sourceContext.conflicts = ['RATING_CONFLICT'];
  }
  inventory.rows[17].weight = 470; inventory.rows[17].rawWeight = '470';
  plans[17].nearestSuggestions = [candidate(756.52, {
    approximate:true, comparisonOnly:true, direct:false, title:'Flanged Swing check Valve',
  })];
  const result = planFinalRigidBatchCorrections(inventory, plans);
  for (const pointer of [16, 17]) {
    const row = result.warnings.find((entry) => entry.pointer === pointer);
    assert.ok(row, 'conflicting metadata should be a warning');
    assert.equal(row.originalWeight, 150);
    assert.equal(row.proposedWeight, 150);
    assert.ok(row.warningCodes.includes('RATING_CONFLICT'));
    assert.ok(row.warningCodes.includes('NO_WEIGHT_CHANGE'));
    assert.equal(row.reviewRequired, true);
  }
  const valve = result.warnings.find((entry) => entry.pointer === 18);
  assert.ok(valve);
  assert.ok(valve.warningCodes.includes('BELOW_THRESHOLD'));
  assert.equal(valve.proposedWeight, 756.52);
  assert.ok(Math.abs(valve.errorPct + 37.8734) < 0.01);
  assert.equal(valve.reviewRequired, true);
  assert.equal(result.eligible.some((row) => [16, 17, 18].includes(row.pointer)), false);
  plans[16].mapping.componentRefNo = plans[15].mapping.componentRefNo;
  assert.equal(planFinalRigidBatchCorrections(inventory, plans).proposals[15].status,'HOLD',
    'a genuinely shared physical owner remains a hard HOLD');
});
function row(vals) { return vals.map((v,i) => String(v).padStart(i ? 13 : 15,' ')).join(''); }
function ciiFixture(count = 144) {
  const entries = [
    '#$ VERSION', '2019', '#$ CONTROL',
    row([count,0,0,0,0,0]), row([0,count,0,0,0,0]),
    row([0,0,0,0,0,0]), row([0]), '#$ ELEMENTS',
  ];
  for(let i=1;i<=count;i++) {
    entries.push(row([i,i+1,19.1,0,0,60.3]),
      ...Array.from({length:9},()=>row([0,0,0,0,0,0])),
      (' '.repeat(7)+'    2 /B').padEnd(80),row([0,0,0,0,0,0]),
      row([0,i,0,0,0,0]),row([0,0,0,0,0,0]),row([0,0,0]));
  }
  entries.push('#$ RIGID');
  for(let i=1;i<=count;i++)entries.push(row([i===20?150:i===21?200:100,0]));
  return entries.join('\r\n')+'\r\n';
}
test('EXACT pointer 20: verified batch re-extraction writes 29.84 instead of 150; all other bytes remain intact', async () => {
  const original = ciiFixture();
  const session = await createCiiPropertySession(original, { runIdentity: 'BATCH-R1', filename: 'owner.cii' });
  const proposed = [[20,29.84],[21,100]];
  for(const [pointer,newValue] of proposed) {
    stageCiiPropertyEdit(session, {
      propertyId: 'RIGID.weight', recordPointer: pointer,
      originalToken: String(pointer===20?150:200),
      newValue: String(newValue), unit: 'CII_OUTPUT_WEIGHT',
      confirmed: true, zeroConfirmed: false,
      reference: {kind:'batch-nearest-review',value:String(newValue),
        batch:{thresholdPct:40,pointer,individuallyApproved:true}},
    });
  }
  const output = await verifyCiiPropertyTransaction(session, {
    currentCiiText: original, runIdentity: 'BATCH-R1',
  });
  const reextracted = parseFinalCiiRigidInventory(output.revisedCiiText);
  assert.equal(reextracted.rows.length, 144);
  assert.equal(reextracted.rows[19].weight, 29.84);
  assert.equal(reextracted.rows[20].weight, 100);
  assert.equal(reextracted.rows[18].weight, 100);
  assert.equal(reextracted.rows[21].weight, 100);
  assert.equal(output.audit.changes.length, 2);
  assert.deepEqual(output.audit.changes.map((r)=>r.recordPointer),[20,21]);
  assert.equal(output.audit.untouchedBytesEqual, true);
  assert.equal(new TextEncoder().encode(original).length,
    new TextEncoder().encode(output.revisedCiiText).length);
  assert.notEqual(output.revisedCiiText, original);
  assert.equal(session.originalCiiText, original);
  assert.equal(output.audit.changes[0].reference.kind, 'batch-nearest-review');
  assert.equal(output.audit.changes[0].reference.batch.thresholdPct, 40);
  await assert.rejects(()=>verifyCiiPropertyTransaction(session,{
    currentCiiText: original.replace('150','151'),runIdentity:'BATCH-R1',
  }),/source CII content changed/);
});


test('145 mixed floating nearest references normalize to the exact CII decimal before approval', () => {
 const { inventory, plans }=inventoryAndPlans(145);
 for(let i=0;i<145;i++){
   inventory.rows[i].weight=150;
   inventory.rows[i].rawWeight='150';
   plans[i].mapping=null;
   plans[i].sourceContext.status='NOT_RESOLVED';
   plans[i].nearestSuggestions=[candidate(i===134?29.840000000000003:
     29.83999999999+(i%11)/1000000000,{
       approximate:true,comparisonOnly:true,sourceVerified:false,
       direct:false,method:'length-extrapolated',matchPct:50,
   })];
 }
 const p=planFinalRigidBatchCorrections(inventory,plans);
 assert.equal(p.warnings.length,145);
 assert.equal(p.held.length,0);
 assert.equal(p.proposals[134].proposedWeight,29.84);
 assert.ok(p.proposals.every(x=>x.status==='WARNING'));
 assert.ok(p.proposals.every(x=>String(x.proposedWeight).length<=15));
 assert.ok(p.proposals.every(x=>Number.isFinite(x.serializationDelta)));
 assert.ok(p.proposals.some(x=>x.warningCodes.includes('CII_PREVIEW_SERIALIZATION_ROUNDED')));
 const fixed=serializableNearestCiiWeight(29.840000000000003);
 assert.equal(fixed.weight,29.84);
 assert.ok(Math.abs(fixed.delta)<1e-10);
 assert.equal(serializableNearestCiiWeight(0.00000001),null,
   'a small mass must not silently round to zero');
 assert.equal(serializableNearestCiiWeight(1e99),null,
   'fixed-width CII may not silently truncate very large weights');
});
