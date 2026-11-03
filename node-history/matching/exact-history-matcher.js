import { computeSemanticHash } from '../../contracts/topo-enriched-xml/contract-core.js';
import { TOPONODEHISTORYMATCHRESULT_V1 } from '../../contracts/topo-enriched-xml/contracts.js';
import {
  buildExactCandidateIndex,
  buildExactRetirementCandidates,
  generateExactCandidates,
  resolveMatcherRoot,
  validateMatcherAuthority,
} from './exact-candidate-index.js';
import { collectCurrentIdentityEvidence, stableEvidenceTokens } from './identity-normalizer.js';

const RESULT_SCHEMA = 'TopoNodeHistoryMatchResult.v1';

export async function matchExactHistoricalNodes(input) {
  const snapshot = structuredClone(input);
  const root = resolveMatcherRoot(input);
  const nodes = requireCurrentNodes(input.currentLogicalNodes);
  const policy = input.config?.identityNormalization || {};
  const index = buildExactCandidateIndex(input.previousRegistry, policy);
  const states = nodes.map((node) => buildCurrentState(node, input, root, index, policy));
  classifyGlobalClaims(states);
  const authorityIssues = validateMatcherAuthority(input, root, nodes);
  const artifact = buildArtifact(root, states, index, input.coverage, input.evaluatedAt, authorityIssues);
  artifact.historyMatchResultHash = await computeSemanticHash(artifact, 'historyMatchResultHash');
  assertUnchanged(input, snapshot);
  return TOPONODEHISTORYMATCHRESULT_V1.freeze(artifact);
}

function buildCurrentState(node, input, root, index, policy) {
  const logicalNodeId = required(node.logicalNodeId, 'current logicalNodeId');
  const evidence = collectCurrentIdentityEvidence(node, input.sourceInventory, policy);
  const candidates = generateExactCandidates(evidence, index)
    .map((candidate) => evaluateCandidate(node, evidence, candidate, input, root));
  return { logicalNodeId, node, evidence, candidates, outcome: null, component: null };
}

function evaluateCandidate(node, currentEvidence, candidate, input, root) {
  const hard = [], review = [];
  const history = candidate.history, parent = candidate.parent;
  reject(candidate.duplicateHistoryId, hard, 'DUPLICATE_HISTORY_IDENTITY');
  reject(value(node.projectId, root.projectId) !== value(history.projectId, parent.projectId, root.projectId), hard, 'PROJECT_MISMATCH');
  reject(value(node.zoneId, root.zoneId) !== value(history.zoneId, parent.zoneId, root.zoneId), hard, 'ZONE_MISMATCH');
  evaluateLine(node, history, parent, input.config, root, hard);
  evaluateRole(node, history, hard, review);
  evaluateConfiguredConflicts(node, history, input.config, hard);
  evaluateStableIdentity(currentEvidence, candidate.historyEvidence, candidate.primaryEvidence, hard);
  evaluateAuthority(candidate, review);
  const lifecycle_ = evaluateLifecycle(history, candidate, hard, review);
  evaluateLockedClaim(node, history, hard);
  return Object.freeze({
    ...candidate,
    status: hard.length ? 'REJECTED_HARD' : (review.length ? 'REVIEW_REQUIRED' : 'ELIGIBLE'),
    rejectionReasons: Object.freeze(sortIssues(hard)),
    reviewReasons: Object.freeze(sortIssues(review)),
    reactivation: lifecycle_.reactivation,
  });
}

function classifyGlobalClaims(states) {
  const eligible = states.flatMap((state) => state.candidates
    .filter((candidate) => candidate.status === 'ELIGIBLE')
    .map((candidate) => ({ currentId: state.logicalNodeId, historyId: candidate.historyNodeId })));
  const components = connectedComponents(eligible), byCurrent = new Map();
  for (const component of components) for (const currentId of component.currentIds) byCurrent.set(currentId, component);
  for (const state of states) {
    state.component = byCurrent.get(state.logicalNodeId) || null;
    state.outcome = classifyState(state);
  }
}

function classifyState(state) {
  const eligible = state.candidates.filter((row) => row.status === 'ELIGIBLE');
  const review = state.candidates.filter((row) => row.status === 'REVIEW_REQUIRED');
  const hard = state.candidates.filter((row) => row.status === 'REJECTED_HARD');
  if (state.component && (state.component.currentIds.length > 1 || state.component.historyIds.length > 1)) return 'EXACT_AMBIGUOUS';
  if (eligible.length === 1 && review.length === 0) return eligible[0].reactivation ? 'REACTIVATION_CANDIDATE' : 'EXACT_MATCHED';
  if (eligible.length > 1) return 'EXACT_AMBIGUOUS';
  if (review.length) return 'REVIEW_REQUIRED';
  if (hard.length) return 'HARD_CONFLICT';
  return 'NO_EXACT_MATCH';
}

function connectedComponents(edges) {
  const currentToHistory = multimap(edges, 'currentId', 'historyId');
  const historyToCurrent = multimap(edges, 'historyId', 'currentId');
  const remaining = new Set([...currentToHistory.keys()].sort()), result = [];
  while (remaining.size) {
    const seed = [...remaining][0];
    const currentIds = new Set(), historyIds = new Set(), queue = [['C', seed]];
    while (queue.length) {
      const [kind, id] = queue.shift();
      if (kind === 'C') visit(id, currentIds, remaining, currentToHistory, historyIds, queue, 'H');
      else visit(id, historyIds, null, historyToCurrent, currentIds, queue, 'C');
    }
    result.push(Object.freeze({ currentIds: [...currentIds].sort(), historyIds: [...historyIds].sort() }));
  }
  return result.sort((a, b) => a.currentIds[0].localeCompare(b.currentIds[0]));
}

function visit(id, own, remaining, links, other, queue, nextKind) {
  if (own.has(id)) return;
  own.add(id);
  remaining?.delete(id);
  for (const linked of links.get(id) || []) if (!other.has(linked)) queue.push([nextKind, linked]);
}

function buildArtifact(root, states, index, coverage, evaluatedAt, authorityIssues) {
  const buckets = { matches: [], newNodes: [], ambiguous: [], conflicts: [], reactivated: [] };
  for (const state of [...states].sort(compareStates)) {
    const record = outcomeRecord(state);
    if (state.outcome === 'EXACT_MATCHED') buckets.matches.push(record);
    else if (state.outcome === 'NO_EXACT_MATCH') buckets.newNodes.push(record);
    else if (state.outcome === 'HARD_CONFLICT') buckets.conflicts.push(record);
    else if (state.outcome === 'REACTIVATION_CANDIDATE') buckets.reactivated.push(record);
    else buckets.ambiguous.push(record);
  }
  addGlobalRegistryConflicts(buckets.conflicts, index);
  addAuthorityConflicts(buckets.conflicts, authorityIssues);
  return {
    schema: RESULT_SCHEMA,
    ...root,
    matches: buckets.matches,
    newNodes: buckets.newNodes,
    ambiguous: buckets.ambiguous,
    conflicts: buckets.conflicts.sort(compareOutcomeRecords),
    reactivated: buckets.reactivated,
    retirementCandidates: buildExactRetirementCandidates(index, states, coverage, root),
    evaluatedAt: required(evaluatedAt, 'evaluatedAt'),
    validation: buildValidation(buckets),
  };
}

function outcomeRecord(state) {
  const eligible = state.candidates.filter((row) => row.status === 'ELIGIBLE');
  const selected = ['EXACT_MATCHED', 'REACTIVATION_CANDIDATE'].includes(state.outcome) ? eligible[0] : null;
  return {
    logicalNodeId: state.logicalNodeId,
    ...(selected ? { historyNodeId: selected.historyNodeId } : {}),
    outcome: state.outcome,
    primaryEvidence: selected ? publicEvidence(selected.primaryEvidence) : null,
    candidates: state.candidates.map(publicCandidate).sort(comparePublicCandidates),
    rejectedCandidates: state.candidates.filter((row) => row.status !== 'ELIGIBLE')
      .map(publicCandidate).sort(comparePublicCandidates),
    competingLogicalNodeIds: state.component ? state.component.currentIds.filter((id) => id !== state.logicalNodeId) : [],
    competingHistoryNodeIds: state.component ? state.component.historyIds : [],
  };
}

function publicCandidate(candidate) {
  return {
    historyNodeId: candidate.historyNodeId,
    status: candidate.status,
    lifecycleStatus: lifecycle(candidate.history),
    reactivation: candidate.reactivation,
    primaryEvidence: publicEvidence(candidate.primaryEvidence),
    evidence: candidate.evidence.map((row) => ({
      current: publicEvidence(row.current), historical: publicEvidence(row.historical),
      automaticAuthority: row.automaticAuthority,
    })),
    rejectionReasons: candidate.rejectionReasons,
    reviewReasons: candidate.reviewReasons,
  };
}

function publicEvidence(evidence) {
  if (!evidence) return null;
  return {
    kind: evidence.kind, tier: evidence.tier, namespace: evidence.namespace,
    aliasType: evidence.aliasType, value: evidence.value, authority: evidence.authority,
    approval: evidence.approval, sourcePath: evidence.sourcePath,
  };
}

function buildValidation(buckets) {
  const blockers = buckets.conflicts.map((row) => ({
    code: row.reason || 'HARD_CONFLICT',
    evidence: { logicalNodeId: row.logicalNodeId, outcome: row.outcome },
  }));
  const reviewItems = [...buckets.ambiguous, ...buckets.reactivated]
    .map((row) => ({ code: row.outcome, evidence: { logicalNodeId: row.logicalNodeId } }));
  return {
    status: blockers.length ? 'BLOCKED' : (reviewItems.length ? 'REVIEW_REQUIRED' : 'PASS'),
    blockers: sortIssues(blockers), reviewItems: sortIssues(reviewItems), warnings: [],
  };
}

function evaluateLine(node, history, parent, config, root, hard) {
  const current = value(node.mainLineKey, node.canonicalMainLine, root.mainLineKey);
  const historical = value(history.mainLineKey, parent.mainLineKey);
  if (current === historical) return;
  const approved = asArray(config?.approvedLineRenames).some((row) => row?.approved === true
    && Boolean(value(row.recordId, row.authorityRecordId, row.authority))
    && value(row.projectId, root.projectId) === root.projectId
    && value(row.zoneId, root.zoneId) === root.zoneId
    && value(row.fromMainLineKey) === historical && value(row.toMainLineKey) === current);
  reject(!approved, hard, 'UNAPPROVED_MAIN_LINE_RENAME', { current, historical });
}

function evaluateRole(node, history, hard, review) {
  const current = value(node.logicalRole, node.engineeringRole, node.role).toUpperCase();
  const historical = value(history.logicalRole, history.engineeringRole, history.role).toUpperCase();
  reject(!current || !historical, review, 'LOGICAL_ROLE_EVIDENCE_MISSING', { current, historical });
  reject(Boolean(current && historical && current !== historical), hard, 'LOGICAL_ROLE_MISMATCH', { current, historical });
}

function evaluateConfiguredConflicts(node, history, config, hard) {
  const rules = config?.hardEligibility || {};
  fieldConflict(rules.carrier === true, node.carrierId, history.carrierId, 'CARRIER_CONFLICT', hard);
  fieldConflict(rules.bore === true, normalizedBore(node.bore ?? node.boreMm), normalizedBore(history.bore ?? history.boreMm), 'BORE_CONFLICT', hard);
  fieldConflict(rules.supportOwner === true, node.supportOwnerId, history.supportOwnerId, 'SUPPORT_OWNER_CONFLICT', hard);
}

function evaluateStableIdentity(current, historical, primary, hard) {
  if (!primary || primary.tier === 1) return;
  const currentTokens = stableEvidenceTokens(current), historyTokens = stableEvidenceTokens(historical);
  if (!currentTokens.size || !historyTokens.size) return;
  reject(![...currentTokens].some((token) => historyTokens.has(token)), hard, 'STABLE_IDENTITY_CONFLICT');
}

function evaluateAuthority(candidate, review) {
  reject(candidate.evidence.some((row) => !row.automaticAuthority), review, 'EXACT_EVIDENCE_AUTHORITY_REVIEW_REQUIRED');
}

function evaluateLifecycle(history, candidate, hard, review) {
  const status = lifecycle(history);
  if (['ACTIVE', 'REACTIVATED'].includes(status)) return { reactivation: false };
  if (status === 'RETIRED') {
    const sameHistory = candidate.evidence.some((row) => row.current.tier === 1 || row.current.kind === 'SAME_HISTORY_REACTIVATION');
    reject(!sameHistory, review, 'REACTIVATION_IDENTITY_REVIEW_REQUIRED');
    return { reactivation: sameHistory };
  }
  if (status === 'REVIEW_REQUIRED' || !status) reject(true, review, 'LIFECYCLE_REVIEW_REQUIRED', { status });
  else reject(true, hard, 'LIFECYCLE_INCOMPATIBLE', { status });
  return { reactivation: false };
}

function evaluateLockedClaim(node, history, hard) {
  const owner = value(history.hardClaimedByLogicalNodeId, history.claimedByLogicalNodeId);
  reject(Boolean(owner && owner !== value(node.logicalNodeId)), hard, 'HISTORY_ALREADY_HARD_CLAIMED', { owner });
}

function addGlobalRegistryConflicts(conflicts, index) {
  for (const historyNodeId of index.duplicateHistoryIds) conflicts.push(
    conflictRecord(`REGISTRY:${historyNodeId}`, 'DUPLICATE_HISTORY_IDENTITY', [historyNodeId]),
  );
}

function addAuthorityConflicts(conflicts, issues) {
  issues.forEach((row, index) => conflicts.push(
    conflictRecord(`AUTHORITY:${String(index).padStart(3, '0')}`, row.code, [], row.evidence),
  ));
}

function conflictRecord(logicalNodeId, reason, competingHistoryNodeIds = [], evidence = {}) {
  return {
    logicalNodeId, outcome: 'HARD_CONFLICT', primaryEvidence: null, candidates: [],
    rejectedCandidates: [], competingLogicalNodeIds: [], competingHistoryNodeIds,
    reason, evidence,
  };
}

function assertUnchanged(input, snapshot) {
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error('Exact matcher mutated its input.');
}

function requireCurrentNodes(nodes) {
  if (!Array.isArray(nodes)) throw new TypeError('currentLogicalNodes must be an array.');
  const ids = nodes.map((row) => required(row?.logicalNodeId, 'logicalNodeId'));
  if (new Set(ids).size !== ids.length) throw new TypeError('currentLogicalNodes contains duplicate logicalNodeId values.');
  return [...nodes].sort((a, b) => value(a.logicalNodeId).localeCompare(value(b.logicalNodeId)));
}

function multimap(rows, keyField, valueField) {
  const result = new Map();
  for (const row of rows) {
    const values = result.get(row[keyField]) || new Set();
    values.add(row[valueField]);
    result.set(row[keyField], values);
  }
  return new Map([...result].map(([key, values]) => [key, [...values].sort()]));
}

function reject(condition, target, code, evidence = {}) { if (condition) target.push({ code, evidence }); }
function fieldConflict(enabled, current, historical, code, hard) {
  const left = value(current), right = value(historical);
  reject(enabled && Boolean(left && right && left !== right), hard, code, { current: left, historical: right });
}
function normalizedBore(value_) { const number = Number(value_); return Number.isFinite(number) ? String(number) : ''; }
function lifecycle(history) { return value(history.lifecycleStatus, history.status).toUpperCase(); }
function compareStates(a, b) { return a.logicalNodeId.localeCompare(b.logicalNodeId); }
function compareOutcomeRecords(a, b) { return value(a.logicalNodeId).localeCompare(value(b.logicalNodeId)); }
function comparePublicCandidates(a, b) { return a.historyNodeId.localeCompare(b.historyNodeId); }
function sortIssues(items) { return [...items].sort((a, b) => `${a.code}|${JSON.stringify(a.evidence)}`.localeCompare(`${b.code}|${JSON.stringify(b.evidence)}`)); }
function required(value_, field) { const result = value(value_); if (!result) throw new TypeError(`${field} is required.`); return result; }
function value(...values) { return String(values.find((item) => item !== undefined && item !== null && String(item).trim()) ?? '').trim(); }
function asArray(value_) { return Array.isArray(value_) ? value_ : []; }
