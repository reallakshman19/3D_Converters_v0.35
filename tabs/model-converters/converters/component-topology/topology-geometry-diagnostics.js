/**
 * Public topology-checker engine and legacy diagnostics compatibility layer.
 * Inputs are immutable CanonicalTopology.v1 records plus explicit thresholds.
 * Outputs are deterministic reports; geometry and engineering data are never mutated.
 */

import { buildTopologyCheckGraph } from './topology-checker-graph.js';
import { attachmentIssues, fittingIssues } from './topology-checker-feature-rules.js';
import {
  basicRouteIssues, branchConnectivityIssues, pairGeometryIssues, snapGapIssues,
} from './topology-checker-route-rules.js';
import {
  normalizeTopologyCheckOptions, TOPOLOGY_ISSUE_STYLES, topologyCheckSummary,
} from './topology-checker-values.js';

export const TOPOLOGY_GEOMETRY_ISSUE_STYLES = TOPOLOGY_ISSUE_STYLES;

const SEVERITY_RANK = Object.freeze({ BLOCKER: 4, ERROR: 3, WARNING: 2, INFO: 1 });

/** @param {Record<string,unknown>} left @param {Record<string,unknown>} right @returns {number} */
function compareIssues(left, right) {
  return (SEVERITY_RANK[right.severity] ?? 0) - (SEVERITY_RANK[left.severity] ?? 0)
    || String(left.category).localeCompare(String(right.category))
    || String(left.code).localeCompare(String(right.code))
    || String(left.id).localeCompare(String(right.id));
}

/**
 * Runs engineering-aware connectivity, geometry, fitting, attachment, and
 * data-authority rules against one canonical topology.
 * @param {Record<string,unknown>} canonical
 * @param {Record<string,unknown>} options
 * @returns {Readonly<Record<string,unknown>>}
 */
export function runTopologyChecks(canonical, options) {
  if (canonical?.schema !== 'CanonicalTopology.v1') throw new TypeError('Topology checking requires CanonicalTopology.v1.');
  const normalized = normalizeTopologyCheckOptions(options), graph = buildTopologyCheckGraph(canonical);
  const issues = Object.freeze([
    ...basicRouteIssues(canonical, graph, normalized),
    ...branchConnectivityIssues(canonical, graph),
    ...snapGapIssues(canonical, graph, normalized),
    ...pairGeometryIssues(canonical, graph, normalized),
    ...fittingIssues(canonical, graph, normalized),
    ...attachmentIssues(canonical, graph),
  ].sort(compareIssues));
  return Object.freeze({
    schema: 'TopologyCheckReport.v1', ruleSet: 'TopologyCheckerRules.v1',
    canonicalTopologyHash: String(canonical.canonicalTopologyHash ?? ''), options: normalized,
    issues, findings: issues, summary: topologyCheckSummary(issues),
  });
}

/**
 * Legacy adapter retained for edit validation and external consumers.
 * @param {Record<string,unknown>} canonical
 * @param {Record<string,unknown>} options
 * @returns {Readonly<Record<string,unknown>>}
 */
export function validateTopologyGeometry(canonical, options) {
  const report = runTopologyChecks(canonical, options);
  return Object.freeze({
    schema: 'TopologyGeometryDiagnostics.v1', options: report.options,
    findings: report.issues, issues: report.issues, summary: report.summary,
    topologyCheckReport: report,
  });
}

export const _test = Object.freeze({ compareIssues, SEVERITY_RANK });
