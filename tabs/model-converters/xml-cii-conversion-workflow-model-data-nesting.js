const FLAG = '__xmlCiiWorkflowModelDataNesting_v1';
const SIDELOAD_TAB_KEY = 'xmlCii2019.sideload.activeSubtab';

const MODEL_DATA_STEPS = Object.freeze([
  {
    id: 'input-json',
    label: 'Input XML / JSON Import',
    note: 'Use the main XML and staged/source-like JSON file inputs already present in XML→CII.',
    selector: '#model-converters-primary-input, #model-converters-secondary-input',
  },
  {
    id: 'resolver',
    label: 'Resolver Index',
    note: 'Build Node, PS No., and POS indexes from loaded XML.',
    sideloadTab: 'resolver',
  },
  {
    id: 'json-config',
    label: 'JSON Config',
    note: 'Configure source-like JSON aliases for PS/POS/restraint/DTXR/weight/rating/meta extraction.',
    sideloadTab: 'json-config',
  },
  {
    id: 'json-data',
    label: 'JSON Resolved Data',
    note: 'Audit matched JSON-derived facts before they enter Matched Preview.',
    sideloadTab: 'json-data',
  },
  {
    id: 'ps',
    label: 'PS → Node',
    note: 'Test PS/support-tag lookup against XML node indexes.',
    sideloadTab: 'ps',
  },
  {
    id: 'pos',
    label: 'POS → Node',
    note: 'Test XYZ or E/S/U coordinate lookup against XML positions.',
    sideloadTab: 'pos',
  },
  {
    id: 'restraints',
    label: 'Manual Restraints',
    note: 'Load Node/PS/POS side-load restraint rows and save them to run options.',
    sideloadTab: 'restraints',
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    note: 'Review rejected, invalid, ambiguous, and duplicate side-load rows.',
    sideloadTab: 'diagnostics',
  },
]);

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

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

function cssString(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value));
  return String(value).replace(/[^A-Za-z0-9_-]/g, '\\$&');
}

function readStored(key, fallback = '') {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeStored(key, value) {
  try { window.localStorage.setItem(key, value); } catch {}
}

function activeSideloadTab() {
  const activeButton = document.querySelector('#model-converters-xml-cii-sideload [data-sideload-tab].active');
  return activeButton?.getAttribute('data-sideload-tab') || readStored(SIDELOAD_TAB_KEY, 'resolver');
}

function findModelDataPanel() {
  const mount = document.querySelector('[data-xml-cii-popup-panel="sideload"]');
  if (!mount) return null;
  return mount.closest('.workflow-modal, .model-converters-workflow, [role="dialog"]') || mount.parentElement;
}

function stepButtonHtml(step) {
  const active = step.sideloadTab && step.sideloadTab === activeSideloadTab();
  return `
    <button type="button"
      class="model-converters-workflow-master-tab ${active ? 'active' : ''}"
      data-xml-cii-model-data-step="${esc(step.id)}"
      ${step.sideloadTab ? `data-sideload-tab-target="${esc(step.sideloadTab)}"` : ''}
      ${step.selector ? `data-scroll-target="${esc(step.selector)}"` : ''}>
      <span>${esc(step.label)}</span>
      <small>${esc(step.note)}</small>
    </button>`;
}

function renderShortcutPanel() {
  return `
    <div class="model-converters-workflow-master-card" data-xml-cii-model-data-nesting style="margin-top:10px;">
      <div class="model-converters-workflow-section-title">XML - Model Data nested steps</div>
      <div class="model-converters-workflow-detail-text">
        These shortcuts organize the existing live XML→CII model-data tools inside the popup. They do not duplicate or bypass the existing side-load implementation.
      </div>
      <div class="model-converters-workflow-master-tabs" style="margin-top:12px;">
        ${MODEL_DATA_STEPS.map(stepButtonHtml).join('')}
      </div>
    </div>`;
}

function scrollToMainTarget(selector) {
  const target = document.querySelector(selector);
  if (!target) return false;
  try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { target.scrollIntoView?.(); }
  try { target.focus?.(); } catch {}
  return true;
}

function openSideloadSubtab(tabId) {
  const button = document.querySelector(`#model-converters-xml-cii-sideload [data-sideload-tab="${cssString(tabId)}"]`);
  writeStored(SIDELOAD_TAB_KEY, tabId);
  if (!button) return false;
  button.click();
  return true;
}

function bindShortcutPanel(panel) {
  panel.querySelectorAll('[data-xml-cii-model-data-step]').forEach((button) => {
    if (button.dataset.xmlCiiModelDataBound === 'true') return;
    button.dataset.xmlCiiModelDataBound = 'true';
    button.addEventListener('click', () => {
      const sideloadTab = button.getAttribute('data-sideload-tab-target');
      const scrollTarget = button.getAttribute('data-scroll-target');
      if (sideloadTab) openSideloadSubtab(sideloadTab);
      if (scrollTarget) scrollToMainTarget(scrollTarget);
      refreshShortcutPanel();
    });
  });
}

function refreshShortcutPanel() {
  const panel = document.querySelector('[data-xml-cii-model-data-nesting]');
  if (!panel) return;
  const parent = panel.parentElement;
  const replacement = document.createElement('div');
  replacement.innerHTML = renderShortcutPanel().trim();
  const next = replacement.firstElementChild;
  parent.replaceChild(next, panel);
  bindShortcutPanel(next);
}

function ensureShortcutPanel() {
  const mount = document.querySelector('[data-xml-cii-popup-panel="sideload"]');
  if (!mount) return;
  const host = findModelDataPanel() || mount.parentElement;
  if (!host || host.querySelector('[data-xml-cii-model-data-nesting]')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderShortcutPanel().trim();
  const panel = wrapper.firstElementChild;
  mount.parentNode?.insertBefore(panel, mount);
  bindShortcutPanel(panel);
}

export function installXmlCiiConversionWorkflowModelDataNesting(container = document) {
  if (!browserReady() || window[FLAG]) return;
  window[FLAG] = true;
  const root = container || document;
  const observer = new MutationObserver(() => ensureShortcutPanel());
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
  ensureShortcutPanel();
}
