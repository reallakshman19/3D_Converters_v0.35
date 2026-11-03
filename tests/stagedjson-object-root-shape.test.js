import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_VISIBLE_STAGEDJSON_CONFIG } from '../tabs/xml-cii-2019-standalone/stagedjson-enrichment/stagedjson-enrichment-contract.js';
import { enrichStagedJson } from '../tabs/xml-cii-2019-standalone/stagedjson-enrichment/stagedjson-enrichment-engine.js';

test('single object-root stagedJson enriches without becoming an array', () => {
  const stagedJson = fixtureStage('LINE-100')[0];
  const beforeInput = JSON.stringify(stagedJson);
  const result = enrichStagedJson({
    stagedJson,
    masters: fixtureMasters(),
    config: DEFAULT_VISIBLE_STAGEDJSON_CONFIG,
    sourceFileName: 'object-root.json',
    evaluatedAt: '2026-07-19T00:00:00.000Z',
  });

  assert.equal(Array.isArray(result.enrichedStagedJson), false);
  assert.equal(result.enrichedStagedJson.enrichedAttributes.lineNo, 'LINE-100');
  assert.equal(result.enrichedStagedJson.children[0].enrichedAttributes.lineNo, 'LINE-100');
  assert.equal(result.enrichedStagedJson.children[1].enrichedAttributes.componentWeightKg, 125);
  assert.deepEqual(result.enrichedStagedJson.children[0].attributes, stagedJson.children[0].attributes);
  assert.equal(result.audit.summary.geometryChanged, false);
  assert.equal(result.audit.summary.coordinateChanged, false);
  assert.equal(JSON.stringify(stagedJson), beforeInput, 'object-root stagedJson must not be mutated');
});

test('JSON-string object root retains the same object-root contract', () => {
  const stagedJson = fixtureStage('LINE-100')[0];
  const result = enrichStagedJson({
    stagedJson: JSON.stringify(stagedJson),
    masters: fixtureMasters(),
    config: DEFAULT_VISIBLE_STAGEDJSON_CONFIG,
    sourceFileName: 'object-root-string.json',
    evaluatedAt: '2026-07-19T00:00:00.000Z',
  });

  assert.equal(Array.isArray(result.enrichedStagedJson), false);
  assert.equal(result.enrichedStagedJson.children[0].enrichedAttributes.wallThicknessMm, 7.11);
});

function fixtureStage(lineName) {
  return [{
    name: lineName,
    type: 'BRANCH',
    attributes: { NAME: lineName },
    children: [
      { id: 'P1', name: 'PIPE-1', type: 'PIPE', attributes: { APOS: { x: 0, y: 0, z: 0 }, LPOS: { x: 1000, y: 0, z: 0 }, ABORE: '150mm' } },
      { id: 'V1', name: 'VALVE-1', type: 'VALVE', attributes: { APOS: { x: 1000, y: 0, z: 0 }, LPOS: { x: 1300, y: 0, z: 0 }, ABORE: '150mm', RATING: '150' } },
    ],
  }];
}

function fixtureMasters() {
  return {
    lineList: [{ 'Line Number': 'LINE-100', 'Piping Class': 'PC-150', P1: '1.2 MPa', T1: '80 C', T2: '60 C', Density: 850, 'Hydro Density': 1000, 'Insulation Thickness': 50, 'Insulation Density': 120, Material: 'A106 GR B' }],
    pipingClass: [
      { 'Piping Class': 'PC-150', boreMm: 150, componentType: 'PIPE', rating: '150', schedule: '40', 'Wall Thickness': 7.11, 'Corrosion Allowance': 1.5, pipeOdMm: 168.3, material: 'A106 GR B', materialDensityKgM3: 7850, pipeWeightKgPerM: 28.26 },
      { 'Piping Class': 'PC-150', boreMm: 150, componentType: 'VALVE', rating: '150', schedule: '40', 'Wall Thickness': 7.11, 'Corrosion Allowance': 1.5, pipeOdMm: 168.3, material: 'A106 GR B', materialDensityKgM3: 7850 },
    ],
    materialMap: [{ material: 'A106 GR B', materialCode: 'A106B', materialDensityKgM3: 7850 }],
    weight: [{ id: 'W-V150', componentType: 'VALVE', bore: 150, rating: '150', length: 300, weightKg: 125 }],
  };
}
