import assert from 'node:assert/strict';

import {
  derivePreviewB313AuditSummary,
  renderPreviewB313WallAuditHtml,
  selectPreviewB313AuditRows,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js';

const snapshot = [
  { branchName: '/A/B1', lineKey: 'L-100', material: 'A106 Gr B', t1: '120' },
  { branchName: '/A/B2', lineKey: 'L-100', material: 'A106 Gr B', t1: '120' },
];

assert.deepEqual(
  selectPreviewB313AuditRows(snapshot, []),
  snapshot,
  'retained Preview rows must be used when the live legacy cache was cleared before the action click',
);

const live = [{ branchName: '/LIVE/B1', lineKey: 'L-200' }];
assert.deepEqual(
  selectPreviewB313AuditRows(snapshot, live),
  live,
  'non-empty live Preview rows must take precedence over the retained snapshot',
);

const staleSummaryReport = {
  summary: { inputRows: 0, updatedRows: 0, skippedRows: 0 },
  rows: [
    {
      branchName: '/A/B1',
      lineKey: 'L-100',
      status: 'UPDATED',
      materialId: 'A106_GR_B',
      factorBasisMode: 'ACTIVE_MASTER_STRICT',
      evidence: {
        previewMaterial: 'ASTM A106 Gr B',
        materialId: 'A106_GR_B',
        designTemperature: '120',
        factorBasisMode: 'ACTIVE_MASTER_STRICT',
        factorDesignAuthority: true,
        allowableStress: 118,
        stressUnit: 'MPa',
        qualityFactorE: 1,
        weldStrengthReductionW: 1,
        coefficientY: 0.4,
      },
      result: {
        outsideDiameterMm: 114.3,
        designPressure: 4.8,
        pressureUnit: 'MPA',
        corrosionAllowanceMm: 3,
        selectedNominalWallMm: 8.56,
        equivalentSchedules: ['Sch 80'],
        selectionMarginMm: 0.6123,
        calculation: { requiredNominalThicknessMm: 7.9477 },
      },
    },
    {
      branchName: '/A/B2',
      lineKey: 'L-100',
      status: 'NOT_UPDATED',
      code: 'B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED',
      message: 'Pressure unit could not be resolved.',
      details: {
        materialIdentity: { ok: true, material: { materialId: 'A106_GR_B' } },
        factorBasis: { ok: true, mode: 'ACTIVE_MASTER_STRICT' },
      },
    },
  ],
};

assert.deepEqual(
  derivePreviewB313AuditSummary(staleSummaryReport),
  {
    evaluatedRows: 2,
    updatedRows: 1,
    notUpdatedRows: 1,
    summaryMismatch: true,
    hasInput: true,
    allUpdated: false,
  },
  'row evidence must repair a stale 0/0 summary',
);

const html = renderPreviewB313WallAuditHtml(staleSummaryReport);
assert.match(html, /Evaluated 2 · Updated 1 · Not updated 1/);
assert.match(html, /ASME B31\.3-2024 §304\.1\.2 Eq\. \(3a\)/);
assert.match(html, /Preview Material → B31\.3 identity → active strict S\/E\/W\/Y at T1/);
assert.match(html, /BENCHMARK_ONLY factors/);
assert.match(html, /12\.5% negative/);
assert.match(html, /A106_GR_B · T1 120 °C/);
assert.match(html, /S 118 MPa · E 1 · W 1 · Y 0\.4/);
assert.match(html, /required nominal 7\.9477 mm → selected 8\.5600 mm/);
assert.match(html, /B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED/);
assert.match(html, /Audit counters were recomputed from row evidence/);

const noRowsHtml = renderPreviewB313WallAuditHtml({
  summary: { inputRows: 0, updatedRows: 0, skippedRows: 0 },
  rows: [],
});
assert.match(noRowsHtml, /Evaluated 0 · Updated 0 · Not updated 0/);
assert.match(noRowsHtml, /No Preview branch rows were available to evaluate/);
assert.doesNotMatch(noRowsHtml, /B31\.3 wall update audit — 0 updated, 0 not updated/);

console.log('XML/CII Preview B31.3 wall audit controller checks passed.');
