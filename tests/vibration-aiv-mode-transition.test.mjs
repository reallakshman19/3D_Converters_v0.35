import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_INPUT_MODE,
  createAivEngineeringRevisionState,
} from '../tabs/vibration-aiv-engineering-revision.js';
import {
  activateAivNetworkDrivenMode,
  assertAivTableMutationAllowed,
  detachAivGeneratedTables,
  markAivTableDrivenInputChanged,
} from '../tabs/vibration-aiv-mode-transition.js';

function stateFixture() {
  return {
    ...createAivEngineeringRevisionState(),
    destroyed: false,
    flareNetworkActive: false,
    flareNetwork: { revision: '7', nodes: [{ nodeId: 'RV-101' }], segments: [] },
    generatedInputSet: { pathEvidence: [{ physicalDistanceM: 38 }] },
    tables: {
      sources: { kind: 'sources', header: ['ID'], rows: [['RV-101']] },
      assessments: { kind: 'assessments', header: ['ID'], rows: [['A-1']] },
      relationships: { kind: 'relationships', header: ['Distance'], rows: [['38']] },
    },
  };
}

test('network-generated tables reject direct table mutation', () => {
  const state = stateFixture();
  activateAivNetworkDrivenMode(state, '7');
  assert.throws(
    () => assertAivTableMutationAllowed(state),
    (error) => error.code === 'AIV_GENERATED_TABLES_READ_ONLY'
      && error.action === 'DETACH_GENERATED_TABLES',
  );
});

test('detach clones generated tables and switches authority exactly once', () => {
  const state = stateFixture();
  activateAivNetworkDrivenMode(state, '7');
  const revisionBeforeDetach = state.inputRevision;
  const originalTables = state.tables;
  const evidence = detachAivGeneratedTables(state);
  assert.equal(state.inputMode, AIV_INPUT_MODE.TABLE_DRIVEN);
  assert.equal(state.inputRevision, revisionBeforeDetach + 1);
  assert.equal(state.networkRevision, null);
  assert.equal(state.generatedProjectionRevision, null);
  assert.equal(state.flareNetworkActive, false);
  assert.equal(state.generatedInputSet, null);
  assert.notEqual(state.tables, originalTables);
  assert.deepEqual(state.tables, originalTables);
  assert.equal(evidence.networkRevision, '7');
  state.tables.relationships.rows[0][0] = '41';
  assert.equal(evidence.generatedInputSet.pathEvidence[0].physicalDistanceM, 38);
});

test('ordinary table-driven engineering changes retain table ownership', () => {
  const state = stateFixture();
  markAivTableDrivenInputChanged(state);
  assert.equal(state.inputMode, AIV_INPUT_MODE.TABLE_DRIVEN);
  assert.equal(assertAivTableMutationAllowed(state), true);
});
