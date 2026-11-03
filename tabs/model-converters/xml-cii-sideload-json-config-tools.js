import {
  DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG,
  normalizeXmlCiiSideloadJsonConfig,
} from '../../converters/xml-cii2019-core/sideload-json-config.js';

const FLAG = '__xmlCiiSideloadJsonConfigTools_v1';
const CONFIG_KEY = 'xmlCii2019.sideload.jsonConfig.v1';

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

function safeJsonParse(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(raw || '');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function supportConfigInput(root) {
  return root.querySelector('[data-option-key="supportConfigJson"]');
}

function parseSupportConfig(input) {
  return safeJsonParse(input?.value || '{}', {});
}

function writeSupportConfig(input, cfg) {
  if (!input) return;
  input.value = JSON.stringify(cfg || {}, null, 2);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function readStoredConfig() {
  try {
    return safeJsonParse(window.localStorage.getItem(CONFIG_KEY) || '', null);
  } catch {
    return null;
  }
}

function writeStoredConfig(config) {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config, null, 2));
  } catch {}
}

function readJsonConfig(root) {
  const input = supportConfigInput(root);
  const cfg = parseSupportConfig(input);
  return normalizeXmlCiiSideloadJsonConfig(
    cfg.sideloadJsonConfig || readStoredConfig() || DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG,
  );
}

function writeJsonConfig(root, jsonConfig) {
  const input = supportConfigInput(root);
  const cfg = parseSupportConfig(input);
  const normalized = normalizeXmlCiiSideloadJsonConfig(jsonConfig);
  cfg.sideloadJsonConfig = normalized;
  writeSupportConfig(input, cfg);
  writeStoredConfig(normalized);
  return normalized;
}

function aliases(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function parseAliases(value) {
  return text(value).split(/[,\n]/).map(clean).filter(Boolean);
}

function field(label, key, value) {
  return `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9cc5ff;">
    <span>${esc(label)}</span>
    <textarea data-sideload-json-extra-field="${esc(key)}" spellcheck="false" style="min-height:50px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:11px;">${esc(aliases(value))}</textarea>
  </label>`;
}

function syncExtraFieldsFromUi(root, config) {
  const next = normalizeXmlCiiSideloadJsonConfig(config);
  const map = {
    dtxrPs: [next.itemExtractors.DTXR_PS, 'sourceFieldAliases'],
    dtxrPos: [next.itemExtractors.DTXR_POS, 'sourceFieldAliases'],
    weight: [next.itemExtractors.WEIGHT, 'sourceFieldAliases'],
    rating: [next.itemExtractors.RATING, 'sourceFieldAliases'],
    meta: [next.itemExtractors.RESTRAINT_META, 'sourceFieldAliases'],
    psRegex: [next.basisResolvers.PS, 'regexExtractors'],
  };
  for (const [key, [target, prop]] of Object.entries(map)) {
    const textarea = root.querySelector(`[data-sideload-json-extra-field="${key}"]`);
    if (textarea) target[prop] = parseAliases(textarea.value);
  }
  const ratingRegex = root.querySelector('[data-sideload-json-extra-field="ratingRegex"]');
  if (ratingRegex) next.itemExtractors.RATING.ratingRegex = ratingRegex.value.trim() || DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG.itemExtractors.RATING.ratingRegex;
  return next;
}

function downloadText(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function advancedHtml(config) {
  return `<div id="mc-sideload-json-config-tools" class="model-converters-workflow-master-card" style="margin-top:10px;">
    <div class="model-converters-workflow-section-title">Advanced JSON Config</div>
    <div class="model-converters-workflow-detail-text" style="margin-bottom:8px;">
      These aliases control the six preview-stage item groups. Edit them here instead of changing code when source JSON uses different field names.
    </div>
    <div class="model-converters-workflow-regex-grid">
      ${field('DTXR_PS fields', 'dtxrPs', config.itemExtractors.DTXR_PS.sourceFieldAliases)}
      ${field('DTXR_POS fields', 'dtxrPos', config.itemExtractors.DTXR_POS.sourceFieldAliases)}
      ${field('Weight fields', 'weight', config.itemExtractors.WEIGHT.sourceFieldAliases)}
      ${field('Rating fields', 'rating', config.itemExtractors.RATING.sourceFieldAliases)}
      ${field('Restraint meta fields', 'meta', config.itemExtractors.RESTRAINT_META.sourceFieldAliases)}
      ${field('PS regex extractors', 'psRegex', config.basisResolvers.PS.regexExtractors)}
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9cc5ff;">
        <span>Rating regex</span>
        <textarea data-sideload-json-extra-field="ratingRegex" spellcheck="false" style="min-height:50px;background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:11px;">${esc(config.itemExtractors.RATING.ratingRegex || '')}</textarea>
      </label>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;">
      <button type="button" class="model-converters-run-btn" id="mc-sideload-json-advanced-save">Save Advanced Fields</button>
      <button type="button" class="model-converters-download-btn" id="mc-sideload-json-export">Export Config</button>
      <label class="model-converters-download-btn" style="cursor:pointer;">Import Config <input id="mc-sideload-json-import" type="file" accept="application/json,.json" style="display:none;"></label>
      <span id="mc-sideload-json-advanced-status" style="font-size:12px;color:#9aa8ba;"></span>
    </div>
  </div>`;
}

function enhanceJsonConfigPanel(root) {
  const detail = root.querySelector('#model-converters-xml-cii-sideload-detail');
  if (!detail || detail.querySelector('#mc-sideload-json-config-tools')) return;
  const title = clean(detail.querySelector('.model-converters-workflow-detail-title')?.textContent || '');
  if (title !== 'JSON Config') return;

  const config = readJsonConfig(root);
  detail.insertAdjacentHTML('beforeend', advancedHtml(config));

  const status = detail.querySelector('#mc-sideload-json-advanced-status');
  detail.querySelector('#mc-sideload-json-advanced-save')?.addEventListener('click', () => {
    const next = syncExtraFieldsFromUi(detail, readJsonConfig(root));
    writeJsonConfig(root, next);
    if (status) { status.textContent = 'Advanced aliases saved.'; status.style.color = '#5df0a0'; }
  });

  detail.querySelector('#mc-sideload-json-export')?.addEventListener('click', () => {
    const next = syncExtraFieldsFromUi(detail, readJsonConfig(root));
    writeJsonConfig(root, next);
    downloadText('xml-cii-sideload-json-config.json', JSON.stringify(next, null, 2));
    if (status) { status.textContent = 'Config exported.'; status.style.color = '#9aa8ba'; }
  });

  detail.querySelector('#mc-sideload-json-import')?.addEventListener('change', async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const imported = normalizeXmlCiiSideloadJsonConfig(JSON.parse(await file.text()));
      writeJsonConfig(root, imported);
      if (status) { status.textContent = `Imported ${file.name}. Reopen JSON Config to view fields.`; status.style.color = '#5df0a0'; }
    } catch (error) {
      if (status) { status.textContent = `Import failed: ${clean(error?.message || error)}`; status.style.color = '#ff8888'; }
    }
  });
}

export function installXmlCiiSideloadJsonConfigTools(container = document) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[FLAG]) return;
  window[FLAG] = true;
  const root = container || document;
  const tick = () => enhanceJsonConfigPanel(root);
  tick();
  const observer = new MutationObserver(tick);
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
}
