import { createComparisonReviewSubjects } from './review-ledger.js';
import { normalizeComparisonReviewDraft, reviewNoteCodePointLength, reviewSubjectKey } from './review-draft.js';

export const REVIEW_PAGE_SIZE = 200;
export const REVIEW_MATCH_STEP = 200;

function setText(element, value) {
  if (element) element.textContent = value === '' || value == null ? '—' : String(value);
}

function renderFindings(element, values) {
  if (!element) return;
  const documentRef = element.ownerDocument; const rows = values?.length ? values : ['None'];
  element.replaceChildren(...rows.map((text) => {
    const item = documentRef.createElement('li'); item.textContent = text; return item;
  }));
}

function currentSubjects(state, upstream) {
  return createComparisonReviewSubjects(upstream?.run).map((subject) => ({
    subject, key: reviewSubjectKey(subject), draft: normalizeComparisonReviewDraft(state.drafts.get(reviewSubjectKey(subject)), subject),
  }));
}

function viewMatches(row, view) {
  const disposition = row.draft.disposition;
  if (view === 'pending') return disposition === 'unreviewed';
  if (view === 'confirmed') return disposition === 'confirm-match';
  if (view === 'rejected') return disposition === 'reject-result';
  if (view === 'deferred') return disposition === 'defer';
  return false;
}

function filterRows(rows, state) {
  if (state.view === 'diagnostics') return [];
  const needles = [state.entityFilter,state.fieldFilter,state.datasetFilter,state.statusFilter,state.search]
    .map((value) => String(value || '').toLowerCase());
  return rows.filter((row) => {
    if (!viewMatches(row, state.view)) return false;
    const subject = row.subject; const text = JSON.stringify(subject).toLowerCase();
    return (!needles[0] || String(subject.entityId).toLowerCase().includes(needles[0]))
      && (!needles[1] || String(subject.fieldKey).toLowerCase().includes(needles[1]))
      && (!needles[2] || String(subject.datasetId || '').toLowerCase().includes(needles[2]))
      && (!needles[3] || String(subject.status || 'unbound').toLowerCase().includes(needles[3]))
      && (!needles[4] || text.includes(needles[4]));
  });
}

function renderSubjectList(elements, state, upstream) {
  const documentRef = elements['review-subject-list'].ownerDocument;
  const filtered = filterRows(currentSubjects(state, upstream), state);
  const start = state.page * REVIEW_PAGE_SIZE; const rows = filtered.slice(start, start + REVIEW_PAGE_SIZE);
  elements['review-subject-list'].replaceChildren(...rows.map((row) => {
    const button = documentRef.createElement('button'); button.type = 'button';
    button.className = `uew-review-row${row.key === state.selectedSubjectKey ? ' is-selected' : ''}`;
    button.dataset.reviewSubjectKey = row.key;
    button.textContent = `${row.subject.sourceOrder ?? ''} · ${row.subject.fieldKey} · ${row.subject.status || 'unbound'} · ${row.draft.disposition}`;
    return button;
  }));
  setText(elements['review-visible-count'], `${Math.min(start + rows.length, filtered.length)} / ${filtered.length}`);
  elements['review-prev'].disabled = start === 0; elements['review-next'].disabled = start + REVIEW_PAGE_SIZE >= filtered.length;
}

function selectedRow(state, upstream) {
  return currentSubjects(state, upstream).find((row) => row.key === state.selectedSubjectKey) || null;
}

function renderMatchOptions(element, row) {
  const documentRef = element.ownerDocument; const placeholder = documentRef.createElement('option');
  placeholder.value = ''; placeholder.textContent = 'Select an exact retained match';
  const options = (row?.subject.matches || []).map((match) => {
    const option = documentRef.createElement('option'); option.value = match.matchId;
    option.textContent = `${match.rowSourceOrder} · ${match.rowId} · ${JSON.stringify(match.masterValue)}`; return option;
  });
  element.replaceChildren(placeholder, ...options); element.value = row?.draft.selectedMatchId || '';
  const status = row?.subject.status; element.disabled = row?.draft.disposition !== 'confirm-match'
    || !['unique-match','multiple-match'].includes(status);
}

function renderSelected(elements, state, upstream) {
  const row = selectedRow(state, upstream); const draft = row?.draft;
  elements['review-details'].textContent = row ? JSON.stringify(row.subject, null, 2) : 'Select a review subject.';
  elements['review-disposition'].value = draft?.disposition || 'unreviewed';
  elements['review-disposition'].disabled = !row;
  renderMatchOptions(elements['review-selected-match'], row);
  elements['review-note'].value = draft?.note || ''; elements['review-note'].disabled = !row;
  setText(elements['review-note-count'], `${reviewNoteCodePointLength(draft?.note || '')} / 1000`);
}

function renderMatches(elements, state, upstream) {
  const row = selectedRow(state, upstream); const matches = row?.subject.matches || [];
  const visible = matches.slice(0, state.matchLimit); const documentRef = elements['review-match-list'].ownerDocument;
  elements['review-match-list'].replaceChildren(...visible.map((match) => {
    const pre = documentRef.createElement('pre'); pre.className = 'uew-review-match';
    pre.textContent = JSON.stringify(match, null, 2); return pre;
  }));
  setText(elements['review-match-count'], `${visible.length} / ${matches.length}`);
  elements['review-match-more'].disabled = visible.length >= matches.length;
}

function renderSummary(elements, state) {
  const summary = state.ledger?.summary || {
    unreviewedCount: [...state.drafts.values()].filter((item) => item.disposition === 'unreviewed').length,
    confirmedCount: [...state.drafts.values()].filter((item) => item.disposition === 'confirm-match').length,
    rejectedCount: [...state.drafts.values()].filter((item) => item.disposition === 'reject-result').length,
    deferredCount: [...state.drafts.values()].filter((item) => item.disposition === 'defer').length,
  };
  setText(elements['review-status'], state.status); setText(elements['review-ledger-id'], state.ledger?.reviewLedgerId || '');
  setText(elements['review-pending-count'], summary.unreviewedCount || 0); setText(elements['review-confirmed-count'], summary.confirmedCount || 0);
  setText(elements['review-rejected-count'], summary.rejectedCount || 0); setText(elements['review-deferred-count'], summary.deferredCount || 0);
}

export function renderComparisonReviewPanel(elements, state, upstream) {
  renderSummary(elements, state); renderSubjectList(elements, state, upstream);
  renderSelected(elements, state, upstream); renderMatches(elements, state, upstream);
  const validation = state.ledger?.validation || state.authorityValidation || { errors: [], warnings: [] };
  renderFindings(elements['review-errors'], validation.errors || []); renderFindings(elements['review-warnings'], validation.warnings || []);
}
