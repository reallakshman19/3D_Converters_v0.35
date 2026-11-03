/**
 * dev-debug-window.js
 *
 * Localhost-only collapsible debug drawer.
 * Aggregates:
 * - core/logger logs
 * - core/logger trace events
 * - support-debug events
 * - selected event-bus events
 */

import {
  logs,
  traceEvents,
  clearLogs,
  clearTraceEvents,
  subscribe,
  subscribeTrace,
  SEVERITY,
} from '../core/logger.js';
import { on, off } from '../core/event-bus.js';
import {
  getSupportDebugState,
  clearSupportDebugLog,
  subscribeSupportDebug,
} from './support-debug.js';
import { getConversionConfig, getConversionConfigMeta } from '../interchange/config/conversion-config-store.js';

const STORAGE_KEY = 'dev-debug-window-state';
let _root = null;
let _body = null;
let _summary = null;
let _tabContent = null;
let _activeTab = 'logs';
let _isOpen = false;
let _unsubs = [];
let _busHandlers = [];
let _extraEvents = [];
let _selectedObject = null;
let _lastState = _loadState();

function _loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function _saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      open: _isOpen,
      activeTab: _activeTab,
    }));
  } catch {}
}

function _esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function _fmtTs(ts) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
}

function _sevCounts() {
  return {
    error: logs.filter(l => l.severity === SEVERITY.ERROR).length,
    warning: logs.filter(l => l.severity === SEVERITY.WARNING).length,
    info: logs.filter(l => l.severity === SEVERITY.INFO).length,
    trace: traceEvents.length,
  };
}

function _renderSummary() {
  if (!_summary) return;
  const c = _sevCounts();
  const s = getSupportDebugState().summary;
  const cfg = getConversionConfig();
  _summary.innerHTML = `
    <span class="devdbg-badge err" title="Errors">${c.error}</span>
    <span class="devdbg-badge warn" title="Warnings">${c.warning}</span>
    <span class="devdbg-badge info" title="Info">${c.info}</span>
    <span class="devdbg-badge trace" title="Trace">${c.trace}</span>
    <span class="devdbg-pill">XML ${s.xmlParse.total}</span>
    <span class="devdbg-pill">Built ${s.builder.built}</span>
    <span class="devdbg-pill">Guide ${s.builder.byKind?.GDE || 0}</span>
    <span class="devdbg-pill">Stop ${s.builder.byKind?.STP || 0}</span>
    <span class="devdbg-pill">Rendered ${s.render.totalInput || 0}</span>
    <span class="devdbg-pill">Cfg ${_esc(cfg.profile?.xmlProfile || 'n/a')}</span>
    <span class="devdbg-pill">Tol ${_esc(cfg.topology?.nodeMergeToleranceMm ?? 'n/a')}</span>
  `;
}

function _renderLogsTab() {
  const rows = logs.slice(-200).reverse().map(l => `
    <tr>
      <td>${_esc(_fmtTs(l.timestamp))}</td>
      <td>${_esc(l.severity)}</td>
      <td>${_esc(l.category)}</td>
      <td>${_esc(l.message)}</td>
    </tr>
  `).join('');

  return `
    <div class="devdbg-table-wrap">
      <table class="devdbg-table">
        <thead><tr><th>Time</th><th>Severity</th><th>Category</th><th>Message</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function _renderTraceTab() {
  const rows = traceEvents.slice(-200).reverse().map(t => `
    <tr>
      <td>${_esc(_fmtTs(t.ts))}</td>
      <td>${_esc(t.category)}</td>
      <td>${_esc(t.type)}</td>
      <td><pre>${_esc(JSON.stringify(t.payload ?? {}, null, 2))}</pre></td>
    </tr>
  `).join('');

  return `
    <div class="devdbg-table-wrap">
      <table class="devdbg-table">
        <thead><tr><th>Time</th><th>Category</th><th>Type</th><th>Payload</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function _renderSupportsTab() {
  const { summary, log } = getSupportDebugState();
  const rows = log.slice(-250).reverse().map(r => `
    <tr>
      <td>${_esc(_fmtTs(r.ts))}</td>
      <td>${_esc(r.stage)}</td>
      <td>${_esc(r.sourceId || '')}</td>
      <td>${_esc(r.nodeId || '')}</td>
      <td>${_esc(r.rawType || '')}</td>
      <td>${_esc(r.resolvedKind || r.supportKind || '')}</td>
      <td>${_esc(r.resolvedDirection || r.supportDirection || '')}</td>
      <td>${_esc(r.skipReason || r.dropReason || r.warning || '')}</td>
    </tr>
  `).join('');

  return `
    <div class="devdbg-support-summary">
      <pre>${_esc(JSON.stringify(summary, null, 2))}</pre>
    </div>
    <div class="devdbg-table-wrap">
      <table class="devdbg-table">
        <thead><tr><th>Time</th><th>Stage</th><th>Source</th><th>Node</th><th>Raw</th><th>Kind</th><th>Direction</th><th>Reason</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function _renderEventsTab() {
  const rows = _extraEvents.slice(-150).reverse().map(e => `
    <tr>
      <td>${_esc(_fmtTs(e.ts))}</td>
      <td>${_esc(e.name)}</td>
      <td><pre>${_esc(JSON.stringify(e.payload ?? {}, null, 2))}</pre></td>
    </tr>
  `).join('');

  return `
    <div class="devdbg-table-wrap">
      <table class="devdbg-table">
        <thead><tr><th>Time</th><th>Event</th><th>Payload</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function _renderConversionTab() {
  const html = {
    meta: getConversionConfigMeta(),
    config: getConversionConfig(),
    eventCount: _extraEvents.filter((evt) => String(evt.name || '').includes('conversion-config')).length,
  };
  return `<pre class="devdbg-json">${_esc(JSON.stringify(html, null, 2))}</pre>`;
}

function _renderSceneTab() {
  const supportSummary = getSupportDebugState().summary;
  const html = {
    selectedObject: _selectedObject,
    logCount: logs.length,
    traceCount: traceEvents.length,
    extraEventCount: _extraEvents.length,
    supportSummary,
  };
  return `<pre class="devdbg-json">${_esc(JSON.stringify(html, null, 2))}</pre>`;
}

function _renderActiveTab() {
  if (!_tabContent) return;
  if (_activeTab === 'logs') _tabContent.innerHTML = _renderLogsTab();
  else if (_activeTab === 'trace') _tabContent.innerHTML = _renderTraceTab();
  else if (_activeTab === 'supports') _tabContent.innerHTML = _renderSupportsTab();
  else if (_activeTab === 'events') _tabContent.innerHTML = _renderEventsTab();
  else if (_activeTab === 'conversion') _tabContent.innerHTML = _renderConversionTab();
  else _tabContent.innerHTML = _renderSceneTab();
}

function _render() {
  _renderSummary();
  _renderActiveTab();
}

function _captureEvent(name, payload) {
  _extraEvents.push({ ts: Date.now(), name, payload });
  if (_extraEvents.length > 1000) _extraEvents.splice(0, _extraEvents.length - 1000);
  _render();
}

function _bindEventBus() {
  const events = [
    'file-loaded',
    'parse-complete',
    'tab-changed',
    'viewer3d-config-changed',
    'model-loaded',
    'jump-to-object',
    'session-log',
    'model-exchange-imported',
    'model-exchange-exported',
    'conversion-config-changed',
    'conversion-config-reset',
    'conversion-config-loaded',
    'conversion-config-error',
    'model-converter-start',
    'model-converter-success',
    'model-converter-error',
  ];

  for (const evt of events) {
    const fn = (payload) => {
      if (evt === 'jump-to-object') _selectedObject = payload || null;
      _captureEvent(evt, payload);
    };
    on(evt, fn);
    _busHandlers.push({ evt, fn });
  }
}

function _unbindEventBus() {
  for (const { evt, fn } of _busHandlers) off(evt, fn);
  _busHandlers = [];
}

function _exportBundle() {
  const bundle = {
    exportedAt: new Date().toISOString(),
    logs,
    traceEvents,
    supportDebug: getSupportDebugState(),
    events: _extraEvents,
    selectedObject: _selectedObject,
    conversionConfig: getConversionConfig(),
    conversionMeta: getConversionConfigMeta(),
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dev-debug-bundle.json';
  a.click();
  URL.revokeObjectURL(url);
}

function _setOpen(open) {
  _isOpen = !!open;
  if (_root) _root.classList.toggle('open', _isOpen);
  _saveState();
}

export function initDevDebugWindow() {
  if (_root) return;
  if (!(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return;

  _activeTab = _lastState.activeTab || 'logs';
  // Always start collapsed as icon-only; users can expand on demand.
  _isOpen = false;

  _root = document.createElement('aside');
  _root.id = 'dev-debug-window';
  _root.className = `dev-debug-window${_isOpen ? ' open' : ''}`;
  _root.innerHTML = `
    <div class="devdbg-header">
      <button class="devdbg-toggle" type="button" title="Toggle Debug Drawer" aria-label="Toggle Debug Drawer">🐞</button>
      <div class="devdbg-summary"></div>
      <div class="devdbg-actions">
        <button type="button" data-action="clear">Clear</button>
        <button type="button" data-action="export">Export</button>
      </div>
    </div>
    <div class="devdbg-body">
      <div class="devdbg-tabs">
        <button type="button" data-tab="logs">Logs</button>
        <button type="button" data-tab="trace">Trace</button>
        <button type="button" data-tab="supports">Supports</button>
        <button type="button" data-tab="events">Events</button>
        <button type="button" data-tab="conversion">Conversion</button>
        <button type="button" data-tab="scene">Scene</button>
      </div>
      <div class="devdbg-tab-content"></div>
    </div>
  `;

  document.body.appendChild(_root);

  _summary = _root.querySelector('.devdbg-summary');
  _body = _root.querySelector('.devdbg-body');
  _tabContent = _root.querySelector('.devdbg-tab-content');

  _root.querySelector('.devdbg-toggle')?.addEventListener('click', () => _setOpen(!_isOpen));

  _root.querySelector('.devdbg-actions [data-action="clear"]')?.addEventListener('click', () => {
    clearLogs();
    clearTraceEvents();
    clearSupportDebugLog();
    _extraEvents = [];
    _selectedObject = null;
    _render();
  });

  _root.querySelector('.devdbg-actions [data-action="export"]')?.addEventListener('click', _exportBundle);

  _root.querySelectorAll('.devdbg-tabs [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      _root.querySelectorAll('.devdbg-tabs [data-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === _activeTab);
      });
      _renderActiveTab();
      _saveState();
    });
    btn.classList.toggle('active', btn.dataset.tab === _activeTab);
  });

  _unsubs.push(subscribe(() => _render()));
  _unsubs.push(subscribeTrace(() => _render()));
  _unsubs.push(subscribeSupportDebug(() => _render()));
  _bindEventBus();

  _render();
}

export function destroyDevDebugWindow() {
  for (const u of _unsubs) {
    try { u(); } catch {}
  }
  _unsubs = [];
  _unbindEventBus();

  if (_root?.parentElement) _root.parentElement.removeChild(_root);
  _root = null;
  _summary = null;
  _body = null;
  _tabContent = null;
}
