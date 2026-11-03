import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_KERNEL_CONTRACT_SCHEMA,
  AIV_KERNEL_STAGE_IDS,
  assertAivKernelExecutionAuthorized,
  buildAivKernelContractPlan,
} from '../converters/vibration/aiv/aiv-kernel-contract.js';

const ROOT = new URL('../', import.meta.url);

const EXPECTED_STAGES = [
  'VALIDATE_INPUT',
  'RESOLVE_INPUT',
  'EVALUATE_APPLICABILITY',
  'CALCULATE_SOURCE_PWL',
  'APPLY_SOURCE_MODIFIERS',
  'CALCULATE_POINT_ATTENUATION',
  'COMBINE_SIMULTANEOUS_SOURCES',
  'CALCULATE_DISCONTINUITY_RESULT',
  'AGGREGATE_LINE_CASE_RESULT',
  'ASSESS_RESULT',
];

test('AIV production-shaped stage contract is frozen while execution stays blocked', () => {
  const plan = buildAivKernelContractPlan();
  assert.equal(plan.schema, AIV_KERNEL_CONTRACT_SCHEMA);
  assert.deepEqual([...AIV_KERNEL_STAGE_IDS], EXPECTED_STAGES);
  assert.deepEqual(plan.stages.map((stage) => stage.stageId), EXPECTED_STAGES);
  assert(plan.stages.every((stage) => stage.implementationState === 'CONTRACT_ONLY'));
  assert(plan.stages.every((stage) => stage.numericalExecutionAuthorized === false));
  assert.equal(plan.productionExecutionAuthorized, false);
  assert.equal(plan.benchmarkExecutionAuthorized, false);
  assert.equal(plan.screeningExecutionAuthorized, false);
  assert.equal(plan.authority.calculationState, 'BLOCKED');
  assert.equal(plan.authority.engineeringAuthority, 'NONE');
  assert.equal(plan.authority.productionEquationAuthorized, false);
  assert.equal(plan.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(plan.authority.designAuthority, false);
  assert.equal(Object.isFrozen(plan), true);
});

test('AIV kernel execution assertion always fails closed at current authority', () => {
  assert.throws(
    () => assertAivKernelExecutionAuthorized(),
    (error) => error?.code === 'AIV_KERNEL_EXECUTION_NOT_AUTHORIZED',
  );
});

test('kernel contract module contains no qualification equations or production implementation constants', () => {
  const source = fs.readFileSync(new URL('converters/vibration/aiv/aiv-kernel-contract.js', ROOT), 'utf8');
  for (const forbidden of ['126.1', '** 3.6', '470711.5155', '575094.3273', '1.2133', '0.2009']) {
    assert.equal(source.includes(forbidden), false, `kernel contract must not contain ${forbidden}`);
  }
  assert.doesNotMatch(source, /Math\.(?:log|log10|tanh|pow)/u);
});

test('kernel contract is not exported to the AIV facade or imported by the UI/API', () => {
  const files = [
    'converters/vibration/aiv/index.js',
    'tabs/vibration-aiv-qualification-tab.js',
    'tabs/vibration-aiv-qualification-view.js',
    'converters/engineering-calculations/default-registry.js',
  ];
  for (const path of files) {
    const source = fs.readFileSync(new URL(path, ROOT), 'utf8');
    assert.doesNotMatch(source, /aiv-kernel-contract|buildAivKernelContractPlan|assertAivKernelExecutionAuthorized/u, path);
  }
});
