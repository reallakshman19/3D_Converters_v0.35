import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  runVibrationFacilityFitBenchmarkFromTables,
  runVibrationFacilityFitScreeningFromTables,
} from '../converters/vibration/facility/fit-workflow-tabular.js';
import { buildVibrationWorkspaceModel } from '../converters/vibration/workspace/model.js';
import {
  buildVibrationFitUiBenchmarkCase,
} from '../tabs/vibration-integrity-benchmarks.js';
import {
  createEmptyVibrationIntegrityInputTable,
  serializeVibrationIntegrityInputTable,
} from '../tabs/vibration-integrity-input-model.js';
import { renderVibrationIntegrityHtml } from '../tabs/vibration-integrity-view.js';

export const FIT_D4_PRODUCT_PATH_RECEIPT_SCHEMA = 'FitD4ProductPathQualificationReceipt.v1';
export const FIT_D4_PRODUCT_PATH_BENCHMARK_ID = 'EI-D4-FIT-PRODUCED-WATER-10IN';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function numericCheck(id, label, expected, actual, tolerance, scope) {
  const delta = Math.abs(actual - expected);
  return { id, label, scope, expected, actual, delta, tolerance, status: delta <= tolerance ? 'PASS' : 'FAIL' };
}

function exactCheck(id, label, expected, actual, scope) {
  return { id, label, scope, expected, actual, delta: expected === actual ? 0 : null, tolerance: 0, status: expected === actual ? 'PASS' : 'FAIL' };
}

function appInput(benchmark) {
  return {
    topology: {
      format: 'CSV_ELEMENTS_ONLY',
      data: serializeVibrationIntegrityInputTable(benchmark.tables.topology),
      sourceFileName: `${benchmark.id}.csv`,
    },
    operatingCaseCsv: serializeVibrationIntegrityInputTable(benchmark.tables.operating),
    enrichmentCsv: serializeVibrationIntegrityInputTable(benchmark.tables.enrichment),
    dataBlockerCsv: '',
  };
}

function onlyRow(envelope) {
  const rows = envelope.workflow.result.rows;
  if (rows.length !== 1) throw new Error(`FIT D4 product-path qualification expected one result row, received ${rows.length}.`);
  return rows[0];
}

function workspaceState(benchmark, envelope, workspace) {
  return {
    files: { topology: null, operating: null, enrichment: null, dataBlockers: null },
    tables: { ...benchmark.tables, dataBlockers: createEmptyVibrationIntegrityInputTable('dataBlockers') },
    benchmark: { selectedId: benchmark.id, loaded: benchmark, detachedFromSource: false },
    preflight: null,
    envelope,
    workspace,
    resultState: 'CURRENT_RESULT',
    runSnapshot: null,
    inputTab: 'engineering',
    filters: { line: '', completeness: '', band: '', candidate: '' },
    sort: { field: 'line', direction: 'asc' },
    selectedRowKey: null,
    detailTab: 'summary',
    busy: false,
    busyAction: null,
    error: null,
  };
}

export function runFitD4ProductPathValidation() {
  const benchmark = buildVibrationFitUiBenchmarkCase(FIT_D4_PRODUCT_PATH_BENCHMARK_ID);
  const input = appInput(benchmark);
  const benchmarkEnvelope = runVibrationFacilityFitBenchmarkFromTables(input, { allowLimitedExchange: true });
  const screeningEnvelope = runVibrationFacilityFitScreeningFromTables(input, { allowLimitedExchange: true });
  const benchmarkRow = onlyRow(benchmarkEnvelope);
  const screeningRow = onlyRow(screeningEnvelope);
  const workspace = buildVibrationWorkspaceModel(screeningEnvelope.workflow);
  const html = renderVibrationIntegrityHtml(workspaceState(benchmark, screeningEnvelope, workspace));
  const screeningCentral = screeningRow.centralResult;
  const benchmarkCentral = benchmarkRow.centralResult;
  const published = benchmark.published;
  const checks = [
    exactCheck('01', 'Benchmark replay qualification mode', 'benchmark', benchmarkEnvelope.qualificationMode, 'ORCHESTRATION'),
    exactCheck('02', 'Benchmark replay remains non-authorizing', false, benchmarkEnvelope.screeningAuthorized, 'ORCHESTRATION'),
    exactCheck('03', 'App product path qualification mode', 'screening', screeningEnvelope.qualificationMode, 'ORCHESTRATION'),
    exactCheck('04', 'App product path screening authority', true, screeningEnvelope.screeningAuthorized, 'ORCHESTRATION'),
    exactCheck('05', 'App product path engineering authority', 'SCREENING', screeningEnvelope.engineeringAuthority, 'ORCHESTRATION'),
    exactCheck('06', 'Screening row calculated', 'CALCULATED_SCREENING', screeningRow.status, 'RESULT'),
    numericCheck('07', 'Published D4 standard LOF', published.standardLof, screeningRow.standardLof, published.standardLofTolerance, 'RESULT'),
    numericCheck('08', 'Published D4 standard Fv', published.standardFvPa, screeningCentral.outputs.standardFv, 0.7, 'RESULT'),
    numericCheck('09', 'Benchmark and screening LOF identity', benchmarkRow.standardLof, screeningRow.standardLof, 1e-12, 'RESULT'),
    numericCheck('10', 'Benchmark and screening Fv identity', benchmarkCentral.outputs.standardFv, screeningCentral.outputs.standardFv, 1e-12, 'RESULT'),
    exactCheck('11', '273 mm selects FLEXIBLE_LARGE', 'FLEXIBLE_LARGE', screeningCentral.intermediates.support.category, 'METHOD'),
    exactCheck('12', 'Published LOF band', published.referenceBand, screeningRow.referenceBand, 'RESULT'),
    exactCheck('13', 'Bounded screening candidate authorized', true, screeningRow.screeningCandidate.screeningAuthorized, 'QUALIFICATION'),
    exactCheck('14', 'High-LOF D4 requires continuation', true, screeningRow.screeningCandidate.continuationRequired, 'QUALIFICATION'),
    exactCheck('15', 'High-LOF D4 qualified disposition', 'QUALIFIED_BOUNDED_SCREENING_FURTHER_ASSESSMENT_REQUIRED', screeningRow.screeningCandidate.status, 'QUALIFICATION'),
    exactCheck('16', 'Central effective qualification', 'SCREENING', screeningCentral.qualification.effective, 'QUALIFICATION'),
    exactCheck('17', 'Design authority remains false', false, screeningCentral.qualification.designAuthority, 'QUALIFICATION'),
    exactCheck('18', 'Workspace screening authority', true, workspace.screeningAuthorized, 'WORKSPACE'),
    exactCheck('19', 'Workspace engineering authority', 'SCREENING', workspace.engineeringAuthority, 'WORKSPACE'),
    exactCheck('20', 'Workspace row qualification', 'SCREENING', workspace.rows[0]?.qualificationState, 'WORKSPACE'),
    exactCheck('21', 'Rendered app publishes SCREENING authority', true, /<strong>SCREENING<\/strong>/u.test(html), 'RENDERED_APP'),
    exactCheck('22', 'Rendered app publishes design-authority boundary', true, /DESIGN AUTHORITY FALSE/u.test(html), 'RENDERED_APP'),
    exactCheck('23', 'Rendered app contains D4 reference band', true, /LOF_GE_1/u.test(html), 'RENDERED_APP'),
    exactCheck('24', 'Rendered app requires further assessment', true, /Further assessment required/u.test(html), 'RENDERED_APP'),
  ];
  const failed = checks.filter((item) => item.status === 'FAIL');
  return deepFreeze({
    schema: FIT_D4_PRODUCT_PATH_RECEIPT_SCHEMA,
    calculationId: 'VIB.FIV.FLOW_TURBULENCE',
    benchmarkId: benchmark.id,
    sourceLocation: benchmark.sourceLocation,
    qualificationSource: benchmark.source,
    releaseTarget: 'SCREENING',
    status: failed.length ? 'FAIL' : 'PASS',
    counts: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
    checks,
    resultSnapshot: {
      publishedStandardLof: published.standardLof,
      screeningStandardLof: screeningRow.standardLof,
      screeningStandardFvPa: screeningCentral.outputs.standardFv,
      supportCategory: screeningCentral.intermediates.support.category,
      referenceBand: screeningRow.referenceBand,
      screeningCandidateStatus: screeningRow.screeningCandidate.status,
      continuationRequired: screeningRow.screeningCandidate.continuationRequired,
      qualification: screeningCentral.qualification,
    },
    authority: {
      engineeringAuthority: screeningEnvelope.engineeringAuthority,
      screeningAuthorized: screeningEnvelope.screeningAuthorized,
      designAuthority: screeningCentral.qualification.designAuthority,
    },
  });
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) process.stdout.write(`${JSON.stringify(runFitD4ProductPathValidation(), null, 2)}\n`);
