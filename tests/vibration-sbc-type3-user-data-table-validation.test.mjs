import assert from 'node:assert/strict';
import test from 'node:test';
import { SBC_TYPE3_BLOCKERS } from '../converters/vibration/sbc/type3-user-data.js';
import {
  createVibrationUserEngineeringDataTable,
  vibrationUserEngineeringDataRowState,
} from '../tabs/vibration-integrity-user-data-model.js';

function type3Row(value) {
  return {
    mechanismId: 'smallBoreConnections',
    blockerId: SBC_TYPE3_BLOCKERS.mainlineMultiplier,
    scopeId: 'SBC-VALIDATION', recordKey: 'TYPE3',
    value, unit: '1', sourceReference: 'Engineer input',
  };
}

test('Type-3 numeric rows are incomplete before calculation when value is not numeric', () => {
  const table = createVibrationUserEngineeringDataTable([type3Row('not-a-number')]);
  const state = vibrationUserEngineeringDataRowState(table.rows[0]);
  assert.equal(state.status, 'INCOMPLETE');
  assert.ok(state.errors.includes('NON_NEGATIVE_NUMBER_REQUIRED'));
});

test('Type-3 non-negative numeric row is structurally ready', () => {
  const table = createVibrationUserEngineeringDataTable([type3Row('1.42')]);
  assert.equal(vibrationUserEngineeringDataRowState(table.rows[0]).status, 'READY');
});
