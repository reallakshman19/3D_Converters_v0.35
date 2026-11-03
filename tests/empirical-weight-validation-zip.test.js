const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'empirical-weight-validation-zip-'));
fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
fs.mkdirSync(path.join(tempRoot, 'converters/empirical-weight'), { recursive: true });
for (const file of ['empirical-weight-validation.js', 'empirical-weight-validation-zip.js']) {
  fs.copyFileSync(path.join(root, 'converters/empirical-weight', file), path.join(tempRoot, 'converters/empirical-weight', file));
}
// Validation module imports the estimator; only a stub is needed for ZIP-only checks.
fs.writeFileSync(path.join(tempRoot, 'converters/empirical-weight/empirical-weight-estimator.js'), 'export function createEmpiricalWeightEstimator(){ return {}; }\n', 'utf8');

(async () => {
  const api = await import(pathToFileURL(path.join(tempRoot, 'converters/empirical-weight/empirical-weight-validation-zip.js')).href);
  const report = {
    schema: 'empirical-weight-validation-report/v1',
    inputScope: 'RESOLVED_WEIGHT_MATCH_COMPONENTS',
    abnormalityThresholdPct: 30,
    abnormalityDefinition: 'test definition',
    exactLookupUsed: false,
    approaches: ['A1_SIZE_BAND', 'A2_MATRIX'],
    summary: { inputRows: 2, abnormalRows: 1 },
    skippedRowCount: 0,
    abnormalities: [{ rowId: 'A', typeDesc: 'Flanged Gate Valve', observedWeightKg: 131, abnormalityThresholdPct: 30, status: 'ABNORMAL_A1', maximumAbsoluteDeviationPct: 31, approach1: { estimatedWeightKg: 100, deviationPct: 31, status: 'ABNORMAL_HIGH', confidence: 'EQUATION', modelId: 'A1' }, approach2: { estimatedWeightKg: 130, deviationPct: 0.769, status: 'WITHIN_THRESHOLD', confidence: 'HIGH', modelId: 'A2' } }],
    rows: [],
  };
  const first = api.buildEmpiricalWeightValidationEvidenceZip(report);
  const second = api.buildEmpiricalWeightValidationEvidenceZip(report);
  assert.strictEqual(first.zipName, 'empirical-weight-validation-evidence.zip');
  assert.deepStrictEqual([...first.bytes], [...second.bytes], 'same report must produce byte-identical ZIP');
  assert(first.files['weight-validation/empirical-weight-validation-report.json']);
  assert(first.files['weight-validation/empirical-weight-abnormalities.csv']);
  assert(first.files['weight-validation/manifest.json']);
  assert.strictEqual(first.manifest.authority, 'READ_ONLY_VALIDATION_NOT_WEIGHT_AUTHORITY');
  assert.strictEqual(first.manifest.inputScope, 'RESOLVED_WEIGHT_MATCH_COMPONENTS');
  assert.strictEqual(first.manifest.compression, 'STORE');
  assert.strictEqual(first.manifest.fixedTimestamp, '1980-01-01T00:00:00Z');
  assert.strictEqual(first.bytes[0], 0x50);
  assert.strictEqual(first.bytes[1], 0x4b);
  console.log('Empirical weight validation evidence ZIP checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
