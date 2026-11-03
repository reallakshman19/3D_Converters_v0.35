import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEngineeringConsoleRequest,
  createEngineeringConsoleDraft,
  engineeringResultLabel,
  invalidateEngineeringConsoleExecution,
  isEngineeringCalculationExecutable,
  parseEngineeringBatchEditor,
  parseEngineeringConsoleField,
} from '../tabs/engineering-calculation-console-model.js';

const definition = {
  id: 'TEST.CALC.ONE',
  authority: { qualificationState: 'IMPLEMENTED' },
  inputs: [
    { key: 'p', label: 'Pressure', type: 'number', required: true, quantity: 'pressure', canonicalUnit: 'MPa' },
    { key: 'flag', type: 'boolean', engineeringDefault: false },
    { key: 'mode', type: 'enum', values: ['A', 'B'], engineeringDefault: 'A' },
    { key: 'obj', type: 'object' },
    { key: 'optional', type: 'number' },
  ],
};

test('draft uses declared defaults and canonical units only', () => {
  const draft = createEngineeringConsoleDraft(definition, { p: 12 });
  assert.equal(draft.values.p, 12);
  assert.equal(draft.values.flag, false);
  assert.equal(draft.values.mode, 'A');
  assert.equal(draft.units.p, 'MPa');
  assert.equal(draft.values.optional, '');
});

test('typed parser preserves zero/false and rejects malformed JSON', () => {
  assert.deepEqual(parseEngineeringConsoleField({ key: 'n', type: 'number' }, 0), { included: true, value: 0 });
  assert.deepEqual(parseEngineeringConsoleField({ key: 'b', type: 'boolean' }, false), { included: true, value: false });
  assert.throws(() => parseEngineeringConsoleField({ key: 'o', type: 'object' }, '{bad'), /JSON/);
});

test('request omits blank optional fields and enables sandbox explicitly', () => {
  const draft = createEngineeringConsoleDraft(definition, { p: 10 });
  const built = buildEngineeringConsoleRequest(definition, draft, { executionMode: 'sandbox', qualificationMode: 'screening' });
  assert.equal(built.ok, true);
  assert.equal(built.request.inputs.p, 10);
  assert.equal(Object.hasOwn(built.request.inputs, 'optional'), false);
  assert.equal(built.request.inputUnits.p, 'MPa');
  assert.equal(built.request.options.executionMode, 'sandbox');
  assert.equal(built.request.options.qualificationMode, 'screening');
});

test('blocked state and batch parsing fail closed', () => {
  assert.equal(isEngineeringCalculationExecutable(definition), true);
  assert.equal(isEngineeringCalculationExecutable({ id: 'VIB.FIV.X', authority: { qualificationState: 'BLOCKED' } }), false);
  assert.equal(parseEngineeringBatchEditor('[{"calculationId":"A.B.C"}]').batchRequest.requests.length, 1);
  assert.equal(parseEngineeringBatchEditor('{bad').ok, false);
});

test('result label reflects API result without synthesizing assessment', () => {
  assert.equal(engineeringResultLabel({ ok: true, assessment: null }), 'CALCULATED');
  assert.equal(engineeringResultLabel({ ok: true, assessment: { status: 'PASS' } }), 'PASS');
  assert.equal(engineeringResultLabel({ ok: false, errors: [{ code: 'ENGINEERING_METHOD_BLOCKED' }] }), 'ENGINEERING_METHOD_BLOCKED');
});

test('input mutation invalidates stale single-calculation evidence', () => {
  const state = {
    validation: { ok: true }, resolution: { ok: true }, result: { ok: true }, batchResult: { ok: true },
  };
  invalidateEngineeringConsoleExecution(state);
  assert.equal(state.validation, null);
  assert.equal(state.resolution, null);
  assert.equal(state.result, null);
  assert.deepEqual(state.batchResult, { ok: true });
});
