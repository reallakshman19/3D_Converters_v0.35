import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_INTEGRITY_DATASET_AUTHORITY,
  VIBRATION_INTEGRITY_DATASET_SCHEMA,
  assembleVibrationIntegrityDataset,
} from '../converters/vibration/dataset/index.js';
import {
  VIBRATION_TABLE_EXCHANGE_INTEGRITY,
  VIBRATION_TABLE_EXCHANGE_SCHEMA,
} from '../converters/vibration/exchange/schema.js';

function completeExchange(elements = [
  { canonicalId: 'CANON-001', line: 'L-100', tag: 'P-100', type: 'PIPE' },
  { canonicalId: 'CANON-002', line: 'L-100', tag: 'EL-200', type: 'ELBOW' },
  { canonicalId: 'CANON-003', line: 'L-200', tag: 'P-300', type: 'PIPE' },
  { canonicalId: 'CANON-004', line: null, tag: 'U-400', type: 'UNKNOWN' },
]) {
  return Object.freeze({
    schema: VIBRATION_TABLE_EXCHANGE_SCHEMA,
    completeExchange: true,
    integrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.DECLARED_NOT_REVERIFIED,
    authority: Object.freeze({
      canonicalHash: 'sha256:canonical',
      projectionHash: 'sha256:projection',
      sourceHash: 'sha256:source',
      datasetId: 'plant-a',
      datasetVersion: 'rev-4',
    }),
    sourceFileName: 'plant-a-3d-edit.xlsx',
    elements: Object.freeze(elements.map((row) => Object.freeze({ ...row }))),
  });
}

function operatingCases() {
  return [
    {
      caseId: 'DESIGN',
      line: 'L-100',
      label: 'Design case',
      phase: 'GAS',
      source: 'HMB-100',
      sourceRevision: 'C',
      recordId: 'HMB-100-L100-DESIGN',
      massFlow: { value: 25000, unit: 'kg/h' },
      density: { value: 7.4, unit: 'kg/m3' },
      pressure: { value: 64, unit: 'barg', reference: 'gauge' },
      temperature: { value: 75, unit: 'C' },
      dynamicViscosity: { value: 0.02, unit: 'cP' },
    },
    {
      caseId: 'NORMAL',
      line: 'L-100',
      phase: 'GAS',
      source: 'HMB-100',
      sourceRevision: 'C',
      massFlow: { value: 20000, unit: 'kg/h' },
      density: { value: 8.1, unit: 'kg/m3' },
      dynamicViscosity: { value: 0.019, unit: 'cP' },
    },
    {
      caseId: 'NORMAL',
      line: 'L-200',
      phase: 'LIQUID',
      source: 'HMB-200',
      massFlow: { value: 110, unit: 'kg/s' },
      density: { value: 980, unit: 'kg/m3' },
    },
  ];
}

function enrichment() {
  return [
    {
      canonicalId: 'CANON-001',
      line: 'L-100',
      property: 'MAX_UNSUPPORTED_SPAN',
      value: 5.8,
      unit: 'm',
      source: 'FIELD-VERIFY-01',
      status: 'VERIFIED',
      reviewer: 'engineer-a',
    },
    {
      canonicalId: 'CANON-001',
      line: 'L-100',
      caseId: 'NORMAL',
      property: 'SUPPORT_EFFECTIVENESS',
      value: 'EFFECTIVE',
      source: 'FIELD-VERIFY-01',
      status: 'VERIFIED',
    },
    {
      canonicalId: 'CANON-003',
      property: 'MAX_UNSUPPORTED_SPAN',
      value: 12.2,
      unit: 'm',
      source: 'DRAWING-L200',
      sourceRevision: 'B',
    },
  ];
}

function assemble(overrides = {}, options = {}) {
  return assembleVibrationIntegrityDataset({
    exchange: overrides.exchange ?? completeExchange(),
    operatingCases: overrides.operatingCases ?? operatingCases(),
    enrichment: overrides.enrichment ?? enrichment(),
  }, options);
}

test('dataset assembly preserves identities, explicit quantities and non-authority', () => {
  const dataset = assemble();
  assert.equal(dataset.schema, VIBRATION_INTEGRITY_DATASET_SCHEMA);
  assert.equal(dataset.authority, VIBRATION_INTEGRITY_DATASET_AUTHORITY);
  assert.equal(dataset.engineeringAuthority, 'NONE');
  assert.equal(dataset.screeningAuthorized, false);
  assert.equal(dataset.exchangeAuthority.datasetId, 'plant-a');
  assert.equal(dataset.sourceFileName, 'plant-a-3d-edit.xlsx');
  assert.deepEqual(dataset.counts, { elements: 4, lines: 2, operatingCases: 3, enrichment: 3 });
  assert.deepEqual(dataset.lines.map((row) => row.line), ['L-100', 'L-200']);
  assert.deepEqual(dataset.lines[0].elementCanonicalIds, ['CANON-001', 'CANON-002']);
  assert.deepEqual(dataset.lines[0].operatingCases.map((row) => row.caseId), ['DESIGN', 'NORMAL']);
  assert.equal(dataset.lines[0].operatingCases[0].massFlow.unit, 'kg/h');
  assert.equal(dataset.lines[0].operatingCases[0].pressure.reference, 'gauge');
  assert.equal(Object.hasOwn(dataset.lines[1].operatingCases[0], 'pressure'), false);
  assert.deepEqual(dataset.unassignedElementCanonicalIds, ['CANON-004']);
  assert(dataset.warnings.some((warning) => warning.code === 'ELEMENTS_WITHOUT_LINE'));
  assert(Object.isFrozen(dataset));
  assert(Object.isFrozen(dataset.operatingCases));
  assert(Object.isFrozen(dataset.operatingCases[0].massFlow));
});

test('assembly is deterministic when source arrays arrive in different order', () => {
  const first = assemble();
  const second = assemble({
    exchange: completeExchange([...completeExchange().elements].reverse()),
    operatingCases: [...operatingCases()].reverse(),
    enrichment: [...enrichment()].reverse(),
  });
  assert.deepEqual(second, first);
});

test('operating cases fail closed on orphan lines and duplicate line/case identities', () => {
  assert.throws(
    () => assemble({ operatingCases: [...operatingCases(), { caseId: 'NORMAL', line: 'L-999', source: 'HMB' }] }),
    (error) => error.code === 'VIBRATION_DATASET_ORPHAN_OPERATING_CASE',
  );
  assert.throws(
    () => assemble({ operatingCases: [...operatingCases(), { caseId: 'NORMAL', line: 'L-100', source: 'OTHER' }] }),
    (error) => error.code === 'VIBRATION_DATASET_DUPLICATE_OPERATING_CASE',
  );
});

test('operating quantities require finite values and explicit units with no unknown fields', () => {
  assert.throws(
    () => assemble({
      operatingCases: [{
        caseId: 'NORMAL', line: 'L-100', source: 'HMB',
        density: { value: 8.1, unit: '' },
      }],
    }),
    (error) => error.code === 'VIBRATION_DATASET_REQUIRED_VALUE',
  );
  assert.throws(
    () => assemble({
      operatingCases: [{
        caseId: 'NORMAL', line: 'L-100', source: 'HMB',
        massFlow: { value: Number.NaN, unit: 'kg/s' },
      }],
    }),
    (error) => error.code === 'VIBRATION_DATASET_INVALID_QUANTITY',
  );
  assert.throws(
    () => assemble({
      operatingCases: [{ caseId: 'NORMAL', line: 'L-100', source: 'HMB', silentDefault: 42 }],
    }),
    (error) => error.code === 'VIBRATION_DATASET_UNKNOWN_FIELD',
  );
});

test('enrichment fails closed on orphan Canonical ID, line mismatch and case mismatch', () => {
  assert.throws(
    () => assemble({
      enrichment: [{ canonicalId: 'CANON-999', property: 'MAX_UNSUPPORTED_SPAN', value: 5, unit: 'm', source: 'FIELD' }],
    }),
    (error) => error.code === 'VIBRATION_DATASET_ORPHAN_ENRICHMENT',
  );
  assert.throws(
    () => assemble({
      enrichment: [{ canonicalId: 'CANON-001', line: 'L-200', property: 'MAX_UNSUPPORTED_SPAN', value: 5, unit: 'm', source: 'FIELD' }],
    }),
    (error) => error.code === 'VIBRATION_DATASET_ENRICHMENT_LINE_MISMATCH',
  );
  assert.throws(
    () => assemble({
      enrichment: [{ canonicalId: 'CANON-001', caseId: 'STARTUP', property: 'MAX_UNSUPPORTED_SPAN', value: 5, unit: 'm', source: 'FIELD' }],
    }),
    (error) => error.code === 'VIBRATION_DATASET_ENRICHMENT_CASE_MISMATCH',
  );
});

test('duplicate element/case/property enrichment is rejected', () => {
  const row = {
    canonicalId: 'CANON-001',
    caseId: 'NORMAL',
    property: 'SUPPORT_EFFECTIVENESS',
    value: 'EFFECTIVE',
    source: 'FIELD',
  };
  assert.throws(
    () => assemble({ enrichment: [row, { ...row, source: 'SECOND-SOURCE' }] }),
    (error) => error.code === 'VIBRATION_DATASET_DUPLICATE_ENRICHMENT',
  );
});

test('lines without operating cases and elements without line remain explicit warnings', () => {
  const dataset = assemble({
    operatingCases: operatingCases().filter((row) => row.line === 'L-100'),
  });
  const noCases = dataset.warnings.find((warning) => warning.code === 'LINES_WITHOUT_OPERATING_CASES');
  assert(noCases);
  assert.deepEqual(noCases.details.lines, ['L-200']);
  assert(dataset.warnings.some((warning) => warning.code === 'ELEMENTS_WITHOUT_LINE'));
});

test('limited Elements-only exchange is rejected by default and accepted only by explicit option', () => {
  const limited = {
    ...completeExchange(),
    completeExchange: false,
    integrityStatus: VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY,
    authority: Object.freeze({}),
  };
  assert.throws(
    () => assemble({ exchange: limited }),
    (error) => error.code === 'VIBRATION_TABLE_EXCHANGE_INCOMPLETE',
  );
  const dataset = assemble({ exchange: limited }, { allowLimitedExchange: true });
  assert.equal(dataset.exchangeIntegrityStatus, VIBRATION_TABLE_EXCHANGE_INTEGRITY.LIMITED_ELEMENTS_ONLY);
  assert(dataset.warnings.some((warning) => warning.code === 'LIMITED_EXCHANGE_ACCEPTED'));
  assert.equal(dataset.screeningAuthorized, false);
});

test('enrichment values remain primitive evidence and no engineering defaults are introduced', () => {
  const dataset = assemble({
    operatingCases: [{ caseId: 'NORMAL', line: 'L-100', source: 'HMB' }],
    enrichment: [{ canonicalId: 'CANON-001', property: 'FIELD_VERIFIED', value: true, source: 'INSPECTION' }],
  });
  const process = dataset.operatingCases[0];
  for (const quantity of ['massFlow', 'density', 'pressure', 'temperature', 'dynamicViscosity', 'velocity']) {
    assert.equal(Object.hasOwn(process, quantity), false, quantity);
  }
  assert.equal(dataset.enrichment[0].value, true);
  assert.equal(Object.hasOwn(dataset.enrichment[0], 'unit'), false);
});
