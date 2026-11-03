import { RuntimeEvents } from '../contracts/runtime-events.js';
import { on } from './event-bus.js';
import { state } from './state.js';

const BRIDGE_VERSION = '20260622-tab-click-state-1';
let installed = false;
let offTabChanged = null;

function normalizeTabId(value) {
  const text = String(value || '').trim();
  return text || null;
}

export function installAppTabClickStateBridge() {
  if (installed) return { version: BRIDGE_VERSION, installed: true, alreadyInstalled: true };
  installed = true;

  offTabChanged = on(RuntimeEvents.TAB_CHANGED, (payload = {}) => {
    const tabId = normalizeTabId(payload?.tabId || payload?.id);
    if (!tabId) return;
    state.activeTabId = tabId;
  });

  return { version: BRIDGE_VERSION, installed: true };
}

export function uninstallAppTabClickStateBridge() {
  try { offTabChanged?.(); } catch {}
  offTabChanged = null;
  installed = false;
}

if (typeof globalThis !== 'undefined') {
  globalThis.__PCF_GLB_APP_TAB_CLICK_STATE_BRIDGE__ = {
    version: BRIDGE_VERSION,
    install: installAppTabClickStateBridge,
    uninstall: uninstallAppTabClickStateBridge
  };
}
