import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_WORKBOOK_RECONCILIATION_SCHEMA,
  assertAivWorkbookReconciliationComplete,
  createAivWorkbookReconciliationTemplate,
} from '../scripts/verify-aiv-workbook-reconciliation.mjs';

const ROOT = new URL('../', import.meta.url);
const HASHES = ['a', 'b', 'c'];
const WORKBOOKS = [
  ['AIV-WB-KS-PR-CAL-0087', 'sha1:2566d41c02768a2345513ed42d270b123fe5087c'],
  ['AIV-WB-AIV-FIV', 'sha1:048332ed93abd258ffced6b83af0ae343dfcbc9d'],
  ['AIV-WB-CLOSED-RV', 'sha1:83eeb40d9b224ddd5020c26410a659e01bcea991'],
];

function inventory() {
  return {
    schema: 'AivWorkbookSourceInventory.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    baseline: {
      repository: 'reallaksh19/CRF-4-1',
      commit: '68dc8e1fa2ef67073c59b3afc56f1bf40953d535',
    },
    workbooks: WORKBOOKS.map(([workbookId, gitBlobSha1], index) => ({
      workbookId,
      gitBlobSha1,
      privateDetailsSha256: `sha256:${HASHES[index].repeat(64)}`,
      formulaCount: index + 2,
      hiddenSheetCount: index,
      definedNameCount: index + 1,
      migrationEvidenceOnly: true,
      productionAuthority: false,
      formulaImplementationAuthorized: false,
      eiReconciliationRequired: true,
    })),
    authority: {
      evidenceClass: 'MIGRATION_REFERENCE_ONLY',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
  };
}

function completed(source, manifestHash = 'sha256:' + 'd'.repeat(64)) {
  const value = createAivWorkbookReconciliationTemplate(source, { inventoryManifestSha256: manifestHash });
  value.records = value.records.map((record, index) => ({
    ...record,
    reviewState: 'REVIEWED',
    reviewerType: 'HUMAN_ENGINEER',
    reviewer: 'Independent vibration engineer',
    reviewDate: '2026-08-12',
    reviewedFormulaCount: record.expectedFormulaCount,
    reviewedHiddenSheetCount: record.expectedHiddenSheetCount,
    reviewedDefinedNameCount: record.expectedDefinedNameCount,
    disposition: index === 0 ? 'RECONCILED_TO_EI_TRACE_SET_NO_AUTHORITY' : 'REFERENCE_ONLY_NO_FORMULA_ADOPTION',
    eiTraceIds: index === 0 ? ['AIV-EQ-SOURCE-PWL-001', 'AIV-EQ-T2-6-001'] : [],
    conflicts: [],
    rationale: 'All extracted formula/name/hidden-sheet records were reviewed against the controlled EI trace set.',
    implementationNote: 'Retain as migration evidence only; production equations come from qualified EI source records.',
  }));
  return value;
}

test('template binds all retained workbook blobs and private detail hashes', () => {
  const source = inventory();
  const template = createAivWorkbookReconciliationTemplate(source, { inventoryManifestSha256: 'sha256:' + 'd'.repeat(64) });
  assert.equal(template.schema, AIV_WORKBOOK_RECONCILIATION_SCHEMA);
  assert.equal(template.records.length, 3);
  assert.deepEqual(template.records.map((record) => record.gitBlobSha1), source.workbooks.map((row) => row.gitBlobSha1));
  assert.deepEqual(template.records.map((record) => record.privateDetailsSha256), source.workbooks.map((row) => row.privateDetailsSha256));
  assert(template.records.every((record) => record.reviewState === 'PENDING'));
  assert.equal(template.authority.productionEquationAuthorized, false);
});

test('complete named human review closes only the workbook migration-reconciliation gate', () => {
  const source = inventory();
  const manifestHash = 'sha256:' + 'd'.repeat(64);
  const result = assertAivWorkbookReconciliationComplete(source, completed(source, manifestHash), {
    inventoryManifestSha256: manifestHash,
  });
  assert.equal(result.reconciliationComplete, true);
  assert.equal(result.reviewedWorkbookCount, 3);
  assert.equal(result.productionEquationAuthorized, false);
  assert.equal(result.workbookFormulasRemainMigrationEvidenceOnly, true);
  assert(result.remainingPromotionGates.includes('CONTROLLED_T2_7_HUMAN_RECONCILIATION'));
});

test('review coverage must exactly match extracted formula/name/hidden-sheet counts', () => {
  const source = inventory();
  const review = completed(source);
  review.records[0].reviewedFormulaCount -= 1;
  assert.throws(
    () => assertAivWorkbookReconciliationComplete(source, review, { inventoryManifestSha256: 'sha256:' + 'd'.repeat(64) }),
    /AIV_WORKBOOK_RECONCILIATION_COVERAGE_INCOMPLETE/u,
  );
});

test('reconciled workbook formulas require controlled EI trace IDs', () => {
  const source = inventory();
  const review = completed(source);
  review.records[0].eiTraceIds = [];
  assert.throws(
    () => assertAivWorkbookReconciliationComplete(source, review, { inventoryManifestSha256: 'sha256:' + 'd'.repeat(64) }),
    /AIV_WORKBOOK_RECONCILIATION_EI_TRACE_REQUIRED/u,
  );
});

test('conflict exclusion requires an explicit conflict record and still grants no authority', () => {
  const source = inventory();
  const review = completed(source);
  review.records[1].disposition = 'CONFLICT_IDENTIFIED_AND_EXCLUDED';
  assert.throws(
    () => assertAivWorkbookReconciliationComplete(source, review, { inventoryManifestSha256: 'sha256:' + 'd'.repeat(64) }),
    /AIV_WORKBOOK_RECONCILIATION_CONFLICT_REQUIRED/u,
  );
  review.records[1].conflicts = ['Workbook formula differs from reviewed EI trace and is excluded from implementation.'];
  const result = assertAivWorkbookReconciliationComplete(source, review, { inventoryManifestSha256: 'sha256:' + 'd'.repeat(64) });
  assert.equal(result.productionEquationAuthorized, false);
});

test('AI/anonymous review cannot close the retained workbook gate', () => {
  const source = inventory();
  const review = completed(source);
  review.records[0].reviewerType = 'AI_ASSISTED';
  assert.throws(
    () => assertAivWorkbookReconciliationComplete(source, review, { inventoryManifestSha256: 'sha256:' + 'd'.repeat(64) }),
    /AIV_WORKBOOK_RECONCILIATION_HUMAN_REVIEW_REQUIRED/u,
  );
});

test('package exposes workbook reconciliation verifier command', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('package.json', ROOT), 'utf8'));
  assert.equal(pkg.scripts['verify:aiv-workbook-reconciliation'], 'node scripts/verify-aiv-workbook-reconciliation.mjs');
});
