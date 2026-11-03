import { installInputXmlPropertyTransferUi as installInlineInputXmlPropertyTransferUi } from './inputxml-property-transfer-ui.js?v=20260615-inputxml-property-transfer-ui-1';

const CONVERTER_ID = 'inputxml_property_transfer';
const CONVERTER_LABEL = 'InputXML Property Transfer';
const BENCHMARK_MARKER = '/Benchmarks/InputXML%20Property%20Transfer/';
const BENCHMARK_MARKER_UNENCODED = '/Benchmarks/InputXML Property Transfer/';
const RAW_BENCHMARK_BASE = 'https://raw.githubusercontent.com/reallaksh19/3D_Viewer/main/Benchmarks/InputXML%20Property%20Transfer/';
let popupSerial = 0;

function appendConverterOption(root) {
  const select = root?.querySelector?.('#model-converters-select');
  if (!select) return select;
  const existing = select.querySelector(`option[value="${CONVERTER_ID}"]`);
  if (existing) {
    existing.textContent = CONVERTER_LABEL;
    return select;
  }
  const option = document.createElement('option');
  option.value = CONVERTER_ID;
  option.textContent = CONVERTER_LABEL;
  const anchor = select.querySelector('option[value="inputxml_to_cii2019"]') ||
    select.querySelector('option[value="inputxml_to_glb"]') ||
    select.querySelector('option[value="inputxml_to_dxf"]');
  if (anchor?.nextSibling) select.insertBefore(option, anchor.nextSibling);
  else if (anchor) anchor.insertAdjacentElement('afterend', option);
  else select.appendChild(option);
  return select;
}

function make(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style') node.style.cssText = value;
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

function setStatus(root, message, tone = '') {
  const status = root.querySelector('#model-converters-status');
  if (!status) return;
  status.textContent = message;
  status.className = `model-converters-status ${tone}`.trim();
}

function setLabelCaption(label, caption) {
  if (!label) return;
  let span = label.querySelector('span');
  if (!span) {
    span = document.createElement('span');
    label.insertBefore(span, label.firstChild);
  }
  span.textContent = caption;
}

function hideElement(node) {
  if (!node) return;
  node.hidden = true;
  node.style.display = 'none';
  node.setAttribute('aria-hidden', 'true');
}

function hideHostFileControls(root) {
  // The popup owns file inputs. Hide the legacy converter file controls so the
  // launcher does not show: "InputXML Property Transfer XML Input / No file chosen".
  hideElement(root.querySelector('#model-converters-primary-label'));
  hideElement(root.querySelector('#model-converters-primary-name'));
  hideElement(root.querySelector('#model-converters-secondary-wrap'));
}

function ensureFileInput(root, labelId, inputId, caption, nameId, emptyText) {
  const label = root.querySelector(`#${labelId}`);
  if (!label) return;
  label.hidden = false;
  label.style.display = '';
  label.removeAttribute('aria-hidden');
  setLabelCaption(label, caption);
  let input = root.querySelector(`#${inputId}`);
  if (!input) {
    input = document.createElement('input');
    input.id = inputId;
    input.type = 'file';
  }
  input.type = 'file';
  input.accept = '.xml,.XML';
  if (input.parentElement !== label) label.appendChild(input);
  const name = root.querySelector(`#${nameId}`);
  if (name) {
    name.hidden = false;
    name.style.display = '';
    name.removeAttribute('aria-hidden');
    if (!input.files?.[0] && !/Mock .* loaded\./i.test(name.textContent || '')) name.textContent = emptyText;
  }
}

function ensurePopupFileInputs(root) {
  ensureFileInput(root, 'model-converters-primary-label', 'model-converters-primary-input', 'Source InputXML - properties to copy (.xml,.XML)', 'model-converters-primary-name', 'No source file selected.');
  ensureFileInput(root, 'model-converters-secondary-label', 'model-converters-secondary-input', 'Target InputXML - geometry to update (.xml,.XML)', 'model-converters-secondary-name', 'No target file selected.');
  const secondaryWrap = root.querySelector('#model-converters-secondary-wrap');
  if (secondaryWrap) {
    secondaryWrap.hidden = false;
    secondaryWrap.style.display = '';
    secondaryWrap.removeAttribute('aria-hidden');
  }
}

function resetHostOutput(root) {
  const output = root.querySelector('#model-converters-output');
  if (output) output.innerHTML = '<span class="model-converters-muted">Outputs are generated inside the InputXML Property Transfer popup.</span>';
  const diag = root.querySelector('#model-converters-diagnostics-table');
  if (diag) {
    diag.style.display = 'none';
    diag.innerHTML = '';
  }
  const logs = root.querySelector('#model-converters-logs');
  if (logs) logs.textContent = '(open the popup to run property transfer)';
}

function renderLauncher(root) {
  hideHostFileControls(root);
  const runButton = root.querySelector('#model-converters-run');
  const xmlWorkflow = root.querySelector('#model-converters-xml-cii-workflow');
  const supportMapper = root.querySelector('#model-converters-support-mapper');
  const fields = root.querySelector('#model-converters-advanced-fields');
  if (runButton) runButton.textContent = 'Open Property Transfer Popup';
  if (xmlWorkflow) {
    xmlWorkflow.hidden = true;
    xmlWorkflow.open = false;
    xmlWorkflow.style.display = 'none';
    xmlWorkflow.setAttribute('aria-hidden', 'true');
  }
  if (supportMapper) {
    supportMapper.hidden = true;
    supportMapper.open = false;
    supportMapper.style.display = 'none';
    supportMapper.setAttribute('aria-hidden', 'true');
  }
  if (fields) {
    fields.innerHTML = '<div class="model-converters-card" style="padding:12px;margin-bottom:10px;background:#111827;border:1px solid #26364b;border-radius:8px;"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div><div style="font-weight:800;color:#d7e6ff;">InputXML Property Transfer</div><div class="model-converters-muted" style="font-size:12px;max-width:760px;">Transfers selected properties from Source InputXML to Target InputXML by nearby coordinates. Node numbers are audit labels only.</div></div><button type="button" class="model-converters-download-btn" data-inputxml-prop-open-popup>Open Popup</button></div><div class="model-converters-muted" style="font-size:11px;margin-top:8px;">Safety default: unmatched, blocked, ambiguous, missing-source, and source-sentinel rows retain target XML values exactly.</div></div>';
    fields.querySelector('[data-inputxml-prop-open-popup]')?.addEventListener('click', () => openPropertyTransferPopup(root));
  }
  setStatus(root, 'Ready: click Open Popup to launch InputXML Property Transfer.', '');
  resetHostOutput(root);
}

function addFileCard(parent, idPrefix, labelText, nameText) {
  const input = make('input', { id: `${idPrefix}-input`, type: 'file', accept: '.xml,.XML' });
  const label = make('label', { id: `${idPrefix}-label`, className: 'model-converters-label' }, [make('span', { text: labelText }), input]);
  parent.appendChild(make('div', { className: 'model-converters-card', style: 'padding:10px;background:#111827;border:1px solid #26364b;border-radius:8px;' }, [
    label,
    make('div', { id: `${idPrefix}-name`, className: 'model-converters-muted', style: 'font-size:12px;margin-top:4px;', text: nameText }),
  ]));
}

function createPopupRoot() {
  const root = make('div', { 'data-inputxml-prop-popup-root': 'true' });
  root.appendChild(make('div', { 'data-inputxml-prop-close': true, style: 'position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9998;' }));
  const modal = make('section', { className: 'inputxml-prop-popup', role: 'dialog', 'aria-modal': 'true', style: 'position:fixed;z-index:9999;inset:4vh 3vw;background:#0b1220;border:1px solid #334155;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;' });
  const titleId = `inputxml-prop-title-${++popupSerial}`;
  modal.setAttribute('aria-labelledby', titleId);
  modal.appendChild(make('header', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #26364b;background:#111827;' }, [
    make('div', {}, [make('div', { id: titleId, style: 'font-weight:900;color:#d7e6ff;font-size:16px;', text: 'InputXML Property Transfer' }), make('div', { className: 'model-converters-muted', style: 'font-size:12px;', text: 'Source XML properties to Target XML by coordinate tolerance. Use Load mock for the benchmark pair.' })]),
    make('button', { type: 'button', className: 'model-converters-download-btn', 'data-inputxml-prop-close': true, text: 'Close' }),
  ]));
  const body = make('div', { style: 'padding:12px;overflow:auto;' });
  body.appendChild(make('select', { id: 'model-converters-select', style: 'display:none;' }, [make('option', { value: CONVERTER_ID, selected: true, text: CONVERTER_LABEL })]));
  body.appendChild(make('div', { id: 'model-converters-status', className: 'model-converters-status', text: 'Ready.' }));
  const grid = make('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:10px;margin:10px 0;' });
  addFileCard(grid, 'model-converters-primary', 'Source InputXML - properties to copy (.xml,.XML)', 'No source file selected.');
  const targetCard = make('div', { id: 'model-converters-secondary-wrap' });
  grid.appendChild(targetCard);
  addFileCard(targetCard, 'model-converters-secondary', 'Target InputXML - geometry to update (.xml,.XML)', 'No target file selected.');
  body.appendChild(grid);
  body.appendChild(make('div', { id: 'model-converters-xml-cii-workflow', hidden: true }));
  body.appendChild(make('div', { id: 'model-converters-support-mapper', hidden: true }));
  body.appendChild(make('div', { id: 'model-converters-advanced-fields' }));
  body.appendChild(make('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0;' }, [make('button', { id: 'model-converters-run', type: 'button', className: 'model-converters-run-btn', text: 'Preview + Apply Transfer' }), make('span', { id: 'model-converters-preview-meta', className: 'model-converters-muted', style: 'font-size:12px;', text: 'Property-transfer preview is table-based.' })]));
  body.appendChild(make('div', { className: 'model-converters-card', style: 'padding:10px;background:#111827;border:1px solid #26364b;border-radius:8px;margin-bottom:10px;' }, [make('div', { style: 'font-weight:700;color:#d7e6ff;margin-bottom:6px;', text: 'Outputs' }), make('div', { id: 'model-converters-output', html: '<span class="model-converters-muted">No output generated yet.</span>' })]));
  body.appendChild(make('div', { id: 'model-converters-diagnostics-table', style: 'display:none;max-height:360px;overflow:auto;border:1px solid #26364b;border-radius:8px;' }));
  body.appendChild(make('pre', { id: 'model-converters-logs', style: 'white-space:pre-wrap;background:#030712;color:#d7e6ff;border:1px solid #26364b;border-radius:8px;padding:10px;margin-top:10px;max-height:220px;overflow:auto;', text: '(no logs)' }));
  modal.appendChild(body);
  root.appendChild(modal);
  return root;
}

function benchmarkTailFromUrl(value) {
  const href = String(value || '');
  const encodedIndex = href.indexOf(BENCHMARK_MARKER);
  if (encodedIndex >= 0) return href.slice(encodedIndex + BENCHMARK_MARKER.length);
  const plainIndex = href.indexOf(BENCHMARK_MARKER_UNENCODED);
  if (plainIndex >= 0) return href.slice(plainIndex + BENCHMARK_MARKER_UNENCODED.length).replace(/ /g, '%20');
  return '';
}

function pageCandidateUrls(originalUrl) {
  const tail = benchmarkTailFromUrl(originalUrl);
  if (!tail) return [originalUrl];
  const origin = globalThis.location?.origin || '';
  const candidates = [originalUrl];
  if (origin) {
    candidates.push(`${origin}/3D_Viewer/Benchmarks/InputXML%20Property%20Transfer/${tail}`);
    candidates.push(`${origin}/Benchmarks/InputXML%20Property%20Transfer/${tail}`);
  }
  candidates.push(`${RAW_BENCHMARK_BASE}${tail}`);
  return [...new Set(candidates)];
}

function installBenchmarkFetchFallback() {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') return () => {};
  const boundFetch = originalFetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const href = typeof input === 'string' ? input : input?.url || String(input || '');
    const candidates = pageCandidateUrls(href);
    if (candidates.length <= 1) return boundFetch(input, init);
    let lastResponse = null;
    for (const candidate of candidates) {
      const response = await boundFetch(candidate, init).catch((error) => {
        lastResponse = error;
        return null;
      });
      if (response?.ok) return response;
      if (response) lastResponse = response;
    }
    if (lastResponse instanceof Error) throw lastResponse;
    return lastResponse || boundFetch(input, init);
  };
  return () => {
    if (globalThis.fetch !== originalFetch) globalThis.fetch = originalFetch;
  };
}

function openPropertyTransferPopup(hostRoot) {
  if (!globalThis.document?.body) return null;
  const existing = document.querySelector('[data-inputxml-prop-popup-root="true"]');
  if (existing) {
    ensurePopupFileInputs(existing);
    existing.querySelector('.inputxml-prop-popup')?.scrollIntoView?.({ block: 'center' });
    existing.querySelector('#model-converters-primary-input')?.focus?.();
    return existing;
  }
  const popupRoot = createPopupRoot();
  const restoreFetch = installBenchmarkFetchFallback();
  document.body.appendChild(popupRoot);
  const close = () => {
    restoreFetch();
    popupRoot.remove();
  };
  for (const node of popupRoot.querySelectorAll('[data-inputxml-prop-close]')) node.addEventListener('click', close);
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && document.body.contains(popupRoot)) close();
  };
  document.addEventListener('keydown', onKeyDown, { once: true });
  installInlineInputXmlPropertyTransferUi(popupRoot);
  ensurePopupFileInputs(popupRoot);
  popupRoot.querySelector('#model-converters-primary-input')?.focus?.();
  setStatus(hostRoot, 'InputXML Property Transfer popup is open.', 'running');
  return popupRoot;
}

export function installInputXmlPropertyTransferUi(root = globalThis.document) {
  if (!root?.querySelector || !globalThis.document) return () => {};
  const select = appendConverterOption(root);
  const runButton = root.querySelector('#model-converters-run');
  if (!select || !runButton || root.dataset.inputxmlPropertyTransferPopupUiV3 === 'mounted') return () => {};
  root.dataset.inputxmlPropertyTransferPopupUiV3 = 'mounted';

  const onSelectChange = (event) => {
    if (select.value !== CONVERTER_ID) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderLauncher(root);
  };
  const onRun = (event) => {
    if (select.value !== CONVERTER_ID) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderLauncher(root);
    openPropertyTransferPopup(root);
  };
  select.addEventListener('change', onSelectChange, true);
  runButton.addEventListener('click', onRun, true);
  if (select.value === CONVERTER_ID) renderLauncher(root);
  return () => {
    select.removeEventListener('change', onSelectChange, true);
    runButton.removeEventListener('click', onRun, true);
  };
}
