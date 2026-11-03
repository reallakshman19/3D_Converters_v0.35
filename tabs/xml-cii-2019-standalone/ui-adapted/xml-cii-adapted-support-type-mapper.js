import { createElement, appendLabeledControl } from './xml-cii-adapted-dom.js';
import {
  bindUnifiedSupportMappingTable,
  renderUnifiedSupportMappingTable
} from '../../model-converters/converters/xmltocii2019_helper/support-mapping-table.js';
import { saveMasterContextToLocalStorage } from './xml-cii-adapted-state.js';
import { createDefaultSupportTypeMapperConfig } from '../xml-cii-support-type-mapper.js';

const KINDS = ['REST', 'GUIDE', 'LINESTOP', 'ANCHOR'];

function mapperRowsOf(state) {
  return state.supportTypeMapperConfig || createDefaultSupportTypeMapperConfig();
}

function rowFor(state, kind) {
  return mapperRowsOf(state).find((row) => row.kind === kind) || { kind, aliases: [], ciiKind: '' };
}

function table(headers, rows, keys, emptyText) {
  if (!rows.length) return createElement('div', emptyText, 'xml-cii-phase-help');
  const tableEl = createElement('table', '', 'xml-cii-audit-table');
  const thead = createElement('thead');
  const headRow = createElement('tr');
  for (const header of headers) headRow.appendChild(createElement('th', header));
  thead.appendChild(headRow);
  const tbody = createElement('tbody');
  for (const row of rows.slice(0, 300)) {
    const tr = createElement('tr');
    for (const key of keys) {
      const value = row[key];
      tr.appendChild(createElement('td', Array.isArray(value) ? value.join(', ') : String(value ?? '')));
    }
    tbody.appendChild(tr);
  }
  tableEl.append(thead, tbody);
  return tableEl;
}

function renderMapperKindSection(parent, state, kind) {
  const row = rowFor(state, kind);
  const section = createElement('section', '', 'xml-cii-audit-panel');
  section.appendChild(createElement('h3', `${kind} mapper section`));

  const aliasArea = appendLabeledControl(section, 'Aliases (one per line):', createElement('textarea'));
  aliasArea.value = (row.aliases || []).join('\n');
  aliasArea.dataset.field = `support-mapper-aliases-${kind}`;

  const ciiInput = appendLabeledControl(section, 'CII support kind:', createElement('input'));
  ciiInput.type = 'text';
  ciiInput.value = row.ciiKind || '';
  ciiInput.dataset.field = `support-mapper-cii-${kind}`;

  parent.appendChild(section);
}

function renderConfidencePolicy(parent) {
  const section = createElement('section', '', 'xml-cii-audit-panel');
  section.appendChild(createElement('h3', 'Confidence / precedence policy'));
  section.appendChild(createElement(
    'p',
    'Confidence is derived from the evidence, not manually assigned. Explicit semantics such as GUIDE, LINE STOP, AXIAL STOP, DIRECTIONAL ANCHOR and PIPE REST/REST are HIGH. Short/prefix codes such as GT, ST, PG and LS are LOW fallbacks. A stronger decision suppresses lower-confidence competing kinds for the same support occurrence; equal-strength conflicts remain review-required.',
    'xml-cii-phase-help'
  ));
  parent.appendChild(section);
}

function renderTestInputSection(parent, state) {
  const section = createElement('section', '', 'xml-cii-audit-panel');
  section.appendChild(createElement('h3', 'Test Input / Save to Config'));
  const input = appendLabeledControl(section, 'Support / DTXR text to classify (one per line):', createElement('textarea'));
  input.value = state.supportTypeMapperTestInput || '';
  input.dataset.field = 'support-mapper-test-input';

  const help = createElement('p', 'Use | between separate support occurrences. The audit keeps NAME=... occurrence identity so one support cannot acquire another support segment\'s kind.', 'xml-cii-phase-help');
  section.appendChild(help);

  const actions = createElement('div', '', 'xml-cii-resolver-actions');
  const testBtn = createElement('button', state.supportTypeMapperRunning ? 'Testing…' : 'Test support mapper');
  testBtn.type = 'button';
  testBtn.dataset.action = 'build-support-mapper';
  const saveBtn = createElement('button', 'Save to Config');
  saveBtn.type = 'button';
  saveBtn.dataset.action = 'save-support-mapper';
  actions.append(testBtn, saveBtn, createElement('span', state.supportTypeMapperStatus || 'Support mapper not tested yet.', 'xml-cii-phase-help'));
  section.appendChild(actions);
  parent.appendChild(section);
}

function renderPreviewSection(parent, state) {
  const result = state.supportTypeMapperResult;
  const section = createElement('section', '', 'xml-cii-audit-panel');
  section.appendChild(createElement('h3', 'CII Support Kind / Confidence Audit'));
  section.appendChild(table(
    ['Occurrence', 'Source', 'Evidence', 'Support Kind', 'CII Kind', 'Confidence', 'Score', 'Matched Alias', 'Match Mode', 'Suppressed Candidates', 'Status', 'Decision Basis'],
    result?.previewRows || [],
    ['occurrenceName', 'source', 'evidenceText', 'supportKind', 'ciiKind', 'confidence', 'confidenceScore', 'matchedAlias', 'matchMode', 'suppressedCandidates', 'status', 'decisionReason'],
    'No preview rows yet. Enter text above and click Test support mapper.'
  ));
  parent.appendChild(section);
}

function renderDiagnosticsSection(parent, state) {
  const result = state.supportTypeMapperResult;
  const section = createElement('section', '', 'xml-cii-audit-panel');
  section.appendChild(createElement('h3', 'Mapper Diagnostics'));
  section.appendChild(table(
    ['Level', 'Type', 'Occurrence', 'Confidence', 'Message'],
    result?.diagnostics || [],
    ['level', 'type', 'occurrenceName', 'confidence', 'message'],
    'No diagnostics yet.'
  ));
  parent.appendChild(section);
}

function renderRawJsonSection(parent, state) {
  const details = createElement('details', '', 'xml-cii-raw-json');
  details.appendChild(createElement('summary', 'Raw JSON advanced/debug — auditable mapper result'));
  details.appendChild(createElement('pre', JSON.stringify(state.supportTypeMapperResult || {}, null, 2)));
  parent.appendChild(details);
}

// Free-text support/DTXR description → REST/GUIDE/LINESTOP/ANCHOR kind classifier. Distinct from
// the numeric restraint-type-code table below: this classifies loose text evidence into a kind,
// the unified table below maps a kind to CAESAR/CII restraint type codes.
function renderSupportTypeClassifierPanel(card, state) {
  renderConfidencePolicy(card);
  for (const kind of KINDS) renderMapperKindSection(card, state, kind);
  renderTestInputSection(card, state);
  renderPreviewSection(card, state);
  renderDiagnosticsSection(card, state);
  renderRawJsonSection(card, state);
}

function renderRestraintTypeCodeTable(card, stateRef, render) {
  const state = stateRef.current;
  const config = JSON.parse(state.supportConfigJson || '{}');

  const container = createElement('div', '', 'mc-support-mapper-host');
  card.appendChild(container);

  const onSaveConfig = (nextConfig) => {
    const nextJson = JSON.stringify(nextConfig, null, 2);
    const current = stateRef.current || {};
    const masterContext = current.masterContext
      ? { ...current.masterContext, config: nextConfig }
      : current.masterContext;
    stateRef.current = {
      ...current,
      supportConfigJson: nextJson,
      masterContext,
    };
    if (masterContext) saveMasterContextToLocalStorage(masterContext);
    if (typeof render === 'function') render();
  };

  try {
    renderUnifiedSupportMappingTable(container, config);
    bindUnifiedSupportMappingTable(container, config, { onSaveConfig });
  } catch (error) {
    container.innerHTML = `
      <div style="padding:16px;text-align:center;color:#ef4444;">
        Support mapping table unavailable: ${error?.message || String(error)}
      </div>
    `;
  }
}

export function renderStandaloneSupportTypeMapperPanel(card, stateOrRef, render) {
  const isRef = stateOrRef && 'current' in stateOrRef;
  const stateRef = isRef ? stateOrRef : { current: stateOrRef };
  const state = stateRef.current;

  card.innerHTML = '';
  renderSupportTypeClassifierPanel(card, state);
  renderRestraintTypeCodeTable(card, stateRef, render);
}
