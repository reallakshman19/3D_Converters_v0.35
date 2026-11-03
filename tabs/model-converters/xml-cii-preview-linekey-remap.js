import { resolveLineListDensity } from '../../converters/xml-cii2019-core/line-density-resolver.js';
import { LINE_LIST_PROCESS_VALUE_ALIASES, normalizeLineListRow } from '../../converters/xml-cii2019-core/linelist-mapping.js';

const INSTALLED_FLAG = '__xmlCiiPreviewLineKeyRemap_v1';
const CONFIG_SELECTOR = '[data-option-key="supportConfigJson"]';
const MODAL_ID = 'xml-cii-preview-linekey-remap-modal';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function esc(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeKey(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function readRowValue(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys || []) {
    const value = row[key] ?? row._raw?.[key];
    if (text(value)) return text(value);
  }
  return '';
}

function parseConfig() {
  const input = document.querySelector(CONFIG_SELECTOR);
  if (!input) return { input: null, config: null };
  try {
    const parsed = JSON.parse(input.value || '{}');
    return { input, config: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} };
  } catch (error) {
    window.alert(`Cannot read XML->CII config JSON: ${error?.message || error}`);
    return { input, config: null };
  }
}

function writeConfig(input, config) {
  input.value = JSON.stringify(config, null, 2);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function lineListRows(config) {
  const rows = config?.linelist?.masterRows;
  return Array.isArray(rows) ? rows : [];
}

function rowLineKey(row) {
  return readRowValue(row, [
    'lineNoKey', 'Line No. Key', 'Line No Key',
    'lineNo', 'lineKey', 'lineSeqNo',
    'LineNo', 'Line No', 'Line Number', 'PipelineReference',
  ]);
}

function rowSummary(row) {
  return [
    rowLineKey(row),
    readRowValue(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS']),
    readRowValue(row, ['material', 'Material', 'MATERIAL']),
    readRowValue(row, ['convertedBore', 'Bore', 'Nominal Pipe Size inch', 'DN', 'NB']),
    readRowValue(row, ['phase', 'Phase', 'PHASE']),
  ].filter(Boolean).join(' · ');
}

function processDataFromRow(row, config) {
  const rowIndex = Number(row?._rowIndex);
  const normalized = normalizeLineListRow(row, config?.linelist?.fieldMap || {}, Number.isFinite(rowIndex) ? rowIndex - 1 : undefined);
  const densityInfo = resolveLineListDensity(normalized, null);
  const out = {};
  const map = {
    p1: LINE_LIST_PROCESS_VALUE_ALIASES.p1,
    hydroPressure: LINE_LIST_PROCESS_VALUE_ALIASES.hydroPressure,
    t1: LINE_LIST_PROCESS_VALUE_ALIASES.t1,
    t2: LINE_LIST_PROCESS_VALUE_ALIASES.t2,
    t3: LINE_LIST_PROCESS_VALUE_ALIASES.t3,
  };
  for (const [field, keys] of Object.entries(map)) {
    const value = readRowValue(normalized, [field, ...keys]);
    if (value) out[field] = value;
  }
  if (densityInfo.value) out.density = densityInfo.value;
  return out;
}

function refreshPreview() {
  const activePreview = document.querySelector('[data-xml-cii-phase="preview"].is-active, [data-xml-cii-phase="preview"].active');
  if (activePreview) {
    setTimeout(() => activePreview.click(), 20);
    return;
  }
  const previewButton = document.querySelector('[data-xml-cii-phase="preview"]');
  if (previewButton) setTimeout(() => previewButton.click(), 20);
}

function closeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

function openLineKeyModal({ branchName, targetLineKey }) {
  const { input, config } = parseConfig();
  if (!input || !config) return;
  const rows = lineListRows(config);
  const options = rows
    .map((row, index) => ({ row, index, key: rowLineKey(row), summary: rowSummary(row) }))
    .filter((item) => item.key);
  if (!options.length) {
    window.alert('No saved Line List rows with a Line No. Key were found.');
    return;
  }

  closeModal();
  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.style.cssText = 'position:fixed;inset:6vh 8vw;z-index:9999;background:#0f1724;color:#e6edf5;border:1px solid #31455f;border-radius:10px;padding:14px;box-shadow:0 20px 80px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:10px;';
  modal.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <div style="font-weight:700;font-size:15px;">Map Preview Branch to Line List Row</div>
        <div style="font-size:12px;color:#b8c7d9;margin-top:4px;">Branch: <b>${esc(branchName)}</b></div>
        <div style="font-size:12px;color:#b8c7d9;">Preview Line Key to update: <b>${esc(targetLineKey || '—')}</b></div>
      </div>
      <button type="button" data-close style="border:1px solid #455b78;background:#172337;color:#e6edf5;border-radius:6px;padding:5px 10px;">Close</button>
    </div>
    <input type="search" data-search placeholder="Search Line No. Key / piping class / material / phase..." style="width:100%;padding:8px;border-radius:6px;border:1px solid #31455f;background:#101827;color:#e6edf5;">
    <select data-select size="14" style="width:100%;min-height:280px;border-radius:6px;border:1px solid #31455f;background:#101827;color:#e6edf5;padding:6px;"></select>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button type="button" data-apply style="border:1px solid #2b7656;background:#123222;color:#7dffc0;border-radius:6px;padding:7px 12px;font-weight:700;">Use selected Line No. Key</button>
    </div>
  `;
  document.body.appendChild(modal);

  const search = modal.querySelector('[data-search]');
  const select = modal.querySelector('[data-select]');
  const renderOptions = () => {
    const q = normalizeKey(search.value);
    const filtered = options.filter((item) => !q || normalizeKey(item.summary).includes(q) || normalizeKey(item.key).includes(q)).slice(0, 400);
    select.innerHTML = filtered.map((item) => `<option value="${item.index}">${esc(item.summary)}</option>`).join('');
    if (select.options.length) select.selectedIndex = 0;
  };
  renderOptions();
  search.addEventListener('input', renderOptions);
  modal.querySelector('[data-close]')?.addEventListener('click', closeModal);
  modal.querySelector('[data-apply]')?.addEventListener('click', () => {
    const selected = options.find((item) => String(item.index) === String(select.value));
    if (!selected) return;
    const selectedKey = selected.key;
    const processData = processDataFromRow(selected.row, config);
    if (!config.overrides || typeof config.overrides !== 'object' || Array.isArray(config.overrides)) config.overrides = {};
    if (!config.overrides.processData || typeof config.overrides.processData !== 'object' || Array.isArray(config.overrides.processData)) config.overrides.processData = {};
    const writeKeys = [...new Set([targetLineKey, selectedKey].map(text).filter(Boolean))];
    for (const writeKey of writeKeys) {
      config.overrides.processData[writeKey] = { ...(config.overrides.processData[writeKey] || {}), ...processData };
    }
    if (!config.linelist || typeof config.linelist !== 'object' || Array.isArray(config.linelist)) config.linelist = {};
    if (!config.linelist.branchLineKeyMap || typeof config.linelist.branchLineKeyMap !== 'object' || Array.isArray(config.linelist.branchLineKeyMap)) config.linelist.branchLineKeyMap = {};
    config.linelist.branchLineKeyMap[branchName] = selectedKey;
    writeConfig(input, config);
    closeModal();
    refreshPreview();
  });
}

function branchContextFromCell(cell) {
  const row = cell.closest('tr');
  if (!row) return null;
  const branchName = cell.getAttribute('title') || text(cell.textContent).replace(/^…/, '');
  const lineKey = text(row.children?.[1]?.textContent || '');
  return { branchName, targetLineKey: lineKey === '—' ? '' : lineKey };
}

export function installXmlCiiPreviewLineKeyRemap() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[INSTALLED_FLAG]) return;
  window[INSTALLED_FLAG] = true;
  document.addEventListener('click', (event) => {
    const cell = event.target?.closest?.('.mc-preview-branch');
    if (!cell) return;
    const ctx = branchContextFromCell(cell);
    if (!ctx?.branchName) return;
    event.preventDefault();
    event.stopPropagation();
    openLineKeyModal(ctx);
  }, true);
}
