const FLAG = '__xmlCiiWorkflowPopupPolish_v1';
const DIAGNOSTICS_STORAGE_KEY = 'xmlCii2019.matchedPreview.lastDiagnostics.v1';
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readStoredDiagnostics() {
  try { return safeJsonParse(window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY), null); } catch { return null; }
}

function supportConfigHasSideload() {
  const raw = document.querySelector('[data-option-key="supportConfigJson"]')?.value || '{}';
  const cfg = safeJsonParse(raw, {}) || {};
  return !!clean(cfg?.sideload?.restraintsText || '');
}

function diagnosticsStats() {
  const payload = readStoredDiagnostics() || {};
  const matched = asArray(payload.matchedFacts).filter((fact) => fact?.status === 'MATCHED');
  const rejected = asArray(payload.rejectedFacts);
  const diagnostics = asArray(payload.diagnostics);
  const manualMatched = matched.filter((fact) => fact?.source === 'MANUAL_SIDELOAD');
  const duplicateRejected = rejected.filter((fact) => /DUPLICATE/i.test(text(fact?.status || fact?.reason || fact?.code || fact?.error)));
  return { payload, matched, rejected, diagnostics, manualMatched, duplicateRejected };
}

function downloadText(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const s = text(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function diagnosticsToCsv(rows) {
  const header = ['status', 'source', 'itemType', 'basis', 'key', 'resolvedNodeNumber', 'value', 'message'];
  const lines = [header.join(',')];
  asArray(rows).forEach((row) => {
    const message = row?.message || row?.error || asArray(row?.errors).join('; ') || asArray(row?.warnings).join('; ');
    lines.push(header.map((field) => csvCell(field === 'message' ? message : row?.[field])).join(','));
  });
  return `${lines.join('\n')}\n`;
}

function exportPayload(kind) {
  const stats = diagnosticsStats();
  if (kind === 'matched') {
    downloadText('xml-cii-matched-facts.latest.json', JSON.stringify(stats.matched, null, 2));
    return true;
  }
  if (kind === 'rejected') {
    downloadText('xml-cii-rejected-facts.latest.json', JSON.stringify(stats.rejected, null, 2));
    return true;
  }
  if (kind === 'diagnostics-csv') {
    const rows = stats.rejected.length ? stats.rejected : stats.diagnostics;
    downloadText('xml-cii-diagnostics.latest.csv', diagnosticsToCsv(rows), 'text/csv');
    return true;
  }
  return false;
}

function refreshMatchedPreview() {
  const payload = readStoredDiagnostics();
  if (!payload) return false;
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: payload }));
  return true;
}

function tabLabel(tabId, stats) {
  if (tabId === 'xml-model-data') return supportConfigHasSideload() ? 'Side-load' : 'Model';
  if (tabId === 'process-enrichment') return 'Existing';
  if (tabId === 'matched-audit') return `M:${stats.matched.length} R:${stats.rejected.length}`;
  if (tabId === 'output-run') return stats.matched.length ? 'Ready' : 'Review';
  return '';
}

function updateTabBadges() {
  const popup = document.querySelector('.model-converters-workflow-popup');
  if (!popup) return;
  const stats = diagnosticsStats();
  popup.querySelectorAll('[data-modal-tab]').forEach((tab) => {
    const label = tabLabel(tab.dataset.modalTab || '', stats);
    let small = tab.querySelector('small');
    if (!small) {
      small = document.createElement('small');
      tab.appendChild(small);
    }
    small.textContent = label;
    tab.dataset.xmlCiiWorkflowBadge = label;
  });
}

function exportPanelHtml() {
  const stats = diagnosticsStats();
  return `
    <div class="model-converters-workflow-master-card" data-xml-cii-workflow-polish-exports style="margin-top:10px;">
      <div class="model-converters-workflow-section-title">Export / Counts</div>
      <div class="model-converters-workflow-detail-text">Export the same latest diagnostics payload used by Matched Preview. Matched export remains matched-only; rejected and CSV exports stay diagnostic-only.</div>
      <div class="model-converters-workflow-preview-grid" style="margin-top:10px;">
        <div><span>Matched rows</span><strong>${esc(stats.matched.length)}</strong></div>
        <div><span>Rejected rows</span><strong>${esc(stats.rejected.length)}</strong></div>
        <div><span>Diagnostics rows</span><strong>${esc(stats.diagnostics.length)}</strong></div>
        <div><span>Manual applied</span><strong>${esc(stats.manualMatched.length)}</strong></div>
        <div><span>Duplicates</span><strong>${esc(stats.duplicateRejected.length)}</strong></div>
        <div><span>Latest payload</span><strong>${stats.payload && Object.keys(stats.payload).length ? 'Available' : 'Not stored'}</strong></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button type="button" class="model-converters-download-btn" data-xml-cii-polish-export="matched">Export matchedFacts.json</button>
        <button type="button" class="model-converters-download-btn" data-xml-cii-polish-export="rejected">Export rejectedFacts.json</button>
        <button type="button" class="model-converters-download-btn" data-xml-cii-polish-export="diagnostics-csv">Export diagnostics.csv</button>
        <button type="button" class="model-converters-download-btn" data-xml-cii-polish-export="refresh-preview">Refresh Matched Preview</button>
      </div>
    </div>`;
}

function bindExportPanel(panel) {
  panel.querySelectorAll('[data-xml-cii-polish-export]').forEach((button) => {
    if (button.dataset.xmlCiiPolishBound === 'true') return;
    button.dataset.xmlCiiPolishBound = 'true';
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-xml-cii-polish-export') || '';
      const ok = action === 'refresh-preview' ? refreshMatchedPreview() : exportPayload(action);
      if (!ok) button.textContent = 'No latest diagnostics payload';
      updatePolishPanels();
    });
  });
}

function ensureExportPanel() {
  const auditCard = document.querySelector('[data-xml-cii-matched-audit-nesting]');
  if (!auditCard) return;
  const existing = auditCard.parentElement?.querySelector('[data-xml-cii-workflow-polish-exports]');
  if (existing) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = exportPanelHtml().trim();
  const panel = wrapper.firstElementChild;
  auditCard.parentElement?.insertBefore(panel, auditCard.nextSibling);
  bindExportPanel(panel);
}

function refreshExportPanel() {
  const existing = document.querySelector('[data-xml-cii-workflow-polish-exports]');
  if (!existing) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = exportPanelHtml().trim();
  const panel = wrapper.firstElementChild;
  existing.parentElement?.replaceChild(panel, existing);
  bindExportPanel(panel);
}

function updatePolishPanels() {
  if (!document.querySelector('.model-converters-workflow-popup')) return;
  updateTabBadges();
  if (document.querySelector('[data-xml-cii-workflow-polish-exports]')) refreshExportPanel();
  else ensureExportPanel();
}

export function installXmlCiiConversionWorkflowPolish(container = document) {
  if (!browserReady() || window[FLAG]) return;
  window[FLAG] = true;
  const root = container || document;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      updatePolishPanels();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
  window.addEventListener(PREVIEW_EVENT, () => setTimeout(updatePolishPanels, 0));
  setTimeout(updatePolishPanels, 0);
}
