import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  addAivRelationshipInputRow,
  createEmptyAivInputTable,
  deleteAivInputRow,
  findAivRelationshipInputRowIndex,
} from '../tabs/vibration-aiv-input-model.js';
import {
  AIV_CANVAS_MODE,
  advanceAivCanvasRelationshipState,
  aivCanvasRelationshipSelectionKey,
  createAivCanvasRelationshipState,
  setAivCanvasRelationshipMode,
} from '../tabs/vibration-aiv-canvas-relationship.js';
import {
  aivRelationshipDeleteMessage,
  aivRelationshipIdentityFromTableRow,
  confirmAivRelationshipDelete,
} from '../tabs/vibration-aiv-delete-safeguard.js';

function value(table, rowIndex, column) {
  return table.rows[rowIndex][table.header.indexOf(column)];
}

const RELATIONSHIP = Object.freeze({
  sourceCanonicalId: 'SRC-1',
  assessmentCanonicalId: 'ASSMT-1',
  caseId: 'CASE-A',
});

test('visual relationship creation adds one table row with canonical identity and blank distance/evidence', () => {
  const start = createEmptyAivInputTable('relationships');
  const next = addAivRelationshipInputRow(start, RELATIONSHIP);
  assert.equal(start.rows.length, 0);
  assert.equal(next.rows.length, 1);
  assert.equal(value(next, 0, 'Source Canonical ID'), 'SRC-1');
  assert.equal(value(next, 0, 'Assessment Canonical ID'), 'ASSMT-1');
  assert.equal(value(next, 0, 'Operating Case'), 'CASE-A');
  assert.equal(value(next, 0, 'Applicability Disposition'), 'UNRESOLVED');
  for (const column of ['Physical Distance', 'Physical Distance Unit', 'Distance Source', 'Distance Source Revision', 'Simultaneous Source Group']) {
    assert.equal(value(next, 0, column), '', `${column} must remain blank on visual relationship creation`);
  }
});

test('exact duplicate relationship is rejected while the same source/assessment under another case is allowed', () => {
  const first = addAivRelationshipInputRow(createEmptyAivInputTable('relationships'), RELATIONSHIP);
  assert.throws(
    () => addAivRelationshipInputRow(first, RELATIONSHIP),
    (error) => error?.code === 'AIV_INPUT_RELATIONSHIP_DUPLICATE',
  );
  const second = addAivRelationshipInputRow(first, { ...RELATIONSHIP, caseId: 'CASE-B' });
  assert.equal(second.rows.length, 2);
  assert.equal(findAivRelationshipInputRowIndex(second, { ...RELATIONSHIP, caseId: 'CASE-B' }), 1);
});

test('relationship deletion removes only the selected relationship row and cannot cascade into source/assessment tables', () => {
  const sources = createEmptyAivInputTable('sources');
  const assessments = createEmptyAivInputTable('assessments');
  let relationships = addAivRelationshipInputRow(createEmptyAivInputTable('relationships'), RELATIONSHIP);
  relationships = addAivRelationshipInputRow(relationships, { ...RELATIONSHIP, assessmentCanonicalId: 'ASSMT-2' });
  const rowIndex = findAivRelationshipInputRowIndex(relationships, RELATIONSHIP);
  const remaining = deleteAivInputRow(relationships, rowIndex);
  assert.equal(remaining.rows.length, 1);
  assert.equal(value(remaining, 0, 'Assessment Canonical ID'), 'ASSMT-2');
  assert.equal(sources.rows.length, 0);
  assert.equal(assessments.rows.length, 0);
});

test('relationship deletion confirmation is identity-specific and fails closed', () => {
  const table = addAivRelationshipInputRow(createEmptyAivInputTable('relationships'), RELATIONSHIP);
  const identity = aivRelationshipIdentityFromTableRow(table, 0);
  assert.deepEqual(identity, RELATIONSHIP);
  assert.match(aivRelationshipDeleteMessage(identity), /SRC-1 → ASSMT-1 · CASE-A/u);
  assert.equal(confirmAivRelationshipDelete(identity, () => true), true);
  assert.equal(confirmAivRelationshipDelete(identity, () => false), false);
  assert.equal(confirmAivRelationshipDelete(identity, null), false);
  assert.equal(confirmAivRelationshipDelete(null, () => true), false);
});

test('RELATIONSHIPS mode plans source then assessment creation using identity only', () => {
  const relationships = setAivCanvasRelationshipMode(createAivCanvasRelationshipState(), AIV_CANVAS_MODE.RELATIONSHIPS);
  const source = Object.freeze({ nodeKind: 'SOURCE', canonicalId: 'SRC-1', caseId: 'CASE-A', selectionKey: 'SOURCE:SRC-1:CASE-A' });
  const assessment = Object.freeze({ nodeKind: 'ASSESSMENT', canonicalId: 'ASSMT-1', caseId: null, selectionKey: 'ASSESSMENT:ASSMT-1' });
  const pending = advanceAivCanvasRelationshipState(relationships, source);
  assert.equal(pending.createRequest, null);
  assert.deepEqual(pending.state.pendingSource, source);
  const create = advanceAivCanvasRelationshipState(pending.state, assessment);
  assert.deepEqual(create.createRequest, RELATIONSHIP);
  assert.equal(create.state.pendingSource, null);
  assert.equal(aivCanvasRelationshipSelectionKey(create.createRequest), 'REL:SRC-1:ASSMT-1:CASE-A');
});

test('relationship mode ignores assessment-first selection and mode changes clear pending source without engineering mutation', () => {
  const active = setAivCanvasRelationshipMode(createAivCanvasRelationshipState(), AIV_CANVAS_MODE.RELATIONSHIPS);
  const assessment = { nodeKind: 'ASSESSMENT', canonicalId: 'ASSMT-1', caseId: null };
  assert.equal(advanceAivCanvasRelationshipState(active, assessment).createRequest, null);
  const withSource = advanceAivCanvasRelationshipState(active, {
    nodeKind: 'SOURCE', canonicalId: 'SRC-1', caseId: 'CASE-A', selectionKey: 'SOURCE:SRC-1:CASE-A',
  }).state;
  const navigate = setAivCanvasRelationshipMode(withSource, AIV_CANVAS_MODE.NAVIGATE);
  assert.equal(navigate.mode, 'NAVIGATE');
  assert.equal(navigate.pendingSource, null);
});

test('production relationship editing stays on the table mutation boundary and contains no geometry-derived engineering path', () => {
  const controller = readFileSync(new URL('../tabs/vibration-aiv-canvas-controller.js', import.meta.url), 'utf8');
  const relationship = readFileSync(new URL('../tabs/vibration-aiv-canvas-relationship.js', import.meta.url), 'utf8');
  const qualification = readFileSync(new URL('../tabs/vibration-aiv-qualification-tab.js', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../tabs/vibration-aiv-canvas-view.js', import.meta.url), 'utf8');
  assert(controller.split(/\r?\n/u).length < 300);
  assert(relationship.split(/\r?\n/u).length < 300);
  assert.match(controller, /onCreateRelationship/u);
  assert.match(controller, /onDeleteRelationship/u);
  assert.match(qualification, /addAivRelationshipInputRow/u);
  assert.match(qualification, /applyTableMutation\('relationships'/u);
  assert.match(qualification, /deleteAivInputRow\(state\.tables\.relationships/u);
  assert.match(qualification, /confirmAivRelationshipDelete/u);
  assert.match(view, /data-aiv-canvas-mode="RELATIONSHIPS"/u);
  assert.match(view, /data-aiv-source-canonical-id/u);
  assert.match(view, /data-aiv-assessment-canonical-id/u);
  for (const source of [controller, relationship]) {
    assert.doesNotMatch(source, /updateAivInputCell|calculateEngineering|calculateAiv|attenuationDb|pointPwlDb|combinedPointPwlDb/iu);
    assert.doesNotMatch(source, /getBoundingClientRect\(.*physicalDistance|physicalDistance.*getBoundingClientRect/isu);
    assert.doesNotMatch(source, /Math\.(?:log10|log|tanh|pow)|\*\*/u);
  }
});