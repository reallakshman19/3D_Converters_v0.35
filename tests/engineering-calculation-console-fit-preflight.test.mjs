import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION as fit } from '../converters/engineering-calculations/adapters/vibration-fit.js';
import { PENDING_ENGINEERING_CALCULATION_DEFINITIONS } from '../converters/engineering-calculations/pending-definitions.js';
import {
  canExecuteEngineeringCalculation,
  canResolveEngineeringCalculation,
  createEngineeringConsoleDraft,
  isEngineeringCalculationExecutable,
} from '../tabs/engineering-calculation-console-model.js';
import { renderEngineeringCalculationConsoleHtml } from '../tabs/engineering-calculation-console-view.js';

const controllerSource = fs.readFileSync(new URL('../tabs/engineering-calculations-tab.js', import.meta.url), 'utf8');
const blockedVibrationDefinitions = PENDING_ENGINEERING_CALCULATION_DEFINITIONS.filter((row) => row.family === 'VIB');
const definitions = [fit, ...blockedVibrationDefinitions].sort((a, b) => a.id.localeCompare(b.id));
const families = [{ id: 'VIB', label: 'Vibration & Dynamic Screening', count: definitions.length }];
const aiv = definitions.find((row) => row.id === 'VIB.AIV.ACOUSTIC');

function baseState(definition = fit) {
  return {
    selectedFamily: 'VIB', selectedId: definition.id, familyLanding: null,
    draft: createEngineeringConsoleDraft(definition), mode: 'single', qualificationMode: 'screening',
    activeView: isEngineeringCalculationExecutable(definition) ? 'results' : 'basis',
    editorErrors: [], validation: null, resolution: null, result: null,
    batchText: '[]', batchResult: null, batchError: null,
  };
}

function buttonTag(html, action) {
  const match = html.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`, 'u'));
  assert(match, `missing ${action}`);
  return match[0];
}

test('FIT is qualified for bounded screening and remains a table-workspace product surface', () => {
  assert.equal(isEngineeringCalculationExecutable(fit), true);
  assert.equal(canResolveEngineeringCalculation(fit), true);
  assert.equal(canExecuteEngineeringCalculation(fit, 'strict'), false);
  assert.equal(canExecuteEngineeringCalculation(fit, 'benchmark'), false);
  assert.equal(canExecuteEngineeringCalculation(fit, 'screening'), true);
  assert.equal(fit.ui.productSurface, 'VIBRATION_INTEGRITY_TABLE_WORKSPACE');
  assert.equal(fit.ui.requiredQualificationMode, 'screening');
  assert.equal(fit.authority.qualificationState, 'SCREENING');
  assert.equal(fit.authority.codeCompliance, false);
});

test('existing VIB family landing renders all six registered mechanisms with registered authority states', () => {
  assert.equal(definitions.length, 6);
  assert.equal(blockedVibrationDefinitions.length, 5);
  const state = { ...baseState(), selectedId: null, familyLanding: 'VIB' };
  const html = renderEngineeringCalculationConsoleHtml({ definitions, families, definition: fit, state });
  assert.match(html, /Vibration &amp; Dynamic Screening/u);
  assert.match(html, /6 mechanisms/u);
  assert.match(html, /Flow-Induced Vibration Screening/u);
  assert.match(html, /SCREENING/u);
  assert.match(html, /Acoustic-Induced Vibration Screening/u);
  assert.match(html, /Cavitation \/ Flashing Screening/u);
  assert.match(html, /Small-Bore Connection Vibration Screening/u);
  assert.match(html, /Slug Load \/ Time-History Assessment/u);
  assert.match(html, /Surge \/ Momentum Load Screening/u);
  assert.equal((html.match(/>BLOCKED</gu) ?? []).length, 5);
  assert.match(html, /Open FIT workspace/u);
  assert.match(html, /data-calc-id="VIB\.FIV\.FLOW_TURBULENCE"/u);
  assert.match(html, /TABLE DATA ONLY/u);
});

test('selecting FIT renders the table workspace host instead of an inline calculator form', () => {
  const html = renderEngineeringCalculationConsoleHtml({
    definitions, families, definition: fit, state: baseState(fit),
  });
  assert.match(html, /TABLE WORKSPACE/u);
  assert.match(html, /SCREENING/u);
  assert.match(html, /data-fit-workspace-host/u);
  assert.doesNotMatch(html, /data-action="calculate"/u);
  assert.doesNotMatch(html, /data-action="add-current-batch"/u);
  assert.match(controllerSource, /await import\('\.\/vibration-integrity-tab\.js\?v=vibration-integrity-fit-placeholder-1'\)/u);
  assert.match(controllerSource, /definition\.id !== FIT_CALCULATION_ID/u);
});

test('other blocked vibration calculators remain non-resolvable and non-executable', () => {
  assert(aiv);
  assert.equal(isEngineeringCalculationExecutable(aiv), false);
  assert.equal(canResolveEngineeringCalculation(aiv), false);
  const state = baseState(aiv);
  const html = renderEngineeringCalculationConsoleHtml({ definitions, families, definition: aiv, state });
  assert.match(html, /Execution blocked/u);
  assert.equal(buttonTag(html, 'validate').includes('disabled'), true);
  assert.equal(buttonTag(html, 'resolve').includes('disabled'), true);
  assert.equal(buttonTag(html, 'calculate').includes('disabled'), true);
});
