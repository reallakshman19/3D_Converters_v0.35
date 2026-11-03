import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIV_D23_PDF_REVALIDATION,
  AIV_EI_EXAMPLES_PDF_SOURCE,
  AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE,
} from '../converters/vibration/aiv/aiv-d23-pdf-revalidation.js';

function sourcePwl({ p1PaAbs, p2PaAbs, massFlowKgS, temperatureK, molecularWeight, sffDb = 0 }) {
  return 10 * Math.log10(
    (((p1PaAbs - p2PaAbs) / p1PaAbs) ** 3.6)
    * (massFlowKgS ** 2)
    * ((temperatureK / molecularWeight) ** 1.2),
  ) + 126.1 + sffDb;
}

function flm1(diameterRatio) {
  return -0.07
    + 0.91 * diameterRatio
    + 1.32 / diameterRatio
    - 0.48 * (diameterRatio ** 1.5)
    + 0.065 * (diameterRatio ** 2);
}

function flm2(pwlDb) {
  return 0.29 + 0.09 * Math.tanh((pwlDb - 172) / 2.9);
}

test('EI examples PDF source identity remains pinned as corroborating binary evidence', () => {
  assert.equal(AIV_EI_EXAMPLES_PDF_SOURCE.repository, 'reallaksh19/Common');
  assert.equal(AIV_EI_EXAMPLES_PDF_SOURCE.commit, 'fb549185b9b27edc2379734240320a85c5bef9f6');
  assert.equal(AIV_EI_EXAMPLES_PDF_SOURCE.path, 'EI examples.pdf');
  assert.equal(AIV_EI_EXAMPLES_PDF_SOURCE.gitBlob, '1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec');
  assert.equal(AIV_EI_EXAMPLES_PDF_SOURCE.sizeBytes, 1602640);
  assert.equal(AIV_EI_EXAMPLES_PDF_SOURCE.productionAuthority, false);
});

test('controlled Markdown source is pinned to the validated PR445 DOCX transcription', () => {
  const source = AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE;
  assert.equal(source.repository, 'reallaksh19/3D_Converters');
  assert.equal(source.commit, '8f243592d73ccf4790d9e308a311003ce7d8f5bb');
  assert.equal(source.path, 'docs/Energy-Institute-AVIFF---Worked-Examples.md');
  assert.equal(source.gitBlob, '9f22d92eba8bdf3b67adc25a4c77a7f7d7211da8');
  assert.equal(source.lineCount, 268);
  assert.equal(source.derivedFrom.gitBlob, 'ceee15ed5f7f320045d5f3979024e2e8664613f2');
  assert.equal(source.derivedFrom.nonEmptyWordTextNodesCovered, 3089);
  assert.equal(source.derivedFrom.nonEmptyWordTextNodesTotal, 3089);
  assert.equal(source.productionAuthority, false);
  assert(!AIV_D23_PDF_REVALIDATION.remainingQualificationGates.includes('DIRECT_EXTRACT_PINNED_EI_EXAMPLES_PDF'));
});

test('controlled Markdown report rows stay distinct from D2.3 first-discontinuity result scope', () => {
  const rows = AIV_D23_PDF_REVALIDATION.controlledMarkdownAivRows;
  assert.equal(rows.recycleCompressorDischarge.reportedPwlDb, 129.36);
  assert.equal(rows.recycleCompressorDischarge.reportedLof, 0.29);
  assert.equal(rows.reliefDownstreamLine.reportedPwlDb, 164.69);
  assert.equal(rows.reliefDownstreamLine.reportedLof, 1.48);
  assert.equal(
    rows.interpretation,
    'DERIVED_SCREENING_REPORT_ROWS_ARE_NOT_INTERCHANGEABLE_WITH_D2_3_FIRST_DISCONTINUITY_RESULT_OBJECTS',
  );
  assert(AIV_D23_PDF_REVALIDATION.remainingQualificationGates.includes('RECONCILE_WORKED_EXAMPLES_DERIVED_REPORT_RESULT_SCOPE'));
});

test('relief and recycle published source PWL values reproduce from the displayed inputs', () => {
  const relief = sourcePwl({
    p1PaAbs: 9.9e6,
    p2PaAbs: 0.1e6,
    massFlowKgS: 53482 / 3600,
    temperatureK: 137 + 273.15,
    molecularWeight: 21.75,
  });
  const recycle = sourcePwl({
    p1PaAbs: 8.8e6,
    p2PaAbs: 2.6e6,
    massFlowKgS: 53482 / 3600,
    temperatureK: 136.7 + 273.15,
    molecularWeight: 21.75,
  });
  assert(Math.abs(relief - 164.7) <= 0.05, `relief PWL ${relief}`);
  assert(Math.abs(recycle - 159.4) <= 0.05, `recycle PWL ${recycle}`);
});

test('relief attenuation and weldolet downstream chain reproduce the published final LOF disposition', () => {
  const item = AIV_D23_PDF_REVALIDATION.reliefFirstDiscontinuity;
  const attenuationDb = 60 * 0.8 / 154;
  assert(Math.abs(attenuationDb - item.published.attenuationDb) < 0.001);
  assert.equal(item.published.assessmentPwlDb, 164.4);

  const ratio = 168.3 / 60.3;
  const calculatedFlm1 = flm1(ratio);
  const calculatedFlm2 = flm2(164.4);
  const nAfterFlm1 = 7.99e9 * calculatedFlm1;
  const nAfterFlm2 = nAfterFlm1 * calculatedFlm2;
  const lf = -0.1303 * Math.log(nAfterFlm2) + 3.1;
  const lof = lf >= 0.5 ? Math.min(1, Math.max(0, lf)) : 0.29;

  assert(Math.abs(calculatedFlm2 - 0.2009) < 0.0001);
  assert(Math.abs(lf - 0.31) < 0.01);
  assert.equal(lof, 0.29);
  assert.equal(item.published.LOF, 0.29);
});

test('published FLM1 value remains an explicit arithmetic reconciliation gap', () => {
  const item = AIV_D23_PDF_REVALIDATION.reliefFirstDiscontinuity;
  const calculated = flm1(168.3 / 60.3);
  assert(Math.abs(calculated - 1.2109758194311824) < 1e-12);
  assert.equal(item.published.FLM1, 1.2133);
  assert(Math.abs(calculated - item.published.FLM1) > 0.002);
  assert.equal(item.arithmeticReconciliation.state, 'OPEN');
  assert.equal(item.arithmeticReconciliation.consequence, 'FINAL_LOF_UNCHANGED_AT_0_29');
  assert.equal(AIV_D23_PDF_REVALIDATION.authority.productionEquationAuthorized, false);
});
