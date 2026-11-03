const FLAG = '__xmlCiiMatchedPreviewUi_v2';
const STORAGE_KEY = 'xmlCii2019.matchedPreview.lastDiagnostics.v1';
const PREVIEW_EVENT = 'xml-cii-matched-preview:diagnostics';

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function text(value) {
  return value == null ? '' : String(value);
}

function clean(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function esc(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonParse(raw, fallback = null) {
  try {
    const parsed = JSON.parse(raw || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readStored() {
  try { return safeJsonParse(window.localStorage.getItem(STORAGE_KEY), null); } catch { return null; }
}

function writeStored(payload) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload || {}, null, 2)); } catch {}
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePayload(payload, source = 'diagnostics-json') {
  if (!payload || typeof payload !== 'object') {
    return { matchedFacts: [], rejectedFacts: [], diagnostics: [], stats: {}, source: 'none' };
  }
  return {
    ...payload,
    matchedFacts: asArray(payload.matchedFacts).filter((fact) => fact?.status === 'MATCHED'),
    rejectedFacts: asArray(payload.rejectedFacts),
    diagnostics: asArray(payload.diagnostics),
    stats: payload.stats && typeof payload.stats === 'object' ? payload.stats : {},
    source: payload.source || source,
  };
}

function parseDiagnosticPayload(raw) {
  const payload = safeJsonParse(raw, null);
  return normalizePayload(payload, 'diagnostics-json');
}

function factValue(fact) {
  return typeof fact?.value === 'object' ? JSON.stringify(fact.value) : text(fact?.value);
}

function factKey(fact) {
  return [fact?.source, fact?.itemType, fact?.basis, fact?.key, fact?.resolvedNodeNumber, factValue(fact)].map(text).join(' ').toLowerCase();
}

function summarizeFacts(facts) {
  const byItem = new Map();
  const bySource = new Map();
  for (const fact of facts || []) {
    byItem.set(fact.itemType || '(none)', (byItem.get(fact.itemType || '(none)') || 0) + 1);
    bySource.set(fact.source || '(none)', (bySource.get(fact.source || '(none)') || 0) + 1);
  }
  return { byItem, bySource };
}

function renderFactRows(facts, maxRows = 300) {
  const rows = (facts || []).slice(0, maxRows);
  if (!rows.length) return '<div class="model-converters-muted">No matched rows loaded. Run XML→CII or import an enrichment diagnostics JSON.</div>';
  return `
    <div class="mc-preview-wrap xml-cii-preview-table-wrap">
      <table class="mc-preview-node-table xml-cii-preview-table--fixed" style="min-width:100%;font-size:11px;">
        <thead>
          <tr>
            <th>Source</th>
            <th>Item</th>
            <th>Basis</th>
            <th>Key</th>
            <th>Node</th>
            <th>Value</th>
            <th>Action</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows.map((fact) => `
          <tr>
            <td>${esc(fact.source || '')}</td>
            <td>${esc(fact.itemType || '')}</td>
            <td>${esc(fact.basis || '')}</td>
            <td title="${esc(fact.key || '')}">${esc(fact.key || '')}</td>
            <td>${esc(fact.resolvedNodeNumber || '')}</td>
            <td title="${esc(factValue(fact))}">${esc(factValue(fact))}</td>
            <td>${esc(fact.action || '')}</td>
            <td>${esc(fact.status || '')}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
    ${(facts || []).length > maxRows ? `<div style="color:#9aa8ba;font-size:11px;margin-top:6px;">Showing first ${maxRows} of ${facts.length} matched rows.</div>` : ''}`;
}

function renderSummary(payload, filteredFacts) {
  const summary = summarizeFacts(filteredFacts);
  const itemText = Array.from(summary.byItem.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`).join(' · ');
  const sourceText = Array.from(summary.bySource.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`).join(' · ');
  return `
    <div class="model-converters-workflow-preview-grid">
      <div><span>Matched rows</span><strong>${esc(filteredFacts.length)}</strong></div>
      <div><span>Rejected hidden</span><strong>${esc(asArray(payload.rejectedFacts).length)}</strong></div>
      <div><span>Diagnostics rows</span><strong>${esc(asArray(payload.diagnostics).length)}</strong></div>
      <div><span>Source</span><strong>${esc(payload.source || 'none')}</strong></div>
    </div>
    <div style="margin-top:8px;font-size:12px;color:#d7e6ff;">${itemText || 'No matched item summary'}</div>
    <div style="margin-top:4px;font-size:12px;color:#9aa8ba;">${sourceText || ''}</div>`;
}

function panelHtml() {
  return `
    <details id="model-converters-xml-cii-matched-preview" class="model-converters-workflow" open>
      <summary>XML→CII Matched Preview <span title="Matched Preview shows only resolved items that will be applied to enriched XML/CII. Load Node/PS/POS side-load data in Sideload → Restraints. Unmatched, duplicate, or invalid side-load rows are shown in Sideload → Diagnostics." style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:1px solid #6b83a6;color:#9cc5ff;font-size:11px;margin-left:6px;">i</span></summary>
      <div class="model-converters-workflow-detail-text" style="margin:8px 0 10px;">
        Matched Preview is read-only and matched-only. It auto-loads the latest XML→CII run diagnostics when available; manual JSON import remains as fallback.
      </div>
      <div class="model-converters-workflow-master-card">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input id="mc-matched-preview-diagnostics-file" type="file" accept=".json,application/json">
          <input id="mc-matched-preview-filter" type="search" placeholder="Filter source/item/node/key/value" style="min-width:260px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;">
          <button type="button" class="model-converters-run-btn" id="mc-matched-preview-load">Load Diagnostics</button>
          <button type="button" class="model-converters-download-btn" id="mc-matched-preview-refresh">Refresh Latest Run</button>
          <button type="button" class="model-converters-download-btn" id="mc-matched-preview-clear">Clear</button>
        </div>
        <div id="mc-matched-preview-status" style="font-size:12px;color:#9aa8ba;margin-top:8px;"></div>
      </div>
      <div id="mc-matched-preview-summary" class="model-converters-workflow-master-card"></div>
      <div id="mc-matched-preview-table" class="model-converters-workflow-master-card"></div>
    </details>`;
}

function renderPayload(root, payload) {
  const normalized = normalizePayload(payload, payload?.source || 'stored');
  const filter = clean(root.querySelector('#mc-matched-preview-filter')?.value || '').toLowerCase();
  const matched = asArray(normalized?.matchedFacts).filter((fact) => fact?.status === 'MATCHED');
  const filtered = filter ? matched.filter((fact) => factKey(fact).includes(filter)) : matched;
  const summary = root.querySelector('#mc-matched-preview-summary');
  const table = root.querySelector('#mc-matched-preview-table');
  const status = root.querySelector('#mc-matched-preview-status');
  if (summary) summary.innerHTML = renderSummary(normalized || {}, filtered);
  if (table) table.innerHTML = renderFactRows(filtered);
  if (status) {
    status.style.color = '#9aa8ba';
    status.textContent = matched.length === filtered.length ? `${matched.length} matched rows loaded.` : `${filtered.length} of ${matched.length} matched rows shown by filter.`;
  }
}

async function loadFromFile(root) {
  const file = root.querySelector('#mc-matched-preview-diagnostics-file')?.files?.[0];
  if (!file) throw new Error('Select an enrichment diagnostics JSON file first.');
  const payload = parseDiagnosticPayload(await file.text());
  writeStored(payload);
  return payload;
}

function loadLatestStored(root) {
  const payload = readStored();
  if (!payload) throw new Error('No latest run diagnostics stored yet. Run XML→CII or import a diagnostics JSON.');
  renderPayload(root, payload);
  return payload;
}

export function installXmlCiiMatchedPreviewUi(container = document) {
  if (!browserReady() || window[FLAG]) return;
  window[FLAG] = true;
  const root = container || document;

  const ensurePanel = () => {
    const workflow = root.querySelector('#model-converters-xml-cii-workflow');
    if (!workflow || root.querySelector('#model-converters-xml-cii-matched-preview')) return;
    const sideload = root.querySelector('#model-converters-xml-cii-sideload');
    (sideload || workflow).insertAdjacentHTML('afterend', panelHtml());
    bindPanel(root);
    const stored = readStored();
    if (stored) renderPayload(root, stored);
    else renderPayload(root, { matchedFacts: [], rejectedFacts: [], diagnostics: [], stats: {}, source: 'none' });
  };

  ensurePanel();
  const observer = new MutationObserver(() => ensurePanel());
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });

  window.addEventListener(PREVIEW_EVENT, (event) => {
    const payload = normalizePayload(event?.detail, 'latest-run');
    writeStored(payload);
    if (root.querySelector('#model-converters-xml-cii-matched-preview')) renderPayload(root, payload);
  });
}

function bindPanel(root) {
  root.querySelector('#mc-matched-preview-load')?.addEventListener('click', async () => {
    const status = root.querySelector('#mc-matched-preview-status');
    try {
      const payload = await loadFromFile(root);
      renderPayload(root, payload);
    } catch (error) {
      if (status) { status.textContent = clean(error?.message || error); status.style.color = '#ff8888'; }
    }
  });
  root.querySelector('#mc-matched-preview-refresh')?.addEventListener('click', () => {
    const status = root.querySelector('#mc-matched-preview-status');
    try {
      loadLatestStored(root);
    } catch (error) {
      if (status) { status.textContent = clean(error?.message || error); status.style.color = '#ff8888'; }
    }
  });
  root.querySelector('#mc-matched-preview-filter')?.addEventListener('input', () => {
    const payload = readStored() || { matchedFacts: [], rejectedFacts: [], diagnostics: [], stats: {}, source: 'none' };
    renderPayload(root, payload);
  });
  root.querySelector('#mc-matched-preview-clear')?.addEventListener('click', () => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
    const input = root.querySelector('#mc-matched-preview-diagnostics-file');
    if (input) input.value = '';
    renderPayload(root, { matchedFacts: [], rejectedFacts: [], diagnostics: [], stats: {}, source: 'none' });
  });
}
