export const AIV_RELEASE_VALIDATION_RECORD_SCHEMA = 'AivReleaseValidationRecord.v1';
export const AIV_RELEASE_VALIDATION_RECEIPT_SCHEMA = 'AivReleaseValidationReceipt.v1';
export const AIV_RELEASE_TARGETS = Object.freeze(['BENCHMARK_ONLY', 'SCREENING']);
export const AIV_RELEASE_EXECUTION_SOURCES = Object.freeze(['LOCAL_CONTROLLED_CHECKOUT', 'CI_RUNNER']);

const REQUIRED_GROUPS = Object.freeze({
  BENCHMARK_ONLY: Object.freeze([
    'AIV_FOCUSED_NODE_TESTS',
    'AIV_CONTROLLED_BENCHMARK_PARITY',
    'AIV_BROWSER_WORKSPACE_SMOKE',
    'AIV_MODULE_BOUNDARY_CHECK',
  ]),
  SCREENING: Object.freeze([
    'AIV_FOCUSED_NODE_TESTS',
    'AIV_CONTROLLED_BENCHMARK_PARITY',
    'AIV_BROWSER_WORKSPACE_SMOKE',
    'AIV_MODULE_BOUNDARY_CHECK',
    'AIV_REAL_PRODUCT_PATH_PARITY',
    'AIV_SINGLE_BATCH_PARITY',
    'AIV_PROJECT_INPUT_BROWSER_FLOW',
    'AIV_EXPORT_PROVENANCE',
  ]),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validationError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.name = 'AivReleaseValidationError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function sha256Value(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? '').trim().toLowerCase());
}

function commitSha(value) {
  return /^[0-9a-f]{40}$/u.test(String(value ?? '').trim().toLowerCase());
}

function isoTimestamp(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) && /T/u.test(String(value ?? ''));
}

function assertReleaseTarget(value) {
  if (!AIV_RELEASE_TARGETS.includes(value)) {
    throw validationError('AIV_RELEASE_VALIDATION_TARGET_INVALID', `Release target must be one of: ${AIV_RELEASE_TARGETS.join(', ')}.`);
  }
  return value;
}

export function createAivReleaseValidationTemplate({ releaseTarget, exactHeadSha } = {}) {
  const target = assertReleaseTarget(releaseTarget);
  if (!commitSha(exactHeadSha)) {
    throw validationError('AIV_RELEASE_VALIDATION_HEAD_REQUIRED', 'Release validation requires the exact 40-character candidate head SHA.');
  }
  return deepFreeze({
    schema: AIV_RELEASE_VALIDATION_RECORD_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    repository: 'reallaksh19/3D_Converters',
    releaseTarget: target,
    exactHeadSha: exactHeadSha.toLowerCase(),
    execution: {
      source: null,
      actualExecution: null,
      runnerId: null,
      runnerName: null,
      environment: null,
      startedAt: null,
      completedAt: null,
    },
    checks: REQUIRED_GROUPS[target].map((groupId) => ({
      groupId,
      status: 'PENDING',
      command: null,
      exitCode: null,
      outputSha256: null,
      notes: null,
    })),
    authority: {
      authorityTransitionApplied: false,
      designAuthority: false,
    },
  });
}

function assertExecution(record) {
  const execution = record?.execution ?? {};
  if (!AIV_RELEASE_EXECUTION_SOURCES.includes(execution.source)) {
    throw validationError('AIV_RELEASE_VALIDATION_EXECUTION_SOURCE_INVALID', 'Release validation requires an explicit local controlled checkout or CI runner execution source.');
  }
  if (execution.actualExecution !== true) {
    throw validationError('AIV_RELEASE_VALIDATION_NOT_RUN', 'NOT_RUN or non-executed evidence cannot satisfy a release validation gate.');
  }
  if (!nonBlank(execution.environment) || !isoTimestamp(execution.startedAt) || !isoTimestamp(execution.completedAt)) {
    throw validationError('AIV_RELEASE_VALIDATION_EXECUTION_METADATA_REQUIRED', 'Executed release validation requires environment and start/completion timestamps.');
  }
  if (Date.parse(execution.completedAt) < Date.parse(execution.startedAt)) {
    throw validationError('AIV_RELEASE_VALIDATION_EXECUTION_TIME_INVALID', 'Release validation completion time cannot precede start time.');
  }
  if (execution.source === 'CI_RUNNER') {
    if (!Number.isInteger(execution.runnerId) || execution.runnerId <= 0 || !nonBlank(execution.runnerName)) {
      throw validationError('AIV_RELEASE_VALIDATION_CI_RUNNER_REQUIRED', 'CI release evidence requires a real runner id/name; runner_id=0 cannot pass.');
    }
  }
}

function assertCheck(check, groupId) {
  if (!check || check.groupId !== groupId) {
    throw validationError('AIV_RELEASE_VALIDATION_CHECK_SET_INVALID', `Missing exact release validation group ${groupId}.`);
  }
  if (check.status !== 'PASS' || check.exitCode !== 0) {
    throw validationError('AIV_RELEASE_VALIDATION_CHECK_NOT_PASS', `${groupId} must have status PASS and exitCode 0.`);
  }
  if (!nonBlank(check.command) || !sha256Value(check.outputSha256)) {
    throw validationError('AIV_RELEASE_VALIDATION_CHECK_EVIDENCE_REQUIRED', `${groupId} requires the executed command and SHA-256 of its output/log evidence.`);
  }
}

export function verifyAivReleaseValidationRecord(record, { expectedHeadSha } = {}) {
  if (record?.schema !== AIV_RELEASE_VALIDATION_RECORD_SCHEMA || record?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw validationError('AIV_RELEASE_VALIDATION_SCHEMA_INVALID', `Expected ${AIV_RELEASE_VALIDATION_RECORD_SCHEMA} for VIB.AIV.ACOUSTIC.`);
  }
  if (record.repository !== 'reallaksh19/3D_Converters') {
    throw validationError('AIV_RELEASE_VALIDATION_REPOSITORY_INVALID', 'Release validation record must identify reallaksh19/3D_Converters.');
  }
  const target = assertReleaseTarget(record.releaseTarget);
  if (!commitSha(record.exactHeadSha)) {
    throw validationError('AIV_RELEASE_VALIDATION_HEAD_INVALID', 'Release validation record contains an invalid candidate head SHA.');
  }
  if (expectedHeadSha !== undefined && String(record.exactHeadSha).toLowerCase() !== String(expectedHeadSha).toLowerCase()) {
    throw validationError('AIV_RELEASE_VALIDATION_HEAD_MISMATCH', 'Release validation was not executed against the expected candidate head SHA.', {
      expectedHeadSha,
      actualHeadSha: record.exactHeadSha,
    });
  }
  assertExecution(record);
  if (record?.authority?.authorityTransitionApplied !== false || record?.authority?.designAuthority !== false) {
    throw validationError('AIV_RELEASE_VALIDATION_AUTHORITY_MUTATION_FORBIDDEN', 'Release validation evidence cannot itself mutate AIV authority.');
  }
  if (!Array.isArray(record.checks) || record.checks.length !== REQUIRED_GROUPS[target].length) {
    throw validationError('AIV_RELEASE_VALIDATION_CHECK_SET_INVALID', `Release target ${target} requires exactly ${REQUIRED_GROUPS[target].length} validation groups.`);
  }
  REQUIRED_GROUPS[target].forEach((groupId, index) => assertCheck(record.checks[index], groupId));
  return deepFreeze({
    schema: AIV_RELEASE_VALIDATION_RECEIPT_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    repository: record.repository,
    releaseTarget: target,
    exactHeadSha: record.exactHeadSha.toLowerCase(),
    exactHeadValidated: true,
    status: 'PASS',
    executionSource: record.execution.source,
    validationGroupCount: REQUIRED_GROUPS[target].length,
    validationGroups: [...REQUIRED_GROUPS[target]],
    authorityTransitionApplied: false,
    productionEquationAuthorized: false,
    screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false,
  });
}
