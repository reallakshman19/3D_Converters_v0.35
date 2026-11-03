import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_D23_QUALIFICATION_SOLVE_SCHEMA,
  solveAivD23QualificationExample,
} from '../scripts/solve-aiv-d23-qualification.mjs';

const ROOT = new URL('../', import.meta.url);

function close(actual, expected, tolerance, label) {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} within ${tolerance}`);
}

test('D2.3 qualification solve reproduces relief and recycle source PWL references', () => {
  const result = solveAivD23QualificationExample();
  assert.equal(result.schema, AIV_D23_QUALIFICATION_SOLVE_SCHEMA);
  close(result.sourceResults.relief.calculatedRawSourcePwlDb, 164.7, 0.05, 'relief raw source PWL');
  close(result.sourceResults.recycle.calculatedRawSourcePwlDb, 159.4, 0.05, 'recycle raw source PWL');
  close(result.sourceResults.recycle.calculatedEffectiveSourcePwlDb, 129.36, 0.01, 'recycle effective source PWL');
});

test('controlled Markdown AIV rows reproduce at source/effective-source PWL scope only', () => {
  const rows = solveAivD23QualificationExample().controlledMarkdownSourceRowParity;
  close(rows.recycleCompressorDischarge.calculatedReportedPwlDb, 129.36, 0.01, 'recycle discharge report PWL');
  close(rows.recycleCompressorSuction.calculatedReportedPwlDb, 129.02, 0.01, 'recycle suction report PWL');
  close(rows.reliefDownstreamLine.calculatedReportedPwlDb, 164.69, 0.01, 'relief report PWL');
  assert.equal(rows.recycleCompressorDischarge.controlledMarkdownReportedLof, 0.29);
  assert.equal(rows.recycleCompressorSuction.controlledMarkdownReportedLof, 0.29);
  assert.equal(rows.reliefDownstreamLine.controlledMarkdownReportedLof, 1.48);
  assert.equal(rows.reliefDownstreamLine.lofReproduced, false);
  assert.match(rows.scopeNote, /line LOF values are not rederived/u);
});

test('D2.3 relief first-discontinuity solve reproduces attenuation, point PWL and errata feed', () => {
  const item = solveAivD23QualificationExample().reliefFirstDiscontinuity;
  close(item.calculatedAttenuationDb, 0.312, 0.001, 'attenuation');
  close(item.calculatedPointPwlDb, 164.4, 0.05, 'point PWL');
  close(item.errataFeed.calculatedLog10N, 9.9026, 0.00005, 'log10(N)');
  assert(Math.abs(item.errataFeed.calculatedN - 7.99e9) / 7.99e9 < 0.002);
  assert.equal(item.publishedIntermediatesNotRederived.A, 0.93989);
  assert.equal(item.publishedIntermediatesNotRederived.S, 68.229);
  assert.equal(item.publishedIntermediatesNotRederived.B, 152.207);
});

test('published and recalculated FLM1 chains both close to final LOF 0.29', () => {
  const item = solveAivD23QualificationExample().reliefFirstDiscontinuity;
  close(item.FLM1.calculatedFromDisplayedInputs, 1.2109758194311824, 1e-12, 'recalculated FLM1');
  assert.equal(item.FLM1.published, 1.2133);
  assert.equal(item.FLM1.reconciliationState, 'OPEN');
  close(item.calculatedFLM2, 0.2009, 0.0001, 'FLM2');
  close(item.chains.usingPublishedFLM1.Lf, 0.31, 0.01, 'Lf published-FLM1 chain');
  close(item.chains.usingRecalculatedFLM1.Lf, 0.31, 0.01, 'Lf recalculated-FLM1 chain');
  assert.equal(item.chains.usingPublishedFLM1.LOF, 0.29);
  assert.equal(item.chains.usingRecalculatedFLM1.LOF, 0.29);
  assert.equal(item.finalDisposition.robustToOpenFlm1ArithmeticVariance, true);
});

test('qualification solve cannot grant production, screening or design authority', () => {
  const result = solveAivD23QualificationExample();
  assert.equal(result.authority.calculationState, 'BLOCKED');
  assert.equal(result.authority.qualificationState, 'BLOCKED');
  assert.equal(result.authority.engineeringAuthority, 'NONE');
  assert.equal(result.authority.productionEquationAuthorized, false);
  assert.equal(result.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(result.authority.designAuthority, false);
});

test('qualification solve remains isolated from the production AIV facade and UI', () => {
  const productionFacade = fs.readFileSync(new URL('converters/vibration/aiv/index.js', ROOT), 'utf8');
  const qualificationTab = fs.readFileSync(new URL('tabs/vibration-aiv-qualification-tab.js', ROOT), 'utf8');
  const qualificationView = fs.readFileSync(new URL('tabs/vibration-aiv-qualification-view.js', ROOT), 'utf8');
  for (const source of [productionFacade, qualificationTab, qualificationView]) {
    assert.doesNotMatch(source, /solveAivD23QualificationExample|solve-aiv-d23-qualification/u);
  }
});
