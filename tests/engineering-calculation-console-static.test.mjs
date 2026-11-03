import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { renderEngineeringCalculationConsoleHtml } from '../tabs/engineering-calculation-console-view.js';
import { createEngineeringConsoleDraft } from '../tabs/engineering-calculation-console-model.js';

const tab = fs.readFileSync(new URL('../tabs/engineering-calculations-tab.js', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../tabs/engineering-calculation-console-view.js', import.meta.url), 'utf8');
const sections = fs.readFileSync(new URL('../tabs/engineering-calculation-console-sections.js', import.meta.url), 'utf8');
const vibrationFamily = fs.readFileSync(new URL('../tabs/engineering-calculation-vibration-family.js', import.meta.url), 'utf8');
const extension = fs.readFileSync(new URL('../core/engineering-tabs-extension.js', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../tabs/engineering-workspace-tab.js', import.meta.url), 'utf8');
const hpPipingClass = fs.readFileSync(new URL('../tabs/hp-piping-class-tab.js', import.meta.url), 'utf8');
const registry = fs.readFileSync(new URL('../converters/engineering-calculations/registry.js', import.meta.url), 'utf8');
const pending = fs.readFileSync(new URL('../converters/engineering-calculations/pending-definitions.js', import.meta.url), 'utf8');

test('Console production wiring uses the central Engineering Calculation API only', () => {
  assert.match(tab, /converters\/engineering-calculations\/index\.js/);
  for (const api of [
    'calculateEngineering',
    'calculateEngineeringBatch',
    'validateEngineeringCalculationInput',
    'resolveEngineeringCalculationInputs',
  ]) assert.match(tab, new RegExp(api));

  for (const forbidden of [
    'b313-thickness',
    'b313-material-factors',
    'empirical-weight/index',
    'calculateB313',
    'estimateEmpiricalWeight',
  ]) assert.doesNotMatch(tab + view + sections + vibrationFamily, new RegExp(forbidden));
});

test('Engineering navigation preserves current-main four-subtab workspace with no duplicate Vibrations subtab', () => {
  assert.match(extension, /id: 'engineering-calculations'/);
  assert.match(extension, /renderEngineeringWorkspaceTab/);
  assert.doesNotMatch(extension, /label: 'Vibration Integrity'/);
  assert.doesNotMatch(extension, /id: 'b313-material-factors'/);
  assert.doesNotMatch(extension, /id: 'empirical-weight-tuning'/);
  assert.doesNotMatch(extension, /id: 'hp-piping-class'/);
  for (const id of ['calculations', 'b313-material-factors', 'empirical-weight-tuning', 'hp-piping-class']) {
    assert.match(workspace, new RegExp(`id: '${id}'`));
  }
  assert.match(workspace, /B31\.3 Material Factors/);
  assert.match(workspace, /Empirical Weight Tuning/);
  assert.match(workspace, /HP Piping Class/);
  assert.doesNotMatch(workspace, /id: 'vibrations'/);
  assert.match(hpPipingClass, /engineering\/hp-class-standardization\/engineering-library\.html/);
});

test('legacy Engineering subtab deep links still route through the main Engineering Calculations tab', () => {
  assert.match(extension, /ENGINEERING_SUBTAB_IDS/);
  assert.match(extension, /subtabId: requestedId/);
  assert.match(extension, /tabId = 'engineering-calculations'/);
});

test('stable two-segment pending calculation IDs remain accepted by registry grammar', () => {
  assert.match(pending, /PIPE\.SHELL_INDENTATION/);
  assert.match(registry, /CALCULATION_ID_PATTERN = .*\{1,\}/);
  assert.doesNotMatch(registry, /CALCULATION_ID_PATTERN = .*\{2,\}/);
});

test('existing VIB family is the vibration landing entry and contains no engineering kernel or canvas', () => {
  assert.match(vibrationFamily, /Vibration &amp; Dynamic Screening/);
  assert.match(vibrationFamily, /VIB\.FIV\.FLOW_TURBULENCE/);
  assert.match(vibrationFamily, /Open FIT workspace/);
  assert.match(vibrationFamily, /TABLE DATA ONLY/);
  assert.doesNotMatch(vibrationFamily, /calculateFit\s*\(/);
  assert.doesNotMatch(vibrationFamily, /calculateEngineering(?:Batch)?\s*\(/);
  assert.doesNotMatch(vibrationFamily, /<canvas|createElement\(['"]canvas/iu);
  assert.doesNotMatch(vibrationFamily, /riskScore|Risk Score|Facility Score|Vibration Score/u);
});

test('VIB family click opens family landing before selecting a specific mechanism', () => {
  assert.match(tab, /VIBRATION_FAMILY_ID = 'VIB'/);
  assert.match(tab, /openFamilyLanding\(familyId\)/);
  assert.match(view, /state\.familyLanding === 'VIB'/);
  assert.match(view, /renderVibrationFamilyLanding\(definitions\)/);
});

test('blocked definition is visibly non-executable and issue-qualified', () => {
  const blocked = {
    id: 'VIB.AIV.ACOUSTIC', family: 'VIB', name: 'AIV', shortName: 'AIV',
    methodRevision: 'pending', purpose: 'Pending', qualificationIssue: 429,
    authority: { qualificationState: 'BLOCKED' }, applicability: { limitations: [] }, inputs: [],
  };
  const state = {
    selectedFamily: 'VIB', selectedId: blocked.id, familyLanding: null,
    draft: createEngineeringConsoleDraft(blocked),
    mode: 'single', qualificationMode: 'strict', activeView: 'basis', editorErrors: [],
    validation: null, resolution: null, result: null, batchText: '[]', batchResult: null, batchError: null,
  };
  const html = renderEngineeringCalculationConsoleHtml({
    definitions: [blocked], families: [{ id: 'VIB', label: 'Vibration & Dynamic Screening', count: 1 }],
    definition: blocked, state,
  });
  assert.match(html, /Execution blocked/);
  assert.match(html, /#429/);
  assert.match(html, /data-action="calculate" disabled/);
});

test('required enum shows an explicit unselected state', () => {
  const definition = {
    id: 'ESTIMATION.WEIGHT.EMPIRICAL', family: 'ESTIMATION', name: 'Weight',
    methodRevision: '1', purpose: 'x', authority: { qualificationState: 'BENCHMARK_ONLY' },
    applicability: { limitations: [] },
    inputs: [{ key: 'target', label: 'Target', type: 'enum', required: true, values: ['RF/RTJ KG', 'BW KG'] }],
  };
  const state = {
    selectedFamily: 'ESTIMATION', selectedId: definition.id, familyLanding: null,
    draft: createEngineeringConsoleDraft(definition),
    mode: 'single', qualificationMode: 'strict', activeView: 'results', editorErrors: [],
    validation: null, resolution: null, result: null, batchText: '[]', batchResult: null, batchError: null,
  };
  const html = renderEngineeringCalculationConsoleHtml({
    definitions: [definition], families: [{ id: 'ESTIMATION', label: 'Estimation', count: 1 }],
    definition, state,
  });
  assert.match(html, /Select…/);
});
