/**
 * support-mapping-store.js
 * LocalStorage-backed store for support mapping configuration.
 */

import { emit } from '../../core/event-bus.js';
import { RuntimeEvents } from '../../contracts/runtime-events.js';
import {
  cloneDefaultSupportMappingConfig,
  normalizeSupportMappingConfig,
  validateSupportMappingConfig,
  SUPPORT_MAPPING_CONFIG_VERSION,
} from './support-mapping-config.js';

const STORAGE_KEY = 'interchange.supportMappingConfig.v1';
const listeners = new Set();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function readStored() {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }
  return null;
}

function writeStored(config, source) {
  const storage = getStorage();
  if (!storage) return;
  const payload = {
    version: SUPPORT_MAPPING_CONFIG_VERSION,
    source,
    savedAt: new Date().toISOString(),
    config,
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

let runtimeConfig = cloneDefaultSupportMappingConfig();
let runtimeMeta = {
  loadedFromStorage: false,
  source: 'default',
  version: SUPPORT_MAPPING_CONFIG_VERSION,
  validation: validateSupportMappingConfig(runtimeConfig),
};

function notify(type, payload) {
  for (const listener of listeners) {
    try { listener({ type, ...payload }); } catch {}
  }
  try {
    emit(type, payload);
  } catch {}
}

export function subscribeSupportMappingConfig(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSupportMappingConfig() {
  return cloneJson(runtimeConfig);
}

export function getSupportMappingConfigMeta() {
  return cloneJson(runtimeMeta);
}

export function loadSupportMappingConfig() {
  const stored = readStored();
  if (!stored?.config) {
    runtimeConfig = cloneDefaultSupportMappingConfig();
    runtimeMeta = {
      loadedFromStorage: false,
      source: 'default',
      version: SUPPORT_MAPPING_CONFIG_VERSION,
      validation: validateSupportMappingConfig(runtimeConfig),
    };
    notify(RuntimeEvents.SUPPORT_MAPPING_CONFIG_LOADED, { source: 'default', config: getSupportMappingConfig() });
    return { config: getSupportMappingConfig(), loadedFromStorage: false };
  }

  const normalized = normalizeSupportMappingConfig(stored.config);
  if (!normalized.validation.ok) {
    runtimeConfig = cloneDefaultSupportMappingConfig();
    runtimeMeta = {
      loadedFromStorage: false,
      source: 'storage-invalid-reset',
      version: SUPPORT_MAPPING_CONFIG_VERSION,
      validation: normalized.validation,
    };
    writeStored(runtimeConfig, 'storage-invalid-reset');
    notify(RuntimeEvents.SUPPORT_MAPPING_CONFIG_ERROR, { validation: normalized.validation });
    return { config: getSupportMappingConfig(), loadedFromStorage: false };
  }

  runtimeConfig = normalized.config;
  runtimeMeta = {
    loadedFromStorage: true,
    source: stored.source || 'localStorage',
    version: stored.version || SUPPORT_MAPPING_CONFIG_VERSION,
    validation: normalized.validation,
  };
  notify(RuntimeEvents.SUPPORT_MAPPING_CONFIG_LOADED, { source: runtimeMeta.source, config: getSupportMappingConfig() });
  return { config: getSupportMappingConfig(), loadedFromStorage: true };
}

export function replaceSupportMappingConfig(config, source = 'support-config-tab') {
  const normalized = normalizeSupportMappingConfig(config);
  if (!normalized.validation.ok) {
    notify(RuntimeEvents.SUPPORT_MAPPING_CONFIG_ERROR, { source, validation: normalized.validation });
    throw new Error(`Invalid support mapping config: ${normalized.validation.errors.join(' ')}`);
  }
  runtimeConfig = normalized.config;
  runtimeMeta = {
    loadedFromStorage: true,
    source,
    version: SUPPORT_MAPPING_CONFIG_VERSION,
    validation: normalized.validation,
  };
  writeStored(runtimeConfig, source);
  notify(RuntimeEvents.SUPPORT_MAPPING_CONFIG_CHANGED, { source, config: getSupportMappingConfig() });
  notify(RuntimeEvents.SUPPORT_MAPPING_CHANGED, { source, config: getSupportMappingConfig() });
  return { config: getSupportMappingConfig(), validation: normalized.validation };
}

export function resetSupportMappingConfig() {
  runtimeConfig = cloneDefaultSupportMappingConfig();
  runtimeMeta = {
    loadedFromStorage: false,
    source: 'reset',
    version: SUPPORT_MAPPING_CONFIG_VERSION,
    validation: validateSupportMappingConfig(runtimeConfig),
  };
  writeStored(runtimeConfig, 'reset');
  notify(RuntimeEvents.SUPPORT_MAPPING_CONFIG_RESET, { source: 'reset', config: getSupportMappingConfig() });
  notify(RuntimeEvents.SUPPORT_MAPPING_CHANGED, { source: 'reset', config: getSupportMappingConfig() });
  return { config: getSupportMappingConfig(), validation: runtimeMeta.validation };
}
