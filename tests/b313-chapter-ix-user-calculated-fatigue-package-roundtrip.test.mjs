import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const Core = require(path.join(repo, 'engineering/hp-class-standardization/authority-package-core.js'));

function basePackage({ canonical, rowEvidence, lifecycle = 'for-review' }) {
  return Core.createPackage({
    generatedAt: '2026-08-16T00:00:00Z',
    metadata: {
      packageId: 'HPC-KD3-ROUNDTRIP',
      revision: 'A',
      projectRef: 'TEST',
      preparedBy: 'ENGINEER_A',
      checkedBy: 'ENGINEER_B',
      lifecycle,
    },
    inputs: {
      design: { b31Edition: Core.SOURCES.b31.edition },
      authority: {
        seqMode: 'manual',
        fatigueCurveMode: 'manual',
        seqRouteSourceRef: 'EXT-KD3-001',
        seqRouteApproved: true,
        seqBeta: null,
        seqReferenceCycles: null,
        seqMeanTermLimit: null,
        fatigueCurveData: '',
      },
      cycles: [{ id: 'C1' }],
    },
    rowEvidence,
    userCalculatedKd3Evidence: canonical,
  });
}

function basis() {
  return {
    code: 'ASME BPVC VIII-3',
    edition: '2025',
    methodRef: 'KD-3',
    calculationRef: 'EXT-KD3-001',
    calculatedBy: 'ENGINEER_A',
    checkedBy: 'ENGINEER_B',
    checkedAt: '2026-08-16T00:00:00Z',
  };
}

test('authority package round-trips canonical positive-damage USER_CALCULATED_KD3 evidence', () => {
  const canonical = [{
    key: '13.4900-C1',
    userAlternatingStressIntensityMpa: 87.91596640349115,
    equivalentAlternatingStressMpa: 95,
    permissibleCycles: 20000,
    calculationBasis: basis(),
  }];
  const pkg = basePackage({
    canonical,
    rowEvidence: [{ key: '13.4900-C1', seq: 95, ni: 20000, source: 'EXT-KD3-001', approved: true }],
    lifecycle: 'approved-record',
  });
  const validation = Core.validatePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const imported = Core.importPayload(JSON.parse(JSON.stringify(pkg)));
  assert.equal(imported.ok, true, imported.errors.join('\n'));
  assert.deepEqual(imported.payload.userCalculatedKd3Evidence, canonical);
});

test('authority package accepts explicit zero-damage row without inventing N', () => {
  const canonical = [{
    key: '13.4900-C1',
    userAlternatingStressIntensityMpa: 0,
    equivalentAlternatingStressMpa: 0,
    permissibleCycles: null,
    calculationBasis: basis(),
  }];
  const pkg = basePackage({
    canonical,
    rowEvidence: [{ key: '13.4900-C1', seq: 0, ni: null, source: 'EXT-KD3-001', approved: true }],
    lifecycle: 'approved-record',
  });
  const validation = Core.validatePackage(pkg);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
});

test('approved canonical evidence rejects missing N for positive Seq', () => {
  const pkg = basePackage({
    canonical: [{
      key: '13.4900-C1',
      userAlternatingStressIntensityMpa: null,
      equivalentAlternatingStressMpa: 95,
      permissibleCycles: null,
      calculationBasis: basis(),
    }],
    rowEvidence: [{ key: '13.4900-C1', seq: 95, ni: null, source: 'EXT-KD3-001', approved: true }],
    lifecycle: 'approved-record',
  });
  const validation = Core.validatePackage(pkg);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((message) => message.includes('positive Seq requires finite N > 0')));
});

test('approved canonical evidence rejects non-independent per-cycle checker custody', () => {
  const pkg = basePackage({
    canonical: [{
      key: '13.4900-C1',
      userAlternatingStressIntensityMpa: null,
      equivalentAlternatingStressMpa: 95,
      permissibleCycles: 20000,
      calculationBasis: { ...basis(), checkedBy: ' engineer_a ' },
    }],
    rowEvidence: [{ key: '13.4900-C1', seq: 95, ni: 20000, source: 'EXT-KD3-001', approved: true }],
    lifecycle: 'approved-record',
  });
  const validation = Core.validatePackage(pkg);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((message) => message.includes('checker must differ from calculatedBy')));
});

test('draft/review canonical evidence rejects negative values instead of transporting invalid fatigue data', () => {
  const pkg = basePackage({
    canonical: [{
      key: '13.4900-C1',
      userAlternatingStressIntensityMpa: -1,
      equivalentAlternatingStressMpa: -2,
      permissibleCycles: 0,
      calculationBasis: { ...basis(), checkedBy: '', checkedAt: '' },
    }],
    rowEvidence: [{ key: '13.4900-C1', seq: null, ni: null, source: '', approved: false }],
    lifecycle: 'for-review',
  });
  const validation = Core.validatePackage(pkg);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((message) => message.includes('userAlternatingStressIntensityMpa must be >= 0')));
  assert.ok(validation.errors.some((message) => message.includes('equivalentAlternatingStressMpa must be >= 0')));
  assert.ok(validation.errors.some((message) => message.includes('permissibleCycles must be > 0 when supplied')));
});

test('draft/review canonical evidence rejects unpaired checker custody', () => {
  const pkg = basePackage({
    canonical: [{
      key: '13.4900-C1',
      userAlternatingStressIntensityMpa: null,
      equivalentAlternatingStressMpa: 95,
      permissibleCycles: 20000,
      calculationBasis: { ...basis(), checkedAt: '' },
    }],
    rowEvidence: [{ key: '13.4900-C1', seq: 95, ni: 20000, source: 'EXT-KD3-001', approved: false }],
    lifecycle: 'for-review',
  });
  const validation = Core.validatePackage(pkg);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((message) => message.includes('checkedBy and checkedAt must be supplied together')));
});

test('authority package UI and evidence bridge carry canonical custody and block partial restore', () => {
  const ui = fs.readFileSync(path.join(repo, 'engineering/hp-class-standardization/authority-package-ui.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(repo, 'engineering/hp-class-standardization/user-calculated-fatigue-evidence-bridge.js'), 'utf8');
  assert.match(ui, /userCalculatedKd3Evidence/);
  assert.match(ui, /restoreCanonicalKd3Evidence/);
  assert.match(ui, /HpUserCalculatedKd3EvidenceBridge/);
  assert.match(ui, /canonical\.expected !== canonical\.restored/);
  assert.match(ui, /USER_CALCULATED_KD3 package restore incomplete/);
  assert.match(bridge, /userAlternatingStressIntensityMpa/);
  assert.match(bridge, /equivalentAlternatingStressMpa/);
  assert.match(bridge, /permissibleCycles/);
  assert.match(bridge, /calculationBasis/);
  assert.match(bridge, /checkedAt/);
});
