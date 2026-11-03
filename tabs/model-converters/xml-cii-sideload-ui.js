import {
  DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG,
  normalizeXmlCiiSideloadJsonConfig,
} from '../../converters/xml-cii2019-core/sideload-json-config.js';
import {
  buildXmlCiiNodeResolverIndex,
  resolveXmlCiiPsToNode,
  resolveXmlCiiPositionToNode,
} from '../../converters/xml-cii2019-core/sideload-resolver.js';
import { resolveConfiguredJsonFacts } from '../../converters/xml-cii2019-core/sideload-ledger.js';
import { resolveManualRestraintRows } from '../../converters/xml-cii2019-core/sideload-restraints.js';

const FLAG = '__xmlCiiSideloadUi_v1';
const CONFIG_KEY = 'xmlCii2019.sideload.jsonConfig.v1';
const TEXT_KEY = 'xmlCii2019.sideload.restraints.text';
const POLICY_KEY = 'xmlCii2019.sideload.restraints.policy';
const POS_TOL_KEY = 'xmlCii2019.sideload.posToleranceMm';
const ACTIVE_TAB_KEY = 'xmlCii2019.sideload.activeSubtab';

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function text(value) {
  return value == null ? '' : String(value);
}

function clean(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function esc(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readStored(key, fallback = '') {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeStored(key, value) {
  try { window.localStorage.setItem(key, value); } catch {}
}

function parseJsonBranches(rawText) {
  const raw = clean(rawText).replace(/^export\s+default\s+/i, '').replace(/^window\.[A-Za-z0-9_$]+\s*=\s*/i, '').replace(/;\s*$/g, '');
  const parsed = JSON.parse(raw || '[]');
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.branches)) return parsed.branches;
  if (Array.isArray(parsed?.items)) return parsed.items;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return [];
}

function parseSupportConfig(input) {
  const fallback = {};
  const cfg = safeJsonParse(input?.value || '{}', fallback);
  return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : fallback;
}

function writeSupportConfig(input, cfg) {
  if (!input) return;
  input.value = JSON.stringify(cfg || {}, null, 2);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function readJsonConfigFromSupport(supportInput) {
  const cfg = parseSupportConfig(supportInput);
  const stored = safeJsonParse(readStored(CONFIG_KEY, ''), null);
  return normalizeXmlCiiSideloadJsonConfig(cfg.sideloadJsonConfig || stored || DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG);
}

function saveJsonConfigToSupport(supportInput, jsonConfig) {
  const normalized = normalizeXmlCiiSideloadJsonConfig(jsonConfig);
  const cfg = parseSupportConfig(supportInput);
  cfg.sideloadJsonConfig = normalized;
  writeSupportConfig(supportInput, cfg);
  writeStored(CONFIG_KEY, JSON.stringify(normalized, null, 2));
  return normalized;
}

function saveSideloadOptionsToSupport(supportInput, opts) {
  const cfg = parseSupportConfig(supportInput);
  cfg.sideload = {
    ...(cfg.sideload || {}),
    restraintsText: text(opts.restraintsText),
    policy: opts.policy || 'ADD_IF_MISSING',
    posToleranceMm: Number(opts.posToleranceMm || 5),
    posExactToleranceMm: Number(opts.posExactToleranceMm || 1),
  };
  writeSupportConfig(supportInput, cfg);
  writeStored(TEXT_KEY, cfg.sideload.restraintsText || '');
  writeStored(POLICY_KEY, cfg.sideload.policy || 'ADD_IF_MISSING');
  writeStored(POS_TOL_KEY, String(cfg.sideload.posToleranceMm || 5));
}

async function readFileInputText(container, selector, fallbackValue = '') {
  const input = container.querySelector(selector);
  const file = input?.files?.[0];
  if (file) return await file.text();
  return fallbackValue || '';
}

function configuredTextField(container, optionKey) {
  return container.querySelector(`[data-option-key="${optionKey}"]`);
}

function sourceSummary(facts) {
  const countBy = new Map();
  for (const fact of facts || []) {
    const key = fact.itemType || '(none)';
    countBy.set(key, (countBy.get(key) || 0) + 1);
  }
  return Array.from(countBy.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function renderFactRows(facts, maxRows = 120) {
  const rows = (facts || []).slice(0, maxRows);
  if (!rows.length) return '<div class="model-converters-muted">No rows yet. Run Test Config / Resolve first.</div>';
  return `
    <table class="mc-preview-node-table" style="min-width:100%;font-size:11px;">
      <thead><tr><th>Source</th><th>Item</th><th>Basis</th><th>Key</th><th>Node</th><th>Value</th><th>Status</th></tr></thead>
      <tbody>${rows.map((fact) => `
        <tr>
          <td>${esc(fact.source || '')}</td>
          <td>${esc(fact.itemType || '')}</td>
          <td>${esc(fact.basis || '')}</td>
          <td title="${esc(fact.key || '')}">${esc(fact.key || '')}</td>
          <td>${esc(fact.resolvedNodeNumber || '')}</td>
          <td>${esc(typeof fact.value === 'object' ? JSON.stringify(fact.value) : fact.value)}</td>
          <td>${esc(fact.status || '')}</td>
        </tr>`).join('')}</tbody>
    </table>
    ${(facts || []).length > maxRows ? `<div style="color:#9aa8ba;font-size:11px;margin-top:6px;">Showing first ${maxRows} of ${facts.length} rows.</div>` : ''}`;
}

function renderConfigAliasList(title, aliases) {
  return `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9cc5ff;">
    <span>${esc(title)}</span>
    <textarea data-json-config-aliases="${esc(title)}" spellcheck="false" style="min-height:54px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:11px;">${esc((aliases || []).join(', '))}</textarea>
  </label>`;
}

function writeAliasList(textarea, target, key) {
  if (!textarea || !target) return;
  target[key] = textarea.value.split(/[,\n]/).map((x) => clean(x)).filter(Boolean);
}

function panelHtml() {
  return `
  <details id="model-converters-xml-cii-sideload" class="model-converters-workflow" open>
    <summary>XML→CII Sideload</summary>
    <div class="model-converters-workflow-detail-text" style="margin:8px 0 10px;">
      Load and audit Node/PS/POS side-load data before matched preview. Manual rows append to resolved enrichment data; rejected rows stay in Diagnostics.
    </div>
    <div class="model-converters-workflow-phase-list" data-sideload-tabs>
      ${[
        ['resolver', '1 Resolver Index'],
        ['json-config', '2 JSON Config'],
        ['json-data', '3 JSON Resolved Data'],
        ['ps', '4 PS → Node'],
        ['pos', '5 POS → Node'],
        ['restraints', '6 Restraints'],
        ['diagnostics', '7 Diagnostics'],
      ].map(([id, label]) => `<button type="button" class="model-converters-workflow-phase" data-sideload-tab="${id}"><span>${label}</span><small>Side-load</small></button>`).join('')}
    </div>
    <div id="model-converters-xml-cii-sideload-detail" class="model-converters-workflow-detail"></div>
  </details>`;
}

export function installXmlCiiSideloadUi(container = document) {
  if (!browserReady() || window[FLAG]) return;
  window[FLAG] = true;

  const root = container || document;
  const state = {
    activeTab: readStored(ACTIVE_TAB_KEY, 'resolver'),
    resolverIndex: null,
    matchedFacts: [],
    rejectedFacts: [],
    manualMatched: [],
    manualRejected: [],
    jsonMatched: [],
    jsonRejected: [],
    status: '',
  };

  const ensurePanel = () => {
    const supportInput = root.querySelector('[data-option-key="supportConfigJson"]');
    const workflow = root.querySelector('#model-converters-xml-cii-workflow');
    if (!supportInput || !workflow || root.querySelector('#model-converters-xml-cii-sideload')) return;
    workflow.insertAdjacentHTML('afterend', panelHtml());
    bindPanel(root, state);
    renderActiveTab(root, state);
  };

  ensurePanel();
  const observer = new MutationObserver(() => ensurePanel());
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
}

function bindPanel(root, state) {
  root.querySelectorAll('[data-sideload-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.getAttribute('data-sideload-tab') || 'resolver';
      writeStored(ACTIVE_TAB_KEY, state.activeTab);
      renderActiveTab(root, state);
    });
  });
}

function supportInput(root) {
  return root.querySelector('[data-option-key="supportConfigJson"]');
}

function stagedJsonFallback(root) {
  return configuredTextField(root, 'stagedAttributesJson')?.value || '';
}

async function buildResolver(root, state) {
  const xmlText = await readFileInputText(root, '#model-converters-primary-input', '');
  if (!xmlText.trim()) throw new Error('Load an XML primary input first.');
  state.resolverIndex = buildXmlCiiNodeResolverIndex(xmlText, {
    exactToleranceMm: Number(readStored(POS_TOL_KEY, '5')) || 1,
  });
  return state.resolverIndex;
}

function renderActiveTab(root, state) {
  const detail = root.querySelector('#model-converters-xml-cii-sideload-detail');
  if (!detail) return;
  root.querySelectorAll('[data-sideload-tab]').forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-sideload-tab') === state.activeTab));
  if (state.activeTab === 'json-config') renderJsonConfig(root, state, detail);
  else if (state.activeTab === 'json-data') renderJsonData(root, state, detail);
  else if (state.activeTab === 'ps') renderPsResolver(root, state, detail);
  else if (state.activeTab === 'pos') renderPosResolver(root, state, detail);
  else if (state.activeTab === 'restraints') renderRestraints(root, state, detail);
  else if (state.activeTab === 'diagnostics') renderDiagnostics(root, state, detail);
  else renderResolverIndex(root, state, detail);
}

function renderResolverIndex(root, state, detail) {
  const stats = state.resolverIndex?.stats || {};
  detail.innerHTML = `
    <div class="model-converters-workflow-detail-title">Resolver Index</div>
    <div class="model-converters-workflow-detail-text">Builds Node, PS No., and POS indexes from the loaded XML. Restraints and JSON records use this resolver before entering matched preview.</div>
    <div class="model-converters-workflow-master-card">
      <div class="model-converters-workflow-preview-grid">
        <div><span>Nodes</span><strong>${esc(stats.nodeCount || 0)}</strong></div>
        <div><span>Node keys</span><strong>${esc(stats.nodeNumberKeys || 0)}</strong></div>
        <div><span>PS keys</span><strong>${esc(stats.psKeys || 0)}</strong></div>
        <div><span>POS keys</span><strong>${esc(stats.positionKeys || 0)}</strong></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button type="button" class="model-converters-run-btn" id="mc-sideload-build-index">Build Index</button>
        <span id="mc-sideload-resolver-status" style="font-size:12px;color:#9aa8ba;align-self:center;">${esc(state.status || '')}</span>
      </div>
    </div>`;
  detail.querySelector('#mc-sideload-build-index')?.addEventListener('click', async () => {
    try {
      await buildResolver(root, state);
      state.status = `Index built: ${state.resolverIndex.stats.nodeCount} XML nodes.`;
    } catch (error) {
      state.status = `Index failed: ${clean(error?.message || error)}`;
    }
    renderResolverIndex(root, state, detail);
  });
}

function renderJsonConfig(root, state, detail) {
  const input = supportInput(root);
  const jsonConfig = readJsonConfigFromSupport(input);
  detail.innerHTML = `
    <div class="model-converters-workflow-detail-title">JSON Config</div>
    <div class="model-converters-workflow-detail-text">Configures which staged JSON fields are read for PS/POS basis and side-load items. It does not write enriched XML directly.</div>
    <div class="model-converters-workflow-master-card">
      <div class="model-converters-workflow-section-title">Resolver aliases</div>
      <div class="model-converters-workflow-regex-grid">
        ${renderConfigAliasList('PS aliases', jsonConfig.basisResolvers.PS.fieldAliases)}
        ${renderConfigAliasList('POS object aliases', jsonConfig.basisResolvers.POS.objectFieldAliases)}
        ${renderConfigAliasList('POS text aliases', jsonConfig.basisResolvers.POS.textFieldAliases)}
        ${renderConfigAliasList('Restraint aliases', jsonConfig.itemExtractors.RESTRAINT.sourceFieldAliases)}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button type="button" class="model-converters-run-btn" id="mc-sideload-json-save">Save Config</button>
        <button type="button" class="model-converters-download-btn" id="mc-sideload-json-reset">Reset Default</button>
        <button type="button" class="model-converters-download-btn" id="mc-sideload-json-test">Test Config on Current JSON</button>
        <span id="mc-sideload-json-status" style="font-size:12px;color:#9aa8ba;align-self:center;"></span>
      </div>
    </div>
    <div id="mc-sideload-json-test-output" class="model-converters-workflow-master-card" style="display:none;"></div>`;

  const saveCurrent = () => {
    const next = normalizeXmlCiiSideloadJsonConfig(jsonConfig);
    const areas = detail.querySelectorAll('[data-json-config-aliases]');
    writeAliasList(areas[0], next.basisResolvers.PS, 'fieldAliases');
    writeAliasList(areas[1], next.basisResolvers.POS, 'objectFieldAliases');
    writeAliasList(areas[2], next.basisResolvers.POS, 'textFieldAliases');
    writeAliasList(areas[3], next.itemExtractors.RESTRAINT, 'sourceFieldAliases');
    saveJsonConfigToSupport(input, next);
    return next;
  };

  detail.querySelector('#mc-sideload-json-save')?.addEventListener('click', () => {
    saveCurrent();
    const st = detail.querySelector('#mc-sideload-json-status');
    if (st) { st.textContent = 'Saved to XML→CII config.'; st.style.color = '#5df0a0'; }
  });
  detail.querySelector('#mc-sideload-json-reset')?.addEventListener('click', () => {
    saveJsonConfigToSupport(input, DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG);
    renderJsonConfig(root, state, detail);
  });
  detail.querySelector('#mc-sideload-json-test')?.addEventListener('click', async () => {
    const out = detail.querySelector('#mc-sideload-json-test-output');
    try {
      const next = saveCurrent();
      const index = state.resolverIndex || await buildResolver(root, state);
      const rawJson = await readFileInputText(root, '#model-converters-secondary-input', stagedJsonFallback(root));
      const branches = parseJsonBranches(rawJson);
      const result = resolveConfiguredJsonFacts(branches, index, next, {
        exactToleranceMm: next.basisResolvers.POS.exactToleranceMm,
        nearestToleranceMm: next.basisResolvers.POS.nearestToleranceMm,
      });
      state.jsonMatched = result.matchedFacts;
      state.jsonRejected = result.rejectedFacts;
      state.matchedFacts = [...state.jsonMatched, ...state.manualMatched];
      state.rejectedFacts = [...state.jsonRejected, ...state.manualRejected];
      const summary = sourceSummary(state.jsonMatched);
      out.style.display = 'block';
      out.innerHTML = `
        <div class="model-converters-workflow-section-title">Config test result</div>
        <div class="model-converters-workflow-preview-grid">
          <div><span>Branches</span><strong>${esc(branches.length)}</strong></div>
          <div><span>Matched</span><strong>${esc(state.jsonMatched.length)}</strong></div>
          <div><span>Rejected</span><strong>${esc(state.jsonRejected.length)}</strong></div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:#d7e6ff;">${summary.map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`).join(' · ') || 'No matched rows'}</div>`;
    } catch (error) {
      out.style.display = 'block';
      out.innerHTML = `<div style="color:#ff8888;">Config test failed: ${esc(error?.message || error)}</div>`;
    }
  });
}

function renderJsonData(root, state, detail) {
  detail.innerHTML = `
    <div class="model-converters-workflow-detail-title">JSON Resolved Data</div>
    <div class="model-converters-workflow-detail-text">Shows matched JSON-derived facts produced by JSON Config testing. Rejected rows remain in Diagnostics.</div>
    <div class="model-converters-workflow-master-card">${renderFactRows(state.jsonMatched)}</div>`;
}

function renderPsResolver(root, state, detail) {
  detail.innerHTML = `
    <div class="model-converters-workflow-detail-title">PS → Node</div>
    <div class="model-converters-workflow-detail-text">Resolve PS/support tags against XML NodeName and ComponentRefNo indexes.</div>
    <div class="model-converters-workflow-master-card">
      <textarea id="mc-sideload-ps-input" spellcheck="false" placeholder="PS-12244\n/PS-12248.5" style="width:100%;min-height:80px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:12px;"></textarea>
      <button type="button" class="model-converters-run-btn" id="mc-sideload-ps-resolve" style="margin-top:8px;">Resolve PS</button>
      <div id="mc-sideload-ps-output" style="margin-top:10px;"></div>
    </div>`;
  detail.querySelector('#mc-sideload-ps-resolve')?.addEventListener('click', async () => {
    const output = detail.querySelector('#mc-sideload-ps-output');
    try {
      const index = state.resolverIndex || await buildResolver(root, state);
      const rows = detail.querySelector('#mc-sideload-ps-input').value.split(/\r?\n/).map(clean).filter(Boolean)
        .map((key) => ({ source: 'PS_TEST', itemType: 'RESOLVE', basis: 'PS', key, value: '', ...resolveXmlCiiPsToNode(index, key) }));
      output.innerHTML = renderFactRows(rows);
    } catch (error) { output.innerHTML = `<div style="color:#ff8888;">${esc(error?.message || error)}</div>`; }
  });
}

function renderPosResolver(root, state, detail) {
  detail.innerHTML = `
    <div class="model-converters-workflow-detail-title">POS → Node</div>
    <div class="model-converters-workflow-detail-text">Resolve raw XYZ or E/S/U coordinates against XML Position with exact/nearest tolerance.</div>
    <div class="model-converters-workflow-master-card">
      <textarea id="mc-sideload-pos-input" spellcheck="false" placeholder="430800.766 -1141125 1184.15\nE 430800.766mm S 1141125mm U 1184.15mm" style="width:100%;min-height:80px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:12px;"></textarea>
      <button type="button" class="model-converters-run-btn" id="mc-sideload-pos-resolve" style="margin-top:8px;">Resolve POS</button>
      <div id="mc-sideload-pos-output" style="margin-top:10px;"></div>
    </div>`;
  detail.querySelector('#mc-sideload-pos-resolve')?.addEventListener('click', async () => {
    const output = detail.querySelector('#mc-sideload-pos-output');
    try {
      const cfg = readJsonConfigFromSupport(supportInput(root));
      const index = state.resolverIndex || await buildResolver(root, state);
      const rows = detail.querySelector('#mc-sideload-pos-input').value.split(/\r?\n/).map(clean).filter(Boolean)
        .map((key) => ({ source: 'POS_TEST', itemType: 'RESOLVE', basis: 'POS', key, value: '', ...resolveXmlCiiPositionToNode(index, key, { exactToleranceMm: cfg.basisResolvers.POS.exactToleranceMm, nearestToleranceMm: cfg.basisResolvers.POS.nearestToleranceMm }) }));
      output.innerHTML = renderFactRows(rows);
    } catch (error) { output.innerHTML = `<div style="color:#ff8888;">${esc(error?.message || error)}</div>`; }
  });
}

function renderRestraints(root, state, detail) {
  const cfg = parseSupportConfig(supportInput(root));
  const storedText = cfg.sideload?.restraintsText ?? readStored(TEXT_KEY, '');
  const policy = cfg.sideload?.policy || readStored(POLICY_KEY, 'ADD_IF_MISSING');
  const posTol = cfg.sideload?.posToleranceMm || readStored(POS_TOL_KEY, '5');
  detail.innerHTML = `
    <div class="model-converters-workflow-detail-title">Restraints</div>
    <div class="model-converters-workflow-detail-text">Load Node vs Restraint, PS No. vs Restraint, or Coordinate vs Restraint rows. Use “Save to Run Options” before final conversion.</div>
    <div class="model-converters-workflow-master-card">
      <div class="model-converters-workflow-regex-grid">
        <label class="model-converters-workflow-map-field"><span>Policy</span><select id="mc-sideload-policy"><option value="ADD_IF_MISSING" ${policy === 'ADD_IF_MISSING' ? 'selected' : ''}>Add if missing</option><option value="ADD_ALWAYS" ${policy === 'ADD_ALWAYS' ? 'selected' : ''}>Add always</option></select></label>
        <label class="model-converters-workflow-map-field"><span>POS nearest tolerance mm</span><input id="mc-sideload-pos-tol" type="number" min="0" step="0.1" value="${esc(posTol)}"></label>
      </div>
      <textarea id="mc-sideload-restraints-text" spellcheck="false" placeholder="Node|PSNo.|POS|Restraint\n70|||Guide\n|PS-12248.5||Line Stop\n||430800.766 -1141125 1184.15|Line Stop" style="width:100%;min-height:130px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:12px;margin-top:8px;">${esc(storedText)}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button type="button" class="model-converters-run-btn" id="mc-sideload-restraints-resolve">Resolve</button>
        <button type="button" class="model-converters-run-btn" id="mc-sideload-restraints-save">Save to Run Options</button>
        <button type="button" class="model-converters-download-btn" id="mc-sideload-restraints-clear">Clear</button>
      </div>
      <div id="mc-sideload-restraints-output" style="margin-top:10px;"></div>
    </div>`;

  const readOpts = () => ({
    restraintsText: detail.querySelector('#mc-sideload-restraints-text')?.value || '',
    policy: detail.querySelector('#mc-sideload-policy')?.value || 'ADD_IF_MISSING',
    posToleranceMm: Number(detail.querySelector('#mc-sideload-pos-tol')?.value || 5),
    posExactToleranceMm: 1,
  });

  const resolveNow = async () => {
    const output = detail.querySelector('#mc-sideload-restraints-output');
    try {
      const opts = readOpts();
      const index = state.resolverIndex || await buildResolver(root, state);
      const result = resolveManualRestraintRows(opts.restraintsText, index, { nearestToleranceMm: opts.posToleranceMm, exactToleranceMm: opts.posExactToleranceMm });
      state.manualMatched = result.matchedFacts;
      state.manualRejected = result.rejectedFacts;
      state.matchedFacts = [...state.jsonMatched, ...state.manualMatched];
      state.rejectedFacts = [...state.jsonRejected, ...state.manualRejected];
      output.innerHTML = `<div style="color:#9aa8ba;font-size:12px;margin-bottom:6px;">Rows ${result.rows.length}; matched ${result.matchedFacts.length}; rejected ${result.rejectedFacts.length}.</div>${renderFactRows(result.matchedFacts)}`;
      return result;
    } catch (error) {
      output.innerHTML = `<div style="color:#ff8888;">${esc(error?.message || error)}</div>`;
      return null;
    }
  };

  detail.querySelector('#mc-sideload-restraints-resolve')?.addEventListener('click', resolveNow);
  detail.querySelector('#mc-sideload-restraints-save')?.addEventListener('click', async () => {
    const result = await resolveNow();
    saveSideloadOptionsToSupport(supportInput(root), readOpts());
    const output = detail.querySelector('#mc-sideload-restraints-output');
    if (output) output.insertAdjacentHTML('afterbegin', `<div style="color:#5df0a0;font-size:12px;margin-bottom:6px;">Saved. Final conversion will use this side-load text. ${result ? `Matched ${result.matchedFacts.length}; rejected ${result.rejectedFacts.length}.` : ''}</div>`);
  });
  detail.querySelector('#mc-sideload-restraints-clear')?.addEventListener('click', () => {
    detail.querySelector('#mc-sideload-restraints-text').value = '';
    saveSideloadOptionsToSupport(supportInput(root), { restraintsText: '', policy, posToleranceMm: posTol, posExactToleranceMm: 1 });
  });
}

function renderDiagnostics(root, state, detail) {
  detail.innerHTML = `
    <div class="model-converters-workflow-detail-title">Diagnostics</div>
    <div class="model-converters-workflow-detail-text">Rejected, ambiguous, duplicate, or invalid side-load rows. These are intentionally hidden from Matched Preview.</div>
    <div class="model-converters-workflow-master-card">${renderFactRows(state.rejectedFacts)}</div>`;
}
