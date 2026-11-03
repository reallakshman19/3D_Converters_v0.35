function addMessage(list, className, text) { const item = document.createElement('li'); item.className = className; item.textContent = text; list.appendChild(item); }
function mapSummary(title, value) { const box = document.createElement('div'); box.className = 'json-viewer-diagnostics-counts'; const heading = document.createElement('b'); heading.textContent = title; const rows = Object.entries(value || {}); const text = document.createElement('span'); text.textContent = rows.length ? rows.map(([key, count]) => `${key}: ${count}`).join(' · ') : 'none'; box.append(heading, text); return box; }
function messageText(message) { if (!message || typeof message !== 'object') return String(message); const code = message.code ? `${message.code}: ` : ''; return `${code}${message.message || message.text || 'Diagnostic message'}`; }

function diagnosticRows(diagnostics, workerDiagnostics, renderPlanDiagnostics) {
  const modelMessages = Array.isArray(diagnostics?.messages) ? diagnostics.messages : [];
  return [
    ...workerDiagnostics.map((item) => ({ source: 'worker', ...item })),
    ...renderPlanDiagnostics.map((item) => ({ source: 'render-plan', ...item })),
    ...modelMessages.map((item) => ({ source: 'stage-model', ...item })),
  ];
}

function refText(message) {
  const ref = message?.ref || {};
  return ref.primitiveId || ref.nodeId || ref.componentId || ref.recordOffset || '';
}

function diagnosticTable(rows) {
  const table = document.createElement('table'); table.className = 'json-viewer-diagnostics-table';
  const head = document.createElement('thead'); const header = document.createElement('tr');
  for (const text of ['Severity', 'Code', 'Message', 'Native Code', 'Ref']) { const th = document.createElement('th'); th.textContent = text; header.appendChild(th); }
  head.appendChild(header); table.appendChild(head);
  const body = document.createElement('tbody');
  for (const row of rows.slice(0, 80)) body.appendChild(diagnosticRow(row));
  table.appendChild(body); return table;
}

function diagnosticRow(message) {
  const tr = document.createElement('tr'); tr.className = `is-${message.severity || 'info'}`;
  for (const value of [message.severity || 'info', message.code || '', message.message || message.text || '', message.ref?.nativeCode ?? '', refText(message)]) { const td = document.createElement('td'); td.textContent = String(value || '—'); tr.appendChild(td); }
  return tr;
}

export function renderDiagnostics(target, diagnostics, validationErrors = [], renderPlanDiagnostics = [], workerDiagnostics = []) {
  target.replaceChildren();
  const title = document.createElement('h2'); title.className = 'json-viewer-panel-title'; title.textContent = 'Diagnostics';
  const summary = document.createElement('div'); summary.className = 'json-viewer-diagnostics-summary';
  summary.append(mapSummary('severityCounts', diagnostics?.severityCounts), mapSummary('fallbackCounts', diagnostics?.fallbackCounts), mapSummary('renderKindCounts', diagnostics?.renderKindCounts));
  const list = document.createElement('ul'); list.className = 'json-viewer-diagnostics-list';
  for (const error of validationErrors) addMessage(list, 'is-error', `validation: ${error}`);
  const rows = diagnosticRows(diagnostics, workerDiagnostics, renderPlanDiagnostics);
  if (!validationErrors.length && !rows.length) addMessage(list, 'is-info', diagnostics ? 'No diagnostics messages reported.' : 'Diagnostics summary placeholder');
  target.append(title, summary, list, diagnosticTable(rows));
}
