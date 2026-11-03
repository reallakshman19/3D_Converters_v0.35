import { xmlCiiRichWorkflowGetBridge } from './xml-cii-rich-workflow-bridge.js?v=20260624-simple-rich-isolation-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-xml-cii-condense-rigid-ui-bridge-v6');
const VERSION = '20260624-simple-rich-isolation-1';

const XSD_KEY = 'condenseRigidXsd';
const XSD_SNAKE_KEY = 'condense_rigid_xsd';
const RESOLVED_KEY = 'splitCondensedValveFlange';
const RESOLVED_SNAKE_KEY = 'split_condensed_valve_flange';

function browserReady() {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

function bool(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'number') return value !== 0;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function parseConfigText(text) {
  try {
    const parsed = JSON.parse(String(text || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function bridge() {
  return xmlCiiRichWorkflowGetBridge();
}

function bridgeConfig(activeBridge = bridge()) {
  return parseConfigText(activeBridge?.exportPopupConfigText?.() || '{}');
}

function importConfig(activeBridge, config) {
  try {
    activeBridge?.importPopupConfigText?.(JSON.stringify(config || {}, null, 2));
    return true;
  } catch (error) {
    console.warn('[XML CII Condense Rigid] config sync failed', error);
    return false;
  }
}

function normaliseConfig(config) {
  const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const xsd = bool(cfg[XSD_KEY]) || bool(cfg[XSD_SNAKE_KEY]);
  const resolved = bool(cfg[RESOLVED_KEY]) || bool(cfg[RESOLVED_SNAKE_KEY]);
  cfg[XSD_KEY] = xsd;
  cfg[XSD_SNAKE_KEY] = xsd;
  cfg[RESOLVED_KEY] = resolved;
  cfg[RESOLVED_SNAKE_KEY] = resolved;
  return cfg;
}

function writeRunOptionToConfig(activeBridge, key, enabled) {
  const cfg = normaliseConfig(bridgeConfig(activeBridge));
  if (key === XSD_KEY || key === XSD_SNAKE_KEY) {
    cfg[XSD_KEY] = !!enabled;
    cfg[XSD_SNAKE_KEY] = !!enabled;
  }
  if (key === RESOLVED_KEY || key === RESOLVED_SNAKE_KEY) {
    cfg[RESOLVED_KEY] = !!enabled;
    cfg[RESOLVED_SNAKE_KEY] = !!enabled;
  }
  importConfig(activeBridge, cfg);
}

function mergeBoolKeysIntoConfigText(editedText, bools = {}) {
  const cfg = normaliseConfig(parseConfigText(editedText));
  if (Object.prototype.hasOwnProperty.call(bools, XSD_KEY) || Object.prototype.hasOwnProperty.call(bools, XSD_SNAKE_KEY)) {
    const enabled = bool(bools[XSD_KEY]) || bool(bools[XSD_SNAKE_KEY]);
    cfg[XSD_KEY] = enabled;
    cfg[XSD_SNAKE_KEY] = enabled;
  }
  if (Object.prototype.hasOwnProperty.call(bools, RESOLVED_KEY) || Object.prototype.hasOwnProperty.call(bools, RESOLVED_SNAKE_KEY)) {
    const enabled = bool(bools[RESOLVED_KEY]) || bool(bools[RESOLVED_SNAKE_KEY]);
    cfg[RESOLVED_KEY] = enabled;
    cfg[RESOLVED_SNAKE_KEY] = enabled;
  }
  return JSON.stringify(cfg, null, 2);
}

function hydrateSnapshot(snapshot, activeBridge) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const cfg = normaliseConfig(bridgeConfig(activeBridge));
  snapshot.run = snapshot.run && typeof snapshot.run === 'object' ? snapshot.run : {};
  snapshot.run.options = snapshot.run.options && typeof snapshot.run.options === 'object' ? snapshot.run.options : {};
  snapshot.run.options[XSD_KEY] = bool(snapshot.run.options[XSD_KEY]) || cfg[XSD_KEY];
  snapshot.run.options[RESOLVED_KEY] = bool(snapshot.run.options[RESOLVED_KEY]) || bool(snapshot.run.options[RESOLVED_SNAKE_KEY]) || cfg[RESOLVED_KEY];
  snapshot.config = snapshot.config && typeof snapshot.config === 'object' ? snapshot.config : {};
  snapshot.config[XSD_KEY] = cfg[XSD_KEY];
  snapshot.config[RESOLVED_KEY] = cfg[RESOLVED_KEY];
  return snapshot;
}

function wrapBridge(activeBridge = bridge()) {
  if (!activeBridge || activeBridge.__xmlCiiCondenseRigidUiWrapped === VERSION) return activeBridge || null;
  const originalGetPopupSnapshot = typeof activeBridge.getPopupSnapshot === 'function' ? activeBridge.getPopupSnapshot.bind(activeBridge) : null;
  const originalSetPopupRunOption = typeof activeBridge.setPopupRunOption === 'function' ? activeBridge.setPopupRunOption.bind(activeBridge) : null;
  const originalSavePopupConfigText = typeof activeBridge.savePopupConfigText === 'function' ? activeBridge.savePopupConfigText.bind(activeBridge) : null;

  if (originalGetPopupSnapshot) {
    activeBridge.getPopupSnapshot = (target) => hydrateSnapshot(originalGetPopupSnapshot(target), activeBridge);
  }

  if (originalSetPopupRunOption) {
    activeBridge.setPopupRunOption = (key, value, type) => {
      if (key === XSD_KEY || key === XSD_SNAKE_KEY || key === RESOLVED_KEY || key === RESOLVED_SNAKE_KEY) {
        writeRunOptionToConfig(activeBridge, key, !!value);
      }
      return originalSetPopupRunOption(key, value, type);
    };
  }

  if (originalSavePopupConfigText) {
    activeBridge.savePopupConfigText = (editedText, bools) => {
      const nextText = mergeBoolKeysIntoConfigText(editedText, bools || {});
      return originalSavePopupConfigText(nextText, bools);
    };
  }

  activeBridge.__xmlCiiCondenseRigidUiWrapped = VERSION;
  return activeBridge;
}

export function installXmlCiiCondenseRigidUiBridge(root = document) {
  if (!browserReady()) return null;
  if (window[INSTALL_FLAG]) return window[INSTALL_FLAG];
  const state = { version: VERSION, wrapBridge };
  window[INSTALL_FLAG] = state;

  const tick = () => wrapBridge();
  for (const delay of [0, 80, 250, 750, 1500, 3000]) setTimeout(tick, delay);
  tick();
  return state;
}
