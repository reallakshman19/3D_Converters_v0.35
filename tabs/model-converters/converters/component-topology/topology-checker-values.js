/**
 * Shared topology-checker vocabulary and deterministic issue construction.
 * Inputs are canonical object identifiers and measured evidence. Outputs are
 * immutable TopologyIssue.v1 records; no geometry or review state is mutated.
 */

import { deterministicHash } from './topology-deterministic-hash.js';
import { cleanText } from './topology-values.js';

export const TOPOLOGY_CHECK_DEFAULTS = Object.freeze({
  shortElementMm: 6,
  toleranceMm: 0.1,
  snapToleranceMm: 25,
  angleToleranceDeg: 5,
  originToleranceMm: 0.1,
  clearanceMm: 0,
});

export const TOPOLOGY_ISSUE_STYLES = Object.freeze({
  BRANCH_DISCONNECTED: { category: 'CONNECTIVITY', color: '#2563eb', icon: 'unlink', canvasFix: 'BRIDGE_GAP_OR_MERGE_NODES' },
  ISOLATED_ELEMENT: { category: 'CONNECTIVITY', color: '#1d4ed8', icon: 'plug-zap', canvasFix: 'BRIDGE_GAP_OR_DELETE_EDGE' },
  SNAP_GAP: { category: 'CONNECTIVITY', color: '#0ea5e9', icon: 'magnet', canvasFix: 'MERGE_NODES_OR_BRIDGE_GAP' },
  ORPHAN_EDGE_ENDPOINT: { category: 'CONNECTIVITY', color: '#991b1b', icon: 'circle-off', canvasFix: 'DELETE_EDGE_OR_ADD_STRAIGHT_ELEMENT' },
  ORPHAN_NODE: { category: 'CONNECTIVITY', color: '#b91c1c', icon: 'circle-dot', canvasFix: 'DELETE_OR_CONNECT' },
  SHORT_ELEMENT: { category: 'GEOMETRY', color: '#f97316', icon: 'ruler', canvasFix: 'MERGE_NODES_OR_DELETE_EDGE' },
  EXPECTED_SHORT_INLINE_COMPONENT: { category: 'GEOMETRY', color: '#64748b', icon: 'component', canvasFix: '' },
  CENTERLINE_CLASH: { category: 'GEOMETRY', color: '#dc2626', icon: 'scan-line', canvasFix: 'MOVE_NODE_OR_SPLIT_EDGE' },
  PHYSICAL_CLEARANCE_CLASH: { category: 'GEOMETRY', color: '#ef4444', icon: 'collision', canvasFix: 'MOVE_NODE_OR_SPLIT_EDGE' },
  OVERLAPPING_ELEMENTS: { category: 'GEOMETRY', color: '#be123c', icon: 'layers', canvasFix: 'TRIM_EDGE' },
  PIPE_BACKTRACK: { category: 'GEOMETRY', color: '#7c3aed', icon: 'undo-2', canvasFix: 'TRIM_EDGE' },
  UNDEFINED_KINK: { category: 'GEOMETRY', color: '#d97706', icon: 'git-commit-horizontal', canvasFix: 'MOVE_NODE' },
  RIGHT_ANGLE_WITHOUT_BEND: { category: 'FITTINGS', color: '#eab308', icon: 'corner-down-right', canvasFix: 'ADD_BEND_DEFINITION' },
  BEND_WITHOUT_DIRECTION_CHANGE: { category: 'FITTINGS', color: '#a855f7', icon: 'corner-up-right', canvasFix: '' },
  MULTIWAY_WITHOUT_JUNCTION: { category: 'FITTINGS', color: '#db2777', icon: 'git-fork', canvasFix: 'ADD_JUNCTION_DEFINITION' },
  JUNCTION_WITHOUT_MULTIWAY: { category: 'FITTINGS', color: '#c026d3', icon: 'split', canvasFix: '' },
  BEND_AT_JUNCTION: { category: 'FITTINGS', color: '#9333ea', icon: 'triangle-alert', canvasFix: '' },
  ORIGIN_DEFAULTED: { category: 'DATA_AUTHORITY', color: '#475569', icon: 'map-pin-off', canvasFix: 'MOVE_NODE' },
  ORPHAN_SUPPORT: { category: 'ATTACHMENTS', color: '#f43f5e', icon: 'construction', canvasFix: 'REATTACH_SUPPORT' },
  ORPHAN_RIGID: { category: 'ATTACHMENTS', color: '#e11d48', icon: 'weight', canvasFix: 'REASSIGN_RIGID' },
  UNKNOWN_RESTRAINT_FAMILY: { category: 'ATTACHMENTS', color: '#d946ef', icon: 'circle-help', canvasFix: 'EDIT_RESTRAINT' },
  UNRESOLVED_RESTRAINT_DIRECTION: { category: 'ATTACHMENTS', color: '#c026d3', icon: 'move-3d', canvasFix: 'EDIT_RESTRAINT' },
});

export const TOPOLOGY_CHECK_CATEGORIES = Object.freeze([
  'CONNECTIVITY', 'GEOMETRY', 'FITTINGS', 'ATTACHMENTS', 'DATA_AUTHORITY', 'EXPORT_INTEGRITY',
]);

/** @param {Record<string, unknown>} options @returns {Readonly<Record<string,number>>} */
export function normalizeTopologyCheckOptions(options) {
  const merged = { ...TOPOLOGY_CHECK_DEFAULTS, ...(options ?? {}) };
  for (const [key, value] of Object.entries(merged)) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new TypeError(`Topology check option ${key} must be a non-negative finite number.`);
    merged[key] = number;
  }
  return Object.freeze(merged);
}

/** @param {string[]} values @returns {string[]} */
function uniqueIds(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))].sort();
}

/** @param {Record<string,unknown>} input @returns {Readonly<Record<string,unknown>>} */
export function topologyIssue(input) {
  const code = cleanText(input.code).toUpperCase();
  const style = TOPOLOGY_ISSUE_STYLES[code];
  if (!style) throw new RangeError(`Unknown topology issue code ${code}.`);
  const objectIds = uniqueIds(/** @type {string[]} */ (input.objectIds ?? []));
  const identity = deterministicHash({ ruleSet: 'TopologyCheckerRules.v1', code, objectIds });
  return Object.freeze({
    schema: 'TopologyIssue.v1', id: `TI-${identity.split(':')[1]}`, code,
    category: style.category, severity: input.severity ?? 'WARNING', blocking: input.blocking === true,
    confidence: input.confidence ?? 'MEDIUM', message: cleanText(input.message), objectIds: Object.freeze(objectIds),
    details: Object.freeze({ ...(input.details ?? {}) }), evidence: Object.freeze([...(input.evidence ?? [])]),
    location: input.location ? Object.freeze({ ...input.location }) : null,
    color: style.color, icon: style.icon, canvasFix: style.canvasFix,
    fixability: input.fixability ?? (style.canvasFix ? 'NEEDS_CONFIRMATION' : 'MANUAL_ENGINEERING'),
    baseline: input.baseline === true, suggestionIds: Object.freeze([]),
  });
}

/** @param {Record<string,unknown>[]} issues @returns {Readonly<Record<string,unknown>>} */
export function topologyCheckSummary(issues) {
  const count = (field, value) => issues.filter((row) => row[field] === value).length;
  const countsByCode = Object.fromEntries([...new Set(issues.map((row) => row.code))].sort().map((code) => [code, count('code', code)]));
  const countsByCategory = Object.fromEntries(TOPOLOGY_CHECK_CATEGORIES.map((category) => [category, count('category', category)]));
  return Object.freeze({
    findingCount: issues.length, openCount: issues.length, blockingCount: issues.filter((row) => row.blocking).length,
    warningCount: count('severity', 'WARNING'), infoCount: count('severity', 'INFO'), autoApprovedCount: count('fixability', 'AUTO_APPROVED'),
    needsConfirmationCount: count('fixability', 'NEEDS_CONFIRMATION'), countsByCode: Object.freeze(countsByCode), countsByCategory: Object.freeze(countsByCategory),
  });
}

