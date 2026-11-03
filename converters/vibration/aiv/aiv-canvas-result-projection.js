function text(value) { return String(value ?? '').trim(); }

function domainResult(screeningResult) {
  return screeningResult?.outputs ?? screeningResult?.evidence?.domainResult ?? screeningResult ?? {};
}

function sourceResultMap(result) {
  return new Map((result.sourceResults ?? []).map((item) => [`${text(item.sourceCanonicalId)}\u0000${text(item.caseId)}`, item]));
}

function assessmentResultsMap(result) {
  const map = new Map();
  for (const item of result.assessmentResults ?? []) {
    const id = text(item.assessmentCanonicalId);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(item);
  }
  return map;
}

function contributionMap(result) {
  const map = new Map();
  for (const assessment of result.assessmentResults ?? []) {
    for (const item of assessment.sourceContributionsAtPoint ?? []) {
      const key = `${text(item.sourceCanonicalId)}\u0000${text(item.assessmentCanonicalId)}\u0000${text(item.caseId)}`;
      map.set(key, item);
    }
  }
  return map;
}

function cloneContribution(item) {
  return {
    ...item,
    trace: item?.trace ? { ...item.trace, traceIds: [...(item.trace.traceIds ?? [])] } : null,
  };
}

export function buildAivCanvasAssessmentResultSummary(results = []) {
  const cases = results.map((item) => ({
    caseId: text(item.caseId),
    status: text(item.status) || null,
    combinedPointPwlDb: item.combinedPointPwlDb ?? null,
    contributingSourceCanonicalIds: [...(item.contributingSourceCanonicalIds ?? [])],
    sourceContributionsAtPoint: (item.sourceContributionsAtPoint ?? []).map(cloneContribution),
    t26Intermediates: item.t26Intermediates ? { ...item.t26Intermediates } : null,
    lof: item.lof ?? null,
    resultScope: text(item.resultScope) || 'ASSESSMENT',
    authority: item.authority ? { ...item.authority } : null,
  })).sort((a, b) => a.caseId.localeCompare(b.caseId));
  if (!cases.length) return null;
  return cases.length === 1 ? cases[0] : { caseCount: cases.length, cases };
}

export function buildAivCanvasResultIndex(screeningResult) {
  const result = domainResult(screeningResult);
  return Object.freeze({
    sourceResults: sourceResultMap(result),
    assessmentResults: assessmentResultsMap(result),
    contributions: contributionMap(result),
    lineCaseSummaries: Object.freeze((result.lineCaseSummaries ?? []).map((item) => Object.freeze({ ...item }))),
  });
}
