const FILTER_KEYS = new Set([
  'lines',
  'caseIds',
  'statuses',
  'completenessStatuses',
  'referenceBands',
  'qualificationStates',
  'phaseEvidenceStrengths',
  'correlationEvidenceStrengths',
  'candidateForEngineeringReview',
]);
const SORT_FIELDS = new Set([
  'line',
  'caseId',
  'canonicalId',
  'status',
  'completenessStatus',
  'referenceBand',
]);

export function workspaceQueryError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationWorkspaceModelError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function normalizeStringList(value, field) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_FILTER_INVALID',
      `${field} must be an array of strings.`,
      { field },
    );
  }
  return new Set(value);
}

export function normalizeWorkspaceFilters(filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw workspaceQueryError('VIBRATION_WORKSPACE_FILTER_INVALID', 'Workspace filters must be an object.');
  }
  const unknown = Object.keys(filters).filter((key) => !FILTER_KEYS.has(key));
  if (unknown.length) {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_FILTER_UNSUPPORTED',
      `Unsupported workspace filters: ${unknown.join(', ')}.`,
      { unknown },
    );
  }
  if (filters.candidateForEngineeringReview !== undefined
      && typeof filters.candidateForEngineeringReview !== 'boolean') {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_FILTER_INVALID',
      'candidateForEngineeringReview must be boolean when supplied.',
    );
  }
  return {
    lines: normalizeStringList(filters.lines, 'lines'),
    caseIds: normalizeStringList(filters.caseIds, 'caseIds'),
    statuses: normalizeStringList(filters.statuses, 'statuses'),
    completenessStatuses: normalizeStringList(filters.completenessStatuses, 'completenessStatuses'),
    referenceBands: normalizeStringList(filters.referenceBands, 'referenceBands'),
    qualificationStates: normalizeStringList(filters.qualificationStates, 'qualificationStates'),
    phaseEvidenceStrengths: normalizeStringList(filters.phaseEvidenceStrengths, 'phaseEvidenceStrengths'),
    correlationEvidenceStrengths: normalizeStringList(filters.correlationEvidenceStrengths, 'correlationEvidenceStrengths'),
    candidateForEngineeringReview: filters.candidateForEngineeringReview,
  };
}

export function normalizeWorkspaceSort(sort = {}) {
  if (!sort || typeof sort !== 'object' || Array.isArray(sort)) {
    throw workspaceQueryError('VIBRATION_WORKSPACE_SORT_INVALID', 'Workspace sort must be an object.');
  }
  const unknown = Object.keys(sort).filter((key) => !['field', 'direction'].includes(key));
  if (unknown.length) {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_SORT_INVALID',
      `Unsupported workspace sort fields: ${unknown.join(', ')}.`,
      { unknown },
    );
  }
  const field = sort.field ?? 'line';
  const direction = sort.direction ?? 'asc';
  if (!SORT_FIELDS.has(field) || !['asc', 'desc'].includes(direction)) {
    throw workspaceQueryError(
      'VIBRATION_WORKSPACE_SORT_INVALID',
      'Workspace sort field or direction is unsupported.',
      { field, direction, allowedFields: [...SORT_FIELDS] },
    );
  }
  return { field, direction };
}

function matches(row, filters) {
  const checks = [
    ['lines', row.line],
    ['caseIds', row.caseId],
    ['statuses', row.status],
    ['completenessStatuses', row.completenessStatus],
    ['referenceBands', row.referenceBand],
    ['qualificationStates', row.qualificationState],
    ['phaseEvidenceStrengths', row.phaseEvidenceStrength],
    ['correlationEvidenceStrengths', row.correlationEvidenceStrength],
  ];
  for (const [filter, value] of checks) {
    if (filters[filter] && !filters[filter].has(value)) return false;
  }
  return filters.candidateForEngineeringReview === undefined
    || Boolean(row.candidateForEngineeringReview) === filters.candidateForEngineeringReview;
}

function textCompare(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''));
}

function sortRows(rows, sort) {
  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const primary = textCompare(a[sort.field], b[sort.field]);
    if (primary) return primary * direction;
    return (textCompare(a.line, b.line)
      || textCompare(a.caseId, b.caseId)
      || textCompare(a.canonicalId, b.canonicalId)) * direction;
  });
}

export function vibrationWorkspaceRowKey(row = {}) {
  return JSON.stringify([row.line ?? null, row.caseId ?? null, row.canonicalId ?? null]);
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = row[field];
    if (key === null || key === undefined || key === '') continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function workspaceSummary(allRows, visibleRows) {
  return {
    totalRows: allRows.length,
    visibleRows: visibleRows.length,
    calculatedRows: allRows.filter((row) => row.completenessStatus === 'CALCULATED').length,
    incompleteRows: allRows.filter((row) => row.completenessStatus === 'DATA_INCOMPLETE').length,
    calculationFailedRows: allRows.filter((row) => row.completenessStatus === 'CALCULATION_FAILED').length,
    candidateForEngineeringReviewRows: allRows.filter((row) => row.candidateForEngineeringReview).length,
    byStatus: countBy(allRows, 'status'),
    byCompleteness: countBy(allRows, 'completenessStatus'),
    byReferenceBand: countBy(allRows, 'referenceBand'),
    byQualification: countBy(allRows, 'qualificationState'),
    byPhaseEvidence: countBy(allRows, 'phaseEvidenceStrength'),
    byCorrelationEvidence: countBy(allRows, 'correlationEvidenceStrength'),
  };
}

export function buildWorkspaceQuery(registerRows, filters, sort) {
  const allRows = registerRows.map((row) => ({
    ...row,
    rowKey: vibrationWorkspaceRowKey(row),
  }));
  const visibleRows = sortRows(allRows.filter((row) => matches(row, filters)), sort);
  return {
    allRows,
    visibleRows,
    summary: workspaceSummary(allRows, visibleRows),
  };
}

export function serializeWorkspaceFilters(filters) {
  return {
    lines: filters.lines ? [...filters.lines] : null,
    caseIds: filters.caseIds ? [...filters.caseIds] : null,
    statuses: filters.statuses ? [...filters.statuses] : null,
    completenessStatuses: filters.completenessStatuses ? [...filters.completenessStatuses] : null,
    referenceBands: filters.referenceBands ? [...filters.referenceBands] : null,
    qualificationStates: filters.qualificationStates ? [...filters.qualificationStates] : null,
    phaseEvidenceStrengths: filters.phaseEvidenceStrengths ? [...filters.phaseEvidenceStrengths] : null,
    correlationEvidenceStrengths: filters.correlationEvidenceStrengths ? [...filters.correlationEvidenceStrengths] : null,
    candidateForEngineeringReview: filters.candidateForEngineeringReview ?? null,
  };
}
