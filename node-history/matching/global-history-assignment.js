import { deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';

const UNMATCHED = '__UNMATCHED__';

export function solveGlobalHistoryAssignment(graph, policy) {
  const issues = sortIssues([...validateGraph(graph), ...validatePolicy(policy)]);
  if (issues.some((row) => row.severity === 'BLOCKER')) return deepFreeze({
    decisions: blockedDecisions(graph.states, issues), components: [], issues,
  });
  const candidates = graph.candidates.filter((row) => row.status === 'ELIGIBLE');
  const components = connectedComponents(candidates);
  const solved = components.map((component) => solveComponent(component, candidates, policy));
  const decisions = mergeDecisions(graph.states, solved);
  return deepFreeze({
    decisions: decisions.sort(compareDecision),
    components: solved.map((row) => row.summary).sort(compareComponent),
    issues: sortIssues([...issues, ...solved.flatMap((row) => row.issues)]),
  });
}

function solveComponent(component, candidates, policy) {
  const componentCandidates = candidates.filter((row) => component.currentIds.includes(row.logicalNodeId)
    && component.historyIds.includes(row.historyNodeId));
  const search = enumerateAssignments(component, componentCandidates, policy);
  if (search.overflow) return ambiguousOverflow(component, componentCandidates, search.visited);
  const bestCardinality = Math.max(...search.solutions.map((row) => row.cardinality), 0);
  const cardinalityBest = search.solutions.filter((row) => row.cardinality === bestCardinality);
  const bestScore = cardinalityBest.reduce((best, row) => row.score > best ? row.score : best, lowestScore());
  const margin = nonNegativeBigInt(policy?.assignment?.scoreMargin, 'scoreMargin');
  const accepted = cardinalityBest.filter((row) => row.score >= bestScore - margin);
  const componentEvidence = {
    componentId: componentId(component), currentIds: component.currentIds, historyIds: component.historyIds,
    objective: policy.assignment.objective, bestCardinality, bestScore: bestScore.toString(),
    scoreMargin: margin.toString(), indistinguishableAssignmentCount: accepted.length,
  };
  const decisions = component.currentIds.map((logicalNodeId) => ({
    ...componentDecision(logicalNodeId, accepted, componentCandidates, bestScore, margin),
    globalEvidence: componentEvidence,
  }));
  return {
    decisions,
    issues: decisions.filter((row) => row.outcome === 'REGISTERED_AMBIGUOUS').map((row) => review(
      'GLOBAL_ASSIGNMENT_AMBIGUOUS', { logicalNodeId: row.logicalNodeId, alternatives: row.alternativeHistoryNodeIds },
    )),
    summary: { ...componentEvidence, visitedSearchStates: search.visited },
  };
}

function componentDecision(logicalNodeId, assignments, candidates, bestScore, margin) {
  const selections = new Set(assignments.map((row) => row.assignment.get(logicalNodeId) || UNMATCHED));
  const alternatives = [...selections].filter((id) => id !== UNMATCHED).sort();
  const selected = selections.size === 1 && !selections.has(UNMATCHED) ? alternatives[0] : null;
  const selectedCandidate = selected ? candidates.find((row) => row.logicalNodeId === logicalNodeId
    && row.historyNodeId === selected) : null;
  if (selectedCandidate) return {
    logicalNodeId, historyNodeId: selected, outcome: 'REGISTERED_GLOBAL_MATCHED',
    candidate: selectedCandidate, alternativeHistoryNodeIds: [selected],
    globalEvidence: { bestScore: bestScore.toString(), scoreMargin: margin.toString() },
  };
  if (selections.size > 1 || alternatives.length) return {
    logicalNodeId, outcome: 'REGISTERED_AMBIGUOUS', candidate: null,
    alternativeHistoryNodeIds: alternatives,
    includesUnmatchedAlternative: selections.has(UNMATCHED),
    globalEvidence: { bestScore: bestScore.toString(), scoreMargin: margin.toString() },
  };
  return { logicalNodeId, outcome: 'NO_REGISTERED_MATCH', candidate: null, alternativeHistoryNodeIds: [] };
}

function enumerateAssignments(component, candidates, policy) {
  const byCurrent = groupCandidates(component.currentIds, candidates);
  const maximumStates = positiveInteger(policy?.assignment?.maximumSearchStates, 100000);
  const solutions = [], assignment = new Map(), used = new Set();
  let visited = 0, overflow = false;
  function visit(index, cardinality, score) {
    visited += 1;
    if (visited > maximumStates) { overflow = true; return; }
    if (index === component.currentIds.length) {
      solutions.push({ assignment: new Map(assignment), cardinality, score });
      return;
    }
    const currentId = component.currentIds[index];
    assignment.delete(currentId);
    visit(index + 1, cardinality, score);
    for (const candidate of byCurrent.get(currentId) || []) {
      if (overflow || used.has(candidate.historyNodeId)) continue;
      assignment.set(currentId, candidate.historyNodeId);
      used.add(candidate.historyNodeId);
      visit(index + 1, cardinality + 1, score + BigInt(candidate.score));
      used.delete(candidate.historyNodeId);
      assignment.delete(currentId);
    }
  }
  visit(0, 0, 0n);
  return { solutions, visited, overflow };
}

function ambiguousOverflow(component, candidates, visited) {
  return {
    decisions: component.currentIds.map((logicalNodeId) => ({
      logicalNodeId, outcome: 'REGISTERED_AMBIGUOUS', candidate: null,
      alternativeHistoryNodeIds: candidates.filter((row) => row.logicalNodeId === logicalNodeId)
        .map((row) => row.historyNodeId).sort(),
      reason: 'GLOBAL_SEARCH_LIMIT_REACHED',
    })),
    issues: [review('GLOBAL_ASSIGNMENT_AMBIGUOUS', {
      componentId: componentId(component), reason: 'GLOBAL_SEARCH_LIMIT_REACHED', visitedSearchStates: visited,
    })],
    summary: {
      componentId: componentId(component), currentIds: component.currentIds, historyIds: component.historyIds,
      bestCardinality: null, bestScore: null, scoreMargin: null,
      indistinguishableAssignmentCount: null, visitedSearchStates: visited, overflow: true,
    },
  };
}

function mergeDecisions(states, solved) {
  const byCurrent = new Map(solved.flatMap((row) => row.decisions).map((row) => [row.logicalNodeId, row]));
  return states.map((state) => byCurrent.get(state.logicalNodeId) || fallbackDecision(state));
}

function fallbackDecision(state) {
  const reviewCandidates = state.candidates.filter((row) => row.status === 'REVIEW_REQUIRED');
  const rejectedCandidates = state.candidates.filter((row) => row.status === 'REJECTED_HARD');
  if (reviewCandidates.length) return {
    logicalNodeId: state.logicalNodeId, outcome: 'REVIEW_REQUIRED', candidate: null,
    alternativeHistoryNodeIds: reviewCandidates.map((row) => row.historyNodeId).sort(),
    reviewCandidates, rejectedCandidates,
  };
  if (rejectedCandidates.length) return {
    logicalNodeId: state.logicalNodeId, outcome: 'HARD_CONFLICT', candidate: null,
    alternativeHistoryNodeIds: [], rejectedCandidates,
  };
  return { logicalNodeId: state.logicalNodeId, outcome: 'NO_REGISTERED_MATCH', candidate: null, alternativeHistoryNodeIds: [] };
}

function connectedComponents(candidates) {
  const currentToHistory = multimap(candidates, 'logicalNodeId', 'historyNodeId');
  const historyToCurrent = multimap(candidates, 'historyNodeId', 'logicalNodeId');
  const remaining = new Set([...currentToHistory.keys()].sort()), result = [];
  while (remaining.size) {
    const seed = [...remaining][0], currentIds = new Set(), historyIds = new Set();
    const queue = [['C', seed]];
    while (queue.length) {
      const [kind, id] = queue.shift();
      if (kind === 'C') visit(id, currentIds, remaining, currentToHistory, historyIds, queue, 'H');
      else visit(id, historyIds, null, historyToCurrent, currentIds, queue, 'C');
    }
    result.push({ currentIds: [...currentIds].sort(), historyIds: [...historyIds].sort() });
  }
  return result.sort(compareComponent);
}

function visit(id, own, remaining, links, other, queue, nextKind) {
  if (own.has(id)) return;
  own.add(id); remaining?.delete(id);
  for (const linked of links.get(id) || []) if (!other.has(linked)) queue.push([nextKind, linked]);
}


function validatePolicy(policy) {
  const issues = [];
  if (policy?.assignment?.objective !== 'MAX_CARDINALITY_THEN_SCORE') issues.push(blocker(
    'GLOBAL_ASSIGNMENT_POLICY_INVALID', { field: 'assignment.objective', actual: policy?.assignment?.objective },
  ));
  return issues;
}

function validateGraph(graph) {
  const issues = [];
  const stateIds = graph.states.map((row) => row.logicalNodeId);
  for (const id of duplicates(stateIds)) issues.push(blocker('GLOBAL_ASSIGNMENT_DUPLICATE_LOGICAL_NODE', { logicalNodeId: id }));
  const pairKeys = graph.candidates.map((row) => `${row.logicalNodeId}\u0000${row.historyNodeId}`);
  for (const key of duplicates(pairKeys)) {
    const [logicalNodeId, historyNodeId] = key.split('\u0000');
    issues.push(blocker('GLOBAL_ASSIGNMENT_DUPLICATE_HISTORY', { logicalNodeId, historyNodeId }));
  }
  return sortIssues(issues);
}

function blockedDecisions(states, issues) {
  return states.map((state) => ({
    logicalNodeId: state.logicalNodeId, outcome: 'HARD_CONFLICT', candidate: null,
    alternativeHistoryNodeIds: [], authorityIssues: issues,
  })).sort(compareDecision);
}

function groupCandidates(currentIds, candidates) {
  const result = new Map(currentIds.map((id) => [id, []]));
  for (const candidate of candidates) result.get(candidate.logicalNodeId)?.push(candidate);
  for (const rows of result.values()) rows.sort((a, b) => a.historyNodeId.localeCompare(b.historyNodeId));
  return result;
}

function multimap(rows, left, right) {
  const result = new Map();
  for (const row of rows) {
    const values = result.get(row[left]) || new Set(); values.add(row[right]); result.set(row[left], values);
  }
  return new Map([...result].map(([key, values]) => [key, [...values].sort()]));
}

function duplicates(values) { const seen = new Set(), result = new Set(); for (const value of values) { if (seen.has(value)) result.add(value); seen.add(value); } return [...result].sort(); }
function componentId(component) { return `${component.currentIds.join(',')}=>${component.historyIds.join(',')}`; }
function compareComponent(a, b) { return componentId(a).localeCompare(componentId(b)); }
function compareDecision(a, b) { return a.logicalNodeId.localeCompare(b.logicalNodeId); }
function blocker(code, evidence) { return { code, severity: 'BLOCKER', evidence }; }
function review(code, evidence) { return { code, severity: 'REVIEW_REQUIRED', evidence }; }
function sortIssues(rows) { return [...rows].sort((a, b) => `${a.severity}|${a.code}|${JSON.stringify(a.evidence)}`.localeCompare(`${b.severity}|${b.code}|${JSON.stringify(b.evidence)}`)); }
function positiveInteger(value, fallback) { return Number.isInteger(value) && value > 0 ? value : fallback; }
function nonNegativeBigInt(value, field) { try { const result = BigInt(value); if (result < 0n) throw new Error(); return result; } catch { throw new TypeError(`${field} must be a non-negative integer.`); } }
function lowestScore() { return -(1n << 255n); }
