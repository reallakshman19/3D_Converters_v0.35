import { installInputXmlPropertyTransferUi as installInlineInputXmlPropertyTransferUi } from './inputxml-property-transfer-ui.js?v=20260615-inputxml-property-transfer-ui-1';

const CONVERTER_ID = 'inputxml_property_transfer';
const CONVERTER_LABEL = 'InputXML Property Transfer';
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

function setStatus(root, message, tone = '') {
  const status = root.querySelector('#model-converters-status');
  if (!status) return;
  status.textContent = message;
  status.className = `model-converters-status ${tone}`.trim();
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
  const primaryLabel = root.querySelector('#model-converters-primary-label');
  const primaryName = root.querySelector('#model-converters-primary-name');
  const secondaryWrap = root.querySelector('#model-converters-secondary-wrap');
  const runButton = root.querySelector('#model-converters-run');
  const xmlWorkflow = root.querySelector('#model-converters-xml-cii-workflow');
  const supportMapper = root.querySelector('#model-converters-support-mapper');
  const fields = root.querySelector('#model-converters-advanced-fields');

  if (primaryLabel) primaryLabel.textContent = 'InputXML Property Transfer';
  if (primaryName) primaryName.textContent = 'This converter opens in a popup. Select Source/Target XML or Load mock inside the popup.';
  if (secondaryWrap) secondaryWrap.style.display = 'none';
  if (runButton) runButton.textContent = 'Open Property Transfer Popup';
  if (xmlWorkflow) {
    xmlWorkflow.hidden = true;
    xmlWorkflow.open = false;
  }
  if (supportMapper) {
    supportMapper.hidden = true;
    supportMapper.open = false;
  }
  if (fields) {
    fields.innerHTML = `
      <div class="model-converters-card" style="padding:12px;margin-bottom:10px;background:#111827;border:1px solid #26364b;border-radius:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:800;color:#d7e6ff;">InputXML Property Transfer</div>
            <div class="model-converters-muted" style="font-size:12px;max-width:760px;">Transfers selected properties from Source InputXML to Target InputXML by nearby coordinates. Node numbers are audit labels only. Diameter, line-family, and component-type tightening are configurable in the popup.</div>
          </div>
          <button type="button" class="model-converters-download-btn" data-inputxml-prop-open-popup>Open Popup</button>
        </div>
        <div class="model-converters-muted" style="font-size:11px;margin-top:8px;">Safety default: unmatched, blocked, ambiguous, missing-source, and source-sentinel rows retain target XML values exactly.</div>
      </div>
    `;
    fields.querySelector('[data-inputxml-prop-open-popup]')?.addEventListener('click', () => openPropertyTransferPopup(root));
  }
  setStatus(root, 'Ready: open the InputXML Property Transfer popup.', '');
  resetHostOutput(root);
}

function popupShellHtml(serial) {
  return `
    <div class="inputxml-prop-popup-backdrop" data-inputxml-prop-close style="position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9998;"></div>
    <section class="inputxml-prop-popup" role="dialog" aria-modal="true" aria-labelledby="inputxml-prop-title-${serial}" style="position:fixed;z-index:9999;inset:4vh 3vw;background:#0b1220;border:1px solid #334155;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;">
      <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #26364b;background:#111827;">
        <div>
          <div id="inputxml-prop-title-${serial}" style="font-weight:900;color:#d7e6ff;font-size:16px;">InputXML Property Transfer</div>
          <div class="model-converters-muted" style="font-size:12px;">Source XML properties → Target XML by coordinate tolerance. Use Load mock for the benchmark pair.</div>
        </div>
        <button type="button" class="model-converters-download-btn" data-inputxml-prop-close>Close</button>
      </header>
      <div style="padding:12px;overflow:auto;">
        <select id="model-converters-select" style="display:none;"><option value="${CONVERTER_ID}" selected>${CONVERTER_LABEL}</option></select>
        <div id="model-converters-status" class="model-converters-status">Ready.</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:10px;margin:10px 0;">
          <div class="model-converters-card" style="padding:10px;background:#111827;border:1px solid #26364b;border-radius:8px;">
            <label id="model-converters-primary-label" class="model-converters-label"><span>Source InputXML - trusted properties (.xml,.XML)</span><input id="model-converters-primary-input" type="file" accept=".xml,.XML"></label>
            <div id="model-converters-primary-name" class="model-converters-muted" style="font-size:12px;margin-top:4px;">No source file selected.</div>
          </div>
          <div id="model-converters-secondary-wrap" class="model-converters-card" style="padding:10px;background:#111827;border:1px solid #26364b;border-radius:8px;">
            <label id="model-converters-secondary-label" class="model-converters-label"><span>Target InputXML - geometry to update (.xml,.XML)</span><input id="model-converters-secondary-input" type="file" accept=".xml,.XML"></label>
            <div id="model-converters-secondary-name" class="model-converters-muted" style="font-size:12px;margin-top:4px;">No target file selected.</div>
          </div>
        </div>
        <div id="model-converters-xml-cii-workflow" hidden></div>
        <div id="model-converters-support-mapper" hidden></div>
        <div id="model-converters-advanced-fields"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0;">
          <button id="model-converters-run" type="button" class="model-converters-run-btn">Preview + Apply Transfer</button>
          <span id="model-converters-preview-meta" class="model-converters-muted" style="font-size:12px;">Property-transfer preview is table-based. Geometry preview is not used for this utility.</span>
        </div>
        <div class="model-converters-card" style="padding:10px;background:#111827;border:1px solid #26364b;border-radius:8px;margin-bottom:10px;">
          <div style="font-weight:700;color:#d7e6ff;margin-bottom:6px;">Outputs</div>
          <div id="model-converters-output"><span class="model-converters-muted">No output generated yet.</span></div>
        </div>
        <div id="model-converters-diagnostics-table" style="display:none;max-height:360px;overflow:auto;border:1px solid #26364b;border-radius:8px;"></div>
        <pre id="model-converters-logs" style="white-space:pre-wrap;background:#030712;color:#d7e6ff;border:1px solid #26364b;border-radius:8px;padding:10px;margin-top:10px;max-height:220px;overflow:auto;">(no logs)</pre>
      </div>
    </section>
  `;
}

function openPropertyTransferPopup(hostRoot) {
  if (!globalThis.document?.body) return null;
  const existing = document.querySelector('[data-inputxml-prop-popup-root="true"]');
  if (existing) {
    existing.querySelector('.inputxml-prop-popup')?.scrollIntoView?.({ block: 'center' });
    existing.querySelector('#model-converters-primary-input')?.focus?.();
    return existing;
  }

  const popupRoot = document.createElement('div');
  popupRoot.setAttribute('data-inputxml-prop-popup-root', 'true');
  popupRoot.innerHTML = popupShellHtml(++popupSerial);
  document.body.appendChild(popupRoot);

  const close = () => popupRoot.remove();
  for (const node of popupRoot.querySelectorAll('[data-inputxml-prop-close]')) node.addEventListener('click', close);
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && document.body.contains(popupRoot)) close();
  };
  document.addEventListener('keydown', onKeyDown, { once: true });

  installInlineInputXmlPropertyTransferUi(popupRoot);
  popupRoot.querySelector('#model-converters-primary-input')?.focus?.();
  setStatus(hostRoot, 'InputXML Property Transfer popup is open.', 'running');
  return popupRoot;
}

export function installInputXmlPropertyTransferUi(root = globalThis.document) {
  if (!root?.querySelector || !globalThis.document) return () => {};
  const select = appendConverterOption(root);
  const runButton = root.querySelector('#model-converters-run');
  if (!select || !runButton || root.dataset.inputxmlPropertyTransferPopupUi === 'mounted') return () => {};
  root.dataset.inputxmlPropertyTransferPopupUi = 'mounted';

  const onSelectChange = (event) => {
    if (select.value !== CONVERTER_ID) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderLauncher(root);
    openPropertyTransferPopup(root);
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
