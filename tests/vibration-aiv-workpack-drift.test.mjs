import assert from 'node:assert/strict';
import test from 'node:test';

import { VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION as aiv } from '../converters/engineering-calculations/adapters/vibration-aiv.js';
import { DEFAULT_ENGINEERING_CALCULATION_DEFINITIONS } from '../converters/engineering-calculations/default-registry.js';
import { verifyEngineeringWorkpack } from '../scripts/verify-engineering-workpack.mjs';
import { createEngineeringConsoleDraft } from '../tabs/engineering-calculation-console-model.js';
import { renderEngineeringCalculationConsoleHtml } from '../tabs/engineering-calculation-console-view.js';
import { renderVibrationFamilyLanding } from '../tabs/engineering-calculation-vibration-family.js';

const definitions = DEFAULT_ENGINEERING_CALCULATION_DEFINITIONS;
const vibrationDefinitions = definitions.filter((definition) => definition.family === 'VIB');
const families = [{ id: 'VIB', label: 'Vibration & Dynamic Screening', count: vibrationDefinitions.length }];

function aivState() {
  return {
    selectedFamily: 'VIB',
    selectedId: aiv.id,
    familyLanding: null,
    draft: createEngineeringConsoleDraft(aiv),
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

test('shared work-pack entrypoint verifies all deterministic AIV drift gates', async () => {
  const result = await verifyEngineeringWorkpack('VIB-AIV');
  assert.equal(result.workpackId, 'VIB-AIV');
  assert.equal(result.status, 'PASS');
  assert.equal(result.checks.length, 20);
  assert.equal(result.checks.every((entry) => entry.status === 'PASS'), true);
});

test('selected AIV console projects registered SCREENING state instead of hard-coded BLOCKED', () => {
  const html = renderEngineeringCalculationConsoleHtml({
    definitions,
    families,
    definition: aiv,
    state: aivState(),
  });
  const actionBar = html.match(/<div class="engineering-console-actions">[^]*?<\/div>/u)?.[0] ?? '';
  assert.match(actionBar, /QUALIFICATION WORKSPACE/u);
  assert.match(actionBar, /SCREENING/u);
  assert.doesNotMatch(actionBar, /BLOCKED/u);
});

test('VIB family projection acknowledges governed AIV canvas while preserving engineering authority boundary', () => {
  const html = renderVibrationFamilyLanding(definitions);
  assert.match(html, /TABLES \/ explicit engineering contracts = engineering facts/u);
  assert.match(html, /SVG \/ pixel geometry = presentation only/u);
  assert.doesNotMatch(html, /No 3D viewer or canvas is embedded here/u);
});

test('AIV machine truth remains bounded screening rather than design or universal vibration authority', () => {
  assert.equal(aiv.authority.calculationState, 'IMPLEMENTED');
  assert.equal(aiv.authority.qualificationState, 'SCREENING');
  assert.equal(aiv.authority.codeCompliance, false);
  assert.equal(aiv.applicability.limitations.some((item) => /assessment-level screening authority only/iu.test(item)), true);
  assert.equal(aiv.applicability.limitations.some((item) => /no design authority/iu.test(item)), true);
});
