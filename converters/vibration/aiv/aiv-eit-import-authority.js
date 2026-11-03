export const AIV_EIT_IMPORT_RESULT_AUTHORITY = 'REVIEW_REQUIRED';

function finite(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function classifyImportedAivEitLine(line = {}) {
  const modernAssessmentTrace = String(line.aivAuthorityScope ?? '').toUpperCase() === 'ASSESSMENT'
    && Boolean(String(line.aivAssessmentCanonicalId ?? '').trim());
  return Object.freeze({
    importedAivLof: finite(line.aiv),
    importedPwlDb: finite(line.pwl),
    importedResultAuthority: AIV_EIT_IMPORT_RESULT_AUTHORITY,
    importedResultKind: modernAssessmentTrace
      ? 'PRIOR_ASSESSMENT_SCREENING_TRACE'
      : 'LEGACY_LINE_LEVEL_RESULT',
    currentScreeningAuthority: false,
    requiresRegisteredRerun: true,
    assessmentCanonicalId: modernAssessmentTrace ? String(line.aivAssessmentCanonicalId) : null,
    configuredLineCaseTraceLof: finite(line.aivConfiguredLineCaseTraceLof),
    configuredLineCaseTraceAuthoritative: false,
    designAuthority: false,
  });
}
