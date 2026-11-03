import { computeSemanticHash } from '../../contracts/topo-enriched-xml/contract-core.js';
import {
  TOPONODEHISTORYMATCHRESULT_V1,
  TOPOSOURCEINVENTORY_V1,
} from '../../contracts/topo-enriched-xml/contracts.js';
import { computeRegistrySnapshotHash } from '../registry/registry-hash.js';
import { validateRegistrySnapshot } from '../registry/registry-validator.js';
import { buildRegisteredCandidateGraph } from './registered-candidate-graph.js';
import { validateCoordinateRegistrationAuthority } from './registered-coordinate-evidence.js';
import { solveGlobalHistoryAssignment } from './global-history-assignment.js';
import { validateRegisteredMatcherPolicy } from './registered-matcher-policy.js';

export async function matchRegisteredHistoricalNodes(input) {
  const snapshot = structuredClone(input);
  const policyResult = await validateRegisteredMatcherPolicy(input?.policy);
  const prepared = { ...input, policy: policyResult.normalized };
  const authorityIssues = await validateInputAuthority(prepared);
  const registrationAuthority = await validateCoordinateRegistrationAuthority(prepared);
  const issues = sortIssues([
    ...policyResult.blockers,
    ...authorityIssues,
    ...registrationAuthority.issues,
  ]);
  const artifact = issues.some(isBlocker)
    ? blockedArtifact(prepared, issues, policyResult.policyHash)
    : await matchedArtifact(prepared, registrationAuthority, issues, policyResult.policyHash);
  artifact.historyMatchResultHash = await computeSemanticHash(artifact, 'historyMatchResultHash');
  assertUnchanged(input, snapshot);
  return TOPONODEHISTORYMATCHRESULT_V1.freeze(artifact);
}

async function matchedArtifact(input, registrationAuthority, authorityIssues, policyHash) {
  const graph = buildRegisteredCandidateGraph({ ...input, registrationAuthority });
  const assignment = solveGlobalHistoryAssignment(graph, input.policy);
  const preserved = preservedExactRows(input.exactMatchResult, graph.availableCurrentIds);
  const additions = classifyDecisions(assignment.decisions, graph.states, input.exactMatchResult);
  const allIssues = sortIssues([...authorityIssues, ...assignment.issues, ...additions.issues]);
  return {
    ...rootFields(input.exactMatchResult),
    matches: mergeRows(preserved.matches, additions.matches),
    newNodes: mergeRows(preserved.newNodes, additions.newNodes),
    ambiguous: mergeRows(preserved.ambiguous, additions.ambiguous),
    conflicts: mergeRows(preserved.conflicts, additions.conflicts),
    reactivated: mergeRows(preserved.reactivated, additions.reactivated),
    retirementCandidates: retirementRows(input.exactMatchResult, input.coverage, allIssues),
    registeredAssignment: assignment.components,
    registeredPolicyHash: policyHash,
    evaluatedAt: requiredTimestamp(input.evaluatedAt),
    validation: buildValidation(allIssues, additions),
  };
}

function blockedArtifact(input, issues, policyHash) {
  const exact = input.exactMatchResult;
  return {
    ...rootFields(exact),
    matches: cloneRows(exact.matches),
    newNodes: cloneRows(exact.newNodes),
    ambiguous: cloneRows(exact.ambiguous),
    conflicts: cloneRows(exact.conflicts),
    reactivated: cloneRows(exact.reactivated),
    retirementCandidates: retirementRows(exact, input.coverage, issues),
    registeredAssignment: [],
    registeredPolicyHash: policyHash,
    evaluatedAt: requiredTimestamp(input.evaluatedAt),
    validation: buildValidation(issues, emptyAdditions()),
  };
}

async function validateInputAuthority(input) {
  const issues = [], exact = input.exactMatchResult || {};
  validateExactResult(exact, issues);
  validateSourceInventory(input.sourceInventory, exact, issues);
  await validateRegistryAuthority(input.previousRegistry, exact, issues);
  validateCoverage(input.coverage, exact, issues);
  validateCurrentRoots(input.currentLogicalNodes, exact, issues);
  validateTimestamp(input.evaluatedAt, issues);
  return sortIssues(issues);
}

async function validateExactResult(exact, issues) {
  const errors = TOPONODEHISTORYMATCHRESULT_V1.validate(exact);
  if (errors.length) issues.push(blocker('EXACT_MATCH_RESULT_NOT_PASS', {
    reason: 'CONTRACT_INVALID', errors: [...errors],
  }));
  const actualHash = await computeSemanticHash(exact, 'historyMatchResultHash');
  if (clean(exact.historyMatchResultHash) !== actualHash) issues.push(blocker(
    'EXACT_MATCH_RESULT_HASH_MISMATCH', { expected: clean(exact.historyMatchResultHash), actual: actualHash },
  ));
  if (clean(exact.validation?.status) !== 'PASS') issues.push(blocker(
    'EXACT_MATCH_RESULT_NOT_PASS', { status: clean(exact.validation?.status) || 'MISSING' },
  ));
}

function validateSourceInventory(inventory, exact, issues) {
  const errors = TOPOSOURCEINVENTORY_V1.validate(inventory);
  if (errors.length || clean(inventory?.validation?.status) !== 'PASS') issues.push(blocker(
    'SOURCE_INVENTORY_NOT_PASS', { errors, status: clean(inventory?.validation?.status) || 'MISSING' },
  ));
  compareRoot(inventory?.projectId, exact.projectId, 'SOURCE_INVENTORY_PROJECT_MISMATCH', issues);
  compareRoot(inventory?.zoneId, exact.zoneId, 'SOURCE_INVENTORY_ZONE_MISMATCH', issues);
  compareRoot(inventory?.coordinateFrameId, exact.coordinateFrameId, 'COORDINATE_FRAME_MISMATCH', issues);
}

async function validateRegistryAuthority(previousRegistry, exact, issues) {
  const zoneRegistry = previousRegistry?.zoneRegistry;
  const lineHistories = previousRegistry?.lineHistories;
  const manifest = previousRegistry?.snapshotManifest;
  if (!zoneRegistry || !Array.isArray(lineHistories) || !manifest) {
    issues.push(blocker('BASE_REGISTRY_SNAPSHOT_HASH_MISMATCH', { reason: 'COMPLETE_REGISTRY_SNAPSHOT_REQUIRED' }));
    return;
  }
  const validation = await validateRegistrySnapshot({ zoneRegistry, lineHistories, manifest });
  if (validation.status !== 'PASS') issues.push(blocker('BASE_REGISTRY_SNAPSHOT_NOT_PASS', {
    validation,
  }));
  const actualHash = await computeRegistrySnapshotHash(manifest);
  const supplied = clean(previousRegistry?.registrySnapshotHash || manifest?.registrySnapshotHash);
  for (const [source, value] of [
    ['manifest', manifest?.registrySnapshotHash],
    ['previousRegistry', supplied],
    ['exactMatchResult', exact?.baseRegistrySnapshotHash],
  ]) if (clean(value) !== actualHash) issues.push(blocker('BASE_REGISTRY_SNAPSHOT_HASH_MISMATCH', {
    source, expected: actualHash, actual: clean(value),
  }));
  compareRoot(zoneRegistry?.projectId, exact.projectId, 'BASE_REGISTRY_ROOT_MISMATCH', issues);
  compareRoot(zoneRegistry?.zoneId, exact.zoneId, 'BASE_REGISTRY_ROOT_MISMATCH', issues);
}

function validateCurrentRoots(nodes, exact, issues) {
  const seen = new Set();
  for (const node of asArray(nodes)) {
    const logicalNodeId = clean(node?.logicalNodeId);
    if (!logicalNodeId || seen.has(logicalNodeId)) issues.push(blocker(
      'GLOBAL_ASSIGNMENT_DUPLICATE_LOGICAL_NODE', { logicalNodeId },
    ));
    seen.add(logicalNodeId);
    compareRoot(node?.projectId, exact.projectId, 'CURRENT_NODE_PROJECT_MISMATCH', issues, { logicalNodeId });
    compareRoot(node?.zoneId, exact.zoneId, 'CURRENT_NODE_ZONE_MISMATCH', issues, { logicalNodeId });
  }
}

function validateCoverage(coverage, exact, issues) {
  const scope = clean(coverage?.scope);
  const valid = ['PARTIAL_LINE', 'FULL_LINE', 'FULL_ZONE'].includes(scope)
    && typeof coverage?.authoritativeForRetirement === 'boolean';
  if (!valid) issues.push(blocker('COVERAGE_INVALID', { scope }));
  const retirementRows = asArray(exact?.retirementCandidates);
  if ((scope === 'PARTIAL_LINE' || coverage?.authoritativeForRetirement !== true) && retirementRows.length) {
    issues.push(blocker('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED', { scope, count: retirementRows.length }));
  }
}

function classifyDecisions(decisions, states, exact) {
  const buckets = emptyAdditions();
  const stateById = new Map(states.map((row) => [row.logicalNodeId, row]));
  const exactById = new Map(asArray(exact.newNodes).map((row) => [clean(row.logicalNodeId), row]));
  for (const decision of decisions) {
    const state = stateById.get(decision.logicalNodeId);
    const record = decisionRecord(decision, state, exactById.get(decision.logicalNodeId));
    if (decision.outcome === 'REGISTERED_GLOBAL_MATCHED') classifyRegisteredMatch(decision, record, buckets);
    else if (decision.outcome === 'NO_REGISTERED_MATCH') buckets.newNodes.push(record);
    else if (decision.outcome === 'HARD_CONFLICT') {
      buckets.conflicts.push(record);
      buckets.issues.push(blocker('REGISTERED_CANDIDATE_HARD_CONFLICT', { logicalNodeId: record.logicalNodeId }));
    } else {
      buckets.ambiguous.push(record);
      const code = decision.outcome === 'REGISTERED_AMBIGUOUS'
        ? 'GLOBAL_ASSIGNMENT_AMBIGUOUS' : primaryReviewCode(state);
      buckets.issues.push(review(code, { logicalNodeId: record.logicalNodeId }));
    }
  }
  return buckets;
}

function classifyRegisteredMatch(decision, record, buckets) {
  if (clean(decision.candidate?.lifecycleStatus) === 'RETIRED') {
    record.outcome = 'REACTIVATION_CANDIDATE';
    buckets.reactivated.push(record);
    buckets.issues.push(review('REACTIVATION_CANDIDATE', { logicalNodeId: record.logicalNodeId }));
  } else buckets.matches.push(record);
}

function decisionRecord(decision, state, exactRow) {
  const candidate = decision.candidate;
  return {
    logicalNodeId: decision.logicalNodeId,
    ...(candidate ? { historyNodeId: candidate.historyNodeId } : {}),
    outcome: decision.outcome,
    exactDisposition: structuredClone(exactRow || null),
    selectedCandidate: candidate ? publicCandidate(candidate) : null,
    candidates: state?.candidates.map(publicCandidate).sort(compareCandidate) || [],
    rejectedCandidates: state?.candidates.filter((row) => row.status !== 'ELIGIBLE')
      .map(publicCandidate).sort(compareCandidate) || [],
    competingHistoryNodeIds: [...(decision.alternativeHistoryNodeIds || [])].sort(),
    globalEvidence: structuredClone(decision.globalEvidence || null),
  };
}

function publicCandidate(row) {
  return {
    historyNodeId: row.historyNodeId, registrationId: row.registrationId,
    coordinateRegistrationHash: row.coordinateRegistrationHash,
    lifecycleStatus: row.lifecycleStatus, status: row.status,
    transformedPositionQ: row.transformedPositionQ,
    historicalPositionQ: row.historicalPositionQ,
    distanceSquaredQ: row.distanceSquaredQ, coordinateScale: row.coordinateScale,
    corroboration: row.corroboration, missingCorroboration: row.missingCorroboration,
    score: row.score, rejectionReasons: row.rejectionReasons, reviewReasons: row.reviewReasons,
  };
}

function preservedExactRows(exact, availableIds) {
  const available = new Set(availableIds);
  return {
    matches: cloneRows(exact.matches), ambiguous: cloneRows(exact.ambiguous),
    conflicts: cloneRows(exact.conflicts), reactivated: cloneRows(exact.reactivated),
    newNodes: cloneRows(exact.newNodes).filter((row) => !available.has(clean(row.logicalNodeId))),
  };
}

function retirementRows(exact, coverage, issues) {
  const prohibited = (clean(coverage?.scope) === 'PARTIAL_LINE' || coverage?.authoritativeForRetirement !== true)
    && asArray(exact?.retirementCandidates).length;
  if (prohibited || issues.some((row) => row.code === 'PARTIAL_COVERAGE_RETIREMENT_PROHIBITED')) return [];
  return cloneRows(exact.retirementCandidates);
}

function buildValidation(issues, additions) {
  const blockers = issues.filter(isBlocker).map(publicIssue);
  const reviewItems = sortIssues([
    ...issues.filter((row) => row.severity === 'REVIEW_REQUIRED'),
    ...additions.issues.filter((row) => row.severity === 'REVIEW_REQUIRED'),
  ]).map(publicIssue);
  return {
    status: blockers.length ? 'BLOCKED' : (reviewItems.length ? 'REVIEW_REQUIRED' : 'PASS'),
    blockers: uniqueIssues(blockers), reviewItems: uniqueIssues(reviewItems), warnings: [],
  };
}

function rootFields(exact) {
  return {
    schema: 'TopoNodeHistoryMatchResult.v1', projectId: required(exact?.projectId, 'projectId'),
    zoneId: required(exact?.zoneId, 'zoneId'), mainLineKey: required(exact?.mainLineKey, 'mainLineKey'),
    coordinateFrameId: required(exact?.coordinateFrameId, 'coordinateFrameId'),
    logicalTopologyHash: required(exact?.logicalTopologyHash, 'logicalTopologyHash'),
    baseRegistrySnapshotHash: required(exact?.baseRegistrySnapshotHash, 'baseRegistrySnapshotHash'),
  };
}

function validateTimestamp(value, issues) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(clean(value))
    || Number.isNaN(Date.parse(clean(value)))) issues.push(blocker('EVALUATED_AT_INVALID', { evaluatedAt: clean(value) }));
}
function requiredTimestamp(value) { const result = required(value, 'evaluatedAt'); if (Number.isNaN(Date.parse(result))) throw new TypeError('evaluatedAt is invalid.'); return result; }
function emptyAdditions() { return { matches: [], newNodes: [], ambiguous: [], conflicts: [], reactivated: [], issues: [] }; }
function primaryReviewCode(state) { return state?.candidates.flatMap((row) => row.reviewReasons)[0]?.code || 'REVIEW_REQUIRED'; }
function mergeRows(...buckets) { return buckets.flat().map((row) => structuredClone(row)).sort(compareOutcome); }
function cloneRows(rows) { return asArray(rows).map((row) => structuredClone(row)); }
function compareOutcome(a, b) { return clean(a.logicalNodeId).localeCompare(clean(b.logicalNodeId)) || clean(a.historyNodeId).localeCompare(clean(b.historyNodeId)); }
function compareCandidate(a, b) { return clean(a.historyNodeId).localeCompare(clean(b.historyNodeId)); }
function compareRoot(actual, expected, code, issues, evidence = {}) { const value = clean(actual); if (!value || value !== clean(expected)) issues.push(blocker(code, { ...evidence, expected: clean(expected), actual: value })); }
function blocker(code, evidence) { return { code, severity: 'BLOCKER', evidence }; }
function review(code, evidence) { return { code, severity: 'REVIEW_REQUIRED', evidence }; }
function publicIssue(row) { return { code: row.code, evidence: structuredClone(row.evidence || {}) }; }
function uniqueIssues(rows) { const byKey = new Map(rows.map((row) => [`${row.code}|${JSON.stringify(row.evidence)}`, row])); return [...byKey.values()].sort((a, b) => `${a.code}|${JSON.stringify(a.evidence)}`.localeCompare(`${b.code}|${JSON.stringify(b.evidence)}`)); }
function sortIssues(rows) { return [...rows].sort((a, b) => `${a.severity}|${a.code}|${JSON.stringify(a.evidence)}`.localeCompare(`${b.severity}|${b.code}|${JSON.stringify(b.evidence)}`)); }
function isBlocker(row) { return row.severity === 'BLOCKER'; }
function assertUnchanged(input, snapshot) { if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error('Registered/global matcher mutated its input.'); }
function required(value, field) { const result = clean(value); if (!result) throw new TypeError(`${field} is required.`); return result; }
function clean(value) { return String(value ?? '').trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
