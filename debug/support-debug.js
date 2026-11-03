/**
 * support-debug.js
 *
 * Structured diagnostics for XML support parsing/building/merging/rendering.
 * This is localhost-safe and UI-consumable.
 */

const _log = [];
const _listeners = new Set();
const _max = 3000;

const _summary = {
  xmlParse: {
    total: 0,
    byTypeCode: {},
    byAxisBucket: {},
    withNode: 0,
    withRawType: 0,
    withAxisCosines: 0,
  },
  builder: {
    totalInput: 0,
    built: 0,
    skipped: 0,
    skippedByReason: {},
    byKind: {},
    byDirection: {},
    fallbackRestUp: 0,
  },
  merge: {
    builtCount: 0,
    beforeCount: 0,
    appendedCount: 0,
    dedupedCount: 0,
  },
  render: {
    totalInput: 0,
    byKind: {},
    byBranch: {},
    fallbackCount: 0,
    droppedCount: 0,
    droppedByReason: {},
  },
};

function _inc(map, key, by = 1) {
  const k = String(key ?? 'UNKNOWN');
  map[k] = (map[k] || 0) + by;
}

function _clone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return { note: 'non-serializable' };
  }
}

function _notify() {
  const snapshot = getSupportDebugState();
  for (const fn of _listeners) {
    try { fn(snapshot); } catch {}
  }
}

export function debugSupport(event) {
  const row = {
    ts: Date.now(),
    stage: String(event?.stage || 'unknown'),
    ..._clone(event || {}),
  };

  _log.push(row);
  if (_log.length > _max) _log.splice(0, _log.length - _max);

  if (row.stage === 'xml-parse') {
    _summary.xmlParse.total += 1;
    if (row.nodeId) _summary.xmlParse.withNode += 1;
    if (row.rawType) _summary.xmlParse.withRawType += 1;
    if (row.axisCosines) _summary.xmlParse.withAxisCosines += 1;
    _inc(_summary.xmlParse.byTypeCode, row.typeCode ?? 'none');
    _inc(_summary.xmlParse.byAxisBucket, row.axisBucket ?? 'unknown');
  }

  if (row.stage === 'xml-support-builder') {
    _summary.builder.totalInput += 1;
    if (row.skipped) {
      _summary.builder.skipped += 1;
      _inc(_summary.builder.skippedByReason, row.skipReason || 'unknown');
    } else {
      _summary.builder.built += 1;
      _inc(_summary.builder.byKind, row.resolvedKind || 'UNKNOWN');
      _inc(_summary.builder.byDirection, row.resolvedDirection || 'UNKNOWN');
      if (row.warning === 'rest-up-fallback') _summary.builder.fallbackRestUp += 1;
    }
  }

  if (row.stage === 'xml-support-merge') {
    if (typeof row.builtCount === 'number') _summary.merge.builtCount = row.builtCount;
    if (typeof row.beforeCount === 'number') _summary.merge.beforeCount = row.beforeCount;
    if (typeof row.appendedCount === 'number') _summary.merge.appendedCount = row.appendedCount;
    if (typeof row.dedupedCount === 'number') _summary.merge.dedupedCount = row.dedupedCount;
  }

  if (row.stage === 'viewer-build-support') {
    _summary.render.totalInput += 1;
    _inc(_summary.render.byKind, row.supportKind || 'UNKNOWN');
    _inc(_summary.render.byBranch, row.renderBranch || 'unknown');
    if (row.warning === 'renderer-fallback') _summary.render.fallbackCount += 1;
    if (row.dropped) {
      _summary.render.droppedCount += 1;
      _inc(_summary.render.droppedByReason, row.dropReason || 'unknown');
    }
  }

  if (typeof window !== 'undefined' && window.__SUPPORT_DEBUG_VERBOSE__) {
    console.debug('[SUPPORT_DEBUG]', row);
  }

  _notify();
}

export function clearSupportDebugLog() {
  _log.length = 0;

  _summary.xmlParse = {
    total: 0,
    byTypeCode: {},
    byAxisBucket: {},
    withNode: 0,
    withRawType: 0,
    withAxisCosines: 0,
  };
  _summary.builder = {
    totalInput: 0,
    built: 0,
    skipped: 0,
    skippedByReason: {},
    byKind: {},
    byDirection: {},
    fallbackRestUp: 0,
  };
  _summary.merge = {
    builtCount: 0,
    beforeCount: 0,
    appendedCount: 0,
    dedupedCount: 0,
  };
  _summary.render = {
    totalInput: 0,
    byKind: {},
    byBranch: {},
    fallbackCount: 0,
    droppedCount: 0,
    droppedByReason: {},
  };

  _notify();
}

export function getSupportDebugLog() {
  return _log.slice();
}

export function getSupportDebugSummary() {
  return _clone(_summary);
}

export function getSupportDebugState() {
  return {
    summary: getSupportDebugSummary(),
    log: getSupportDebugLog(),
  };
}

export function subscribeSupportDebug(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.__supportDebug = {
    getLog: getSupportDebugLog,
    getSummary: getSupportDebugSummary,
    clear: clearSupportDebugLog,
  };
}
