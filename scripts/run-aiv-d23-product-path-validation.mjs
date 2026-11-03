import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseAivAssessmentCsv } from '../converters/vibration/aiv/assessment-csv.js';
import { AIV_DEFAULT_ASSUMPTION_PROFILE } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { parseAivSourceCsv } from '../converters/vibration/aiv/source-csv.js';
import { parseAivSourceAssessmentCsv } from '../converters/vibration/aiv/source-assessment-csv.js';
import { serializeAivInputTable } from '../tabs/vibration-aiv-input-model.js';
import { buildLoadedAivD23Benchmark } from '../tabs/vibration-aiv-benchmarks.js';
import { runAivAutoProductPath } from './aiv-auto-product-path.mjs';

export const AIV_D23_PRODUCT_PATH_RECEIPT_SCHEMA = 'AivProductPathBenchmarkParityReceipt.v1';

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

export function runAivD23ProductPathValidation() {
  const loaded = buildLoadedAivD23Benchmark();
  const sources = parseAivSourceCsv(serializeAivInputTable(loaded.tables.sources));
  const assessments = parseAivAssessmentCsv(serializeAivInputTable(loaded.tables.assessments));
  const relationships = parseAivSourceAssessmentCsv(serializeAivInputTable(loaded.tables.relationships));
  const result = runAivAutoProductPath({
    sources,
    assessments,
    relationships,
    exchange: loaded.topology,
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
  });
  const relief = result.sourceResults.find((item) => item.sourceCanonicalId === 'AIV-D23-RELIEF-SOURCE');
  const recycle = result.sourceResults.find((item) => item.sourceCanonicalId === 'AIV-D23-RECYCLE-SOURCE');
  const assessment = result.assessmentResults.find((item) => item.assessmentCanonicalId === 'AIV-D23-WELDOLET-01');
  const line = result.lineCaseSummaries.find((item) => item.line === 'D2.3 Relief line');
  const t26 = assessment.t26Intermediates;
  const point = assessment.sourceContributionsAtPoint[0];
  const checks = [
    numericCheck('01', 'Relief raw source PWL', 164.7, relief.rawSourcePwlDb, 0.05, 'SOURCE'),
    numericCheck('02', 'Recycle raw source PWL', 159.4, recycle.rawSourcePwlDb, 0.05, 'SOURCE'),
    numericCheck('03', 'Recycle effective PWL after 30 dB trim', 129.36, recycle.effectiveSourcePwlDb, 0.05, 'SOURCE'),
    numericCheck('04', 'Relief attenuation to first discontinuity', 0.312, point.attenuationDb, 0.001, 'ASSESSMENT'),
    numericCheck('05', 'Relief first-discontinuity point PWL', 164.4, assessment.combinedPointPwlDb, 0.05, 'ASSESSMENT'),
    numericCheck('06', 'Configured published A', 0.93989, t26.A, 1e-9, 'ASSESSMENT'),
    numericCheck('07', 'Configured published S', 68.229, t26.S, 1e-9, 'ASSESSMENT'),
    numericCheck('08', 'Configured published B', 152.207, t26.B, 1e-9, 'ASSESSMENT'),
    numericCheck('09', 'Errata log10(N)', 9.9026, t26.log10N, 0.0001, 'ASSESSMENT'),
    numericCheck('10', 'Fatigue cycles N', 7.99e9, t26.N, 1e7, 'ASSESSMENT'),
    numericCheck('11', 'Dext/dext ratio', 2.791, t26.diameterRatio, 0.001, 'ASSESSMENT'),
    numericCheck('12', 'Published FLM1 branch', 1.2133, t26.FLM1, 1e-9, 'ASSESSMENT'),
    numericCheck('13', 'Displayed-input FLM1 arithmetic variance', 1.2133, t26.calculatedFLM1FromGeometry, t26.FLM1ToleranceAbs, 'ASSESSMENT'),
    numericCheck('14', 'FLM2', 0.2009, t26.FLM2, 0.0001, 'ASSESSMENT'),
    numericCheck('15', 'N after FLM1', 9.70e9, t26.NAfterFLM1, 1e7, 'ASSESSMENT'),
    numericCheck('16', 'N after FLM2', 1.95e9, t26.NAfterFLM2, 5e6, 'ASSESSMENT'),
    numericCheck('17', 'Loss factor Lf', 0.31, t26.Lf, 0.01, 'ASSESSMENT'),
    numericCheck('18', 'First-discontinuity LOF', 0.29, assessment.lof, 0.01, 'ASSESSMENT'),
    exactCheck('19', 'Line result kept separate from first-discontinuity result', true, line.valuesAreNotInterchangeable, 'LINE_CASE_SUMMARY'),
    numericCheck('20', 'Configured worked-example relief-line LOF', 1.48, line.lof, 1e-9, 'LINE_CASE_SUMMARY'),
    exactCheck('21', 'All 10 stages executed', 10, result.implementedStageCount, 'METHOD'),
    exactCheck('22', 'No universal operating classification emitted', false, result.universalClassificationProduced, 'METHOD'),
  ];
  const failed = checks.filter((item) => item.status === 'FAIL');
  return deepFreeze({
    schema: AIV_D23_PRODUCT_PATH_RECEIPT_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    benchmarkId: loaded.benchmark.id,
    releaseTarget: 'BENCHMARK_ONLY',
    status: failed.length ? 'FAIL' : 'PASS',
    completeKernelStageCount: result.implementedStageCount,
    resultContractsValidated: result.sourceResults.every((item) => item.schema === 'AivSourceResult.v1')
      && result.assessmentResults.every((item) => item.schema === 'AivAssessmentResult.v1')
      && result.lineCaseSummaries.every((item) => item.schema === 'AivLineCaseSummary.v1'),
    sourceAssessmentLineScopesValidated: assessment.resultScope === 'ASSESSMENT'
      && line.resultScope === 'LINE_CASE_SUMMARY'
      && assessment.lof !== line.lof,
    counts: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
    checks,
    resultSnapshot: {
      reliefRawSourcePwlDb: relief.rawSourcePwlDb,
      recycleRawSourcePwlDb: recycle.rawSourcePwlDb,
      recycleEffectiveSourcePwlDb: recycle.effectiveSourcePwlDb,
      attenuationDb: point.attenuationDb,
      firstDiscontinuityPointPwlDb: assessment.combinedPointPwlDb,
      t26,
      firstDiscontinuityLof: assessment.lof,
      reliefLineLof: line.lof,
    },
    assumptions: {
      profileSchema: AIV_DEFAULT_ASSUMPTION_PROFILE.schema,
      configuredStage8Intermediates: ['A', 'S', 'B'],
      configuredLineScopeResult: 'benchmark.workedExampleReliefLineLof',
      lineLofDerivedFromFirstDiscontinuity: false,
      humanEvidenceRequired: false,
    },
    authorityTransitionApplied: false,
    calculationState: 'BLOCKED',
    qualificationState: 'BLOCKED',
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  });
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) process.stdout.write(`${JSON.stringify(runAivD23ProductPathValidation(), null, 2)}\n`);
