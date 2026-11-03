const DIAG_PREFIX = '[XML Compare Load]';
const MAX_ROWS = 80;
const state = {
  seq: 0,
  rows: [],
  lastRenderedHtml: '',
};

function timeStamp() {
  try {
    return new Date().toLocaleTimeString();
  } catch (_) {
    return '';
  }
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function inputSide(input) {
  return input?.dataset?.xmlCompareLoad === 'b' ? 'b' : 'a';
}

function fileSummary(file) {
  if (!file) return { hasFile: false };
  return {
    hasFile: true,
    name: file.name || '',
    size: Number(file.size || 0),
    type: file.type || '',
    lastModified: file.lastModified || 0,
  };
}

function currentDomState() {
  const root = document.querySelector('.xml-compare-tab');
  const sourceCard = root?.querySelector('[data-xml-compare-loaded="a"]');
  const targetCard = root?.querySelector('[data-xml-compare-loaded="b"]');
  const status = root?.querySelector('.xml-compare-status');
  return {
    hasTab: Boolean(root),
    sourceCardText: sourceCard?.textContent?.trim()?.slice(0, 220) || '',
    targetCardText: targetCard?.textContent?.trim()?.slice(0, 220) || '',
    statusText: status?.textContent?.trim()?.slice(0, 220) || '',
  };
}

function ensurePanel() {
  const root = document.querySelector('.xml-compare-tab');
  if (!root) return null;
  let panel = root.querySelector('[data-xml-compare-load-diagnostics]');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'xml-compare-load-diagnostics';
    panel.dataset.xmlCompareLoadDiagnostics = 'true';
    panel.innerHTML = '<header><b>XML Compare Load Diagnostics</b><span>Also logged to browser console</span></header><div data-xml-compare-load-diagnostics-rows></div>';
    const status = root.querySelector('.xml-compare-status');
    if (status?.parentElement) status.insertAdjacentElement('afterend', panel);
    else root.insertAdjacentElement('afterbegin', panel);
    state.lastRenderedHtml = '';
  }
  return panel;
}

function diagnosticsRowsHtml() {
  return state.rows.slice(-MAX_ROWS).map((row) => {
    const detail = Object.entries(row.detail || {})
      .map(([key, value]) => `${key}=${safeText(typeof value === 'object' ? JSON.stringify(value) : value)}`)
      .join(' ');
    return `<div class="xml-compare-load-diagnostics-row"><code>${safeText(row.time)}</code><b>${safeText(row.event)}</b><span>${detail}</span></div>`;
  }).join('');
}

function renderPanel() {
  const panel = ensurePanel();
  if (!panel) return;
  const rows = panel.querySelector('[data-xml-compare-load-diagnostics-rows]');
  if (!rows) return;
  const html = diagnosticsRowsHtml();
  if (html === state.lastRenderedHtml) return;
  state.lastRenderedHtml = html;
  rows.innerHTML = html;
}

function log(event, detail = {}, level = 'log') {
  const row = {
    id: ++state.seq,
    time: timeStamp(),
    event,
    detail: {
      ...detail,
      url: location.href,
    },
  };
  state.rows.push(row);
  if (state.rows.length > MAX_ROWS * 2) state.rows.splice(0, state.rows.length - MAX_ROWS);
  const consoleMethod = console[level] || console.log;
  consoleMethod.call(console, `${DIAG_PREFIX} ${event}`, row.detail);
  renderPanel();
}

async function inspectSelectedFile(input, eventName) {
  const side = inputSide(input);
  const files = Array.from(input?.files || []);
  const file = files[0] || null;
  log(eventName, {
    side,
    inputPresent: Boolean(input),
    filesLength: files.length,
    accept: input?.getAttribute('accept') || '',
    ...fileSummary(file),
  }, files.length ? 'log' : 'warn');
  if (!file) {
    log('no-file-object', { side, filesLength: files.length }, 'warn');
    return;
  }
  log('file-read-start', { side, name: file.name, size: file.size });
  try {
    const text = await file.text();
    log('file-read-success', {
      side,
      name: file.name,
      chars: text.length,
      first120: text.slice(0, 120).replace(/\s+/g, ' '),
    });
    setTimeout(() => log('dom-state-after-read', { side, ...currentDomState() }), 0);
    setTimeout(() => log('dom-state-after-render-delay', { side, ...currentDomState() }), 200);
  } catch (error) {
    log('file-read-error', { side, name: file.name, message: error?.message || String(error) }, 'error');
  }
}

function install() {
  if (window.__xmlCompareLoadDiagnosticsInstalled) return;
  window.__xmlCompareLoadDiagnosticsInstalled = true;
  log('diagnostics-installed', { userAgent: navigator.userAgent });
  document.addEventListener('change', (event) => {
    const input = event.target?.closest?.('[data-xml-compare-load]');
    if (!input) return;
    inspectSelectedFile(input, 'file-input-change');
  }, true);
  document.addEventListener('input', (event) => {
    const input = event.target?.closest?.('[data-xml-compare-load]');
    if (!input) return;
    inspectSelectedFile(input, 'file-input-input');
  }, true);
}

install();
