export const REVIEW_DISPOSITIONS = Object.freeze([
  'unreviewed', 'confirm-match', 'reject-result', 'defer',
]);

export function normalizeReviewNote(value) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value;
}

export function reviewNoteCodePointLength(value) {
  return typeof value === 'string' ? [...value].length : -1;
}

export function reviewSubjectKey(subject) {
  if (!subject) return '';
  if (subject.subjectKind === 'comparison-result') return `result:${subject.comparisonResultId}`;
  return `unbound:${subject.entryId}:${subject.candidateId}`;
}

export function normalizeComparisonReviewDraft(draft = {}, subject = null) {
  const disposition = REVIEW_DISPOSITIONS.includes(draft.disposition)
    ? draft.disposition : 'unreviewed';
  return {
    subjectKey: reviewSubjectKey(subject) || String(draft.subjectKey || ''),
    disposition,
    selectedMatchId: disposition === 'confirm-match' ? String(draft.selectedMatchId || '') : '',
    note: normalizeReviewNote(draft.note ?? ''),
  };
}
