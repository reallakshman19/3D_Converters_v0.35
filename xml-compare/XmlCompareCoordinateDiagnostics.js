export const XML_COMPARE_COORDINATE_DIAGNOSTICS_SCHEMA = 'xml-compare-coordinate-diagnostics/v1';

const SEVERITY_BY_CODE = Object.freeze({
  coordinate_table_empty: 'WARNING',
  coordinate_row_incomplete: 'WARNING',
  coordinate_value_invalid: 'WARNING',
  coordinate_duplicate_node: 'WARNING',
  coordinate_conflict: 'ERROR',
  coordinate_unresolved_element: 'WARNING',
  coordinate_disconnected_graph: 'WARNING',
  coordinate_multiple_origins: 'INFO',
  coordinate_loop_conflict: 'ERROR',
});

function clean(value) {
  return String(value ?? '').trim();
}

function distanceOf(diagnostic = {}) {
  return Number(diagnostic.details?.distance || diagnostic.distance || 0) || 0;
}

export function normalizeCoordinateDiagnostic(diagnostic = {}) {
  const code = clean(diagnostic.code || 'coordinate_unresolved_element');
  return Object.freeze({
    ...diagnostic,
    severity: SEVERITY_BY_CODE[code] || clean(diagnostic.severity || 'WARNING'),
    code,
    message: clean(diagnostic.message || code),
    details: Object.freeze({ ...(diagnostic.details || {}) }),
  });
}

export function groupUnresolvedElementsByLine(elements = [], diagnostics = []) {
  const rows = (elements || []).filter((item) => item.status !== 'SOLVED');
  return Object.freeze(rows.sort(compareElement).map((item) => Object.freeze({
    lineNo: clean(item.lineNo || item.details?.lineNo),
    fromNode: clean(item.fromNode),
    toNode: clean(item.toNode),
    diagnosticCount: (diagnostics || []).filter((diag) => diag.details?.fromNode === item.fromNode && diag.details?.toNode === item.toNode).length,
  })));
}

export function groupConflictsByNode(diagnostics = []) {
  const map = new Map();
  for (const diagnostic of (diagnostics || []).map(normalizeCoordinateDiagnostic)) {
    if (diagnostic.code !== 'coordinate_conflict' && diagnostic.code !== 'coordinate_loop_conflict') continue;
    const node = clean(diagnostic.details?.node || diagnostic.details?.fromNode || diagnostic.details?.toNode || 'unknown');
    if (!map.has(node)) map.set(node, []);
    map.get(node).push(diagnostic);
  }
  return Object.freeze([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([node, rows]) => Object.freeze({ node, diagnostics: Object.freeze(rows) })));
}

export function summarizeCoordinateDiagnostics(diagnostics = [], options = {}) {
  const normalized = (diagnostics || []).map(normalizeCoordinateDiagnostic);
  return Object.freeze({
    originCount: Number(options.originCount || 0),
    solvedNodeCount: Number(options.solvedNodeCount || 0),
    solvedElementCount: Number(options.solvedElementCount || 0),
    unresolvedElementCount: Number(options.unresolvedElementCount || 0),
    conflictCount: normalized.filter((item) => item.code === 'coordinate_conflict').length,
    disconnectedGraphCount: normalized.filter((item) => item.code === 'coordinate_disconnected_graph').length,
    multipleOriginCount: normalized.filter((item) => item.code === 'coordinate_multiple_origins').length,
    maxConflictDistance: Math.max(0, ...normalized.map(distanceOf)),
    toleranceMm: Number(options.toleranceMm ?? 1),
  });
}

function compareElement(a, b) {
  return clean(a.lineNo).localeCompare(clean(b.lineNo), undefined, { numeric: true }) ||
    clean(a.fromNode).localeCompare(clean(b.fromNode), undefined, { numeric: true }) ||
    clean(a.toNode).localeCompare(clean(b.toNode), undefined, { numeric: true });
}
