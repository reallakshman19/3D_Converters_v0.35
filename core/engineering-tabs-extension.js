import { RuntimeEvents } from '../contracts/runtime-events.js';
import { emit, on } from './event-bus.js';

const ACTIVE_TAB_STORAGE_KEY = 'format-converters.activeTabId';
const ENGINEERING_TABS = Object.freeze([
  {
    id: 'engineering-calculations',
    label: 'Engineering Calculations',
    load: () => import('../tabs/engineering-workspace-tab.js?v=20260816-aiv-canvas-release-1').then((module) => module.renderEngineeringWorkspaceTab),
  },
]);
const TAB_IDS = new Set(ENGINEERING_TABS.map((tab) => tab.id));
const ENGINEERING_SUBTAB_IDS = new Set([
  'b313-material-factors',
  'empirical-weight-tuning',
  'hp-piping-class',
]);

function gearIcon() {
  const span = document.createElement('span');
  span.className = 'app-tab-icon app-tab-icon-gear';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" role="img"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></g></svg>';
  return span;
}

function setActiveButton(nav, tabId) {
  nav.querySelectorAll('.app-tab').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tabId));
}

export function installEngineeringTabs(root) {
  const nav = root?.querySelector('.app-nav');
  const content = root?.querySelector('.app-content');
  if (!nav || !content || nav.querySelector('[data-engineering-tabs="true"]')) return () => {};

  let activeId = null;
  let activeDestroy = null;
  let renderToken = 0;
  let pendingExternalSwitch = null;

  const section = document.createElement('section');
  section.className = 'app-nav-group';
  section.dataset.engineeringTabs = 'true';
  const heading = document.createElement('div');
  heading.className = 'app-nav-group-label';
  heading.textContent = 'Engineering';
  section.appendChild(heading);

  function cleanupActive() {
    try { activeDestroy?.(); } catch (error) { console.warn('Engineering tab cleanup failed', error); }
    activeDestroy = null;
  }

  async function renderEngineeringTab(tabId, context = null) {
    const tab = ENGINEERING_TABS.find((entry) => entry.id === tabId);
    if (!tab) return false;
    const token = ++renderToken;
    cleanupActive();
    activeId = tab.id;
    try { localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab.id); } catch {}
    setActiveButton(nav, tab.id);
    content.dataset.activeTab = tab.id;
    content.innerHTML = '<div class="tab-loading">Loading...</div>';
    try {
      const renderer = await tab.load();
      if (token !== renderToken || activeId !== tab.id) return true;
      content.innerHTML = '';
      const maybeDestroy = renderer(content, {
        emit,
        on,
        context,
        setActiveTab: (nextId, nextContext) => renderEngineeringTab(nextId, nextContext),
      });
      activeDestroy = typeof maybeDestroy === 'function' ? maybeDestroy : null;
      pendingExternalSwitch = null;
      emit(RuntimeEvents.TAB_RENDERED, { id: tab.id, extension: 'engineering' });
    } catch (error) {
      console.error(`Failed to render engineering tab ${tab.id}`, error);
      content.innerHTML = `<div class="tab-error"><h2>Could not load ${tab.label}</h2><pre>${String(error?.message || error)}</pre></div>`;
    }
    return true;
  }

  for (const tab of ENGINEERING_TABS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-tab';
    button.dataset.tab = tab.id;
    button.dataset.group = 'Engineering';
    button.appendChild(gearIcon());
    const label = document.createElement('span');
    label.textContent = tab.label;
    button.appendChild(label);
    button.addEventListener('click', () => renderEngineeringTab(tab.id));
    section.appendChild(button);
  }
  nav.appendChild(section);

  const offChanged = on(RuntimeEvents.TAB_CHANGED, (payload = {}) => {
    const nextId = String(payload?.tabId || payload?.id || '');
    if (!TAB_IDS.has(nextId) && activeId) {
      activeId = null;
      renderToken += 1;
      cleanupActive();
      section.querySelectorAll('.app-tab').forEach((button) => button.classList.remove('is-active'));
    }
  });

  const offRendered = on(RuntimeEvents.TAB_RENDERED, (payload = {}) => {
    if (!pendingExternalSwitch || TAB_IDS.has(String(payload?.id || ''))) return;
    const pending = pendingExternalSwitch;
    setTimeout(() => renderEngineeringTab(pending.tabId, pending.context), 0);
  });

  const onWindowSwitch = (event) => {
    const requestedId = String(event?.detail?.tabId || event?.detail?.id || '');
    const detailContext = event?.detail?.context || event?.detail || null;
    let tabId = requestedId;
    let context = detailContext;
    if (ENGINEERING_SUBTAB_IDS.has(requestedId)) {
      tabId = 'engineering-calculations';
      context = { ...(detailContext && typeof detailContext === 'object' ? detailContext : {}), subtabId: requestedId };
    }
    if (!TAB_IDS.has(tabId)) return;
    pendingExternalSwitch = { tabId, context };
    setTimeout(() => renderEngineeringTab(tabId, context), 0);
  };
  window.addEventListener('app:switch-tab', onWindowSwitch);

  try {
    const persisted = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (ENGINEERING_SUBTAB_IDS.has(persisted)) {
      setTimeout(() => renderEngineeringTab('engineering-calculations', { subtabId: persisted }), 0);
    } else if (TAB_IDS.has(persisted)) setTimeout(() => renderEngineeringTab(persisted), 0);
  } catch {}

  return () => {
    renderToken += 1;
    cleanupActive();
    offChanged?.();
    offRendered?.();
    window.removeEventListener('app:switch-tab', onWindowSwitch);
    section.remove();
  };
}

export { ENGINEERING_TABS };
