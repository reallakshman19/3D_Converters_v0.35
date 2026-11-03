import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import { aivCanvasFieldKey, focusAivCanvasField } from '../tabs/vibration-aiv-canvas-field.js';
import { applyAivCanvasSelection } from '../tabs/vibration-aiv-canvas-selection.js';
import { renderAivCanvasSelectedDetailHtml, renderAivCanvasWorkspaceHtml } from '../tabs/vibration-aiv-canvas-view.js';

function tables(sourceFlow = '') {
  return {
    sources: {
      kind: 'sources',
      header: ['Source Canonical ID', 'Operating Case', 'Source Device Type', 'Mass Flow'],
      rows: [['SRC-1', 'CASE-A', 'RELIEF_VALVE', sourceFlow]],
    },
    assessments: {
      kind: 'assessments', header: ['Assessment Canonical ID', 'Assessment Type'], rows: [['ASSMT-1', 'WELDOLET']],
    },
    relationships: {
      kind: 'relationships',
      header: ['Source Canonical ID', 'Assessment Canonical ID', 'Operating Case', 'Physical Distance', 'Physical Distance Unit', 'Applicability Disposition'],
      rows: [['SRC-1', 'ASSMT-1', 'CASE-A', '', '', 'UNRESOLVED']],
    },
  };
}

function resolution() {
  const resolved = tables('10');
  resolved.relationships.rows[0][3] = '0.8';
  resolved.relationships.rows[0][4] = 'm';
  return {
    tables: resolved,
    assumptions: [
      { tableKind: 'sources', rowIndex: 0, column: 'Mass Flow', assumedValue: '10', profilePath: 'source.massFlow', reason: 'MISSING_INPUT_DEFAULTED' },
      { tableKind: 'relationships', rowIndex: 0, column: 'Physical Distance', assumedValue: '0.8', profilePath: 'relationship.physicalDistance', reason: 'MISSING_INPUT_DEFAULTED' },
      { tableKind: 'relationships', rowIndex: 0, column: 'Physical Distance Unit', assumedValue: 'm', profilePath: 'relationship.physicalDistanceUnit', reason: 'MISSING_INPUT_DEFAULTED' },
    ],
  };
}

const readiness = {
  readiness: {
    rows: [{
      sourceCanonicalId: 'SRC-1', assessmentCanonicalId: 'ASSMT-1', caseId: 'CASE-A',
      status: 'READY_FOR_QUALIFICATION', rowKey: 'ROW-1',
    }],
  },
};

test('canvas projection exposes exact resolution assumptions and textual readiness without inference', () => {
  const projection = buildAivCanvasProjection({ tables: tables(), assumptionResolution: resolution(), readinessEnvelope: readiness });
  const source = projection.nodes.find((item) => item.nodeKey === 'SOURCE:SRC-1:CASE-A');
  const relationship = projection.relationships[0];
  assert.equal(source.assumptionCount, 1);
  assert.deepEqual(source.assumptions[0], {
    tableKind: 'sources', rowIndex: 0, column: 'Mass Flow', assumedValue: '10',
    profilePath: 'source.massFlow', reason: 'MISSING_INPUT_DEFAULTED',
  });
  assert.equal(source.readinessStatus, 'READY_FOR_QUALIFICATION');
  assert.equal(relationship.assumptionCount, 2);
  assert.equal(relationship.assumptions.some((item) => item.column === 'Physical Distance' && item.assumedValue === '0.8'), true);
});

test('explicit table value with no resolution entry has no canvas assumption indicator', () => {
  const explicit = tables('12');
  const projection = buildAivCanvasProjection({
    tables: explicit,
    assumptionResolution: { tables: explicit, assumptions: [] },
    readinessEnvelope: readiness,
  });
  const source = projection.nodes.find((item) => item.nodeKey === 'SOURCE:SRC-1:CASE-A');
  assert.equal(source.assumptionCount, 0);
  assert.deepEqual(source.assumptions, []);
});

test('field navigation key targets exact existing input and performs focus/scroll only', () => {
  const key = aivCanvasFieldKey('relationships', 0, 'Physical Distance');
  let focused = false;
  let scrolled = false;
  const input = {
    dataset: { aivFieldKey: key },
    focus() { focused = true; },
    scrollIntoView() { scrolled = true; },
  };
  const container = { querySelectorAll: () => [input] };
  assert.equal(focusAivCanvasField(container, key), true);
  assert.equal(focused, true);
  assert.equal(scrolled, true);
  assert.equal(focusAivCanvasField(container, 'relationships:8:missing'), false);
});

test('selection shows only the matching assumption/readiness detail panel', () => {
  const classList = { toggle() {} };
  const canvas = { dataset: { aivSelectionKey: 'SOURCE:SRC-1:CASE-A' }, classList, setAttribute() {} };
  const sourceDetail = { dataset: { aivCanvasAssumptionDetail: 'SOURCE:SRC-1:CASE-A' }, hidden: true };
  const otherDetail = { dataset: { aivCanvasAssumptionDetail: 'ASSESSMENT:ASSMT-1' }, hidden: true };
  const container = {
    querySelectorAll(selector) {
      if (selector === '[data-aiv-canvas-node],[data-aiv-canvas-relationship]') return [canvas];
      if (selector === '[data-aiv-table-row-kind]') return [];
      if (selector === '[data-aiv-canvas-assumption-detail]') return [sourceDetail, otherDetail];
      return [];
    },
  };
  applyAivCanvasSelection(container, { selectionKey: 'SOURCE:SRC-1:CASE-A' });
  assert.equal(sourceDetail.hidden, false);
  assert.equal(otherDetail.hidden, true);
});

test('rendered canvas and selected detail expose non-color assumption/readiness provenance with no assumption write path', () => {
  const state = { tables: tables(), assumptionResolution: resolution(), readinessEnvelope: readiness };
  const html = renderAivCanvasWorkspaceHtml(state);
  const detail = renderAivCanvasSelectedDetailHtml(state, 'SOURCE:SRC-1:CASE-A');
  assert.match(html, /\[A\] 1/u);
  assert.match(html, /READY_FOR_QUALIFICATION/u);
  assert.match(detail, /source\.massFlow/u);
  assert.match(detail, /data-aiv-assumption-field-key/u);
  const inputView = readFileSync(new URL('../tabs/vibration-aiv-input-view.js', import.meta.url), 'utf8');
  const field = readFileSync(new URL('../tabs/vibration-aiv-canvas-field.js', import.meta.url), 'utf8');
  assert.match(inputView, /data-aiv-field-key/u);
  assert.match(inputView, /data-aiv-assumed/u);
  for (const source of [field, readFileSync(new URL('../tabs/vibration-aiv-canvas-view.js', import.meta.url), 'utf8')]) {
    assert.doesNotMatch(source, /updateAivInputCell|addAivInputRow|resolveAivWorkingTablesWithAssumptions|calculateEngineering|calculateAiv/u);
  }
});