import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFitFacilityGeometryCustodyIndex,
  fitFacilityGeometryCustodyRecord,
  resolveFitFacilityGeometryCustody,
} from '../converters/vibration/facility/fit-geometry-custody.js';

function record(canonicalId) {
  return {
    canonicalId,
    authority: 'CAT', catalogueId: 'PIPE', catalogueVersion: '1',
    catalogueHash: 'sha256:cat', recordId: `REC:${canonicalId}`, recordHash: 'sha256:record',
    sourceReference: { row: canonicalId },
  };
}

function custody(dataset, canonicalId = 'CAN-1') {
  const index = buildFitFacilityGeometryCustodyIndex(dataset);
  return fitFacilityGeometryCustodyRecord(index, canonicalId);
}

test('catalogue evidence for another Canonical ID cannot satisfy NOMINAL custody', () => {
  const value = custody({
    exchangeComplete: true,
    exchangeIntegrityStatus: 'DECLARED_NOT_REVERIFIED',
    elements: [{ canonicalId: 'CAN-1', catalogueAuthority: 'CAT' }],
    catalogueEvidence: [record('CAN-2')],
  });
  const result = resolveFitFacilityGeometryCustody({ wallBasis: 'NOMINAL', custody: value });
  assert.equal(result.state, 'NOT_READY');
  assert(result.missing.includes('catalogueEvidence'));
});

test('Canonical ID matching is exact and does not trim a different source identity into scope', () => {
  const value = custody({
    exchangeComplete: true,
    exchangeIntegrityStatus: 'DECLARED_NOT_REVERIFIED',
    elements: [{ canonicalId: 'CAN-1', catalogueAuthority: 'CAT' }],
    catalogueEvidence: [record(' CAN-1 ')],
  });
  const result = resolveFitFacilityGeometryCustody({ wallBasis: 'NOMINAL', custody: value });
  assert.equal(result.state, 'NOT_READY');
  assert(result.missing.includes('catalogueEvidence'));
});
