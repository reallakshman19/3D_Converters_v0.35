import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_FACILITY_FIT_TABULAR_WORKFLOW_SCHEMA,
  VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT,
  runVibrationFacilityFitBenchmark,
  runVibrationFacilityFitBenchmarkFromTables,
} from '../converters/vibration/facility/index.js';
import {
  VIBRATION_ENRICHMENT_CSV_HEADER,
  VIBRATION_OPERATING_CASE_CSV_HEADER,
  parseVibrationEnrichmentCsv,
  parseVibrationOperatingCaseCsv,
} from '../converters/vibration/tabular/index.js';
import {
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
  VIBRATION_TABLE_EXCHANGE_SHEETS,
} from '../converters/vibration/exchange/schema.js';

function parsedExchange({ completeExchange = true } = {}) {
  return Object.freeze({
    schema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    completeExchange,
    integrityStatus: completeExchange
      ? VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED
      : VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY,
    authority: Object.freeze(completeExchange ? {
      canonicalHash: 'sha256:canonical', projectionHash: 'sha256:projection', datasetId: 'plant-a',
    } : {}),
    sourceFileName: completeExchange ? 'plant-a-3d-edit.xlsx' : 'plant-a-3d-edit.csv',
    elements: Object.freeze([
      Object.freeze({ canonicalId: 'CANON-001', line: 'L-100', tag: 'P-100', type: 'PIPE' }),
    ]),
  });
}

function operatingCaseCsv() {
  return [
    VIBRATION_OPERATING_CASE_CSV_HEADER.join(','),
    'L-100,NORMAL,,GAS,14.856111111111112,kg/s,18,kg/m3,,,,,,0.00002,Pa*s,,,HMB-100,C,HMB-1',
  ].join('\r\n');
}

function enrichmentCsv() {
  return [
    VIBRATION_ENRICHMENT_CSV_HEADER.join(','),
    'CANON-001,L-100,,FIT_ASSESSMENT_POINT,true,BOOLEAN,,VIB-REVIEW,,VIB-1,VERIFIED,eng-a',
    'CANON-001,L-100,,OUTSIDE_DIAMETER,168.3,NUMBER,mm,PIPE-DATA,,VIB-2,VERIFIED,eng-a',
    'CANON-001,L-100,,WALL_THICKNESS,7.11,NUMBER,mm,PIPE-DATA,,VIB-3,VERIFIED,eng-a',
    'CANON-001,L-100,,INSIDE_DIAMETER,154.1,NUMBER,mm,PIPE-DATA,,VIB-4,VERIFIED,eng-a',
    'CANON-001,L-100,,MAX_UNSUPPORTED_SPAN,6.4,NUMBER,m,LEGACY-SPAN,,VIB-5,VERIFIED,eng-b',
    'CANON-001,L-100,,WALL_BASIS,NOMINAL,STRING,,M5,,VIB-6,VERIFIED,eng-b',
    'CANON-001,L-100,,MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS,6.4,NUMBER,m,M5,,VIB-7,VERIFIED,eng-b',
    'CANON-001,L-100,,SPAN_DETERMINATION_METHOD,LINE_WALK_EFFECTIVE_SUPPORTS,STRING,,M5,,VIB-8,VERIFIED,eng-b',
    'CANON-001,L-100,,SUPPORT_EVIDENCE_STATUS,EFFECTIVE_SUPPORTS_CONFIRMED,STRING,,M5,,VIB-9,VERIFIED,eng-b',
    'CANON-001,L-100,NORMAL,FIT_DENSITY_BASIS,ACTUAL,STRING,,M5,,VIB-10,VERIFIED,eng-b',
    'CANON-001,L-100,NORMAL,FIT_OPERATING_SCENARIO_COHERENT,true,BOOLEAN,,M5,,VIB-11,VERIFIED,eng-b',
  ].join('\n');
}

test('parsed exchange + CSV tables matches direct parsed-data facility workflow', () => {
  const exchange = parsedExchange();
  const operatingCases = parseVibrationOperatingCaseCsv(operatingCaseCsv());
  const enrichment = parseVibrationEnrichmentCsv(enrichmentCsv());
  const direct = runVibrationFacilityFitBenchmark({ exchange, operatingCases, enrichment });
  const tabular = runVibrationFacilityFitBenchmarkFromTables({
    topology: {
      format: VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.PARSED_EXCHANGE,
      data: exchange,
    },
    operatingCaseCsv: operatingCaseCsv(),
    enrichmentCsv: enrichmentCsv(),
  });

  assert.equal(tabular.schema, VIBRATION_FACILITY_FIT_TABULAR_WORKFLOW_SCHEMA);
  assert.equal(tabular.authority, 'TABULAR_WORKFLOW_ORCHESTRATION_ONLY');
  assert.equal(tabular.engineeringAuthority, 'NONE');
  assert.equal(tabular.screeningAuthorized, false);
  assert.equal(tabular.qualificationMode, 'benchmark');
  assert.deepEqual(tabular.workflow, direct);
  assert.deepEqual(tabular.imports, {
    topologyFormat: 'PARSED_EXCHANGE',
    topologySourceFileName: 'plant-a-3d-edit.xlsx',
    exchangeSchema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    exchangeIntegrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED,
    operatingCaseCount: 1,
    enrichmentCount: 11,
    dataBlockerCount: 0,
    activeDataBlockerCount: 0,
  });
  assert.equal(tabular.workflow.register.rows[0].status, 'CALCULATED_BENCHMARK');
});

test('Elements-only topology CSV remains limited and requires explicit workflow opt-in', () => {
  const topologyCsv = [
    VIBRATION_TABLE_EXCHANGE_SHEETS.Elements.join(','),
    'P-100,PIPE,L-100,N-1,N-2,150,150,1200,SCH40,A106-B,P1,150,CATALOGUE,CERTIFIED,CANON-001',
  ].join('\r\n');
  const input = {
    topology: {
      format: VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.CSV_ELEMENTS_ONLY,
      data: topologyCsv,
      sourceFileName: 'plant.csv',
    },
    operatingCaseCsv: operatingCaseCsv(),
    enrichmentCsv: enrichmentCsv(),
  };
  assert.throws(
    () => runVibrationFacilityFitBenchmarkFromTables(input),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_INCOMPLETE',
  );
  const accepted = runVibrationFacilityFitBenchmarkFromTables(input, { allowLimitedExchange: true });
  assert.equal(accepted.imports.topologyFormat, 'CSV_ELEMENTS_ONLY');
  assert.equal(accepted.imports.exchangeIntegrityStatus, VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY);
  assert(accepted.workflow.warnings.dataset.some((warning) => warning.code === 'LIMITED_EXCHANGE_ACCEPTED'));
  assert.equal(accepted.screeningAuthorized, false);
});

test('unsupported topology format fails before data assembly', () => {
  assert.throws(
    () => runVibrationFacilityFitBenchmarkFromTables({
      topology: { format: 'JSON_MODEL', data: {} },
    }),
    (error) => error.code === 'FIT_FACILITY_TOPOLOGY_FORMAT_UNSUPPORTED',
  );
});

test('malformed operating-case or enrichment CSV fails before workflow calculation', () => {
  assert.throws(
    () => runVibrationFacilityFitBenchmarkFromTables({
      topology: { format: 'PARSED_EXCHANGE', data: parsedExchange() },
      operatingCaseCsv: `${VIBRATION_OPERATING_CASE_CSV_HEADER.join(',')}\n"broken`,
    }),
    (error) => error.code === 'VIBRATION_CSV_MALFORMED',
  );
  assert.throws(
    () => runVibrationFacilityFitBenchmarkFromTables({
      topology: { format: 'PARSED_EXCHANGE', data: parsedExchange() },
      enrichmentCsv: [
        VIBRATION_ENRICHMENT_CSV_HEADER.join(','),
        'CANON-001,L-100,,FIT_ASSESSMENT_POINT,yes,BOOLEAN,,VIB-REVIEW,,,,',
      ].join('\n'),
    }),
    (error) => error.code === 'VIBRATION_ENRICHMENT_INVALID_BOOLEAN',
  );
});

test('absent process/enrichment/data-blocker CSV inputs become empty arrays without defaults', () => {
  const tabular = runVibrationFacilityFitBenchmarkFromTables({
    topology: { format: 'PARSED_EXCHANGE', data: parsedExchange() },
  });
  assert.equal(tabular.imports.operatingCaseCount, 0);
  assert.equal(tabular.imports.enrichmentCount, 0);
  assert.equal(tabular.imports.dataBlockerCount, 0);
  assert.equal(tabular.imports.activeDataBlockerCount, 0);
  assert.equal(tabular.workflow.dataset.operatingCases.length, 0);
  assert.equal(tabular.workflow.dataset.enrichment.length, 0);
  assert.equal(tabular.workflow.plan.items.length, 0);
  assert.equal(tabular.workflow.register.rows.length, 0);
  assert(tabular.workflow.warnings.plan.some((warning) => warning.code === 'NO_FIT_ASSESSMENT_POINTS'));
});

test('tabular workflow cannot inject screening/design authority options', () => {
  const input = {
    topology: { format: 'PARSED_EXCHANGE', data: parsedExchange() },
    operatingCaseCsv: operatingCaseCsv(),
    enrichmentCsv: enrichmentCsv(),
  };
  assert.throws(
    () => runVibrationFacilityFitBenchmarkFromTables(input, { qualificationMode: 'screening' }),
    (error) => error.code === 'FIT_FACILITY_WORKFLOW_OPTION_UNSUPPORTED',
  );
  assert.throws(
    () => runVibrationFacilityFitBenchmarkFromTables(input, { designAuthority: true }),
    (error) => error.code === 'FIT_FACILITY_WORKFLOW_OPTION_UNSUPPORTED',
  );
});
