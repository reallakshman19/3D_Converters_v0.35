import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION as fit } from '../converters/engineering-calculations/adapters/vibration-fit.js';
import { DEFAULT_ENGINEERING_CALCULATION_DEFINITIONS } from '../converters/engineering-calculations/default-registry.js';
import {
  createEngineeringConsoleDraft,
  isEngineeringCalculationExecutable,
} from '../tabs/engineering-calculation-console-model.js';
import { definitionState } from '../tabs/engineering-calculation-console-sections.js';
import { renderEngineeringCalculationConsoleHtml } from '../tabs/engineering-calculation-console-view.js';
import { renderVibrationFamilyLanding } from '../tabs/engineering-calculation-vibration-family.js';
import { verifyEngineeringWorkpack } from '../scripts/verify-engineering-workpack.mjs';

const definitions = DEFAULT_ENGINEERING_CALCULATION_DEFINITIONS;
const vibrationDefinitions = definitions.filter((definition) => definition.family === 'VIB');
const screeningDefinitionCount = vibrationDefinitions.filter((definition) => definitionState(definition) === 'SCREENING'
  && isEngineeringCalculationExecutable(definition)).length;
const families = [{ id: 'VIB', label: 'Vibration & Dynamic Screening', count: vibrationDefinitions.length }];

function fitState() {
  return {
    selectedFamily: 'VIB',
    selectedId: fit.id,
    familyLanding: null,
    draft: createEngineeringConsoleDraft(fit),
    mode: 'single',
    qualificationMode: 'screening',
    activeView: 'results',
    editorErrors: [],
    validation: null,
    resolution: null,
    result: null,
    batchText: '[]',
    batchResult: null,
    batchError: null,
  };
}

test('FIT engineering work pack verifies all deterministic drift gates', async () => {
  const result = await verifyEngineeringWorkpack('VIB-FIT');
  assert.equal(result.status, 'PASS');
  assert.equal(result.checks.length, 12);
  assert.equal(result.checks.every((entry) => entry.status === 'PASS'), true);
});

test('selected FIT console projects registered SCREENING state without BENCHMARK ONLY copy', () => {
  const html = renderEngineeringCalculationConsoleHtml({ definitions, families, definition: fit, state: fitState() });
  assert.match(html, /TABLE WORKSPACE/u);
  assert.match(html, /SCREENING/u);
  assert.doesNotMatch(html, /BENCHMARK ONLY/u);
});

test('vibration family authority banner is derived from registered screening definitions', () => {
  const html = renderVibrationFamilyLanding(definitions);
  assert.equal(screeningDefinitionCount > 0, true);
  assert.match(html, /registered SCREENING qualification/u);
  assert.match(html, new RegExp(`${screeningDefinitionCount} mechanisms`, 'u'));
  assert.doesNotMatch(html, /No mechanism on this page has screening or design authority/u);
  assert.match(html, /no screening result grants design authority or complete vibration integrity/u);
});

test('Product Freeze remains explicitly independent from FIT engineering qualification', async () => {
  const source = await readFile(new URL('../engineering/workpacks/VIB-FIT.json', import.meta.url), 'utf8');
  const workpack = JSON.parse(source);
  assert.equal(workpack.authority.qualificationState, 'SCREENING');
  assert.equal(workpack.authority.screeningAuthority, 'AUTHORIZED_BOUNDED');
  assert.equal(workpack.authority.designAuthority, false);
  assert.equal(workpack.authority.codeCompliance, false);
  assert.equal(workpack.productFreeze.qualificationIndependent, true);
  assert.equal(workpack.productFreeze.state, 'BLOCKED');
  assert.equal(workpack.productFreeze.frozen, false);
});
