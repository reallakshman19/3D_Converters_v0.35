/**
 * conversion-config-store.js
 * Runtime + localStorage-backed configuration store for interchange conversions.
 */

import {
  CONVERSION_CONFIG_VERSION,
  DEFAULT_CONVERSION_CONFIG,
  mergeConversionConfig,
  validateConversionConfig,
  normalizeConversionConfig,
} from './conversion-config.js';
import { emit } from '../../core/event-bus.js';
import { RuntimeEvents } from '../../contracts/runtime-events.js';
import { publishDiagnostic, DiagnosticsHub } from '../../diagnostics/diagnostics-hub.js';

export const CONVERSION_CONFIG_STORAGE_KEY = 'interchange.conversionConfig.v1';
const listeners = new Set();

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

function readStoredEnvelope() {
  const storage = getLocalStorage();
  if (!storage) return null;
  const raw = storage.getItem(CONVERSION_CONFIG_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    if (parsed.config && isPlainObject(parsed.config)) return parsed;
    return { version: parsed.profile?.schemaVersion || 'unknown', config: parsed };
  } catch (error) {
    return null;
  }
}

function writeStoredEnvelope(config, source = 'runtime') {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(CONVERSION_CONFIG_STORAGE_KEY, JSON.stringify({
    version: CONVERSION_CONFIG_VERSION,
    source,
    savedAt: new Date().toISOString(),
    config,
  }));
}

function clearStoredConfig() {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(CONVERSION_CONFIG_STORAGE_KEY);
}

function publishStoreEvent(type, payload) {
  const event = { type, timestamp: Date.now(), ...payload };
  for (const listener of listeners) {
    try { listener(event); } catch {}
  }
  try {
    emit(type, event);
  } catch {}
  try {
    DiagnosticsHub.captureSnapshot(type, event);
  } catch {}
  return event;
}

function pushDiagnostic(kind, message, payload = {}) {
  try {
    publishDiagnostic({ severity: kind, category: 'interchange', code: 'CONVERSION_CONFIG', message, payload });
  } catch {}
}

let runtimeConfig = mergeConversionConfig(DEFAULT_CONVERSION_CONFIG, null);
let runtimeMeta = {
  loadedFromStorage: false,
  source: 'default',
  version: CONVERSION_CONFIG_VERSION,
  validation: validateConversionConfig(runtimeConfig),
};

export function subscribeConversionConfig(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConversionConfig() {
  return cloneJson(runtimeConfig);
}

export function getConversionConfigMeta() {
  return cloneJson(runtimeMeta);
}

export function loadConversionConfig() {
  const storedEnvelope = readStoredEnvelope();
  if (!storedEnvelope?.config) {
    runtimeConfig = mergeConversionConfig(DEFAULT_CONVERSION_CONFIG, null);
    runtimeMeta = {
      loadedFromStorage: false,
      source: 'default',
      version: CONVERSION_CONFIG_VERSION,
      validation: validateConversionConfig(runtimeConfig),
    };
    publishStoreEvent(RuntimeEvents.CONVERSION_CONFIG_LOADED, { source: 'default', config: getConversionConfig(), meta: getConversionConfigMeta() });
    return { config: getConversionConfig(), loadedFromStorage: false, validation: runtimeMeta.validation };
  }

  const normalized = normalizeConversionConfig(storedEnvelope.config);
  if (!normalized.validation.ok) {
    runtimeConfig = mergeConversionConfig(DEFAULT_CONVERSION_CONFIG, null);
    runtimeMeta = {
      loadedFromStorage: false,
      source: 'storage-invalid-reset',
      version: CONVERSION_CONFIG_VERSION,
      previousVersion: storedEnvelope.version || 'unknown',
      validation: normalized.validation,
    };
    clearStoredConfig();
    pushDiagnostic('warning', 'Stored conversion config was invalid and has been reset.', { validation: normalized.validation });
    publishStoreEvent(RuntimeEvents.CONVERSION_CONFIG_ERROR, { source: 'storage', validation: normalized.validation });
    return { config: getConversionConfig(), loadedFromStorage: false, validation: normalized.validation };
  }

  runtimeConfig = normalized.config;
  runtimeMeta = {
    loadedFromStorage: true,
    source: storedEnvelope.source || 'localStorage',
    version: storedEnvelope.version || runtimeConfig.profile?.schemaVersion || 'unknown',
    migrated: (storedEnvelope.version || '') !== CONVERSION_CONFIG_VERSION,
    validation: normalized.validation,
  };
  if (runtimeMeta.migrated) {
    pushDiagnostic('info', 'Stored conversion config version differs from runtime default; merged using latest defaults.', {
      storedVersion: storedEnvelope.version,
      runtimeVersion: CONVERSION_CONFIG_VERSION,
    });
  }
  publishStoreEvent(RuntimeEvents.CONVERSION_CONFIG_LOADED, { source: runtimeMeta.source, config: getConversionConfig(), meta: getConversionConfigMeta() });
  return { config: getConversionConfig(), loadedFromStorage: true, validation: normalized.validation };
}

export function setConversionConfig(patch, source = 'tab-apply') {
  if (!isPlainObject(patch)) {
    throw new Error('setConversionConfig expects a patch object.');
  }

  const next = mergeConversionConfig(runtimeConfig, patch);
  const validation = validateConversionConfig(next);
  if (!validation.ok) {
    publishStoreEvent(RuntimeEvents.CONVERSION_CONFIG_ERROR, { source, validation, patch });
    throw new Error(`Invalid conversion config: ${validation.errors.join(' ')}`);
  }

  runtimeConfig = next;
  runtimeMeta = {
    loadedFromStorage: true,
    source,
    version: CONVERSION_CONFIG_VERSION,
    validation,
  };
  writeStoredEnvelope(runtimeConfig, source);
  pushDiagnostic('info', 'Conversion config updated.', { source });
  publishStoreEvent(RuntimeEvents.CONVERSION_CONFIG_CHANGED, { source, config: getConversionConfig(), meta: getConversionConfigMeta() });
  return {
    config: getConversionConfig(),
    validation,
  };
}

export function replaceConversionConfig(config, source = 'tab-replace') {
  if (!isPlainObject(config)) {
    throw new Error('replaceConversionConfig expects a config object.');
  }

  const normalized = normalizeConversionConfig(config);
  if (!normalized.validation.ok) {
    publishStoreEvent(RuntimeEvents.CONVERSION_CONFIG_ERROR, { source, validation: normalized.validation, config });
    throw new Error(`Invalid conversion config: ${normalized.validation.errors.join(' ')}`);
  }

  runtimeConfig = normalized.config;
  runtimeMeta = {
    loadedFromStorage: true,
    source,
    version: CONVERSION_CONFIG_VERSION,
    validation: normalized.validation,
  };
  writeStoredEnvelope(runtimeConfig, source);
  pushDiagnostic('info', 'Conversion config replaced.', { source });
  publishStoreEvent(RuntimeEvents.CONVERSION_CONFIG_CHANGED, { source, config: getConversionConfig(), meta: getConversionConfigMeta() });
  return {
    config: getConversionConfig(),
    validation: normalized.validation,
  };
}

export function resetConversionConfig() {
  runtimeConfig = mergeConversionConfig(DEFAULT_CONVERSION_CONFIG, null);
  runtimeMeta = {
    loadedFromStorage: false,
    source: 'reset',
    version: CONVERSION_CONFIG_VERSION,
    validation: validateConversionConfig(runtimeConfig),
  };
  writeStoredEnvelope(runtimeConfig, 'reset');
  pushDiagnostic('info', 'Conversion config reset to defaults.');
  publishStoreEvent(RuntimeEvents.CONVERSION_CONFIG_RESET, { source: 'reset', config: getConversionConfig(), meta: getConversionConfigMeta() });
  return {
    config: getConversionConfig(),
    validation: runtimeMeta.validation,
  };
}
