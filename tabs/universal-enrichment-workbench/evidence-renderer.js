export const LEDGER_PAGE_SIZE = 200;
export const TRACE_RENDER_LIMIT = 200;
export const TRACE_RENDER_STEP = 200;

function setText(element, value) {
  if (element) element.textContent = value === '' || value == null ? '—' : String(value);
}

function setFindings(element, findings) {
  if (!element) return;
  const documentRef = element.ownerDocument;
  const values = findings?.length ? findings : ['None'];
  element.replaceChildren(...values.map((text) => {
    const item = documentRef.createElement('li'); item.textContent = text; return item;
  }));
}

function matchingEntries(state) {
  const ledger = state.ledger;
  if (!ledger) return [];
  if (state.view === 'diagnostics') return [];
  const wantedStatus = state.view === 'candidates' ? 'candidate' : 'rejected';
  const entityNeedle = state.entityFilter.trim().toLowerCase();
  const fieldNeedle = state.fieldFilter.trim().toLowerCase();
  const textNeedle = state.search.trim().toLowerCase();
  return ledger.entries.filter((entry) => {
    if (entry.status !== wantedStatus) return false;
    if (entityNeedle && !entry.entityId.toLowerCase().includes(entityNeedle)) return false;
    if (fieldNeedle && !entry.fieldKey.toLowerCase().includes(fieldNeedle)) return false;
    const text = JSON.stringify(entry).toLowerCase();
    return !textNeedle || text.includes(textNeedle);
  });
}

function entryLabel(entry) {
  const value = entry.candidates?.[0]?.value;
  return `${entry.sourceOrder} · ${entry.fieldKey} · ${entry.entityId} · ${entry.status}${value == null ? '' : ` · ${value}`}`;
}

export function renderLedgerTable(elements, state) {
  const body = elements['evidence-ledger-list']; if (!body) return;
  if (state.view === 'diagnostics') {
    body.replaceChildren();
    setText(elements['evidence-ledger-count'], 'Diagnostics');
    elements['evidence-ledger-prev'].disabled = true;
    elements['evidence-ledger-next'].disabled = true;
    return;
  }
  const entries = matchingEntries(state);
  const start = state.page * LEDGER_PAGE_SIZE;
  const visible = entries.slice(start, start + LEDGER_PAGE_SIZE);
  const documentRef = body.ownerDocument;
  body.replaceChildren(...visible.map((entry) => {
    const button = documentRef.createElement('button');
    button.type = 'button'; button.className = 'uew-evidence-row';
    button.dataset.evidenceAction = 'select-entry'; button.dataset.entryId = entry.entryId;
    button.textContent = entryLabel(entry); return button;
  }));
  setText(elements['evidence-ledger-count'], `${visible.length} of ${entries.length}`);
  elements['evidence-ledger-prev'].disabled = state.page === 0;
  elements['evidence-ledger-next'].disabled = start + LEDGER_PAGE_SIZE >= entries.length;
}

function visibleTraceNodes(trace, expandedIds, limit) {
  if (!trace?.rootTraceNodeIds?.length) return [];
  const byId = new Map(trace.nodes.map((node) => [node.traceNodeId, node]));
  const rows = []; const stack = trace.rootTraceNodeIds.slice().reverse().map((id) => ({ id, depth: 0 }));
  while (stack.length && rows.length < limit) {
    const current = stack.pop(); const node = byId.get(current.id); if (!node) continue;
    rows.push({ node, depth: current.depth });
    if (!expandedIds.has(node.traceNodeId)) continue;
    [...node.childTraceNodeIds].reverse().forEach((id) => stack.push({ id, depth: current.depth + 1 }));
  }
  return rows;
}

export function renderEvidenceTrace(elements, state) {
  const tree = elements['evidence-trace-tree']; if (!tree) return;
  const probe = visibleTraceNodes(state.trace, state.expandedTraceIds, state.traceLimit + 1);
  const rows = probe.slice(0, state.traceLimit);
  const documentRef = tree.ownerDocument;
  tree.replaceChildren(...rows.map(({ node, depth }) => {
    const row = documentRef.createElement('div'); row.className = 'uew-evidence-trace-row'; row.style.paddingLeft = `${depth * 16}px`;
    const toggle = documentRef.createElement('button'); toggle.type = 'button';
    toggle.dataset.evidenceAction = 'toggle-trace'; toggle.dataset.traceNodeId = node.traceNodeId;
    toggle.textContent = node.childTraceNodeIds.length ? (state.expandedTraceIds.has(node.traceNodeId) ? '−' : '+') : '·';
    const select = documentRef.createElement('button'); select.type = 'button';
    select.dataset.evidenceAction = 'select-trace'; select.dataset.traceNodeId = node.traceNodeId;
    select.textContent = node.label; row.append(toggle, select); return row;
  }));
  setText(elements['evidence-trace-count'], `${rows.length} visible`);
  elements['evidence-trace-more'].hidden = probe.length <= state.traceLimit;
}

export function renderEvidenceDetails(elements, state) {
  const entry = state.ledger?.entries.find((item) => item.entryId === state.selectedEntryId);
  const node = state.trace?.nodes.find((item) => item.traceNodeId === state.selectedTraceNodeId);
  setText(elements['evidence-entry-details'], entry ? JSON.stringify(entry, null, 2) : 'Select a ledger entry.');
  setText(elements['evidence-trace-details'], node ? JSON.stringify(node, null, 2) : 'Select a trace node.');
}

export function renderEvidencePanel(elements, state) {
  const ledger = state.ledger; const trace = state.trace;
  setText(elements['evidence-status'], state.status);
  setText(elements['evidence-ledger-id'], ledger?.ledgerId);
  setText(elements['evidence-trace-id'], trace?.traceId);
  setText(elements['evidence-entry-count'], ledger?.summary?.entryCount || 0);
  setText(elements['evidence-candidate-count'], ledger?.summary?.candidateCount || 0);
  setText(elements['evidence-rejected-count'], ledger?.summary?.rejectedEntryCount || 0);
  setText(elements['evidence-entity-count'], ledger?.summary?.entityCount || 0);
  setText(elements['evidence-field-count'], ledger?.summary?.fieldCount || 0);
  const errors = [...(ledger?.validation?.errors || []), ...(trace?.validation?.errors || [])];
  const warnings = [...(ledger?.validation?.warnings || []), ...(trace?.validation?.warnings || [])];
  setFindings(elements['evidence-errors'], errors); setFindings(elements['evidence-warnings'], warnings);
  renderLedgerTable(elements, state); renderEvidenceTrace(elements, state); renderEvidenceDetails(elements, state);
}
