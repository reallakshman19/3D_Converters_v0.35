import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT,
  buildVibrationFacilityFitPreflightFromTables,
  runVibrationFacilityFitBenchmarkFromTables,
} from '../converters/vibration/facility/index.js';
import {
  VIBRATION_ENRICHMENT_CSV_HEADER,
  VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER,
  VIBRATION_OPERATING_CASE_CSV_HEADER,
  parseVibrationFitDataBlockerCsv,
} from '../converters/vibration/tabular/index.js';
import {
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
} from '../converters/vibration/exchange/schema.js';

function exchange() {
  return Object.freeze({
    schema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    completeExchange: true,
    integrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED,
    authority: Object.freeze({ canonicalHash: 'sha256:canonical', projectionHash: 'sha256:projection', datasetId: 'plant-a' }),
    sourceFileName: 'plant-a.xlsx',
    elements: Object.freeze([Object.freeze({ canonicalId: 'CANON-001', line: 'L-100', tag: 'P-100', type: 'PIPE' })]),
  });
}

function operatingCsv({
  phase = '', density = '', densityUnit = '', massFlow = '', massFlowUnit = '', velocity = '', velocityUnit = '',
} = {}) {
  const row = Array.from({ length: VIBRATION_OPERATING_CASE_CSV_HEADER.length }, () => '');
  row[0] = 'L-100'; row[1] = 'NORMAL'; row[3] = phase;
  row[4] = massFlow; row[5] = massFlowUnit; row[6] = density; row[7] = densityUnit;
  row[15] = velocity; row[16] = velocityUnit; row[17] = 'SOURCE';
  return [VIBRATION_OPERATING_CASE_CSV_HEADER.join(','), row.join(',')].join('\n');
}

function enrichmentCsv({ outsideDiameter = 168.3 } = {}) {
  return [
    VIBRATION_ENRICHMENT_CSV_HEADER.join(','),
    'CANON-001,L-100,,FIT_ASSESSMENT_POINT,true,BOOLEAN,,SOURCE,,,,',
    `CANON-001,L-100,,OUTSIDE_DIAMETER,${outsideDiameter},NUMBER,mm,SOURCE,,,,`,
    'CANON-001,L-100,,WALL_THICKNESS,7.11,NUMBER,mm,SOURCE,,,,',
    'CANON-001,L-100,,MAX_UNSUPPORTED_SPAN,4,NUMBER,m,LEGACY-SPAN,,,,',
    'CANON-001,L-100,,WALL_BASIS,AS_BUILT,STRING,,M5,,,,',
    'CANON-001,L-100,,MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS,4,NUMBER,m,M5,,,,',
    'CANON-001,L-100,,SPAN_DETERMINATION_METHOD,LINE_WALK_EFFECTIVE_SUPPORTS,STRING,,M5,,,,',
    'CANON-001,L-100,,SUPPORT_EVIDENCE_STATUS,EFFECTIVE_SUPPORTS_CONFIRMED,STRING,,M5,,,,',
    'CANON-001,L-100,NORMAL,FIT_DENSITY_BASIS,ACTUAL,STRING,,M5,,,,',
    'CANON-001,L-100,NORMAL,FIT_VELOCITY_BASIS,ACTUAL,STRING,,M5,,,,',
    'CANON-001,L-100,NORMAL,FIT_GAS_DENSITY_BASIS,ACTUAL,STRING,,M5,,,,',
    'CANON-001,L-100,NORMAL,FIT_LIQUID_DENSITY_BASIS,ACTUAL,STRING,,M5,,,,',
    'CANON-001,L-100,NORMAL,FIT_OPERATING_SCENARIO_COHERENT,true,BOOLEAN,,M5,,,,',
  ].join('\n');
}

function blockerCsv(rows) {
  return [VIBRATION_FIT_DATA_BLOCKER_CSV_HEADER.join(','), ...rows].join('\n');
}

function topology() {
  return { format: VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.PARSED_EXCHANGE, data: exchange() };
}

test('pending HOLD numeric blocker stays null and can never become a synthetic zero', () => {
  const parsed = parseVibrationFitDataBlockerCsv(blockerCsv([
    'CANON-001,L-100,NORMAL,DENSITY,,,USER-INPUT,,B-PENDING,HOLD,eng-a,awaiting data',
  ]));
  assert.equal(parsed[0].value, null);
  assert.equal(parsed[0].unit, null);
  assert.equal(parsed[0].status, 'HOLD');
});

test('ACTIVE blocker requires an explicit value and numeric unit', () => {
  assert.throws(
    () => parseVibrationFitDataBlockerCsv(blockerCsv([
      'CANON-001,L-100,NORMAL,DENSITY,,,USER-INPUT,,B-1,ACTIVE,eng-a,',
    ])),
    (error) => error.code === 'FIT_DATA_BLOCKER_VALUE_REQUIRED',
  );
  assert.throws(
    () => parseVibrationFitDataBlockerCsv(blockerCsv([
      'CANON-001,L-100,NORMAL,DENSITY,1000,,USER-INPUT,,B-1,ACTIVE,eng-a,',
    ])),
    (error) => error.code === 'FIT_DATA_BLOCKER_UNIT_REQUIRED',
  );
});

test('M5 wall/process/support blocker vocab is fail-closed', () => {
  for (const row of [
    'CANON-001,,,WALL_BASIS,SCHEDULE,,USER-INPUT,,B-1,ACTIVE,eng-a,',
    'CANON-001,L-100,NORMAL,DENSITY_BASIS,DESIGN,,USER-INPUT,,B-2,ACTIVE,eng-a,',
    'CANON-001,,,SPAN_DETERMINATION_METHOD,FIELD_GUESS,,USER-INPUT,,B-3,ACTIVE,eng-a,',
    'CANON-001,,,SUPPORT_EVIDENCE_STATUS,CONFIRMED,,USER-INPUT,,B-4,ACTIVE,eng-a,',
  ]) {
    assert.throws(
      () => parseVibrationFitDataBlockerCsv(blockerCsv([row])),
      (error) => error.code === 'FIT_DATA_BLOCKER_VALUE_INVALID',
    );
  }
});

test('ACTIVE blocker rows fill missing process data without overwriting source tables', () => {
  const dataBlockerCsv = blockerCsv([
    'CANON-001,L-100,NORMAL,PHASE,LIQUID,,USER-INPUT,,B-1,ACTIVE,eng-a,missing phase',
    'CANON-001,L-100,NORMAL,DENSITY,1000,kg/m3,USER-INPUT,,B-2,ACTIVE,eng-a,missing density',
    'CANON-001,L-100,NORMAL,VELOCITY,1,m/s,USER-INPUT,,B-3,ACTIVE,eng-a,missing velocity',
  ]);
  const preflight = buildVibrationFacilityFitPreflightFromTables({
    topology: topology(), operatingCaseCsv: operatingCsv(), enrichmentCsv: enrichmentCsv(), dataBlockerCsv,
  });
  assert.equal(preflight.imports.dataBlockerCount, 3);
  assert.equal(preflight.imports.activeDataBlockerCount, 3);
  assert.equal(preflight.preflight.counts.ready, 1);
  const trace = preflight.preflight.rows[0].sourceTrace;
  assert.equal(trace.process.phase.selection, 'DATA_BLOCKER');
  assert.equal(trace.process.density.selection, 'DATA_BLOCKER');
  assert.equal(trace.process.velocity.selection, 'DATA_BLOCKER');
});

test('component-derived multiphase can be supplied entirely through the separate blocker table', () => {
  const dataBlockerCsv = blockerCsv([
    'CANON-001,L-100,NORMAL,PHASE,MULTIPHASE,,USER-INPUT,,B-1,ACTIVE,eng-a,',
    'CANON-001,L-100,NORMAL,MULTIPHASE_RESOLUTION_MODE,COMPONENT_DERIVED,,USER-INPUT,,B-2,ACTIVE,eng-a,',
    'CANON-001,L-100,NORMAL,GAS_MASS_FLOW,10,kg/s,USER-INPUT,,B-3,ACTIVE,eng-a,',
    'CANON-001,L-100,NORMAL,GAS_DENSITY,20,kg/m3,USER-INPUT,,B-4,ACTIVE,eng-a,',
    'CANON-001,L-100,NORMAL,LIQUID_MASS_FLOW,100,kg/s,USER-INPUT,,B-5,ACTIVE,eng-a,',
    'CANON-001,L-100,NORMAL,LIQUID_DENSITY,800,kg/m3,USER-INPUT,,B-6,ACTIVE,eng-a,',
  ]);
  const result = runVibrationFacilityFitBenchmarkFromTables({
    topology: topology(), enrichmentCsv: enrichmentCsv({ outsideDiameter: 711.2 }), dataBlockerCsv,
  });
  assert.equal(result.workflow.register.rows.length, 1);
  assert.equal(result.workflow.register.rows[0].status, 'CALCULATED_BENCHMARK');
  const central = result.workflow.result.rows[0].centralResult;
  assert.equal(central.provenance.inputResolution.multiphaseResolutionMode, 'COMPONENT_DERIVED');
  assert.equal(central.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(result.screeningAuthorized, false);
});

test('manual blocker input fails closed when it collides with an existing source value', () => {
  const dataBlockerCsv = blockerCsv([
    'CANON-001,L-100,NORMAL,DENSITY,1000,kg/m3,USER-INPUT,,B-1,ACTIVE,eng-a,',
  ]);
  assert.throws(
    () => buildVibrationFacilityFitPreflightFromTables({
      topology: topology(), operatingCaseCsv: operatingCsv({ phase: 'LIQUID', density: '900', densityUnit: 'kg/m3' }),
      enrichmentCsv: enrichmentCsv(), dataBlockerCsv,
    }),
    (error) => error.code === 'FIT_DATA_BLOCKER_SOURCE_COLLISION',
  );
});

test('manual velocity cannot supersede an existing source mass-flow representation', () => {
  const dataBlockerCsv = blockerCsv([
    'CANON-001,L-100,NORMAL,VELOCITY,1,m/s,USER-INPUT,,B-1,ACTIVE,eng-a,alternate flow representation',
  ]);
  assert.throws(
    () => buildVibrationFacilityFitPreflightFromTables({
      topology: topology(),
      operatingCaseCsv: operatingCsv({
        phase: 'LIQUID', density: '1000', densityUnit: 'kg/m3', massFlow: '5', massFlowUnit: 'kg/s',
      }),
      enrichmentCsv: enrichmentCsv(), dataBlockerCsv,
    }),
    (error) => error.code === 'FIT_DATA_BLOCKER_SOURCE_COLLISION',
  );
});

test('HOLD blocker rows remain audit-only and do not satisfy readiness', () => {
  const dataBlockerCsv = blockerCsv([
    'CANON-001,L-100,NORMAL,DENSITY,1000,kg/m3,USER-INPUT,,B-1,HOLD,eng-a,awaiting confirmation',
    'CANON-001,L-100,NORMAL,VELOCITY,1,m/s,USER-INPUT,,B-2,HOLD,eng-a,awaiting confirmation',
  ]);
  const preflight = buildVibrationFacilityFitPreflightFromTables({
    topology: topology(), operatingCaseCsv: operatingCsv({ phase: 'LIQUID' }),
    enrichmentCsv: enrichmentCsv(), dataBlockerCsv,
  });
  assert.equal(preflight.imports.dataBlockerCount, 2);
  assert.equal(preflight.imports.activeDataBlockerCount, 0);
  assert.equal(preflight.preflight.counts.ready, 0);
  assert(preflight.preflight.rows[0].missing.includes('density'));
});

test('method/domain gaps cannot be bypassed by inventing a data-blocker field', () => {
  const dataBlockerCsv = blockerCsv([
    'CANON-001,L-100,NORMAL,SUPPORT_SIZE_FAMILY,SMALL,,USER-INPUT,,B-1,ACTIVE,eng-a,attempted QST-003 bypass',
  ]);
  assert.throws(
    () => buildVibrationFacilityFitPreflightFromTables({
      topology: topology(), enrichmentCsv: enrichmentCsv({ outsideDiameter: 250 }), dataBlockerCsv,
    }),
    (error) => error.code === 'FIT_DATA_BLOCKER_FIELD_UNSUPPORTED',
  );
});
