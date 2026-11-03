/**
 * CSV/XLS trace import panel for the XML->CII standalone JSON Trace phase.
 * Inputs: current workflow state. Outputs: DOM controls for file import,
 * paste preview, explicit field mapping, and JSON-vs-table benchmark status.
 * Fallback: shows mapping controls only after rows exist.
 */
import { createElement } from './xml-cii-adapted-dom.js';
import { TRACE_TABLE_FIELDS, headersFromTraceRows } from '../xml-cii-table-trace-source.js';
import {
  activeProfileFor,
  getTraceTableProfiles,
  normalizeTraceTableConfig,
  TRACE_AMBIGUITY_POLICIES,
} from '../xml-cii-table-trace-config.js';

function text(value, fallback) {
  const out = String(value ?? '').trim();
  return out || String(fallback ?? '');
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function previewValues(rawRows, header) {
  const values = [];
  for (const row of rawRows) {
    if (values.length >= 3) break;
    const value = text(row?.[header]);
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function optionLabel(rawRows, header) {
  const preview = previewValues(rawRows, header);
  return preview.length ? `${header} | ${preview.join(' | ')}` : header;
}

function renderSourceControls(parent, state) {
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(createElement('h3', 'CSV / XLS Trace Source'));

  const fileLabel = createElement('label', 'Import CSV/XLS/XLSX:');
  const file = createElement('input');
  file.type = 'file';
  file.accept = '.csv,.tsv,.txt,.xlsx,.xlsm,.xlsb,.xls,.ods';
  file.dataset.jsonTraceTableFile = 'true';
  fileLabel.appendChild(file);
  section.appendChild(fileLabel);

  const sheetNames = rows(state.jsonTraceTableSheetNames);
  if (sheetNames.length > 1) {
    const sheetLabel = createElement('label', 'Worksheet:');
    const select = createElement('select');
    select.dataset.jsonTraceTableSheet = 'true';
    for (const name of sheetNames) {
      const option = createElement('option', name);
      option.value = name;
      if (name === state.jsonTraceTableActiveSheet) option.selected = true;
      select.appendChild(option);
    }
    sheetLabel.appendChild(select);
    section.appendChild(sheetLabel);
  }

  const areaLabel = createElement('label', 'Preview / paste table text:');
  const area = createElement('textarea');
  area.dataset.field = 'json-trace-table-text';
  area.value = state.jsonTraceTableText || '';
  area.placeholder = 'Reference of the element,RTEXT of detailing text,Name of the element,PIPE';
  if (area.style) Object.assign(area.style, { minHeight: '180px', fontFamily: 'monospace' });
  areaLabel.appendChild(area);
  section.appendChild(areaLabel);

  const actions = createElement('div', '', 'xml-cii-resolver-actions');
  actions.append(actionButton('json-trace-table-auto-map', 'Auto-map columns'));
  actions.append(actionButton('build-json-trace-table', 'Build table trace'));
  actions.append(actionButton('compare-json-trace-table', 'Compare JSON vs table'));
  actions.append(createElement('span', state.jsonTraceTableStatus || 'No table trace built yet.', 'xml-cii-phase-help'));
  section.appendChild(actions);
  parent.appendChild(section);
}

function renderAdvancedConfig(parent, state) {
  const rawRows = rows(state.jsonTraceTableRows);
  const headers = headersFromTraceRows(rawRows);
  const config = normalizeTraceTableConfig(state.jsonTraceTableConfig);
  const activeProfile = activeProfileFor(headers, config);
  const resultConfig = state.resolverJsonTraceTableResult?.traceConfig;
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(createElement('h3', 'Trace Import Config'));

  const grid = createElement('div', '', 'xml-cii-mapping-grid');
  const profileLabel = createElement('label', 'Format profile:');
  const profileSelect = createElement('select');
  profileSelect.dataset.jsonTraceTableProfile = 'true';
  for (const profile of getTraceTableProfiles()) {
    const option = createElement('option', profile.label);
    option.value = profile.id;
    if (profile.id === config.profileId) option.selected = true;
    profileSelect.appendChild(option);
  }
  profileLabel.appendChild(profileSelect);
  grid.appendChild(profileLabel);

  const ambiguityLabel = createElement('label', 'Duplicate match policy:');
  const ambiguitySelect = createElement('select');
  ambiguitySelect.dataset.jsonTraceTableAmbiguity = 'true';
  for (const policy of TRACE_AMBIGUITY_POLICIES) {
    const option = createElement('option', policy.label);
    option.value = policy.id;
    if (policy.id === config.ambiguityPolicy) option.selected = true;
    ambiguitySelect.appendChild(option);
  }
  ambiguityLabel.appendChild(ambiguitySelect);
  grid.appendChild(ambiguityLabel);

  const toleranceLabel = createElement('label', 'Coordinate tolerance (mm):');
  const tolerance = createElement('input');
  tolerance.type = 'number';
  tolerance.min = '0';
  tolerance.step = '0.1';
  tolerance.value = String(config.coordinateTolerance);
  tolerance.dataset.jsonTraceTableTolerance = 'true';
  tolerance.title = 'Groups table rows within this 3D distance and matches the XML Position to the nearest branch-compatible group.';
  toleranceLabel.appendChild(tolerance);
  grid.appendChild(toleranceLabel);
  section.appendChild(grid);
  section.appendChild(createElement('div', 'Coordinate grouping is primary when Position is mapped. Branch /B suffixes are matched by canonical line root, so /LINE/B3 is compatible with /LINE but not with an unrelated line.', 'xml-cii-phase-help'));

  const ruleGrid = createElement('div', '', 'xml-cii-mapping-grid');
  for (const rule of config.matchRules) {
    const label = createElement('label');
    const checkbox = createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled !== false;
    checkbox.dataset.jsonTraceTableRule = rule.id;
    label.appendChild(checkbox);
    label.appendChild(createElement('span', ` ${rule.label}`));
    ruleGrid.appendChild(label);
  }
  section.appendChild(ruleGrid);

  const duplicateText = resultConfig
    ? `Last build: ${resultConfig.coordinateGroupCount || 0} coordinate groups from ${resultConfig.coordinateRowCount || 0} positioned rows; duplicate ref ${resultConfig.duplicateRefCount}, name ${resultConfig.duplicateNameCount}.`
    : 'Coordinate-group and duplicate counts appear after Build table trace.';
  section.appendChild(createElement('div', `Active profile: ${activeProfile.label} (${activeProfile.confidence}%). ${duplicateText}`, 'xml-cii-phase-help'));
  parent.appendChild(section);
}

function actionButton(action, label) {
  const button = createElement('button', label);
  button.type = 'button';
  button.dataset.action = action;
  return button;
}

function renderMapping(parent, state) {
  const rawRows = rows(state.jsonTraceTableRows);
  const headers = headersFromTraceRows(rawRows);
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(createElement('h3', 'Trace Column Mapping'));
  if (!headers.length) {
    section.appendChild(createElement('div', 'Import a file or paste table text to configure mapping.', 'xml-cii-phase-help'));
    parent.appendChild(section);
    return;
  }

  const grid = createElement('div', '', 'xml-cii-mapping-grid');
  const fieldMap = state.jsonTraceTableFieldMap || {};
  for (const field of TRACE_TABLE_FIELDS) {
    const label = createElement('label');
    const title = createElement('span', `${field.label}${field.required ? ' *' : ''}`);
    label.appendChild(title);
    const select = createElement('select');
    select.dataset.jsonTraceTableMap = field.name;
    const empty = createElement('option', field.required ? '-- required --' : '-- optional --');
    empty.value = '';
    select.appendChild(empty);
    for (const header of headers) {
      const option = createElement('option', optionLabel(rawRows, header));
      option.value = header;
      if (fieldMap[field.name] === header) option.selected = true;
      select.appendChild(option);
    }
    label.appendChild(select);
    grid.appendChild(label);
  }
  section.appendChild(grid);
  parent.appendChild(section);
}

function renderRowsPreview(parent, state) {
  const result = state.resolverJsonTraceTableResult;
  const rawRows = rows(state.jsonTraceTableRows);
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(createElement('h3', 'Table Preview'));
  if (!rawRows.length) {
    section.appendChild(createElement('div', 'No table rows parsed yet.', 'xml-cii-phase-help'));
    parent.appendChild(section);
    return;
  }
  const summary = result
    ? `Rows ${rawRows.length}; coordinate groups ${result.traceConfig.coordinateGroupCount || 0}; matched XML nodes ${rows(result.matchedFacts).length}; rejected XML nodes ${rows(result.rejectedFacts).length}.`
    : `Rows ${rawRows.length}; build table trace to derive coordinate groups and XML node matches.`;
  section.appendChild(createElement('div', summary, 'xml-cii-phase-help'));
  parent.appendChild(section);
}

function renderBenchmark(parent, state) {
  const bench = state.jsonTraceTableBenchmark;
  const section = createElement('section', '', 'xml-cii-resolver-panel');
  section.appendChild(createElement('h3', 'JSON vs Table Benchmark'));
  if (!bench) {
    section.appendChild(createElement('div', 'Build both the JSON resolver index and table trace, then compare.', 'xml-cii-phase-help'));
    parent.appendChild(section);
    return;
  }
  const pct = Number(bench.percent || 0).toFixed(2);
  const message = `${bench.matched}/${bench.compared} matched (${pct}%). Mismatches: ${bench.mismatched}.`;
  const badge = createElement('div', message, 'xml-cii-phase-help');
  if (badge.style) badge.style.color = bench.mismatched ? '#f87171' : '#8be28b';
  section.appendChild(badge);

  const mismatches = rows(bench.rows).filter((row) => !row.matched).slice(0, 20);
  if (mismatches.length) {
    const pre = createElement('pre', JSON.stringify(mismatches, null, 2));
    section.appendChild(pre);
  }
  parent.appendChild(section);
}

export function renderStandaloneTraceTableImportPanel(parent, state) {
  renderSourceControls(parent, state);
  renderAdvancedConfig(parent, state);
  renderMapping(parent, state);
  renderRowsPreview(parent, state);
  renderBenchmark(parent, state);
}
