/**
 * FBX semantic topology benchmark report assembly.
 *
 * Prepared graph inputs must already carry approved semantic entity IDs, zone
 * assignments, and typed relationships. This module does not parse StagedJSON
 * or infer engineering authority.
 */

import {
  FAIL_STATES,
  TOPOLOGY_RELATIONSHIP_KINDS,
  normalizeGraph,
  normalizePolicy,
  normalizeTolerance,
  record,
} from './topology-benchmark-contract.js';
import {
  branchReports,
  cycleAnomalies,
  flowState,
  islandAnomalies,
  junctionReports,
  orphanBranchAnomalies,
} from './topology-benchmark-graph-analysis.js';
import {
  boundaryAnomalies,
  boundaryReports,
  buildRelationshipLedger,
  duplicateEntityAnomalies,
  reciprocityAnomalies,
  selfConnectionAnomalies,
  unresolvedAnomalies,
} from './topology-benchmark-relationships.js';

export { TOPOLOGY_RELATIONSHIP_KINDS } from './topology-benchmark-contract.js';

function statusCounts(records) {
  const counts = { PASS: 0, PASS_WITH_OBSERVATIONS: 0, FAIL: 0, BLOCKED: 0, NOT_APPLICABLE: 0 };
  for (const item of records) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return Object.freeze(counts);
}

function topologyAnomalies(reference, actual, policy, referenceFlow, actualFlow, ledger) {
  return Object.freeze({
    unresolvedReferences: [
      ...unresolvedAnomalies(reference, 'reference'),
      ...unresolvedAnomalies(actual, 'actual'),
    ],
    ambiguousReferences: [
      ...duplicateEntityAnomalies(reference, 'reference'),
      ...duplicateEntityAnomalies(actual, 'actual'),
    ],
    reciprocityMismatches: reciprocityAnomalies(actual, policy),
    duplicateEdges: ledger.filter((row) => row.matchState === 'DUPLICATE_EDGE'),
    selfConnections: selfConnectionAnomalies(actual),
    orphanBranches: orphanBranchAnomalies(actual),
    disconnectedIslands: islandAnomalies(referenceFlow, actualFlow),
    unexpectedCycles: cycleAnomalies(referenceFlow, actualFlow, policy),
    boundaryDiscontinuities: boundaryAnomalies(actual),
    relationshipKindConflicts: ledger.filter((row) => row.matchState === 'RELATIONSHIP_KIND_CONFLICT'),
  });
}

function coverageEvidence(reference, actual, ledger) {
  const referenceIds = new Set(reference.entities.map((entity) => entity.entityId));
  const actualIds = new Set(actual.entities.map((entity) => entity.entityId));
  return Object.freeze({
    referenceEntityCount: reference.entities.length,
    actualEntityCount: actual.entities.length,
    referenceRelationshipCount: reference.relationships.length,
    actualRelationshipCount: actual.relationships.length,
    relationshipLedgerCount: ledger.length,
    unrepresentedReferenceEntities: [...referenceIds].filter((id) => !actualIds.has(id)).sort(),
    unrepresentedActualEntities: [...actualIds].filter((id) => !referenceIds.has(id)).sort(),
    unrepresentedReferenceRelationships: ledger.filter((row) => row.matchState === 'MISSING_ACTUAL')
      .map((row) => row.relationshipId),
    unrepresentedActualRelationships: ledger.filter((row) => row.matchState === 'UNEXPECTED_ACTUAL')
      .map((row) => row.relationshipId),
  });
}

function resultStatus(coverage, ledger, anomalies, branches, junctions, boundaries) {
  const blocking = anomalies.ambiguousReferences.some((row) => row.blocking)
    || anomalies.unresolvedReferences.some((row) => row.blocking);
  const coverageFailed = coverage.unrepresentedReferenceEntities.length
    || coverage.unrepresentedActualEntities.length;
  const anomaliesFailed = anomalies.reciprocityMismatches.length || anomalies.selfConnections.length
    || anomalies.disconnectedIslands.length || anomalies.unexpectedCycles.length
    || anomalies.orphanBranches.length || anomalies.boundaryDiscontinuities.length;
  const recordsFailed = ledger.some((row) => FAIL_STATES.has(row.matchState))
    || branches.some((row) => row.status === 'FAIL') || junctions.some((row) => row.status === 'FAIL')
    || boundaries.some((row) => row.status === 'FAIL');
  return blocking ? 'BLOCKED' : coverageFailed || anomaliesFailed || recordsFailed ? 'FAIL' : 'PASS';
}

function summaryEvidence(branches, ledger, junctions, boundaries, actualFlow, anomalies, status) {
  return Object.freeze({
    branchStatusCounts: statusCounts(branches),
    relationshipStatusCounts: statusCounts(ledger),
    junctionStatusCounts: statusCounts(junctions),
    boundaryStatusCounts: statusCounts(boundaries),
    islandCount: actualFlow.islands.length,
    unexpectedCycleCount: anomalies.unexpectedCycles.length,
    topologyStatus: status,
  });
}

function frozenAnomalies(anomalies) {
  return Object.freeze(Object.fromEntries(
    Object.entries(anomalies).map(([key, value]) => [key, Object.freeze(value)]),
  ));
}

export function buildFbxTopologyBenchmarkReport(input) {
  const request = record(input, 'input');
  const reference = normalizeGraph(request.referenceGraph, 'referenceGraph');
  const actual = normalizeGraph(request.actualGraph, 'actualGraph');
  const policy = normalizePolicy(request.policy);
  const tolerance = normalizeTolerance(request.toleranceProfile);
  const ledger = buildRelationshipLedger(reference, actual, tolerance);
  const referenceFlow = flowState(reference), actualFlow = flowState(actual);
  const anomalies = topologyAnomalies(reference, actual, policy, referenceFlow, actualFlow, ledger);
  const coverage = coverageEvidence(reference, actual, ledger);
  const branches = branchReports(reference, actual, ledger, policy, actualFlow);
  const junctions = junctionReports(reference, actual);
  const boundaries = boundaryReports(ledger, reference, actual);
  const status = resultStatus(coverage, ledger, anomalies, branches, junctions, boundaries);
  return Object.freeze({
    schema: 'FbxTopologyBenchmarkReport.v1',
    benchmarkIdentity: structuredClone(record(request.benchmarkIdentity, 'benchmarkIdentity')),
    executionIdentity: structuredClone(record(request.executionIdentity, 'executionIdentity')),
    coverage,
    graphModel: Object.freeze({ relationshipKinds: TOPOLOGY_RELATIONSHIP_KINDS,
      topologyPolicyId: policy.policyId, toleranceProfileId: tolerance.profileId }),
    branches: Object.freeze(branches), relationships: ledger, junctions: Object.freeze(junctions),
    boundaries: Object.freeze(boundaries), anomalies: frozenAnomalies(anomalies),
    summary: summaryEvidence(branches, ledger, junctions, boundaries, actualFlow, anomalies, status),
    determinism: request.determinism == null ? null : structuredClone(record(request.determinism, 'determinism')),
    status,
  });
}
