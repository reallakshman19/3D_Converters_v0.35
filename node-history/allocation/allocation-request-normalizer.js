import { deepFreeze, isRecord, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { isCanonicalMainLineKey, issue } from '../registry/registry-contracts.js';

const FORBIDDEN = new Set([
  'engineeringNodeNumber','startNodeNumber','nodeCounter','numberOffset','nodeOffset',
  'baseNodeNumber','numberingSpan','increment','relativeTo','derivedFromOccurrenceId','allocationStart',
]);

export function normalizeAllocationRequests(allocationRequests) {
  const blockers = [], requests = [], seen = new Set();
  if (!Array.isArray(allocationRequests)) return deepFreeze({ requests, blockers: [issue('ALLOCATION_REQUEST_OWNER_MISSING')] });
  for (const [index, raw] of allocationRequests.entries()) {
    const row = isRecord(raw) ? raw : {};
    const logicalNodeId = text(row.logicalNodeId);
    const mainLineKey = text(row.mainLineKey);
    const historyNodeId = text(row.historyNodeId) || null;
    if (!logicalNodeId || !mainLineKey) blockers.push(issue('ALLOCATION_REQUEST_OWNER_MISSING', { index, logicalNodeId, mainLineKey }));
    if (!isCanonicalMainLineKey(mainLineKey)) blockers.push(issue('ALLOCATION_MAIN_LINE_MISMATCH', { index, mainLineKey }));
    if (seen.has(logicalNodeId)) blockers.push(issue('ALLOCATION_REQUEST_DUPLICATE', { logicalNodeId }));
    seen.add(logicalNodeId);
    const forbidden = findForbidden(row);
    if (forbidden.length) blockers.push(issue('ALLOCATION_REQUEST_RELATIVE_NUMBERING_PROHIBITED', { logicalNodeId, fields: forbidden }));
    requests.push({ logicalNodeId, mainLineKey, historyNodeId, occurrenceIds: uniqueText(row.occurrenceIds) });
  }
  requests.sort(compareRequests);
  return deepFreeze({ requests, blockers });
}

export function bindRequestsToMatchResult(requests, result) {
  const blockers = [], outcomes = indexOutcomes(result, blockers), bound = [];
  const requestIds = new Set(requests.map((row) => row.logicalNodeId));
  for (const request of requests) {
    const outcome = outcomes.get(request.logicalNodeId);
    if (!outcome) {
      blockers.push(issue('ALLOCATION_REQUEST_OWNER_MISSING', { logicalNodeId: request.logicalNodeId, reason: 'MATCH_OUTCOME_MISSING' }));
      continue;
    }
    if (request.mainLineKey !== text(result?.mainLineKey)) blockers.push(issue('ALLOCATION_MAIN_LINE_MISMATCH', {
      logicalNodeId: request.logicalNodeId, requestMainLineKey: request.mainLineKey, matchMainLineKey: text(result?.mainLineKey),
    }));
    if (outcome.kind === 'NEW' && request.historyNodeId) blockers.push(issue('HISTORY_NODE_NUMBER_CONFLICT', {
      logicalNodeId: request.logicalNodeId, historyNodeId: request.historyNodeId,
    }));
    if (outcome.kind !== 'NEW' && request.historyNodeId !== outcome.historyNodeId) blockers.push(issue(
      outcome.kind === 'REACTIVATE' ? 'REACTIVATION_OWNER_MISMATCH' : 'HISTORY_NODE_NUMBER_CONFLICT',
      { logicalNodeId: request.logicalNodeId, expected: outcome.historyNodeId, actual: request.historyNodeId },
    ));
    bound.push({ ...request, kind: outcome.kind, approvedHistoryNodeId: outcome.historyNodeId, matchEvidence: outcome.row });
  }
  for (const logicalNodeId of outcomes.keys()) if (!requestIds.has(logicalNodeId)) blockers.push(issue('ALLOCATION_REQUEST_OWNER_MISSING', {
    logicalNodeId, reason: 'REQUEST_MISSING_FOR_MATCH_OUTCOME',
  }));
  return deepFreeze({ bound: bound.sort(compareRequests), blockers });
}

function indexOutcomes(result, blockers) {
  const map = new Map(), historyOwners = new Map();
  addRows(map, historyOwners, result?.matches, 'PRESERVE', blockers);
  addRows(map, historyOwners, result?.reactivated, 'REACTIVATE', blockers);
  addRows(map, historyOwners, result?.newNodes, 'NEW', blockers);
  if ((result?.ambiguous || []).length || (result?.conflicts || []).length) blockers.push(issue('HISTORY_MATCH_RESULT_NOT_PASS', {
    ambiguousCount: result?.ambiguous?.length || 0, conflictCount: result?.conflicts?.length || 0,
  }));
  return map;
}

function addRows(map, historyOwners, rows, kind, blockers) {
  for (const row of Array.isArray(rows) ? rows : []) {
    const logicalNodeId = text(row?.logicalNodeId), historyNodeId = text(row?.historyNodeId) || null;
    if (!logicalNodeId || (kind !== 'NEW' && !historyNodeId)) blockers.push(issue('HISTORY_MATCH_RESULT_NOT_PASS', { kind, logicalNodeId }));
    if (map.has(logicalNodeId)) blockers.push(issue('HISTORY_MATCH_RESULT_NOT_PASS', { logicalNodeId, reason: 'DUPLICATE_OUTCOME' }));
    else map.set(logicalNodeId, { kind, historyNodeId, row: structuredClone(row) });
    if (historyNodeId && historyOwners.has(historyNodeId)) blockers.push(issue('HISTORY_NODE_NUMBER_CONFLICT', {
      historyNodeId, firstLogicalNodeId: historyOwners.get(historyNodeId), logicalNodeId,
    }));
    else if (historyNodeId) historyOwners.set(historyNodeId, logicalNodeId);
  }
}

function findForbidden(value, found = []) {
  if (Array.isArray(value)) value.forEach((child) => findForbidden(child, found));
  else if (isRecord(value)) for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN.has(key)) found.push(key);
    findForbidden(child, found);
  }
  return [...new Set(found)].sort();
}
function uniqueText(value) { return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort(); }
function compareRequests(a, b) { return a.mainLineKey.localeCompare(b.mainLineKey) || a.logicalNodeId.localeCompare(b.logicalNodeId); }
