import { loadStickyState, state, setActiveTab } from './state.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';
import { emit, on } from './event-bus.js';
import { hideLoading } from './loading.js';
import { initDevDebugWindow } from '../debug/dev-debug-window.js';

export const STANDALONE_APP = Object.freeze({
  id: 'format-converters',
  name: 'FormatConverters',
  subtitle: 'Converters, Exchange, Mapping',
  defaultTab: 'model-converters',
});

const TAB_VISIBILITY_URL = new URL('../config/tab-visibility.json', import.meta.url).href;
const APP_ICON_URL = new URL('../assets/app-icon.svg?v=standalone-1', import.meta.url).href;
const ACTIVE_TAB_STORAGE_KEY = 'format-converters.activeTabId';
const TAB_ID_ALIASES = new Map([
  ['model-converters', 'model-converters'],
  ['xml-cii-2019-standalone', 'xml-cii-2019-standalone'],
  ['xml-builder', 'xml-builder'],
  ['basic-glb-pcf', 'basic-glb-pcf'],
  ['universal-xml', 'universal-xml'],
  ['universal-enrichment-workbench', 'universal-enrichment-workbench'],
  ['model-exchange', 'model-exchange'],
  ['interchange-config', 'interchange-config'],
  ['support-mapping-config', 'support-mapping-config'],
  ['adapter-mapping', 'adapter-mapping'],
  ['stagedjson-properties', 'stagedjson-properties'],
  ['stagedjson-to-enrichxml', 'stagedjson-to-enrichxml']
]);
const TAB_ICON_SVGS = Object.freeze({
  cube: '\u003cpath d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/>\u003cpath d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  pipe: '\u003cpath d="M4 15h6a4 4 0 0 0 4-4V5"/>\u003cpath d="M14 5h5"/>\u003ccircle cx="4" cy="15" r="1.5"/>\u003ccircle cx="19" cy="5" r="1.5"/>',
  convert: '\u003cpath d="M5 7h12l-3-3M17 17H5l3 3"/>\u003cpath d="M17 7 14 10M5 17l3-3"/>',
  exchange: '\u003cpath d="M4 8h12l-3-3M20 16H8l3 3"/>\u003cpath d="M16 8h4v8M8 16H4V8"/>',
  gear: '\u003cpath d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/>\u003cpath d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  support: '\u003cpath d="M5 19h14M8 19l4-12 4 12M9.4 15h5.2"/>\u003cpath d="M7 7h10"/>',
  map: '\u003cpath d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z"/>\u003cpath d="M9 4v14M15 6v14"/>',
  xml: '\u003cpath d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12"/>',
  compare: '\u003cpath d="M7 5h10M7 19h10M8 5v14M16 5v14"/>\u003cpath d="M4 9h7M13 15h7"/>',
  tool: '\u003cpath d="M14.5 5.5 18 2l4 4-3.5 3.5"/>\u003cpath d="M15 6 5 16l-1 4 4-1L18 9"/>',
  json: '\u003cpath d="M8 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/>\u003cpath d="M16 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/>\u003cpath d="M10 8l-2 8M14 8l2 8M11 12h2"/>',
});

export const STANDALONE_TABS = Object.freeze([
  { id: 'model-converters', label: '3D Model Converters', icon: 'convert', load: () => import('../tabs/model-converters-tab.js?v=20260729-fbx2-direct-pipe-1').then((module) => pickRenderer(module, 'renderModelConvertersTab', 'model-converters')) },
  { id: 'xml-cii-2019-standalone', label: 'XML→CII 2019 Standalone', icon: 'xml', load: () => import('../tabs/xml-cii-2019-standalone-tab.js?v=standalone-5').then((module) => pickRenderer(module, 'renderXmlCii2019StandaloneTab', 'xml-cii-2019-standalone')) },
  { id: 'xml-builder', label: 'XML Builder', icon: 'tool', load: () => import('../tabs/xml-builder-tab.js?v=standalone-1').then((module) => pickRenderer(module, 'renderXmlBuilderTab', 'xml-builder')) },
  { id: 'basic-glb-pcf', label: 'Basic GLB-PCF', icon: 'pipe', load: loadBasicGlbPcfRenderer },
  { id: 'universal-xml', label: 'Universal XML', icon: 'xml', load: () => import('../tabs/universal-xml-converter-tab.js?v=standalone-2').then((module) => pickRenderer(module, 'renderUniversalXmlConverterTab', 'universal-xml')) },
  { id: 'universal-enrichment-workbench', label: 'Universal Enrichment Workbench', icon: 'xml', load: () => import('../tabs/universal-enrichment-workbench-tab.js?v=uew-001').then((module) => pickRenderer(module, 'renderUniversalEnrichmentWorkbenchTab', 'universal-enrichment-workbench')) },
  { id: 'model-exchange', label: 'Model Exchange', icon: 'exchange', load: () => import('../tabs/model-exchange-tab.js?v=standalone-2').then((module) => pickRenderer(module, 'renderModelExchangeTab', 'model-exchange')) },
  { id: 'interchange-config', label: 'Interchange Config', icon: 'gear', load: () => import('../tabs/interchange-config-tab.js?v=standalone-2').then((module) => pickRenderer(module, 'renderInterchangeConfigTab', 'interchange-config')) },
  { id: 'support-mapping-config', label: 'Support Mapping', icon: 'support', load: () => import('../tabs/support-mapping-config-tab.js?v=standalone-2').then((module) => pickRenderer(module, 'renderSupportMappingConfigTab', 'support-mapping-config')) },
  { id: 'adapter-mapping', label: 'Adapter Mapping', icon: 'map', load: () => import('../tabs/adapter-mapping-tab.js?v=standalone-2').then((module) => pickRenderer(module, 'renderAdapterMappingTab', 'adapter-mapping')) },
  { id: 'stagedjson-properties', label: 'stagedJson Properties', icon: 'json', load: () => import('../tabs/stagedjson-properties-tab.js?v=standalone-4').then((module) => pickRenderer(module, 'renderStagedJsonPropertiesTab', 'stagedjson-properties')) },
  { id: 'stagedjson-to-enrichxml', label: 'StagedJSON→Enriched XML', icon: 'json', load: () => import('../tabs/stagedjson-to-enrichxml-tab.js?v=standalone-4').then((module) => pickRenderer(module, 'renderStagedJsonToEnrichXmlTab', 'stagedjson-to-enrichxml')) }
]);
const TAB_GROUPS = Object.freeze([
  { label: 'Converters', ids: [
  "model-converters",
  "xml-cii-2019-standalone",
  "xml-builder",
  "basic-glb-pcf",
  "universal-xml",
  "universal-enrichment-workbench",
  "stagedjson-properties",
  "stagedjson-to-enrichxml"
] },
  { label: 'Exchange', ids: [
  "model-exchange",
  "interchange-config",
  "support-mapping-config",
  "adapter-mapping"
] }
]);
let activeTabDestroy = null;
let appDestroy = null;

function cleanupActiveTab() {
  if (!activeTabDestroy) return;
  try { activeTabDestroy(); } catch (error) { console.warn('Tab cleanup failed', error); }
  activeTabDestroy = null;
}

function hideStartupOverlay() {
  try { hideLoading(); } catch {}
  const overlay = document.getElementById('app-loading-overlay');
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  overlay.setAttribute('aria-hidden', 'true');
}

function pickRenderer(module, exportName, tabId) {
  const renderer = module?.[exportName];
  if (typeof renderer !== 'function') throw new Error(`Tab ${tabId} did not export renderer ${exportName}`);
  return renderer;
}

async function loadBasicGlbPcfRenderer() {
  await import('../js/pcf2glb/ui/basicGlbPcfUiEnhancer.js?v=standalone-1');
  return import('../js/pcf2glb/ui/BasicGlbPcfPanel.js?v=standalone-1').then((module) => pickRenderer(module, 'renderBasicGlbPcfPanel', 'basic-glb-pcf'));
}

function createAppShell(root) {
  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'app-shell';
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('aria-label', 'Application tabs');
  const content = document.createElement('main');
  content.className = 'app-content';
  shell.append(nav, content);
  root.appendChild(shell);
  return { nav, content };
}

async function visibleTabs() {
  try {
    const response = await fetch(TAB_VISIBILITY_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    const hidden = new Set(Array.isArray(config?.hiddenTabs) ? config.hiddenTabs : []);
    return STANDALONE_TABS.filter((tab) => !hidden.has(tab.id));
  } catch {
    return STANDALONE_TABS;
  }
}

function tabGroupFor(tabId) {
  return TAB_GROUPS.find((group) => group.ids.includes(tabId))?.label || '';
}

function createBrandRail() {
  const brand = document.createElement('div');
  brand.className = 'app-brand-rail';
  brand.setAttribute('aria-label', STANDALONE_APP.name);
  const icon = document.createElement('img');
  icon.className = 'app-brand-icon';
  icon.src = APP_ICON_URL;
  icon.alt = '';
  icon.decoding = 'async';
  icon.loading = 'eager';
  icon.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'app-brand-copy';
  const title = document.createElement('div');
  title.className = 'app-brand-title';
  title.textContent = STANDALONE_APP.name;
  const sub = document.createElement('div');
  sub.className = 'app-brand-subtitle';
  sub.textContent = STANDALONE_APP.subtitle;
  copy.append(title, sub);
  brand.append(icon, copy);
  return brand;
}

function createTabIcon(tab) {
  const iconKey = tab.icon || 'cube';
  const span = document.createElement('span');
  span.className = `app-tab-icon app-tab-icon-${iconKey}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" focusable="false" role="img"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${TAB_ICON_SVGS[iconKey] || TAB_ICON_SVGS.cube}</g></svg>`;
  return span;
}

function renderNav(nav, tabs, content) {
  nav.innerHTML = '';
  nav.appendChild(createBrandRail());
  const groups = [];
  for (const tab of tabs) {
    const label = tabGroupFor(tab.id);
    let group = groups.find((entry) => entry.label === label);
    if (!group) {
      group = { label, tabs: [] };
      groups.push(group);
    }
    group.tabs.push(tab);
  }
  groups.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'app-nav-group';
    if (group.label) {
      const heading = document.createElement('div');
      heading.className = 'app-nav-group-label';
      heading.textContent = group.label;
      section.appendChild(heading);
    }
    group.tabs.forEach((tab) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-tab';
      button.dataset.tab = tab.id;
      button.dataset.group = group.label || '';
      button.appendChild(createTabIcon(tab));
      const label = document.createElement('span');
      label.textContent = tab.label;
      button.appendChild(label);
      button.addEventListener('click', () => requestTabSwitch(tab.id));
      section.appendChild(button);
    });
    nav.appendChild(section);
  });
  updateActiveTabButton(nav, state.activeTabId);
  content.setAttribute('data-active-tab', state.activeTabId || '');
}

function updateActiveTabButton(nav, tabId) {
  nav.querySelectorAll('.app-tab').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tabId));
}

function normalizeTabId(value) {
  const text = String(value || '').trim();
  return TAB_ID_ALIASES.get(text) || text;
}

function persistActiveTab(tabId) {
  try { localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabId); } catch {}
}

function readPersistedActiveTab(tabs) {
  try {
    const stored = normalizeTabId(localStorage.getItem(ACTIVE_TAB_STORAGE_KEY));
    if (stored && tabs.some((tab) => tab.id === stored)) return stored;
  } catch {}
  return null;
}

function requestTabSwitch(tabId) {
  const normalized = normalizeTabId(tabId);
  if (!normalized) return;
  setActiveTab(normalized);
}

async function renderActiveTab(content, nav, tabs) {
  cleanupActiveTab();
  const active = tabs.find((tab) => tab.id === state.activeTabId) || tabs[0];
  if (!active) return;
  if (state.activeTabId !== active.id) state.activeTabId = active.id;
  persistActiveTab(active.id);
  updateActiveTabButton(nav, active.id);
  content.setAttribute('data-active-tab', active.id);
  content.innerHTML = '<div class="tab-loading">Loading...</div>';
  try {
    const renderer = await active.load();
    content.innerHTML = '';
    const maybeDestroy = renderer(content, { state, emit, on, setActiveTab: requestTabSwitch });
    activeTabDestroy = typeof maybeDestroy === 'function' ? maybeDestroy : null;
    emit(RuntimeEvents.TAB_RENDERED, { id: active.id });
  } catch (error) {
    console.error(`Failed to render tab ${active.id}`, error);
    content.innerHTML = `<div class="tab-error"><h2>Could not load ${active.label}</h2><pre>${String(error?.message || error)}</pre></div>`;
  }
}

export async function init(root) {
  if (!root) throw new Error('App root is required');
  loadStickyState();
  const { nav, content } = createAppShell(root);
  const tabs = await visibleTabs();
  const persisted = readPersistedActiveTab(tabs);
  if (persisted) state.activeTabId = persisted;
  if (!state.activeTabId || !tabs.some((tab) => tab.id === state.activeTabId)) state.activeTabId = tabs[0]?.id || STANDALONE_APP.defaultTab;
  renderNav(nav, tabs, content);
  hideStartupOverlay();
  initDevDebugWindow();
  const offChanged = on(RuntimeEvents.TAB_CHANGED, (payload = {}) => {
    const tabId = normalizeTabId(payload?.tabId || payload?.id);
    if (tabId && tabs.some((tab) => tab.id === tabId)) state.activeTabId = tabId;
    renderActiveTab(content, nav, tabs);
  });
  const offRequested = on(RuntimeEvents.TAB_CHANGE_REQUESTED, (payload = {}) => requestTabSwitch(payload?.tabId || payload?.id));
  const onWindowSwitch = (event) => requestTabSwitch(event?.detail?.tabId || event?.detail?.id);
  window.addEventListener('app:switch-tab', onWindowSwitch);
  appDestroy = () => {
    offChanged?.();
    offRequested?.();
    window.removeEventListener('app:switch-tab', onWindowSwitch);
    cleanupActiveTab();
  };
  await renderActiveTab(content, nav, tabs);
}

export function destroy() {
  appDestroy?.();
  appDestroy = null;
}
