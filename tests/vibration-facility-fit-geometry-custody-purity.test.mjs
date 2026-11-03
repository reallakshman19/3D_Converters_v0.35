import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleVibrationIntegrityDataset } from '../converters/vibration/dataset/index.js';

function mutableExchange() {
  return {
    schema: 'VibrationTableExchange.v1',
    sourceFormat: 'XLSX',
    completeExchange: true,
    integrityStatus: 'DECLARED_NOT_REVERIFIED',
    authority: {
      canonicalHash: 'sha256:canonical',
      projectionHash: 'sha256:projection',
      datasetId: 'plant-a',
    },
    elements: [{
      canonicalId: 'CAN-1', line: 'L-100', tag: 'P-100', type: 'PIPE',
      dnInMm: 150, dnOutMm: 150, schedule: 'STD', catalogueAuthority: 'PROJECT-CATALOGUE',
    }],
    catalogueEvidence: [{
      canonicalId: 'CAN-1', authority: 'PROJECT-CATALOGUE',
      catalogueId: 'PIPE-CAT', catalogueVersion: '2026.08', catalogueHash: 'sha256:catalogue',
      sourceHash: 'sha256:source', recordId: 'PIPE:DN150:STD', recordHash: 'sha256:record',
      sourceReference: { path: 'catalogues/pipe.json', pointer: '/DN150/STD' },
    }],
  };
}

test('M5 geometry custody deep-freezes dataset copies without freezing caller exchange objects', () => {
  const exchange = mutableExchange();
  const element = exchange.elements[0];
  const evidence = exchange.catalogueEvidence[0];
  const sourceReference = evidence.sourceReference;
  const authority = exchange.authority;

  const dataset = assembleVibrationIntegrityDataset({ exchange });

  assert.equal(Object.isFrozen(dataset), true);
  assert.equal(Object.isFrozen(dataset.elements[0]), true);
  assert.equal(Object.isFrozen(dataset.catalogueEvidence[0]), true);
  assert.equal(Object.isFrozen(dataset.catalogueEvidence[0].sourceReference), true);
  assert.equal(Object.isFrozen(dataset.exchangeAuthority), true);

  assert.notEqual(dataset.elements[0], element);
  assert.notEqual(dataset.catalogueEvidence[0], evidence);
  assert.notEqual(dataset.catalogueEvidence[0].sourceReference, sourceReference);
  assert.notEqual(dataset.exchangeAuthority, authority);

  assert.equal(Object.isFrozen(element), false);
  assert.equal(Object.isFrozen(evidence), false);
  assert.equal(Object.isFrozen(sourceReference), false);
  assert.equal(Object.isFrozen(authority), false);
});
