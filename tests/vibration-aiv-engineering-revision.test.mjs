import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_INPUT_MODE,
  beginAivAsyncOperation,
  createAivEngineeringRevisionState,
  finishAivAsyncOperation,
  isAivAsyncOperationCurrent,
  isAivLineageCurrent,
  markAivEngineeringInputChanged,
} from '../tabs/vibration-aiv-engineering-revision.js';

test('engineering revisions increment while presentation-only state can remain neutral', () => {
  const state = { ...createAivEngineeringRevisionState(), destroyed: false };
  assert.equal(state.inputRevision, 0);
  markAivEngineeringInputChanged(state, { inputMode: AIV_INPUT_MODE.TABLE_DRIVEN });
  assert.equal(state.inputRevision, 1);
  state.canvasPresentation = { x: 9000, y: -4000 };
  assert.equal(state.inputRevision, 1);
});

test('network mode retains explicit network projection revision', () => {
  const state = { ...createAivEngineeringRevisionState(), destroyed: false };
  markAivEngineeringInputChanged(state, {
    inputMode: AIV_INPUT_MODE.NETWORK_DRIVEN,
    networkRevision: 'R17',
    generatedProjectionRevision: 'R17',
  });
  assert.equal(state.inputMode, AIV_INPUT_MODE.NETWORK_DRIVEN);
  assert.equal(state.networkRevision, 'R17');
  assert.equal(state.generatedProjectionRevision, 'R17');
});

test('engineering mutation invalidates an older async operation', () => {
  const state = { ...createAivEngineeringRevisionState(), destroyed: false };
  const operation = beginAivAsyncOperation(state, 'screening');
  assert.equal(isAivAsyncOperationCurrent(state, 'screening', operation), true);
  markAivEngineeringInputChanged(state);
  assert.equal(isAivAsyncOperationCurrent(state, 'screening', operation), false);
});

test('only current operation can establish result lineage', () => {
  const state = { ...createAivEngineeringRevisionState(), destroyed: false };
  const stale = beginAivAsyncOperation(state, 'readiness');
  const current = beginAivAsyncOperation(state, 'readiness');
  assert.equal(finishAivAsyncOperation(state, 'readiness', stale, true), false);
  assert.equal(isAivLineageCurrent(state, 'readiness'), false);
  assert.equal(finishAivAsyncOperation(state, 'readiness', current, true), true);
  assert.equal(isAivLineageCurrent(state, 'readiness'), true);
});
