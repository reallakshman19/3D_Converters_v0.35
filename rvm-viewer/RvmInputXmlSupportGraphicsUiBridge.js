import { applyInputXmlSupportGraphicsOverlay } from './RvmInputXmlSupportGraphics.js?v=20260619-source-bend-collapse-1';
import { refreshInputXmlGraphics } from './RvmInputXmlAutoBendGraphics.js?v=20260619-source-bend-collapse-1';
import { readSourceAxisTransformSettings, writeSourceAxisTransformSettings } from '../overlays/source-tools/SourceAxisTransform.js';

export const RVM_INPUTXML_SOURCE_TOOLS_SCHEMA = 'rvm-inputxml-source-tools-bridge/v2';

const INPUTXML_SCALE_DEFAULT = 0.75;
const INPUTXML_AUTO_BEND_KEY = 'rvm.inputxml.autoBend';
const INPUTXML_SUPPORT_SYMBOLS_KEY = 'rvm.inputxml.supportSymbols';
const INPUTXML_LABELS_KEY = 'rvm.inputxml.supportLabels';
const INPUTXML_SCALE_KEY = 'rvm.inputxml.supportScale';
const GLOBAL_API = '__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__';
const SOURCE_TOOLS_PANEL_SELECTOR = '#rvm-nonprimitive-source-tools-panel';

function findViewer() {
  return window.__rvmInputXmlSupportGraphicsViewer || window.__3D_RVM_VIEWER__ || null;
}

function root() {
  return document.querySelector('[data-rvm-viewer]');
}

function readBool(key, fallback = true) {
  try {
    const value = localStorage.getItem(key);
    if (value === 'on') return true;
    if (value === 'off') return false;
  } catch (_) {}
  return fallback;
}

function writeBool(key, value) {
  try { localStorage.setItem(key, value ? 'on' : 'off'); } catch (_) {}
}

function readStoredScale() {
  try {
    const value = Number(localStorage.getItem(INPUTXML_SCALE_KEY));
    if (Number.isFinite(value)) return normalizeScale(value);
  } catch (_) {}
  return INPUTXML_SCALE_DEFAULT;
}

function writeStoredScale(value) {
  try { localStorage.setItem(INPUTXML_SCALE_KEY, String(normalizeScale(value))); } catch (_) {}
}

function normalizeScale(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0.25, Math.min(1.5, number)) : INPUTXML_SCALE_DEFAULT;
}

export function readInputXmlSourceToolOptions() {
  const r = root();
  const scaleEl = r?.querySelector?.('#rvm-inputxml-support-scale, #rvm-support-scale');
  const labelsEl = r?.querySelector?.('#rvm-inputxml-support-labels, #rvm-support-labels');
  const autoEl = r?.querySelector?.('#rvm-inputxml-auto-bend');
  const symbolsEl = r?.querySelector?.('#rvm-inputxml-support-symbols');
  const scale = scaleEl ? normalizeScale(scaleEl.value) : readStoredScale();
  const labelsVisible = labelsEl
    ? (labelsEl.checked === true || labelsEl.getAttribute?.('aria-pressed') === 'true')
    : readBool(INPUTXML_LABELS_KEY, false);
  return {
    schema: RVM_INPUTXML_SOURCE_TOOLS_SCHEMA,
    scaleMultiplier: scale,
    labelsVisible,
    autoBendEnabled: autoEl ? autoEl.checked !== false : readBool(INPUTXML_AUTO_BEND_KEY, true),
    supportSymbolsEnabled: symbolsEl ? symbolsEl.checked === true : readBool(INPUTXML_SUPPORT_SYMBOLS_KEY, false),
    axisTransform: readSourceAxisTransformSettings(),
  };
}

export function persistInputXmlSourceToolOption(name, value) {
  if (name === 'autoBendEnabled') writeBool(INPUTXML_AUTO_BEND_KEY, !!value);
  if (name === 'supportSymbolsEnabled') writeBool(INPUTXML_SUPPORT_SYMBOLS_KEY, !!value);
  if (name === 'labelsVisible') writeBool(INPUTXML_LABELS_KEY, !!value);
  if (name === 'scaleMultiplier') writeStoredScale(value);
  if (name === 'verticalAxis') writeSourceAxisTransformSettings({ verticalAxis: value });
  if (name === 'northAxis') writeSourceAxisTransformSettings({ northAxis: value });
}

export function refreshInputXmlAutoBendOnly(viewer = findViewer(), overrides = {}) {
  if (!viewer) return { status: 'skipped', reason: 'viewer-missing', system: 'inputxml-auto-bend' };
  const options = { ...readInputXmlSourceToolOptions(), ...overrides, supportSymbolsEnabled: false };
  refreshInputXmlGraphics(viewer, options);
  return { status: 'applied', system: 'inputxml-auto-bend', autoBendEnabled: options.autoBendEnabled };
}

export function refreshInputXmlSupportOverlayOnly(viewer = findViewer(), overrides = {}) {
  if (!viewer) return { status: 'skipped', reason: 'viewer-missing', system: 'inputxml-support-overlay' };
  const options = { ...readInputXmlSourceToolOptions(), ...overrides, autoBendEnabled: false };
  applyInputXmlSupportGraphicsOverlay(viewer, options);
  return { status: 'applied', system: 'inputxml-support-overlay', supportSymbolsEnabled: options.supportSymbolsEnabled };
}

export function refreshInputXmlSourceTools(viewer = findViewer(), overrides = {}) {
  if (!viewer) return { status: 'skipped', reason: 'viewer-missing', system: 'inputxml-source-tools' };
  const options = { ...readInputXmlSourceToolOptions(), ...overrides };
  refreshInputXmlGraphics(viewer, options);
  applyInputXmlSupportGraphicsOverlay(viewer, options);
  return {
    status: 'applied',
    system: 'inputxml-source-tools',
    autoBendEnabled: options.autoBendEnabled,
    supportSymbolsEnabled: options.supportSymbolsEnabled,
  };
}

function publishApi() {
  window[GLOBAL_API] = {
    schema: RVM_INPUTXML_SOURCE_TOOLS_SCHEMA,
    optionsFromUi: readInputXmlSourceToolOptions,
    persist: persistInputXmlSourceToolOption,
    refresh: refreshInputXmlSourceTools,
    refreshAutoBendOnly: refreshInputXmlAutoBendOnly,
    refreshSupportOverlayOnly: refreshInputXmlSupportOverlayOnly,
  };
}

function updateStatus(text) {
  const el = root()?.querySelector?.('[data-rvm-inputxml-transform-status]');
  if (el) el.textContent = text || 'Ready';
}

function handleLegacyControlEvent(event) {
  if (event.target?.closest?.(SOURCE_TOOLS_PANEL_SELECTOR)) return;
  const id = event.target?.id || '';
  if (id === 'rvm-inputxml-auto-bend') {
    persistInputXmlSourceToolOption('autoBendEnabled', event.target.checked);
    refreshInputXmlAutoBendOnly();
    updateStatus('Auto Bend applied');
  } else if (id === 'rvm-inputxml-support-symbols') {
    persistInputXmlSourceToolOption('supportSymbolsEnabled', event.target.checked);
    refreshInputXmlSupportOverlayOnly();
    updateStatus('Support symbols applied');
  } else if (id === 'rvm-inputxml-support-labels' || id === 'rvm-support-labels') {
    persistInputXmlSourceToolOption('labelsVisible', event.target.checked === true || event.target.getAttribute?.('aria-pressed') === 'true');
    refreshInputXmlSupportOverlayOnly();
    updateStatus('Support labels applied');
  } else if (id === 'rvm-inputxml-support-scale' || id === 'rvm-support-scale') {
    persistInputXmlSourceToolOption('scaleMultiplier', event.target.value);
    refreshInputXmlSupportOverlayOnly();
    updateStatus('Support scale applied');
  } else if (id === 'rvm-inputxml-vertical-axis') {
    persistInputXmlSourceToolOption('verticalAxis', event.target.value);
    updateStatus('Axis pending');
  } else if (id === 'rvm-inputxml-north-axis') {
    persistInputXmlSourceToolOption('northAxis', event.target.value);
    updateStatus('Axis pending');
  }
}

publishApi();
document.addEventListener('input', handleLegacyControlEvent, true);
document.addEventListener('change', handleLegacyControlEvent, true);
document.addEventListener('click', (event) => {
  if (event.target?.closest?.(SOURCE_TOOLS_PANEL_SELECTOR)) return;
  if (event.target?.closest?.('#rvm-inputxml-apply-transform')) {
    event.preventDefault();
    refreshInputXmlSourceTools();
    updateStatus('Applied');
  }
}, true);
