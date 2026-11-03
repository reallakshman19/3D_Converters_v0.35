const SUBTABS = Object.freeze([
  {
    id: 'calculations',
    label: 'Calculations',
    load: () => import('./engineering-calculations-tab.js?v=20260816-aiv-canvas-release-1').then((module) => module.renderEngineeringCalculationsTab),
  },
  {
    id: 'b313-material-factors',
    label: 'B31.3 Material Factors',
    load: () => import('./b313-material-factors-tab.js?v=engineering-2').then((module) => module.renderB313MaterialFactorsTab),
  },
  {
    id: 'empirical-weight-tuning',
    label: 'Empirical Weight Tuning',
    load: () => import('./empirical-weight-tuning-tab.js?v=engineering-2').then((module) => module.renderEmpiricalWeightTuningTab),
  },
  {
    id: 'hp-piping-class',
    label: 'HP Piping Class',
    load: () => import('./hp-piping-class-workbench-tab.js?v=20260816-hp-real-workbench-2').then((module) => module.renderHpPipingClassWorkbenchTab),
  },
]);
const SUBTAB_IDS = new Set(SUBTABS.map((tab) => tab.id));
const STORAGE_KEY = 'format-converters.engineeringCalculationsSubtab';

function ensureStylesheet() {
  if (document.querySelector('style[data-engineering-workspace-style="true"]')) return;
  const style = document.createElement('style');
  style.dataset.engineeringWorkspaceStyle = 'true';
  style.textContent = `
    .engineering-workspace{min-height:0}.engineering-workspace-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:12px 18px 8px;border-bottom:1px solid rgba(148,163,184,.16)}
    .engineering-workspace-tab{font:inherit;color:inherit;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.45);border-radius:9px;padding:8px 12px;cursor:pointer}
    .engineering-workspace-tab:hover{background:rgba(148,163,184,.1)}.engineering-workspace-tab.is-active{background:rgba(148,163,184,.16);font-weight:750}
    .engineering-workspace-panel{min-height:0}.engineering-workspace-loading,.engineering-workspace-error{padding:20px}.engineering-workspace-error pre{white-space:pre-wrap}
  `;
  document.head.appendChild(style);
}

function initialSubtab(context) {
  const requested = String(context?.subtabId || '').trim();
  if (SUBTAB_IDS.has(requested)) return requested;
  if (context?.calculationId) return 'calculations';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUBTAB_IDS.has(stored)) return stored;
  } catch {}
  return 'calculations';
}

export function renderEngineeringWorkspaceTab(container, { context = null, emit, on, setActiveTab } = {}) {
  ensureStylesheet();
  let activeId = initialSubtab(context);
  let activeDestroy = null;
  let renderToken = 0;

  container.innerHTML = `
    <div class="engineering-workspace">
      <div class="engineering-workspace-tabs" role="tablist" aria-label="Engineering Calculations sections">
        ${SUBTABS.map((tab) => `<button type="button" class="engineering-workspace-tab" data-engineering-subtab="${tab.id}" role="tab">${tab.label}</button>`).join('')}
      </div>
      <div class="engineering-workspace-panel" data-engineering-workspace-panel></div>
    </div>`;

  const panel = container.querySelector('[data-engineering-workspace-panel]');

  function cleanupActive() {
    try { activeDestroy?.(); } catch (error) { console.warn('Engineering subtab cleanup failed', error); }
    activeDestroy = null;
  }

  function setActiveButton() {
    container.querySelectorAll('[data-engineering-subtab]').forEach((button) => {
      const active = button.dataset.engineeringSubtab === activeId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  async function renderSubtab(nextId, nextContext = null) {
    const tab = SUBTABS.find((entry) => entry.id === nextId);
    if (!tab) return;
    const token = ++renderToken;
    cleanupActive();
    activeId = tab.id;
    try { localStorage.setItem(STORAGE_KEY, activeId); } catch {}
    setActiveButton();
    panel.innerHTML = '<div class="engineering-workspace-loading">Loading...</div>';
    try {
      const renderer = await tab.load();
      if (token !== renderToken || activeId !== tab.id) return;
      panel.innerHTML = '';
      const childContext = nextContext ?? (context?.subtabId === tab.id ? context : (tab.id === 'calculations' ? context : null));
      const maybeDestroy = renderer(panel, { context: childContext, emit, on, setActiveTab });
      activeDestroy = typeof maybeDestroy === 'function' ? maybeDestroy : null;
    } catch (error) {
      if (token !== renderToken) return;
      panel.innerHTML = `<div class="engineering-workspace-error"><h2>Could not load ${tab.label}</h2><pre>${String(error?.message || error)}</pre></div>`;
    }
  }

  function onClick(event) {
    const button = event.target.closest('[data-engineering-subtab]');
    if (!button) return;
    renderSubtab(button.dataset.engineeringSubtab, null);
  }

  container.addEventListener('click', onClick);
  renderSubtab(activeId, context);

  return () => {
    renderToken += 1;
    cleanupActive();
    container.removeEventListener('click', onClick);
    container.innerHTML = '';
  };
}

export { SUBTABS as ENGINEERING_WORKSPACE_SUBTABS };
