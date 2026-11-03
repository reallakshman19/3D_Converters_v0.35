import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  VIBRATION_WORKSPACE_FIT_DETAIL_SCHEMA,
  buildVibrationWorkspaceFitDetail,
} from '../converters/vibration/workspace/fit-detail.js';
import { renderVibrationIntegrityFitCalculation } from '../tabs/vibration-integrity-fit-detail-view.js';

function resultRow() {
  return {
    sourceTrace: { operatingCase: { source: 'EI-D2' } },
    centralResult: {
      calculationId: 'VIB.FIV.FLOW_TURBULENCE',
      methodRevision: 'ei-aviff2-fit-reference-v2',
      execution: { executionId: 'ENG-1', implementationRevision: 'runtime', timestamp: '2026-08-12T00:00:00Z' },
      applicability: { applicable: true, limitations: ['WORKBOOK_REFERENCE_ONLY'] },
      resolvedInputs: {
        outsideDiameter: {
          key: 'outsideDiameter', value: 168.3, unit: 'mm', canonicalValue: 0.1683,
          canonicalUnit: 'm', transformation: 'mm->m', source: { type: 'CALLER' },
        },
      },
      outputs: {
        standardFv: 18022, standardLof: 0.276, refinedLof: null,
        governingReferenceLof: 0.276, referenceThreshold: 1,
        referenceThresholdExceeded: false, referenceBand: 'LOF_LT_0_3',
      },
      intermediates: {
        hydraulics: {
          insideDiameterM: 0.1541, insideDiameterSource: 'CALLER', flowAreaM2: 0.01865,
          aggregateVolumetricFlowM3S: 0.825, velocityMS: 44.2, velocitySource: 'DERIVED',
          resolutionMode: 'SINGLE_PHASE', resolutionModeSelection: 'NOT_APPLICABLE',
          alternateModeDataPresent: false,
        },
        excitation: { densityKgM3: 18, densitySource: 'CALLER', rhoV2: 35164.8 },
        support: {
          stiffness: 'MEDIUM_STIFF', category: 'MEDIUM_STIFF',
          boundaries: { stiffMaxM: 4.9, mediumStiffMaxM: 6.8, mediumMaxM: 8.2 },
        },
        standard: { fluidViscosityFactor: 0.141421, demand: 4973.05, lof: 0.276 },
        standardCorrelation: {
          correlationId: 'FIT.STD.MEDIUM_STIFF.v1', path: 'STANDARD', category: 'MEDIUM_STIFF',
          form: 'POWER', a: 346192, b: -0.934, fv: 18022,
        },
        advancedEligibility: { eligible: false, reason: 'STANDARD_LOF_BELOW_REFERENCE_THRESHOLD' },
        advanced: null,
        advancedCorrelation: null,
      },
      assessment: { status: 'REFERENCE_BELOW_THRESHOLD' },
      qualification: { effective: 'BENCHMARK_ONLY', method: 'BENCHMARK_ONLY' },
      provenance: {
        domainApi: 'calculateFit', engineeringAuthority: 'WORKBOOK_REFERENCE_ONLY',
        qualificationCoverageId: 'FIT-COVERAGE-V1', screeningCandidateScopeId: 'FIT-SCOPE-V1',
        sourceWorkbook: {
          repository: 'reallaksh19/CRF-4-1', commit: '68dc8e1', path: 'Extended calc2/AIV FIV/FIT.xlsm',
          gitBlob: 'd7d4c1a7', sheet: 'Flow Induced Turbulence',
        },
      },
      evidence: {
        equationIds: ['FIT-EQ-001', 'FIT-EQ-013'],
        correlationIds: ['FIT.STD.MEDIUM_STIFF.v1'],
      },
      warnings: [{ code: 'BENCHMARK_REFERENCE_ONLY' }],
    },
  };
}

test('workspace FIT detail exposes the central result without recomputation', () => {
  const row = resultRow();
  const detail = buildVibrationWorkspaceFitDetail(row);
  assert.equal(detail.schema, VIBRATION_WORKSPACE_FIT_DETAIL_SCHEMA);
  assert.equal(detail.mechanismId, 'FIT');
  assert.equal(detail.calculationId, 'VIB.FIV.FLOW_TURBULENCE');
  assert.equal(detail.methodRevision, 'ei-aviff2-fit-reference-v2');
  assert.equal(detail.intermediates.excitation.rhoV2, 35164.8);
  assert.equal(detail.intermediates.standardCorrelation.correlationId, 'FIT.STD.MEDIUM_STIFF.v1');
  assert.deepEqual(detail.equationIds, ['FIT-EQ-001', 'FIT-EQ-013']);
  assert.equal(detail.sourceTrace, row.sourceTrace);
});

test('FIT Calculation view renders backend inputs, intermediates, correlation and equation IDs', () => {
  const fitMechanism = buildVibrationWorkspaceFitDetail(resultRow());
  const html = renderVibrationIntegrityFitCalculation({ fitMechanism });
  for (const value of [
    'Normalized engineering inputs', '0.1683', 'mm-&gt;m', 'Hydraulics', '35164.8',
    'Support classification', 'MEDIUM_STIFF', 'FIT.STD.MEDIUM_STIFF.v1',
    'STANDARD_LOF_BELOW_REFERENCE_THRESHOLD', 'FIT-EQ-001', 'VIB.FIV.FLOW_TURBULENCE',
    'ei-aviff2-fit-reference-v2', 'WORKBOOK_REFERENCE_ONLY',
  ]) assert.match(html, new RegExp(value, 'u'));
  assert.doesNotMatch(html, /\bSafe\b|\bPass\b|confidence|risk score/iu);
});

test('FIT Calculation view fails closed when no central calculation exists', () => {
  assert.equal(buildVibrationWorkspaceFitDetail({ centralResult: null }), null);
  assert.match(renderVibrationIntegrityFitCalculation({ fitMechanism: null }), /No central FIT calculation/u);
});

test('FIT detail presentation contains no solver calls or UI-side engineering formulas', () => {
  const source = readFileSync(new URL('../tabs/vibration-integrity-fit-detail-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /calculateFit|calculateEngineering|calculateEngineeringBatch|Math\./u);
  assert.doesNotMatch(source, /rhoV2\s*=|demand\s*=|lof\s*=/iu);
});
