import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import {
  AIV_CANVAS_SHOW_MODE,
  aivCanvasElementMatchesFilters,
  aivCanvasProjectionFilterOptions,
  applyAivCanvasDomFilters,
  createAivCanvasFilterState,
} from '../tabs/vibration-aiv-canvas-filter.js';
import { renderAivCanvasAssessmentResultHtml } from '../tabs/vibration-aiv-canvas-results.js';
import { renderAivCanvasWorkspaceHtml } from '../tabs/vibration-aiv-canvas-view.js';

function tables() {
  return {
    sources: {
      kind: 'sources', header: ['Source Canonical ID', 'Operating Case', 'Source Device Type'],
      rows: [['SRC-A', 'CASE-A', 'RELIEF_VALVE'], ['SRC-B', 'CASE-A', 'CONTROL_VALVE'], ['SRC-A', 'CASE-B', 'RELIEF_VALVE']],
    },
    assessments: { kind: 'assessments', header: ['Assessment Canonical ID', 'Assessment Type'], rows: [['ASSMT-1', 'WELDOLET'], ['ASSMT-2', 'WELDED_TEE']] },
    relationships: {
      kind: 'relationships',
      header: ['Source Canonical ID', 'Assessment Canonical ID', 'Operating Case', 'Physical Distance', 'Physical Distance Unit', 'Distance Source', 'Distance Source Revision', 'Simultaneous Source Group', 'Applicability Disposition'],
      rows: [
        ['SRC-A', 'ASSMT-1', 'CASE-A', '0.8', 'm', 'D', 'R1', 'G1', 'APPLICABLE'],
        ['SRC-B', 'ASSMT-1', 'CASE-A', '0.9', 'm', 'D', 'R1', 'G1', 'NOT_APPLICABLE'],
        ['SRC-A', 'ASSMT-1', 'CASE-B', '1.0', 'm', 'D', 'R1', 'G2', 'APPLICABLE'],
        ['SRC-A', 'ASSMT-2', 'CASE-A', '1.2', 'm', 'D', 'R1', 'G3', 'APPLICABLE'],
      ],
    },
  };
}

const topology = {
  elements: [
    { canonicalId: 'SRC-A', tag: 'Source A', type: 'VALV', line: 'L-1' },
    { canonicalId: 'SRC-B', tag: 'Source B', type: 'VALV', line: 'L-1' },
    { canonicalId: 'ASSMT-1', tag: 'Assessment 1', type: 'OLET', line: 'L-1' },
    { canonicalId: 'ASSMT-2', tag: 'Assessment 2', type: 'OLET', line: 'L-2' },
  ],
};

function screeningResult() {
  const authority = { engineeringAuthority: 'SCREENING', screeningAuthority: 'AUTHORIZED', designAuthority: false };
  return { outputs: {
    sourceResults: [],
    assessmentResults: [{
      resultScope: 'ASSESSMENT', status: 'SCREENING_CALCULATED', assessmentCanonicalId: 'ASSMT-1', caseId: 'CASE-A',
      contributingSourceCanonicalIds: ['SRC-A'], combinedPointPwlDb: 160.41392685158226,
      sourceContributionsAtPoint: [{
        sourceCanonicalId: 'SRC-A', assessmentCanonicalId: 'ASSMT-1', caseId: 'CASE-A', simultaneousSourceGroup: 'G1',
        effectiveSourcePwlDb: 160, attenuationDb: 0.3, pointPwlDb: 159.7,
      }],
      t26Intermediates: { FLM1: 1.2, FLM2: 0.2, Lf: 0.31 }, lof: 0.29, authority,
    }],
    lineCaseSummaries: [],
  } };
}

test('projection exposes deterministic case/line filter options from records before screening', () => {
  const projection = buildAivCanvasProjection({ tables: tables(), topology });
  const options = aivCanvasProjectionFilterOptions(projection);
  assert.deepEqual(options.cases, ['CASE-A', 'CASE-B']);
  assert.deepEqual(options.lines, ['L-1', 'L-2']);
  const assessment = projection.nodes.find((item) => item.nodeKey === 'ASSESSMENT:ASSMT-1');
  assert.deepEqual(assessment.caseIds, ['CASE-A', 'CASE-B']);
  assert.equal(projection.relationships.find((item) => item.assessmentCanonicalId === 'ASSMT-2').line, 'L-2');
});

test('current/all-case and line filtering are presentation-only matching rules', () => {
  const options = { cases: ['CASE-A', 'CASE-B'], lines: ['L-1', 'L-2'] };
  const current = createAivCanvasFilterState({ caseId: 'CASE-A', line: 'L-1', showMode: 'CURRENT' }, options);
  const caseA = { dataset: { aivCanvasCases: 'CASE-A', aivCanvasLine: 'L-1' } };
  const caseB = { dataset: { aivCanvasCases: 'CASE-B', aivCanvasLine: 'L-1' } };
  const line2 = { dataset: { aivCanvasCases: 'CASE-A', aivCanvasLine: 'L-2' } };
  assert.equal(aivCanvasElementMatchesFilters(caseA, current), true);
  assert.equal(aivCanvasElementMatchesFilters(caseB, current), false);
  assert.equal(aivCanvasElementMatchesFilters(line2, current), false);
  const all = createAivCanvasFilterState({ caseId: 'CASE-A', showMode: AIV_CANVAS_SHOW_MODE.ALL }, options);
  assert.equal(aivCanvasElementMatchesFilters(caseB, all), true);
});

test('filter application reports a selected object that becomes hidden so controller can clear selection', () => {
  let hidden = false;
  const element = {
    dataset: { aivCanvasCases: 'CASE-B', aivCanvasLine: 'L-1' },
    classList: {
      toggle(name, flag) { if (name === 'is-filtered') hidden = flag; },
      contains(name) { return name === 'is-selected'; },
    },
    setAttribute() {},
  };
  const result = applyAivCanvasDomFilters({ querySelectorAll: () => [element] }, { caseId: 'CASE-A', line: 'L-1', showMode: 'CURRENT' });
  assert.equal(hidden, true);
  assert.equal(result.filteredSelection, true);
});

test('Assessment contribution table contains only returned contribution rows and returned combined PWL', () => {
  const projection = buildAivCanvasProjection({ tables: tables(), topology, screeningResult: screeningResult() });
  const assessment = projection.nodes.find((item) => item.nodeKey === 'ASSESSMENT:ASSMT-1');
  assert.equal(assessment.resultSummary.combinedPointPwlDb, 160.41392685158226);
  assert.equal(assessment.resultSummary.sourceContributionsAtPoint.length, 1);
  assert.equal(assessment.resultSummary.sourceContributionsAtPoint[0].sourceCanonicalId, 'SRC-A');
  const inactive = projection.relationships.find((item) => item.sourceCanonicalId === 'SRC-B');
  assert.equal(inactive.applicabilityDisposition, 'NOT_APPLICABLE');
  assert.equal(inactive.screeningContribution, null);
  const html = renderAivCanvasAssessmentResultHtml(assessment);
  assert.match(html, /Returned source contributions/u);
  assert.match(html, /SRC-A/u);
  assert.doesNotMatch(html, /SRC-B/u);
  assert.match(html, /160\.41392685158226/u);
  assert.match(html, /not recomputed from this table in UI code/u);
});

test('canvas renders Case Line Show controls and keeps all-case identity explicit', () => {
  const html = renderAivCanvasWorkspaceHtml({ tables: tables(), topology, screeningResult: screeningResult() });
  assert.match(html, /Operating Case/u);
  assert.match(html, /All lines/u);
  assert.match(html, /Current case/u);
  assert.match(html, /All cases/u);
  assert.match(html, /CASE-A/u);
  assert.match(html, /CASE-B/u);
  assert.match(html, /data-aiv-filterable/u);
});

test('filter and result modules contain no engineering mutation, calculation or dB combination formula', () => {
  const filter = readFileSync(new URL('../tabs/vibration-aiv-canvas-filter.js', import.meta.url), 'utf8');
  const results = readFileSync(new URL('../tabs/vibration-aiv-canvas-results.js', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../tabs/vibration-aiv-canvas-controller.js', import.meta.url), 'utf8');
  for (const source of [filter, results, controller]) {
    assert.doesNotMatch(source, /updateAivInputCell|calculateEngineering|calculateAiv|combineAiv|Math\.(?:log10|log|pow|tanh)/u);
  }
  assert.doesNotMatch(results, /10\s*\*\s*Math\.log10|reduce\s*\([^)]*pointPwl/iu);
  assert.match(results, /sourceContributionsAtPoint/u);
});
