import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  VIBRATION_FACILITY_FIT_PREFLIGHT_SCHEMA,
  buildVibrationFacilityFitPreflight,
} from '../converters/vibration/facility/fit-preflight.js';

const source = fs.readFileSync(new URL('../converters/vibration/facility/fit-preflight.js', import.meta.url), 'utf8');

function exchange({ complete = true } = {}) {
  return {
    schema: 'VibrationTableExchange.v1',
    sourceFormat: complete ? 'XLSX' : 'CSV_ELEMENTS_ONLY',
    completeExchange: complete,
    integrityStatus: complete ? 'DECLARED_NOT_REVERIFIED' : 'LIMITED_ELEMENTS_ONLY',
    authority: { canonicalHash: complete ? 'sha256:canonical' : null },
    elements: [
      { canonicalId: 'CAN-1', line: 'L-100', tag: 'P-100-A' },
      { canonicalId: 'CAN-2', line: 'L-200', tag: 'P-200-A' },
    ],
  };
}

function operatingCases() {
  return [
    {
      caseId: 'NORMAL', line: 'L-100', source: 'HMB-1', phase: 'GAS',
      massFlow: { value: 20000, unit: 'kg/h' },
      density: { value: 18, unit: 'kg/m3' },
      dynamicViscosity: { value: 0.02, unit: 'cP' },
    },
    {
      caseId: 'NORMAL', line: 'L-200', source: 'HMB-2', phase: 'LIQUID',
      massFlow: { value: 36000, unit: 'kg/h' },
      density: { value: 980, unit: 'kg/m3' },
    },
  ];
}

function basis(canonicalId, span) {
  return [
    { canonicalId, property: 'WALL_BASIS', value: 'AS_BUILT', source: 'M5' },
    { canonicalId, property: 'MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS', value: span, unit: 'm', source: 'M5' },
    { canonicalId, property: 'SPAN_DETERMINATION_METHOD', value: 'LINE_WALK_EFFECTIVE_SUPPORTS', source: 'M5' },
    { canonicalId, property: 'SUPPORT_EVIDENCE_STATUS', value: 'EFFECTIVE_SUPPORTS_CONFIRMED', source: 'M5' },
    { canonicalId, caseId: 'NORMAL', property: 'FIT_DENSITY_BASIS', value: 'ACTUAL', source: 'M5' },
    { canonicalId, caseId: 'NORMAL', property: 'FIT_OPERATING_SCENARIO_COHERENT', value: true, source: 'M5' },
  ];
}

function enrichment() {
  return [
    { canonicalId: 'CAN-1', property: 'FIT_ASSESSMENT_POINT', value: true, source: 'VIB-REVIEW' },
    { canonicalId: 'CAN-1', property: 'OUTSIDE_DIAMETER', value: 168.3, unit: 'mm', source: 'LINE-LIST' },
    { canonicalId: 'CAN-1', property: 'WALL_THICKNESS', value: 7.11, unit: 'mm', source: 'LINE-LIST' },
    { canonicalId: 'CAN-1', property: 'MAX_UNSUPPORTED_SPAN', value: 4, unit: 'm', source: 'LEGACY-SPAN' },
    ...basis('CAN-1', 4),
    { canonicalId: 'CAN-2', property: 'FIT_ASSESSMENT_POINT', value: true, source: 'VIB-REVIEW' },
    { canonicalId: 'CAN-2', property: 'OUTSIDE_DIAMETER', value: 273, unit: 'mm', source: 'LINE-LIST' },
    { canonicalId: 'CAN-2', property: 'WALL_THICKNESS', value: 9.27, unit: 'mm', source: 'LINE-LIST' },
  ];
}

test('preflight stops at dataset and plan while reporting READY/NOT_READY rows', () => {
  const result = buildVibrationFacilityFitPreflight({
    exchange: exchange(), operatingCases: operatingCases(), enrichment: enrichment(),
  });
  assert.equal(result.schema, VIBRATION_FACILITY_FIT_PREFLIGHT_SCHEMA);
  assert.equal(result.authority, 'PREFLIGHT_ONLY');
  assert.equal(result.engineeringAuthority, 'NONE');
  assert.equal(result.screeningAuthorized, false);
  assert.equal(result.qualificationMode, 'benchmark');
  assert.equal(result.counts.assessmentPoints, 2);
  assert.equal(result.counts.rows, 2);
  assert.equal(result.counts.ready, 1);
  assert.equal(result.counts.notReady, 1);

  const ready = result.rows.find((row) => row.canonicalId === 'CAN-1');
  const notReady = result.rows.find((row) => row.canonicalId === 'CAN-2');
  assert.equal(ready.status, 'READY');
  assert.equal(ready.requestPrepared, true);
  assert.deepEqual(ready.missing, []);
  assert.equal(notReady.status, 'NOT_READY');
  assert.equal(notReady.requestPrepared, false);
  assert(notReady.missing.includes('maximumSpanBetweenEffectiveSupports'));
  assert.equal(Object.hasOwn(ready, 'standardLof'), false);
  assert.equal(Object.hasOwn(result, 'result'), false);
  assert.equal(Object.hasOwn(result, 'register'), false);
  assert.equal(Object.isFrozen(result), true);
});

test('preflight source has no central or FIT numerical execution dependency', () => {
  assert.doesNotMatch(source, /calculateEngineering|calculateEngineeringBatch|calculateFit\s*\(/u);
  assert.doesNotMatch(source, /fit-execute|fit-workflow\.js/u);
  assert.match(source, /assembleVibrationIntegrityDataset/u);
  assert.match(source, /buildVibrationFacilityFitPlan/u);
});

test('preflight rejects limited exchange by default and requires explicit opt-in', () => {
  assert.throws(
    () => buildVibrationFacilityFitPreflight({
      exchange: exchange({ complete: false }), operatingCases: operatingCases(), enrichment: enrichment(),
    }),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_INCOMPLETE',
  );
  const result = buildVibrationFacilityFitPreflight({
    exchange: exchange({ complete: false }), operatingCases: operatingCases(), enrichment: enrichment(),
  }, { allowLimitedExchange: true });
  assert.equal(result.dataset.exchangeIntegrityStatus, 'LIMITED_ELEMENTS_ONLY');
  assert(result.dataset.warnings.some((warning) => warning.code === 'LIMITED_EXCHANGE_ACCEPTED'));
});

test('preflight rejects authority/qualification option injection', () => {
  assert.throws(
    () => buildVibrationFacilityFitPreflight({
      exchange: exchange(), operatingCases: operatingCases(), enrichment: enrichment(),
    }, { qualificationMode: 'screening' }),
    (error) => error.code === 'FIT_PREFLIGHT_OPTION_UNSUPPORTED',
  );
});
