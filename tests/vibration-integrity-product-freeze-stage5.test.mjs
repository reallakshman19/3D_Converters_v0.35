import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  VIBRATION_INTEGRITY_AUDIT_EVENT_TYPES,
  appendVibrationIntegrityAuditEvent,
  assertVibrationIntegrityAuditLog,
  buildVibrationIntegrityAuditExport,
  createVibrationIntegrityAuditLog,
} from '../tabs/vibration-integrity-audit-log.js';
import { renderVibrationIntegrityActivity } from '../tabs/vibration-integrity-activity-view.js';
import { VIBRATION_INTEGRITY_UI_CONTRACT } from '../tabs/vibration-integrity-ui-contract.js';
import { deriveVibrationIntegrityWorkflowState } from '../tabs/vibration-integrity-workflow-state.js';

function baseState(overrides = {}) {
  return {
    tables: { topology: { rows: [] } },
    preflight: null, resultState: 'UNRUN', busyAction: null,
    auditLog: createVibrationIntegrityAuditLog(),
    ...overrides,
  };
}

test('product workflow uses the frozen state ladder and explicit next actions', () => {
  assert.equal(deriveVibrationIntegrityWorkflowState(baseState()).state, 'EMPTY');
  const loaded = baseState({ tables: { topology: { rows: [['E1']] } } });
  assert.equal(deriveVibrationIntegrityWorkflowState(loaded).nextAction, 'CHECK_READINESS');
  const ready = baseState({
    tables: { topology: { rows: [['E1']] } },
    preflight: { preflight: { counts: { ready: 1, notReady: 0, assessmentPoints: 1 } } },
  });
  assert.equal(deriveVibrationIntegrityWorkflowState(ready).state, 'READY_CHECKED');
  assert.equal(deriveVibrationIntegrityWorkflowState(ready).nextAction, 'RUN_SCREENING');
  const blocked = { ...ready, preflight: { preflight: { counts: { ready: 0, notReady: 1, assessmentPoints: 1 } } } };
  assert.equal(deriveVibrationIntegrityWorkflowState(blocked).nextAction, 'RESOLVE_READINESS');
  assert.equal(deriveVibrationIntegrityWorkflowState(baseState({ resultState: 'CURRENT_RESULT' })).state, 'RESULT_CURRENT');
  assert.equal(deriveVibrationIntegrityWorkflowState(baseState({ resultState: 'STALE_RESULT' })).state, 'RESULT_STALE');
  assert.equal(deriveVibrationIntegrityWorkflowState(baseState({ resultState: 'INVALID_INPUT' })).state, 'INVALID_INPUT');
  assert.equal(deriveVibrationIntegrityWorkflowState(baseState({ resultState: 'RUNNING', busyAction: 'screening' })).state, 'RUNNING');
});

test('audit journal is immutable, sequential, bounded, validated and non-authoritative', () => {
  const empty = createVibrationIntegrityAuditLog();
  const one = appendVibrationIntegrityAuditEvent(empty, {
    timestamp: '2026-08-15T09:00:00.000Z', eventType: 'WORKSPACE_OPENED',
    workflowBefore: null, workflowAfter: 'EMPTY', details: {},
  });
  const two = appendVibrationIntegrityAuditEvent(one, {
    timestamp: '2026-08-15T09:01:00.000Z', eventType: 'SOURCE_IMPORTED',
    workflowBefore: 'EMPTY', workflowAfter: 'INPUTS_LOADED',
    details: { target: 'topology', name: 'facility.xlsx' },
  });
  assert.equal(empty.events.length, 0);
  assert.equal(one.events[0].eventId, 'VI-EVT-000001');
  assert.equal(two.events[1].sequence, 2);
  assert.equal(two.events[1].authority.engineeringAuthority, 'NONE');
  assert.equal(two.events[1].authority.purpose, 'ACTIVITY_AUDIT_ONLY');
  assert.equal(assertVibrationIntegrityAuditLog(two), two);
  assert.ok(Object.isFrozen(two));
  assert.ok(VIBRATION_INTEGRITY_AUDIT_EVENT_TYPES.includes('RUN_EVIDENCE_EXPORT_STARTED'));
  assert.throws(() => appendVibrationIntegrityAuditEvent(two, {
    timestamp: '2026-08-15T09:02:00.000Z', eventType: 'UNDECLARED_EVENT',
    workflowBefore: 'INPUTS_LOADED', workflowAfter: 'INPUTS_LOADED', details: {},
  }), /VIBRATION_AUDIT_EVENT_TYPE_INVALID/u);
  assert.throws(() => appendVibrationIntegrityAuditEvent(two, {
    timestamp: '2026-08-15T09:02:00.000Z', eventType: 'INPUT_EDITED',
    workflowBefore: 'INPUTS_LOADED', workflowAfter: 'INPUTS_LOADED', details: { text: 'x'.repeat(5000) },
  }), /VIBRATION_AUDIT_DETAILS_INVALID/u);
  const tampered = JSON.parse(JSON.stringify(two));
  tampered.events[0].authority.purpose = 'REPRODUCIBILITY_EVIDENCE_ONLY';
  assert.throws(() => assertVibrationIntegrityAuditLog(tampered), /VIBRATION_AUDIT_AUTHORITY_INVALID/u);
});

test('audit export carries workflow state without engineering, screening or design authority', () => {
  const state = baseState({ resultState: 'CURRENT_RESULT' });
  state.auditLog = appendVibrationIntegrityAuditEvent(state.auditLog, {
    timestamp: '2026-08-15T09:03:00.000Z', eventType: 'FIT_RUN_COMPLETED',
    workflowBefore: 'RUNNING', workflowAfter: 'RESULT_CURRENT', details: { runId: 'FIT-RUN-1' },
  });
  const exported = buildVibrationIntegrityAuditExport(state, '2026-08-15T09:04:00.000Z');
  assert.equal(exported.schema, 'VibrationIntegrityAuditExport.v1');
  assert.equal(exported.workflow.state, 'RESULT_CURRENT');
  assert.equal(exported.auditLog.events.length, 1);
  assert.equal(exported.authority.engineeringAuthority, 'NONE');
  assert.equal(exported.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(exported.authority.designAuthority, false);
  assert.equal(exported.authority.purpose, 'ACTIVITY_AUDIT_ONLY');
});

test('Activity workspace exposes frozen selectors and explicit observational evidence boundaries', () => {
  const state = baseState();
  state.auditLog = appendVibrationIntegrityAuditEvent(state.auditLog, {
    timestamp: '2026-08-15T09:05:00.000Z', eventType: 'WORKSPACE_OPENED',
    workflowBefore: null, workflowAfter: 'EMPTY', details: {},
  });
  const html = renderVibrationIntegrityActivity(state);
  assert.match(html, /data-vi-workflow-state="EMPTY"/u);
  assert.match(html, /data-vi-audit-log="VibrationIntegrityAuditLog\.v1"/u);
  assert.match(html, /data-vi-audit-event="VI-EVT-000001"/u);
  assert.match(html, /data-vi-action="export-audit"/u);
  assert.match(html, /workflow state does not determine FIT result currency/iu);
  assert.match(html, /not FIT run reproducibility evidence/iu);
});

test('workspace tabs and authority vocabulary are frozen in one UI contract', () => {
  assert.deepEqual(
    VIBRATION_INTEGRITY_UI_CONTRACT.workspaceTabs.map((item) => item.id),
    ['screening', 'mechanical', 'user-data', 'activity'],
  );
  assert.equal(VIBRATION_INTEGRITY_UI_CONTRACT.version, 1);
  assert.ok(VIBRATION_INTEGRITY_UI_CONTRACT.workflowStates.includes('RESULT_STALE'));
  assert.ok(VIBRATION_INTEGRITY_UI_CONTRACT.authorityVocabulary.includes('CANDIDATE MASTER'));
});

test('Stage 5 preserves FIT reproducibility authority and adds observational hooks only', async () => {
  const [evidence, tab, mechanical, shell] = await Promise.all([
    readFile(new URL('../tabs/vibration-integrity-run-evidence.js', import.meta.url), 'utf8'),
    readFile(new URL('../tabs/vibration-integrity-tab.js', import.meta.url), 'utf8'),
    readFile(new URL('../tabs/vibration-integrity-mechanical-controller.js', import.meta.url), 'utf8'),
    readFile(new URL('../tabs/vibration-integrity-user-data-shell.js', import.meta.url), 'utf8'),
  ]);
  assert.match(evidence, /FitRunEvidencePackage\.v1/u);
  assert.match(evidence, /REPRODUCIBILITY_EVIDENCE_ONLY/u);
  assert.match(tab, /serializeVibrationIntegrityRunEvidence/u);
  assert.match(tab, /serializeVibrationIntegrityAuditExport/u);
  assert.match(tab, /FIT_RUN_COMPLETED/u);
  assert.match(tab, /RUN_EVIDENCE_EXPORT_STARTED/u);
  assert.match(mechanical, /MECHANICAL_EVALUATED/u);
  assert.match(mechanical, /MECHANICAL_NOT_APPLICABLE/u);
  assert.match(shell, /VIBRATION_INTEGRITY_UI_CONTRACT\.workspaceTabs/u);
  assert.match(shell, /workspaceTab === 'activity'/u);
  assert.doesNotMatch(`${tab}\n${mechanical}\n${shell}`, /screeningAuthority:\s*['"]AUTHORIZED/iu);
  assert.doesNotMatch(`${tab}\n${mechanical}\n${shell}`, /designAuthority:\s*true/u);
});
