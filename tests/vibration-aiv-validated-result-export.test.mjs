import assert from 'node:assert/strict';
import test from 'node:test';
import { AIV_DEFAULT_ASSUMPTION_PROFILE } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import {
  AIV_D23_PRODUCT_PATH_VALIDATION,
  buildAivD23ValidatedExportPackage,
} from '../tabs/vibration-aiv-validation-records.js';
import { renderAivResultShellsHtml } from '../tabs/vibration-aiv-result-view.js';

test('committed D.2.3 validation exposes Source Assessment and Line result contracts', () => {
  assert.equal(AIV_D23_PRODUCT_PATH_VALIDATION.status, 'PASS');
  assert.equal(AIV_D23_PRODUCT_PATH_VALIDATION.counts.passed, 22);
  assert.equal(AIV_D23_PRODUCT_PATH_VALIDATION.sourceResults.every((item) => item.schema === 'AivSourceResult.v1'), true);
  assert.equal(AIV_D23_PRODUCT_PATH_VALIDATION.assessmentResult.schema, 'AivAssessmentResult.v1');
  assert.equal(AIV_D23_PRODUCT_PATH_VALIDATION.lineResult.schema, 'AivLineCaseSummary.v1');
  assert.equal(AIV_D23_PRODUCT_PATH_VALIDATION.assessmentResult.lof, 0.29);
  assert.equal(AIV_D23_PRODUCT_PATH_VALIDATION.lineResult.lof, 1.48);
  assert.equal(AIV_D23_PRODUCT_PATH_VALIDATION.lineResult.valuesAreNotInterchangeable, true);
});

test('validated export package includes assumptions and retains no screening/design authority', () => {
  const payload = buildAivD23ValidatedExportPackage({ assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE });
  assert.equal(payload.schema, 'AivValidatedBenchmarkExportPackage.v1');
  assert.equal(payload.validationStatus, 'PASS');
  assert.equal(payload.validationRecord.status, 'PASS');
  assert.equal(payload.assumptionProfile.schema, 'AivAssumptionProfile.v1');
  assert.equal(payload.benchmarkInputsModified, false);
  assert.equal(payload.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(payload.designAuthority, false);
});

test('modified benchmark or assumption identity is explicitly not applicable to the committed receipt', () => {
  const payload = buildAivD23ValidatedExportPackage({
    assumptionProfile: AIV_DEFAULT_ASSUMPTION_PROFILE,
    benchmarkModified: true,
  });
  assert.equal(payload.validationStatus, 'NOT_APPLICABLE_MODIFIED_INPUTS');
  assert.equal(payload.benchmarkInputsModified, true);
});

test('result view shows validated values only for unchanged controlled benchmark and assumptions', () => {
  const validated = renderAivResultShellsHtml({
    benchmark: { loaded: { modified: false } },
    assumptionProfileModified: false,
  });
  assert.match(validated, /Validated EI D\.2\.3 benchmark results/u);
  assert.match(validated, /164\.7/u);
  assert.match(validated, /Full precision: 164\.6851759525391/u);
  assert.match(validated, /Raw PWL \(dB\)/u);
  assert.match(validated, /Line LOF/u);
  assert.match(validated, />1\.48</u);
  assert.match(validated, /Display precision:/u);
  assert.match(validated, /Export validation package/u);

  const tableModified = renderAivResultShellsHtml({
    benchmark: { loaded: { modified: true } },
    assumptionProfileModified: false,
  });
  assert.doesNotMatch(tableModified, /Validated EI D\.2\.3 benchmark results/u);
  assert.match(tableModified, /validation result is not applicable/u);

  const assumptionsModified = renderAivResultShellsHtml({
    benchmark: { loaded: { modified: false } },
    assumptionProfileModified: true,
  });
  assert.doesNotMatch(assumptionsModified, /Validated EI D\.2\.3 benchmark results/u);
  assert.match(assumptionsModified, /inputs or assumptions were modified/u);
});

test('screening results use neutral authority badges and controlled engineering display precision', () => {
  const html = renderAivResultShellsHtml({
    screeningResult: {
      ok: true,
      outputs: {
        screeningResultScope: 'ASSESSMENT',
        completeKernelStageCount: 10,
        sourceResults: [{
          sourceCanonicalId: 'SRC-1', caseId: 'CASE-1', rawSourcePwlDb: 164.6851759525391,
          sonicFlowFactorDb: 0.04321, trimReductionDb: 30, effectiveSourcePwlDb: 134.6851759525391,
        }],
        assessmentResults: [{
          assessmentCanonicalId: 'A-1', line: 'L-1', caseId: 'CASE-1', combinedPointPwlDb: 164.4123,
          t26Intermediates: { FLM1: 1.2133456, FLM2: 0.8765432 }, lof: 0.29456,
        }],
        lineCaseSummaries: [{ line: 'L-1', caseId: 'CASE-1', lof: 1.475, maxAssessmentLof: 0.29456, aggregationBasis: 'TRACE_ONLY' }],
      },
      evidence: { domainResult: { assumptionProfile: { policy: { assumptionsMustBeVisible: true } } } },
    },
  });
  assert.match(html, /SCREENING OUTPUT/u);
  assert.doesNotMatch(html, /aivq-status ok">SCREENING</u);
  assert.match(html, /Raw PWL \(dB\)/u);
  assert.match(html, />164\.7</u);
  assert.match(html, />1\.2133</u);
  assert.match(html, />0\.29</u);
  assert.match(html, /Exported evidence remains unrounded/u);
});
