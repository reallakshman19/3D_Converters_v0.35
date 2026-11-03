/**
 * Integration tests for the parallel stagedJson enrichment adapter using
 * explicit fixture masters. The fixture is deterministic test data, not a
 * claimed real plant result.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DEFAULT_VISIBLE_STAGEDJSON_CONFIG } from '../tabs/xml-cii-2019-standalone/stagedjson-enrichment/stagedjson-enrichment-contract.js';
import { enrichStagedJson } from '../tabs/xml-cii-2019-standalone/stagedjson-enrichment/stagedjson-enrichment-engine.js';

test('adapter enriches elements, preserves geometry, and exports audit artifacts', () => {
  const stagedJson = fixtureStage('LINE-100');
  const beforeGeometry = JSON.stringify(stagedJson);
  const result = enrichStagedJson({ stagedJson, masters: fixtureMasters(), config: DEFAULT_VISIBLE_STAGEDJSON_CONFIG, sourceFileName: 'fixture.json', evaluatedAt: '2026-07-11T00:00:00.000Z' });
  const pipe = result.enrichedStagedJson[0].children[0];
  const valve = result.enrichedStagedJson[0].children[1];

  assert.equal(pipe.enrichedAttributes.lineNo, 'LINE-100');
  assert.equal(pipe.enrichedAttributes.wallThicknessMm, 7.11);
  assert.equal(pipe.enrichedAttributes.fluidDensityHydKgM3, 1000);
  assert.equal(valve.enrichedAttributes.componentWeightKg, 125);
  assert.deepEqual(result.enrichedStagedJson[0].children[0].attributes, stagedJson[0].children[0].attributes);
  assert.equal(result.audit.summary.geometryChanged, false);
  assert.equal(result.audit.summary.coordinateChanged, false);
  assert.match(result.unresolvedCsv, /^nodeId,hierarchyPath/);
  assert.equal(JSON.stringify(stagedJson), beforeGeometry, 'input stagedJson must not be mutated');
});

test('unknown line remains null with explicit missing diagnostics', () => {
  const result = enrichStagedJson({ stagedJson: fixtureStage('UNKNOWN-LINE'), masters: fixtureMasters(), config: DEFAULT_VISIBLE_STAGEDJSON_CONFIG, sourceFileName: 'unknown.json', evaluatedAt: '2026-07-11T00:00:00.000Z' });
  const pipe = result.enrichedStagedJson[0].children[0].enrichedAttributes;
  assert.equal(pipe.lineNo, null);
  assert.notEqual(pipe.status, 'resolved');
  assert.ok(pipe.missing.includes('lineNo'));
  assert.ok(pipe.diagnostics.every((row) => row.fallbackUsed === false));
  assert.equal(pipe.fluidDensityOpeKgM3, null);
});

test('effective piping-class override propagates through stagedJson material and dimensions', () => {
  const masters = fixtureMasters();
  masters.pipingClass.push({
    'Piping Class': '11472',
    boreMm: 150,
    componentType: 'PIPE',
    rating: '150',
    schedule: '40',
    'Wall Thickness': 6.5,
    'Corrosion Allowance': 2,
    pipeOdMm: 168.3,
    material: 'ASTM A333-6',
    materialDensityKgM3: 7850,
  });
  const config = {
    ...DEFAULT_VISIBLE_STAGEDJSON_CONFIG,
    overrides: { pipingClass: { 'PC-150': '11472' } },
    pipingClassMaterialCodeMap: {
      enabled: true,
      manualOverrideWins: true,
      exactPipingClassFirst: true,
      normalizeClassSuffix: true,
      confidenceThreshold: 80,
      rows: [{ pipingClass: '11472', materialCode: '177', materialName: 'ASTM A333-6', confidence: 95 }],
    },
  };
  const result = enrichStagedJson({ stagedJson: fixtureStage('LINE-100'), masters, config, sourceFileName: 'class-override.json', evaluatedAt: '2026-07-11T00:00:00.000Z' });
  const pipe = result.enrichedStagedJson[0].children[0].enrichedAttributes;
  assert.equal(pipe.pipingClass, '11472');
  assert.equal(pipe.materialCode, '177');
  assert.equal(pipe.sources.material, 'piping-class-config-map');
  assert.equal(pipe.wallThicknessMm, 6.5);
  assert.equal(pipe.corrosionAllowanceMm, 2);
});

test('Standalone exposes a visible stagedJson Properties launcher', () => {
  // xml-cii-2019-standalone-tab.js no longer embeds an in-context
  // "stagedJson Properties" panel launcher (openStagedJsonPropertiesPanel /
  // panel.open = true) - that was superseded by promoting the feature to
  // its own top-level tab (tabs/stagedjson-properties-tab.js), registered
  // in core/app-standalone-runtime.js and backed by the same
  // stagedjson-enrichment-ui.js the "resolver map" test below already
  // exercises. Check the current launch mechanism instead of the old one.
  const runtimeSource = readFileSync(new URL('../core/app-standalone-runtime.js', import.meta.url), 'utf8');
  assert.match(runtimeSource, /id: 'stagedjson-properties'/);
  assert.match(runtimeSource, /label: 'stagedJson Properties'/);
  assert.match(runtimeSource, /renderStagedJsonPropertiesTab/);

  const tabSource = readFileSync(new URL('../tabs/stagedjson-properties-tab.js', import.meta.url), 'utf8');
  assert.match(tabSource, /export function renderStagedJsonPropertiesTab/);
  assert.match(tabSource, /renderStagedJsonEnrichmentPanel/);
});

test('stagedJson resolver map preview is invokable and gated on readiness', () => {
  // This panel was restructured from a single linear flow (source ->
  // config -> resolve/preview -> results, stacked) into a two-column
  // dashboard (inputs+config in one column, execution actions in the
  // other, results below both). "Resolve map controls appear above the
  // config editor" no longer maps cleanly onto a side-by-side layout, so
  // this checks the guarantees that still apply: the resolver-map preview
  // button exists, is gated on the same readiness check as running the
  // real enrichment (not accidentally always-enabled or always-disabled),
  // wired to previewResolverMap(), and the actions/execution section is
  // still built (and appended to the DOM) before the results section.
  const uiSource = readFileSync(new URL('../tabs/xml-cii-2019-standalone/stagedjson-enrichment/stagedjson-enrichment-ui.js', import.meta.url), 'utf8');
  assert.match(uiSource, /async function previewResolverMap\(state, render\)/);
  assert.match(uiSource, /const canRun = readiness\.canResolve;/);
  assert.match(uiSource, /action\('Preview Resolution Map', !canRun, \(\) => previewResolverMap\(state, render\)\)/);
  assert.match(uiSource, /function actionsColumn\(state, render\)/);
  assert.match(uiSource, /function resultView\(state, render\)/);
  assert.ok(
    uiSource.indexOf('buildDashboard(state, render), resultView(state, render)') >= 0,
    'buildDashboard (which builds the actions/execution column) must be constructed and appended before resultView',
  );
});

function fixtureStage(lineName) {
  return [{
    name: lineName,
    type: 'BRANCH',
    attributes: { NAME: lineName },
    children: [
      { id: 'P1', name: 'PIPE-1', type: 'PIPE', attributes: { APOS: { x: 0, y: 0, z: 0 }, LPOS: { x: 1000, y: 0, z: 0 }, ABORE: '150mm' } },
      { id: 'V1', name: 'VALVE-1', type: 'VALVE', attributes: { APOS: { x: 1000, y: 0, z: 0 }, LPOS: { x: 1300, y: 0, z: 0 }, ABORE: '150mm', RATING: '150' } },
      { id: 'S1', name: 'SUPPORT-1', type: 'SUPPORT', attributes: { POS: { x: 500, y: 0, z: 0 }, SUPPORT_TYPE: 'REST', VERTICAL_CAPABILITY: 'YES' } },
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
