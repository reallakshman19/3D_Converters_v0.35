import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VIBRATION_INTEGRITY_DETAIL_TABS,
  renderVibrationIntegrityDetailBody,
  renderVibrationIntegrityDetailTabs,
} from '../tabs/vibration-integrity-detail-view.js';

function detail() {
  return {
    summary: {
      line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1',
      status: 'CALCULATED_BENCHMARK', completenessStatus: 'CALCULATED',
      standardLof: 0.276, refinedLof: null, governingReferenceLof: 0.276,
      referenceBand: 'LOF_LT_0_3', assessmentStatus: 'REFERENCE_BELOW_THRESHOLD',
      qualificationState: 'BENCHMARK_ONLY', benchmarkAuthority: 'WORKBOOK_REFERENCE_ONLY',
      phaseEvidenceStrength: 'EI_PUBLISHED_EXAMPLE',
      correlationEvidenceStrength: 'EI_PUBLISHED_EXAMPLE', advancedEvidenceStrength: null,
      candidateForEngineeringReview: true, screeningCandidateStatus: 'CANDIDATE_STANDARD_SLICE',
      continuationRequired: false,
    },
    inputs: {
      values: { phase: 'GAS', outsideDiameter: 168.3, density: 18, gasDynamicViscosity: 0.02 },
      units: { outsideDiameter: 'mm', density: 'kg/m3', gasDynamicViscosity: 'cP' },
      qualificationMode: 'benchmark',
    },
    fitMechanism: {
      mechanismId: 'FIT', calculationId: 'VIB.FIV.FLOW_TURBULENCE', methodRevision: 'ei-aviff2-fit-reference-v2',
      resolvedInputs: {}, outputs: { standardLof: 0.276, governingReferenceLof: 0.276, referenceBand: 'LOF_LT_0_3' },
      intermediates: {
        hydraulics: {}, excitation: { rhoV2: 35164.8 }, support: { stiffness: 'MEDIUM_STIFF', category: 'MEDIUM_STIFF' },
        standard: {}, standardCorrelation: { correlationId: 'FIT.STD.MEDIUM_STIFF.v1', category: 'MEDIUM_STIFF' },
        advancedEligibility: { eligible: false, reason: 'STANDARD_LOF_BELOW_REFERENCE_THRESHOLD' },
      },
      assessment: { status: 'REFERENCE_BELOW_THRESHOLD' }, qualification: { effective: 'BENCHMARK_ONLY' },
      provenance: { engineeringAuthority: 'WORKBOOK_REFERENCE_ONLY' },
      equationIds: ['FIT-EQ-001', 'FIT-EQ-013'], correlationIds: ['FIT.STD.MEDIUM_STIFF.v1'],
    },
    operatingCase: {
      line: 'L-100', caseId: 'NORMAL', label: 'Normal', phase: 'GAS', source: 'HMB-1',
      sourceRevision: 'R2', recordId: 'ROW-7',
      massFlow: { value: 20000, unit: 'kg/h' }, density: { value: 18, unit: 'kg/m3' },
      dynamicViscosity: { value: 0.02, unit: 'cP' },
    },
    enrichment: [
      {
        canonicalId: 'CAN-1', property: 'OUTSIDE_DIAMETER', value: 168.3, unit: 'mm',
        source: 'LINE-LIST', sourceRevision: 'R4', status: 'REVIEWED', reviewer: 'ENG-A',
      },
      {
        canonicalId: 'CAN-1', caseId: 'NORMAL', property: 'NOTE', value: '<script>alert(1)</script>',
        source: '<img src=x onerror=alert(2)>', status: 'INFO',
      },
    ],
    evidenceQualification: {
      qualification: {
        effective: 'BENCHMARK_ONLY', method: 'BENCHMARK_ONLY', data: 'BENCHMARK_ONLY',
        designAuthority: false, reasons: ['EI_METHOD_INDEPENDENT_REVIEW_REQUIRED'],
      },
      qualificationCoverage: {
        phasePath: {
          path: 'SINGLE_PHASE_GAS', evidenceStrength: 'EI_PUBLISHED_EXAMPLE',
          evidenceTypes: ['EI_WORKED_EXAMPLE_POINT'], evidenceIds: ['EI-D2-FIT-RECYCLE-SUCTION-6IN'],
        },
        standardCorrelation: {
          supportCategory: 'MEDIUM_STIFF', evidenceStrength: 'EI_PUBLISHED_EXAMPLE',
          evidenceTypes: ['EI_WORKED_EXAMPLE_POINT'], evidenceIds: ['EI-D2-FIT-RELIEF-UPSTREAM-4IN'],
        },
        advancedCorrelation: {
          used: false, supportCategory: 'MEDIUM_STIFF', evidenceStrength: 'NONE', evidenceTypes: [], evidenceIds: [],
        },
        referenceBand: {
          evaluatedPath: 'STANDARD_LOF', evidenceStrength: 'EI_PUBLISHED_EXAMPLE',
          evidenceTypes: ['EI_WORKED_EXAMPLE_POINT'], evidenceIds: ['EI-D2-FIT-RECYCLE-SUCTION-6IN'],
        },
      },
      screeningCandidate: {
        scopeId: 'FIT-SCREENING-CANDIDATE-V1', status: 'CANDIDATE_STANDARD_SLICE',
        candidateForEngineeringReview: true, continuationRequired: false,
        coverageBasis: 'EI_WORKED_EXAMPLE_METHOD_SLICE', phasePath: 'SINGLE_PHASE_GAS',
        supportCategory: 'MEDIUM_STIFF', standardReferenceLof: 0.276,
        pointCoverageOnly: true, domainCoverageEstablished: false,
        screeningAuthorized: false, engineeringAuthority: 'NONE',
        reasons: ['CANDIDATE_STATUS_IS_FOR_ENGINEERING_REVIEW_ONLY'],
      },
      evidence: {
        correlationIds: ['FIT.STD.MEDIUM_STIFF.v1'], equationIds: ['FIT-EQ-001', 'FIT-EQ-013'],
        inputResolution: {
          multiphaseResolutionMode: 'SINGLE_PHASE', selection: 'NOT_APPLICABLE', alternateModeDataPresent: false,
        },
      },
    },
    sourceTrace: {
      assessmentPoint: { source: 'VIB-REVIEW', status: 'REVIEWED' },
      operatingCase: { source: 'HMB-1', sourceRevision: 'R2', recordId: 'ROW-7', flowSelection: 'MASS_FLOW' },
      geometry: {
        outsideDiameter: { source: 'LINE-LIST', sourceRevision: 'R4', recordId: 'LL-10', status: 'REVIEWED' },
        wallThickness: { source: 'LINE-LIST', sourceRevision: 'R4', recordId: 'LL-10', status: 'REVIEWED' },
      },
    },
    diagnostics: { missing: [], invalid: [], errorCodes: [], centralErrors: [] },
  };
}

test('detail tabs expose Calculation as a separate backend-trace section', () => {
  assert.deepEqual(VIBRATION_INTEGRITY_DETAIL_TABS, [
    'summary', 'inputs', 'calculation', 'case', 'evidence', 'source', 'diagnostics',
  ]);
  const html = renderVibrationIntegrityDetailTabs('calculation');
  for (const label of ['Summary', 'Inputs', 'Calculation', 'Case', 'Evidence', 'Source', 'Diagnostics']) {
    assert.match(html, new RegExp(label, 'u'));
  }
  assert.match(html, /data-vi-detail="calculation"[^>]*>Calculation/u);
});

test('summary separates reference result, qualification and evidence dimensions', () => {
  const html = renderVibrationIntegrityDetailBody(detail(), 'summary');
  assert.match(html, /FIT reference result/u);
  assert.match(html, /Standard LOF/u);
  assert.match(html, /0\.276/u);
  assert.match(html, /BENCHMARK_ONLY/u);
  assert.match(html, /EI_PUBLISHED_EXAMPLE/u);
  assert.match(html, /Engineering review candidate/u);
  assert.doesNotMatch(html, /Risk Score|Facility Score|\bSafe\b|\bPass\b/u);
});

test('calculation tab delegates to the FIT mechanism backend trace', () => {
  const html = renderVibrationIntegrityDetailBody(detail(), 'calculation');
  assert.match(html, /FIT mechanism execution/u);
  assert.match(html, /FIT\.STD\.MEDIUM_STIFF\.v1/u);
  assert.match(html, /35164\.8/u);
  assert.match(html, /FIT-EQ-001/u);
});

test('inputs and case views preserve units and source context without recomputing values', () => {
  const inputs = renderVibrationIntegrityDetailBody(detail(), 'inputs');
  assert.match(inputs, /outsideDiameter/u);
  assert.match(inputs, /168\.3/u);
  assert.match(inputs, /mm/u);
  assert.match(inputs, /LINE-LIST/u);
  assert.match(inputs, /Qualification mode/u);
  assert.match(inputs, /benchmark/u);

  const caseHtml = renderVibrationIntegrityDetailBody(detail(), 'case');
  assert.match(caseHtml, /Operating case/u);
  assert.match(caseHtml, /20000/u);
  assert.match(caseHtml, /kg\/h/u);
  assert.match(caseHtml, /Vibration enrichment/u);
  assert.match(caseHtml, /REVIEWED/u);
});

test('imported enrichment and source strings are HTML escaped', () => {
  const html = renderVibrationIntegrityDetailBody(detail(), 'case');
  assert.doesNotMatch(html, /<script>|<img /u);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/u);
});

test('evidence view exposes real evidence IDs and non-authorizing candidate facts', () => {
  const html = renderVibrationIntegrityDetailBody(detail(), 'evidence');
  assert.match(html, /EI-D2-FIT-RECYCLE-SUCTION-6IN/u);
  assert.match(html, /MEDIUM_STIFF/u);
  assert.match(html, /FIT\.STD\.MEDIUM_STIFF\.v1/u);
  assert.match(html, /FIT-EQ-001/u);
  assert.match(html, /Point coverage only/u);
  assert.match(html, /Domain coverage established/u);
  assert.match(html, /Screening authorized/u);
  assert.match(html, />false</u);
  assert.match(html, /Engineering authority/u);
  assert.match(html, />NONE</u);
  assert.doesNotMatch(html, /confidence|Confidence Score/u);
});

test('source and diagnostics views remain explicit for review and failure cases', () => {
  const source = renderVibrationIntegrityDetailBody(detail(), 'source');
  assert.match(source, /Assessment point source/u);
  assert.match(source, /VIB-REVIEW/u);
  assert.match(source, /Geometry \/ vibration source trace/u);
  assert.match(source, /LL-10/u);

  const value = detail();
  value.diagnostics = {
    missing: ['maximumUnsupportedSpan'], invalid: ['density'], errorCodes: ['INPUT_INVALID'],
    centralErrors: [{ code: 'INPUT_INVALID', field: 'density', message: 'Density is invalid.' }],
  };
  const diagnostics = renderVibrationIntegrityDetailBody(value, 'diagnostics');
  assert.match(diagnostics, /maximumUnsupportedSpan/u);
  assert.match(diagnostics, /INPUT_INVALID/u);
  assert.match(diagnostics, /Density is invalid/u);
});

test('generic mechanism contract exposes identity, currency, benchmark and exact working trace', () => {
  const value = detail();
  const context = {
    mechanismAssessmentSet: {
      setId: '["fit","L-100","NORMAL","CAN-1"]',
      cardinality: { count: 1, kind: 'ONE' },
      items: [{
        itemId: '["fit","L-100","NORMAL","CAN-1","mainline"]',
        implementationState: 'IMPLEMENTED_BENCHMARK_ONLY',
        assessmentState: 'CALCULATED', resultState: 'STALE_RESULT',
        benchmark: { status: 'STALE_RESULT' },
        trace: {
          inputTrace: {
            status: 'COMPLETE_WORKING_TRACE',
            workingCells: {
              outsideDiameter: {
                sourceAnchorId: 'vi-source-enrichment-EN-1-4',
                valueRef: { kind: 'enrichment', rowId: 'EN-1', header: 'Value' },
                unitRef: { kind: 'enrichment', rowId: 'EN-1', header: 'Unit' },
              },
            },
          },
        },
      }],
    },
  };
  const summary = renderVibrationIntegrityDetailBody(value, 'summary', context);
  for (const token of [
    'Mechanism assessment contract', 'mainline', 'ONE', 'IMPLEMENTED_BENCHMARK_ONLY',
    'STALE_RESULT', 'COMPLETE_WORKING_TRACE',
  ]) assert.match(summary, new RegExp(token, 'u'));
  const inputs = renderVibrationIntegrityDetailBody(value, 'inputs', context);
  assert.match(inputs, /Mechanism working-input trace/u);
  assert.match(inputs, /vi-source-enrichment-EN-1-4/u);
  assert.match(inputs, /EN-1/u);
});
