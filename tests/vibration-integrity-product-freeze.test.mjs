import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  VIBRATION_INTEGRITY_AUDIT_EVENT_TYPES,
  appendVibrationIntegrityAuditEvent,
  assertVibrationIntegrityAuditLog,
  createVibrationIntegrityAuditLog,
} from '../tabs/vibration-integrity-audit-log.js';
import { deriveVibrationIntegrityWorkflowState } from '../tabs/vibration-integrity-workflow-state.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIT_ACTIONS = ['load-benchmark', 'preflight', 'run', 'export', 'export-evidence'];

function auditEvent(eventType, timestamp, workflowBefore, workflowAfter, details = {}) {
  return { eventType, timestamp, workflowBefore, workflowAfter, details };
}

test('PR511 preserves FIT actions and visible result facts without owning workspace navigation', async () => {
  const [inputView, tab] = await Promise.all([
    readFile(resolve(ROOT, 'tabs/vibration-integrity-input-view.js'), 'utf8'),
    readFile(resolve(ROOT, 'tabs/vibration-integrity-tab.js'), 'utf8'),
  ]);
  for (const action of FIT_ACTIONS) {
    assert.match(inputView, new RegExp(`data-vi-action=["']${action}["']`, 'u'));
  }
  for (const label of ['Readiness:', 'Evidence:', 'Audit events:', 'Last audit:', 'Run snapshot:']) {
    assert.match(inputView, new RegExp(label, 'u'));
  }
  assert.doesNotMatch(inputView, /Audit snapshot:/u);
  assert.match(tab, /deriveVibrationIntegrityWorkflowState/u);
  assert.match(tab, /state\.resultState = 'RUNNING'/u);
  assert.match(tab, /'STALE_RESULT'/u);
  assert.match(tab, /'CURRENT_RESULT'/u);
  assert.match(tab, /'INVALID_INPUT'/u);
  assert.equal(VIBRATION_INTEGRITY_AUDIT_EVENT_TYPES.includes('RUN_EVIDENCE_EXPORT_STARTED'), true);
});

test('FIT result currency remains distinct from observational product workflow state', () => {
  const current = deriveVibrationIntegrityWorkflowState({ resultState: 'CURRENT_RESULT' });
  assert.equal(current.state, 'RESULT_CURRENT');
  assert.equal(current.resultState, 'CURRENT_RESULT');
  assert.notEqual(current.state, current.resultState);

  const stale = deriveVibrationIntegrityWorkflowState({ resultState: 'STALE_RESULT' });
  assert.equal(stale.state, 'RESULT_STALE');
  assert.equal(stale.resultState, 'STALE_RESULT');
  assert.notEqual(stale.state, stale.resultState);
});

test('activity log is immutable, sequence-checked and always non-authoritative', () => {
  const empty = createVibrationIntegrityAuditLog();
  const opened = appendVibrationIntegrityAuditEvent(empty, auditEvent(
    'WORKSPACE_OPENED', '2026-08-15T06:00:00.000Z', null, 'EMPTY', { product: 'Vibration Integrity' },
  ));
  const loaded = appendVibrationIntegrityAuditEvent(opened, auditEvent(
    'BENCHMARK_LOADED', '2026-08-15T06:00:30.000Z', 'EMPTY', 'INPUTS_LOADED', { benchmarkId: 'EI-D2' },
  ));
  const running = appendVibrationIntegrityAuditEvent(loaded, auditEvent(
    'FIT_RUN_STARTED', '2026-08-15T06:01:00.000Z', 'READY_CHECKED', 'RUNNING', {},
  ));
  assert.equal(empty.events.length, 0);
  assert.deepEqual(running.events.map((event) => event.eventId), [
    'VI-EVT-000001', 'VI-EVT-000002', 'VI-EVT-000003',
  ]);
  assert.equal(running.events[2].eventType, 'FIT_RUN_STARTED');
  assert.equal(running.events[2].authority.engineeringAuthority, 'NONE');
  assert.equal(running.events[2].authority.purpose, 'ACTIVITY_AUDIT_ONLY');
  assert.equal(Object.isFrozen(running), true);
  assert.equal(Object.isFrozen(running.events[1]), true);
  assert.equal(assertVibrationIntegrityAuditLog(running), running);
  const tampered = { ...running, events: [{ ...running.events[0], sequence: 2 }, ...running.events.slice(1)] };
  assert.throws(() => assertVibrationIntegrityAuditLog(tampered), /VIBRATION_AUDIT_EVENT_INVALID/u);
});
