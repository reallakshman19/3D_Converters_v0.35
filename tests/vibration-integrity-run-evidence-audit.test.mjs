import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendVibrationIntegrityAuditEvent,
  createVibrationIntegrityAuditLog,
} from '../tabs/vibration-integrity-audit-log.js';
import {
  VIBRATION_AUDIT_IDENTITY_SCHEMA,
  buildVibrationIntegrityRunEvidence,
} from '../tabs/vibration-integrity-run-evidence.js';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function runSnapshot() {
  const input = { schema: 'FitWorkingInputState.v1' };
  const engineeringInput = {
    schema: 'FitEngineeringInputIdentity.v1',
    qualificationMode: 'screening',
    requests: [],
  };
  const canonicalInput = stableJson(input);
  const engineeringCanonicalInput = stableJson(engineeringInput);
  return {
    schema: 'FitRunSnapshot.v1',
    engineeringInputSchema: 'FitEngineeringInputIdentity.v1',
    runId: 'FIT-RUN-AUDIT-001',
    snapshotHash: await sha256Hex(canonicalInput),
    engineeringInputHash: await sha256Hex(engineeringCanonicalInput),
    canonicalInput,
    engineeringCanonicalInput,
    input,
    engineeringInput,
  };
}

function auditLog() {
  const opened = appendVibrationIntegrityAuditEvent(createVibrationIntegrityAuditLog(), {
    eventType: 'WORKSPACE_OPENED',
    timestamp: '2026-08-15T06:00:00.000Z',
    workflowBefore: null,
    workflowAfter: 'EMPTY',
    details: { product: 'Vibration Integrity' },
  });
  return appendVibrationIntegrityAuditEvent(opened, {
    eventType: 'FIT_RUN_COMPLETED',
    timestamp: '2026-08-15T06:02:00.000Z',
    workflowBefore: 'RUNNING',
    workflowAfter: 'RESULT_CURRENT',
    details: { drifted: false, runId: 'FIT-RUN-AUDIT-001' },
  });
}

function envelope() {
  return {
    schema: 'VibrationFacilityFitTabularWorkflow.v1',
    qualificationMode: 'screening',
    engineeringAuthority: 'SCREENING',
    screeningAuthorized: true,
    workflow: {
      schema: 'VibrationFacilityFitWorkflow.v1',
      qualificationMode: 'screening',
      engineeringAuthority: 'SCREENING',
      screeningAuthorized: true,
      result: { calculationId: 'VIB.FIV.FLOW_TURBULENCE', rows: [] },
    },
  };
}

async function evidenceState(overrides = {}) {
  return {
    resultState: 'CURRENT_RESULT',
    runSnapshot: await runSnapshot(),
    auditLog: auditLog(),
    envelope: envelope(),
    files: {},
    benchmark: {},
    ...overrides,
  };
}

test('run evidence carries and fingerprints the immutable non-authoritative activity trail', async () => {
  const evidence = await buildVibrationIntegrityRunEvidence(await evidenceState());
  assert.equal(evidence.auditTrail.schema, 'VibrationIntegrityAuditLog.v1');
  assert.deepEqual(evidence.auditTrail.events.map((event) => event.eventType), ['WORKSPACE_OPENED', 'FIT_RUN_COMPLETED']);
  assert.equal(evidence.auditTrail.events[1].authority.engineeringAuthority, 'NONE');
  assert.equal(evidence.auditTrail.events[1].authority.purpose, 'ACTIVITY_AUDIT_ONLY');
  assert.equal(evidence.auditTrailIdentity.schema, VIBRATION_AUDIT_IDENTITY_SCHEMA);
  assert.equal(evidence.auditTrailIdentity.algorithm, 'SHA-256');
  assert.match(evidence.auditTrailIdentity.hash, /^[0-9a-f]{64}$/u);
  assert.equal(evidence.auditTrailIdentity.hash, await sha256Hex(stableJson(evidence.auditTrail)));
  assert.equal(evidence.authority.purpose, 'REPRODUCIBILITY_EVIDENCE_ONLY');
  assert.equal(Object.isFrozen(evidence), true);
});

test('run evidence rejects a structurally tampered activity trail', async () => {
  const valid = auditLog();
  const auditLogTampered = { ...valid, events: [{ ...valid.events[0], sequence: 7 }, valid.events[1]] };
  await assert.rejects(
    async () => buildVibrationIntegrityRunEvidence(await evidenceState({ auditLog: auditLogTampered })),
    (error) => error?.code === 'FIT_RUN_EVIDENCE_AUDIT_INVALID',
  );
});

test('run evidence rejects invalid activity type, timestamp or promoted authority', async () => {
  const valid = auditLog();
  const badType = { ...valid, events: [{ ...valid.events[0], eventType: 'UNKNOWN_EVENT' }, valid.events[1]] };
  const badTime = { ...valid, events: [{ ...valid.events[0], timestamp: 'not-a-time' }, valid.events[1]] };
  const badAuthority = {
    ...valid,
    events: [{ ...valid.events[0], authority: { engineeringAuthority: 'SCREENING', purpose: 'ACTIVITY_AUDIT_ONLY' } }, valid.events[1]],
  };
  for (const auditLogTampered of [badType, badTime, badAuthority]) {
    await assert.rejects(
      async () => buildVibrationIntegrityRunEvidence(await evidenceState({ auditLog: auditLogTampered })),
      (error) => error?.code === 'FIT_RUN_EVIDENCE_AUDIT_INVALID',
    );
  }
});
