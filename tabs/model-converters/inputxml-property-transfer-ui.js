import {
  DEFAULT_BRANCH_TRANSFER_PROPERTIES,
  DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS,
  DEFAULT_NODE_TRANSFER_PROPERTIES,
  applyInputXmlPropertyTransfer,
  propertyTransferAuditRowsToCsv,
  propertyTransferRowsToCsv,
  runInputXmlPropertyTransferPreview,
} from '../inputxml-property-transfer/index.js';
import { downloadOutput, baseNameWithoutExtension } from './core/output-utils.js';

const CONVERTER_ID = 'inputxml_property_transfer';
const CONVERTER_LABEL = 'InputXML Property Transfer by Coordinates';
const MOCK_SOURCE_URL = new URL('../../Benchmarks/InputXML%20Property%20Transfer/coordinate-tolerance/source_property_master.xml', import.meta.url);
const MOCK_TARGET_URL = new URL('../../Benchmarks/InputXML%20Property%20Transfer/coordinate-tolerance/target_geometry.xml', import.meta.url);
const MOCK_EXPECTED_URL = new URL('../../Benchmarks/InputXML%20Property%20Transfer/coordinate-tolerance/expected_transfer_report.csv', import.meta.url);

const stateByRoot = new WeakMap();

function text(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appendConverterOption(root) {
  const select = root?.querySelector?.('#model-converters-select');
  if (!select || select.querySelector(`option[value="${CONVERTER_ID}"]`)) return select;
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

function getState(root) {
  if (!stateByRoot.has(root)) {
    stateByRoot.set(root, {
      mockSourceXmlText: '',
      mockTargetXmlText: '',
      mockExpectedCsvText: '',
      lastResult: null,
    });
  }
  return stateByRoot.get(root);
}

function setStatus(root, message, tone = '') {
  const status = root.querySelector('#model-converters-status');
  if (!status) return;
  status.textContent = message;
  status.className = `model-converters-status ${tone}`.trim();
}

function setLogs(root, lines) {
  const logs = root.querySelector('#model-converters-logs');
  if (!logs) return;
  const normalized = Array.isArray(lines) ? lines.map(text).filter(Boolean) : [];
  logs.textContent = normalized.length ? normalized.join('\n') : '(no logs)';
}

function resetOutput(root) {
  const output = root.querySelector('#model-converters-output');
  if (output) output.innerHTML = '<span class="model-converters-muted">No output generated yet.</span>';
  const diag = root.querySelector('#model-converters-diagnostics-table');
  if (diag) {
    diag.style.display = 'none';
    diag.innerHTML = '';
  }
  const previewMeta = root.querySelector('#model-converters-preview-meta');
  if (previewMeta) previewMeta.textContent = 'Property-transfer preview is table-based. Geometry preview is not used for this utility.';
  setLogs(root, []);
}

function renderAdvancedFields(root) {
  const fields = root.querySelector('#model-converters-advanced-fields');
  if (!fields) return;
  fields.innerHTML = `
    <div class="model-converters-card" style="padding:10px;margin-bottom:10px;background:#111827;border:1px solid #26364b;border-radius:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
        <div>
          <div style="font-weight:700;color:#d7e6ff;">InputXML Property Transfer</div>
          <div class="model-converters-muted" style="font-size:11px;">Source XML properties are transferred to Target XML by nearby coordinates. Node numbers are not used as anchors.</div>
        </div>
        <button type="button" class="model-converters-download-btn" data-inputxml-prop-load-mock>Load mock</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;">
        ${numberField('Coordinate tolerance (mm)', 'coordinateToleranceMm', DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.coordinateToleranceMm, '0.001')}
        ${numberField('Coordinate decimals', 'coordinateDecimals', DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.coordinateDecimals, '1')}
        ${selectField('Diameter mode', 'diameterMode', ['ignore', 'prefer', 'strict'], DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.diameterMode)}
        ${numberField('Diameter tolerance (mm)', 'diameterToleranceMm', DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.diameterToleranceMm, '0.001')}
        ${selectField('Line family mode', 'lineFamilyMode', ['ignore', 'prefer', 'strict'], DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.lineFamilyMode)}
        ${selectField('Component type mode', 'componentTypeMode', ['ignore', 'prefer', 'strict'], DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.componentTypeMode)}
        ${textField('Source line regex', 'sourceLineFamilyRegex', DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.sourceLineFamilyRegex)}
        ${textField('Target line regex', 'targetLineFamilyRegex', DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.targetLineFamilyRegex)}
      </div>
      <label style="display:flex;align-items:center;gap:8px;color:#d7e6ff;font-size:12px;margin-top:8px;">
        <input type="checkbox" data-inputxml-prop-option="copySourceSentinels" ${DEFAULT_INPUTXML_PROPERTY_TRANSFER_OPTIONS.copySourceSentinels ? 'checked' : ''}>
        <span>Copy source CAESAR sentinels such as -100000.0</span>
      </label>
      <details style="margin-top:8px;">
        <summary style="color:#9cc5ff;cursor:pointer;">Transfer property selection</summary>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:8px;">
          <div>
            <div style="font-weight:700;color:#d7e6ff;margin-bottom:4px;">Node/component properties</div>
            ${propertyChecks(DEFAULT_NODE_TRANSFER_PROPERTIES, 'node')}
          </div>
          <div>
            <div style="font-weight:700;color:#d7e6ff;margin-bottom:4px;">Branch operating properties</div>
            ${propertyChecks(DEFAULT_BRANCH_TRANSFER_PROPERTIES, 'branch')}
          </div>
        </div>
      </details>
      <div class="model-converters-muted" style="font-size:11px;margin-top:8px;">Safety default: unmatched, blocked, ambiguous, missing-source, and source-sentinel rows retain target XML values exactly.</div>
    </div>
  `;
  fields.querySelector('[data-inputxml-prop-load-mock]')?.addEventListener('click', () => void loadMock(root));
}

function numberField(label, key, value, step) {
  return `<label class="model-converters-label"><span>${esc(label)}</span><input type="number" step="${esc(step)}" data-inputxml-prop-option="${esc(key)}" value="${esc(value)}"></label>`;
}

function textField(label, key, value) {
  return `<label class="model-converters-label"><span>${esc(label)}</span><input type="text" data-inputxml-prop-option="${esc(key)}" value="${esc(value)}"></label>`;
}

function selectField(label, key, values, selected) {
  return `<label class="model-converters-label"><span>${esc(label)}</span><select data-inputxml-prop-option="${esc(key)}">${values.map((value) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
}

function propertyChecks(properties, scope) {
  return properties.map((prop) => `
    <label style="display:flex;align-items:center;gap:8px;color:#d7e6ff;font-size:12px;margin:3px 0;">
      <input type="checkbox" data-inputxml-prop-property="${esc(scope)}:${esc(prop)}" checked>
      <span>${esc(prop)}</span>
    </label>
  `).join('');
}

function renderInputXmlPropertyTransferMode(root) {
  const primaryLabel = root.querySelector('#model-converters-primary-label');
  const primaryInput = root.querySelector('#model-converters-primary-input');
  const primaryName = root.querySelector('#model-converters-primary-name');
  const secondaryWrap = root.querySelector('#model-converters-secondary-wrap');
  const secondaryLabel = root.querySelector('#model-converters-secondary-label');
  const secondaryInput = root.querySelector('#model-converters-secondary-input');
  const secondaryName = root.querySelector('#model-converters-secondary-name');
  const xmlWorkflow = root.querySelector('#model-converters-xml-cii-workflow');
  const supportMapper = root.querySelector('#model-converters-support-mapper');
  const runButton = root.querySelector('#model-converters-run');

  if (primaryLabel) primaryLabel.textContent = 'Source InputXML - trusted properties (.xml,.XML)';
  if (primaryInput) primaryInput.setAttribute('accept', '.xml,.XML');
  if (primaryName && !primaryInput?.files?.[0]) primaryName.textContent = getState(root).mockSourceXmlText ? 'Mock source_property_master.xml loaded.' : 'No source file selected.';
  if (secondaryWrap) secondaryWrap.style.display = '';
  if (secondaryLabel) secondaryLabel.textContent = 'Target InputXML - geometry to update (.xml,.XML)';
  if (secondaryInput) secondaryInput.setAttribute('accept', '.xml,.XML');
  if (secondaryName && !secondaryInput?.files?.[0]) secondaryName.textContent = getState(root).mockTargetXmlText ? 'Mock target_geometry.xml loaded.' : 'No target file selected.';
  if (xmlWorkflow) {
    xmlWorkflow.hidden = true;
    xmlWorkflow.open = false;
  }
  if (supportMapper) {
    supportMapper.hidden = true;
    supportMapper.open = false;
  }
  if (runButton) runButton.textContent = 'Preview + Apply Transfer';

  renderAdvancedFields(root);
  setStatus(root, 'Ready: transfer selected properties by coordinate tolerance. Use Load mock for the benchmark XML pair.', '');
  resetOutput(root);
}

async function loadMock(root) {
  const runButton = root.querySelector('#model-converters-run');
  try {
    if (runButton) runButton.disabled = true;
    setStatus(root, 'Loading mock Source/Target InputXML benchmark...', 'running');
    const [source, target, expected] = await Promise.all([
      fetchText(MOCK_SOURCE_URL),
      fetchText(MOCK_TARGET_URL),
      fetchText(MOCK_EXPECTED_URL).catch(() => ''),
    ]);
    const state = getState(root);
    state.mockSourceXmlText = source;
    state.mockTargetXmlText = target;
    state.mockExpectedCsvText = expected;
    const primaryName = root.querySelector('#model-converters-primary-name');
    const secondaryName = root.querySelector('#model-converters-secondary-name');
    if (primaryName) primaryName.textContent = 'Mock source_property_master.xml loaded.';
    if (secondaryName) secondaryName.textContent = 'Mock target_geometry.xml loaded.';
    setStatus(root, 'Mock loaded. Click Preview + Apply Transfer.', 'ok');
    setLogs(root, [
      'Loaded benchmark Source InputXML and Target InputXML from Benchmarks/InputXML Property Transfer/coordinate-tolerance.',
      'Mock validates: 20 transferred, 1 no-coordinate, 1 diameter-blocked, 1 line-family-blocked, 1 ambiguous.',
    ]);
  } catch (error) {
    setStatus(root, `Mock load failed: ${error?.message || error}`, 'bad');
    setLogs(root, [error?.stack || error?.message || String(error)]);
  } finally {
    if (runButton) runButton.disabled = false;
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

function selectedPrimaryFile(root) {
  return root.querySelector('#model-converters-primary-input')?.files?.[0] || null;
}

function selectedSecondaryFile(root) {
  return root.querySelector('#model-converters-secondary-input')?.files?.[0] || null;
}

async function readInputText(root, role) {
  const file = role === 'source' ? selectedPrimaryFile(root) : selectedSecondaryFile(root);
  if (file) return { text: await file.text(), name: file.name, isMock: false };
  const state = getState(root);
  if (role === 'source' && state.mockSourceXmlText) return { text: state.mockSourceXmlText, name: 'source_property_master.xml', isMock: true };
  if (role === 'target' && state.mockTargetXmlText) return { text: state.mockTargetXmlText, name: 'target_geometry.xml', isMock: true };
  throw new Error(role === 'source' ? 'Select a source InputXML or click Load mock.' : 'Select a target InputXML or click Load mock.');
}

function readOptions(root) {
  const options = {};
  for (const input of root.querySelectorAll('[data-inputxml-prop-option]')) {
    const key = input.getAttribute('data-inputxml-prop-option');
    if (!key) continue;
    if (input.type === 'checkbox') options[key] = input.checked;
    else if (input.type === 'number') options[key] = Number(input.value);
    else options[key] = input.value;
  }

  const selectedNodeProperties = [];
  const selectedBranchProperties = [];
  for (const input of root.querySelectorAll('[data-inputxml-prop-property]')) {
    if (!input.checked) continue;
    const [scope, prop] = String(input.getAttribute('data-inputxml-prop-property') || '').split(':');
    if (scope === 'node' && prop) selectedNodeProperties.push(prop);
    if (scope === 'branch' && prop) selectedBranchProperties.push(prop);
  }
  options.selectedNodeProperties = selectedNodeProperties;
  options.selectedBranchProperties = selectedBranchProperties;
  return options;
}

async function runInputXmlPropertyTransfer(root) {
  const runButton = root.querySelector('#model-converters-run');
  try {
    if (runButton) runButton.disabled = true;
    setStatus(root, 'Running InputXML property transfer preview/writer...', 'running');
    setLogs(root, []);
    renderOutputRows(root, []);
    const source = await readInputText(root, 'source');
    const target = await readInputText(root, 'target');
    const options = readOptions(root);
    const preview = runInputXmlPropertyTransferPreview({
      sourceXmlText: source.text,
      targetXmlText: target.text,
      options,
    });
    const result = applyInputXmlPropertyTransfer({
      sourceXmlText: source.text,
      targetXmlText: target.text,
      options,
      previewResult: preview,
    });
    getState(root).lastResult = result;
    const stem = baseNameWithoutExtension(target.name || 'target_geometry');
    const summary = summarizeResult(result);
    renderOutputRows(root, [
      { name: `${stem}_property_transferred.xml`, text: result.updatedXmlText, mime: 'text/xml;charset=utf-8' },
      { name: `${stem}_property_transfer_report.csv`, text: propertyTransferRowsToCsv(result.rows || []), mime: 'text/csv;charset=utf-8' },
      { name: `${stem}_property_transfer_audit.csv`, text: propertyTransferAuditRowsToCsv(result.auditRows || []), mime: 'text/csv;charset=utf-8' },
      { name: `${stem}_property_transfer_preview.json`, text: JSON.stringify({ summary, rows: result.rows, writerSummary: result.writerSummary }, null, 2), mime: 'application/json;charset=utf-8' },
    ]);
    renderDiagnostics(root, result);
    setLogs(root, buildLogs(source, target, result, summary));
    setStatus(root, `Completed: ${summary.transferred} transferred; ${result.writerSummary?.written || 0} XML properties written.`, 'ok');
  } catch (error) {
    const message = error?.message || String(error);
    setStatus(root, `Failed: ${message}`, 'bad');
    setLogs(root, [error?.stack || message]);
  } finally {
    if (runButton) runButton.disabled = false;
  }
}

function summarizeResult(result) {
  const rows = result?.rows || [];
  const count = (decision) => rows.filter((row) => row.decision === decision).length;
  return {
    sourceNodes: result?.sourceModel?.nodes?.length || 0,
    targetNodes: result?.targetModel?.nodes?.length || 0,
    transferred: count('TRANSFERRED'),
    noCoordinate: count('NO_COORDINATE_MATCH'),
    diameterBlocked: count('DIAMETER_MISMATCH_BLOCKED'),
    lineBlocked: count('LINE_FAMILY_MISMATCH_BLOCKED'),
    ambiguous: count('AMBIGUOUS_COORDINATE_MATCH'),
    written: result?.writerSummary?.written || 0,
    retained: result?.writerSummary?.retained || 0,
    skipped: result?.writerSummary?.skipped || 0,
    xmlChanged: result?.xmlChanged === true,
  };
}

function buildLogs(source, target, result, summary) {
  return [
    `Source: ${source.name}${source.isMock ? ' (mock)' : ''}`,
    `Target: ${target.name}${target.isMock ? ' (mock)' : ''}`,
    `Source nodes: ${summary.sourceNodes}`,
    `Target nodes/elements: ${summary.targetNodes}`,
    `Transferred: ${summary.transferred}`,
    `No coordinate match: ${summary.noCoordinate}`,
    `Diameter blocked: ${summary.diameterBlocked}`,
    `Line family blocked: ${summary.lineBlocked}`,
    `Ambiguous: ${summary.ambiguous}`,
    `XML changed: ${summary.xmlChanged ? 'YES' : 'NO'}`,
    `XML properties written: ${summary.written}`,
    `Retained target rows: ${summary.retained}`,
    ...(result?.diagnostics || []).map((entry) => `Diagnostic: ${entry.message || JSON.stringify(entry)}`),
  ];
}

function renderOutputRows(root, outputs) {
  const output = root.querySelector('#model-converters-output');
  if (!output) return;
  const normalized = Array.isArray(outputs) ? outputs.filter((entry) => entry?.name) : [];
  if (!normalized.length) {
    output.innerHTML = '<span class="model-converters-muted">No output generated.</span>';
    return;
  }
  output.innerHTML = normalized.map((entry, index) => `
    <div class="model-converters-output-row">
      <strong>${esc(entry.name)}</strong>
      <button type="button" class="model-converters-download-btn" data-inputxml-prop-output="${index}">Download</button>
    </div>
  `).join('');
  for (const button of output.querySelectorAll('[data-inputxml-prop-output]')) {
    const idx = Number(button.getAttribute('data-inputxml-prop-output'));
    button.addEventListener('click', () => {
      const selected = normalized[idx];
      if (selected) downloadOutput(selected);
    });
  }
}

function renderDiagnostics(root, result) {
  const diag = root.querySelector('#model-converters-diagnostics-table');
  if (!diag) return;
  const rows = (result?.rows || []).slice(0, 40);
  diag.style.display = 'block';
  if (!rows.length) {
    diag.innerHTML = '<div class="model-converters-muted">No preview rows.</div>';
    return;
  }
  const th = 'text-align:left;padding:6px;border-bottom:1px solid #31455f;color:#9cc5ff;position:sticky;top:0;background:#111827;';
  const td = 'padding:5px;border-bottom:1px solid #24354a;color:#d7e6ff;vertical-align:top;';
  diag.innerHTML = `
    <div style="font-weight:700;color:#d7e6ff;margin-bottom:6px;">Property Transfer Preview - first ${rows.length} rows</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr>
        <th style="${th}">Target</th>
        <th style="${th}">Decision</th>
        <th style="${th}">Source</th>
        <th style="${th}">Changed</th>
        <th style="${th}">Retained</th>
        <th style="${th}">Reason</th>
      </tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td style="${td}"><strong>${esc(row.targetNode || row.targetNodeNumber)}</strong><br><span class="model-converters-muted">${esc(row.targetComponentType)} · ${esc(row.targetLineFamily)}</span></td>
          <td style="${td}">${esc(row.decision)}</td>
          <td style="${td}">${esc(row.sourceNode || row.sourceNodeNumber || '-')}<br><span class="model-converters-muted">${esc(row.sourceComponentType || '')} · ${esc(row.sourceLineFamily || '')}</span></td>
          <td style="${td}">${esc(row.propertyChanges)}</td>
          <td style="${td}">${esc(row.retainedTargetValues)}</td>
          <td style="${td}">${esc(row.reason)}</td>
        </tr>
      `).join('')}</tbody>
    </table>
  `;
}

export function installInputXmlPropertyTransferUi(root = globalThis.document) {
  if (!root?.querySelector || !globalThis.document) return () => {};
  const select = appendConverterOption(root);
  const runButton = root.querySelector('#model-converters-run');
  if (!select || !runButton || root.dataset.inputxmlPropertyTransferUi === 'mounted') return () => {};
  root.dataset.inputxmlPropertyTransferUi = 'mounted';

  const onSelectChange = (event) => {
    if (select.value !== CONVERTER_ID) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderInputXmlPropertyTransferMode(root);
  };

  const onRun = (event) => {
    if (select.value !== CONVERTER_ID) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void runInputXmlPropertyTransfer(root);
  };

  select.addEventListener('change', onSelectChange, true);
  runButton.addEventListener('click', onRun, true);
  if (select.value === CONVERTER_ID) renderInputXmlPropertyTransferMode(root);

  return () => {
    select.removeEventListener('change', onSelectChange, true);
    runButton.removeEventListener('click', onRun, true);
  };
}
