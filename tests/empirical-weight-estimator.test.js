const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'empirical-weight-api-'));
fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
fs.mkdirSync(path.join(tempRoot, 'converters/empirical-weight/model'), { recursive: true });
fs.mkdirSync(path.join(tempRoot, 'converters/xml-cii2019-core'), { recursive: true });
for (const file of ['empirical-weight-model.js', 'empirical-weight-matrix.js', 'empirical-weight-estimator.js', 'index.js']) {
  fs.copyFileSync(path.join(root, 'converters/empirical-weight', file), path.join(tempRoot, 'converters/empirical-weight', file));
}
for (let i = 1; i <= 6; i += 1) {
  fs.copyFileSync(path.join(root, 'converters/empirical-weight/model', `part-${i}.js`), path.join(tempRoot, 'converters/empirical-weight/model', `part-${i}.js`));
}
fs.writeFileSync(path.join(tempRoot, 'converters/xml-cii2019-core/default-weight-master-rows.js'), 'export const DEFAULT_WEIGHT_MASTER_ROWS = Object.freeze([]);\n', 'utf8');

const masterRows = [
  { TypeDesc: 'Flanged Gate Valve', NS: 2, DN: 50, Rating: 150, 'RF/RTJ KG': 10, 'BW KG': 8 },
  { TypeDesc: 'Flanged Gate Valve', NS: 2, DN: 50, Rating: 150, 'RF/RTJ KG': 12, 'BW KG': 8 },
  { TypeDesc: 'Flanged Gate Valve', NS: 2, DN: 50, Rating: 150, 'RF/RTJ KG': 14, 'BW KG': 8 },
  { TypeDesc: 'Flanged Gate Valve', NS: 2, DN: 50, Rating: 300, 'RF/RTJ KG': 24, 'BW KG': 16 },
  { TypeDesc: 'Flanged Gate Valve', NS: 4, DN: 100, Rating: 150, 'RF/RTJ KG': 40, 'BW KG': 32 },
  { TypeDesc: 'Flanged Gate Valve', NS: 6, DN: 150, Rating: 150, 'RF/RTJ KG': 90, 'BW KG': 72 },
  { TypeDesc: 'Flanged Gate Valve', NS: 6, DN: 150, Rating: 300, 'RF/RTJ KG': 180, 'BW KG': 144 },
];

(async () => {
  const api = await import(pathToFileURL(path.join(tempRoot, 'converters/empirical-weight/index.js')).href);
  const estimator = api.createEmpiricalWeightEstimator({ masterRows });

  const exact = estimator.estimate({ typeDesc: 'flanged gate valve', ns: 2, rating: 150, target: 'RF' });
  assert.strictEqual(exact.ok, true);
  assert.strictEqual(exact.approach, 'EXACT');
  assert.strictEqual(exact.weightKg, 12, 'duplicate exact cells must use median');

  const a1 = estimator.approach1({ typeDesc: 'Flanged Gate Valve', ns: 4, rating: 300, target: 'RF/RTJ KG' });
  assert.strictEqual(a1.ok, true);
  assert.strictEqual(a1.approach, 'A1_SIZE_BAND');
  assert(a1.weightKg > 0);
  assert(a1.modelId.startsWith('A1|RF/RTJ KG|Flanged Gate Valve|300|B'));

  const a2 = estimator.approach2({ typeDesc: 'Flanged Gate Valve', ns: 4, rating: 300, target: 'RF' });
  assert.strictEqual(a2.ok, true);
  assert.strictEqual(a2.approach, 'A2_MATRIX');
  assert(Math.abs(a2.predictions.ratio - 80) < 1e-9, 'rating-ratio reconstruction should recover 80 kg');
  assert(Math.abs(a2.predictions.cross - 80) < 1e-9, 'cross-ratio reconstruction should recover 80 kg');
  assert(Math.abs(Object.values(a2.weights).reduce((a, b) => a + b, 0) - 1) < 1e-12, 'active weights must renormalize to 1');

  const byDn = estimator.approach2({ typeDesc: 'Flanged Gate Valve', dn: 100, rating: 300, endType: 'RF' });
  assert.strictEqual(byDn.ok, true);
  assert.strictEqual(byDn.size, 4);
  assert.strictEqual(byDn.sizeSource, 'DN_TO_NS');

  const bw = estimator.approach2({ typeDesc: 'Flanged Gate Valve', ns: 4, rating: 300, target: 'BW' });
  assert.strictEqual(bw.ok, true);
  assert.strictEqual(bw.target, 'BW KG');
  assert(Math.abs(bw.predictions.cross - 64) < 1e-9);

  const unknown = estimator.estimate({ typeDesc: 'Not A Valve Family', ns: 4, rating: 300 });
  assert.strictEqual(unknown.ok, false);
  assert.strictEqual(unknown.error.code, 'UNKNOWN_TYPE_DESC');

  assert.strictEqual(api.EMPIRICAL_WEIGHT_MODEL.approach1.models.length, 270, 'all Approach 1 models must be published');
  console.log('Empirical weight API checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
