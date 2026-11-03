import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIT_GEOMETRY_CONSISTENCY_AUTHORITY,
  FIT_GEOMETRY_CONSISTENCY_AUTHORITY_SCHEMA,
  evaluateFitGeometryConsistencyAuthority,
  validateFitGeometryConsistencyAuthority,
} from '../converters/vibration/fit/geometry-consistency-authority.js';

test('G11 controlled geometry consistency authority remains explicitly blocked without tolerance', () => {
  const record = FIT_GEOMETRY_CONSISTENCY_AUTHORITY;
  assert.equal(record.schema, FIT_GEOMETRY_CONSISTENCY_AUTHORITY_SCHEMA);
  assert.equal(record.ruleId, 'FIT-M5-OD-WALL-ID-CONSISTENCY');
  assert.equal(record.state, 'BLOCKED_TOLERANCE_AUTHORITY');
  assert.equal(record.tolerance, null);
  assert.equal(record.authority.authority, 'GEOMETRY_DATA_CONSISTENCY_ONLY');
  assert.equal(record.authority.engineeringAuthority, 'NONE');
  assert.equal(record.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(record.authority.designAuthority, false);
  assert.equal(record.productionExecutionAllowed, false);
  assert.equal(Object.isFrozen(record), true);
});

test('G12 authority evaluator fails closed rather than manufacturing a tolerance', () => {
  const result = evaluateFitGeometryConsistencyAuthority();
  assert.equal(result.state, 'BLOCKED_SOURCE_AUTHORITY');
  assert.equal(result.blocker, 'GEOMETRY_CONSISTENCY_TOLERANCE_NOT_AUTHORIZED');
  assert.equal(result.productionExecutionAllowed, false);
  assert.equal(Object.hasOwn(result, 'toleranceValue'), false);
});

test('G18 foreign tolerances are recorded as explicitly non-adopted authorities', () => {
  const foreign = new Map(FIT_GEOMETRY_CONSISTENCY_AUTHORITY.foreignAuthorities
    .map((row) => [row.id, row]));
  assert.equal(foreign.get('PIPE_WALL_MASTER_EPSILON_MM').adopted, false);
  assert.equal(foreign.get('PIPE_WALL_MASTER_OD_PARITY').adopted, false);
  assert.equal(foreign.get('B313_NEGATIVE_MILL_TOLERANCE').adopted, false);
  assert.equal(foreign.get('FIT_BENCHMARK_RECONCILIATION_TOLERANCE').adopted, false);
});

test('blocked record validator rejects hidden or leaked numerical tolerance fields', () => {
  for (const patch of [
    { tolerance: { type: 'ABSOLUTE', value: 0.1, unit: 'mm' } },
    { toleranceValue: 0.1 },
    { toleranceMm: 0.1 },
    { epsilon: 1e-9 },
  ]) {
    assert.throws(
      () => validateFitGeometryConsistencyAuthority({
        ...FIT_GEOMETRY_CONSISTENCY_AUTHORITY,
        ...patch,
      }),
      (error) => error.code === 'FIT_GEOMETRY_CONSISTENCY_AUTHORITY_INVALID',
    );
  }
});

test('source pins distinguish requirement authority from non-authorizing candidate tolerances', () => {
  const { sourcePins } = FIT_GEOMETRY_CONSISTENCY_AUTHORITY;
  assert.equal(sourcePins.familyGovernance.issue, 429);
  assert.equal(sourcePins.fitMethod.path, 'docs/vibration/FIT-Engineering-Method-Specification-v1.md');
  assert.equal(sourcePins.fitMethod.blob, '31942bb400ff2cc065a4afa3423d23d05aa685a6');
  assert.equal(sourcePins.fitMethod.methodRevision, 'ei-aviff2-fit-screening-v1');
});
