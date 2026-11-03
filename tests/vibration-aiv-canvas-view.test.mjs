import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { renderAivCanvasWorkspaceHtml } from '../tabs/vibration-aiv-canvas-view.js';

function state() {
  return {
    tables: {
      sources: {
        kind: 'sources',
        header: ['Source Canonical ID', 'Operating Case', 'Source Device Type'],
        rows: [['SRC-1', 'CASE-1', 'RELIEF_VALVE']],
      },
      assessments: {
        kind: 'assessments',
        header: ['Assessment Canonical ID', 'Assessment Type'],
        rows: [['ASS-1', 'WELDOLET']],
      },
      relationships: {
        kind: 'relationships',
        header: [
          'Source Canonical ID', 'Assessment Canonical ID', 'Operating Case',
          'Physical Distance', 'Physical Distance Unit', 'Distance Source',
          'Distance Source Revision', 'Simultaneous Source Group', 'Applicability Disposition',
        ],
        rows: [['SRC-1', 'ASS-1', 'CASE-1', '0.8', 'm', 'USER', 'R1', '', 'APPLICABLE']],
      },
    },
    topologyInput: {
      format: 'PARSED_EXCHANGE',
      data: {
        elements: [
          { canonicalId: 'SRC-1', tag: 'PSV-101', type: 'VALV', line: 'L-1' },
          { canonicalId: 'ASS-1', tag: 'WO-103', type: 'OLET', line: 'L-1' },
        ],
      },
    },
    screeningResult: {
      outputs: {
        sourceResults: [{ sourceCanonicalId: 'SRC-1', caseId: 'CASE-1', status: 'SCREENING_CALCULATED', effectiveSourcePwlDb: 164.6 }],
        assessmentResults: [{ assessmentCanonicalId: 'ASS-1', caseId: 'CASE-1', resultScope: 'ASSESSMENT', combinedPointPwlDb: 164.3, lof: 0.29, sourceContributionsAtPoint: [] }],
        lineCaseSummaries: [{ line: 'L-1', caseId: 'CASE-1', lof: 1.48, resultScope: 'LINE_CASE_SUMMARY', authoritativeForScreening: false }],
      },
    },
  };
}

test('live canvas view renders dedicated SVG with canonical/case identity and explicit distance', () => {
  const html = renderAivCanvasWorkspaceHtml(state());
  assert.match(html, /AIV relationship canvas/u);
  assert.match(html, /<svg/u);
  assert.match(html, /data-aiv-canvas-node="SOURCE:SRC-1:CASE-1"/u);
  assert.match(html, /data-aiv-canvas-node="ASSESSMENT:ASS-1"/u);
  assert.match(html, /CASE-1 · 0\.8 m/u);
  assert.match(html, /LOF 0\.29 · CASE-1/u);
});

test('line case result is permanently labeled non-authoritative in the canvas surface', () => {
  const html = renderAivCanvasWorkspaceHtml(state());
  assert.match(html, /NON-AUTHORITATIVE FOR SCREENING/u);
  assert.match(html, /L-1 \/ CASE-1: 1\.48/u);
});

test('blank canonical identities are not invented by the canvas', () => {
  const empty = state();
  empty.tables.sources.rows = [['', 'CASE-1', 'RELIEF_VALVE']];
  empty.tables.assessments.rows = [['', 'WELDOLET']];
  empty.tables.relationships.rows = [['', '', 'CASE-1', '', '', '', '', '', 'UNRESOLVED']];
  const html = renderAivCanvasWorkspaceHtml(empty);
  assert.doesNotMatch(html, /data-aiv-canvas-node=/u);
  assert.match(html, /Blank editable identities are not invented/u);
});

test('live AIV input workspace consumes the dedicated canvas renderer as a first-class data-gated surface', () => {
  const source = readFileSync(new URL('../tabs/vibration-aiv-input-view.js', import.meta.url), 'utf8');
  assert.match(source, /renderAivCanvasWorkspaceHtml/u);
  assert.match(source, /hasCanvasWorkspaceData/u);
  assert.match(source, /const canvas = hasCanvasWorkspaceData\(state, tables\) \? renderAivCanvasWorkspaceHtml\(canvasState\) : ''/u);
  assert.match(source, /\$\{eitSummary\(state\)\}\$\{canvas\}/u);
});