import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  createPipeWallMaster,
  lookupPipeWall,
  normalizePipeSchedule,
  selectRequiredPipeWall,
  validatePipeWallMaster,
  DEFAULT_PIPE_WALL_MASTER_ROWS,
} from '../converters/pipe-wall-master/index.js';

const benchmark = JSON.parse(fs.readFileSync(
  new URL('../Benchmarks/PipeWallMaster/pipe-wall-selection-benchmarks.json', import.meta.url),
  'utf8',
));

const a106SelectionBenchmark = JSON.parse(fs.readFileSync(
  new URL('../Benchmarks/PipeWallMaster/a106-grb-b313-selection-benchmark.json', import.meta.url),
  'utf8',
));

for (const entry of benchmark.cases) {
  test(`pipe-wall benchmark ${entry.id}: ${entry.description}`, () => {
    const result = selectRequiredPipeWall(entry.query);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.selected.nominalWallMm, entry.expected.nominalWallMm);
    assert.equal(result.selected.schedule, entry.expected.schedule);
    assert.deepEqual(result.selected.equivalentSchedules, entry.expected.equivalentSchedules);
    assert(result.selected.nominalWallMm + 1e-9 >= entry.query.requiredNominalThicknessMm);
  });
}

for (const row of a106SelectionBenchmark.rows) {
  test(`A106 Gr B DN${row.dn} selects project-master wall`, () => {
    const result = selectRequiredPipeWall({
      dimensionStandard: a106SelectionBenchmark.dimensionStandard,
      dn: row.dn,
      requiredNominalThicknessMm: row.requiredNominalThicknessMm,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.selected.nominalWallMm, row.expected.selectedWallMm);
    assert.equal(result.selected.schedule, row.expected.schedule);
    assert.deepEqual(result.selected.equivalentSchedules, row.expected.equivalentSchedules);
    close(result.selected.marginMm, row.expected.marginMm, 1e-12, `DN${row.dn} margin`);
  });
}

function close(actual, expected, tolerance, label) {
  assert(Number.isFinite(actual), `${label}: actual must be finite`);
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

for (const entry of benchmark.negativeCases) {
  test(`pipe-wall negative benchmark ${entry.id}`, () => {
    const result = selectRequiredPipeWall(entry.query);
    assert.equal(result.ok, false);
    assert.equal(result.code, entry.expectedCode);
  });
}

test('default master expands to 345 schedule-wall records', () => {
  assert.equal(DEFAULT_PIPE_WALL_MASTER_ROWS.length, 345);
});

test('master validation detects no structural errors and records the NPS 2 OD source anomaly', () => {
  const result = validatePipeWallMaster();
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.length, 0);
  assert.equal(result.counts.sourceSizeRows, 42);
  assert.equal(result.counts.wallRows, 345);
  assert.equal(result.counts.sizesWithWallData, 33);
  assert.equal(result.counts.sizesWithoutWallData, 9);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'SOURCE_OD_UNIT_PARITY_MISMATCH');
  assert.equal(result.warnings[0].nps, '2');
  assert.equal(result.warnings[0].outsideDiameterInSource, 1.9);
});

test('lookup normalizes schedule aliases and preserves standard namespace', () => {
  const hit = lookupPipeWall({ dimensionStandard: 'B36.10M', nps: 10, schedule: 'SCH 80' });
  assert.equal(hit.ok, true);
  assert.equal(hit.row.nominalWallMm, 15.0876);
  assert.equal(hit.row.schedule, '80');

  const sHit = lookupPipeWall({ dimensionStandard: 'B36.19', nps: 10, schedule: '80S' });
  assert.equal(sHit.ok, true);
  assert.equal(sHit.row.nominalWallMm, 12.7);
  assert.notEqual(hit.row.dimensionStandard, sHit.row.dimensionStandard);
});

test('custom status gate can exclude project-master rows', () => {
  const strict = createPipeWallMaster({ acceptedDataStatuses: ['VERIFIED', 'PROJECT_APPROVED'] });
  const result = strict.lookup({ dimensionStandard: 'ASME B36.10M', nps: 10, schedule: 80 });
  assert.equal(result.ok, false);
  assert.equal(strict.rows.length, 0);
});

test('schedule normalization handles common forms', () => {
  assert.equal(normalizePipeSchedule('Sch. 40'), '40');
  assert.equal(normalizePipeSchedule('schedule 80s'), '80S');
  assert.equal(normalizePipeSchedule('standard wt'), 'STD');
  assert.equal(normalizePipeSchedule('extra strong'), 'XS');
  assert.equal(normalizePipeSchedule('double extra strong'), 'XXS');
});

test('selection can consume a B31.3-shaped calculation without importing the calculator', () => {
  const master = createPipeWallMaster();
  const result = master.selectForCalculation({
    calculation: { ok: true, requiredNominalThicknessMm: 12.553618958106954 },
    dimensionStandard: 'ASME B36.10M',
    dn: 250,
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.nominalWallMm, 12.7);
  assert.deepEqual(result.selected.equivalentSchedules, ['60', 'XS']);
});
