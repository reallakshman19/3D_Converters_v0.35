import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleVibrationIntegrityDataset } from '../converters/vibration/dataset/index.js';
import {
  VIBRATION_ENRICHMENT_CSV_HEADER,
  VIBRATION_OPERATING_CASE_CSV_HEADER,
  parseStrictVibrationCsvRows,
  parseVibrationEnrichmentCsv,
  parseVibrationOperatingCaseCsv,
} from '../converters/vibration/tabular/index.js';
import {
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
} from '../converters/vibration/exchange/schema.js';

function completeExchange() {
  return Object.freeze({
    schema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    completeExchange: true,
    integrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED,
    authority: Object.freeze({ canonicalHash: 'sha256:c', projectionHash: 'sha256:p' }),
    elements: Object.freeze([
      Object.freeze({ canonicalId: 'CANON-001', line: 'L-100', tag: 'P-100' }),
      Object.freeze({ canonicalId: 'CANON-002', line: 'L-200', tag: 'P-200' }),
    ]),
  });
}

function operatingCsv(rows) {
  return [VIBRATION_OPERATING_CASE_CSV_HEADER.join(','), ...rows].join('\r\n');
}

function enrichmentCsv(rows) {
  return [VIBRATION_ENRICHMENT_CSV_HEADER.join(','), ...rows].join('\n');
}

test('strict CSV tokenizer handles BOM, quoted commas, escaped quotes and CRLF', () => {
  const csv = '\uFEFFA,B,C\r\n"x,y","a""b",z\r\n';
  assert.deepEqual(parseStrictVibrationCsvRows(csv), [
    ['A', 'B', 'C'],
    ['x,y', 'a"b', 'z'],
  ]);
});

test('strict CSV tokenizer rejects unmatched quotes and text after a closed quote', () => {
  assert.throws(
    () => parseStrictVibrationCsvRows('A,B\n"x,y'),
    (error) => error.code === 'VIBRATION_CSV_MALFORMED',
  );
  assert.throws(
    () => parseStrictVibrationCsvRows('A,B\n"x"junk,y'),
    (error) => error.code === 'VIBRATION_CSV_MALFORMED',
  );
});

test('operating-case CSV preserves explicit quantities, units, pressure reference and provenance', () => {
  const csv = operatingCsv([
    'L-100,NORMAL,"Normal, summer",GAS,20000,kg/h,8.1,kg/m3,64,barg,gauge,75,C,0.019,cP,,,HMB-100,C,HMB-REC-1',
    'L-200,NORMAL,,LIQUID,110,kg/s,980,kg/m3,,,,,,,,,,HMB-200,,',
  ]);
  const rows = parseVibrationOperatingCaseCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    line: 'L-100',
    caseId: 'NORMAL',
    source: 'HMB-100',
    label: 'Normal, summer',
    phase: 'GAS',
    sourceRevision: 'C',
    recordId: 'HMB-REC-1',
    massFlow: { value: 20000, unit: 'kg/h' },
    density: { value: 8.1, unit: 'kg/m3' },
    pressure: { value: 64, unit: 'barg', reference: 'gauge' },
    temperature: { value: 75, unit: 'C' },
    dynamicViscosity: { value: 0.019, unit: 'cP' },
  });
  assert.deepEqual(rows[1].massFlow, { value: 110, unit: 'kg/s' });
  assert.equal(Object.hasOwn(rows[1], 'pressure'), false);
  assert(Object.isFrozen(rows));
});

test('operating-case CSV requires exact header and paired value/unit cells', () => {
  const wrongHeader = [...VIBRATION_OPERATING_CASE_CSV_HEADER];
  wrongHeader[1] = 'Case';
  assert.throws(
    () => parseVibrationOperatingCaseCsv(`${wrongHeader.join(',')}\n`),
    (error) => error.code === 'VIBRATION_CSV_HEADER_MISMATCH',
  );

  assert.throws(
    () => parseVibrationOperatingCaseCsv(operatingCsv([
      'L-100,NORMAL,,GAS,20000,,8.1,kg/m3,,,,,,0.019,cP,,,HMB-100,,',
    ])),
    (error) => error.code === 'VIBRATION_OPERATING_CASE_QUANTITY_PAIR_REQUIRED',
  );
  assert.throws(
    () => parseVibrationOperatingCaseCsv(operatingCsv([
      'L-100,NORMAL,,GAS,not-a-number,kg/h,8.1,kg/m3,,,,,,0.019,cP,,,HMB-100,,',
    ])),
    (error) => error.code === 'VIBRATION_OPERATING_CASE_INVALID_NUMBER',
  );
});

test('pressure reference without pressure value/unit fails closed', () => {
  assert.throws(
    () => parseVibrationOperatingCaseCsv(operatingCsv([
      'L-100,NORMAL,,GAS,,,,,, ,gauge,,,,,,,HMB-100,,',
    ])),
    (error) => error.code === 'VIBRATION_OPERATING_CASE_QUANTITY_PAIR_REQUIRED',
  );
});

test('enrichment CSV parses explicit NUMBER, BOOLEAN and STRING scalar types', () => {
  const csv = enrichmentCsv([
    'CANON-001,L-100,,OUTSIDE_DIAMETER,168.3,NUMBER,mm,PIPE-DATA,A,REC-1,VERIFIED,eng-a',
    'CANON-001,L-100,,FIT_ASSESSMENT_POINT,TRUE,BOOLEAN,,VIB-REVIEW,,REC-2,VERIFIED,eng-b',
    'CANON-001,L-100,NORMAL,SUPPORT_EFFECTIVENESS,"Effective, verified",STRING,,FIELD-01,,REC-3,VERIFIED,eng-c',
  ]);
  const rows = parseVibrationEnrichmentCsv(csv);
  assert.equal(rows[0].value, 168.3);
  assert.equal(rows[0].unit, 'mm');
  assert.equal(rows[1].value, true);
  assert.equal(Object.hasOwn(rows[1], 'unit'), false);
  assert.equal(rows[2].value, 'Effective, verified');
  assert.equal(rows[2].caseId, 'NORMAL');
  assert(Object.isFrozen(rows));
});

test('enrichment CSV never guesses scalar type and rejects invalid typed values', () => {
  assert.throws(
    () => parseVibrationEnrichmentCsv(enrichmentCsv([
      'CANON-001,L-100,,FIT_ASSESSMENT_POINT,true,BOOL,,VIB-REVIEW,,,,',
    ])),
    (error) => error.code === 'VIBRATION_ENRICHMENT_VALUE_TYPE_UNSUPPORTED',
  );
  assert.throws(
    () => parseVibrationEnrichmentCsv(enrichmentCsv([
      'CANON-001,L-100,,OUTSIDE_DIAMETER,abc,NUMBER,mm,PIPE-DATA,,,,',
    ])),
    (error) => error.code === 'VIBRATION_ENRICHMENT_INVALID_NUMBER',
  );
  assert.throws(
    () => parseVibrationEnrichmentCsv(enrichmentCsv([
      'CANON-001,L-100,,FIT_ASSESSMENT_POINT,yes,BOOLEAN,,VIB-REVIEW,,,,',
    ])),
    (error) => error.code === 'VIBRATION_ENRICHMENT_INVALID_BOOLEAN',
  );
});

test('STRING enrichment preserves scalar text instead of converting numeric-looking identifiers', () => {
  const rows = parseVibrationEnrichmentCsv(enrichmentCsv([
    'CANON-001,L-100,,EXTERNAL_REFERENCE,00123,STRING,,DOC-INDEX,,,,',
  ]));
  assert.equal(rows[0].value, '00123');
  assert.equal(typeof rows[0].value, 'string');
});

test('parsed operating cases and enrichment feed VibrationIntegrityDataset without translation glue', () => {
  const operatingCases = parseVibrationOperatingCaseCsv(operatingCsv([
    'L-100,NORMAL,,GAS,20000,kg/h,8.1,kg/m3,,,,,,0.019,cP,,,HMB-100,C,HMB-1',
    'L-200,NORMAL,,LIQUID,110,kg/s,980,kg/m3,,,,,,,,,,HMB-200,,HMB-2',
  ]));
  const enrichment = parseVibrationEnrichmentCsv(enrichmentCsv([
    'CANON-001,L-100,,FIT_ASSESSMENT_POINT,true,BOOLEAN,,VIB-REVIEW,,VIB-1,VERIFIED,eng-a',
    'CANON-001,L-100,,MAX_UNSUPPORTED_SPAN,5.8,NUMBER,m,FIELD-01,,VIB-2,VERIFIED,eng-a',
    'CANON-002,L-200,,FIELD_VERIFIED,true,BOOLEAN,,FIELD-02,,VIB-3,VERIFIED,eng-b',
  ]));
  const dataset = assembleVibrationIntegrityDataset({
    exchange: completeExchange(), operatingCases, enrichment,
  });
  assert.equal(dataset.operatingCases.length, 2);
  assert.equal(dataset.enrichment.length, 3);
  assert.equal(dataset.operatingCases[0].source, 'HMB-100');
  assert.equal(dataset.enrichment[1].value, 5.8);
  assert.equal(dataset.engineeringAuthority, 'NONE');
  assert.equal(dataset.screeningAuthorized, false);
});
