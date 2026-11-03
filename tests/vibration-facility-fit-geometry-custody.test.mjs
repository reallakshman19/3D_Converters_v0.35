import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleVibrationIntegrityDataset } from '../converters/vibration/dataset/index.js';
import { buildVibrationFacilityFitPlan } from '../converters/vibration/facility/index.js';
import { VIBRATION_INTEGRITY_DATASET_SCHEMA } from '../converters/vibration/dataset/schema.js';
import {
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
} from '../converters/vibration/exchange/schema.js';

function completeExchange({ catalogueEvidence, catalogueAuthority = 'PROJECT-CATALOGUE' } = {}) {
  return {
    schema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    completeExchange: true,
    integrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED,
    authority: {
      canonicalHash: 'sha256:canonical',
      projectionHash: 'sha256:projection',
      datasetId: 'plant-a',
    },
    elements: [{
      canonicalId: 'CAN-1', line: 'L-100', tag: 'P-100', type: 'PIPE',
      dnInMm: 150, dnOutMm: 150, schedule: 'STD', catalogueAuthority,
    }],
    catalogueEvidence: catalogueEvidence ?? [],
    sourceFileName: 'plant-a.xlsx',
  };
}

function catalogueRecord(overrides = {}) {
  return {
    canonicalId: 'CAN-1',
    authority: 'PROJECT-CATALOGUE',
    catalogueId: 'PIPE-CAT',
    catalogueVersion: '2026.08',
    catalogueHash: 'sha256:catalogue',
    sourceHash: 'sha256:source',
    recordId: 'PIPE:DN150:STD',
    recordHash: 'sha256:record',
    sourceReference: { path: 'catalogues/pipe.json', pointer: '/DN150/STD' },
    ...overrides,
  };
}

function m5Enrichment(wallBasis = 'NOMINAL') {
  return [
    { canonicalId: 'CAN-1', property: 'FIT_ASSESSMENT_POINT', value: true, source: 'VIB-REVIEW' },
    { canonicalId: 'CAN-1', property: 'OUTSIDE_DIAMETER', value: 168.3, unit: 'mm', source: 'PIPE-DATA' },
    { canonicalId: 'CAN-1', property: 'WALL_THICKNESS', value: 7.11, unit: 'mm', source: 'PIPE-DATA' },
    { canonicalId: 'CAN-1', property: 'WALL_BASIS', value: wallBasis, source: 'GEOM-BASIS' },
    {
      canonicalId: 'CAN-1', property: 'MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS',
      value: 6.4, unit: 'm', source: 'SUPPORT-BASIS',
    },
    {
      canonicalId: 'CAN-1', property: 'SPAN_DETERMINATION_METHOD',
      value: 'PROJECT_PIPING_STANDARD', source: 'SUPPORT-BASIS',
    },
    {
      canonicalId: 'CAN-1', property: 'SUPPORT_EVIDENCE_STATUS',
      value: 'METHOD_ACCEPTED_PROJECT_STANDARD', source: 'SUPPORT-BASIS',
    },
    {
      canonicalId: 'CAN-1', caseId: 'NORMAL', property: 'FIT_DENSITY_BASIS',
      value: 'ACTUAL', source: 'PROCESS-BASIS',
    },
    {
      canonicalId: 'CAN-1', caseId: 'NORMAL', property: 'FIT_OPERATING_SCENARIO_COHERENT',
      value: true, source: 'PROCESS-BASIS',
    },
  ];
}

function operatingCases() {
  return [{
    line: 'L-100', caseId: 'NORMAL', phase: 'LIQUID', source: 'HMB-1',
    massFlow: { value: 100, unit: 'kg/s' },
    density: { value: 900, unit: 'kg/m3' },
  }];
}

function planFromExchange(exchange, wallBasis = 'NOMINAL', options = {}) {
  const dataset = assembleVibrationIntegrityDataset({
    exchange,
    operatingCases: operatingCases(),
    enrichment: m5Enrichment(wallBasis),
  }, options);
  return { dataset, item: buildVibrationFacilityFitPlan(dataset).items[0] };
}

test('G01 dataset preserves exact exchange geometry custody needed by planning', () => {
  const record = catalogueRecord();
  const { dataset } = planFromExchange(completeExchange({ catalogueEvidence: [record] }));
  assert.equal(dataset.schema, VIBRATION_INTEGRITY_DATASET_SCHEMA);
  assert.equal(dataset.elements[0].canonicalId, 'CAN-1');
  assert.equal(dataset.elements[0].schedule, 'STD');
  assert.equal(dataset.catalogueEvidence[0].recordId, record.recordId);
  assert.deepEqual(dataset.catalogueEvidence[0].sourceReference, record.sourceReference);
});

test('G02 NOMINAL without same-id catalogue evidence is NOT_READY with no request', () => {
  const { item } = planFromExchange(completeExchange());
  assert.equal(item.status, 'NOT_READY');
  assert.equal(item.request, null);
  assert(item.missing.includes('catalogueEvidence'));
  assert(item.reasons.includes('NOMINAL_GEOMETRY_CATALOGUE_CUSTODY_REQUIRED'));
});

test('G03 incomplete nominal catalogue identity fails closed', () => {
  for (const field of ['authority', 'catalogueId', 'catalogueVersion', 'catalogueHash', 'recordId', 'recordHash']) {
    const { item } = planFromExchange(completeExchange({
      catalogueEvidence: [catalogueRecord({ [field]: '' })],
    }));
    assert.equal(item.status, 'NOT_READY', field);
    assert(item.invalid.includes(`catalogueEvidence.${field}`), field);
  }
  const { item } = planFromExchange(completeExchange({
    catalogueEvidence: [catalogueRecord({ sourceReference: null })],
  }));
  assert.equal(item.status, 'NOT_READY');
  assert(item.invalid.includes('catalogueEvidence.sourceReference'));
});

test('G04 Elements/Catalogue authority mismatch fails closed', () => {
  const { item } = planFromExchange(completeExchange({
    catalogueEvidence: [catalogueRecord({ authority: 'OTHER-CATALOGUE' })],
  }));
  assert.equal(item.status, 'NOT_READY');
  assert(item.invalid.includes('catalogueEvidence.authority'));
  assert(item.reasons.includes('NOMINAL_GEOMETRY_CATALOGUE_AUTHORITY_MISMATCH'));
});

test('G05 exact nominal catalogue custody permits existing M5 readiness without changing dimensions', () => {
  const { item } = planFromExchange(completeExchange({ catalogueEvidence: [catalogueRecord()] }));
  assert.equal(item.status, 'READY', JSON.stringify(item));
  assert.equal(item.request.inputs.outsideDiameter, 168.3);
  assert.equal(item.request.inputs.wallThickness, 7.11);
  assert.equal(item.engineeringBasis.geometry.catalogueRecordId, 'PIPE:DN150:STD');
  assert.equal(item.engineeringBasis.geometry.nominalDescriptor.schedule, 'STD');
  assert.equal(item.engineeringBasis.authority.designAuthority, false);
});

test('G06 limited Elements-only exchange cannot establish NOMINAL catalogue custody', () => {
  const exchange = {
    ...completeExchange(),
    completeExchange: false,
    integrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY,
  };
  const { item } = planFromExchange(exchange, 'NOMINAL', { allowLimitedExchange: true });
  assert.equal(item.status, 'NOT_READY');
  assert.equal(item.request, null);
  assert(item.reasons.includes('NOMINAL_GEOMETRY_COMPLETE_EXCHANGE_REQUIRED'));
});

test('G07 DN and schedule remain descriptors and never populate or modify explicit dimensions', () => {
  const exchange = completeExchange({ catalogueEvidence: [catalogueRecord()] });
  exchange.elements[0].dnInMm = 999;
  exchange.elements[0].dnOutMm = 998;
  exchange.elements[0].schedule = 'SCH999';
  const { item } = planFromExchange(exchange);
  assert.equal(item.status, 'READY', JSON.stringify(item));
  assert.equal(item.request.inputs.outsideDiameter, 168.3);
  assert.equal(item.request.inputs.wallThickness, 7.11);
  assert.equal(item.engineeringBasis.geometry.nominalDescriptor.schedule, 'SCH999');
});

test('G08 non-NOMINAL wall basis does not silently acquire catalogue authority', () => {
  const { item } = planFromExchange(completeExchange({ catalogueEvidence: [catalogueRecord()] }), 'AS_BUILT');
  assert.equal(item.status, 'READY', JSON.stringify(item));
  assert.equal(item.engineeringBasis.geometry.catalogueRecordId, null);
  assert.equal(item.engineeringBasis.geometry.catalogueAuthority, null);
  assert.equal(item.engineeringBasis.geometry.nominalDescriptor, null);
});
