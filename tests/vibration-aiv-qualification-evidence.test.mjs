import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_D23_BENCHMARK_CASES,
  AIV_EI_D23_SOURCE,
  AIV_EI_MAIN_GUIDANCE_SOURCE,
  AIV_METHOD_TRACE_FOUNDATION,
  AIV_QUALIFICATION_EVIDENCE,
} from '../converters/vibration/aiv/aiv-qualification-evidence.js';

const ROOT = new URL('../', import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, ROOT), 'utf8');

function benchmark(id) {
  return AIV_D23_BENCHMARK_CASES.find((row) => row.benchmarkId === id);
}

test('main EI T2.7 authority is source-pinned but controlled formula extraction remains gated', () => {
  assert.equal(AIV_EI_MAIN_GUIDANCE_SOURCE.repository, 'reallaksh19/Common');
  assert.equal(AIV_EI_MAIN_GUIDANCE_SOURCE.commit, 'aef163a5def3bfe04ca0ba860da05728a27daf42');
  assert.equal(AIV_EI_MAIN_GUIDANCE_SOURCE.path, 'EI - AVIFF Guidelines 2nd Edition.pdf');
  assert.equal(AIV_EI_MAIN_GUIDANCE_SOURCE.gitBlob, '9d3eccc56429411e17c07a579bdebbd13cb0bdc5');
  assert.match(AIV_EI_MAIN_GUIDANCE_SOURCE.locator, /pages 59-62/u);
  assert.equal(AIV_EI_MAIN_GUIDANCE_SOURCE.officialErrata.aivRelevantPage, 61);
  assert.deepEqual(AIV_EI_MAIN_GUIDANCE_SOURCE.officialErrata.pages, [61, 68]);
  assert.equal(AIV_EI_MAIN_GUIDANCE_SOURCE.controlledContentExtractionState, 'PINNED_BLOB_CONTENT_RECONCILIATION_REQUIRED');
  assert.equal(AIV_EI_MAIN_GUIDANCE_SOURCE.productionAuthority, false);
});

test('D.2.3 evidence is pinned to the controlled Common commit and blob', () => {
  assert.equal(AIV_EI_D23_SOURCE.repository, 'reallaksh19/Common');
  assert.equal(AIV_EI_D23_SOURCE.commit, 'fb549185b9b27edc2379734240320a85c5bef9f6');
  assert.equal(AIV_EI_D23_SOURCE.path, 'Energy-Institute-AVIFF---Worked-Examples.doc.docx');
  assert.equal(AIV_EI_D23_SOURCE.gitBlob, 'ceee15ed5f7f320045d5f3979024e2e8664613f2');
  assert.match(AIV_EI_D23_SOURCE.locator, /D\.2\.3 High Frequency Acoustic Excitation \(T2\.7\)/u);
  assert.equal(AIV_EI_D23_SOURCE.productionAuthority, false);
  assert(AIV_QUALIFICATION_EVIDENCE.sources.some((item) => item.gitBlob === '1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec'));
});

test('published relief source benchmark captures pressure basis, non-sonic SFF and source PWL', () => {
  const item = benchmark('AIV-EI-D2-3-RELIEF-SOURCE');
  assert.deepEqual(item.publishedInputs.upstreamPressure, { value: 98, unit: 'barg' });
  assert.deepEqual(item.publishedInputs.downstreamPressure, { value: 0, unit: 'barg' });
  assert.deepEqual(item.publishedInputs.publishedUpstreamPressureAbsolute, { value: 9.9, unit: 'MPa abs' });
  assert.deepEqual(item.publishedInputs.publishedDownstreamPressureAbsolute, { value: 0.1, unit: 'MPa abs' });
  assert.equal(item.publishedInputs.sonicState, 'NON_SONIC');
  assert.equal(item.publishedInputs.sonicFlowFactorDb, 0);
  assert.equal(item.publishedOutputs.sourcePwlDb, 164.7);
  assert.equal(item.tolerance.sourcePwlDb, 0.05);
});

test('published recycle benchmark preserves 136.7 degC and manufacturer trim evidence', () => {
  const item = benchmark('AIV-EI-D2-3-RECYCLE-SOURCE');
  assert.deepEqual(item.publishedInputs.upstreamPressure, { value: 87, unit: 'barg' });
  assert.deepEqual(item.publishedInputs.downstreamPressure, { value: 25, unit: 'barg' });
  assert.deepEqual(item.publishedInputs.upstreamTemperature, { value: 136.7, unit: 'degC' });
  assert.equal(item.publishedOutputs.sourcePwlDb, 159.4);
  assert.deepEqual(item.publishedInputs.lowNoiseTrim.reduction, {
    value: 30, unit: 'dB', qualifier: 'approximately',
  });
});

test('relief discontinuity fixture captures the published full chain and keeps FLM1 reconciliation open', () => {
  const item = benchmark('AIV-EI-D2-3-RELIEF-DISCONTINUITY');
  assert.deepEqual(item.publishedInputs.sourceToAssessmentDistance, { value: 0.8, unit: 'm' });
  assert.equal(item.publishedIntermediates.attenuationDb, 0.312);
  assert.equal(item.publishedIntermediates.assessmentPwlDb, 164.4);
  assert.equal(item.publishedIntermediates.log10N, 9.9026);
  assert.equal(item.publishedIntermediates.N, 7.99e9);
  assert.equal(item.publishedIntermediates.FLM1, 1.2133);
  assert.equal(item.publishedIntermediates.NAfterFLM1, 9.70e9);
  assert.equal(item.publishedIntermediates.FLM2, 0.2009);
  assert.equal(item.publishedIntermediates.NAfterFLM2, 1.95e9);
  assert.equal(item.publishedIntermediates.Lf, 0.31);
  assert.deepEqual(item.publishedFinal, { LOF: 0.29, rule: 'Lf < 0.5 therefore LOF = 0.29' });
  assert.equal(item.arithmeticReconciliation.state, 'OPEN');
  assert.equal(item.arithmeticReconciliation.item, 'FLM1');
  assert.equal(item.arithmeticReconciliation.consequence, 'FINAL_LOF_UNCHANGED_AT_0_29');
});

test('trace foundation freezes page locations while retaining errata and independent-benchmark gates', () => {
  const byId = new Map(AIV_METHOD_TRACE_FOUNDATION.map((row) => [row.traceId, row]));
  assert.equal(byId.get('AIV-APP-T2-7-EXTENT-001').locator, 'T2.7.1, page 59');
  assert.equal(byId.get('AIV-EQ-SOURCE-PWL-001').qualificationState, 'SOURCE_LOCATION_IDENTIFIED_CONTROLLED_EXTRACTION_REQUIRED');
  assert.equal(byId.get('AIV-EQ-T2-6-001').qualificationState, 'ERRATA_PAGE_61_CONTROLLED_CONTENT_RECONCILIATION_REQUIRED');
  assert(byId.get('AIV-EQ-T2-6-001').gaps.includes('OFFICIAL_ERRATA_PAGE_61_APPLIES'));
  assert.equal(
    byId.get('AIV-SRC-EI-D2-3-T2-6').qualificationState,
    'WORKED_EXAMPLE_FULL_CHAIN_CAPTURED_ARITHMETIC_RECONCILIATION_OPEN',
  );
  assert(byId.get('AIV-SRC-EI-D2-3-T2-6').gaps.includes('PUBLISHED_FLM1_ARITHMETIC_RECONCILIATION_REQUIRED'));
  assert.equal(byId.get('AIV-SRC-GAP-SONIC-SFF6').qualificationState, 'INDEPENDENT_BENCHMARK_REQUIRED');
  assert.equal(byId.get('AIV-SRC-GAP-MULTI-SOURCE').qualificationState, 'INDEPENDENT_BENCHMARK_REQUIRED');
  assert.equal(AIV_QUALIFICATION_EVIDENCE.productionEquationAuthorized, false);
  assert.equal(AIV_QUALIFICATION_EVIDENCE.authority.calculationState, 'BLOCKED');
});

test('qualification evidence is immutable and not imported by the production pending calculator', () => {
  assert(Object.isFrozen(AIV_QUALIFICATION_EVIDENCE));
  assert(Object.isFrozen(AIV_D23_BENCHMARK_CASES));
  assert(Object.isFrozen(AIV_D23_BENCHMARK_CASES[0].publishedInputs));
  const pending = source('converters/engineering-calculations/pending-definitions.js');
  assert.doesNotMatch(pending, /aiv-qualification-evidence/u);
  const fixtureSource = source('converters/vibration/aiv/aiv-qualification-evidence.js');
  assert.doesNotMatch(fixtureSource, /calculateEngineering|calculateAiv|Math\.log|Math\.pow|\*\*|=>\s*\{/u);
});
