import {
  DEFAULT_JSON_TRACE_CAPTURE_FIELDS,
  normalizeJsonTraceCaptureFields,
} from '../xml-cii-json-trace-fields.js';

const INSTALL_FLAG = '__xmlCiiJsonTraceFieldsV2';
let observer = null;

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function parseConfig(textarea) {
  try {
    const parsed = JSON.parse(text(textarea?.value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function inputStyle(input, width = '100%') {
  Object.assign(input.style, {
    width,
    minWidth: '0',
    background: '#0b1320',
    color: '#f8fafc',
    border: '1px solid #475569',
    borderRadius: '5px',
    padding: '6px 8px',
    fontSize: '12px',
  });
}

function button(label, title) {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.title = title;
  Object.assign(control.style, {
    cursor: 'pointer', background: '#1e293b', color: '#e2e8f0',
    border: '1px solid #475569', borderRadius: '5px', padding: '5px 9px',
  });
  return control;
}

function syncTextarea(textarea, config, table) {
  const aliasValue = (name) => text(table.querySelector(`[data-json-trace-setting="${name}"]`)?.value)
    .split(/[\n,|]+/).map((item) => item.trim()).filter(Boolean);
  const captureFields = [...table.querySelectorAll('[data-json-trace-capture-row]')].map((row) => ({
    name: text(row.querySelector('[data-json-trace-capture-name]')?.value).toUpperCase(),
    enabled: row.querySelector('[data-json-trace-capture-enabled]')?.checked !== false,
  })).filter((field) => field.name);
  const tolerance = Number(table.querySelector('[data-json-trace-setting="coordinateTolerance"]')?.value);
  textarea.value = JSON.stringify({
    ...config,
    nodeAliases: aliasValue('nodeAliases'),
    psAliases: aliasValue('psAliases'),
    posAliases: aliasValue('posAliases'),
    captureFields,
    coordinateTolerance: Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 6,
  }, null, 2);
}

function captureRow(field, tbody, onChange) {
  const tr = document.createElement('tr');
  tr.dataset.jsonTraceCaptureRow = 'true';
  const useCell = document.createElement('td');
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = field.enabled !== false;
  enabled.dataset.jsonTraceCaptureEnabled = 'true';
  useCell.appendChild(enabled);
  const fieldCell = document.createElement('td');
  const name = document.createElement('input');
  name.type = 'text';
  name.value = field.name;
  name.dataset.jsonTraceCaptureName = 'true';
  inputStyle(name);
  fieldCell.appendChild(name);
  const purpose = document.createElement('td');
  purpose.textContent = 'Capture and expose this staged JSON field in trace members/tree output.';
  purpose.style.color = '#94a3b8';
  const action = document.createElement('td');
  const remove = button('×', 'Remove field');
  remove.addEventListener('click', () => { tr.remove(); onChange(); });
  action.appendChild(remove);
  tr.append(useCell, fieldCell, purpose, action);
  for (const cell of tr.children) Object.assign(cell.style, { padding: '7px', borderBottom: '1px solid rgba(148,163,184,.12)' });
  enabled.addEventListener('change', onChange);
  name.addEventListener('input', onChange);
  tbody.appendChild(tr);
}

function settingRow(tbody, labelText, key, value, purpose, type = 'text') {
  const tr = document.createElement('tr');
  const useCell = document.createElement('td');
  useCell.textContent = '✓';
  useCell.style.color = '#4ade80';
  const nameCell = document.createElement('td');
  nameCell.textContent = labelText;
  nameCell.style.color = '#e2e8f0';
  const valueCell = document.createElement('td');
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.value = Array.isArray(value) ? value.join(', ') : value;
  input.dataset.jsonTraceSetting = key;
  inputStyle(input);
  if (type === 'textarea') input.rows = 2;
  valueCell.appendChild(input);
  const purposeCell = document.createElement('td');
  purposeCell.textContent = purpose;
  purposeCell.style.color = '#94a3b8';
  tr.append(useCell, nameCell, valueCell, purposeCell);
  for (const cell of tr.children) Object.assign(cell.style, { padding: '7px', borderBottom: '1px solid rgba(148,163,184,.12)' });
  tbody.appendChild(tr);
  return input;
}

function enhanceConfigTable(textarea) {
  if (!textarea || textarea.dataset.jsonTraceTableEnhanced) return;
  textarea.dataset.jsonTraceTableEnhanced = 'true';
  const config = parseConfig(textarea);
  const label = textarea.closest('label');
  if (label) label.style.display = 'none';
  textarea.style.display = 'none';

  const host = document.createElement('div');
  host.dataset.jsonTraceConfigTable = 'true';
  Object.assign(host.style, { marginTop: '8px', border: '1px solid rgba(148,163,184,.18)', borderRadius: '8px', overflow: 'hidden' });
  const note = document.createElement('div');
  note.textContent = 'Editable JSON Trace authority. Alias rows control matching; enabled capture fields are retained for every matched JSON member and shown in the Evidence Tree.';
  Object.assign(note.style, { padding: '9px 11px', color: '#bfdbfe', background: 'rgba(30,64,175,.14)', fontSize: '12px' });
  host.appendChild(note);

  const table = document.createElement('table');
  Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: '#0f172a' });
  table.innerHTML = '<thead><tr><th>Use</th><th>Field / setting</th><th>Value / aliases</th><th>Purpose</th></tr></thead>';
  table.querySelectorAll('th').forEach((th) => Object.assign(th.style, { padding: '8px', textAlign: 'left', color: '#cbd5e1', background: '#1e293b' }));
  const tbody = document.createElement('tbody');
  const settings = [
    ['Node aliases', 'nodeAliases', config.nodeAliases || [], 'JSON keys allowed to identify a node.', 'textarea'],
    ['PS aliases', 'psAliases', config.psAliases || [], 'JSON keys allowed to identify support/PS evidence.', 'textarea'],
    ['Position aliases', 'posAliases', config.posAliases || [], 'JSON keys allowed to supply DTXR position evidence.', 'textarea'],
    ['Coordinate tolerance (mm)', 'coordinateTolerance', config.coordinateTolerance ?? 6, 'Maximum position-group and XML match distance.', 'number'],
  ];
  settings.forEach(([labelText, key, value, purpose, type]) => settingRow(tbody, labelText, key, value, purpose, type));
  table.appendChild(tbody);
  host.appendChild(table);

  const captureTitle = document.createElement('div');
  Object.assign(captureTitle.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px', background: '#111827', borderTop: '1px solid rgba(148,163,184,.18)' });
  const title = document.createElement('strong');
  title.textContent = 'Captured staged JSON fields';
  title.style.color = '#f8fafc';
  const add = button('+ Add field', 'Add another staged JSON field');
  captureTitle.append(title, add);
  host.appendChild(captureTitle);

  const captureTable = document.createElement('table');
  Object.assign(captureTable.style, { width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: '#0f172a' });
  captureTable.innerHTML = '<thead><tr><th>Use</th><th>Field</th><th>Purpose</th><th></th></tr></thead>';
  captureTable.querySelectorAll('th').forEach((th) => Object.assign(th.style, { padding: '8px', textAlign: 'left', color: '#cbd5e1', background: '#1e293b' }));
  const captureBody = document.createElement('tbody');
  captureTable.appendChild(captureBody);
  host.appendChild(captureTable);

  const sync = () => syncTextarea(textarea, config, host);
  const fields = normalizeJsonTraceCaptureFields(config.captureFields || DEFAULT_JSON_TRACE_CAPTURE_FIELDS);
  fields.forEach((field) => captureRow(field, captureBody, sync));
  add.addEventListener('click', () => { captureRow({ name: 'NEW_FIELD', enabled: true }, captureBody, sync); sync(); });
  host.querySelectorAll('[data-json-trace-setting]').forEach((input) => {
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
  });
  sync();
  (label?.parentElement || textarea.parentElement)?.insertBefore(host, label || textarea);
}

function moveDiagnostics(workspace) {
  const diagnostics = workspace?.querySelector('.xml-cii-resolver-diagnostics-container');
  if (!diagnostics || diagnostics.dataset.movedToBottom) return;
  diagnostics.dataset.movedToBottom = 'true';
  diagnostics.style.marginTop = '18px';
  diagnostics.style.padding = '14px';
  diagnostics.style.border = '1px solid rgba(148,163,184,.16)';
  diagnostics.style.borderRadius = '8px';
  const title = diagnostics.querySelector('h4');
  if (title) title.textContent = 'Resolver Diagnostics (internal counts and decisions)';
  const note = document.createElement('p');
  note.textContent = 'This section reports resolver index counts, match/rejection totals, field-capture counts, and ledger decision diagnostics. It does not modify the enriched XML.';
  note.className = 'xml-cii-phase-help';
  title?.insertAdjacentElement('afterend', note);
  workspace.appendChild(diagnostics);
}

function ensureMapperAlias(input, alias) {
  if (!input) return false;
  const values = text(input.value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (values.some((item) => item.toUpperCase() === alias)) return false;
  input.value = [...values, alias].join('\n');
  return true;
}

function seedSupportMapperBeforeAction(event) {
  const action = event.target?.closest?.('[data-action="build-support-mapper"], [data-action="save-support-mapper"]');
  if (!action) return;
  const root = action.closest('.xml-cii-main-workspace') || document;
  const guide = root.querySelector('[data-field="support-mapper-aliases-GUIDE"]');
  const lineStop = root.querySelector('[data-field="support-mapper-aliases-LINESTOP"]');
  ensureMapperAlias(guide, 'GT');
  ensureMapperAlias(lineStop, 'ST');
  guide?.dispatchEvent(new Event('change', { bubbles: true }));
  lineStop?.dispatchEvent(new Event('change', { bubbles: true }));
}

function scan() {
  document.querySelectorAll('[data-field="resolver-json-config"]').forEach(enhanceConfigTable);
  document.querySelectorAll('.xml-cii-sub-workspace').forEach(moveDiagnostics);
  document.querySelectorAll('[data-field="support-mapper-aliases-GUIDE"]').forEach((input) => ensureMapperAlias(input, 'GT'));
  document.querySelectorAll('[data-field="support-mapper-aliases-LINESTOP"]').forEach((input) => ensureMapperAlias(input, 'ST'));
}

export function installJsonTraceFieldUiEnhancement() {
  if (typeof document === 'undefined' || globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  document.addEventListener('click', seedSupportMapperBeforeAction, true);
  observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
}
