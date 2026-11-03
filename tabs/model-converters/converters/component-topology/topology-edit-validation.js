/**
 * Structural and engineering validation for edited canonical topology.
 * Structural corruption is export-blocking. Geometry diagnostics are retained
 * as selectable warnings because intentional disconnects, bends, and junctions
 * require engineering intent that cannot be inferred from geometry alone.
 */

import { validateTopologyGeometry } from './topology-geometry-diagnostics.js';
import { pointDistance } from './topology-values.js';
import { textIds } from './topology-edit-contract.js';

const GEOMETRY_DIAGNOSTIC_OPTIONS = Object.freeze({
  shortElementMm: 6,
  toleranceMm: 0.1,
  snapToleranceMm: 25,
  angleToleranceDeg: 5,
  originToleranceMm: 0.1,
});

/** @param {string} code @param {boolean} blocking @param {string} message @param {string[]} objectIds @returns {Readonly<Record<string, unknown>>} */
function finding(code, blocking, message, objectIds) {
  return Object.freeze({ code, blocking, message, objectIds: Object.freeze([...objectIds]) });
}

/** @param {Record<string, unknown>[]} rows @param {string} field @param {string} code @returns {Readonly<Record<string, unknown>>[]} */
function duplicateFindings(rows, field, code) {
  const seen = new Set(), duplicates = new Set();
  for (const row of rows) {
    const value = String(row[field] ?? '');
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].map((value) => finding(code, true, `Duplicate ${field} ${value}.`, [value]));
}

/** @param {Record<string, unknown>} canonical @param {Map<string,Record<string,unknown>>} nodeIndex @param {Map<string,number>} degree @returns {Readonly<Record<string,unknown>>[]} */
function edgeFindings(canonical, nodeIndex, degree) {
  const findings = [], edgePairs = new Map();
  for (const edge of canonical.edges) {
    const from = nodeIndex.get(edge.fromNodeId), to = nodeIndex.get(edge.toNodeId);
    if (!from || !to) {
      findings.push(finding('MISSING_EDGE_ENDPOINT', true, `Edge ${edge.id} references a missing endpoint.`, [edge.id]));
      continue;
    }
    degree.set(from.id, (degree.get(from.id) ?? 0) + 1);
    degree.set(to.id, (degree.get(to.id) ?? 0) + 1);
    if (from.id === to.id || pointDistance(from.position, to.position) <= Number(canonical.toleranceMm ?? 0.1)) {
      findings.push(finding('ZERO_LENGTH_EDGE', true, `Edge ${edge.id} has zero length within topology tolerance.`, [edge.id]));
    }
    const pair = [from.id, to.id].sort().join('|');
    if (edgePairs.has(pair)) findings.push(finding('DUPLICATE_EDGE', true, `Edges ${edgePairs.get(pair)} and ${edge.id} connect the same nodes.`, [edgePairs.get(pair), edge.id]));
    else edgePairs.set(pair, edge.id);
    if (String(edge.id).startsWith('EDIT-CE-') && !String(edge.engineeringAuthorityEdgeId ?? '').trim()) {
      findings.push(finding('UNRESOLVED_ENGINEERING_AUTHORITY', true, `Edited edge ${edge.id} has no explicit context-edge authority.`, [edge.id]));
    }
    if (String(edge.id).startsWith('EDIT-CE-') && !(edge.sourceEntityIds ?? []).length) {
      findings.push(finding('UNRESOLVED_ENGINEERING_LINEAGE', true, `Edited edge ${edge.id} has no inherited source lineage.`, [edge.id]));
    }
  }
  return findings;
}

/** @param {Record<string, unknown>} canonical @param {Map<string,Record<string,unknown>>} nodeIndex @param {Map<string,number>} degree @returns {Readonly<Record<string,unknown>>[]} */
function dependencyFindings(canonical, nodeIndex, degree) {
  const findings = [], edgeIndex = new Map(canonical.edges.map((edge) => [edge.id, edge]));
  for (const node of canonical.nodes) if ((degree.get(node.id) ?? 0) === 0) {
    findings.push(finding('ISOLATED_NODE', true, `Node ${node.id} is not incident to any edge.`, [node.id]));
  }
  for (const collectionName of ['supports', 'junctions', 'boundaries']) for (const row of canonical[collectionName]) {
    if (!nodeIndex.has(row.nodeId)) findings.push(finding('ORPHAN_NODE_DEPENDENCY', true, `${collectionName} ${row.id} references missing node ${row.nodeId}.`, [row.id]));
    else if ((degree.get(row.nodeId) ?? 0) === 0) findings.push(finding('ISOLATED_NODE_DEPENDENCY', true, `${collectionName} ${row.id} is attached to isolated node ${row.nodeId}.`, [row.id, row.nodeId]));
  }
  for (const rigid of canonical.rigids) if (!edgeIndex.has(rigid.edgeId)) {
    findings.push(finding('ORPHAN_RIGID', true, `Rigid ${rigid.sourceEntityId} references missing edge ${rigid.edgeId}.`, [rigid.sourceEntityId]));
  }
  for (const bend of canonical.bends ?? []) {
    const missingEdges = (bend.edgeIds ?? []).filter((edgeId) => !edgeIndex.has(edgeId));
    if (!nodeIndex.has(bend.nodeId) || missingEdges.length) findings.push(finding(
      'ORPHAN_BEND_DEFINITION', true,
      `Bend ${bend.id} references missing node or arm geometry.`, [bend.id, bend.nodeId, ...missingEdges],
    ));
  }
  return findings;
}

/** @param {Record<string, unknown>} canonical @param {Record<string, unknown>} draft @returns {Readonly<Record<string, unknown>>} */
export function validateEditedTopology(canonical, draft) {
  const findings = [
    ...duplicateFindings(canonical.nodes, 'id', 'DUPLICATE_NODE_ID'),
    ...duplicateFindings(canonical.edges, 'id', 'DUPLICATE_EDGE_ID'),
  ];
  const inputNodeRows = canonical.nodes.flatMap((node) => (
    (node.inputXmlNodeIds ?? []).map((inputXmlNodeId) => ({ id: node.id, inputXmlNodeId }))
  ));
  findings.push(...duplicateFindings(inputNodeRows, 'inputXmlNodeId', 'INPUTXML_NODE_COLLISION'));
  const nodeIndex = new Map(canonical.nodes.map((node) => [node.id, node])), degree = new Map();
  findings.push(...edgeFindings(canonical, nodeIndex, degree));
  findings.push(...dependencyFindings(canonical, nodeIndex, degree));
  for (const issue of canonical.buildIssues ?? []) if (issue.blocking !== false) {
    findings.push(finding(String(issue.code ?? 'CANONICAL_BUILD_ISSUE'), true, `Canonical build issue: ${issue.code ?? 'unknown'}.`, textIds([issue.sourcePath])));
  }
  if (Object.keys(draft.engineeringOverrides ?? {}).length) findings.push(finding(
    'ENGINEERING_OVERRIDES_NOT_RELEASED', true,
    'Engineering overrides are reserved for the restraints and basic-properties release and cannot be exported yet.', [],
  ));
  const blockingCount = findings.filter((row) => row.blocking).length;
  return Object.freeze({
    schema: 'TopologyEditValidation.v1', ok: blockingCount === 0,
    findings: Object.freeze(findings), summary: Object.freeze({ findingCount: findings.length, blockingCount }),
  });
}

/** @param {Record<string, unknown>} row @returns {string} */
function geometryFindingKey(row) {
  return `${row.code}:${[...(row.objectIds ?? [])].map(String).sort().join('|')}`;
}

/** @param {Record<string, unknown>} structural @param {Record<string, unknown>} current @param {Record<string, unknown>} base @returns {Readonly<Record<string, unknown>>} */
export function mergeGeometryDiagnostics(structural, current, base) {
  const diagnosticOptions = Object.freeze({
    ...GEOMETRY_DIAGNOSTIC_OPTIONS,
    toleranceMm: Number(current.toleranceMm ?? GEOMETRY_DIAGNOSTIC_OPTIONS.toleranceMm),
  });
  const currentReport = validateTopologyGeometry(current, diagnosticOptions);
  const baseReport = current === base ? currentReport : validateTopologyGeometry(base, Object.freeze({
    ...diagnosticOptions, toleranceMm: Number(base.toleranceMm ?? diagnosticOptions.toleranceMm),
  }));
  const baselineKeys = new Set(baseReport.findings.map(geometryFindingKey));
  const geometryFindings = currentReport.findings.map((row) => Object.freeze({
    ...row, baseline: baselineKeys.has(geometryFindingKey(row)),
  }));
  const findings = Object.freeze([...structural.findings, ...geometryFindings]);
  const blockingCount = findings.filter((row) => row.blocking).length;
  return Object.freeze({
    ...structural, ok: blockingCount === 0, findings,
    geometryDiagnostics: currentReport, baselineGeometryDiagnostics: baseReport,
    summary: Object.freeze({ findingCount: findings.length, blockingCount, geometryFindingCount: geometryFindings.length }),
  });
}

export const _test = Object.freeze({ finding, duplicateFindings, geometryFindingKey });
