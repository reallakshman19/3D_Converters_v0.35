const FLAG = '__xmlCiiWorkflowMasterSession_v2';
const CONFIG_SELECTOR = '[data-option-key="supportConfigJson"]';

const MASTER_PATHS = Object.freeze([
  Object.freeze({ name: 'linelist', section: 'linelist', rows: 'masterRows', fieldMap: 'fieldMap' }),
  Object.freeze({ name: 'pipingClass', section: 'pipingClass', rows: 'masterRows', fieldMap: 'fieldMap' }),
  Object.freeze({ name: 'material', section: 'material', rows: 'mapRows', fieldMap: 'fieldMap' }),
  Object.freeze({ name: 'weight', section: 'weight', rows: 'masterRows', fieldMap: 'fieldMap' }),
]);

const CLEAR_SELECTOR = '[data-xml-cii-clear-master], [data-native-clear-master]';
const MASTER_ACTION_SELECTOR = [
  CLEAR_SELECTOR,
  '[data-xml-cii-save-master]',
  '[data-native-save-master]',
  '[data-xml-cii-auto-map]',
  '[data-native-auto-map]',
  '[data-xml-cii-dynamic-map]',
  '[data-native-build-preview]',
  '[data-native-dry-run]',
  '[data-native-compute-weights]',
  '[data-native-save-config]',
  '[data-native-finalise-run]',
  '[data-native-review-weights]',
].join(', ');

function ready() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function configInput() {
  return document.querySelector(CONFIG_SELECTOR);
}

function state() {
  return window[FLAG];
}

function sectionFor(config, def) {
  return isPlainObject(config?.[def.section]) ? config[def.section] : {};
}

function rowsFor(config, def) {
  const rows = sectionFor(config, def)[def.rows];
  return Array.isArray(rows) ? rows : [];
}

function fieldMapFor(config, def) {
  const fieldMap = sectionFor(config, def)[def.fieldMap];
  return isPlainObject(fieldMap) ? fieldMap : {};
}

function masterCounts(config) {
  const out = {};
  for (const def of MASTER_PATHS) out[def.name] = rowsFor(config, def).length;
  return out;
}

function visibleImportMasterCounts() {
  const out = {};
  document.querySelectorAll('[data-native-master-tab], [data-xml-cii-master-tab]').forEach((button) => {
    const key = button.getAttribute('data-native-master-tab') || button.getAttribute('data-xml-cii-master-tab') || '';
    if (!key || key === 'overrides') return;
    const raw = button.textContent || '';
    const match = raw.match(/([\d,]+)\s+row\(s\)/i);
    out[key] = match ? Number(match[1].replace(/,/g, '')) : 0;
  });
  return out;
}

function writeInput(input, config) {
  const next = JSON.stringify(config, null, 2);
  if (!input || input.value === next) return false;
  const st = state();
  input.value = next;
  st.writing = true;
  try {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    st.writing = false;
  }
  return true;
}

function currentMasterNameFromAction(element) {
  return element?.getAttribute?.('data-xml-cii-clear-master')
    || element?.getAttribute?.('data-native-clear-master')
    || element?.getAttribute?.('data-xml-cii-save-master')
    || element?.getAttribute?.('data-native-save-master')
    || element?.getAttribute?.('data-xml-cii-auto-map')
    || element?.getAttribute?.('data-native-auto-map')
    || element?.getAttribute?.('data-xml-cii-dynamic-map')
    || '';
}

function activeSourceFromAction(element) {
  if (element?.matches?.('[data-native-compute-weights]')) return '4A Weight Match: hydrated session supportConfigJson';
  if (element?.matches?.('[data-native-build-preview]')) return 'Preview: hydrated session supportConfigJson';
  if (element?.matches?.('[data-native-dry-run]')) return 'Diagnostics: hydrated session supportConfigJson';
  if (element?.matches?.('[data-native-finalise-run], [data-native-review-weights]')) return 'Run: hydrated session supportConfigJson';
  return 'XML->CII workflow: hydrated session supportConfigJson';
}

function rememberNonEmptyMasters(config) {
  const st = state();
  if (!isPlainObject(config)) return;

  for (const def of MASTER_PATHS) {
    const section = sectionFor(config, def);
    const rows = rowsFor(config, def);
    if (!rows.length) continue;
    st.lastGood[def.name] = clone(section);
    st.explicitlyCleared.delete(def.name);
  }
}

function markExplicitClear(masterName) {
  if (!masterName) return;
  const st = state();
  st.explicitlyCleared.add(masterName);
  delete st.lastGood[masterName];
}

function preserveMasterRows(config, reason) {
  const st = state();
  if (!isPlainObject(config)) return { config, changed: false, prevented: [] };

  rememberNonEmptyMasters(config);

  let changed = false;
  const prevented = [];
  for (const def of MASTER_PATHS) {
    const currentRows = rowsFor(config, def);
    if (currentRows.length || st.explicitlyCleared.has(def.name)) continue;

    const cachedSection = st.lastGood[def.name];
    const cachedRows = Array.isArray(cachedSection?.[def.rows]) ? cachedSection[def.rows] : [];
    if (!cachedRows.length) continue;

    const currentSection = sectionFor(config, def);
    const nextSection = {
      ...clone(cachedSection),
      ...currentSection,
      [def.rows]: clone(cachedRows),
    };
    if (!isPlainObject(nextSection[def.fieldMap]) && isPlainObject(cachedSection[def.fieldMap])) {
      nextSection[def.fieldMap] = clone(cachedSection[def.fieldMap]);
    }
    config[def.section] = nextSection;
    prevented.push({ section: def.name, rows: cachedRows.length, reason });
    changed = true;
  }

  if (changed) rememberNonEmptyMasters(config);
  return { config, changed, prevented };
}

function mergeSessionIntoIncoming(incoming) {
  const st = state();
  if (!isPlainObject(st.sessionConfig)) return incoming;
  if (!isPlainObject(incoming)) return clone(st.sessionConfig);

  const merged = { ...clone(st.sessionConfig), ...incoming };
  for (const def of MASTER_PATHS) {
    const sessionSection = sectionFor(st.sessionConfig, def);
    const incomingSection = sectionFor(incoming, def);
    if (!Object.keys(sessionSection).length && !Object.keys(incomingSection).length) continue;
    merged[def.section] = { ...clone(sessionSection), ...incomingSection };
  }
  return merged;
}

export function xmlCiiGetHydratedWorkflowConfig(reason = 'read') {
  if (!ready() || !window[FLAG]) return null;
  const input = configInput();
  const inputConfig = parseJson(input?.value);
  const st = state();
  const beforeCounts = masterCounts(inputConfig || {});
  const merged = mergeSessionIntoIncoming(inputConfig);
  const result = preserveMasterRows(merged, reason);
  const config = result.config || {};

  st.sessionConfig = clone(config);
  const wroteInput = input ? writeInput(input, config) : false;
  const afterCounts = masterCounts(config);
  publishDebug({
    reason,
    source: st.activeSource || 'XML->CII workflow: hydrated session supportConfigJson',
    supportConfigJsonCountsBefore: beforeCounts,
    supportConfigJsonCountsAfter: afterCounts,
    sessionConfigCounts: masterCounts(st.sessionConfig || {}),
    lastGoodCounts: Object.fromEntries(MASTER_PATHS.map((def) => [def.name, rowsFor({ [def.section]: st.lastGood[def.name] || {} }, def).length])),
    visibleImportMasterCounts: visibleImportMasterCounts(),
    explicitlyCleared: Array.from(st.explicitlyCleared),
    preventedEmptyMasterWrites: result.prevented,
    wroteInput,
  });
  return config;
}

function publishDebug(debug) {
  const st = state();
  st.debug = {
    at: new Date().toISOString(),
    ...debug,
  };
  window.__xmlCiiMasterLifecycleDebug = st.debug;
  const devMode = /(?:^|[?&])xmlCiiDebug=1(?:&|$)/.test(window.location?.search || '')
    || ['localhost', '127.0.0.1'].includes(window.location?.hostname || '');
  if (devMode && (debug.preventedEmptyMasterWrites?.length || debug.source.includes('4A'))) {
    console.debug('[XML->CII master lifecycle]', st.debug);
  }
}

function hydrateAroundAction(event, phase) {
  const action = event.target?.closest?.(MASTER_ACTION_SELECTOR);
  if (!action) return;
  const clearButton = action.closest?.(CLEAR_SELECTOR);
  if (phase === 'before' && clearButton) markExplicitClear(currentMasterNameFromAction(clearButton));
  const st = state();
  st.activeSource = activeSourceFromAction(action);
  xmlCiiGetHydratedWorkflowConfig(`${phase}: ${currentMasterNameFromAction(action) || action.getAttribute?.('data-native-compute-weights') || action.getAttribute?.('data-native-build-preview') || action.tagName || 'workflow action'}`);
}

export function installXmlCiiMasterPreservePatch() {
  if (!ready()) return;
  if (window[FLAG]) return;
  window[FLAG] = {
    sessionConfig: null,
    lastGood: {},
    explicitlyCleared: new Set(),
    writing: false,
    activeSource: '',
    debug: null,
  };

  xmlCiiGetHydratedWorkflowConfig('install');

  document.addEventListener('click', (event) => hydrateAroundAction(event, 'before'), true);
  document.addEventListener('click', (event) => hydrateAroundAction(event, 'after'), false);

  document.addEventListener('input', (event) => {
    if (!event.target?.matches?.(CONFIG_SELECTOR) || state().writing) return;
    xmlCiiGetHydratedWorkflowConfig('supportConfigJson input');
  }, true);

  document.addEventListener('change', (event) => {
    if (!event.target?.matches?.(CONFIG_SELECTOR) || state().writing) return;
    xmlCiiGetHydratedWorkflowConfig('supportConfigJson change');
  }, true);
}
