import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  AIV_PROMOTION_ARTIFACT_KEYS,
  parseAivPromotionVerificationArtifact,
  promotionEvidenceFromLoadedArtifacts,
} from '../tabs/vibration-aiv-promotion-artifacts.js';
import { renderAivPromotionReadinessHtml } from '../tabs/vibration-aiv-promotion-view.js';

function bytes(value) {
  return new TextEncoder().encode(value);
}

function expectedSha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

test('promotion artifact key set contains five prerequisite verification uploads and excludes final authority review', () => {
  assert.deepEqual(AIV_PROMOTION_ARTIFACT_KEYS, [
    't27Reconciliation',
    'd23Flm1Reconciliation',
    'workedExampleResultScope',
    'independentBenchmarks',
    'workbookReconciliation',
  ]);
  assert.equal(AIV_PROMOTION_ARTIFACT_KEYS.includes('independentVibrationEngineerPromotionReview'), false);
});

test('artifact loader hashes exact JSON bytes and preserves structured verification', async () => {
  const json = JSON.stringify({
    schema: 'AivT27ReconciliationVerification.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    reconciliationComplete: true,
    reviewedTraceCount: 9,
    productionEquationAuthorized: false,
  });
  const artifact = await parseAivPromotionVerificationArtifact(
    't27Reconciliation', bytes(json), { fileName: 't27-verification.json' },
  );
  assert.equal(artifact.artifactSha256, expectedSha256(json));
  assert.equal(artifact.fileName, 't27-verification.json');
  assert.equal(artifact.byteLength, bytes(json).byteLength);
  assert.equal(artifact.verification.schema, 'AivT27ReconciliationVerification.v1');
  assert.equal(Object.isFrozen(artifact), true);
});

test('artifact loader rejects invalid UTF-8/JSON and unsupported keys', async () => {
  await assert.rejects(
    () => parseAivPromotionVerificationArtifact('t27Reconciliation', bytes('{bad json')),
    (error) => error?.code === 'AIV_PROMOTION_ARTIFACT_JSON_INVALID',
  );
  await assert.rejects(
    () => parseAivPromotionVerificationArtifact('finalReview', bytes('{}')),
    (error) => error?.code === 'AIV_PROMOTION_ARTIFACT_KEY_UNSUPPORTED',
  );
});

test('loaded artifacts become planner evidence records with computed hashes', async () => {
  const json = JSON.stringify({
    schema: 'AivIndependentBenchmarkReviewVerification.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    reviewComplete: true,
    sonicSff6BenchmarkAccepted: true,
    multiSourceBenchmarksAccepted: true,
    productionEquationAuthorized: false,
  });
  const artifact = await parseAivPromotionVerificationArtifact('independentBenchmarks', bytes(json));
  const evidence = promotionEvidenceFromLoadedArtifacts({ independentBenchmarks: artifact });
  assert.deepEqual(Object.keys(evidence), ['independentBenchmarks']);
  assert.equal(evidence.independentBenchmarks.artifactSha256, expectedSha256(json));
  assert.equal(evidence.independentBenchmarks.verification.reviewComplete, true);
});

test('promotion UI exposes five verification imports but not final independent authority decision upload', () => {
  const html = renderAivPromotionReadinessHtml({ promotionArtifacts: {} });
  assert.match(html, /data-aiv-promotion-file="t27Reconciliation"/u);
  assert.match(html, /data-aiv-promotion-file="d23Flm1Reconciliation"/u);
  assert.match(html, /data-aiv-promotion-file="workedExampleResultScope"/u);
  assert.match(html, /data-aiv-promotion-file="independentBenchmarks"/u);
  assert.match(html, /data-aiv-promotion-file="workbookReconciliation"/u);
  assert.doesNotMatch(html, /data-aiv-promotion-file="independentVibrationEngineerPromotionReview"/u);
  assert.match(html, /final independent vibration-engineer promotion decision is deliberately not uploadable/u);
});
