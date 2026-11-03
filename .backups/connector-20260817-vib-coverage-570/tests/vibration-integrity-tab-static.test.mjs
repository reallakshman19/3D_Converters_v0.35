import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { renderVibrationIntegrityHtml } from '../tabs/vibration-integrity-view.js';

const controllerSource = fs.readFileSync(new URL('../tabs/vibration-integrity-tab.js', import.meta.url), 'utf8');
const viewSource = fs.readFileSync(new URL('../tabs/vibration-integrity-view.js', import.meta.url), 'utf8');
const extensionSource = fs.readFileSync(new URL('../core/engineering-tabs-extension.js', import.meta.url), 'utf8');

function state() {
  const rowKey = '["L-100","NORMAL","CAN-1"]';
  return {
    files: {
      topology: { name: 'model.xlsx', format: 'XLSX', kind: 'Complete five-sheet XLSX expected' },
      operating: { name: 'cases.csv', kind: 'VibrationOperatingCaseCsv.v1' },
      enrichment: { name: 'enrichment.csv', kind: 'VibrationEnrichmentCsv.v1' },
    },
    allowLimitedExchange: false,
    busy: false,
    busyAction: null,
    error: null,
    filters: { line: '', completeness: '', band: '', candidate: '' },
    sort: { field: 'line', direction: 'asc' },
    detailTab: 'summary',
    preflight: null,
    envelope: {
      qualificationMode: 'screening',
      engineeringAuthority: 'SCREENING',
      screeningAuthorized: true,
      imports: {
        topologyFormat: 'XLSX', exchangeIntegrityStatus: 'DECLARED_NOT_REVERIFIED',
        operatingCaseCount: 2, enrichmentCount: 6,
      },
      workflow: {
        register: {
          rows: [
            { line: 'L-100', caseId: 'NORMAL', completenessStatus: 'CALCULATED', referenceBand: 'LOF_LT_0_3' },
            { line: 'L-200', caseId: 'DESIGN', completenessStatus: 'DATA_INCOMPLETE', referenceBand: null },
          ],
        },
      },
    },
    workspace: {
      engineeringAuthority: 'SCREENING',
      screeningAuthorized: true,
      qualificationMode: 'screening',
      selectedRowKey: rowKey,
      summary: {
        totalRows: 2, visibleRows: 2, calculatedRows: 1, incompleteRows: 1,
        calculationFailedRows: 0, candidateForEngineeringReviewRows: 0,
      },
      rows: [
        {
          rowKey, line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1',
          completenessStatus: 'CALCULATED', standardLof: 0.276, refinedLof: null,
          governingReferenceLof: 0.276, referenceBand: 'LOF_LT_0_3',
          qualificationState: 'SCREENING', phaseEvidenceStrength: 'EI_PUBLISHED_EXAMPLE',
          correlationEvidenceStrength: 'INDEPENDENT_HAND_BENCHMARK',
          advancedEvidenceStrength: 'RETAINED_PARITY_ONLY', candidateForEngineeringReview: false,
          continuationRequired: false,
        },
        {
          rowKey: '["L-200","DESIGN","CAN-2"]', line: 'L-200', caseId: 'DESIGN', canonicalId: 'CAN-2',
          completenessStatus: 'DATA_INCOMPLETE', standardLof: null, refinedLof: null,
          governingReferenceLof: null, referenceBand: null, qualificationState: null,
          phaseEvidenceStrength: null, correlationEvidenceStrength: null,
          advancedEvidenceStrength: null, candidateForEngineeringReview: false,
        },
      ],
      detail: {
        summary: { line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1', qualificationState: 'SCREENING' },
        inputs: { values: { phase: 'GAS' }, units: { outsideDiameter: 'mm' }, qualificationMode: 'screening' },
        operatingCase: { line: 'L-100', caseId: 'NORMAL', source: 'HMB-1' },
        enrichment: [], evidenceQualification: { qualification: { effective: 'SCREENING', designAuthority: false } },
        sourceTrace: { assessmentPoint: { source: 'VIB-REVIEW' } },
        diagnostics: { missing: [], invalid: [], errorCodes: [], centralErrors: [] },
      },
    },
  };
}

function preflightState() {
  const base = state();
  return {
    ...base,
    envelope: null,
    workspace: null,
    preflight: {
      imports: { exchangeIntegrityStatus: 'DECLARED_NOT_REVERIFIED' },
      preflight: {
        counts: { assessmentPoints: 2, rows: 2, ready: 1, notReady: 1 },
        rows: [
          {
            line: 'L-100', caseId: 'NORMAL', canonicalId: 'CAN-1', status: 'READY',
            missing: [], invalid: [], reasons: ['REQUIRED_INPUT_EVIDENCE_AVAILABLE'], requestPrepared: true,
          },
          {
            line: 'L-200', caseId: 'DESIGN', canonicalId: 'CAN-2', status: 'NOT_READY',
            missing: ['maximumUnsupportedSpan'], invalid: [], reasons: ['FIT_REQUEST_INPUT_INCOMPLETE'], requestPrepared: false,
          },
        ],
      },
    },
  };
}

test('Vibration Integrity renders bounded screening workspace with explicit design boundary', () => {
  const html = renderVibrationIntegrityHtml(state());
  assert.match(html, /Vibration Integrity/u);
  assert.match(html, /SCREENING/u);
  assert.match(html, /DESIGN AUTHORITY FALSE/u);
  assert.match(html, /3D EDIT table export/u);
  assert.match(html, /DECLARED_NOT_REVERIFIED/u);
  assert.match(html, /CAN-1/u);
  assert.match(html, /DATA_INCOMPLETE/u);
  assert.match(html, /Phase: EI_PUBLISHED_EXAMPLE/u);
  assert.match(html, /Standard: INDEPENDENT_HAND_BENCHMARK/u);
  assert.match(html, /Advanced: RETAINED_PARITY_ONLY/u);
  assert.match(html, /Run FIT screening/u);
});

test('readiness panel shows READY/NOT_READY evidence only and contains no LOF fields', () => {
  const html = renderVibrationIntegrityHtml(preflightState());
  const panel = html.match(/<section class="vi-card vi-preflight-card">[\s\S]*?<\/section>/u)?.[0] ?? '';
  assert.match(panel, /FIT readiness/u);
  assert.match(panel, /No FIT calculation is executed/u);
  assert.match(panel, /DECLARED_NOT_REVERIFIED/u);
  assert.match(panel, /CAN-1/u);
  assert.match(panel, /READY/u);
  assert.match(panel, /CAN-2/u);
  assert.match(panel, /NOT_READY/u);
  assert.match(panel, /maximumUnsupportedSpan/u);
  assert.doesNotMatch(panel, /LOF|Reference band|Assessment Status/u);
});

test('non-calculated table cells remain blank-state markers rather than synthetic zeroes', () => {
  const html = renderVibrationIntegrityHtml(state());
  const incompleteRow = html.match(/CAN-2[\s\S]*?<\/tr>/u)?.[0] ?? '';
  assert.match(incompleteRow, /DATA_INCOMPLETE/u);
  assert.match(incompleteRow, /vi-empty/u);
  assert.doesNotMatch(incompleteRow, />0<|>0\.0+/u);
});

test('visible vibration product has no canvas, universal score, pass or direct engineering kernel call', () => {
  const combined = `${controllerSource}\n${viewSource}`;
  assert.doesNotMatch(combined, /<canvas|createElement\(['"]canvas/iu);
  assert.doesNotMatch(combined, /riskScore|Risk Score|Facility Score|Vibration Score/u);
  assert.doesNotMatch(controllerSource, /calculateFit\s*\(/u);
  assert.doesNotMatch(controllerSource, /calculateEngineering(?:Batch)?\s*\(/u);
  assert.match(controllerSource, /buildVibrationFacilityFitPreflightFromTables/u);
  assert.match(controllerSource, /runVibrationFacilityFitScreeningFromTables/u);
  assert.match(controllerSource, /buildVibrationWorkspaceModel/u);
  assert.match(controllerSource, /serializeVibrationFacilityFitRegisterCsv/u);
});

test('screening workflow is lazy-loaded only by the explicit Run action', () => {
  assert.doesNotMatch(
    controllerSource,
    /import\s*\{[^}]*runVibrationFacilityFitScreeningFromTables[^}]*\}\s*from/u,
  );
  assert.match(
    controllerSource,
    /await import\(\s*'\.\.\/converters\/vibration\/facility\/fit-workflow-tabular\.js'/u,
  );
  assert.match(controllerSource, /data-vi-action="preflight"|action === 'preflight'/u);
});

test('FIT workspace is not exposed as a standalone Engineering navigation item', () => {
  assert.match(extensionSource, /id: 'engineering-calculations'/u);
  assert.match(extensionSource, /label: 'Engineering Calculations'/u);
  assert.doesNotMatch(extensionSource, /label: 'Vibration Integrity'/u);
  assert.doesNotMatch(extensionSource, /id: 'vibration-integrity'/u);
});

test('tab exposes XLSX preferred and limited CSV handling without user-selectable authority controls', () => {
  const html = renderVibrationIntegrityHtml({ ...state(), files: { ...state().files, topology: {
    name: 'elements.csv', format: 'CSV_ELEMENTS_ONLY', kind: 'Elements-only CSV · limited provenance',
  } } });
  assert.match(html, /Limited topology input/u);
  assert.match(html, /five-sheet XLSX export/u);
  assert.match(html, /Allow limited Elements-only CSV/u);
  assert.match(html, /Check readiness/u);
  assert.doesNotMatch(html, /qualification-mode|design mode/iu);
});
