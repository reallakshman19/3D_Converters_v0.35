export const AIV_SOURCE_RESULT_SCHEMA = 'AivSourceResult.v1';
export const AIV_ASSESSMENT_RESULT_SCHEMA = 'AivAssessmentResult.v1';
export const AIV_LINE_CASE_SUMMARY_SCHEMA = 'AivLineCaseSummary.v1';
export const AIV_RESULT_SET_SCHEMA = 'AivResultSet.v1';
export const AIV_RESULT_STATUS = Object.freeze({ NOT_CALCULATED: 'NOT_CALCULATED' });

const BLOCKED_AUTHORITY = Object.freeze({
  calculationState: 'BLOCKED',
  qualificationState: 'BLOCKED',
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function resultError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'AivResultContractError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function assertEnvelope(envelope) {
  if (envelope?.schema !== 'AivReadinessTableEnvelope.v2') {
    throw resultError(
      'AIV_RESULT_READINESS_ENVELOPE_REQUIRED',
      'AIV blocked result shells require AivReadinessTableEnvelope.v2.',
      { actual: envelope?.schema ?? null },
    );
  }
  for (const key of ['sources', 'assessments', 'sourceAssessments']) {
    if (!Array.isArray(envelope[key])) {
      throw resultError('AIV_RESULT_READINESS_ENVELOPE_INVALID', `AIV readiness envelope ${key} must be an array.`, { key });
    }
  }
  if (!Array.isArray(envelope.readiness?.rows)) {
    throw resultError('AIV_RESULT_READINESS_ENVELOPE_INVALID', 'AIV readiness envelope must contain readiness rows.');
  }
  return envelope;
}

function inputRecordTrace(record) {
  if (!record) return null;
  return {
    source: record.source ?? null,
    sourceRevision: record.sourceRevision ?? null,
    recordId: record.recordId ?? null,
    status: record.status ?? null,
    reviewer: record.reviewer ?? null,
  };
}

function readinessRollup(rows) {
  const statuses = [...new Set(rows.map((row) => row.status))].sort((a, b) => a.localeCompare(b));
  return {
    relationshipCount: rows.length,
    statuses,
    readyForQualification: rows.filter((row) => row.status === 'READY_FOR_QUALIFICATION').length,
    methodGap: rows.filter((row) => row.status === 'METHOD_GAP').length,
    notReady: rows.filter((row) => row.status === 'NOT_READY').length,
    notApplicable: rows.filter((row) => row.status === 'NOT_APPLICABLE').length,
  };
}

function sourceResult(source, readinessRows) {
  const rows = readinessRows.filter((row) => (
    row.sourceCanonicalId === source.sourceCanonicalId && row.caseId === source.caseId
  ));
  return {
    schema: AIV_SOURCE_RESULT_SCHEMA,
    resultScope: 'SOURCE',
    calculationId: 'VIB.AIV.ACOUSTIC',
    status: AIV_RESULT_STATUS.NOT_CALCULATED,
    reasonCode: 'AIV_NUMERICAL_AUTHORITY_BLOCKED',
    sourceCanonicalId: source.sourceCanonicalId,
    caseId: source.caseId,
    sourceDeviceType: source.sourceDeviceType,
    sourceState: source.sourceState,
    phase: source.phase,
    rawSourcePwlDb: null,
    sonicFlowFactorDb: null,
    trimReductionDb: null,
    effectiveSourcePwlDb: null,
    thresholdBranch: null,
    readiness: readinessRollup(rows),
    authority: BLOCKED_AUTHORITY,
    trace: {
      inputRecord: inputRecordTrace(source),
      relationshipRowKeys: rows.map((row) => row.rowKey),
      numericalTrace: null,
    },
  };
}

function assessmentGroupKey(assessmentCanonicalId, caseId) {
  return JSON.stringify([assessmentCanonicalId, caseId]);
}

function relationshipContributionShell(row) {
  return {
    sourceCanonicalId: row.sourceCanonicalId,
    status: AIV_RESULT_STATUS.NOT_CALCULATED,
    pointPwlDb: null,
    physicalDistance: row.physicalDistance ?? null,
    applicabilityDisposition: row.applicabilityDisposition,
    simultaneousSourceGroup: row.simultaneousSourceGroup ?? null,
    readinessStatus: row.status,
    topologyPath: row.topology ?? null,
    relationshipTrace: row.relationshipTrace ?? null,
  };
}

function buildAssessmentResults(envelope) {
  const assessmentById = new Map(envelope.assessments.map((row) => [row.assessmentCanonicalId, row]));
  const groups = new Map();
  for (const row of envelope.readiness.rows) {
    const key = assessmentGroupKey(row.assessmentCanonicalId, row.caseId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((rows) => {
    const first = rows[0];
    const assessment = assessmentById.get(first.assessmentCanonicalId) ?? null;
    const sourceIds = [...new Set(rows.map((row) => row.sourceCanonicalId))].sort((a, b) => a.localeCompare(b));
    return {
      schema: AIV_ASSESSMENT_RESULT_SCHEMA,
      resultScope: 'ASSESSMENT',
      calculationId: 'VIB.AIV.ACOUSTIC',
      status: AIV_RESULT_STATUS.NOT_CALCULATED,
      reasonCode: 'AIV_NUMERICAL_AUTHORITY_BLOCKED',
      assessmentCanonicalId: first.assessmentCanonicalId,
      assessmentType: assessment?.assessmentType ?? first.assessmentType ?? null,
      line: first.assessmentLine ?? null,
      caseId: first.caseId,
      contributingSourceCanonicalIds: sourceIds,
      sourceContributionsAtPoint: rows.map(relationshipContributionShell),
      combinedPointPwlDb: null,
      geometry: assessment ? {
        mainOutsideDiameter: assessment.mainOutsideDiameter,
        mainInsideDiameter: assessment.mainInsideDiameter,
        mainWallThickness: assessment.mainWallThickness,
        branchOutsideDiameter: assessment.branchOutsideDiameter ?? null,
        branchWallThickness: assessment.branchWallThickness ?? null,
        material: assessment.material,
        duplexState: assessment.duplexState,
      } : null,
      t26Intermediates: null,
      lof: null,
      readiness: readinessRollup(rows),
      authority: BLOCKED_AUTHORITY,
      trace: {
        inputRecord: inputRecordTrace(assessment),
        relationshipRowKeys: rows.map((row) => row.rowKey),
        numericalTrace: null,
      },
    };
  }).sort((a, b) => String(a.line ?? '').localeCompare(String(b.line ?? ''))
    || a.assessmentCanonicalId.localeCompare(b.assessmentCanonicalId)
    || a.caseId.localeCompare(b.caseId));
}

function lineCaseKey(line, caseId) { return JSON.stringify([line, caseId]); }

function buildLineCaseSummaries(assessmentResults) {
  const groups = new Map();
  for (const result of assessmentResults) {
    const key = lineCaseKey(result.line, result.caseId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  return [...groups.values()].map((results) => {
    const first = results[0];
    const sourceIds = [...new Set(results.flatMap((result) => result.contributingSourceCanonicalIds))]
      .sort((a, b) => a.localeCompare(b));
    return {
      schema: AIV_LINE_CASE_SUMMARY_SCHEMA,
      resultScope: 'LINE_CASE_SUMMARY',
      calculationId: 'VIB.AIV.ACOUSTIC',
      status: AIV_RESULT_STATUS.NOT_CALCULATED,
      reasonCode: 'AIV_NUMERICAL_AUTHORITY_BLOCKED',
      line: first.line,
      caseId: first.caseId,
      lof: null,
      controllingAssessmentCanonicalId: null,
      controllingSourceCanonicalIds: Object.freeze([]),
      assessmentCount: results.length,
      assessmentCanonicalIds: results.map((result) => result.assessmentCanonicalId).sort((a, b) => a.localeCompare(b)),
      sourceCanonicalIds: sourceIds,
      authority: BLOCKED_AUTHORITY,
      trace: {
        aggregationState: 'NOT_PERFORMED_AUTHORITY_BLOCKED',
        sourceAssessmentResultSchemas: Object.freeze([...new Set(results.map((result) => result.schema))]),
        numericalTrace: null,
      },
    };
  }).sort((a, b) => String(a.line ?? '').localeCompare(String(b.line ?? '')) || a.caseId.localeCompare(b.caseId));
}

export function buildAivBlockedResultSet(envelopeInput) {
  const envelope = assertEnvelope(envelopeInput);
  const sourceResults = envelope.sources
    .map((source) => sourceResult(source, envelope.readiness.rows))
    .sort((a, b) => a.sourceCanonicalId.localeCompare(b.sourceCanonicalId) || a.caseId.localeCompare(b.caseId));
  const assessmentResults = buildAssessmentResults(envelope);
  const lineCaseSummaries = buildLineCaseSummaries(assessmentResults);
  return deepFreeze({
    schema: AIV_RESULT_SET_SCHEMA,
    calculationId: 'VIB.AIV.ACOUSTIC',
    status: AIV_RESULT_STATUS.NOT_CALCULATED,
    reasonCode: 'AIV_NUMERICAL_AUTHORITY_BLOCKED',
    authority: BLOCKED_AUTHORITY,
    sourceResultSchema: AIV_SOURCE_RESULT_SCHEMA,
    assessmentResultSchema: AIV_ASSESSMENT_RESULT_SCHEMA,
    lineCaseSummarySchema: AIV_LINE_CASE_SUMMARY_SCHEMA,
    sourceResults,
    assessmentResults,
    lineCaseSummaries,
    counts: {
      sources: sourceResults.length,
      assessments: assessmentResults.length,
      lineCaseSummaries: lineCaseSummaries.length,
    },
    notes: Object.freeze([
      'Result shells freeze Source, Assessment and Line/Case scopes before numerical qualification.',
      'All engineering numerical fields remain null while VIB.AIV.ACOUSTIC is BLOCKED.',
      'A NOT_CALCULATED shell is not a zero result, pass/fail result, or screening disposition.',
    ]),
  });
}
