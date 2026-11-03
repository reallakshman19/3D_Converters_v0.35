const FLAG = '__xmlCiiWorkflowAuditOutputNesting_v1';
const DIAGNOSTICS_STORAGE_KEY = 'xmlCii2019.matchedPreview.lastDiagnostics.v1';
const PREVIEW_EVENT = 'xml-cii-matched-preview:diagnostics';

const MATCHED_AUDIT_STEPS = Object.freeze([
  {
    id: 'matched-preview-refresh',
    label: 'Refresh Matched Preview',
    note: 'Reload the latest runner-published diagnostics into the existing matched-only preview table.',
    action: 'refresh-matched-preview',
  },
  {
    id: 'matched-preview-focus',
    label: 'Open Matched Rows',
    note: 'Jump to the existing Matched Preview panel. Rejected and duplicate rows remain hidden there.',
    action: 'focus-matched-preview',
  },
  {
    id: 'manual-restraints',
    label: 'Review Manual Restraints',
    note: 'Open Sideload → Restraints to review Node / PS / POS manual side-load rows.',
    action: 'open-manual-restraints',
  },
  {
    id: 'diagnostics',
    label: 'Review Diagnostics',
    note: 'Open Sideload → Diagnostics for unresolved, duplicate, invalid, or rejected rows.',
    action: 'open-sideload-diagnostics',
  },
  {
    id: 'export-diagnostics',
    label: 'Export Diagnostics JSON',
    note: 'Download the latest enrichment diagnostics payload from local browser storage.',
    action: 'export-diagnostics-json',
  },
]);

const OUTPUT_CHECKLIST = Object.freeze([
  ['xml-loaded', 'XML loaded', 'Primary XML input selected.'],
  ['sideload-options', 'Manual side-load saved', 'Manual side-load rows are present in supportConfigJson.'],
  ['diagnostics-stored', 'Latest diagnostics stored', 'Runner has published an enrichment diagnostics payload.'],
  ['matched-rows', 'Matched rows available', 'Matched Preview has at least one matched row.'],
  ['output-ready', 'Output panel available', 'Main converter output panel is present.'],
]);

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

function fileNameText(selector) {
  const input = document.querySelector(selector);
  const file = input?.files?.[0];
  return file?.name || 'No file selected';
}

function supportConfig() {
  const raw = document.querySelector('[data-option-key="supportConfigJson"]')?.value || '{}';
  return safeJsonParse(raw, {}) || {};
}

function hasManualSideload() {
  return !!clean(supportConfig()?.sideload?.restraintsText || '');
}

function diagnosticsStats() {
  const payload = readStoredDiagnostics() || {};
  const matched = asArray(payload.matchedFacts).filter((fact) => fact?.status === 'MATCHED');
  const rejected = asArray(payload.rejectedFacts);
  const diagnostics = asArray(payload.diagnostics);
  const manualMatched = matched.filter((fact) => fact?.source === 'MANUAL_SIDELOAD');
  const duplicateRejected = rejected.filter((fact) => /DUPLICATE/i.test(text(fact?.status || fact?.reason || fact?.code || fact?.error)));
  return {
    payload,
    matched,
    rejected,
    diagnostics,
    manualMatched,
    duplicateRejected,
    source: payload.source || 'none',
  };
}

function statusPill(ok) {
  return `<strong style="color:${ok ? '#5df0a0' : '#ffbd66'};">${ok ? 'Ready' : 'Review'}</strong>`;
}

function statsCards(items) {
  return `<div class="model-converters-workflow-preview-grid" style="margin-top:10px;">${items.map(([label, value]) => `
    <div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}
  </div>`;
}

function findPanelHost(titlePattern) {
  const titles = Array.from(document.querySelectorAll('.model-converters-workflow-detail-title'));
  const title = titles.find((node) => titlePattern.test(node.textContent || ''));
  if (!title) return null;
  return title.closest('.workflow-modal, .model-converters-workflow, [role="dialog"]') || title.parentElement;
}

function safeScrollTo(node) {
  try { node?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); } catch { node?.scrollIntoView?.(); }
}

function clickSideloadTab(tabId) {
  const sideload = document.querySelector('#model-converters-xml-cii-sideload');
  const tab = sideload?.querySelector(`[data-sideload-tab="${tabId}"]`);
  if (tab) tab.click();
  if (sideload) {
    if (sideload.tagName === 'DETAILS') sideload.open = true;
    safeScrollTo(sideload);
    return true;
  }
  return false;
}

function refreshMatchedPreview() {
  const button = document.querySelector('#mc-matched-preview-refresh');
  if (button) {
    button.click();
    return true;
  }
  const payload = readStoredDiagnostics();
  if (payload) {
    window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: payload }));
    return true;
  }
  return false;
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

function exportDiagnosticsJson() {
  const payload = readStoredDiagnostics();
  if (!payload) return false;
  downloadText('xml-cii-enrichment-diagnostics.latest.json', JSON.stringify(payload, null, 2));
  return true;
}

function auditStepHtml(step) {
  return `
    <button type="button" class="model-converters-workflow-master-tab" data-xml-cii-audit-action="${esc(step.action)}">
      <span>${esc(step.label)}</span>
      <small>${esc(step.note)}</small>
    </button>`;
}

function auditSummaryHtml() {
  const stats = diagnosticsStats();
  return `
    <div class="model-converters-workflow-master-card" data-xml-cii-matched-audit-nesting style="margin-top:10px;">
      <div class="model-converters-workflow-section-title">Matched Audit nested workflow</div>
      <div class="model-converters-workflow-detail-text">
        This audit section organizes the existing Matched Preview and Sideload Diagnostics without changing matched/rejected filtering. Matched Preview stays read-only and matched-only.
      </div>
      ${statsCards([
        ['Matched rows', stats.matched.length],
        ['Rejected hidden', stats.rejected.length],
        ['Diagnostics rows', stats.diagnostics.length],
        ['Manual applied', stats.manualMatched.length],
        ['Duplicate rejected', stats.duplicateRejected.length],
        ['Source', stats.source],
      ])}
      <div class="model-converters-workflow-master-tabs" style="margin-top:12px;">
        ${MATCHED_AUDIT_STEPS.map(auditStepHtml).join('')}
      </div>
    </div>`;
}

function checklistStatus(id) {
  const stats = diagnosticsStats();
  if (id === 'xml-loaded') return !!document.querySelector('#model-converters-primary-input')?.files?.[0];
  if (id === 'sideload-options') return hasManualSideload();
  if (id === 'diagnostics-stored') return !!readStoredDiagnostics();
  if (id === 'matched-rows') return stats.matched.length > 0;
  if (id === 'output-ready') return !!document.querySelector('#model-converters-output');
  return false;
}

function outputChecklistHtml() {
  return `
    <div class="model-converters-workflow-master-card" data-xml-cii-output-run-nesting style="margin-top:10px;">
      <div class="model-converters-workflow-section-title">Output / Run Conversion checklist</div>
      <div class="model-converters-workflow-detail-text">
        Final conversion still runs through the existing XML→CII runner. This checklist only summarizes readiness and provides handoff shortcuts.
      </div>
      ${statsCards([
        ['Primary XML', fileNameText('#model-converters-primary-input')],
        ['Manual side-load saved', hasManualSideload() ? 'Yes' : 'No'],
        ['Latest diagnostics', readStoredDiagnostics() ? 'Available' : 'Not stored'],
        ['Converter runtime', 'Unchanged'],
      ])}
      <div class="model-converters-workflow-master-tabs" style="margin-top:12px;">
        ${OUTPUT_CHECKLIST.map(([id, label, note]) => `
          <div class="model-converters-workflow-master-tab" data-xml-cii-output-check="${esc(id)}">
            <span>${esc(label)} ${statusPill(checklistStatus(id))}</span>
            <small>${esc(note)}</small>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button type="button" class="model-converters-run-btn" data-xml-cii-output-action="run-existing">Run Existing Conversion</button>
        <button type="button" class="model-converters-download-btn" data-xml-cii-output-action="refresh-summary">Refresh Checklist</button>
        <button type="button" class="model-converters-download-btn" data-xml-cii-output-action="show-output">Show Main Output</button>
        <button type="button" class="model-converters-download-btn" data-xml-cii-output-action="refresh-audit">Refresh Matched Audit</button>
      </div>
    </div>`;
}

function bindAuditPanel(root) {
  root.querySelectorAll('[data-xml-cii-audit-action]').forEach((button) => {
    if (button.dataset.xmlCiiAuditOutputBound === 'true') return;
    button.dataset.xmlCiiAuditOutputBound = 'true';
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-xml-cii-audit-action') || '';
      let ok = true;
      if (action === 'refresh-matched-preview') ok = refreshMatchedPreview();
      else if (action === 'focus-matched-preview') ok = !!safeScrollTo(document.querySelector('#model-converters-xml-cii-matched-preview')) || !!document.querySelector('#model-converters-xml-cii-matched-preview');
      else if (action === 'open-manual-restraints') ok = clickSideloadTab('restraints');
      else if (action === 'open-sideload-diagnostics') ok = clickSideloadTab('diagnostics');
      else if (action === 'export-diagnostics-json') ok = exportDiagnosticsJson();
      const note = button.querySelector('small');
      if (!ok && note) note.textContent = 'Target data/panel is not available yet.';
      refreshAuditPanel();
    });
  });
}

function bindOutputPanel(root) {
  root.querySelectorAll('[data-xml-cii-output-action]').forEach((button) => {
    if (button.dataset.xmlCiiAuditOutputBound === 'true') return;
    button.dataset.xmlCiiAuditOutputBound = 'true';
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-xml-cii-output-action') || '';
      if (action === 'run-existing') {
        const run = document.querySelector('[data-xml-cii-popup-run]') || document.querySelector('#model-converters-run');
        run?.click?.();
      } else if (action === 'show-output') {
        safeScrollTo(document.querySelector('#model-converters-output'));
      } else if (action === 'refresh-audit') {
        refreshMatchedPreview();
        refreshAuditPanel();
      } else if (action === 'refresh-summary') {
        refreshOutputPanel();
      }
    });
  });
}

function refreshAuditPanel() {
  const existing = document.querySelector('[data-xml-cii-matched-audit-nesting]');
  if (!existing) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = auditSummaryHtml().trim();
  const next = wrapper.firstElementChild;
  existing.parentNode?.replaceChild(next, existing);
  bindAuditPanel(next);
}

function refreshOutputPanel() {
  const existing = document.querySelector('[data-xml-cii-output-run-nesting]');
  if (!existing) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = outputChecklistHtml().trim();
  const next = wrapper.firstElementChild;
  existing.parentNode?.replaceChild(next, existing);
  bindOutputPanel(next);
}

function ensureAuditPanel() {
  const host = findPanelHost(/Matched Audit/i);
  if (!host || host.querySelector('[data-xml-cii-matched-audit-nesting]')) return;
  const matchedPreviewMount = host.querySelector('[data-xml-cii-popup-panel="matched-preview"]');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = auditSummaryHtml().trim();
  const panel = wrapper.firstElementChild;
  (matchedPreviewMount?.parentNode || host).insertBefore(panel, matchedPreviewMount || null);
  bindAuditPanel(panel);
}

function ensureOutputPanel() {
  const host = findPanelHost(/Output\s*\/\s*Run Conversion/i);
  if (!host || host.querySelector('[data-xml-cii-output-run-nesting]')) return;
  const firstCard = host.querySelector('.model-converters-workflow-master-card');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = outputChecklistHtml().trim();
  const panel = wrapper.firstElementChild;
  (firstCard?.parentNode || host).insertBefore(panel, firstCard || null);
  bindOutputPanel(panel);
}

export function installXmlCiiConversionWorkflowAuditOutputNesting(container = document) {
  if (!browserReady() || window[FLAG]) return;
  window[FLAG] = true;
  const root = container || document;
  const observer = new MutationObserver(() => {
    ensureAuditPanel();
    ensureOutputPanel();
  });
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
  ensureAuditPanel();
  ensureOutputPanel();
}
