import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_D23_FLM1_RECONCILIATION_SCHEMA,
  assertAivD23Flm1ReconciliationComplete,
  createAivD23Flm1ReconciliationTemplate,
} from '../scripts/verify-aiv-d23-flm1-reconciliation.mjs';

const ROOT = new URL('../', import.meta.url);

function extractionManifest() {
  return {
    schema: 'AivD23ExamplesSourceExtraction.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    source: { gitBlobSha1: 'sha1:1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec' },
    extraction: { sectionTextSha256: 'sha256:' + 'a'.repeat(64) },
    qualification: {
      directPinnedPdfExtractionComplete: true,
      publishedFinalLofObserved: true,
      publishedFlm1ArithmeticReconciliationRequired: true,
      productionEquationAuthorized: false,
    },
  };
}

function completed(manifest, manifestHash = 'sha256:' + 'b'.repeat(64)) {
  const value = createAivD23Flm1ReconciliationTemplate(manifest, { extractionManifestSha256: manifestHash });
  value.mainGuidance.reviewedTranscriptionSha256 = 'sha256:' + 'c'.repeat(64);
  value.review = {
    state: 'REVIEWED',
    reviewerType: 'HUMAN_ENGINEER',
    reviewer: 'Independent vibration engineer',
    reviewDate: '2026-08-12',
    disposition: 'PUBLISHED_EXAMPLE_VARIANCE_ACCEPTED',
    benchmarkExpectedFlm1: 1.2109758194311824,
    benchmarkToleranceAbs: 0.003,
    rationale: 'Example arithmetic differs slightly from direct evaluation of the reviewed T2-6 relation using displayed diameters.',
    implementationNote: 'Use the reviewed T2-6 equation in implementation and retain 1.2133 as published worked-example evidence.',
  };
  return value;
}

test('template binds the published and recalculated FLM1 discrepancy to the exact D2.3 section hash', () => {
  const manifest = extractionManifest();
  const template = createAivD23Flm1ReconciliationTemplate(manifest, { extractionManifestSha256: 'sha256:' + 'b'.repeat(64) });
  assert.equal(template.schema, AIV_D23_FLM1_RECONCILIATION_SCHEMA);
  assert.equal(template.source.sectionTextSha256, manifest.extraction.sectionTextSha256);
  assert.equal(template.discrepancy.publishedFlm1, 1.2133);
  assert(Math.abs(template.discrepancy.recalculatedFlm1FromDisplayedInputs - 1.2109758194311824) < 1e-12);
  assert.equal(template.discrepancy.finalPublishedLof, 0.29);
  assert.equal(template.authority.productionEquationAuthorized, false);
});

test('named human review can close only the FLM1 discrepancy gate without production promotion', () => {
  const manifest = extractionManifest();
  const manifestHash = 'sha256:' + 'b'.repeat(64);
  const result = assertAivD23Flm1ReconciliationComplete(manifest, completed(manifest, manifestHash), {
    extractionManifestSha256: manifestHash,
  });
  assert.equal(result.reconciliationComplete, true);
  assert.equal(result.productionEquationAuthorized, false);
  assert.equal(result.disposition, 'PUBLISHED_EXAMPLE_VARIANCE_ACCEPTED');
  assert(result.remainingPromotionGates.includes('INDEPENDENT_SONIC_SFF6_BENCHMARK'));
});

test('AI/anonymous review cannot resolve the FLM1 discrepancy', () => {
  const manifest = extractionManifest();
  const reconciliation = completed(manifest);
  reconciliation.review.reviewerType = 'AI_ASSISTED';
  assert.throws(
    () => assertAivD23Flm1ReconciliationComplete(manifest, reconciliation, { extractionManifestSha256: 'sha256:' + 'b'.repeat(64) }),
    /AIV_D23_FLM1_HUMAN_REVIEW_REQUIRED/u,
  );
});

test('review cannot complete without a reviewed main T2-6 transcription hash', () => {
  const manifest = extractionManifest();
  const reconciliation = completed(manifest);
  reconciliation.mainGuidance.reviewedTranscriptionSha256 = null;
  assert.throws(
    () => assertAivD23Flm1ReconciliationComplete(manifest, reconciliation, { extractionManifestSha256: 'sha256:' + 'b'.repeat(64) }),
    /AIV_D23_FLM1_MAIN_GUIDANCE_REVIEW_REQUIRED/u,
  );
});

test('review cannot silently change authority', () => {
  const manifest = extractionManifest();
  const reconciliation = completed(manifest);
  reconciliation.authority.productionEquationAuthorized = true;
  assert.throws(
    () => assertAivD23Flm1ReconciliationComplete(manifest, reconciliation, { extractionManifestSha256: 'sha256:' + 'b'.repeat(64) }),
    /AIV_D23_FLM1_AUTHORITY_INVALID/u,
  );
});

test('package exposes the FLM1 reconciliation verifier command', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('package.json', ROOT), 'utf8'));
  assert.equal(pkg.scripts['verify:aiv-d23-flm1-reconciliation'], 'node scripts/verify-aiv-d23-flm1-reconciliation.mjs');
});
