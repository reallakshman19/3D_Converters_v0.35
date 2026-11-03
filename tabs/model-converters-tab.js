const MODEL_CONVERTERS_SHIM_VERSION = '20260816-cii-v11-v14-dropdown-release-4';
const CANONICAL_MODULE = './model-converters/index.js?v=20260816-cii-v11-v14-dropdown-release-4';
const LEGACY_MODULE = './model-converters/legacy-adapter.js?v=20260816-cii-v11-v14-dropdown-release-4';
const CII_V11_V14_ADDON = './model-converters/cii-v11-v14-addon.js?v=20260816-cii-v11-v14-dropdown-release-4';
const CII_V11_V14_DROPDOWN_INTEGRATION = './model-converters/cii-v11-v14-dropdown-integration.js?v=20260816-cii-v11-v14-dropdown-release-4';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch]);
}
function errorText(error) { return String(error?.stack || error?.message || error || 'Unknown error'); }
function renderDiagnostic(container, title, primaryError, fallbackError) {
  if (!container) return;
  const fallbackBlock = fallbackError ? `<h3>Legacy fallback error</h3><pre>${escapeHtml(errorText(fallbackError))}</pre>` : '';
  container.innerHTML = `<section class="model-converters-tab model-converters-tab--error" data-model-converters-shim="${escapeHtml(MODEL_CONVERTERS_SHIM_VERSION)}"><h2>${escapeHtml(title)}</h2><p>The Model Converters tab could not load its full workflow module. The app shell stayed alive and caught the module issue.</p><h3>Canonical module error</h3><pre>${escapeHtml(errorText(primaryError))}</pre>${fallbackBlock}</section>`;
}
function callRenderer(renderer, container, ctx) {
  if (typeof renderer !== 'function') throw new Error('Model Converters renderer export is missing.');
  return renderer(container, ctx);
}
async function installRenderedCiiV11V14Dropdown(container) {
  const module = await import(CII_V11_V14_DROPDOWN_INTEGRATION);
  if (typeof module?.installCiiV11V14DropdownIntegration !== 'function') {
    throw new Error('CAESAR v11/v14 rendered dropdown integration export is missing.');
  }
  if (module.installCiiV11V14DropdownIntegration(container) !== true) {
    throw new Error('CAESAR v11/v14 rendered dropdown integration did not install.');
  }
}
function renderLegacyFallback(container, ctx, cause) {
  return import(LEGACY_MODULE)
    .then(async (module) => {
      const result = callRenderer(module.renderLegacyModelConvertersTab, container, ctx);
      await installRenderedCiiV11V14Dropdown(container);
      return result;
    })
    .catch((fallbackError) => {
      console.error('[ModelConvertersTab] legacy fallback failed after canonical import failure', { cause, fallbackError });
      renderDiagnostic(container, 'Could not load Model Converters', cause, fallbackError);
      return null;
    });
}
async function installCiiV11V14Addon() {
  const module = await import(CII_V11_V14_ADDON);
  if (typeof module?.installCiiV11V14Addon !== 'function') {
    throw new Error('CAESAR v11/v14 dropdown addon installer export is missing.');
  }
  if (module.installCiiV11V14Addon() !== true) {
    throw new Error('CAESAR v11/v14 dropdown addon did not register the converter.');
  }
}
export function renderModelConvertersTab(container, ctx) {
  if (container?.dataset) container.dataset.modelConvertersShim = MODEL_CONVERTERS_SHIM_VERSION;
  installCiiV11V14Addon()
    .then(() => import(CANONICAL_MODULE)
      .then((module) => callRenderer(module.renderModelConvertersTab, container, ctx))
      .catch((error) => {
        console.error('[ModelConvertersTab] canonical renderer failed; trying legacy fallback', error);
        return renderLegacyFallback(container, ctx, error);
      }))
    .catch((error) => {
      console.error('[ModelConvertersTab] required CAESAR v11/v14 dropdown registration failed', error);
      renderDiagnostic(container, 'Could not load Model Converters', error, null);
      return null;
    });
  return null;
}
export const __MODEL_CONVERTERS_TAB_SHIM_VERSION__ = MODEL_CONVERTERS_SHIM_VERSION;
