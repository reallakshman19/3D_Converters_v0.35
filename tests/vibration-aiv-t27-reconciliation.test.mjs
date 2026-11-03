import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_T27_RECONCILIATION_SCHEMA,
  AIV_T27_REQUIRED_RECONCILIATION_ITEMS,
  assertAivT27ReconciliationComplete,
  createAivT27ReconciliationTemplate,
} from '../scripts/verify-aiv-t27-reconciliation.mjs';

const ROOT = new URL('../', import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, ROOT), 'utf8');

function extractionManifest() {
  return {
    schema: 'AivT27SourceExtraction.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    source: { gitBlobSha1: 'sha1:9d3eccc56429411e17c07a579bdebbd13cb0bdc5' },
    extraction: { firstPage: 59, lastPage: 62, pageCount: 4 },
    pages: [59, 60, 61, 62].map((pageNumber, index) => ({
      pageNumber,
      textSha256: `sha256:${String(index + 1).repeat(64)}`,
    })),
    qualification: { productionEquationAuthorized: false },
  };
}

function completedReconciliation(manifest, manifestHash = 'sha256:' + 'f'.repeat(64)) {
  const value = createAivT27ReconciliationTemplate(manifest, { extractionManifestSha256: manifestHash });
  value.records = value.records.map((record, index) => {
    const requirement = AIV_T27_REQUIRED_RECONCILIATION_ITEMS.find((item) => item.traceId === record.traceId);
    return {
      ...record,
      reviewState: 'REVIEWED',
      reviewerType: 'HUMAN_ENGINEER',
      reviewer: 'Independent vibration engineer',
      reviewDate: '2026-08-12',
      transcriptionSha256: `sha256:${(index + 10).toString(16).padStart(2, '0').repeat(32)}`,
      equationOrRuleDisposition: 'TRANSCRIBED_AND_VERIFIED',
      branchPredicateDisposition: 'RECORDED',
      nativeUnitsDisposition: 'RECORDED',
      errataDisposition: requirement.errataDisposition,
    };
  });
  return value;
}

test('reconciliation template binds every required trace to the controlled page hash', () => {
  const manifest = extractionManifest();
  const template = createAivT27ReconciliationTemplate(manifest, {
    extractionManifestSha256: 'sha256:' + 'f'.repeat(64),
  });
  assert.equal(template.schema, AIV_T27_RECONCILIATION_SCHEMA);
  assert.equal(template.records.length, 9);
  assert.deepEqual(template.records.map((record) => record.traceId), AIV_T27_REQUIRED_RECONCILIATION_ITEMS.map((item) => item.traceId));
  assert.equal(template.records.find((record) => record.traceId === 'AIV-EQ-T2-6-001').sourcePage, 61);
  assert.equal(template.authority.productionEquationAuthorized, false);
});

test('complete named human-engineer reconciliation closes the source-review gate without numerical promotion', () => {
  const manifest = extractionManifest();
  const manifestHash = 'sha256:' + 'f'.repeat(64);
  const reconciliation = completedReconciliation(manifest, manifestHash);
  const result = assertAivT27ReconciliationComplete(manifest, reconciliation, {
    extractionManifestSha256: manifestHash,
  });
  assert.equal(result.reconciliationComplete, true);
  assert.equal(result.reviewedTraceCount, 9);
  assert.equal(result.productionEquationAuthorized, false);
  assert(result.remainingPromotionGates.includes('DIRECT_EXTRACT_PINNED_EI_EXAMPLES_PDF'));
  assert(result.remainingPromotionGates.includes('RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC'));
  assert(result.remainingPromotionGates.includes('INDEPENDENT_SONIC_SFF6_BENCHMARK'));
  assert(result.remainingPromotionGates.includes('INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW'));
  assert(!result.remainingPromotionGates.includes('COMPLETE_D2_3_FINAL_T2_6_ENDPOINT'));
});

test('page-61 T2-6 record must explicitly reconcile the official errata trace', () => {
  const manifest = extractionManifest();
  const reconciliation = completedReconciliation(manifest);
  const record = reconciliation.records.find((item) => item.traceId === 'AIV-EQ-T2-6-001');
  record.errataDisposition = 'NOT_APPLICABLE';
  assert.throws(
    () => assertAivT27ReconciliationComplete(manifest, reconciliation, { extractionManifestSha256: 'sha256:' + 'f'.repeat(64) }),
    /AIV_T27_RECONCILIATION_ERRATA_DISPOSITION_INVALID/u,
  );
});

test('reconciliation fails if the controlled extraction page hash changes', () => {
  const manifest = extractionManifest();
  const reconciliation = completedReconciliation(manifest);
  manifest.pages.find((page) => page.pageNumber === 60).textSha256 = 'sha256:' + '0'.repeat(64);
  assert.throws(
    () => assertAivT27ReconciliationComplete(manifest, reconciliation, { extractionManifestSha256: 'sha256:' + 'f'.repeat(64) }),
    /AIV_T27_RECONCILIATION_PAGE_HASH_MISMATCH/u,
  );
});

test('AI or anonymous review cannot satisfy the human reconciliation gate', () => {
  const manifest = extractionManifest();
  const reconciliation = completedReconciliation(manifest);
  reconciliation.records[0].reviewerType = 'AI_ASSISTED';
  assert.throws(
    () => assertAivT27ReconciliationComplete(manifest, reconciliation, { extractionManifestSha256: 'sha256:' + 'f'.repeat(64) }),
    /AIV_T27_RECONCILIATION_HUMAN_REVIEWER_REQUIRED/u,
  );
});

test('package exposes the reconciliation verifier command', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.equal(pkg.scripts['verify:aiv-t27-reconciliation'], 'node scripts/verify-aiv-t27-reconciliation.mjs');
});
