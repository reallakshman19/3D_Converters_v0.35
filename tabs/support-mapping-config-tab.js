import {
  getSupportMappingConfig,
  getSupportMappingConfigMeta,
  loadSupportMappingConfig,
  replaceSupportMappingConfig,
  resetSupportMappingConfig,
  subscribeSupportMappingConfig,
} from '../interchange/support/support-mapping-store.js';
import { validateSupportMappingConfig } from '../interchange/support/support-mapping-config.js';
import { notify } from '../diagnostics/notification-center.js';
import { renderIcon } from '../interchange/view/interchange-icons.js';

function ensureStylesheet() {
  if (document.querySelector('link[data-support-mapping-config-style="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './tabs/support-mapping-config-tab.css';
  link.dataset.supportMappingConfigStyle = 'true';
  document.head.appendChild(link);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function downloadJson(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readJsonFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  return parsed;
}

function getBlock(config, format) {
  return config?.formats?.[format] || {
    topoMappingProfile: {},
    mappingProfile: {},
    rules: [],
    anchorPolicy: 'nearest-node',
    tolerances: {},
    diagnostics: {},
  };
}

function buildHtml(config, meta, format, validation, dirty) {
  const block = getBlock(config, format);
  return `
    <div class="support-map-root">
      <aside class="support-map-left">
        <div class="support-map-card">
          <div class="support-map-title">Support Mapping Settings</div>
          <div class="support-map-subtitle">Dedicated config for support inference and anchoring in Model Exchange Topo pipeline.</div>
        </div>
        <div class="support-map-card">
          <div>Source: <strong>${esc(meta?.source || 'default')}</strong></div>
          <div>Version: <strong>${esc(meta?.version || '')}</strong></div>
          <div>Format Scope: <strong>${esc(format)}</strong></div>
          <div>Dirty: <strong>${dirty ? 'Yes' : 'No'}</strong></div>
        </div>
        <div class="support-map-card">
          <div class="support-map-section-label">Validation</div>
          <div class="${validation.ok ? 'ok' : 'bad'}">${validation.ok ? 'Ready' : 'Has errors'}</div>
          <pre class="support-map-pre">${esc(JSON.stringify(validation, null, 2))}</pre>
        </div>
      </aside>
      <section class="support-map-main">
        <div class="support-map-toolbar">
          <button data-action="apply" class="support-map-btn"><span>${renderIcon('config')}</span><span>Apply</span></button>
          <button data-action="reset" class="support-map-btn"><span>${renderIcon('validate')}</span><span>Reset</span></button>
          <button data-action="export" class="support-map-btn"><span>${renderIcon('export')}</span><span>Export JSON</span></button>
          <label class="support-map-btn"><span>${renderIcon('import')}</span><span>Import JSON</span><input data-action="import" class="support-map-hidden" type="file" accept=".json" /></label>
          <label class="support-map-label format">
            <span>Format</span>
            <select data-action="format">
              <option value="REV" ${format === 'REV' ? 'selected' : ''}>REV</option>
              <option value="JSON" ${format === 'JSON' ? 'selected' : ''}>JSON</option>
              <option value="XML" ${format === 'XML' ? 'selected' : ''}>XML</option>
            </select>
          </label>
        </div>

        <div class="support-map-grid">
          <div class="support-map-card">
            <div class="support-map-section-label">Anchor + Tolerances</div>
            <label class="support-map-label"><span>Anchor Policy</span><input data-field="anchorPolicy" value="${esc(block.anchorPolicy || 'nearest-node')}" /></label>
            <label class="support-map-label"><span>Anchor Tolerance (mm)</span><input type="number" step="0.01" data-field="tolerances.anchorMm" value="${esc(block.tolerances?.anchorMm ?? 0.5)}" /></label>
            <label class="support-map-label"><span>Node Merge Tolerance (mm)</span><input type="number" step="0.01" data-field="tolerances.nodeMergeMm" value="${esc(block.tolerances?.nodeMergeMm ?? 0.5)}" /></label>
          </div>

          <div class="support-map-card">
            <div class="support-map-section-label">Diagnostics Flags</div>
            <label class="support-map-check"><input type="checkbox" data-field="diagnostics.warnOnTemplateMiss" ${block.diagnostics?.warnOnTemplateMiss ? 'checked' : ''}><span>warnOnTemplateMiss</span></label>
            <label class="support-map-check"><input type="checkbox" data-field="diagnostics.warnOnFallback" ${block.diagnostics?.warnOnFallback ? 'checked' : ''}><span>warnOnFallback</span></label>
            <label class="support-map-check"><input type="checkbox" data-field="diagnostics.warnOnAnchorMiss" ${block.diagnostics?.warnOnAnchorMiss ? 'checked' : ''}><span>warnOnAnchorMiss</span></label>
          </div>

          <div class="support-map-card full">
            <div class="support-map-section-label">Topo Mapping Profile (REV/JSON/XML Path+Template)</div>
            <textarea data-field="topoMappingProfile" rows="10">${esc(JSON.stringify(block.topoMappingProfile || {}, null, 2))}</textarea>
          </div>

          <div class="support-map-card full">
            <div class="support-map-section-label">Support Mapping Profile (Path+Template)</div>
            <textarea data-field="mappingProfile" rows="8">${esc(JSON.stringify(block.mappingProfile || {}, null, 2))}</textarea>
          </div>

          <div class="support-map-card full">
            <div class="support-map-section-label">Rules (Priority + Match + Output)</div>
            <textarea data-field="rules" rows="12">${esc(JSON.stringify(block.rules || [], null, 2))}</textarea>
          </div>
        </div>
      </section>
    </div>
  `;
}

function setByPath(target, path, value) {
  const parts = String(path || '').split('.');
  let cursor = target;
  while (parts.length > 1) {
    const key = parts.shift();
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[0]] = value;
}

function parseTextAreaJson(value, fallback) {
  try {
    return JSON.parse(String(value || '').trim() || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function readDraft(container, baseline, format) {
  const draft = cloneJson(baseline);
  const block = getBlock(draft, format);

  for (const input of container.querySelectorAll('[data-field]')) {
    const field = input.dataset.field;
    if (!field) continue;

    if (field === 'topoMappingProfile') {
      block.topoMappingProfile = parseTextAreaJson(input.value, block.topoMappingProfile || {});
      continue;
    }
    if (field === 'mappingProfile') {
      block.mappingProfile = parseTextAreaJson(input.value, block.mappingProfile || {});
      continue;
    }
    if (field === 'rules') {
      block.rules = parseTextAreaJson(input.value, block.rules || []);
      continue;
    }

    let value;
    if (input.type === 'checkbox') value = !!input.checked;
    else if (input.type === 'number') value = Number(input.value);
    else value = input.value;

    setByPath(block, field, value);
  }

  draft.formats[format] = block;
  return draft;
}

export function renderSupportMappingConfigTab(container) {
  ensureStylesheet();

  let format = 'REV';
  let baseline = getSupportMappingConfig();
  let meta = getSupportMappingConfigMeta();
  let draft = cloneJson(baseline);

  function render() {
    const validation = validateSupportMappingConfig(draft);
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
    container.innerHTML = buildHtml(draft, meta, format, validation, dirty);

    container.querySelector('[data-action="format"]')?.addEventListener('change', (event) => {
      format = String(event.target.value || 'REV').toUpperCase();
      render();
    });

    for (const input of container.querySelectorAll('[data-field]')) {
      const handler = () => {
        draft = readDraft(container, draft, format);
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    }

    container.querySelector('[data-action="apply"]')?.addEventListener('click', () => {
      try {
        const latest = readDraft(container, draft, format);
        const result = replaceSupportMappingConfig(latest, 'support-mapping-config-tab');
        baseline = result.config;
        draft = cloneJson(result.config);
        meta = getSupportMappingConfigMeta();
        notify({ level: 'success', title: 'Support Mapping', message: 'Support mapping config applied.' });
        render();
      } catch (error) {
        notify({ level: 'error', title: 'Support Mapping', message: error.message, details: error });
      }
    });

    container.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      const result = resetSupportMappingConfig();
      baseline = result.config;
      draft = cloneJson(result.config);
      meta = getSupportMappingConfigMeta();
      notify({ level: 'info', title: 'Support Mapping', message: 'Defaults restored.' });
      render();
    });

    container.querySelector('[data-action="export"]')?.addEventListener('click', () => {
      downloadJson(`support-mapping-config-${Date.now()}.json`, draft);
      notify({ level: 'success', title: 'Support Mapping', message: 'Config exported.' });
    });

    container.querySelector('[data-action="import"]')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const parsed = await readJsonFile(file);
        draft = cloneJson(parsed);
        notify({ level: 'success', title: 'Support Mapping', message: `Imported ${file.name}.` });
        render();
      } catch (error) {
        notify({ level: 'error', title: 'Support Mapping', message: `Import failed: ${error.message}`, details: error });
      } finally {
        event.target.value = '';
      }
    });
  }

  loadSupportMappingConfig();
  baseline = getSupportMappingConfig();
  meta = getSupportMappingConfigMeta();
  draft = cloneJson(baseline);

  const unsubscribe = subscribeSupportMappingConfig(() => {
    baseline = getSupportMappingConfig();
    meta = getSupportMappingConfigMeta();
    draft = cloneJson(baseline);
    render();
  });

  render();
  return () => unsubscribe?.();
}
