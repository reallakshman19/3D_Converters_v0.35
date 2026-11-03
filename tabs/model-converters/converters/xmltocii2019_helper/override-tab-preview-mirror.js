import { getXmlCiiPreviewRuntimeConfig, clearXmlCiiRuntimeBuckets } from '../../shared/preview-filldown.js?v=20260626-smart-fill-1';

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function clean(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function esc(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseConfigFromDom() {
  const input = document?.querySelector?.('[data-option-key="supportConfigJson"]');
  const raw = input && 'value' in input ? input.value : '';
  let parsed = {};
  try {
    const value = JSON.parse(clean(raw) || '{}');
    parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    parsed = {};
  }
  return mergeOverrideConfig(parsed, getXmlCiiPreviewRuntimeConfig());
}

function mergeOverrideConfig(baseConfig, runtimeConfig) {
  const out = baseConfig && typeof baseConfig === 'object' && !Array.isArray(baseConfig) ? { ...baseConfig } : {};
  const runtimeOverrides = runtimeConfig?.overrides && typeof runtimeConfig.overrides === 'object' && !Array.isArray(runtimeConfig.overrides)
    ? runtimeConfig.overrides
    : {};
  if (!out.overrides || typeof out.overrides !== 'object' || Array.isArray(out.overrides)) out.overrides = {};
  for (const [bucketName, bucketValue] of Object.entries(runtimeOverrides)) {
    if (bucketValue && typeof bucketValue === 'object' && !Array.isArray(bucketValue)) {
      out.overrides[bucketName] = { ...(out.overrides[bucketName] || {}), ...bucketValue };
    }
  }
  return out;
}

function flatEntries(config, bucketName) {
  const bucket = config?.overrides?.[bucketName];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return [];
  return Object.entries(bucket)
    .filter(([key, value]) => clean(key) && clean(value))
    .sort(([a], [b]) => a.localeCompare(b));
}

function processEntries(config) {
  const bucket = config?.overrides?.processData;
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return [];
  return Object.entries(bucket)
    .filter(([key, value]) => clean(key) && value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => [key, Object.entries(value).filter(([, v]) => clean(v)).map(([field, v]) => `${field}: ${clean(v)}`).join(' · ')])
    .filter(([, value]) => clean(value))
    .sort(([a], [b]) => a.localeCompare(b));
}

function tableHtml(title, leftLabel, rightLabel, entries, bucketName) {
  if (!entries.length) return '';
  return `<section class="model-converters-workflow-override-section" data-preview-override-mirror-section>
    <div class="model-converters-workflow-master-head">
      <div>
        <div class="model-converters-workflow-detail-title">${esc(title)}</div>
        <div class="model-converters-workflow-detail-text">Saved from Preview into supportConfigJson.overrides. This mirror confirms the value is persisted.</div>
      </div>
      <button type="button" class="model-converters-download-btn" data-clear-xml-cii-override-bucket="${esc(bucketName)}" style="font-size:11px;padding:4px 10px;white-space:nowrap;">Clear</button>
    </div>
    <div class="model-converters-workflow-table-wrap">
      <table class="model-converters-workflow-table">
        <thead><tr><th>${esc(leftLabel)}</th><th>${esc(rightLabel)}</th></tr></thead>
        <tbody>${entries.map(([key, value]) => `<tr><td><code>${esc(key)}</code></td><td><strong>${esc(value)}</strong></td></tr>`).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function findManualOverrideCard() {
  const cards = [...document.querySelectorAll('.model-converters-workflow-master-card')];
  return cards.find((card) => {
    const title = card.querySelector('.model-converters-workflow-master-head .model-converters-workflow-detail-title');
    return clean(title?.textContent).startsWith('Manual Override');
  }) || null;
}

function previewOverrideFingerprint(config) {
  const payload = {
    rating: flatEntries(config, 'rating'),
    materialCode: flatEntries(config, 'materialCode'),
    wallThickness: flatEntries(config, 'wallThickness'),
    corrosion: flatEntries(config, 'corrosion'),
    rigidWeight: flatEntries(config, 'rigidWeight'),
    processData: processEntries(config),
    nativePipingClassCount: Object.keys(config?.overrides?.pipingClass || {}).length,
    nativeMaterialCount: Object.keys(config?.overrides?.material || {}).length,
  };
  return JSON.stringify(payload);
}

function renderPreviewOverrideMirror() {
  const card = findManualOverrideCard();
  if (!card) return;

  const config = parseConfigFromDom();
  const fingerprint = previewOverrideFingerprint(config);
  if (card.dataset.previewOverrideMirrorFingerprint === fingerprint && card.querySelector('[data-preview-override-mirror]')) return;

  const sections = [
    tableHtml('Rating Overrides', 'Line / Branch / Class Key', 'Rating', flatEntries(config, 'rating'), 'rating'),
    tableHtml('Material Code Overrides', 'Line / Branch / Material Key', 'Code', flatEntries(config, 'materialCode'), 'materialCode'),
    tableHtml('Wall Thickness Overrides', 'Line / Branch Key', 'Wall Thickness', flatEntries(config, 'wallThickness'), 'wallThickness'),
    tableHtml('Corrosion Overrides', 'Line / Branch Key', 'Corrosion Allowance', flatEntries(config, 'corrosion'), 'corrosion'),
    tableHtml('Rigid Weight Overrides', 'Branch::Node Key', 'Weight kg', flatEntries(config, 'rigidWeight'), 'rigidWeight'),
    tableHtml('Process Data Overrides', 'Line / Branch Key', 'Fields', processEntries(config), 'processData'),
  ].filter(Boolean).join('');

  card.querySelectorAll('[data-preview-override-mirror], [data-preview-override-mirror-section]').forEach((node) => node.remove());
  card.dataset.previewOverrideMirrorFingerprint = fingerprint;
  if (!sections) return;

  const nativeCount = Object.keys(config?.overrides?.pipingClass || {}).length + Object.keys(config?.overrides?.material || {}).length;
  const mirroredCount = flatEntries(config, 'rating').length
    + flatEntries(config, 'materialCode').length
    + flatEntries(config, 'wallThickness').length
    + flatEntries(config, 'corrosion').length
    + flatEntries(config, 'rigidWeight').length
    + processEntries(config).length;
  const countEl = card.querySelector('.model-converters-workflow-count');
  if (countEl) countEl.textContent = `${nativeCount + mirroredCount} override(s)`;

  card.insertAdjacentHTML('beforeend', `<div data-preview-override-mirror class="model-converters-workflow-detail-note" style="margin-top:12px;">Preview-saved override buckets are shown below. Native editable sections remain Piping Class and Material; edit Rating/Process values from Preview or Config JSON.</div>${sections}`);
}

// Companion buckets to clear together (e.g. __dtxrWallKeys tracks which wallThickness
// entries were written by the DTXR button rather than manual edits).
const BUCKET_COMPANIONS = { wallThickness: ['__dtxrWallKeys'] };

function clearOverrideBucket(bucketName) {
  const companions = BUCKET_COMPANIONS[bucketName] || [];
  // Clear from supportConfigJson DOM input
  const input = document?.querySelector?.('[data-option-key="supportConfigJson"]');
  if (input && 'value' in input) {
    try {
      const config = JSON.parse(input.value || '{}');
      if (config.overrides && typeof config.overrides === 'object') {
        delete config.overrides[bucketName];
        for (const companion of companions) delete config.overrides[companion];
      }
      input.value = JSON.stringify(config);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {}
  }
  // Also clear from runtime overrides (written by fill-down, not just DOM config).
  // Without this step the runtime store re-merges the values on the next render.
  clearXmlCiiRuntimeBuckets(bucketName, ...companions);
  try { localStorage.removeItem('xml-cii-pv-cache-v2'); } catch {}
}

let installed = false;
let scheduled = false;

export function installXmlCiiPreviewOverrideTabMirror() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      renderPreviewOverrideMirror();
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else setTimeout(run, 0);
  };
  schedule();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  // Delegate clear-bucket button clicks (buttons live inside the mirror sections).
  document.body.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-clear-xml-cii-override-bucket]');
    if (!btn) return;
    const bucket = btn.getAttribute('data-clear-xml-cii-override-bucket');
    if (bucket) { clearOverrideBucket(bucket); schedule(); }
  });
}

installXmlCiiPreviewOverrideTabMirror();
