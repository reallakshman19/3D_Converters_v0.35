import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyAivInputTable } from '../tabs/vibration-aiv-input-model.js';
import {
  addAivUnifiedCanvasTableRow,
  validateAivUnifiedCanvasTableDraft,
} from '../tabs/vibration-aiv-unified-canvas-table-author.js';

function value(table, rowIndex, column) {
  return table.rows[rowIndex][table.header.indexOf(column)];
}

test('TABLE_DRIVEN Source quick-create writes canonical identity and operating case immediately', () => {
  const base = createEmptyAivInputTable('sources');
  const values = {
    'Source Canonical ID': 'PSV-NEW-101',
    'Operating Case': 'RELIEF-CASE-NEW',
    'Source Device Type': 'RELIEF_VALVE',
  };
  assert.equal(validateAivUnifiedCanvasTableDraft('sources', values), true);
  const next = addAivUnifiedCanvasTableRow(base, values);
  assert.equal(next.rows.length, 1);
  assert.equal(value(next, 0, 'Source Canonical ID'), 'PSV-NEW-101');
  assert.equal(value(next, 0, 'Operating Case'), 'RELIEF-CASE-NEW');
  assert.equal(value(next, 0, 'Source Device Type'), 'RELIEF_VALVE');
});

test('TABLE_DRIVEN Assessment quick-create writes canonical identity immediately', () => {
  const base = createEmptyAivInputTable('assessments');
  const values = {
    'Assessment Canonical ID': 'WO-NEW-101',
    'Assessment Type': 'WELDOLET',
  };
  assert.equal(validateAivUnifiedCanvasTableDraft('assessments', values), true);
  const next = addAivUnifiedCanvasTableRow(base, values);
  assert.equal(value(next, 0, 'Assessment Canonical ID'), 'WO-NEW-101');
  assert.equal(value(next, 0, 'Assessment Type'), 'WELDOLET');
});

test('TABLE_DRIVEN quick-create rejects non-renderable blank identities', () => {
  assert.throws(
    () => validateAivUnifiedCanvasTableDraft('sources', {
      'Source Canonical ID': '',
      'Operating Case': 'CASE-1',
    }),
    /requires Source Canonical ID and Operating Case/u,
  );
  assert.throws(
    () => validateAivUnifiedCanvasTableDraft('assessments', {
      'Assessment Canonical ID': '',
    }),
    /requires Assessment Canonical ID/u,
  );
});
