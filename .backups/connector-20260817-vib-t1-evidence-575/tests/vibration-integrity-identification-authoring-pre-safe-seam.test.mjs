import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  addVibrationIdentificationAuthoringRow,
  createVibrationIdentificationAuthoringTable,
  deleteVibrationIdentificationAuthoringRow,
  resolveVibrationIdentificationEvidenceForScope,
  updateVibrationIdentificationAuthoringCell,
  vibrationIdentificationAuthoringRowState,
} from '../tabs/vibration-integrity-identification-model.js';
import { VIBRATION_MECHANISM_IDENTIFICATION_SCHEMA } from '../converters/vibration/mechanisms/coverage.js';

const SCOPE_A = Object.freeze({ line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-A' });
const SCOPE_B = Object.freeze({ line: 'L-200', caseId: 'NORMAL', canonicalId: 'CAN-B' });

function readyRow(overrides = {}) {
  return {
    mechanismId: 'fit', line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-A',
    assessmentUnitType: 'MAIN_LINE_SECTION', disposition: 'REQUIRED',
    requiredQualification: 'SCREENING', sourceId: 'PROJECT-T1-001',
    reason: 'Explicit reviewed project mechanism identification',
    ...overrides,
  };
}

function tableWith(rows) {
  return createVibrationIdentificationAuthoringTable(rows);
}

test('VIB-T1-EV-001/002: blank table resolves no evidence; READY row normalizes to identification contract', () => {
  const blank = resolveVibrationIdentificationEvidenceForScope(tableWith([]), SCOPE_A);
  assert.equal(blank.status, 'MISSING');
  assert.deepEqual(blank.records, []);

  const resolved = resolveVibrationIdentificationEvidenceForScope(tableWith([readyRow()]), SCOPE_A);
  assert.equal(resolved.status, 'READY');
  assert.equal(resolved.records.length, 1);
  assert.equal(resolved.records[0].schema, VIBRATION_MECHANISM_IDENTIFICATION_SCHEMA);
  assert.equal(resolved.records[0].mechanismId, 'fit');
  assert.deepEqual(resolved.records[0].scope, SCOPE_A);
});

test('VIB-T1-EV-003/004: partial rows and REQUIRED without explicit qualification fail closed', () => {
  const partial = tableWith([{ mechanismId: 'fit', line: 'L-100' }]);
  assert.equal(vibrationIdentificationAuthoringRowState(partial.rows[0]).status, 'INCOMPLETE');
  assert.equal(resolveVibrationIdentificationEvidenceForScope(partial, SCOPE_A).status, 'INCOMPLETE');

  const missingQualification = tableWith([readyRow({ requiredQualification: '' })]);
  const state = vibrationIdentificationAuthoringRowState(missingQualification.rows[0]);
  assert.equal(state.status, 'INCOMPLETE');
  assert.ok(state.errors.includes('REQUIRED_QUALIFICATION_REQUIRED'));
});

test('VIB-T1-EV-005/006: N/A and unresolved forbid qualification; source and reason are mandatory', () => {
  const notApplicable = tableWith([readyRow({
    disposition: 'NOT_APPLICABLE', requiredQualification: 'SCREENING',
  })]);
  assert.equal(vibrationIdentificationAuthoringRowState(notApplicable.rows[0]).status, 'INVALID');

  for (const overrides of [{ sourceId: '' }, { reason: '' }]) {
    const table = tableWith([readyRow(overrides)]);
    assert.equal(vibrationIdentificationAuthoringRowState(table.rows[0]).status, 'INCOMPLETE');
    assert.equal(resolveVibrationIdentificationEvidenceForScope(table, SCOPE_A).status, 'INCOMPLETE');
  }
});

test('VIB-T1-EV-007: unknown governed vocabulary fails closed', () => {
  for (const overrides of [
    { mechanismId: 'unknownMechanism' },
    { assessmentUnitType: 'GENERIC_LINE_CASE' },
    { disposition: 'MAYBE' },
    { requiredQualification: 'DESIGN' },
  ]) {
    const table = tableWith([readyRow(overrides)]);
    assert.equal(vibrationIdentificationAuthoringRowState(table.rows[0]).status, 'INVALID');
    assert.equal(resolveVibrationIdentificationEvidenceForScope(table, SCOPE_A).status, 'INVALID');
  }
});

test('VIB-T1-EV-008: duplicate and contradictory identification identity fail closed', () => {
  const duplicate = resolveVibrationIdentificationEvidenceForScope(
    tableWith([readyRow(), readyRow({ sourceId: 'PROJECT-T1-002' })]), SCOPE_A,
  );
  assert.equal(duplicate.status, 'INVALID');
  assert.ok(duplicate.errors.some((error) => /DUPLICATE_MECHANISM_IDENTIFICATION/u.test(error)));

  const contradictory = resolveVibrationIdentificationEvidenceForScope(
    tableWith([
      readyRow(),
      readyRow({ disposition: 'NOT_APPLICABLE', requiredQualification: '', sourceId: 'PROJECT-T1-003' }),
    ]), SCOPE_A,
  );
  assert.equal(contradictory.status, 'INVALID');
  assert.ok(contradictory.errors.some((error) => /CONTRADICTORY_MECHANISM_IDENTIFICATION/u.test(error)));
});

test('VIB-T1-EV-009/010: scope A evidence never resolves for B and invalid matching row blocks A', () => {
  const table = tableWith([
    readyRow(),
    readyRow({ mechanismId: 'aiv', sourceId: '' }),
    readyRow({ line: 'L-200', canonicalId: 'CAN-B', mechanismId: 'mechanicalExcitation', sourceId: 'PROJECT-T1-B' }),
  ]);
  const scopeA = resolveVibrationIdentificationEvidenceForScope(table, SCOPE_A);
  assert.equal(scopeA.status, 'INCOMPLETE');
  assert.deepEqual(scopeA.records, []);

  const scopeB = resolveVibrationIdentificationEvidenceForScope(table, SCOPE_B);
  assert.equal(scopeB.status, 'READY');
  assert.equal(scopeB.records.length, 1);
  assert.equal(scopeB.records[0].scope.line, 'L-200');
  assert.equal(scopeB.records[0].mechanismId, 'mechanicalExcitation');
});

test('authoring table mutation keeps row identity stable and delete explicit', () => {
  let table = createVibrationIdentificationAuthoringTable();
  table = addVibrationIdentificationAuthoringRow(table);
  const rowId = table.rows[0].rowId;
  table = updateVibrationIdentificationAuthoringCell(table, 0, 'mechanismId', 'fit');
  assert.equal(table.rows[0].rowId, rowId);
  table = deleteVibrationIdentificationAuthoringRow(table, 0);
  assert.equal(table.rows.length, 0);
});

test('VIB-T1-EV-011/012/014/015/017: source integration is explicit, scope-bound, audited and non-numerical', () => {
  const model = fs.readFileSync(new URL('../tabs/vibration-integrity-identification-model.js', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../tabs/vibration-integrity-identification-view.js', import.meta.url), 'utf8');
  const shell = fs.readFileSync(new URL('../tabs/vibration-integrity-user-data-shell.js', import.meta.url), 'utf8');
  const screening = fs.readFileSync(new URL('../tabs/vibration-integrity-view.js', import.meta.url), 'utf8');
  const uiContract = fs.readFileSync(new URL('../tabs/vibration-integrity-ui-contract.js', import.meta.url), 'utf8');
  const combined = `${model}\n${view}\n${shell}\n${screening}\n${uiContract}`;

  assert.match(uiContract, /id: 'identification', label: 'Mechanism identification'/u);
  assert.match(view, /VIBRATION_MECHANISM_IDS/u);
  assert.match(view, /VIBRATION_ASSESSMENT_UNIT_TYPES/u);
  assert.match(view, /VIBRATION_IDENTIFICATION_DISPOSITIONS/u);
  assert.match(screening, /resolveVibrationIdentificationEvidenceForScope/u);
  assert.match(screening, /mechanismIdentifications:\s*identificationEvidence\.records/u);
  assert.match(shell, /MECHANISM_IDENTIFICATION_CHANGED/u);
  assert.doesNotMatch(shell, /userEngineeringData.*mechanismIdentifications/su);
  assert.doesNotMatch(combined, /process.*(?:REQUIRED|NOT_APPLICABLE)/iu);
  for (const forbidden of ['standardLof', 'rhoV2', 'QST-003', 'calculateFit(', 'calculateAiv(']) {
    assert.equal(combined.includes(forbidden), false, `authoring seam must not contain ${forbidden}`);
  }
});
