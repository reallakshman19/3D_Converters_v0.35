export const ENRICHMENT_PROPOSAL_PAGE_SIZE = 200;
export const ENRICHMENT_PROPOSAL_STEP = 200;

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

function proposalMap(proposalSet) {
  return new Map((proposalSet?.proposals || []).map((item) => [item.proposalId, item]));
}

function groupRows(proposalSet, view) {
  const status = view === 'single' ? 'single-proposal' : `${view}-proposals`;
  return (proposalSet?.groups || []).filter((item) => item.status === status);
}

function filtersMatch(row, state, proposals, kind) {
  const entity = String(state.entityFilter || '').toLowerCase();
  const field = String(state.fieldFilter || '').toLowerCase();
  const dataset = String(state.datasetFilter || '').toLowerCase();
  const status = String(state.statusFilter || '').toLowerCase();
  const search = String(state.search || '').toLowerCase();
  const linked = kind === 'group' ? row.proposalIds.map((id) => proposals.get(id)).filter(Boolean) : [];
  const datasetText = kind === 'group'
    ? linked.map((item) => item.datasetId).join(' ').toLowerCase()
    : String(row.datasetId || '').toLowerCase();
  const rowStatus = kind === 'group' ? row.status : row.disposition;
  const text = `${JSON.stringify(row)} ${linked.map((item) => JSON.stringify(item)).join(' ')}`.toLowerCase();
  return (!entity || String(row.entityId).toLowerCase().includes(entity))
    && (!field || String(row.fieldKey).toLowerCase().includes(field))
    && (!dataset || datasetText.includes(dataset))
    && (!status || String(rowStatus).toLowerCase().includes(status))
    && (!search || text.includes(search));
}

function currentRows(state) {
  const proposalSet = state.proposalSet; const proposals = proposalMap(proposalSet);
  if (state.view === 'excluded') {
    return (proposalSet?.exclusions || []).filter((row) => filtersMatch(row, state, proposals, 'exclusion'))
      .map((row) => ({ kind: 'exclusion', row }));
  }
  if (state.view === 'diagnostics') return [];
  return groupRows(proposalSet, state.view).filter((row) => filtersMatch(row, state, proposals, 'group'))
    .map((row) => ({ kind: 'group', row }));
}

function rowIdentity(item) {
  return item.kind === 'group' ? item.row.proposalGroupId : item.row.exclusionId;
}

function renderRows(elements, state) {
  const rows = currentRows(state); const start = state.page * ENRICHMENT_PROPOSAL_PAGE_SIZE;
  const visible = rows.slice(start, start + ENRICHMENT_PROPOSAL_PAGE_SIZE);
  const documentRef = elements['proposal-row-list'].ownerDocument;
  elements['proposal-row-list'].replaceChildren(...visible.map((item) => {
    const button = documentRef.createElement('button'); const id = rowIdentity(item);
    button.type = 'button'; button.className = `uew-review-row${id === state.selectedEvidenceId ? ' is-selected' : ''}`;
    button.dataset.proposalEvidenceId = id; button.dataset.proposalEvidenceKind = item.kind;
    button.textContent = item.kind === 'group'
      ? `${item.row.sourceOrder} · ${item.row.entityId} · ${item.row.fieldKey} · ${item.row.status}`
      : `${item.row.sourceOrder} · ${item.row.entityId} · ${item.row.fieldKey} · ${item.row.disposition}`;
    return button;
  }));
  setText(elements['proposal-visible-count'], `${Math.min(start + visible.length, rows.length)} / ${rows.length}`);
  elements['proposal-prev'].disabled = start === 0;
  elements['proposal-next'].disabled = start + ENRICHMENT_PROPOSAL_PAGE_SIZE >= rows.length;
}

function selectedEvidence(state) {
  const proposalSet = state.proposalSet;
  const group = (proposalSet?.groups || []).find((item) => item.proposalGroupId === state.selectedEvidenceId);
  if (group) return { kind: 'group', row: group };
  const exclusion = (proposalSet?.exclusions || []).find((item) => item.exclusionId === state.selectedEvidenceId);
  return exclusion ? { kind: 'exclusion', row: exclusion } : null;
}

function selectedProposals(state) {
  const selected = selectedEvidence(state); if (selected?.kind !== 'group') return [];
  const proposals = proposalMap(state.proposalSet);
  return selected.row.proposalIds.map((id) => proposals.get(id)).filter(Boolean);
}

function renderSelected(elements, state) {
  const selected = selectedEvidence(state); const proposals = selectedProposals(state);
  elements['proposal-details'].textContent = selected
    ? JSON.stringify({ label: 'Non-final proposal evidence', ...selected, proposals }, null, 2)
    : 'Build and select proposal evidence.';
  const visible = proposals.slice(0, state.proposalLimit); const documentRef = elements['proposal-entry-list'].ownerDocument;
  elements['proposal-entry-list'].replaceChildren(...visible.map((proposal) => {
    const pre = documentRef.createElement('pre'); pre.className = 'uew-review-match';
    pre.textContent = JSON.stringify({ label: 'Non-final proposal evidence', ...proposal }, null, 2); return pre;
  }));
  setText(elements['proposal-entry-count'], `${visible.length} / ${proposals.length}`);
  elements['proposal-entry-more'].disabled = visible.length >= proposals.length;
}

function renderSummary(elements, state) {
  const summary = state.proposalSet?.summary || {};
  setText(elements['proposal-status'], state.status); setText(elements['proposal-set-id'], state.proposalSet?.proposalSetId || '');
  setText(elements['proposal-count'], summary.proposalCount || 0); setText(elements['proposal-excluded-count'], summary.excludedCount || 0);
  setText(elements['proposal-single-count'], summary.singleProposalGroupCount || 0);
  setText(elements['proposal-equivalent-count'], summary.equivalentProposalGroupCount || 0);
  setText(elements['proposal-conflicting-count'], summary.conflictingProposalGroupCount || 0);
}

export function renderEnrichmentProposalPanel(elements, state) {
  renderSummary(elements, state); renderRows(elements, state); renderSelected(elements, state);
  const validation = state.proposalSet?.validation || state.authorityValidation || { errors: [], warnings: [] };
  renderFindings(elements['proposal-errors'], validation.errors || []);
  renderFindings(elements['proposal-warnings'], validation.warnings || []);
}
