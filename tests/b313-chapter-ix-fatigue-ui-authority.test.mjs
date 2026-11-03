import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const Core = require(path.join(repo, 'engineering/hp-class-standardization/authority-package-core.js'));

function validPackage() {
  return Core.createPackage({
    generatedAt: '2026-08-16T00:00:00.000Z',
    metadata: {
      packageId: 'HPC-FATIGUE-001',
      revision: 'A',
      projectRef: 'TEST',
      preparedBy: 'Engineer A',
      checkedBy: 'Engineer B',
      lifecycle: 'for-review',
    },
    inputs: {
      design: { b31Edition: Core.SOURCES.b31.edition },
      authority: {
        seqMode: 'manual',
        fatigueCurveMode: 'manual',
        seqRouteSourceRef: 'EXT-KD3-CALC-001',
        seqRouteApproved: true,
        seqBeta: null,
        seqReferenceCycles: null,
        seqMeanTermLimit: null,
        fatigueCurveData: '',
      },
      cycles: [{ id: 'C1' }],
    },
    rowEvidence: [{
      key: '13.4900-C1',
      seq: 125.5,
      ni: 250000,
      source: 'EXT-KD3-CALC-001',
      approved: true,
    }],
  });
}

test('authority package accepts only the external USER_CALCULATED_KD3 path', () => {
  const pkg = validPackage();
  const result = Core.validatePackage(pkg);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(pkg.fatigueAuthority.calculationMode, 'USER_CALCULATED_KD3');
  assert.equal(pkg.fatigueAuthority.nativeCoreKd3Qualified, false);
  assert.equal(pkg.fatigueAuthority.canUseForDesignAuthority, false);
  assert.equal(pkg.fatigueAuthority.codeCompliance, false);
});

test('authority package rejects legacy automatic/native Seq modes', () => {
  const pkg = validPackage();
  pkg.inputs.authority.seqMode = 'explicit-mean';
  const result = Core.validatePackage(pkg);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('Native/automatic KD-3 Seq is not qualified')));
});

test('authority package rejects automatic CORE fatigue-curve N evaluation', () => {
  const pkg = validPackage();
  pkg.inputs.authority.fatigueCurveMode = 'curve';
  const result = Core.validatePackage(pkg);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('CORE fatigue-curve Ni evaluation is not authorized')));
});

test('authority package rejects legacy mean-stress execution parameters', () => {
  const pkg = validPackage();
  pkg.inputs.authority.seqBeta = 0.25;
  const result = Core.validatePackage(pkg);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('seqBeta is legacy native-KD3 input')));
});

test('approved package custody requires an independent checker identity', () => {
  const pkg = validPackage();
  pkg.metadata.lifecycle = 'approved-record';
  pkg.metadata.checkedBy = ' engineer a ';
  const result = Core.validatePackage(pkg);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('Prepared by and checked by must be independent identities')));
});

test('approved row evidence requires positive external Seq/N and a calculation source', () => {
  const pkg = validPackage();
  pkg.rowEvidence[0].source = '';
  const result = Core.validatePackage(pkg);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('requires an external KD-3 calculation/source reference')));
});

test('live calculator UI exposes USER_CALCULATED_KD3 and keeps native routes disabled', () => {
  const html = fs.readFileSync(path.join(repo, 'engineering/hp-class-standardization/index.html'), 'utf8');
  assert.match(html, /User-calculated KD-3 — supply Seq and N/);
  assert.match(html, /value="core-kd3" disabled>CORE KD-3 — not qualified/);
  assert.match(html, /value="core-curve" disabled>CORE fatigue-curve evaluation — not qualified/);
  assert.doesNotMatch(html, /value="mean-embedded"/);
  assert.doesNotMatch(html, /value="explicit-mean"/);
  assert.match(html, /REVIEW ONLY \/ STOP/);
  assert.match(html, /fatigue-authority-guard\.js/);
});

test('runtime guard prevents class-release wording from surviving the external KD3 path', () => {
  const guard = fs.readFileSync(path.join(repo, 'engineering/hp-class-standardization/fatigue-authority-guard.js'), 'utf8');
  assert.match(guard, /CORE KD-3 Seq is not qualified/);
  assert.match(guard, /CORE fatigue-curve Ni evaluation is not authorized/);
  assert.match(guard, /Review only — KD-3 design authority not established/);
  assert.match(guard, /USER_CALCULATED_KD3/);
});
