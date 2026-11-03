const STORAGE_KEY = 'xmlCii2019.matchedPreview.lastDiagnostics.v1';
const PREVIEW_EVENT = 'xml-cii-matched-preview:diagnostics';
const JSON_CONFIG_KEY = 'xmlCii2019.sideload.jsonConfig.v1';
// Static compatibility anchor: XML->CII(2019) workflow

const MODEL_SUBTABS = Object.freeze([
  ['json', 'Json'],
  ['manual-restraints', 'Manual Restraints'],
  ['sideload-json-config', 'Sideload JSON Config'],
  ['resolved-data', 'Resolved Data'],
  ['output-run', 'Output / Run Conversion'],
  ['matched-audit', 'Matched Audit'],
]);

export const OLD_XML_CII_WORKFLOW_PHASES = Object.freeze([
  { id: 'regex', label: '1 Regex', summary: 'Derive line key, piping class, and size from XML Branchname tokens or regex.', state: 'Current' },
  { id: 'import-masters', label: '2 Import Masters', summary: 'Load line list, piping class, material map, and valve weight sources.', state: 'Current' },
  { id: 'preview', label: '4 Preview', summary: 'Dry-run enrichment preview per branch — inspect and override approximate matches.', state: 'Current' },
  { id: 'diagnostics', label: '5 Diagnostics', summary: 'Run Dry Run to inspect enrichment data before committing to the full run.', state: 'Current' },
  { id: 'weight-match', label: '5A Weight Match', summary: 'Review approximate component weights matched by bore, rating, and length, then Finalize and Run.', state: 'Current' },
  { id: 'support-mapper', label: '7 Support Types', summary: 'Map ATT/RVM fields to CII support kinds for enrichment and 3D symbol rendering.', state: 'Current' },
  { id: 'config', label: '8 Config', summary: 'Edit all enrichment configuration fields and export/import the JSON config.', state: 'Current' },
  { id: 'run', label: '6 Run', summary: 'Run the conversion — generates enriched XML and final CII output.', state: 'Current' },
]);


const OLD_MASTER_DEFS = Object.freeze([
  ['Line List', 'Line key, class, rating, material, process, bore, pressure, temperature, density and phase.'],
  ['Piping Class', 'Class + bore to component type, rating, schedule, wall, corrosion and end condition.'],
  ['Material Map', 'Material code/name/spec mappings.'],
  ['Weights / Valve CA8', 'Bore + rating + length to valve/flange/component weight.'],
]);

const SUPPORT_TYPE_ROWS = Object.freeze([
  ['REST', 'Shoe / pipe rest / wear pad / base plate', '+Y restraint'],
  ['GUIDE', 'Guide / PG / lateral guide text', 'Lateral guide restraint'],
  ['LINESTOP', 'Line stop / directional anchor / LS text', 'Axial stop restraint'],
  ['ANCHOR', 'Anchor / fixed support keyword', 'Anchor/fixed restraint'],
]);

function text(value) {
  return value == null ? '' : String(value);
}

function esc(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clean(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function safeJson(raw, fallback) {
  try {
    const value = JSON.parse(raw || '');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readStored() {
  try {
    return safeJson(window.localStorage.getItem(STORAGE_KEY), null);
  } catch {
    return null;
  }
}

function writeStored(payload) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload || {}, null, 2));
  } catch {}
}

function readLocalJson(key, fallback = {}) {
  try {
    return safeJson(window.localStorage.getItem(key), fallback) || fallback;
  } catch {
    return fallback;
  }
}

function fileName(root, selector) {
  return root?.querySelector?.(selector)?.files?.[0]?.name || 'No file selected';
}

function optionValue(root, key) {
  return root?.querySelector?.(`[data-option-key="${key}"]`)?.value || '';
}

function optionElement(root, key) {
  return root?.querySelector?.(`[data-option-key="${key}"]`) || null;
}

function parseSupportConfig(root) {
  return safeJson(optionValue(root, 'supportConfigJson') || '{}', {}) || {};
}

function saveSupportConfig(root, config) {
  const element = optionElement(root, 'supportConfigJson');
  if (!element) return false;

  element.value = JSON.stringify(config || {}, null, 2);
  try {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } catch {}
  return true;
}

function statsCards(items) {
  return `<div class="model-converters-workflow-preview-grid">${items
    .map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
    .join('')}</div>`;
}

function section(title, body) {
  return `<div class="model-converters-workflow-master-card"><div class="model-converters-workflow-section-title">${esc(title)}</div>${body}</div>`;
}

function normalizePreviewPayload(payload, source = 'stored') {
  if (!payload || typeof payload !== 'object') {
    return { matchedFacts: [], rejectedFacts: [], diagnostics: [], source: 'none' };
  }

  return {
    ...payload,
    matchedFacts: asArray(payload.matchedFacts).filter((fact) => fact?.status === 'MATCHED'),
    rejectedFacts: asArray(payload.rejectedFacts),
    diagnostics: asArray(payload.diagnostics),
    source: payload.source || source,
  };
}

function factText(fact) {
  return typeof fact?.value === 'object' ? JSON.stringify(fact.value) : text(fact?.value);
}

function factSearchText(fact) {
  return [
    fact?.source,
    fact?.itemType,
    fact?.basis,
    fact?.key,
    fact?.resolvedNodeNumber,
    factText(fact),
  ].map(text).join(' ').toLowerCase();
}

function table(headers, rows, empty = 'No rows.') {
  if (!rows.length) return `<div class="model-converters-muted">${esc(empty)}</div>`;

  return `<div class="mc-preview-wrap"><table class="mc-preview-node-table" style="min-width:100%;font-size:12px;"><thead><tr>${headers
    .map((header) => `<th>${esc(header)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function factRows(facts, empty = 'No rows loaded.') {
  const rows = asArray(facts).slice(0, 250).map((fact) => [
    esc(fact.source || ''),
    esc(fact.itemType || ''),
    esc(fact.basis || ''),
    esc(fact.key || ''),
    esc(fact.resolvedNodeNumber || ''),
    esc(factText(fact)),
    esc(fact.status || ''),
  ]);

  return table(['Source', 'Item', 'Basis', 'Key', 'Node', 'Value', 'Status'], rows, empty);
}

function outputSnapshot(root) {
  const outputText = clean(root?.querySelector?.('#model-converters-output')?.textContent || '');
  const statusText = clean(root?.querySelector?.('#model-converters-status')?.textContent || '');
  return { outputText, statusText, payload: normalizePreviewPayload(readStored()) };
}

function currentJsonConfig(root) {
  const support = parseSupportConfig(root);
  return support.sideloadJsonConfig || readLocalJson(JSON_CONFIG_KEY, {}) || {};
}

function button(label, attrs = '', primary = false) {
  return `<button type="button" class="${primary ? 'model-converters-run-btn' : 'model-converters-download-btn'}" ${attrs}>${esc(label)}</button>`;
}

function buttons(html) {
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">${html}</div>`;
}

function textarea(label, value, attrs = '') {
  return `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9cc5ff;"><span>${esc(label)}</span><textarea ${attrs} style="min-height:64px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:11px;">${esc(value)}</textarea></label>`;
}

function oldPhase(id) {
  return OLD_XML_CII_WORKFLOW_PHASES.find((phase) => phase.id === id) || OLD_XML_CII_WORKFLOW_PHASES[0];
}

function openPhaseButton(id, label = 'Open existing phase') {
  return button(label, `data-direct-process-phase="${esc(id)}"`);
}

export function oldPhaseDetailHtml(phaseId, dataRoot) {
  const payload = normalizePreviewPayload(readStored());
  const support = parseSupportConfig(dataRoot);
  const phase = oldPhase(phaseId);

  if (phaseId === 'regex') {
    return section(
      'Regex Tester / Branch / Line Key',
      table(['Extracted item', 'Value'], [
        ['Branchname', esc(optionValue(dataRoot, 'branchNameSample') || '<BranchName from loaded XML>')],
        ['Key 1', esc(support.regex?.key1 || 'from existing regex phase')],
        ['Key 2', esc(support.regex?.key2 || 'from existing regex phase')],
        ['Final Line No. Key', 'Key 1 + Key 2'],
        ['Piping Class', 'from branch/process resolver'],
        ['Rating', 'from branch/process resolver'],
        ['Bore', 'from branch/process resolver'],
      ]) + buttons(openPhaseButton('regex') + button('Test Regex', 'data-direct-process-phase="regex"')),
    ) + section('Old phase summary', `<div class="model-converters-workflow-detail-text">${esc(phase.summary)}</div>`);
  }

  if (phaseId === 'import-masters') {
    return section('Masters', table(['Master', 'What it audits'], OLD_MASTER_DEFS.map((row) => row.map(esc)))) +
      section('Actions', buttons(openPhaseButton('import-masters')));
  }

  if (phaseId === 'preview') {
    return section('Enrichment Preview', factRows(payload.matchedFacts, 'No preview facts stored yet.')) +
      section('Actions', buttons(openPhaseButton('preview')));
  }

  if (phaseId === 'diagnostics') {
    return section('Diagnostics Log', factRows(payload.rejectedFacts, 'No rejected diagnostics stored yet.')) +
      section(
        'Diagnostics state',
        statsCards([
          ['Rejected rows', payload.rejectedFacts.length],
          ['Diagnostics rows', payload.diagnostics.length],
          ['Source', payload.source || 'none'],
        ]) + buttons(openPhaseButton('diagnostics')),
      );
  }

  if (phaseId === 'weight-match') {
    return section('Weight Match', table(['Audit', 'Purpose', 'Action'], [
      ['Rigid / valve weight review', 'Approximate weight enrichment audit', openPhaseButton('weight-match')],
      ['Bore + rating + length scoring', 'Candidate weight matching', openPhaseButton('weight-match')],
      ['Finalize and Run', 'Apply reviewed approximate weights before final conversion', openPhaseButton('weight-match')],
    ]));
  }

  if (phaseId === 'support-mapper') {
    return section('Support Type Mapper', table(['Kind', 'Detection basis', 'CII output'], SUPPORT_TYPE_ROWS.map((row) => row.map(esc)))) +
      section('Actions', buttons(openPhaseButton('support-mapper')));
  }

  if (phaseId === 'config') {
    return section(
      'Config JSON',
      textarea('Existing XML→CII enrichment configuration JSON', JSON.stringify(support || {}, null, 2), 'readonly data-old-workflow-config-json') +
        buttons(openPhaseButton('config')),
    ) + section(
      'Old config popup tabs',
      table(['Old popup tab', 'Purpose'], [
        ['Header', 'Header/source/user/project fields'],
        ['Config', 'Full XML→CII enrichment JSON'],
        ['JSON', 'Source/staged JSON support data'],
        ['Regex Tester', 'Branchname regex and line-key testing'],
        ['Masters', 'Line List / Piping Class / Material / Weights masters'],
        ['Diagnostics Log', 'Dry-run logs and rejected rows'],
        ['Support Type Mapper', 'Support kind rules and mapper output'],
      ].map((row) => row.map(esc))),
    );
  }

  if (phaseId === 'run') {
    const { outputText, statusText } = outputSnapshot(dataRoot);
    return section('Run', table(['Check', 'State'], [
      ['XML loaded', fileName(dataRoot, '#model-converters-primary-input') !== 'No file selected' ? 'Ready' : 'Pending'],
      ['Existing output', outputText ? 'Available' : 'No output yet'],
      ['Status', esc(statusText || 'Idle')],
    ])) + section('Actions', buttons(button('Run Existing Conversion', 'data-direct-run-conversion', true) + openPhaseButton('run')));
  }

  return section(phase.label, `<div>${esc(phase.summary)}</div>${buttons(openPhaseButton(phase.id))}`);
}

function bindProcessFallback(target, dataRoot, callbacks) {
  const body = target.querySelector('[data-old-xml-cii-phase-body]');

  const setActive = (id) => {
    target.querySelectorAll('[data-old-xml-cii-phase]').forEach((phaseButton) => {
      const active = phaseButton.getAttribute('data-old-xml-cii-phase') === id;
      phaseButton.setAttribute('aria-selected', active ? 'true' : 'false');
      phaseButton.style.outline = active ? '2px solid #5aa7ff' : '';
      phaseButton.style.background = active ? '#1f3652' : '';
    });

    if (body) body.innerHTML = oldPhaseDetailHtml(id, dataRoot);

    target.querySelectorAll('[data-direct-process-phase]').forEach((phaseButton) => {
      phaseButton.addEventListener('click', () => callbacks.openPhase?.(phaseButton.getAttribute('data-direct-process-phase') || id));
    });
    target.querySelectorAll('[data-direct-run-conversion]').forEach((runButton) => {
      runButton.addEventListener('click', () => callbacks.run?.());
    });
  };

  target.querySelectorAll('[data-old-xml-cii-phase]').forEach((phaseButton) => {
    phaseButton.addEventListener('click', () => setActive(phaseButton.getAttribute('data-old-xml-cii-phase') || OLD_XML_CII_WORKFLOW_PHASES[0].id));
  });

  setActive(OLD_XML_CII_WORKFLOW_PHASES[0].id);
}

function renderLegacyWorkflowShell(target, dataRoot) {
  const payload = normalizePreviewPayload(readStored());

  target.innerHTML = `
    <div class="model-converters-workflow-detail-title">Process / Piping Class / Wt. Enrichment</div>
    <div class="model-converters-workflow-detail-text">
      Opening the exact old XML→CII workflow popup from <code>feature/basic-glb-viewer-label-ui-navigation-fix</code>. If the legacy popup cannot be opened, this panel keeps a static fallback of the same old phase names.
    </div>
    ${section(
      'Old XML→CII workflow popup',
      `<div class="model-converters-workflow-detail-text">Exact target UI: <strong>XML-&gt;CII(2019) workflow</strong> with Regex Tester, Masters, Diagnostics Log, Support Type Mapper, Line List, Piping Class, Material Map, and Weights / Valve CA8.</div>` +
      statsCards([
        ['Primary XML', fileName(dataRoot, '#model-converters-primary-input')],
        ['Support config', Object.keys(parseSupportConfig(dataRoot) || {}).length ? 'Loaded' : 'Default / not loaded'],
        ['Matched rows', payload.matchedFacts.length],
        ['Rejected rows', payload.rejectedFacts.length],
      ]) +
      buttons(button('Open exact old XML→CII workflow popup', 'data-open-exact-old-xml-cii-workflow', true)),
    )}
    <div class="model-converters-workflow-master-card" data-old-xml-cii-workflow-shell>
      <div class="model-converters-workflow-section-title">Old XML→CII workflow phases</div>
      <div class="model-converters-workflow-phase-list" role="tablist" aria-label="Old XML CII workflow phases" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        ${OLD_XML_CII_WORKFLOW_PHASES.map((phase, index) => `
          <button type="button" class="model-converters-workflow-phase" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}" data-old-xml-cii-phase="${esc(phase.id)}">
            <span>${esc(phase.label)}</span>
            <small>${esc(phase.state)}</small>
          </button>
        `).join('')}
      </div>
      <div id="xml-cii-old-workflow-popup-detail" class="model-converters-workflow-detail" data-old-xml-cii-phase-body></div>
    </div>
  `;
}

function renderXmlCiiWorkflowProcessEnrichmentFallback(target, dataRoot = document, callbacks = {}) {
  renderLegacyWorkflowShell(target, dataRoot);
  bindProcessFallback(target, dataRoot, callbacks);
}

function scheduleExactOldWorkflow(target, dataRoot, callbacks) {
  if (typeof callbacks?.openLegacyWorkflow !== 'function') return false;
  if (target.dataset.xmlCiiExactOldWorkflowRequested === 'true') return true;

  target.dataset.xmlCiiExactOldWorkflowRequested = 'true';

  setTimeout(() => {
    const opened = callbacks.openLegacyWorkflow('regex');
    if (!opened) {
      target.dataset.xmlCiiExactOldWorkflowRequested = 'fallback';
      renderXmlCiiWorkflowProcessEnrichmentFallback(target, dataRoot, callbacks);
    }
  }, 0);

  return true;
}

function renderJsonSubtab(target, dataRoot) {
  target.innerHTML = `
    <div class="model-converters-workflow-detail-title">Json</div>
    ${section('Staged JSON Support Data (optional) (.json,.JSON)', `
      <input type="file" data-direct-staged-json-file accept=".json,.JSON,application/json">
      <small data-direct-staged-json-name class="model-converters-muted">${esc(fileName(dataRoot, '#model-converters-secondary-input'))}</small>
    `)}
  `;

  const input = target.querySelector('[data-direct-staged-json-file]');
  const name = target.querySelector('[data-direct-staged-json-name]');
  input?.addEventListener('change', () => {
    name.textContent = input.files?.[0]?.name || 'No file chosen';
  });
}

function renderManualSubtab(target, dataRoot) {
  const support = parseSupportConfig(dataRoot);
  const sideText = support.sideload?.restraintsText || '';

  target.innerHTML = `
    <div class="model-converters-workflow-detail-title">Manual Restraints</div>
    ${section('Node|PSNo.|POS|Restraint', `
      <textarea data-direct-manual-restraints spellcheck="false" placeholder="Node|PSNo.|POS|Restraint" style="width:100%;min-height:180px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:12px;">${esc(sideText)}</textarea>
      ${buttons(button('Save to Run Options', 'data-direct-save-manual-restraints', true) + button('Clear', 'data-direct-clear-manual-restraints'))}
    `)}
    <div data-direct-manual-summary>${statsCards([['Manual matched', 0], ['Manual rejected', 0], ['Duplicates skipped', 0]])}</div>
  `;

  target.querySelector('[data-direct-save-manual-restraints]')?.addEventListener('click', () => {
    const config = parseSupportConfig(dataRoot);
    config.sideload = config.sideload || {};
    config.sideload.restraintsText = target.querySelector('[data-direct-manual-restraints]')?.value || '';
    saveSupportConfig(dataRoot, config);
    target.querySelector('[data-direct-manual-summary]').innerHTML = statsCards([
      ['Manual rows saved', config.sideload.restraintsText.split(/\r?\n/).filter((line) => clean(line)).length],
      ['State', 'Saved'],
      ['Run impact', 'Existing runner'],
    ]);
  });

  target.querySelector('[data-direct-clear-manual-restraints]')?.addEventListener('click', () => {
    const area = target.querySelector('[data-direct-manual-restraints]');
    if (area) area.value = '';
  });
}

function renderConfigSubtab(target, dataRoot) {
  const config = currentJsonConfig(dataRoot);
  target.innerHTML = `
    <div class="model-converters-workflow-detail-title">Sideload JSON Config</div>
    ${section('JSON Config', `
      <div class="model-converters-workflow-regex-grid">
        ${textarea('PS aliases', asArray(config.basisResolvers?.PS?.fieldAliases).join(', '), 'readonly')}
        ${textarea('POS object aliases', asArray(config.basisResolvers?.POS?.objectFieldAliases).join(', '), 'readonly')}
        ${textarea('Restraint aliases', asArray(config.itemExtractors?.RESTRAINT?.sourceFieldAliases).join(', '), 'readonly')}
      </div>
    `)}
  `;
}

function renderResolvedSubtab(target) {
  const payload = normalizePreviewPayload(readStored());
  target.innerHTML = `
    <div class="model-converters-workflow-detail-title">Resolved Data</div>
    ${section('JSON Resolved Data', factRows(payload.matchedFacts, 'No matched resolved data loaded.'))}
    ${section('PS → Node', table(
      ['PS key', 'Resolved Node', 'Status', 'Source'],
      payload.matchedFacts
        .filter((fact) => fact.basis === 'PS')
        .map((fact) => [esc(fact.key || ''), esc(fact.resolvedNodeNumber || ''), esc(fact.status || ''), esc(fact.source || '')]),
      'No PS-resolved rows loaded.',
    ))}
    ${section('POS → Node', table(
      ['POS key', 'Resolved Node', 'Status', 'Source'],
      payload.matchedFacts
        .filter((fact) => fact.basis === 'POS')
        .map((fact) => [esc(fact.key || ''), esc(fact.resolvedNodeNumber || ''), esc(fact.status || ''), esc(fact.source || '')]),
      'No POS-resolved rows loaded.',
    ))}
  `;
}

export function renderXmlCiiWorkflowOutputRunPanel(target, dataRoot = document, callbacks = {}) {
  if (!target) return;

  const { outputText, statusText, payload } = outputSnapshot(dataRoot);
  target.innerHTML = `
    <div class="model-converters-workflow-detail-title">Output / Run Conversion</div>
    <div class="model-converters-workflow-detail-text">Final conversion handoff. The popup uses the existing XML→CII runner and displays the output/checklist state directly here.</div>
    ${section('Pre-run checklist', table(['Check', 'State'], [
      ['XML loaded', fileName(dataRoot, '#model-converters-primary-input') !== 'No file selected' ? 'Ready' : 'Pending'],
      ['Manual side-load saved', parseSupportConfig(dataRoot).sideload?.restraintsText ? 'Saved' : 'Optional / none'],
      ['Latest diagnostics stored', payload.source !== 'none' ? 'Available' : 'Pending'],
      ['Matched rows available', payload.matchedFacts.length ? String(payload.matchedFacts.length) : '0'],
      ['Output panel status', outputText ? 'Available' : 'No output yet'],
    ].map((row) => row.map(esc))))}
    ${section('Run / refresh actions', buttons(
      button('Run Conversion', 'data-direct-run-conversion', true) +
      button('Refresh Output State', 'data-direct-refresh-output') +
      button('Show Main Output Panel', 'data-direct-show-output'),
    ))}
    ${section('Latest output snapshot', statsCards([
      ['Status', statusText || 'Idle'],
      ['Output', outputText ? 'Output available' : 'No output generated yet'],
      ['Diagnostics source', payload.source || 'none'],
      ['Matched rows', payload.matchedFacts.length],
    ]))}
  `;

  target.querySelector('[data-direct-run-conversion]')?.addEventListener('click', () => callbacks.run?.());
  target.querySelector('[data-direct-refresh-output]')?.addEventListener('click', () => renderXmlCiiWorkflowOutputRunPanel(target, dataRoot, callbacks));
  target.querySelector('[data-direct-show-output]')?.addEventListener('click', () => callbacks.showOutput?.());
}

export function renderXmlCiiWorkflowMatchedAuditPanel(target) {
  if (!target) return;

  target.innerHTML = `
    <div class="model-converters-workflow-detail-title">Matched Audit</div>
    <div class="model-converters-workflow-detail-text">Direct popup content: matched-only table. Rejected, invalid, duplicate, and unresolved rows are counted but hidden from Matched Preview.</div>
    <div class="model-converters-workflow-master-card">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input data-direct-diagnostics-file type="file" accept=".json,application/json">
        <input data-direct-preview-filter type="search" placeholder="Filter source/item/node/key/value" style="min-width:260px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;">
        <button type="button" class="model-converters-run-btn" data-direct-load-diagnostics>Load Diagnostics</button>
        <button type="button" class="model-converters-download-btn" data-direct-refresh-latest>Refresh Latest Run</button>
        <button type="button" class="model-converters-download-btn" data-direct-clear-preview>Clear</button>
      </div>
      <div data-direct-preview-status style="font-size:12px;color:#9aa8ba;margin-top:8px;"></div>
    </div>
    <div data-direct-preview-summary class="model-converters-workflow-master-card"></div>
    <div data-direct-preview-table class="model-converters-workflow-master-card"></div>
  `;

  const render = (payload) => {
    const normalized = normalizePreviewPayload(payload, payload?.source || 'stored');
    const filter = clean(target.querySelector('[data-direct-preview-filter]')?.value || '').toLowerCase();
    const matched = filter
      ? normalized.matchedFacts.filter((fact) => factSearchText(fact).includes(filter))
      : normalized.matchedFacts;

    target.querySelector('[data-direct-preview-summary]').innerHTML = statsCards([
      ['Matched rows', matched.length],
      ['Rejected hidden', normalized.rejectedFacts.length],
      ['Diagnostics rows', normalized.diagnostics.length],
      ['Source', normalized.source || 'none'],
    ]);
    target.querySelector('[data-direct-preview-table]').innerHTML = factRows(matched, 'No matched rows loaded. Run XML→CII or import diagnostics JSON.');
    target.querySelector('[data-direct-preview-status]').textContent = `${matched.length} matched rows loaded.`;
  };

  const renderLatest = () => render(readStored());

  target.querySelector('[data-direct-refresh-latest]')?.addEventListener('click', renderLatest);
  target.querySelector('[data-direct-preview-filter]')?.addEventListener('input', renderLatest);
  target.querySelector('[data-direct-clear-preview]')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    render(null);
  });

  target.querySelector('[data-direct-load-diagnostics]')?.addEventListener('click', async () => {
    const status = target.querySelector('[data-direct-preview-status]');
    try {
      const file = target.querySelector('[data-direct-diagnostics-file]')?.files?.[0];
      if (!file) throw new Error('Select diagnostics JSON first.');
      const payload = normalizePreviewPayload(safeJson(await file.text(), null), 'diagnostics-json');
      writeStored(payload);
      render(payload);
    } catch (error) {
      status.textContent = clean(error?.message || error);
      status.style.color = '#ff8888';
    }
  });

  if (target.__xmlCiiWorkflowPreviewListener) {
    window.removeEventListener(PREVIEW_EVENT, target.__xmlCiiWorkflowPreviewListener);
  }

  target.__xmlCiiWorkflowPreviewListener = (event) => {
    const payload = normalizePreviewPayload(event?.detail, 'latest-run');
    writeStored(payload);
    render(payload);
  };
  window.addEventListener(PREVIEW_EVENT, target.__xmlCiiWorkflowPreviewListener);

  renderLatest();
}

export function renderXmlCiiWorkflowModelDataPanel(target, dataRoot = document, callbacks = {}) {
  if (!target) return;

  target.innerHTML = `
    <div class="model-converters-workflow-detail-title">XML - Model Data</div>
    <div class="model-converters-workflow-detail-text">Model data, staged JSON support data, manual Node/PS/POS restraints, resolved data, final handoff, and matched audit.</div>
    <div class="model-converters-workflow-master-card" data-model-subtab-shell>
      <div role="tablist" aria-label="XML model data subtabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        ${MODEL_SUBTABS.map(([id, label], index) => `
          <button type="button" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}" class="model-converters-download-btn" data-model-subtab="${esc(id)}">${esc(label)}</button>
        `).join('')}
      </div>
      <div data-model-subtab-body></div>
    </div>
  `;

  const body = target.querySelector('[data-model-subtab-body]');
  const setActive = (id) => {
    target.querySelectorAll('[data-model-subtab]').forEach((tabButton) => {
      const active = tabButton.getAttribute('data-model-subtab') === id;
      tabButton.setAttribute('aria-selected', active ? 'true' : 'false');
      tabButton.style.outline = active ? '2px solid #5aa7ff' : '';
      tabButton.style.background = active ? '#1f3652' : '';
    });

    if (!body) return;

    if (id === 'manual-restraints') renderManualSubtab(body, dataRoot);
    else if (id === 'sideload-json-config') renderConfigSubtab(body, dataRoot);
    else if (id === 'resolved-data') renderResolvedSubtab(body);
    else if (id === 'output-run') renderXmlCiiWorkflowOutputRunPanel(body, dataRoot, callbacks);
    else if (id === 'matched-audit') renderXmlCiiWorkflowMatchedAuditPanel(body);
    else renderJsonSubtab(body, dataRoot);
  };

  target.querySelectorAll('[data-model-subtab]').forEach((tabButton) => {
    tabButton.addEventListener('click', () => setActive(tabButton.getAttribute('data-model-subtab') || MODEL_SUBTABS[0][0]));
  });

  setActive(MODEL_SUBTABS[0][0]);
}

export function renderXmlCiiWorkflowProcessEnrichmentPanel(target, dataRoot = document, callbacks = {}) {
  if (!target) return;

  renderLegacyWorkflowShell(target, dataRoot);

  target.querySelector('[data-open-exact-old-xml-cii-workflow]')?.addEventListener('click', () => {
    const opened = callbacks.openLegacyWorkflow?.('regex');
    if (!opened) renderXmlCiiWorkflowProcessEnrichmentFallback(target, dataRoot, callbacks);
  });

  if (callbacks.autoOpenLegacyWorkflow === true && scheduleExactOldWorkflow(target, dataRoot, callbacks)) return;

  renderXmlCiiWorkflowProcessEnrichmentFallback(target, dataRoot, callbacks);
}
