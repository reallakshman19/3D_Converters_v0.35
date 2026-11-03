import { RuntimeEvents } from '../contracts/runtime-events.js';
/**
 * logger.js - Diagnostic logging utility for data, geometry, and 3D interaction trace.
 */

import { emit } from './event-bus.js';

export const logs = [];
export const traceEvents = [];
const listeners = new Set();
const traceListeners = new Set();

export const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  SUCCESS: 'success',
};

export const CATEGORY = {
  IMPORT: 'import',
  GEOMETRY: 'geometry',
  CONTINUITY: 'continuity',
  LABELS: 'labels',
  PROPERTIES: 'properties',
  RESTRAINTS: 'restraints',
  CAMERA: 'camera',
  NAVIGATION: 'navigation',
  THEME: 'theme',
  SECTION: 'section',
  UI: 'ui',
  PERFORMANCE: 'performance',
  VIEWER3D: 'viewer3d',
};

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

export function writeSessionLog(logEntry) {
  try {
    const d = new Date();
    const dateStr = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear().toString().slice(-2)}`;
    const timeStr = `${d.getHours().toString().padStart(2, '0')}.${d.getMinutes().toString().padStart(2, '0')}`;
    emit(RuntimeEvents.SESSION_LOG, { dateStr, timeStr, entry: logEntry });
  } catch (e) {
    console.error('Failed to write session log', e);
  }
}

export function addLog(options) {
  const {
    severity = SEVERITY.INFO,
    category = CATEGORY.UI,
    message,
    objectId = null,
    rowId = null,
    lineNo = null,
    componentType = null,
    propertyName = null,
    expectedValue = null,
    actualValue = null,
    ruleId = null,
    ruleText = null,
    sourceFile = null,
    sourceTable = null,
  } = options || {};

  const logEntry = {
    id: generateId(),
    timestamp: Date.now(),
    severity,
    category,
    message,
    objectId,
    rowId,
    lineNo,
    componentType,
    propertyName,
    expectedValue,
    actualValue,
    ruleId,
    ruleText,
    sourceFile,
    sourceTable,
    resolved: false,
    tags: [],
  };

  logs.push(logEntry);

  if (severity === SEVERITY.ERROR || severity === SEVERITY.WARNING) {
    writeSessionLog(logEntry);
  }

  emit(RuntimeEvents.LOG_ADDED, logEntry);
  notifyListeners();
  return logEntry;
}

export function addTraceEvent(options) {
  const {
    type = 'unknown',
    category = 'viewer3d',
    payload = {},
    raw = null,
  } = options || {};

  const evt = {
    id: generateId(),
    ts: Date.now(),
    type: String(type),
    category: String(category),
    payload: payload || {},
    raw,
  };

  traceEvents.push(evt);
  if (traceEvents.length > 5000) traceEvents.splice(0, traceEvents.length - 5000);
  emit(RuntimeEvents.TRACE_ADDED, evt);
  notifyTraceListeners();
  return evt;
}

export function clearTraceEvents() {
  traceEvents.length = 0;
  emit(RuntimeEvents.TRACE_CLEARED);
  notifyTraceListeners();
}

export function summarizeTraceEvents() {
  const counts = new Map();
  for (const evt of traceEvents) {
    const key = `${evt.category}:${evt.type}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function resolveLog(id) {
  const log = logs.find((l) => l.id === id);
  if (log) {
    log.resolved = true;
    emit(RuntimeEvents.LOG_RESOLVED, log);
    notifyListeners();
  }
}

export function clearLogs() {
  logs.length = 0;
  emit(RuntimeEvents.LOGS_CLEARED);
  notifyListeners();
}

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function subscribeTrace(callback) {
  traceListeners.add(callback);
  return () => traceListeners.delete(callback);
}

function notifyListeners() {
  for (const listener of listeners) listener(logs);
}

function notifyTraceListeners() {
  for (const listener of traceListeners) listener(traceEvents);
}
