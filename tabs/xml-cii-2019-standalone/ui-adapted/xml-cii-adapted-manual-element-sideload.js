import { createElement, appendLabeledControl, createOption } from './xml-cii-adapted-dom.js';

function text(value, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function actionButton(action, label) {
  const button = createElement('button', label);
  button.type = 'button';
  button.dataset.action = action;
  return button;
}

function table(headers, data, emptyText) {
  if (!data.length) return createElement('div', emptyText, 'xml-cii-phase-help');
  const tableEl = createElement('table', '', 'xml-cii-manual-table');
  const head = createElement('thead');
  const hr = createElement('tr');
  for (const header of headers) hr.appendChild(createElement('th', header));
  head.appendChild(hr);
  tableEl.append(head, tableBody(headers, data));
  
  const scrollBox = createElement('div');
  if (scrollBox.style) Object.assign(scrollBox.style, { maxHeight: '250px', overflowY: 'auto', border: '1px solid rgba(148, 163, 184, 0.08)', borderRadius: '4px' });
  scrollBox.appendChild(tableEl);
  return scrollBox;
}

function tableBody(headers, data) {
  const body = createElement('tbody');
  for (const item of data.slice(0, 30)) {
    const tr = createElement('tr');
    for (const header of headers) tr.appendChild(createElement('td', text(valueFor(item, header))));
    body.appendChild(tr);
  }
  return body;
}

function valueFor(item, header) {
  const key = { Row: 'rowIndex', Kind: 'kind', Key: 'key', Restraint: 'restraint', Hits: 'hitCount', From: 'fromNode', To: 'toNode', PS: 'ps', POS: 'pos', Type: 'typeCode', Inherited: 'inheritedFields', Rows: 'rows' }[header] || header;
  const value = item[key];
  return typeof value === 'object' && value ? JSON.stringify(value) : value;
}

function renderActions(parent, state) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'Save to Run Options'));
  const actions = createElement('div', '', 'xml-cii-manual-actions');
  actions.append(actionButton('run-manual-element-sideload', state.manualElementSideloadRunning ? 'Resolving…' : 'Resolve manual / side-load'));
  actions.append(actionButton('save-manual-element-sideload', 'Save to run options'));
  actions.append(createElement('span', state.manualElementSideloadWriteBackStatus || 'Manual / side-load config not saved yet.', 'xml-cii-phase-help'));
  section.appendChild(actions);
  parent.appendChild(section);
}

function renderPolicy(parent, state) {
  const cfg = state.manualElementSideloadConfig || {};
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'Policy / Tolerance'));
  const policy = appendLabeledControl(section, 'Policy:', createElement('select'));
  policy.dataset.field = 'manual-policy';
  for (const value of ['add-if-missing', 'add-always', 'replace']) policy.appendChild(createOption(value, value, cfg.policy === value));
  const tolerance = appendLabeledControl(section, 'Tolerance:', createElement('input'));
  tolerance.type = 'number';
  tolerance.value = cfg.tolerance ?? 0;
  tolerance.dataset.field = 'manual-tolerance';
  parent.appendChild(section);
}

function renderXmlManual(parent, state) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'XML Manual Restraints'));
  section.appendChild(createElement('p', 'Format: Node|PSNo.|POS|Restraint. Use kind NODE, PS, or POS in the first column.', 'xml-cii-phase-help'));
  const input = appendLabeledControl(section, 'Manual rows:', createElement('textarea'));
  input.value = state.manualElementSideloadConfig?.manualText || '';
  input.dataset.field = 'manual-restraints-text';
  if (input.style) Object.assign(input.style, { minHeight: '120px', maxHeight: '200px', resize: 'vertical', fontFamily: 'monospace', overflowY: 'auto' });
  parent.appendChild(section);
}

function renderMatched(parent, result) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'Matched Restraints'));
  section.appendChild(table(['Row', 'Kind', 'Key', 'Restraint', 'Hits'], rows(result?.matchedFacts), 'No matched manual restraints yet.'));
  parent.appendChild(section);
}

function renderRejected(parent, result) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'Rejected Restraints'));
  section.appendChild(table(['Row', 'Kind', 'Key', 'Restraint', 'Hits'], rows(result?.rejectedFacts), 'No rejected manual restraints.'));
  parent.appendChild(section);
}

function renderInputSideLoad(parent, state) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'InputXML Element Side-load'));
  section.appendChild(createElement('p', 'Format: FROM_NODE|TO_NODE|PS|POS|TYPE|Restraint. Only existing InputXML elements are matched.', 'xml-cii-phase-help'));
  const input = appendLabeledControl(section, 'Element side-load rows:', createElement('textarea'));
  input.value = state.elementSideLoadText || '';
  input.dataset.field = 'element-side-load';
  if (input.style) Object.assign(input.style, { minHeight: '120px', maxHeight: '200px', resize: 'vertical', fontFamily: 'monospace', overflowY: 'auto' });
  parent.appendChild(section);
}

function renderInputMatches(parent, result) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'FROM_NODE → TO_NODE Match Table'));
  section.appendChild(table(['Row', 'From', 'To', 'PS', 'POS', 'Type'], rows(result?.matchedSideLoadRows), 'No matched InputXML side-load rows yet.'));
  parent.appendChild(section);
}

function renderInherited(parent, result) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'Inherited Fields'));
  section.appendChild(table(['Key', 'Inherited'], rows(result?.inheritedFieldPreview), 'No inherited fields yet.'));
  parent.appendChild(section);
}

function renderDerived(parent, result) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'Derived Restraints TYPE 14 / 9 / 8'));
  section.appendChild(table(['From', 'To', 'PS', 'POS', 'Type'], rows(result?.derivedRestraintPreview), 'No derived restraints yet.'));
  parent.appendChild(section);
}

function renderUnmatched(parent, result) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'Unmatched Side-load Rows'));
  section.appendChild(table(['Row', 'From', 'To', 'PS', 'POS', 'Type'], rows(result?.unmatchedSideLoadRows), 'No unmatched side-load rows.'));
  parent.appendChild(section);
}

function renderDiagnostics(parent, result) {
  const section = createElement('section', '', 'xml-cii-manual-panel');
  section.appendChild(createElement('h3', 'Diagnostics'));
  section.appendChild(table(['Type', 'Rows'], rows(result?.diagnostics), 'No manual / side-load diagnostics yet.'));
  parent.appendChild(section);
}

export function renderStandaloneManualElementSideloadPanel(card, state) {
  card.appendChild(createElement('p', 'Resolve XML manual restraints by Node / PS / POS.', 'xml-cii-phase-help'));
  renderActions(card, state);
  renderPolicy(card, state);
  renderXmlManual(card, state);
  renderMatched(card, state.manualElementSideloadResult);
  renderRejected(card, state.manualElementSideloadResult);
}

export function renderStandaloneInputXmlElementSideloadPanel(card, state) {
  card.appendChild(createElement('p', 'Match InputXML side-load rows by FROM_NODE → TO_NODE and configure execution options.', 'xml-cii-phase-help'));
  
  const optsSection = createElement('section', '', 'xml-cii-manual-panel');
  optsSection.appendChild(createElement('h3', 'InputXML Parameters'));
  
  const output = appendLabeledControl(optsSection, 'inputXmlOutputMode:', createElement('select'));
  output.dataset.field = 'inputxml-output-mode';
  output.append(
    createOption('full-document', 'full-document', state.options.inputXmlOutputMode === 'full-document'),
    createOption('fragment', 'fragment', state.options.inputXmlOutputMode === 'fragment'),
  );
  
  const basis = appendLabeledControl(optsSection, 'pointPropertiesBasis:', createElement('select'));
  basis.dataset.field = 'point-properties-basis';
  basis.append(
    createOption('auto', 'auto', state.options.pointPropertiesBasis === 'auto'),
    createOption('TO', 'TO', state.options.pointPropertiesBasis === 'TO'),
    createOption('FROM', 'FROM', state.options.pointPropertiesBasis === 'FROM')
  );
  
  const policy = appendLabeledControl(optsSection, 'inputXmlRestraintPolicy:', createElement('select'));
  policy.dataset.field = 'inputxml-restraint-policy';
  for (const value of ['preserve-existing-restraints', 'convert-existing-restraints', 'replace-with-dtxr-derived-restraints', 'merge-existing-and-dtxr-derived-restraints']) {
    policy.appendChild(createOption(value, value, state.options.inputXmlRestraintPolicy === value));
  }
  
  const fill = appendLabeledControl(optsSection, 'fillSentinelFromLineContext:', createElement('input'));
  fill.type = 'checkbox';
  fill.checked = state.options.fillSentinelFromLineContext;
  fill.dataset.field = 'fill-sentinel';
  
  const aliases = appendLabeledControl(optsSection, 'normalizePressureCaseNames:', createElement('input'));
  aliases.type = 'checkbox';
  aliases.checked = state.options.normalizePressureCaseNames;
  aliases.dataset.field = 'pressure-aliases';
  
  card.appendChild(optsSection);
  
  renderInputSideLoad(card, state);
  renderInputMatches(card, state.manualElementSideloadResult);
  renderInherited(card, state.manualElementSideloadResult);
  renderDerived(card, state.manualElementSideloadResult);
  renderUnmatched(card, state.manualElementSideloadResult);
  renderDiagnostics(card, state.manualElementSideloadResult);
}
