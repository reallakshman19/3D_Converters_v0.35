const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'empirical-weight-validation-'));
fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
fs.mkdirSync(path.join(tempRoot, 'converters/empirical-weight'), { recursive: true });
fs.copyFileSync(
  path.join(root, 'converters/empirical-weight/empirical-weight-validation.js'),
  path.join(tempRoot, 'converters/empirical-weight/empirical-weight-validation.js'),
);
fs.writeFileSync(
  path.join(tempRoot, 'converters/empirical-weight/empirical-weight-estimator.js'),
  `
function positive(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
export function createEmpiricalWeightEstimator({ masterRows = [], model = {} } = {}) {
  return {
    masterRows,
    model,
    approach1(input) {
      return { ok: true, weightKg: 100, approach: 'A1_SIZE_BAND', confidence: 'EQUATION', modelId: 'A1|FACTORY', typeDesc: input.typeDesc, rating: Number(input.rating), size: Number(input.ns), target: String(input.target || '').toUpperCase().includes('BW') ? 'BW KG' : 'RF/RTJ KG' };
    },
    approach2(input) {
      const target = String(input.target || '').toUpperCase().includes('BW') ? 'BW KG' : 'RF/RTJ KG';
      const exact = masterRows.find((row) => String(row.TypeDesc || row.typeDesc || '').toLowerCase() === String(input.typeDesc || '').toLowerCase() && Number(row.NS || row.ns) === Number(input.ns) && Number(row.Rating || row.rating) === Number(input.rating));
      const exactWeight = target === 'BW KG' ? positive(exact?.['BW KG']) : positive(exact?.['RF/RTJ KG']);
      return { ok: true, weightKg: exactWeight || 80, approach: 'A2_MATRIX', confidence: 'HIGH', modelId: 'A2|FACTORY', typeDesc: input.typeDesc, rating: Number(input.rating), size: Number(input.ns), target, predictions: { band: 100, ratio: exactWeight || 80, cross: 80 }, weights: { band: 0.2, ratio: 0.4, cross: 0.4 } };
    },
  };
}
`,
  'utf8',
);

function ok(weightKg, approach, confidence, modelId) {
  return { ok: true, weightKg, approach, confidence, modelId };
}

const stubEstimator = {
  approach1(input) {
    if (input.typeDesc === 'NO_A1') return { ok: false, error: { code: 'A1_MODEL_NOT_FOUND', message: 'none' } };
    return ok(100, 'A1_SIZE_BAND', 'EQUATION', 'A1|TEST');
  },
  approach2(input) {
    if (input.typeDesc === 'NO_A2') return { ok: false, error: { code: 'NO_MATRIX_SUPPORT', message: 'none' } };
    return {
      ...ok(200, 'A2_MATRIX', 'HIGH', 'A2|TEST'),
      predictions: { band: 100, ratio: 210, cross: 190 },
      weights: { band: 0.2, ratio: 0.4, cross: 0.4 },
      support: { ratioMethod: 'test', ratioAnchors: 2, crossRectangles: 6 },
    };
  },
};

(async () => {
  const api = await import(pathToFileURL(path.join(tempRoot, 'converters/empirical-weight/empirical-weight-validation.js')).href);
  assert.strictEqual(api.DEFAULT_EMPIRICAL_WEIGHT_ABNORMALITY_THRESHOLD_PCT, 30);

  const validator = api.createEmpiricalWeightValidator({ estimator: stubEstimator });

  // Exactly +30% against A1 is acceptable; A2 is -35% and therefore abnormal.
  const plus30 = validator.validate({ rowId: 'PLUS30', typeDesc: 'VALVE', ns: 4, rating: 300, target: 'RF', observedWeightKg: 130 });
  assert.strictEqual(plus30.approach1.deviationPct, 30);
  assert.strictEqual(plus30.approach1.abnormal, false);
  assert.strictEqual(plus30.approach1.status, 'WITHIN_THRESHOLD');
  assert.strictEqual(plus30.approach2.deviationPct, -35);
  assert.strictEqual(plus30.approach2.abnormal, true);
  assert.strictEqual(plus30.status, 'ABNORMAL_A2');

  // Exactly -30% against A2 is acceptable; A1 is +40% and abnormal.
  const minus30 = validator.validate({ rowId: 'MINUS30', typeDesc: 'VALVE', ns: 4, rating: 300, target: 'RF', observedWeightKg: 140 });
  assert.strictEqual(minus30.approach2.deviationPct, -30);
  assert.strictEqual(minus30.approach2.abnormal, false);
  assert.strictEqual(minus30.approach1.deviationPct, 40);
  assert.strictEqual(minus30.status, 'ABNORMAL_A1');

  const both = validator.validate({ rowId: 'BOTH', typeDesc: 'VALVE', ns: 4, rating: 300, target: 'RF', observedWeightKg: 131 });
  assert.strictEqual(both.approach1.abnormal, true);
  assert.strictEqual(both.approach2.abnormal, true);
  assert.strictEqual(both.status, 'ABNORMAL_BOTH');
  assert(Math.abs(both.approach1.predictionErrorPctOfObserved - ((100 - 131) / 131 * 100)) < 1e-12);

  const partial = validator.validate({ rowId: 'PARTIAL', typeDesc: 'NO_A2', ns: 4, rating: 300, target: 'RF', observedWeightKg: 100 });
  assert.strictEqual(partial.approach1.available, true);
  assert.strictEqual(partial.approach2.available, false);
  assert.strictEqual(partial.status, 'WITHIN_THRESHOLD_PARTIAL');

  const invalid = validator.validate({ rowId: 'INVALID', typeDesc: 'VALVE', ns: 4, rating: 300, observedWeightKg: 0 });
  assert.strictEqual(invalid.ok, false);
  assert.strictEqual(invalid.status, 'UNVALIDATED');

  const customThreshold = validator.validate(
    { rowId: 'CUSTOM', typeDesc: 'VALVE', ns: 4, rating: 300, observedWeightKg: 125 },
    { abnormalityThresholdPct: 20 },
  );
  assert.strictEqual(customThreshold.approach1.abnormal, true);
  assert.strictEqual(customThreshold.abnormalityThresholdPct, 20);

  // A2 validation must not use the exact target master cell. The fixture
  // estimator would return that exact 120 kg if it remained present; after
  // leave-target-cell-out it returns the neighbor-derived 80 kg instead.
  const looValidator = api.createEmpiricalWeightValidator({
    masterRows: [
      { TypeDesc: 'VALVE', NS: 4, DN: 100, Rating: 300, 'RF/RTJ KG': 120, 'BW KG': 90 },
      { TypeDesc: 'VALVE', NS: 6, DN: 150, Rating: 300, 'RF/RTJ KG': 180, 'BW KG': 140 },
    ],
  });
  const loo = looValidator.validate({ rowId: 'LOO', typeDesc: 'VALVE', ns: 4, rating: 300, target: 'RF', observedWeightKg: 120 });
  assert.strictEqual(loo.approach2.estimatedWeightKg, 80, 'A2 must not see the target cell during validation');
  assert.strictEqual(loo.approach2.validationBasis, 'A2_LEAVE_TARGET_CELL_OUT');
  assert.strictEqual(loo.approach2.excludedTargetCellRows, 1);
  assert.strictEqual(loo.approach2.abnormal, true);

  const fullCatalog = looValidator.validate(
    { rowId: 'FULL', typeDesc: 'VALVE', ns: 4, rating: 300, target: 'RF', observedWeightKg: 120 },
    { leaveTargetCellOutOfA2: false },
  );
  assert.strictEqual(fullCatalog.approach2.estimatedWeightKg, 120);
  assert.strictEqual(fullCatalog.approach2.validationBasis, 'A2_FULL_CATALOG');
  assert.strictEqual(fullCatalog.approach2.abnormal, false);

  const report = validator.buildReport([
    { rowId: 'OK', typeDesc: 'VALVE', ns: 4, rating: 300, observedWeightKg: 105 },
    { rowId: 'A1', typeDesc: 'VALVE', ns: 4, rating: 300, observedWeightKg: 140 },
    { rowId: 'BOTH', typeDesc: 'VALVE', ns: 4, rating: 300, observedWeightKg: 131 },
    { rowId: 'PARTIAL', typeDesc: 'NO_A2', ns: 4, rating: 300, observedWeightKg: 100 },
  ]);
  assert.strictEqual(report.schema, 'empirical-weight-validation-report/v2');
  assert.strictEqual(report.authority, 'READ_ONLY_VALIDATION_NOT_WEIGHT_AUTHORITY');
  assert.strictEqual(report.exactLookupUsed, false);
  assert.strictEqual(report.approach2ValidationBasis, 'LEAVE_TARGET_CELL_OUT');
  assert.deepStrictEqual(report.approaches, ['A1_SIZE_BAND', 'A2_MATRIX']);
  assert.strictEqual(report.summary.inputRows, 4);
  assert.strictEqual(report.summary.abnormalRows, 3);
  assert.strictEqual(report.abnormalities.some((row) => row.rowId === 'PARTIAL'), false);

  const abnormalCsv = api.empiricalWeightValidationReportToCsv(report);
  assert(abnormalCsv.includes('rowId,componentRefNo'));
  assert(abnormalCsv.includes('A1_validationBasis'));
  assert(abnormalCsv.includes('A2_validationBasis'));
  assert(abnormalCsv.includes('A1'));
  assert(abnormalCsv.includes('BOTH'));
  assert(!abnormalCsv.includes('PARTIAL,', abnormalCsv.indexOf('\n') + 1));

  const allCsv = api.empiricalWeightValidationReportToCsv(report, { abnormalOnly: false });
  assert(allCsv.includes('PARTIAL'));

  const indexSource = fs.readFileSync(path.join(root, 'converters/empirical-weight/index.js'), 'utf8');
  assert(indexSource.includes('buildEmpiricalWeightValidationReport'));
  assert(indexSource.includes('empiricalWeightValidationReportToCsv'));

  console.log('Empirical weight validation report checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
