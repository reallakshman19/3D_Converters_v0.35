import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planFinalRigidBatchCorrections } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-batch-corrections.js';
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
  assert.equal(result.proposals[0].status, 'BELOW_THRESHOLD');
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
  assert.equal(safeDefault.proposals[19].status, 'REVIEW_ONLY');
  assert.deepEqual(safeDefault.eligible.map((p) => p.pointer), [21]);
  const approvedView = planFinalRigidBatchCorrections(inventory, plans, { includeReviewOnly: true });
  assert.equal(approvedView.proposals[19].status, 'ELIGIBLE');
  assert.equal(approvedView.proposals[19].reviewRequired, true);
  assert.equal(approvedView.proposals[19].candidate.matchPct, 50);
  assert.equal(approvedView.proposals[19].proposedWeight, 29.84);
  const edited = planFinalRigidBatchCorrections(inventory, plans, {
    includeReviewOnly: true, currentEditedValues: new Map([[20,'160']]),
  });
  assert.equal(edited.proposals[19].status, 'ALREADY_EDITED');
  plans[19].sourceContext.conflicts = ['RATING_CONFLICT'];
  assert.equal(planFinalRigidBatchCorrections(inventory, plans, { includeReviewOnly: true })
    .proposals[19].status, 'HOLD');
  plans[19].sourceContext.conflicts = [];
  plans[19].sourceContext.dtxr.suppressed = true;
  assert.equal(planFinalRigidBatchCorrections(inventory, plans, { includeReviewOnly: true })
    .proposals[19].status, 'HOLD');
});
test('alternative choice is requalified against threshold, shared source owner is blocked', () => {
  const { inventory, plans } = inventoryAndPlans(22);
  plans[19].nearestSuggestions.push(candidate(120, { title: 'Farther alternative' }));
  const alt = planFinalRigidBatchCorrections(inventory, plans, {
    selectedIndices: new Map([[20, 1]]), thresholdPct: 40,
  });
  assert.equal(alt.proposals[19].proposedWeight, 120);
  assert.equal(alt.proposals[19].status, 'BELOW_THRESHOLD');
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
