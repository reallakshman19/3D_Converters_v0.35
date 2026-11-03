import { createElement, appendLabeledControl } from './xml-cii-adapted-dom.js';
import { runStandaloneResolverJsonTrace } from '../xml-cii-resolver-json-trace.js';
import { buildAdaptedJsonTraceTree } from './xml-cii-adapted-regex-results.js';
import { renderStandaloneTraceTableImportPanel } from './xml-cii-adapted-table-trace-panel.js';
import {
  XML_NODE_TRACE_HEADERS,
  buildEvidenceTreeRows,
  buildMatchedFactsRows,
  buildXmlNodeWiseTraceRows,
} from '../xml-cii-trace-export.js';

function text(value, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function stat(result, key) {
  return Number(result?.indexStats?.[key] || 0);
}

function actionButton(action, label, disabled = false) {
  const button = createElement('button', label);
  button.type = 'button';
  button.dataset.action = action;
  button.disabled = !!disabled;
  if (disabled && button.style) Object.assign(button.style, { opacity: '0.45', cursor: 'not-allowed' });
  return button;
}

function metric(label, value) {
  const item = createElement('div', '', 'xml-cii-resolver-metric');
  item.append(createElement('span', label), createElement('strong', String(value ?? 0)));
  return item;
}

function sectionTitleBar(title, actions = []) {
  const bar = createElement('div', '', 'xml-cii-resolver-title-bar');
  if (bar.style) Object.assign(bar.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' });
  bar.appendChild(createElement('h3', title));
  if (actions.length) {
    const actionBar = createElement('div', '', 'xml-cii-resolver-actions');
    if (actionBar.style) Object.assign(actionBar.style, { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' });
    actionBar.append(...actions);
    bar.appendChild(actionBar);
  }
  return bar;
}

function table(headers, data, emptyText, idClass = 'xml-cii-resolver-table') {
  if (!data.length) return createElement('div', emptyText, 'xml-cii-phase-help');
  const tableEl = createElement('table', '', idClass);
  if (tableEl.style) Object.assign(tableEl.style, { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', color: '#cbd5e1', background: '#0f172a', borderRadius: '8px', overflow: 'hidden' });
  const head = createElement('thead');
  const hr = createElement('tr');
  if (hr.style) Object.assign(hr.style, { background: '#1e293b', borderBottom: '2px solid rgba(148, 163, 184, 0.12)' });
  for (const header of headers) {
    const th = createElement('th', header);
    if (th.style) Object.assign(th.style, { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' });
    hr.appendChild(th);
  }
  head.appendChild(hr);
  tableEl.append(head, tableBody(headers, data));
  const wrapper = createElement('div');
  if (wrapper.style) Object.assign(wrapper.style, { maxHeight: '420px', overflow: 'auto', border: '1px solid rgba(148,163,184,0.12)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' });
  wrapper.appendChild(tableEl);
  return wrapper;
}

function statusStyle(value) {
  const resolved = value.startsWith('RESOLVED_');
  const review = value.includes('AMBIGUOUS') || value.includes('REVIEW');
  if (resolved) return { color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.2)' };
  if (review) return { color: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)' };
  return { color: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.2)' };
}

function tableBody(headers, data) {
  const body = createElement('tbody');
  let isEven = false;
  for (const item of data.slice(0, 1000)) {
    const tr = createElement('tr');
    if (tr.style) {
      Object.assign(tr.style, { borderBottom: '1px solid rgba(148, 163, 184, 0.06)', background: isEven ? 'rgba(30, 41, 59, 0.15)' : 'transparent', transition: 'background-color 0.15s ease' });
      const currentEven = isEven;
      tr.addEventListener('mouseenter', () => { tr.style.backgroundColor = 'rgba(30, 41, 59, 0.4)'; });
      tr.addEventListener('mouseleave', () => { tr.style.backgroundColor = currentEven ? 'rgba(30, 41, 59, 0.15)' : 'transparent'; });
    }
    isEven = !isEven;
    for (const header of headers) {
      const value = text(item[fieldFor(header)]);
      const td = createElement('td');
      if (td.style) Object.assign(td.style, { padding: '10px 12px', verticalAlign: 'middle', color: '#cbd5e1' });
      if (['DTXR_POS Value', 'DTXR_PS Value', 'Derived Restraints', 'Path'].includes(header)) {
        const valDiv = createElement('div', value, 'xml-cii-table-scroll-cell');
        if (valDiv.style) Object.assign(valDiv.style, { maxHeight: '76px', overflowY: 'auto', whiteSpace: 'normal', wordBreak: 'break-word', fontSize: '11px', fontFamily: 'monospace', paddingRight: '6px', lineHeight: '1.4', color: value ? '#fbbf24' : '#64748b', minWidth: header === 'Path' ? '220px' : '150px' });
        td.appendChild(valDiv);
      } else if (header === 'Status') {
        const badge = createElement('span', value || 'UNRESOLVED', 'xml-cii-trace-status');
        if (badge.style) Object.assign(badge.style, { display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '600', ...statusStyle(value || 'UNRESOLVED') });
        td.appendChild(badge);
      } else if (['POS Basis', 'Distance (mm)', 'Tolerance (mm)'].includes(header)) {
        if (td.style) Object.assign(td.style, { fontSize: '11px', fontFamily: 'monospace', color: '#38bdf8', whiteSpace: 'nowrap' });
        td.textContent = value;
      } else if (['XML Node', 'JsonNodeNo(DTXR_PS)', 'JsonNodeNo(DTXR_POS)', 'Node', 'PS', 'POS'].includes(header)) {
        if (td.style) Object.assign(td.style, { fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' });
        td.textContent = value;
      } else {
        td.textContent = value;
      }
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  return body;
}

function fieldFor(header) {
  return {
    Path: 'path',
    Node: 'nodeKey',
    PS: 'psKey',
    POS: 'posKey',
    Hits: 'hitCount',
    Type: 'componentType',
    Rows: 'rows',
    'XML Node': 'xmlNode',
    'XML Branch': 'xmlBranch',
    'JsonNodeNo(DTXR_PS)': 'jsonNodeNoDtxrPs',
    'JsonNodeNo(DTXR_POS)': 'jsonNodeNoDtxrPos',
    'Match Type': 'matchType',
    'POS Basis': 'posBasis',
    'Distance (mm)': 'distanceMm',
    'Tolerance (mm)': 'toleranceMm',
    'DTXR_POS Value': 'dtxrPosValue',
    'DTXR_PS/NAME': 'dtxrPsName',
    'DTXR_PS Value': 'dtxrPsValue',
    'Effective Source': 'effectiveSource',
    'Derived Restraints': 'derivedRestraints',
    Status: 'status',
  }[header] || header;
}

function renderDelimiterControls(parent, state) {
  const cfg = state.resolverJsonTraceConfig || {};
  const on = cfg.useDelimiter === true;
  const delim = cfg.delimiter || '|';
  const mode = cfg.joinMode || 'unique';
  const bar = createElement('div');
  if (bar.style) Object.assign(bar.style, { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '10px', padding: '8px 12px', background: 'rgba(15,23,42,0.5)', borderRadius: '6px', border: '1px solid rgba(148,163,184,0.1)' });
  bar.appendChild(createElement('strong', 'DTXR Value Joining:'));

  const toggleLabel = createElement('label');
  if (toggleLabel.style) Object.assign(toggleLabel.style, { display: 'flex', alignItems: 'center', gap: '4px' });
  const toggleInput = createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.dataset.field = 'resolver-use-delimiter';
  toggleInput.checked = on;
  toggleLabel.append(toggleInput, createElement('span', ' Use delimiter joining'));
  bar.appendChild(toggleLabel);

  const delimLabel = createElement('label');
  if (delimLabel.style) Object.assign(delimLabel.style, { display: 'flex', alignItems: 'center', gap: '4px', opacity: on ? '1' : '0.4' });
  delimLabel.appendChild(createElement('span', 'Delimiter:'));
  const delimInput = createElement('input');
  delimInput.type = 'text';
  delimInput.dataset.field = 'resolver-delimiter';
  delimInput.value = delim;
  delimInput.maxLength = 8;
  delimInput.disabled = !on;
  if (delimInput.style) Object.assign(delimInput.style, { width: '42px', padding: '2px 6px', fontFamily: 'monospace', fontSize: '12px', background: '#1a2840', color: '#d7e6ff', border: '1px solid #2a3f5f', borderRadius: '4px' });
  delimLabel.appendChild(delimInput);
  bar.appendChild(delimLabel);

  const modeLabel = createElement('label');
  if (modeLabel.style) Object.assign(modeLabel.style, { display: 'flex', alignItems: 'center', gap: '4px', opacity: on ? '1' : '0.4' });
  modeLabel.appendChild(createElement('span', 'Join mode:'));
  const modeSelect = createElement('select');
  modeSelect.dataset.field = 'resolver-join-mode';
  modeSelect.disabled = !on;
  if (modeSelect.style) Object.assign(modeSelect.style, { padding: '2px 4px', fontSize: '12px', background: '#1a2840', color: '#d7e6ff', border: '1px solid #2a3f5f', borderRadius: '4px' });
  for (const [value, label] of [['unique', 'All unique values'], ['first', 'First value only'], ['all', 'All values (incl. duplicates)']]) {
    const option = createElement('option', label);
    option.value = value;
    option.selected = mode === value;
    modeSelect.appendChild(option);
  }
  modeLabel.appendChild(modeSelect);
  bar.appendChild(modeLabel);

  const note = createElement('span', on ? 'Unique values joined → written into DTXR_POS / DTXR_PS' : 'Ledger aggregation remains authoritative; this control only affects legacy display compatibility.', 'xml-cii-phase-help');
  if (note.style) note.style.fontSize = '11px';
  bar.appendChild(note);

  const tolLabel = createElement('label');
  if (tolLabel.style) Object.assign(tolLabel.style, { display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px', borderLeft: '1px solid rgba(148,163,184,0.15)', paddingLeft: '10px' });
  tolLabel.appendChild(createElement('span', '📏 Coord tolerance (mm):'));
  const tolInput = createElement('input');
  tolInput.type = 'number';
  tolInput.dataset.field = 'resolver-coordinate-tolerance';
  tolInput.min = '0';
  tolInput.max = '50';
  tolInput.step = '0.5';
  tolInput.value = String(cfg.coordinateTolerance ?? 6.0);
  tolInput.title = 'Maximum Euclidean distance for JSON-to-JSON grouping and XML-to-position-group matching. Default: 6 mm.';
  if (tolInput.style) Object.assign(tolInput.style, { width: '58px', padding: '2px 6px', fontFamily: 'monospace', fontSize: '12px', background: '#1a2840', color: '#d7e6ff', border: '1px solid #2a3f5f', borderRadius: '4px' });
  tolLabel.appendChild(tolInput);
  bar.appendChild(tolLabel);
  parent.appendChild(bar);
}

function renderResolverIndex(parent, state) {
  const result = state.resolverJsonTraceResult;
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(createElement('h3', 'Resolver Index'));
  const actions = createElement('div', '', 'xml-cii-resolver-actions');
  const buildBtn = actionButton('build-resolver-index', state.resolverJsonTraceRunning ? 'Building…' : 'Build / refresh resolver index');
  if (buildBtn.style && !state.resolverJsonTraceRunning && !state.resolverJsonTraceResult) {
    Object.assign(buildBtn.style, { background: '#7f1d1d', border: '1px solid #ef4444', color: '#fecaca', fontWeight: '700' });
    buildBtn.title = 'Resolver index has not been built yet — click to build.';
  }
  actions.append(buildBtn, actionButton('save-resolver-json-config', 'Save to config'), createElement('span', state.resolverJsonTraceWriteBackStatus || 'Resolver config not saved yet.', 'xml-cii-phase-help'));
  section.appendChild(actions);
  renderDelimiterControls(section, state);

  const metrics = createElement('div', '', 'xml-cii-resolver-metrics');
  metrics.append(metric('XML nodes', stat(result, 'xmlNodeCount')), metric('Node keys', stat(result, 'nodeKeyCount')), metric('PS keys', stat(result, 'psKeyCount')), metric('POS keys', stat(result, 'posKeyCount')));
  section.appendChild(metrics);

  const diagnostics = result?.diagnostics || [];
  if (diagnostics.length) {
    const diagSection = createElement('div', '', 'xml-cii-resolver-diagnostics-container');
    if (diagSection.style) Object.assign(diagSection.style, { marginTop: '16px', borderTop: '1px solid rgba(148, 163, 184, 0.08)', paddingTop: '16px' });
    diagSection.appendChild(createElement('h4', 'Resolver Diagnostics', 'xml-cii-section-subtitle'));
    const diagData = diagnostics.map((item) => ({ type: item.type, rows: item.rows !== undefined ? item.rows : (item.sourceKind !== undefined ? item.sourceKind : (item.xmlNodeCount !== undefined ? item.xmlNodeCount : '')) }));
    diagSection.appendChild(table(['Type', 'Rows'], diagData, 'No diagnostics available.'));
    section.appendChild(diagSection);
  }
  parent.appendChild(section);
}

function renderJsonConfig(parent, state) {
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(createElement('h3', 'JSON Config'));
  const config = appendLabeledControl(section, 'Alias/config JSON:', createElement('textarea'));
  config.value = JSON.stringify(state.resolverJsonTraceConfig || {}, null, 2);
  config.dataset.field = 'resolver-json-config';
  parent.appendChild(section);
}

function renderTraceTreeHtml(parent, state) {
  const result = state.resolverJsonTraceResult;
  const traceRows = result?.matchedFacts || [];
  const delimiter = state.regexTesterConfig?.tokenDelimiter || '-';
  const treeData = buildAdaptedJsonTraceTree(traceRows, delimiter);
  const evidenceRows = buildEvidenceTreeRows(result);
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(sectionTitleBar('Evidence Trace Tree (Collapsible)', [
    actionButton('download-evidence-tree-csv', `⬇ CSV (${evidenceRows.length})`, evidenceRows.length === 0),
  ]));
  if (!treeData.length) {
    section.appendChild(createElement('div', 'No JSON evidence matched to branch names. Build resolver index or upload staged JSON.', 'xml-cii-phase-help'));
    parent.appendChild(section);
    return;
  }
  const container = createElement('div', '', 'xml-cii-tree-container');
  if (container.style) Object.assign(container.style, { maxHeight: '400px', overflowY: 'auto', backgroundColor: '#0b1329', border: '1px solid rgba(148,163,184,0.12)', borderRadius: '8px', padding: '12px' });
  const renderPosition = (position) => `
    <details style="margin-left: 12px; margin-top: 4px;">
      <summary style="font-size: 0.78rem; color: #fbbf24; cursor: pointer;">📍 ${position.label} (${position.count} items)</summary>
      <div style="margin-left: 18px; font-size: 0.74rem; color: #94a3b8; font-family: monospace; border-left: 2px solid rgba(148,163,184,0.15); padding-left: 6px; margin-top: 2px; white-space: pre-wrap; word-break: break-all;">${position.concatenated}</div>
    </details>`;
  const renderBore = (bore) => `
    <details style="margin-left: 12px; margin-top: 4px;">
      <summary style="font-size: 0.84rem; color: #e2e8f0; font-weight: bold; cursor: pointer;">🪈 Bore: ${bore.bore} (${bore.count} items)</summary>
      ${bore.positions.map(renderPosition).join('')}
    </details>`;
  const renderBranch = (branch) => `
    <details style="margin-top: 6px; border-bottom: 1px solid rgba(148,163,184,0.06); padding-bottom: 6px;">
      <summary style="font-size: 0.88rem; color: #38bdf8; font-weight: bold; cursor: pointer;">🌿 Branch: ${branch.branchName} (${branch.count} rows)</summary>
      ${branch.bores.map(renderBore).join('')}
    </details>`;
  container.innerHTML = treeData.map(renderBranch).join('');
  section.appendChild(container);
  parent.appendChild(section);
}

function addFilter(section, tableEl, placeholder) {
  const filterInput = createElement('input');
  filterInput.type = 'text';
  filterInput.placeholder = placeholder;
  if (filterInput.style) Object.assign(filterInput.style, { width: '100%', padding: '8px 12px', marginBottom: '10px', borderRadius: '4px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(15, 23, 42, 0.3)', color: '#fff', fontSize: '0.88rem' });
  filterInput.addEventListener('input', () => {
    const query = filterInput.value.toLowerCase().trim();
    tableEl.querySelectorAll?.('tbody tr').forEach((tr) => { tr.style.display = !query || tr.textContent.toLowerCase().includes(query) ? '' : 'none'; });
  });
  section.append(filterInput, tableEl);
}

function renderXmlNodeWiseTraceTable(parent, state) {
  const result = state.resolverJsonTraceResult;
  const nodeWiseRows = buildXmlNodeWiseTraceRows(result);
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(sectionTitleBar('XML Node Wise Trace', [
    actionButton('download-node-wise-trace-csv', `⬇ CSV (${nodeWiseRows.length})`, nodeWiseRows.length === 0),
  ]));
  if (!nodeWiseRows.length) {
    section.appendChild(createElement('div', 'No XML trace rows. Load source XML and staged JSON, then rebuild the resolver index.', 'xml-cii-phase-help'));
    parent.appendChild(section);
    return;
  }
  section.appendChild(createElement('p', 'One authoritative row per XML node. DTXR_POS is primary; DTXR_PS is shown as the NAME-specific fallback evidence.', 'xml-cii-phase-help'));
  addFilter(section, table(XML_NODE_TRACE_HEADERS, nodeWiseRows, 'No trace rows matched.', 'xml-cii-node-wise-table'), '🔍 Filter node trace...');
  parent.appendChild(section);
}

function renderMatchedFacts(parent, state, result) {
  const matchedRows = buildMatchedFactsRows(result);
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(sectionTitleBar('Matched Facts', [
    actionButton('copy-matched-facts', '⧉ Copy', matchedRows.length === 0),
  ]));
  if (state.resolverJsonTraceExportStatus) section.appendChild(createElement('p', state.resolverJsonTraceExportStatus, 'xml-cii-phase-help'));
  section.appendChild(table(['Path', 'Node', 'PS', 'POS', 'Hits'], matchedRows, 'No matched JSON facts yet.'));
  parent.appendChild(section);
}

export function renderStandaloneResolverJsonTracePanel(card, state, stateRef, render) {
  if (state.sourceKind === 'inputxml') {
    card.appendChild(createElement('p', 'InputXML mode does not require XML resolver index or staged JSON trace workflow. This phase is optional and intentionally not applied.', 'xml-cii-phase-help'));
    return;
  }

  const subTabId = state.jsonTraceActiveSubTabId || 'index';
  let result = state.resolverJsonTraceResult;
  if (!result && state.sourceText && state.stagedJsonText) {
    result = runStandaloneResolverJsonTrace({ sourceText: state.sourceText, stagedJsonText: state.stagedJsonText, jsonConfig: state.resolverJsonTraceConfig, supportConfigJson: state.supportConfigJson });
    if (stateRef?.current) {
      stateRef.current.resolverJsonTraceResult = result;
      stateRef.current.resolverJsonTraceJsonResult = result;
    }
  }

  const container = createElement('div', '', 'xml-cii-sub-tabs-layout');
  const rail = createElement('nav', '', 'xml-cii-sub-nav-rail');
  rail.setAttribute('aria-label', 'Resolver sub-tabs');
  const subTabs = [
    { id: 'index', label: '⚙️ Config & Index' },
    { id: 'tableImport', label: 'CSV/XLS Trace' },
    { id: 'tree', label: '🌿 Evidence Tree' },
    { id: 'nodeTrace', label: '📋 XML Node Wise Trace' },
    { id: 'matched', label: '✅ Matched Facts' },
    { id: 'rejected', label: '❌ Rejected Facts' },
  ];
  const subTabHasData = {
    tableImport: rows(state.jsonTraceTableRows).length > 0 || !!state.resolverJsonTraceTableResult,
    tree: buildEvidenceTreeRows(result).length > 0,
    nodeTrace: buildXmlNodeWiseTraceRows(result).length > 0,
    matched: buildMatchedFactsRows(result).length > 0,
    rejected: rows(result?.rejectedFacts).length > 0,
  };
  for (const sub of subTabs) {
    const button = createElement('button', sub.label, 'xml-cii-sub-phase-pill');
    button.type = 'button';
    button.dataset.jsonTraceSubTab = sub.id;
    button.classList.toggle('is-active', subTabId === sub.id);
    if (subTabHasData[sub.id] && button.style) {
      Object.assign(button.style, { color: '#8be28b', border: '1px solid #2f855a' });
      button.title = 'Data is available in this sub-tab.';
    }
    rail.appendChild(button);
  }
  container.appendChild(rail);

  const workspace = createElement('div', '', 'xml-cii-sub-workspace');
  if (subTabId === 'index') {
    renderResolverIndex(workspace, state);
    renderJsonConfig(workspace, state);
  } else if (subTabId === 'tableImport') {
    renderStandaloneTraceTableImportPanel(workspace, state);
  } else if (subTabId === 'tree') {
    renderTraceTreeHtml(workspace, state);
  } else if (subTabId === 'nodeTrace') {
    renderXmlNodeWiseTraceTable(workspace, state);
  } else if (subTabId === 'matched') {
    renderMatchedFacts(workspace, state, result);
  } else if (subTabId === 'rejected') {
    workspace.appendChild(table(['Path', 'Node', 'PS', 'POS', 'Hits'], buildMatchedFactsRows({ matchedFacts: result?.rejectedFacts || [] }), 'No rejected JSON facts.'));
  }
  container.appendChild(workspace);
  card.appendChild(container);
}
