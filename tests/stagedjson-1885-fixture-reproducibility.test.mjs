import assert from 'node:assert/strict';
import test from 'node:test';

import { check1885Fixtures } from '../tools/generate-1885-stagedjson-fixtures.mjs';

const REFS = Object.freeze({
  elbow: '=1006649732/51428',
  tee: '=1006649732/51494',
  reducer: '=1006649732/51499',
});

const SOURCE_PATH = 'Benchmarks/1885Sjson/Sjson.json';

function snapshot(generated) {
  return JSON.parse(generated.contractSnapshot);
}

test('1885 committed enrichment fixtures reproduce exactly', () => {
  const generated = check1885Fixtures();
  assert.equal(generated.enrichment.audit.summary.geometryChanged, false);
  assert.equal(generated.enrichment.audit.summary.coordinateChanged, false);
  assert.equal(generated.enrichment.audit.sourceFileName, SOURCE_PATH);

  const manifest = JSON.parse(generated.manifest);
  assert.equal(manifest.source, SOURCE_PATH);
  assert.equal(manifest.summary.sourceNodes, 279);
  assert.equal(manifest.summary.enrichedNodes, 279);
  assert.equal(manifest.summary.stage2Records, 163);
  assert.equal(manifest.summary.stage2Branches, 5);
  assert.equal(manifest.summary.audit.totalConflicts, 0);
  assert.equal(manifest.summary.audit.totalMissing, 83);
  assert.equal(manifest.scope.unresolvedOutsideTargetScope, true);
});

test('1885 module-1 enrichment resolves the three accepted target contracts', () => {
  const targets = snapshot(check1885Fixtures()).targets;

  assert.deepEqual(targets[REFS.elbow].enrichment, {
    schema: 'stagedjson-cii2019-enriched-attributes/v1',
    lineNo: 'S8810103',
    pipingClass: '91261',
    pressureRating: '900',
    nominalBoreMm: 200,
    pipeOdMm: 219.1,
    schedule: '80',
    wallThicknessMm: 12.7,
    corrosionAllowanceMm: 1,
    insulationThicknessMm: 100,
    status: 'resolved',
    needsReview: false,
    missing: [],
  });

  for (const ref of [REFS.tee, REFS.reducer]) {
    assert.deepEqual(targets[ref].enrichment, {
      schema: 'stagedjson-cii2019-enriched-attributes/v1',
      lineNo: 'S8810101',
      pipingClass: '91261',
      pressureRating: '900',
      nominalBoreMm: 250,
      pipeOdMm: 273,
      schedule: '80',
      wallThicknessMm: 15.09,
      corrosionAllowanceMm: 1,
      insulationThicknessMm: 120,
      status: 'resolved',
      needsReview: false,
      missing: [],
    });
  }
});

test('1885 condensed XML consumes module-1 values and preserves fitting topology', () => {
  const contract = snapshot(check1885Fixtures());
  assert.deepEqual(contract.branchNames, [
    '/ASIM-1885-6&quot;-S8811951-91261M7-HC-01',
    '/ASIM-1885-6&quot;-S8810112-91261M7-HC-01',
    '/ASIM-1885-6&quot;-S8810111-91261M7-HC-01',
    '/ASIM-1885-8&quot;-S8810103-91261M7-HC-01',
    '/ASIM-1885-10&quot;-S8810101-91261M7-HC-01',
  ]);

  assert.deepEqual(contract.targets[REFS.elbow].xml, {
    nodeNumber: '1570',
    nodeName: '',
    endpoint: '0',
    componentType: 'ELBO',
    connectionType: '',
    outsideDiameter: '219.1',
    wallThickness: '12.7',
    corrosionAllowance: '1',
    insulationThickness: '100',
    bendRadius: '305',
    bendType: '0',
    alphaAngle: null,
  });

  assert.deepEqual(contract.targets[REFS.tee].xml, {
    nodeNumber: '2280',
    nodeName: '',
    endpoint: '1',
    componentType: 'BRAN',
    connectionType: 'TEE',
    outsideDiameter: '273',
    wallThickness: '15.09',
    corrosionAllowance: '1',
    insulationThickness: '120',
    bendRadius: '0',
    bendType: null,
    alphaAngle: null,
  });

  const reducer = contract.targets[REFS.reducer].xml;
  assert.deepEqual({ ...reducer, alphaAngle: '<derived>' }, {
    nodeNumber: '2370',
    nodeName: '',
    endpoint: '2',
    componentType: 'REDU',
    connectionType: '',
    outsideDiameter: '273',
    wallThickness: '15.09',
    corrosionAllowance: '1',
    insulationThickness: '120',
    bendRadius: '0',
    bendType: null,
    alphaAngle: '<derived>',
  });
  assert.equal(reducer.alphaAngle, '16.389');

  const targetRoot = '/ASIM-1885-10&quot;-S8810101-91261M7-HC-01';
  assert.equal(contract.branchNames.filter((name) => name === targetRoot).length, 1);
  assert.ok(contract.branchNames.every((name) => !/\/B0*\d+$/i.test(name)));
});
