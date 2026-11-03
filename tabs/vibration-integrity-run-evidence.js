import { assertVibrationIntegrityAuditLog } from './vibration-integrity-audit-log.js';

export const FIT_RUN_EVIDENCE_SCHEMA = 'FitRunEvidencePackage.v1';
export const VIBRATION_AUDIT_IDENTITY_SCHEMA = 'VibrationIntegrityAuditIdentity.v1';

const FIT_CALCULATION_ID = 'VIB.FIV.FLOW_TURBULENCE';
const SNAPSHOT_SCHEMA = 'FitRunSnapshot.v1';
const ENGINEERING_INPUT_SCHEMA = 'FitEngineeringInputIdentity.v1';
const TABULAR_WORKFLOW_SCHEMA = 'VibrationFacilityFitTabularWorkflow.v1';
const WORKFLOW_SCHEMA = 'VibrationFacilityFitWorkflow.v1';
const SHA256 = /^[0-9a-f]{64}$/u;

function evidenceError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'FitRunEvidenceError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw evidenceError(
    'FIT_RUN_EVIDENCE_CRYPTO_UNAVAILABLE',
    'Web Crypto SHA-256 is required for FIT run-evidence verification.',
  );
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function jsonClone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

async function assertSnapshot(snapshot) {
  const valid = snapshot?.schema === SNAPSHOT_SCHEMA
    && snapshot?.engineeringInputSchema === ENGINEERING_INPUT_SCHEMA
    && typeof snapshot?.runId === 'string' && snapshot.runId.trim()
    && SHA256.test(String(snapshot?.snapshotHash ?? ''))
    && SHA256.test(String(snapshot?.engineeringInputHash ?? ''))
    && typeof snapshot?.canonicalInput === 'string'
    && typeof snapshot?.engineeringCanonicalInput === 'string'
    && snapshot?.input && typeof snapshot.input === 'object'
    && snapshot?.engineeringInput && typeof snapshot.engineeringInput === 'object';
  if (!valid) {
    throw evidenceError('FIT_RUN_EVIDENCE_SNAPSHOT_INVALID', 'Current FIT result requires a complete dual-hash run snapshot.');
  }
  if (stableJson(snapshot.input) !== snapshot.canonicalInput
      || stableJson(snapshot.engineeringInput) !== snapshot.engineeringCanonicalInput) {
    throw evidenceError('FIT_RUN_EVIDENCE_SNAPSHOT_DRIFT', 'Run snapshot canonical payload no longer matches captured input.');
  }
  const [auditHash, engineeringHash] = await Promise.all([
    sha256Hex(snapshot.canonicalInput),
    sha256Hex(snapshot.engineeringCanonicalInput),
  ]);
  if (auditHash !== snapshot.snapshotHash || engineeringHash !== snapshot.engineeringInputHash) {
    throw evidenceError('FIT_RUN_EVIDENCE_HASH_MISMATCH', 'Run snapshot SHA-256 identity does not match its canonical payload.');
  }
  return snapshot;
}

function coherentExecutionAuthority(envelope, workflow) {
  if (envelope.qualificationMode === 'benchmark') {
    return envelope.engineeringAuthority === 'NONE'
      && envelope.screeningAuthorized === false
      && workflow.engineeringAuthority === 'NONE'
      && workflow.screeningAuthorized === false;
  }
  if (envelope.qualificationMode === 'screening') {
    return envelope.engineeringAuthority === 'SCREENING'
      && envelope.screeningAuthorized === true
      && workflow.engineeringAuthority === 'SCREENING'
      && workflow.screeningAuthorized === true;
  }
  return false;
}

function assertExecution(envelope) {
  const workflow = envelope?.workflow;
  const valid = envelope?.schema === TABULAR_WORKFLOW_SCHEMA
    && workflow?.schema === WORKFLOW_SCHEMA
    && workflow?.qualificationMode === envelope?.qualificationMode
    && workflow?.result?.calculationId === FIT_CALCULATION_ID
    && coherentExecutionAuthority(envelope, workflow);
  if (!valid) {
    throw evidenceError('FIT_RUN_EVIDENCE_EXECUTION_INVALID', 'FIT evidence requires a coherent central benchmark or bounded-screening workflow result.');
  }
  return envelope;
}

function fileDescriptor(file) {
  if (!file) return null;
  return {
    name: file.name ?? null,
    format: file.format ?? null,
    kind: file.kind ?? null,
    projectionSchema: file.projectionSchema ?? null,
    projectionHash: file.projectionHash ?? null,
    fileHashSchema: file.fileHashSchema ?? null,
    fileHash: file.fileHash ?? null,
  };
}

function sourceFiles(files = {}) {
  return {
    topology: fileDescriptor(files.topology),
    operating: fileDescriptor(files.operating),
    enrichment: fileDescriptor(files.enrichment),
    dataBlockers: fileDescriptor(files.dataBlockers),
  };
}

function benchmarkEvidence(benchmark) {
  if (!benchmark) return null;
  return {
    id: benchmark.id ?? null,
    label: benchmark.label ?? null,
    sourceLocation: benchmark.sourceLocation ?? null,
    source: jsonClone(benchmark.source ?? null),
    identity: jsonClone(benchmark.identity ?? null),
    published: jsonClone(benchmark.published ?? null),
    modified: benchmark.modified === true,
  };
}

async function auditEvidence(auditLog) {
  if (!auditLog) return Object.freeze({ trail: null, identity: null });
  let trail;
  try {
    trail = jsonClone(assertVibrationIntegrityAuditLog(auditLog));
  } catch (error) {
    throw evidenceError('FIT_RUN_EVIDENCE_AUDIT_INVALID', 'Run evidence received an invalid Vibration Integrity audit trail.', {
      cause: String(error?.message || error),
    });
  }
  const hash = await sha256Hex(stableJson(trail));
  return Object.freeze({
    trail,
    identity: Object.freeze({ schema: VIBRATION_AUDIT_IDENTITY_SCHEMA, algorithm: 'SHA-256', hash }),
  });
}

export async function buildVibrationIntegrityRunEvidence(state = {}) {
  if (state.resultState !== 'CURRENT_RESULT') {
    throw evidenceError('FIT_RUN_EVIDENCE_RESULT_NOT_CURRENT', 'Only a CURRENT_RESULT may be exported as FIT reproducibility evidence.', {
      resultState: state.resultState ?? 'UNRUN',
    });
  }
  const snapshot = await assertSnapshot(state.runSnapshot);
  const envelope = assertExecution(state.envelope);
  const audit = await auditEvidence(state.auditLog);
  return deepFreeze({
    schema: FIT_RUN_EVIDENCE_SCHEMA,
    calculationId: FIT_CALCULATION_ID,
    qualificationMode: envelope.qualificationMode,
    resultState: state.resultState,
    authority: {
      engineeringAuthority: envelope.engineeringAuthority,
      screeningAuthorized: envelope.screeningAuthorized,
      designAuthority: false,
      purpose: 'REPRODUCIBILITY_EVIDENCE_ONLY',
    },
    run: jsonClone(snapshot),
    auditTrail: audit.trail,
    auditTrailIdentity: audit.identity,
    sources: {
      files: sourceFiles(state.files),
      benchmark: benchmarkEvidence(state.benchmark?.loaded ?? null),
    },
    execution: jsonClone(envelope),
  });
}

export async function serializeVibrationIntegrityRunEvidence(state = {}) {
  return `${JSON.stringify(await buildVibrationIntegrityRunEvidence(state), null, 2)}\n`;
}
