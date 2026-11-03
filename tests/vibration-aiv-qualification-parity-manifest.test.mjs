import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_QUALIFICATION_PARITY_MANIFEST_SCHEMA,
  buildAivQualificationParityManifest,
} from '../scripts/build-aiv-qualification-parity-manifest.mjs';

const ROOT = new URL('../', import.meta.url);

function check(manifest, id) {
  const item = manifest.parity.checks.find((entry) => entry.parityId === id);
  assert(item, `missing parity check ${id}`);
  return item;
}

test('qualification parity manifest pins controlled source identities and solve hashes', () => {
  const manifest = buildAivQualificationParityManifest();
  assert.equal(manifest.schema, AIV_QUALIFICATION_PARITY_MANIFEST_SCHEMA);
  assert.equal(manifest.methodId, 'VIB.AIV.ACOUSTIC');
  assert.equal(manifest.controlledSources.mainGuidance.gitBlob, '9d3eccc56429411e17c07a579bdebbd13cb0bdc5');
  assert.equal(manifest.controlledSources.workedExampleDocx.gitBlob, 'ceee15ed5f7f320045d5f3979024e2e8664613f2');
  assert.equal(manifest.controlledSources.workedExamplePdf.gitBlob, '1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec');
  assert.equal(manifest.controlledSources.workedExampleMarkdown.gitBlob, '9f22d92eba8bdf3b67adc25a4c77a7f7d7211da8');
  assert.match(manifest.solveArtifacts.d23.canonicalSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(manifest.solveArtifacts.independentVectors.canonicalSha256, /^sha256:[0-9a-f]{64}$/u);
});

test('all current machine qualification parity checks pass within explicit tolerances', () => {
  const manifest = buildAivQualificationParityManifest();
  assert.equal(manifest.parity.status, 'MACHINE_PARITY_PASS');
  assert.equal(manifest.parity.counts.total, 16);
  assert.equal(manifest.parity.counts.passed, 16);
  assert.equal(manifest.parity.counts.failed, 0);
  for (const item of manifest.parity.checks) assert.equal(item.status, 'PASS', item.parityId);
  assert.equal(check(manifest, 'D23_LOF_PUBLISHED_FLM1_CHAIN').actual, 0.29);
  assert.equal(check(manifest, 'D23_LOF_RECALCULATED_FLM1_CHAIN').actual, 0.29);
});

test('machine parity manifest keeps unresolved engineering authority items visible', () => {
  const manifest = buildAivQualificationParityManifest();
  assert(manifest.unresolvedAuthorityItems.some((item) => /FLM1/u.test(item)));
  assert(manifest.unresolvedAuthorityItems.some((item) => /LOF=1\.48/u.test(item)));
  assert(manifest.unresolvedAuthorityItems.some((item) => /human acceptance/u.test(item)));
  assert.equal(manifest.authority.calculationState, 'BLOCKED');
  assert.equal(manifest.authority.productionEquationAuthorized, false);
  assert.equal(manifest.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(manifest.authority.designAuthority, false);
  assert.equal(manifest.authority.authorityTransitionApplied, false);
});

test('qualification parity builder stays isolated from production AIV facade and UI', () => {
  for (const path of [
    'converters/vibration/aiv/index.js',
    'tabs/vibration-aiv-qualification-tab.js',
    'tabs/vibration-aiv-qualification-view.js',
  ]) {
    const source = fs.readFileSync(new URL(path, ROOT), 'utf8');
    assert.doesNotMatch(source, /build-aiv-qualification-parity-manifest|buildAivQualificationParityManifest/u);
  }
});
