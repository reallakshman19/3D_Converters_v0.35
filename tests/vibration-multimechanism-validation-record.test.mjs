import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  VIBRATION_WORKED_EXAMPLE_VALIDATION_SCHEMA,
  buildVibrationWorkedExampleValidationRecord,
} from '../converters/vibration/validation/worked-examples.js';

const catalogue = JSON.parse(fs.readFileSync(
  new URL('../Benchmarks/VibrationIntegrity/ei-aviff-multimechanism-worked-examples-v1.json', import.meta.url),
  'utf8',
));

function fitOracleFromPublished(input) {
  const item = catalogue.cases.find((candidate) => candidate.input === input)
    ?? catalogue.cases.find((candidate) => JSON.stringify(candidate.input) === JSON.stringify(input));
  const p = item.published;
  return {
    ok: true,
    excitation: { rhoV2: p.rhoV2 },
    standard: { fluidViscosityFactor: p.fluidViscosityFactor, correlation: { fv: p.standardFv }, lof: p.standardLof },
    support: { stiffness: p.supportStiffness },
  };
}

test('multi-mechanism record is deterministic and distinguishes pass/partial/review/deferred', () => {
  const record = buildVibrationWorkedExampleValidationRecord(catalogue, { calculateFit: fitOracleFromPublished });
  assert.equal(record.schema, VIBRATION_WORKED_EXAMPLE_VALIDATION_SCHEMA);
  assert.equal(record.summary.totalCases, 25);
  assert.deepEqual(record.summary.statusCounts, { PASS: 14, PARTIAL: 5, REVIEW_REQUIRED: 1, DEFERRED: 5 });
  assert.equal(record.authority.engineeringAuthority, 'NONE');
  assert.equal(record.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(record.authority.designAuthority, false);
});

test('produced-water transient preserves PDF/DOCX discrepancy instead of normalizing it', () => {
  const record = buildVibrationWorkedExampleValidationRecord(catalogue, { calculateFit: fitOracleFromPublished });
  const item = record.cases.find((candidate) => candidate.caseId === 'EI-D4-TRANSIENT-PRODUCED-WATER');
  assert.equal(item.status, 'REVIEW_REQUIRED');
  const discrepancy = item.steps.find((step) => step.id === 'sourceLofDiscrepancy');
  assert.equal(discrepancy.expected, 0.70);
  assert.equal(discrepancy.actual, 0.06);
  assert.equal(discrepancy.status, 'REVIEW_REQUIRED');
});

test('AIV is pinned to active PR evidence and does not claim LOF execution', () => {
  const record = buildVibrationWorkedExampleValidationRecord(catalogue, { calculateFit: fitOracleFromPublished });
  const aiv = record.cases.filter((item) => item.mechanism === 'AIV');
  assert.equal(aiv.length, 3);
  assert.deepEqual(aiv.map((item) => item.status), ['PARTIAL', 'PARTIAL', 'PASS']);
  assert(aiv.every((item) => item.externalPr === 446));
  assert.equal(aiv.filter((item) => item.steps.some((step) => step.id === 'lof' && step.status === 'NOT_RUN')).length, 2);
  assert.equal(aiv.find((item) => item.caseId === 'EI-D2-AIV-RELIEF').steps.find((step) => step.id === 'lof').status, 'PASS');
});

test('mechanisms with no populated retained example are DEFERRED, never PASS', () => {
  const record = buildVibrationWorkedExampleValidationRecord(catalogue, { calculateFit: fitOracleFromPublished });
  const deferred = record.cases.filter((item) => item.validationMode === 'NO_RETAINED_EXAMPLE');
  assert.equal(deferred.length, 5);
  assert(deferred.every((item) => item.status === 'DEFERRED'));
});

test('partial source-replay cases still independently verify every arithmetic step available', () => {
  const record = buildVibrationWorkedExampleValidationRecord(catalogue, { calculateFit: fitOracleFromPublished });
  const liquid = record.cases.find((item) => item.caseId === 'EI-D4-TRANSIENT-PRODUCED-WATER');
  const liquidArithmetic = liquid.steps.filter((step) => step.mode === 'STEP_ARITHMETIC_PARITY');
  assert(liquidArithmetic.length >= 6);
  assert(liquidArithmetic.every((step) => step.status === 'PASS'));

  const thermowell = record.cases.find((item) => item.mechanism === 'THERMOWELL');
  assert(thermowell.steps.filter((step) => step.mode === 'STEP_ARITHMETIC_PARITY').every((step) => step.status === 'PASS'));

  const sbc = record.cases.find((item) => item.mechanism === 'SMALL_BORE_CONNECTION');
  assert(sbc.steps.filter((step) => step.mode === 'STEP_ARITHMETIC_PARITY').every((step) => step.status === 'PASS'));
});
