import { deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';
import {
  historicalRegisteredPositions,
  transformRegisteredPosition,
} from './registered-coordinate-evidence.js';

const ACTIVE = new Set(['ACTIVE', 'REACTIVATED']);

export function buildRegisteredCandidateGraph(input) {
  const scale = positiveInteger(input.policy?.numeric?.coordinateScale, 1000);
  const exact = exactAvailability(input.exactMatchResult);
  const histories = flattenHistories(input.previousRegistry)
    .filter((row) => !exact.unavailableHistoryIds.has(row.historyNodeId));
  const nodes = availableNodes(input.currentLogicalNodes, exact.availableCurrentIds);
  const states = nodes.map((node) => buildState(node, histories, input, scale));
  const candidates = states.flatMap((state) => state.candidates);
  return deepFreeze({
    states: states.sort(compareState),
    candidates: candidates.sort(compareCandidate),
    availableCurrentIds: [...exact.availableCurrentIds].sort(),
    unavailableHistoryIds: [...exact.unavailableHistoryIds].sort(),
  });
}

function buildState(node, histories, input, scale) {
  const candidates = histories.flatMap((history) => candidateFor(node, history, input, scale));
  return {
    logicalNodeId: clean(node.logicalNodeId),
    candidates: candidates.sort(compareCandidate),
  };
}

function candidateFor(node, historyRow, input, scale) {
  const registrationRef = clean(historyRow.parent.coordinateRegistrationRef);
  const authority = input.registrationAuthority.lookup(registrationRef);
  if (!authority) return [];
  const registeredRows = historicalRegisteredPositions(authority)
    .filter((row) => row.historyNodeId === historyRow.historyNodeId);
  if (!registeredRows.length) return [];
  return registeredRows.map((positionRow) => evaluateCandidate(
    node, historyRow, positionRow, authority, input, scale,
  ));
}

function evaluateCandidate(node, row, positionRow, authority, input, scale) {
  const hard = [], review = [];
  const history = row.history, root = input.exactMatchResult;
  const historicalEvidence = { ...history, ...(positionRow.corroboration || {}) };
  hardCompare(value(node.projectId, root.projectId), value(history.projectId, row.parent.projectId, root.projectId), 'PROJECT_MISMATCH', hard);
  hardCompare(value(node.zoneId, root.zoneId), value(history.zoneId, row.parent.zoneId, root.zoneId), 'ZONE_MISMATCH', hard);
  evaluateLine(node, history, row.parent, input.policy, root, hard);
  evaluateRole(node, historicalEvidence, hard, review);
  evaluateConfiguredConflicts(node, historicalEvidence, input.policy, hard);
  evaluateLifecycle(history, hard, review);
  const evidence = evaluateRegisteredEvidence(node, history, positionRow, authority, input.policy, scale, hard, review);
  const { transformed, target, distanceSquaredQ, corroboration, score } = evidence;
  return {
    logicalNodeId: clean(node.logicalNodeId),
    historyNodeId: row.historyNodeId,
    registrationId: authority.registrationId,
    coordinateRegistrationHash: authority.coordinateRegistrationHash,
    lifecycleStatus: lifecycle(history),
    status: hard.length ? 'REJECTED_HARD' : (review.length ? 'REVIEW_REQUIRED' : 'ELIGIBLE'),
    transformedPositionQ: transformed,
    historicalPositionQ: target,
    distanceSquaredQ: distanceSquaredQ === null ? null : distanceSquaredQ.toString(),
    coordinateScale: scale,
    corroboration: corroboration.matches,
    missingCorroboration: corroboration.missing,
    score: score === null ? null : score.toString(),
    rejectionReasons: sortIssues(hard),
    reviewReasons: sortIssues(review),
  };
}


function evaluateRegisteredEvidence(node, history, positionRow, authority, policy, scale, hard, review) {
  const transformed = transformRegisteredPosition(authority, currentPosition(node), scale);
  const target = quantizedTarget(positionRow, authority, scale, hard);
  const distanceSquaredQ = transformed && target ? squaredDistance(transformed, target) : null;
  evaluateEnvelope(distanceSquaredQ, policy, scale, hard);
  const corroboration = evaluateCorroboration(node, history, positionRow, policy);
  for (const row of corroboration.missing.filter((item) => item.hardConflict)) hard.push(issue(
    'REGISTERED_CANDIDATE_HARD_CONFLICT', { dimensionId: row.dimensionId, reason: row.reason },
  ));
  const minimum = positiveInteger(policy?.scoring?.minimumCorroboratingDimensions, 1);
  if (!corroboration.matches.length) review.push(issue('SPATIAL_ONLY_REUSE_PROHIBITED', {}));
  else if (corroboration.matches.length < minimum) review.push(issue(
    'REGISTERED_CORROBORATION_BELOW_POLICY', { actual: corroboration.matches.length, minimum },
  ));
  const score = candidateScore(corroboration, distanceSquaredQ, policy);
  evaluateThreshold(score, policy, review);
  return { transformed, target, distanceSquaredQ, corroboration, score };
}

function evaluateCorroboration(node, history, positionRow, policy) {
  const source = { ...history, ...(positionRow.corroboration || {}) };
  const matches = [], missing = [];
  for (const dimension of normalizedDimensions(policy)) {
    const currentValue = pathValue(node, dimension.currentPath);
    const historyValue = pathValue(source, dimension.historyPath);
    if (currentValue && historyValue && currentValue === historyValue) matches.push({
      dimensionId: dimension.dimensionId,
      currentValue, historyValue, weight: String(dimension.weight), authority: dimension.authority,
    });
    else missing.push({
      dimensionId: dimension.dimensionId, currentValue, historyValue,
      reason: currentValue && historyValue ? 'VALUE_MISMATCH' : 'EVIDENCE_MISSING',
      hardConflict: dimension.hardConflictOnMismatch && Boolean(currentValue && historyValue),
    });
  }
  return { matches: matches.sort(compareDimension), missing: missing.sort(compareDimension) };
}

function normalizedDimensions(policy) {
  return asArray(policy?.scoring?.corroborationDimensions).map((row) => ({
    dimensionId: required(row?.dimensionId, 'corroboration dimensionId'),
    currentPath: required(row?.currentPath, 'corroboration currentPath'),
    historyPath: required(row?.historyPath, 'corroboration historyPath'),
    weight: integerBigInt(row?.weight, 'corroboration weight'),
    authority: required(row?.authority, 'corroboration authority'),
    hardConflictOnMismatch: row?.hardConflictOnMismatch === true,
  })).sort(compareDimension);
}

function candidateScore(corroboration, distanceSquaredQ, policy) {
  if (distanceSquaredQ === null) return null;
  const evidence = corroboration.matches.reduce((sum, row) => sum + BigInt(row.weight), 0n);
  const distanceWeight = integerBigInt(policy?.scoring?.distanceSquaredWeight, 'distanceSquaredWeight');
  return evidence - (distanceSquaredQ * distanceWeight);
}

function evaluateThreshold(score, policy, review) {
  if (score === null) return;
  const threshold = integerBigInt(policy?.scoring?.minimumCandidateScore, 'minimumCandidateScore');
  if (score < threshold) review.push(issue('REGISTERED_SCORE_BELOW_THRESHOLD', {
    score: score.toString(), threshold: threshold.toString(),
  }));
}

function quantizedTarget(row, authority, scale, hard) {
  if (clean(row.coordinateFrameId) !== authority.registration.targetCoordinateFrameId) {
    hard.push(issue('COORDINATE_FRAME_MISMATCH', {
      expected: authority.registration.targetCoordinateFrameId, actual: clean(row.coordinateFrameId),
    }));
    return null;
  }
  const position = row.position || {};
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    hard.push(issue('REGISTERED_POSITION_INVALID', { historyNodeId: row.historyNodeId }));
    return null;
  }
  return { x: Math.round(position.x * scale), y: Math.round(position.y * scale), z: Math.round(position.z * scale), coordinateScale: scale };
}

function evaluateEnvelope(distanceSquaredQ, policy, scale, hard) {
  if (distanceSquaredQ === null) {
    hard.push(issue('REGISTERED_POSITION_INVALID', {}));
    return;
  }
  const maximum = Number(policy?.eligibility?.maximumDistance);
  if (!Number.isFinite(maximum) || maximum < 0) throw new TypeError('policy.eligibility.maximumDistance must be finite and non-negative.');
  const maximumQ = BigInt(Math.round(maximum * scale));
  if (distanceSquaredQ > maximumQ * maximumQ) hard.push(issue('REGISTERED_POSITION_OUTSIDE_ENVELOPE', {
    distanceSquaredQ: distanceSquaredQ.toString(), maximumDistanceQ: maximumQ.toString(),
  }));
}

function evaluateLine(node, history, parent, policy, root, hard) {
  const current = value(node.mainLineKey, node.canonicalMainLine, root.mainLineKey);
  const historical = value(history.mainLineKey, parent.mainLineKey);
  if (current === historical) return;
  const approved = asArray(policy?.approvedLineRenames).some((row) => row?.approved === true
    && value(row.projectId, root.projectId) === root.projectId
    && value(row.zoneId, root.zoneId) === root.zoneId
    && value(row.fromMainLineKey) === historical && value(row.toMainLineKey) === current
    && value(row.recordId, row.authorityRecordId));
  if (!approved) hard.push(issue('LINE_RENAME_AUTHORITY_MISSING', { current, historical }));
}

function evaluateRole(node, history, hard, review) {
  const current = value(node.logicalRole, node.engineeringRole, node.role).toUpperCase();
  const historical = value(history.logicalRole, history.engineeringRole, history.role).toUpperCase();
  if (!current || !historical) review.push(issue('LOGICAL_ROLE_EVIDENCE_MISSING', { current, historical }));
  else if (current !== historical) hard.push(issue('LOGICAL_ROLE_MISMATCH', { current, historical }));
}

function evaluateConfiguredConflicts(node, history, policy, hard) {
  const rules = policy?.hardEligibility || {};
  fieldConflict(rules.carrier, node.carrierId, history.carrierId, 'CARRIER_CONFLICT', hard);
  fieldConflict(rules.bore, normalizedBore(node.bore ?? node.boreMm), normalizedBore(history.bore ?? history.boreMm), 'BORE_CONFLICT', hard);
  fieldConflict(rules.supportOwner, node.supportOwnerId, history.supportOwnerId, 'SUPPORT_OWNER_CONFLICT', hard);
  fieldConflict(rules.boundaryRole, node.boundaryRole, history.boundaryRole, 'BOUNDARY_ROLE_CONFLICT', hard);
  fieldConflict(rules.junctionRole, node.junctionRole, history.junctionRole, 'JUNCTION_ROLE_CONFLICT', hard);
}

function evaluateLifecycle(history, hard, review) {
  const status = lifecycle(history);
  if (ACTIVE.has(status) || status === 'RETIRED') return;
  if (status === 'REVIEW_REQUIRED' || !status) review.push(issue('LIFECYCLE_REVIEW_REQUIRED', { status }));
  else hard.push(issue('LIFECYCLE_INCOMPATIBLE', { status }));
}

function exactAvailability(result) {
  const availableCurrentIds = new Set(asArray(result?.newNodes)
    .filter((row) => clean(row?.outcome) === 'NO_EXACT_MATCH').map((row) => clean(row.logicalNodeId)));
  const unavailableHistoryIds = new Set();
  for (const bucket of ['matches', 'ambiguous', 'conflicts', 'reactivated']) {
    for (const row of asArray(result?.[bucket])) collectHistoryIds(row, unavailableHistoryIds);
  }
  return { availableCurrentIds, unavailableHistoryIds };
}

function collectHistoryIds(row, output) {
  if (clean(row?.historyNodeId)) output.add(clean(row.historyNodeId));
  for (const field of ['candidates', 'rejectedCandidates']) {
    for (const candidate of asArray(row?.[field])) if (clean(candidate?.historyNodeId)) output.add(clean(candidate.historyNodeId));
  }
  for (const historyNodeId of asArray(row?.competingHistoryNodeIds)) if (clean(historyNodeId)) output.add(clean(historyNodeId));
}

function availableNodes(nodes, ids) {
  const byId = new Map(asArray(nodes).map((row) => [clean(row?.logicalNodeId), row]));
  return [...ids].sort().map((id) => {
    if (!byId.has(id)) throw new TypeError(`Exact unmatched logical node ${id} is absent from currentLogicalNodes.`);
    return byId.get(id);
  });
}

function flattenHistories(registry) {
  const rows = [];
  for (const parent of asArray(registry?.lineHistories)) {
    for (const history of asArray(parent?.historyNodes)) rows.push({
      historyNodeId: required(history?.historyNodeId, 'historyNodeId'), history, parent,
    });
  }
  return rows.sort((a, b) => a.historyNodeId.localeCompare(b.historyNodeId));
}

function currentPosition(node) { return node.registeredPosition || node.position || node.coordinates; }
function squaredDistance(a, b) { const dx = BigInt(a.x - b.x), dy = BigInt(a.y - b.y), dz = BigInt(a.z - b.z); return dx * dx + dy * dy + dz * dz; }
function fieldConflict(enabled, current, historical, code, hard) { if (enabled === true && clean(current) && clean(historical) && clean(current) !== clean(historical)) hard.push(issue(code, { current, historical })); }
function hardCompare(current, historical, code, hard) { if (current !== historical) hard.push(issue(code, { current, historical })); }
function normalizedBore(value_) { const value = Number(value_); return Number.isFinite(value) ? String(value) : clean(value_); }
function lifecycle(history) { return value(history.lifecycleStatus, history.status).toUpperCase(); }
function pathValue(source, path) { return clean(String(path).split('.').reduce((value_, key) => value_?.[key], source)); }
function issue(code, evidence) { return { code, evidence }; }
function sortIssues(rows) { return [...rows].sort((a, b) => issueKey(a).localeCompare(issueKey(b))); }
function issueKey(row) { return `${row.code}|${JSON.stringify(row.evidence)}`; }
function compareState(a, b) { return a.logicalNodeId.localeCompare(b.logicalNodeId); }
function compareCandidate(a, b) { return a.logicalNodeId.localeCompare(b.logicalNodeId) || a.historyNodeId.localeCompare(b.historyNodeId); }
function compareDimension(a, b) { return clean(a.dimensionId).localeCompare(clean(b.dimensionId)); }
function positiveInteger(value_, fallback) { return Number.isInteger(value_) && value_ > 0 ? value_ : fallback; }
function integerBigInt(value_, field) { try { return BigInt(value_); } catch { throw new TypeError(`${field} must be an integer.`); } }
function required(value_, field) { const result = clean(value_); if (!result) throw new TypeError(`${field} is required.`); return result; }
function value(...values) { return clean(values.find((item) => item !== undefined && item !== null && clean(item))); }
function clean(value_) { return String(value_ ?? '').trim(); }
function asArray(value_) { return Array.isArray(value_) ? value_ : []; }
