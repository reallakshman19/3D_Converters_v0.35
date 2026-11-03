import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAivAssessmentCsv } from '../converters/vibration/aiv/assessment-csv.js';
import { createAivAssumptionProfile } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { parseAivSourceCsv } from '../converters/vibration/aiv/source-csv.js';
import { parseAivSourceAssessmentCsv } from '../converters/vibration/aiv/source-assessment-csv.js';
import { serializeAivInputTable } from '../tabs/vibration-aiv-input-model.js';
import { buildLoadedAivD23Benchmark } from '../tabs/vibration-aiv-benchmarks.js';
import { runAivAutoProductPath } from '../scripts/aiv-auto-product-path.mjs';
import { runAivD23ProductPathValidation } from '../scripts/run-aiv-d23-product-path-validation.mjs';

function parsedBenchmark(profile) {
  const loaded = buildLoadedAivD23Benchmark();
  return runAivAutoProductPath({
    sources: parseAivSourceCsv(serializeAivInputTable(loaded.tables.sources)),
    assessments: parseAivAssessmentCsv(serializeAivInputTable(loaded.tables.assessments)),
    relationships: parseAivSourceAssessmentCsv(serializeAivInputTable(loaded.tables.relationships)),
    exchange: loaded.topology,
    assumptionProfile: profile,
  });
}

test('AUTO product path executes all 10 stages and preserves result scopes', () => {
  const result = parsedBenchmark(createAivAssumptionProfile());
  assert.equal(result.implementedStageCount, 10);
  assert.deepEqual(result.stageOrder, [
    'VALIDATE_INPUT', 'RESOLVE_INPUT', 'EVALUATE_APPLICABILITY', 'CALCULATE_SOURCE_PWL',
    'APPLY_SOURCE_MODIFIERS', 'CALCULATE_POINT_ATTENUATION', 'COMBINE_SIMULTANEOUS_SOURCES',
    'CALCULATE_DISCONTINUITY_RESULT', 'AGGREGATE_LINE_CASE_RESULT', 'ASSESS_RESULT',
  ]);
  assert.equal(result.sourceResults.length, 2);
  assert.equal(result.assessmentResults.length, 1);
  assert.equal(result.lineCaseSummaries.length, 1);
  assert.equal(result.sourceResults[0].schema, 'AivSourceResult.v1');
  assert.equal(result.assessmentResults[0].schema, 'AivAssessmentResult.v1');
  assert.equal(result.lineCaseSummaries[0].schema, 'AivLineCaseSummary.v1');
  assert.equal(result.assessmentResults[0].resultScope, 'ASSESSMENT');
  assert.equal(result.lineCaseSummaries[0].resultScope, 'LINE_CASE_SUMMARY');
  assert.notEqual(result.assessmentResults[0].lof, result.lineCaseSummaries[0].lof);
  assert.equal(result.universalClassificationProduced, false);
});

test('D.2.3 AUTO stage 8 reproduces the published assessment chain', () => {
  const result = parsedBenchmark(createAivAssumptionProfile());
  const assessment = result.assessmentResults[0];
  const t26 = assessment.t26Intermediates;
  assert.ok(Math.abs(assessment.combinedPointPwlDb - 164.3734876408508) < 1e-10);
  assert.ok(Math.abs(t26.log10N - 9.902567870507482) < 1e-10);
  assert.ok(Math.abs(t26.N - 7990388037.921443) < 1);
  assert.ok(Math.abs(t26.calculatedFLM1FromGeometry - 1.2109758194311824) < 1e-12);
  assert.equal(t26.FLM1, 1.2133);
  assert.ok(t26.FLM1Variance < t26.FLM1ToleranceAbs);
  assert.ok(Math.abs(t26.FLM2 - 0.2009306328510857) < 1e-12);
  assert.ok(Math.abs(t26.NAfterFLM1 - 9694737806.410088) < 2);
  assert.ok(Math.abs(t26.NAfterFLM2 - 1947969802.7673252) < 2);
  assert.ok(Math.abs(t26.Lf - 0.31287602368755874) < 1e-12);
  assert.equal(assessment.lof, 0.29);
});

test('FLM1 and line-scope assumptions remain user configurable', () => {
  const profile = createAivAssumptionProfile({
    benchmark: {
      flm1Mode: 'RECALCULATED',
      workedExampleReliefLineLof: '1.55',
    },
  });
  const result = parsedBenchmark(profile);
  assert.equal(result.assessmentResults[0].t26Intermediates.FLM1, 1.2109758194311824);
  assert.equal(result.assessmentResults[0].lof, 0.29);
  assert.equal(result.lineCaseSummaries[0].lof, 1.55);
  assert.equal(result.lineCaseSummaries[0].aggregationBasis, 'CONFIGURED_LINE_SCOPE_REFERENCE');
});

test('stepwise D.2.3 product-path validation passes every declared check', () => {
  const receipt = runAivD23ProductPathValidation();
  assert.equal(receipt.schema, 'AivProductPathBenchmarkParityReceipt.v1');
  assert.equal(receipt.status, 'PASS');
  assert.deepEqual(receipt.counts, { checks: 22, passed: 22, failed: 0 });
  assert.equal(receipt.completeKernelStageCount, 10);
  assert.equal(receipt.resultContractsValidated, true);
  assert.equal(receipt.sourceAssessmentLineScopesValidated, true);
  assert.equal(receipt.assumptions.humanEvidenceRequired, false);
  assert.equal(receipt.authorityTransitionApplied, false);
  assert.equal(receipt.screeningAuthority, 'NOT_AUTHORIZED');
});
