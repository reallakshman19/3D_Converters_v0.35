import { getXmlCiiPreviewRuntimeConfig } from './shared/preview-filldown.js?v=20260620-rating-runtime-1';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function parseConfig(value) {
  try {
    const parsed = JSON.parse(text(value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeRuntimeOverrides(baseConfig, runtimeConfig) {
  const out = baseConfig && typeof baseConfig === 'object' && !Array.isArray(baseConfig) ? { ...baseConfig } : {};
  const runtime = runtimeConfig && typeof runtimeConfig === 'object' && !Array.isArray(runtimeConfig) ? runtimeConfig : {};
  const runtimeOverrides = runtime.overrides && typeof runtime.overrides === 'object' && !Array.isArray(runtime.overrides)
    ? runtime.overrides
    : {};
  if (!Object.keys(runtimeOverrides).length) return out;

  out.overrides = out.overrides && typeof out.overrides === 'object' && !Array.isArray(out.overrides)
    ? { ...out.overrides }
    : {};
  for (const [bucketName, bucketValue] of Object.entries(runtimeOverrides)) {
    if (bucketValue && typeof bucketValue === 'object' && !Array.isArray(bucketValue)) {
      out.overrides[bucketName] = { ...(out.overrides[bucketName] || {}), ...bucketValue };
    } else if (text(bucketValue)) {
      out.overrides[bucketName] = bucketValue;
    }
  }
  out.__runtimePreviewOverridesMergedAt = new Date().toISOString();
  return out;
}

function scopedSupportConfigTextarea(root) {
  const input = root?.querySelector?.('[data-option-key="supportConfigJson"]');
  if (!input || !('value' in input)) return null;
  const style = input instanceof HTMLElement ? window.getComputedStyle(input) : null;
  if (style && style.display === 'none' && root.querySelector?.('[data-xml-cii-workflow-root="true"]')) return null;
  return input;
}

function syncSupportConfigTextarea(root) {
  const input = scopedSupportConfigTextarea(root);
  if (!input) return false;
  const runtimeConfig = getXmlCiiPreviewRuntimeConfig();
  const runtimeOverrides = runtimeConfig?.overrides;
  if (!runtimeOverrides || typeof runtimeOverrides !== 'object' || !Object.keys(runtimeOverrides).length) return false;
  const merged = mergeRuntimeOverrides(parseConfig(input.value), runtimeConfig);
  const nextText = JSON.stringify(merged, null, 2);
  if (input.value === nextText) return true;
  input.value = nextText;
  try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
  try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
  return true;
}

export function installXmlCiiRuntimeOverrideSync(container) {
  if (typeof document === 'undefined') return;
  const root = container?.querySelector?.('[data-model-converters-root]')
    || container?.querySelector?.('.model-converters-panel')
    || container;
  if (!root || root.dataset.xmlCiiRuntimeOverrideSync === '20260624-explicit-only') return;
  root.dataset.xmlCiiRuntimeOverrideSync = '20260624-explicit-only';

  // Do not listen to every popup/master `change` event. The previous broad
  // capture listener parsed and re-serialized the hidden multi-MB XML->CII config
  // for ordinary master-tab/select changes, producing 200-400 ms handlers and
  // making Workflow 1/2 Import Masters feel unresponsive. Runtime preview
  // overrides only need to be merged before explicit preview/weight/run actions.
  root.addEventListener('click', (event) => {
    const trigger = event.target?.closest?.([
      '[data-mc-preview-build]',
      '#mc-wm-refresh',
      '#mc-wm-fill-best',
      '[data-native-build-preview]',
      '[data-native-compute-weights]',
      '[data-native-apply-preferred-weights]',
      '[data-native-finalise-run]',
      '.model-converters-run-btn[data-xml-cii-finalize-run]',
    ].join(','));
    if (!trigger) return;
    syncSupportConfigTextarea(root);
  }, true);
}
