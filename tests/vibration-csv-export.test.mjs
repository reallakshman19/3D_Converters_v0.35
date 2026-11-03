import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVibrationEnrichmentCsvTemplate,
  createVibrationOperatingCaseCsvTemplate,
  parseStrictVibrationCsvRows,
  parseVibrationEnrichmentCsv,
  parseVibrationOperatingCaseCsv,
  serializeVibrationCsvRows,
} from '../converters/vibration/tabular/index.js';
import {
  VIBRATION_FACILITY_FIT_REGISTER_CSV_HEADER,
  serializeVibrationFacilityFitRegisterCsv,
} from '../converters/vibration/facility/fit-register-export.js';

function register() {
  return {
    schema: 'VibrationFacilityFitRegister.v1',
    authority: 'READ_PROJECTION_ONLY',
    engineeringAuthority: 'NONE',
    screeningAuthorized: false,
    rows: [
      {
        canonicalId: 'CANON-001', line: 'L-100', caseId: 'NORMAL',
        status: 'CALCULATED_BENCHMARK', completenessStatus: 'CALCULATED',
        standardLof: 0.276, refinedLof: null, governingReferenceLof: 0.276,
        referenceBand: 'LOF_LT_0_3', assessmentStatus: 'REFERENCE_BELOW_THRESHOLD',
        qualificationState: 'BENCHMARK_ONLY', benchmarkAuthority: 'WORKBOOK_REFERENCE_ONLY',
        engineeringAuthority: 'NONE', screeningAuthorized: false,
        phaseEvidenceStrength: 'EI_PUBLISHED_EXAMPLE',
        correlationEvidenceStrength: 'EI_PUBLISHED_EXAMPLE', advancedEvidenceStrength: null,
        candidateForEngineeringReview: true, screeningCandidateStatus: 'CANDIDATE_STANDARD_SLICE',
        continuationRequired: false, missing: [], invalid: [], errorCodes: [],
        assessmentPointSource: 'VIB-REVIEW', operatingCaseSource: 'HMB-100',
      },
      {
        canonicalId: 'CANON-002', line: 'L-100', caseId: 'DESIGN',
        status: 'NOT_ASSESSED_DATA_INCOMPLETE', completenessStatus: 'DATA_INCOMPLETE',
        standardLof: null, refinedLof: null, governingReferenceLof: null,
        referenceBand: null, assessmentStatus: null, qualificationState: null,
        benchmarkAuthority: null, engineeringAuthority: 'NONE', screeningAuthorized: false,
        phaseEvidenceStrength: null, correlationEvidenceStrength: null, advancedEvidenceStrength: null,
        candidateForEngineeringReview: false, screeningCandidateStatus: null,
        continuationRequired: null, missing: ['maximumUnsupportedSpan', 'density'], invalid: [], errorCodes: [],
        assessmentPointSource: 'VIB-REVIEW, field', operatingCaseSource: 'HMB-100',
      },
    ],
  };
}

test('CSV serializer round-trips commas, quotes, newlines, booleans and blanks deterministically', () => {
  const rows = [
    ['A', 'B', 'C', 'D', 'E'],
    ['x,y', 'a"b', 'line1\nline2', true, null],
    ['plain', 12.5, false, undefined, ''],
  ];
  const csv = serializeVibrationCsvRows(rows);
  assert.equal(csv, 'A,B,C,D,E\r\n"x,y","a""b","line1\nline2",true,\r\nplain,12.5,false,,\r\n');
  assert.deepEqual(parseStrictVibrationCsvRows(csv), [
    ['A', 'B', 'C', 'D', 'E'],
    ['x,y', 'a"b', 'line1\nline2', 'true', ''],
    ['plain', '12.5', 'false', '', ''],
  ]);
  assert.equal(serializeVibrationCsvRows(rows), csv);
});

test('CSV serializer rejects non-finite numbers, objects and unsupported line endings', () => {
  assert.throws(
    () => serializeVibrationCsvRows([[Number.NaN]]),
    (error) => error.code === 'VIBRATION_CSV_INVALID_SCALAR',
  );
  assert.throws(
    () => serializeVibrationCsvRows([[{ value: 1 }]]),
    (error) => error.code === 'VIBRATION_CSV_INVALID_SCALAR',
  );
  assert.throws(
    () => serializeVibrationCsvRows([['A']], { lineEnding: '\r' }),
    (error) => error.code === 'VIBRATION_CSV_LINE_ENDING_UNSUPPORTED',
  );
});

test('input templates are header-only by default and exactly parseable', () => {
  const operating = createVibrationOperatingCaseCsvTemplate();
  const enrichment = createVibrationEnrichmentCsvTemplate();
  assert.equal(parseVibrationOperatingCaseCsv(operating).length, 0);
  assert.equal(parseVibrationEnrichmentCsv(enrichment).length, 0);
  assert.equal(parseStrictVibrationCsvRows(operating).length, 1);
  assert.equal(parseStrictVibrationCsvRows(enrichment).length, 1);
});

test('optional template examples are unmistakable sample-only rows and still obey parser contracts', () => {
  const operating = parseVibrationOperatingCaseCsv(
    createVibrationOperatingCaseCsvTemplate({ includeExample: true }),
  );
  assert.equal(operating.length, 1);
  assert.equal(operating[0].line, 'SAMPLE_LINE_DO_NOT_USE');
  assert.equal(operating[0].source, 'SAMPLE_ONLY_NOT_PROJECT_DATA');
  assert.equal(operating[0].massFlow.unit, 'kg/h');

  const enrichment = parseVibrationEnrichmentCsv(
    createVibrationEnrichmentCsvTemplate({ includeExample: true }),
  );
  assert.equal(enrichment.length, 1);
  assert.equal(enrichment[0].canonicalId, 'SAMPLE_CANONICAL_ID_DO_NOT_USE');
  assert.equal(enrichment[0].source, 'SAMPLE_ONLY_NOT_PROJECT_DATA');
  assert.equal(enrichment[0].value, true);
});

test('facility register CSV preserves row order, benchmark/evidence state and blank non-calculated LOF cells', () => {
  const csv = serializeVibrationFacilityFitRegisterCsv(register());
  const rows = parseStrictVibrationCsvRows(csv);
  assert.deepEqual(rows[0], [...VIBRATION_FACILITY_FIT_REGISTER_CSV_HEADER]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], 'L-100');
  assert.equal(rows[1][2], 'CANON-001');
  assert.equal(rows[1][5], '0.276');
  assert.equal(rows[1][10], 'BENCHMARK_ONLY');
  assert.equal(rows[1][15], 'EI_PUBLISHED_EXAMPLE');
  assert.equal(rows[1][17], 'true');
  assert.equal(rows[2][2], 'CANON-002');
  assert.equal(rows[2][4], 'DATA_INCOMPLETE');
  assert.equal(rows[2][5], '');
  assert.equal(rows[2][6], '');
  assert.equal(rows[2][7], '');
  assert.equal(rows[2][20], 'maximumUnsupportedSpan; density');
  assert.equal(rows[2][23], 'VIB-REVIEW, field');
  assert.match(csv, /"VIB-REVIEW, field"/u);
});

test('facility register export contains authority/evidence columns and no pass/safe/universal-score columns', () => {
  const forbidden = ['Pass', 'Safe', 'Risk Score', 'Vibration Score', 'Facility Score'];
  for (const name of forbidden) assert.equal(VIBRATION_FACILITY_FIT_REGISTER_CSV_HEADER.includes(name), false, name);
  for (const required of [
    'Qualification', 'Benchmark Authority', 'Engineering Authority', 'Screening Authorized',
    'Phase Evidence', 'Correlation Evidence', 'Candidate For Engineering Review',
  ]) {
    assert(VIBRATION_FACILITY_FIT_REGISTER_CSV_HEADER.includes(required), required);
  }
});

test('facility register export rejects wrong source schema', () => {
  assert.throws(
    () => serializeVibrationFacilityFitRegisterCsv({ schema: 'Other.v1', rows: [] }),
    (error) => error.code === 'FIT_FACILITY_REGISTER_SCHEMA_MISMATCH',
  );
});
