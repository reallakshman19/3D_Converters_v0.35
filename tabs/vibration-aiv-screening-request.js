function text(value) {
  return String(value ?? '').trim();
}

function screeningRequestError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'AivScreeningRequestError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function assertRecords(rows, label, identityFields) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw screeningRequestError(
      'AIV_SCREENING_REQUEST_TABLE_REQUIRED',
      `${label} must contain at least one record before screening.`,
      { label },
    );
  }
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw screeningRequestError(
        'AIV_SCREENING_REQUEST_RECORD_INVALID',
        `${label} record ${index + 1} is missing or invalid. Recheck AIV readiness before screening.`,
        { label, index },
      );
    }
    const missing = identityFields.filter((field) => !text(row[field]));
    if (missing.length) {
      throw screeningRequestError(
        'AIV_SCREENING_REQUEST_IDENTITY_REQUIRED',
        `${label} record ${index + 1} is missing screening identity: ${missing.join(', ')}.`,
        { label, index, missing },
      );
    }
  });
  return rows;
}

function assertReadiness(envelope) {
  if (envelope?.schema !== 'AivReadinessTableEnvelope.v2') {
    throw screeningRequestError(
      'AIV_SCREENING_REQUEST_READINESS_REQUIRED',
      'Run AIV readiness again before screening.',
    );
  }
  const counts = envelope.readiness?.counts;
  if (!counts || Number(counts.readyForQualification) < 1
    || Number(counts.notReady) !== 0 || Number(counts.methodGap) !== 0) {
    throw screeningRequestError(
      'AIV_SCREENING_REQUEST_NOT_READY',
      'AIV screening requires at least one READY_FOR_QUALIFICATION relationship and no NOT_READY or METHOD_GAP blockers.',
      { counts: counts ?? null },
    );
  }
  assertRecords(envelope.readiness?.rows, 'Readiness', [
    'sourceCanonicalId', 'assessmentCanonicalId', 'caseId',
  ]);
}

function assertJoinIntegrity(sources, assessments, relationships) {
  const sourceKeys = new Set(sources.map((row) => `${row.sourceCanonicalId}\u0000${row.caseId}`));
  const assessmentIds = new Set(assessments.map((row) => row.assessmentCanonicalId));
  for (const [index, row] of relationships.entries()) {
    const sourceKey = `${row.sourceCanonicalId}\u0000${row.caseId}`;
    if (!sourceKeys.has(sourceKey) || !assessmentIds.has(row.assessmentCanonicalId)) {
      throw screeningRequestError(
        'AIV_SCREENING_REQUEST_JOIN_INVALID',
        `Source→Assessment record ${index + 1} no longer matches the readiness-qualified Source/Assessment identities. Recheck readiness.`,
        {
          index,
          sourceCanonicalId: row.sourceCanonicalId,
          assessmentCanonicalId: row.assessmentCanonicalId,
          caseId: row.caseId,
        },
      );
    }
  }
}

export function buildAivEngineeringScreeningRequest({ readinessEnvelope, assumptionProfile } = {}) {
  assertReadiness(readinessEnvelope);
  const sources = assertRecords(readinessEnvelope.sources, 'Sources', ['sourceCanonicalId', 'caseId']);
  const assessments = assertRecords(readinessEnvelope.assessments, 'Assessments', ['assessmentCanonicalId']);
  const relationships = assertRecords(readinessEnvelope.sourceAssessments, 'Source→Assessment', [
    'sourceCanonicalId', 'assessmentCanonicalId', 'caseId',
  ]);
  if (!readinessEnvelope.exchange || typeof readinessEnvelope.exchange !== 'object') {
    throw screeningRequestError(
      'AIV_SCREENING_REQUEST_TOPOLOGY_REQUIRED',
      'The readiness-qualified topology exchange is missing. Recheck AIV readiness.',
    );
  }
  assertJoinIntegrity(sources, assessments, relationships);
  return Object.freeze({
    calculationId: 'VIB.AIV.ACOUSTIC',
    inputs: Object.freeze({
      sources,
      assessments,
      relationships,
      topology: readinessEnvelope.exchange,
      assumptionProfile,
    }),
    options: Object.freeze({ qualificationMode: 'screening', includeEvidence: true }),
  });
}
