import {
  VIBRATION_INTEGRITY_WORKFLOW_STATES,
  deriveVibrationIntegrityWorkflowState,
} from './vibration-integrity-workflow-state.js';

export const VIBRATION_INTEGRITY_AUDIT_SCHEMA = 'VibrationIntegrityAuditLog.v1';
export const VIBRATION_INTEGRITY_AUDIT_EVENT_SCHEMA = 'VibrationIntegrityAuditEvent.v1';
export const VIBRATION_INTEGRITY_AUDIT_EXPORT_SCHEMA = 'VibrationIntegrityAuditExport.v1';

export const VIBRATION_INTEGRITY_AUDIT_EVENT_TYPES = Object.freeze([
  'WORKSPACE_OPENED', 'WORKSPACE_TAB_OPENED',
  'BENCHMARK_LOADED', 'SOURCE_IMPORTED', 'SOURCE_IMPORT_FAILED',
  'INPUT_EDITED', 'INPUT_ROW_ADDED', 'INPUT_ROW_DELETED', 'INPUT_REVERTED',
  'READINESS_STARTED', 'READINESS_COMPLETED', 'READINESS_FAILED',
  'FIT_RUN_STARTED', 'FIT_RUN_COMPLETED', 'FIT_RUN_FAILED', 'RESULT_STALE',
  'MECHANICAL_INPUTS_OPENED', 'MECHANICAL_SOURCES_CHANGED',
  'MECHANICAL_EVALUATION_STARTED', 'MECHANICAL_EVALUATED',
  'MECHANICAL_EVALUATION_FAILED', 'MECHANICAL_NOT_APPLICABLE', 'MECHANICAL_INPUTS_CLEARED',
  'USER_DATA_CHANGED', 'SBC_INPUTS_OPENED', 'SBC_TYPE3_EVALUATED',
  'REGISTER_EXPORTED', 'RUN_EVIDENCE_EXPORT_STARTED', 'RUN_EVIDENCE_EXPORTED', 'AUDIT_EXPORTED',
]);

const EVENT_SET = new Set(VIBRATION_INTEGRITY_AUDIT_EVENT_TYPES);
const WORKFLOW_SET = new Set(VIBRATION_INTEGRITY_WORKFLOW_STATES);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function jsonClone(value) {
  if (value === undefined) return {};
  const text = JSON.stringify(value);
  if (text === undefined || text.length > 4096) throw new TypeError('VIBRATION_AUDIT_DETAILS_INVALID');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('VIBRATION_AUDIT_DETAILS_INVALID');
  }
  return parsed;
}

function workflowValue(value, code, allowNull = false) {
  if (allowNull && (value === null || value === undefined)) return null;
  const text = String(value ?? '').trim();
  if (!WORKFLOW_SET.has(text)) throw new TypeError(code);
  return text;
}

function auditEventId(sequence) {
  return `VI-EVT-${String(sequence).padStart(6, '0')}`;
}

function assertAuditEvent(event, index) {
  const sequence = index + 1;
  if (event?.schema !== VIBRATION_INTEGRITY_AUDIT_EVENT_SCHEMA
      || event.sequence !== sequence || event.eventId !== auditEventId(sequence)) {
    throw new TypeError('VIBRATION_AUDIT_EVENT_INVALID');
  }
  const eventType = String(event.eventType ?? '').trim();
  if (!EVENT_SET.has(eventType)) throw new TypeError(`VIBRATION_AUDIT_EVENT_TYPE_INVALID:${eventType}`);
  if (!String(event.timestamp ?? '').trim() || Number.isNaN(Date.parse(event.timestamp))) {
    throw new TypeError('VIBRATION_AUDIT_TIMESTAMP_INVALID');
  }
  workflowValue(event.workflowBefore, 'VIBRATION_AUDIT_WORKFLOW_BEFORE_INVALID', true);
  workflowValue(event.workflowAfter, 'VIBRATION_AUDIT_WORKFLOW_AFTER_INVALID');
  jsonClone(event.details);
  if (event.authority?.engineeringAuthority !== 'NONE'
      || event.authority?.purpose !== 'ACTIVITY_AUDIT_ONLY') {
    throw new TypeError('VIBRATION_AUDIT_AUTHORITY_INVALID');
  }
}

export function createVibrationIntegrityAuditLog() {
  return deepFreeze({ schema: VIBRATION_INTEGRITY_AUDIT_SCHEMA, events: [] });
}

export function assertVibrationIntegrityAuditLog(log) {
  if (log?.schema !== VIBRATION_INTEGRITY_AUDIT_SCHEMA || !Array.isArray(log.events)) {
    throw new TypeError('VIBRATION_AUDIT_LOG_INVALID');
  }
  log.events.forEach(assertAuditEvent);
  return log;
}

export function appendVibrationIntegrityAuditEvent(log, event = {}) {
  assertVibrationIntegrityAuditLog(log);
  const eventType = String(event.eventType ?? '').trim();
  if (!EVENT_SET.has(eventType)) throw new TypeError(`VIBRATION_AUDIT_EVENT_TYPE_INVALID:${eventType}`);
  const timestamp = String(event.timestamp ?? '').trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) throw new TypeError('VIBRATION_AUDIT_TIMESTAMP_INVALID');
  const sequence = log.events.length + 1;
  const scopeId = event.scopeId === null || event.scopeId === undefined
    ? null : String(event.scopeId).trim() || null;
  const record = {
    schema: VIBRATION_INTEGRITY_AUDIT_EVENT_SCHEMA,
    sequence,
    eventId: auditEventId(sequence),
    timestamp,
    eventType,
    workflowBefore: workflowValue(event.workflowBefore, 'VIBRATION_AUDIT_WORKFLOW_BEFORE_INVALID', true),
    workflowAfter: workflowValue(event.workflowAfter, 'VIBRATION_AUDIT_WORKFLOW_AFTER_INVALID'),
    scopeId,
    details: jsonClone(event.details),
    authority: Object.freeze({ engineeringAuthority: 'NONE', purpose: 'ACTIVITY_AUDIT_ONLY' }),
  };
  return deepFreeze({ schema: VIBRATION_INTEGRITY_AUDIT_SCHEMA, events: [...log.events, record] });
}

export function buildVibrationIntegrityAuditExport(state = {}, exportedAt = new Date().toISOString()) {
  const log = assertVibrationIntegrityAuditLog(state.auditLog);
  return deepFreeze({
    schema: VIBRATION_INTEGRITY_AUDIT_EXPORT_SCHEMA,
    exportedAt,
    workflow: deriveVibrationIntegrityWorkflowState(state),
    resultState: state.resultState ?? 'UNRUN',
    auditLog: log,
    authority: {
      engineeringAuthority: 'NONE',
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
      purpose: 'ACTIVITY_AUDIT_ONLY',
    },
  });
}

export function serializeVibrationIntegrityAuditExport(state = {}, exportedAt) {
  return `${JSON.stringify(buildVibrationIntegrityAuditExport(state, exportedAt), null, 2)}\n`;
}
