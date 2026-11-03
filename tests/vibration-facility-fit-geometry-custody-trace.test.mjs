import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleVibrationIntegrityDataset } from '../converters/vibration/dataset/index.js';
import { buildVibrationFacilityFitPlan } from '../converters/vibration/facility/index.js';

function source() {
  return {
    exchange: {
      schema: 'VibrationTableExchange.v1',
      completeExchange: true,
      integrityStatus: 'DECLARED_NOT_REVERIFIED',
      authority: { canonicalHash: 'sha256:canonical', projectionHash: 'sha256:projection' },
      elements: [{
        canonicalId: 'CAN-1', line: 'L-1', tag: 'P-1', type: 'PIPE',
        dnInMm: 150, dnOutMm: 150, schedule: 'STD', catalogueAuthority: 'CAT-A',
      }],
      catalogueEvidence: [{
        canonicalId: 'CAN-1', authority: 'CAT-A', catalogueId: 'PIPE', catalogueVersion: '1',
        catalogueHash: 'sha256:cat', sourceHash: 'sha256:source', recordId: 'REC-1',
        recordHash: 'sha256:record', sourceReference: { file: 'pipe-catalogue.json', row: 12 },
      }],
    },
    operatingCases: [{
      line: 'L-1', caseId: 'NORMAL', phase: 'LIQUID', source: 'HMB',
      massFlow: { value: 10, unit: 'kg/s' }, density: { value: 900, unit: 'kg/m3' },
    }],
    enrichment: [
      { canonicalId: 'CAN-1', property: 'FIT_ASSESSMENT_POINT', value: true, source: 'VIB' },
      { canonicalId: 'CAN-1', property: 'OUTSIDE_DIAMETER', value: 168.3, unit: 'mm', source: 'DIM' },
      { canonicalId: 'CAN-1', property: 'WALL_THICKNESS', value: 7.11, unit: 'mm', source: 'DIM' },
      { canonicalId: 'CAN-1', property: 'WALL_BASIS', value: 'NOMINAL', source: 'DIM-BASIS' },
      {
        canonicalId: 'CAN-1', property: 'MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS',
        value: 6.4, unit: 'm', source: 'SPAN',
      },
      {
        canonicalId: 'CAN-1', property: 'SPAN_DETERMINATION_METHOD',
        value: 'PROJECT_PIPING_STANDARD', source: 'SPAN',
      },
      {
        canonicalId: 'CAN-1', property: 'SUPPORT_EVIDENCE_STATUS',
        value: 'METHOD_ACCEPTED_PROJECT_STANDARD', source: 'SPAN',
      },
      {
        canonicalId: 'CAN-1', caseId: 'NORMAL', property: 'FIT_DENSITY_BASIS',
        value: 'ACTUAL', source: 'HMB',
      },
      {
        canonicalId: 'CAN-1', caseId: 'NORMAL', property: 'FIT_OPERATING_SCENARIO_COHERENT',
        value: true, source: 'HMB',
      },
    ],
  };
}

function readyItem() {
  const dataset = assembleVibrationIntegrityDataset(source());
  return buildVibrationFacilityFitPlan(dataset).items[0];
}

test('G09 planner trace exposes exact catalogue record/source identity without authority promotion', () => {
  const item = readyItem();
  assert.equal(item.status, 'READY', JSON.stringify(item));
  assert.equal(item.engineeringBasis.geometry.geometrySource, 'VIBRATION_TABLE_EXCHANGE_CATALOGUE_EVIDENCE');
  assert.equal(item.engineeringBasis.geometry.catalogueRecordId, 'REC-1');
  assert.equal(item.sourceTrace.geometry.catalogueCustody.recordId, 'REC-1');
  assert.deepEqual(item.sourceTrace.geometry.catalogueCustody.sourceReference, {
    file: 'pipe-catalogue.json', row: 12,
  });
  assert.equal(item.engineeringBasis.authority.engineeringAuthority, 'NONE');
  assert.equal(item.engineeringBasis.authority.designAuthority, false);
});

test('G10 catalogue/DN/schedule metadata never enters the numerical FIT request', () => {
  const item = readyItem();
  assert.deepEqual(Object.keys(item.request.inputs).sort(), [
    'density', 'massFlow', 'maximumUnsupportedSpan', 'outsideDiameter', 'phase', 'wallThickness',
  ]);
  for (const forbidden of ['dnInMm', 'dnOutMm', 'schedule', 'catalogueRecordId', 'catalogueAuthority']) {
    assert.equal(Object.hasOwn(item.request.inputs, forbidden), false, forbidden);
  }
  assert.equal(item.request.inputs.outsideDiameter, 168.3);
  assert.equal(item.request.inputs.wallThickness, 7.11);
});
