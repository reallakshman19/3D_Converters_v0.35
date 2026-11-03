import { getConverterById } from './converter-registry.js?v=20260617-basic-glb-3';
import { installCiiV11V14Addon } from './cii-v11-v14-addon.js?v=20260816-cii-v11-v14-dropdown-release-4';
import { downloadOutput } from './core/output-utils.js';

const VERSION = '20260816-cii-v11-v14-dropdown-release-4';
const CONVERTER_ID = 'cii_v11_v14';
const LABEL = 'CAESAR Ver. 14 ↔ 11';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[ch]);
}

function isSyntheticOption(option) {
  return option?.dataset?.ciiV11V14Tool === 'true' || option?.dataset?.ciiMergeTool === 'true';
}

function firstNormalOption(select) {
  return Array.from(select?.options || []).find((option) => !option.disabled && !isSyntheticOption(option)) || null;
}

function validFallback(select, value) {
  if (!value) return '';
  const option = Array.from(select?.options || []).find((candidate) => candidate.value === value);
  return option && !option.disabled && !isSyntheticOption(option) ? option.value : '';
}

function modalMarkup() {
  return `
    <div data-cii-v11-v14-card style="width:min(760px,96vw);max-height:90vh;overflow:hidden;display:flex;flex-direction:column;background:#111923;color:#e7edf5;border:1px solid #33465e;border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.55);">
      <div style="padding:16px 18px;border-bottom:1px solid #2d3c50;display:flex;justify-content:space-between;gap:18px;align-items:flex-start;">
        <div>
          <div style="font-size:19px;font-weight:750;">${LABEL}</div>
          <div style="margin-top:5px;color:#9fb1c6;font-size:12px;line-height:1.45;max-width:620px;">Convert one CAESAR II CII neutral file between Ver. 11 and Ver. 14. Generated output is independently checked against its CONTROL-driven target record envelope before download.</div>
        </div>
        <button type="button" data-cii-v11-v14-close class="model-converters-download-btn" aria-label="Close">Close</button>
      </div>
      <div style="padding:16px 18px;overflow:auto;">
        <label style="display:block;color:#a9c3e2;font-size:12px;">CII v11 / v14 input
          <input data-cii-v11-v14-file type="file" accept=".cii,.CII" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;background:#0c141e;color:#e7edf5;border:1px solid #3a4d64;border-radius:6px;padding:8px 9px;">
        </label>

        <div style="display:grid;grid-template-columns:minmax(220px,1fr) minmax(260px,1fr);gap:12px;margin-top:14px;align-items:end;">
          <label style="display:block;color:#a9c3e2;font-size:12px;">Target Version
            <select data-cii-v11-v14-target style="display:block;width:100%;box-sizing:border-box;margin-top:6px;background:#0c141e;color:#e7edf5;border:1px solid #3a4d64;border-radius:6px;padding:8px 9px;">
              <option>Auto (opposite)</option>
              <option>11</option>
              <option>14</option>
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:8px;color:#c5d2df;font-size:12px;padding-bottom:8px;">
            <input data-cii-v11-v14-lossy type="checkbox">
            Allow loss of v14-only extension fields
          </label>
        </div>

        <div style="margin-top:13px;padding:10px 12px;border-left:3px solid #6b89ad;background:#121f2d;color:#9fb1c6;font-size:12px;line-height:1.45;">
          Legacy SIF/TEE items 1–30 are retained independently for both tee slots by semantic mapping where a qualified legacy meaning exists; axial and torsional SIF positions are remapped rather than copied by row. Unqualified Ver. 14 B31J/version-owned fields are fail-closed unless explicit loss is selected. Reducer extensions and ALLOWBLS items 154–168 follow the same explicit-loss policy. Every conversion emits an audit JSON file.
        </div>

        <div style="display:flex;gap:10px;align-items:center;margin-top:16px;flex-wrap:wrap;">
          <button type="button" data-cii-v11-v14-run class="model-converters-run-btn">Convert CII</button>
          <span data-cii-v11-v14-status style="font-size:12px;color:#9fb1c6;"></span>
        </div>
        <div data-cii-v11-v14-outputs style="display:none;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap;"></div>
        <pre data-cii-v11-v14-log style="display:none;margin:12px 0 0;max-height:190px;overflow:auto;white-space:pre-wrap;background:#09111a;border:1px solid #26384d;border-radius:7px;padding:10px;color:#b9c7d7;font:11px/1.45 Consolas,monospace;"></pre>
      </div>
    </div>
  `;
}

function openConverterModal() {
  const definition = getConverterById(CONVERTER_ID);
  if (!definition || definition.disabled === true || typeof definition.run !== 'function') {
    throw new Error('CAESAR v11/v14 converter definition is not available in the dropdown registry.');
  }

  const overlay = document.createElement('div');
  overlay.dataset.ciiV11V14Modal = VERSION;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = modalMarkup();
  document.body.appendChild(overlay);

  const fileEl = overlay.querySelector('[data-cii-v11-v14-file]');
  const targetEl = overlay.querySelector('[data-cii-v11-v14-target]');
  const lossyEl = overlay.querySelector('[data-cii-v11-v14-lossy]');
  const runEl = overlay.querySelector('[data-cii-v11-v14-run]');
  const statusEl = overlay.querySelector('[data-cii-v11-v14-status]');
  const outputsEl = overlay.querySelector('[data-cii-v11-v14-outputs]');
  const logEl = overlay.querySelector('[data-cii-v11-v14-log]');
  let outputs = [];

  const setStatus = (message, kind = '') => {
    statusEl.textContent = String(message || '');
    statusEl.style.color = kind === 'error' ? '#ffaaaa' : kind === 'ok' ? '#9be3b0' : '#e4c879';
  };
  const setLog = (value) => {
    const text = Array.isArray(value) ? value.filter(Boolean).join('\n') : String(value || '');
    logEl.textContent = text;
    logEl.style.display = text ? 'block' : 'none';
  };
  const clearOutputs = () => {
    outputs = [];
    outputsEl.innerHTML = '';
    outputsEl.style.display = 'none';
  };
  const renderOutputs = () => {
    outputsEl.innerHTML = outputs.map((output, index) => `
      <button type="button" data-cii-v11-v14-download="${index}" class="model-converters-download-btn">Download ${esc(output?.name || `output-${index + 1}`)}</button>
    `).join('');
    outputsEl.style.display = outputs.length ? 'flex' : 'none';
  };

  runEl.addEventListener('click', async () => {
    clearOutputs();
    setLog('');
    const file = fileEl.files?.[0];
    if (!file) {
      setStatus('Select a CII file first.', 'error');
      return;
    }

    runEl.disabled = true;
    setStatus('Preparing CAESAR conversion…');
    const stdout = [];
    const stderr = [];
    const logger = {
      log: (message) => stdout.push(String(message)),
      error: (message) => stderr.push(String(message)),
      stdout,
      stderr,
    };

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await definition.run({
        converterId: CONVERTER_ID,
        inputFiles: [{ role: 'primary', name: file.name, bytes }],
        options: {
          targetVersion: targetEl.value,
          allowLossy: lossyEl.checked === true,
        },
        logger,
        setStatus,
      });
      if (!result?.ok) throw new Error(result?.error || 'CAESAR v11/v14 conversion failed.');
      outputs = Array.isArray(result.outputs) ? result.outputs : [];
      if (!outputs.length) throw new Error('Converter completed without downloadable outputs.');
      renderOutputs();
      const audit = result?.logs?.audit;
      const lossCount = Array.isArray(audit?.loss_events) ? audit.loss_events.length : 0;
      const summary = audit?.source_version && audit?.target_version
        ? `Converted and structurally validated CII v${audit.source_version} → v${audit.target_version}${lossCount ? `; ${lossCount} explicit v14-only loss event(s)` : ''}.`
        : 'CAESAR conversion completed and target structure validated.';
      setStatus(summary, lossCount ? '' : 'ok');
      setLog([
        ...stdout,
        ...(Array.isArray(result?.logs?.stdout) ? result.logs.stdout : []),
        ...stderr.map((line) => `ERROR: ${line}`),
        ...(Array.isArray(result?.logs?.stderr) ? result.logs.stderr.map((line) => `STDERR: ${line}`) : []),
      ]);
    } catch (error) {
      setStatus('Conversion blocked.', 'error');
      setLog(String(error?.stack || error?.message || error || 'Conversion failed.'));
    } finally {
      runEl.disabled = false;
    }
  });

  outputsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cii-v11-v14-download]');
    if (!button) return;
    const output = outputs[Number(button.getAttribute('data-cii-v11-v14-download'))];
    if (output) downloadOutput(output);
  });

  const close = () => overlay.remove();
  overlay.querySelector('[data-cii-v11-v14-close]').addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
}

export function installCiiV11V14DropdownIntegration(container) {
  if (!container) return false;
  if (installCiiV11V14Addon() !== true) return false;
  const definition = getConverterById(CONVERTER_ID);
  if (!definition || definition.disabled === true || typeof definition.run !== 'function') return false;

  const select = container.querySelector('#model-converters-select');
  if (!select) return false;
  if (select.dataset.ciiV11V14DropdownIntegration === VERSION) return true;

  const existing = select.querySelector(`option[value="${CONVERTER_ID}"]`);
  if (existing && existing.dataset.ciiV11V14Tool !== 'true') {
    // Future/native legacy-adapter support wins. Do not intercept a real option.
    select.dataset.ciiV11V14DropdownIntegration = VERSION;
    select.dataset.ciiV11V14DropdownMode = 'native';
    return true;
  }

  const option = existing || document.createElement('option');
  option.value = CONVERTER_ID;
  option.textContent = definition.label || LABEL;
  option.dataset.ciiV11V14Tool = 'true';
  if (!existing) {
    const anchor = select.querySelector('option[value="cii_syntax_check_2019"]');
    if (anchor) select.insertBefore(option, anchor);
    else select.appendChild(option);
  }

  const selectedOption = select.options[select.selectedIndex];
  const initialFallback = !isSyntheticOption(selectedOption)
    ? select.value
    : (firstNormalOption(select)?.value || '');
  select.dataset.ciiV11V14FallbackValue = initialFallback;
  select.dataset.ciiV11V14DropdownIntegration = VERSION;
  select.dataset.ciiV11V14DropdownMode = 'compatibility-bridge';

  select.addEventListener('change', (event) => {
    const selected = select.options[select.selectedIndex];
    if (selected?.dataset?.ciiV11V14Tool !== 'true') {
      if (!selected?.disabled && !isSyntheticOption(selected)) {
        select.dataset.ciiV11V14FallbackValue = select.value;
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const fallback = validFallback(select, select.dataset.ciiV11V14FallbackValue)
      || firstNormalOption(select)?.value
      || '';
    if (fallback) select.value = fallback;

    try {
      openConverterModal();
    } catch (error) {
      console.error('[CAESAR v11/v14 dropdown] Failed to open converter.', error);
    }
  }, true);

  return true;
}

export const __CII_V11_V14_DROPDOWN_INTEGRATION_VERSION__ = VERSION;
