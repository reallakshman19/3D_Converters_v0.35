import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertEngineeringCapabilityTransition,
  canTransitionEngineeringCapability,
  createEngineeringCapabilityLifecycle,
} from '../converters/engineering-calculations/lifecycle.js';
import { validateEngineeringCalculationDefinition } from '../converters/engineering-calculations/registry.js';
import { VIBRATION_SBC_RESERVED_ENGINEERING_CALCULATION_DEFINITION } from '../converters/engineering-calculations/adapters/vibration-sbc-reserved.js';
import { PENDING_ENGINEERING_CALCULATION_DEFINITIONS } from '../converters/engineering-calculations/pending-definitions.js';
import { calculateReservedSbc } from '../converters/vibration/sbc/reserved-kernel.js';
import {
  SBC_MAIN_LINE_INPUT_REQUIREMENT,
  SBC_TYPE_IDS,
  SBC_TYPE_IMPLEMENTATION_SLOTS,
  SBC_VERTICAL_LIFECYCLE,
} from '../converters/vibration/sbc/vertical-manifest.js';
import {
  definitionState,
  renderBasis,
  renderInputForm,
} from '../tabs/engineering-calculation-console-sections.js';
import { renderVibrationFamilyLanding } from '../tabs/engineering-calculation-vibration-family.js';

const B1 = Object.freeze({
  TYPE_1: 'EI_APPENDIX_D5',
  TYPE_2: 'EI_APPENDIX_D6',
  TYPE_3: 'EI_APPENDIX_D7',
  TYPE_4: 'EI_APPENDIX_D8',
});

test('engineering capability lifecycle permits only the reserved progression', () => {
  assert.equal(canTransitionEngineeringCapability('RESERVED', 'QUALIFIED'), true);
  assert.equal(canTransitionEngineeringCapability('QUALIFIED', 'ACTIVE'), true);
  assert.equal(canTransitionEngineeringCapability('ACTIVE', 'DEPRECATED'), true);

  assert.equal(canTransitionEngineeringCapability('RESERVED', 'ACTIVE'), false);
  assert.equal(canTransitionEngineeringCapability('QUALIFIED', 'DEPRECATED'), false);
  assert.equal(canTransitionEngineeringCapability('ACTIVE', 'QUALIFIED'), false);
  assert.equal(canTransitionEngineeringCapability('DEPRECATED', 'ACTIVE'), false);
  assert.throws(
    () => assertEngineeringCapabilityTransition('RESERVED', 'ACTIVE'),
    /ENGINEERING_LIFECYCLE_TRANSITION_FORBIDDEN/u,
  );
});

test('lifecycle separates benchmark readiness from production execution', () => {
  const reserved = createEngineeringCapabilityLifecycle({ state: 'RESERVED' });
  const qualified = createEngineeringCapabilityLifecycle({ state: 'QUALIFIED' });
  const active = createEngineeringCapabilityLifecycle({ state: 'ACTIVE' });
  assert.equal(reserved.benchmarkExecutionAllowed, false);
  assert.equal(reserved.productionExecutionAllowed, false);
  assert.equal(qualified.benchmarkExecutionAllowed, true);
  assert.equal(qualified.productionExecutionAllowed, false);
  assert.equal(active.benchmarkExecutionAllowed, true);
  assert.equal(active.productionExecutionAllowed, true);
});

test('SBC exposes four reserved fill-in-the-blanks implementation slots', () => {
  assert.equal(SBC_VERTICAL_LIFECYCLE.state, 'RESERVED');
  assert.deepEqual(SBC_TYPE_IDS, ['TYPE_1', 'TYPE_2', 'TYPE_3', 'TYPE_4']);
  for (const typeId of SBC_TYPE_IDS) {
    const slot = SBC_TYPE_IMPLEMENTATION_SLOTS[typeId];
    assert.equal(slot.typeId, typeId);
    assert.equal(slot.lifecycle.state, 'RESERVED');
    assert.equal(slot.executionAllowed, false);
    assert.equal(slot.benchmarkRequirements.publishedB1.exampleId, B1[typeId]);
    assert.equal(slot.benchmarkRequirements.independentB2.required, true);
    assert.equal(slot.benchmarkRequirements.independentB2.minimumFamilies, 1);
    assert.match(slot.nextImplementationSeam, /calculate-type[1-4]\.js$/u);
  }
  assert.equal(SBC_MAIN_LINE_INPUT_REQUIREMENT.fitOnlyAccepted, false);
  assert.equal(SBC_MAIN_LINE_INPUT_REQUIREMENT.assessmentCompletenessRequired, true);
});

test('Type-3 reserved slot retains source-conflict and evidence guardrails', () => {
  const type3 = SBC_TYPE_IMPLEMENTATION_SLOTS.TYPE_3;
  assert.equal(type3.owningIssues.includes(514), true);
  assert.equal(type3.blockedBy.includes('SBC_T3_CURVES_BLOCKED_SOURCE_DATA_CONFLICT'), true);
  assert.equal(type3.blockedBy.includes('EXISTING_TYPE3_CANDIDATE_NOT_PRODUCTION_AUTHORITY'), true);
});

test('reserved SBC kernel never emits an engineering LOF', () => {
  for (const typeId of SBC_TYPE_IDS) {
    const result = calculateReservedSbc({ sbcType: typeId, connectionId: 'SBC-C-001' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'RESERVED');
    assert.equal(result.executionAllowed, false);
    assert.equal(Object.hasOwn(result, 'lof'), false);
    assert.equal(result.nextImplementationSeam, SBC_TYPE_IMPLEMENTATION_SLOTS[typeId].nextImplementationSeam);
  }
});

test('reserved public definition is valid, visible, and fail-closed', () => {
  assert.equal(validateEngineeringCalculationDefinition(
    VIBRATION_SBC_RESERVED_ENGINEERING_CALCULATION_DEFINITION,
  ), true);
  const definition = VIBRATION_SBC_RESERVED_ENGINEERING_CALCULATION_DEFINITION;
  assert.equal(definition.id, 'VIB.SBC.SMALL_BORE');
  assert.equal(definition.lifecycle.state, 'RESERVED');
  assert.equal(definition.authority.calculationState, 'BLOCKED');
  assert.deepEqual(definition.ui.executionModes, []);
  assert.match(definition.ui.blockedReason, /#563/u);
  assert.equal(definition.applicability.limitations.some((item) => item.includes('#514')), true);

  const result = definition.calculate({ sbcType: 'TYPE_1', connectionId: 'SBC-C-001' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'ENGINEERING_METHOD_BLOCKED');
  assert.equal(Object.hasOwn(result, 'outputs'), false);
  assert.equal(result.evidence.reservedScaffold.status, 'RESERVED');
});

test('pending catalogue contains exactly one specialized SBC reserved definition', () => {
  const rows = PENDING_ENGINEERING_CALCULATION_DEFINITIONS.filter(
    (definition) => definition.id === 'VIB.SBC.SMALL_BORE',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0], VIBRATION_SBC_RESERVED_ENGINEERING_CALCULATION_DEFINITION);
  assert.equal(rows[0].qualificationIssue, 563);
});

test('generic engineering console surfaces reserved lifecycle and issue guidance', () => {
  const definition = VIBRATION_SBC_RESERVED_ENGINEERING_CALCULATION_DEFINITION;
  assert.equal(definitionState(definition), 'RESERVED');

  const inputHtml = renderInputForm(definition, {});
  assert.match(inputHtml, /Execution blocked\./u);
  assert.match(inputHtml, /RESERVED/u);
  assert.match(inputHtml, /#563/u);
  assert.doesNotMatch(inputHtml, /RESERVED — RESERVED/u);

  const basisHtml = renderBasis(definition, null);
  assert.match(basisHtml, /Lifecycle/u);
  assert.match(basisHtml, /RESERVED/u);
  assert.match(basisHtml, /Method state/u);
  assert.match(basisHtml, /BLOCKED/u);
});

test('vibration family landing renders SBC as RESERVED with issue-linked guidance', () => {
  const html = renderVibrationFamilyLanding([
    VIBRATION_SBC_RESERVED_ENGINEERING_CALCULATION_DEFINITION,
  ]);
  assert.match(html, /Small-Bore Connection Vibration/u);
  assert.match(html, /RESERVED/u);
  assert.match(html, /Issue #563/u);
  assert.match(html, /issue #514/u);
  assert.match(html, /View qualification basis/u);
});
