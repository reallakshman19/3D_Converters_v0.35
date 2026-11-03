import { deepFreeze, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { issue } from '../registry/registry-contracts.js';

export function buildZoneLeaseIndex({ zoneRegistry, lineHistories, policy = {} }) {
  const blockers = [], allByLine = new Map(), activeByLine = new Map(), historyById = new Map();
  const numberOwner = new Map(), occupiedNumbers = new Set(), namespace = zoneRegistry?.namespace || {};
  const reservedNumbers = validatePolicy(zoneRegistry, policy, namespace, blockers);
  const flattened = flattenLeases(zoneRegistry?.leases, namespace, blockers);
  detectOverlap(flattened, blockers);
  for (const row of flattened) {
    addMap(allByLine, row.mainLineKey, row);
    if (row.status === 'ACTIVE') addMap(activeByLine, row.mainLineKey, row);
  }
  for (const history of Array.isArray(lineHistories) ? lineHistories : []) for (const node of history?.historyNodes || []) {
    const historyNodeId = text(node?.historyNodeId), mainLineKey = text(history?.mainLineKey), number = node?.engineeringNodeNumber;
    if (historyById.has(historyNodeId)) blockers.push(issue('HISTORY_NODE_NUMBER_CONFLICT', { historyNodeId, reason: 'DUPLICATE_HISTORY_ID' }));
    historyById.set(historyNodeId, { ...structuredClone(node), mainLineKey });
    if (numberOwner.has(number) && numberOwner.get(number) !== historyNodeId) blockers.push(issue('ENGINEERING_NODE_NUMBER_CONFLICT', {
      engineeringNodeNumber: number, firstHistoryNodeId: numberOwner.get(number), historyNodeId,
    }));
    numberOwner.set(number, historyNodeId);
    if (Number.isInteger(number)) occupiedNumbers.add(number);
  }
  return deepFreeze({ blockers, historyById, occupiedNumbers, reservedNumbers, allByLine, activeByLine });
}

export function leaseEvidence(index, mainLineKeys) {
  const rows = [];
  for (const key of [...new Set(mainLineKeys)].sort()) for (const row of index.activeByLine.get(key) || []) rows.push({
    leaseId: row.leaseId, mainLineKey: row.mainLineKey, start: row.start, end: row.end, step: row.step,
    rangeIndex: row.rangeIndex, status: row.status,
  });
  return rows;
}

export function locateOwnedNumber(index, mainLineKey, number) {
  const active = index.activeByLine.get(mainLineKey) || [];
  if (!index.allByLine.has(mainLineKey)) return { blocker: issue('LEASE_MISSING', { mainLineKey }) };
  if (!active.length) return { blocker: issue('LEASE_INACTIVE', { mainLineKey }) };
  const inBounds = active.filter((row) => number >= row.start && number <= row.end);
  if (!inBounds.length) return { blocker: issue('ALLOCATION_MAIN_LINE_MISMATCH', { mainLineKey, engineeringNodeNumber: number }) };
  const aligned = inBounds.find((row) => (number - row.start) % row.step === 0);
  return aligned ? { lease: aligned } : { blocker: issue('LEASE_STEP_MISMATCH', { mainLineKey, engineeringNodeNumber: number }) };
}

export function lowestAvailableNumber(index, mainLineKey, claimed = new Set()) {
  const active = index.activeByLine.get(mainLineKey) || [];
  if (!index.allByLine.has(mainLineKey)) return { blocker: issue('LEASE_MISSING', { mainLineKey }) };
  if (!active.length) return { blocker: issue('LEASE_INACTIVE', { mainLineKey }) };
  for (const lease of active) for (const number of rangeValues(lease)) {
    if (!index.occupiedNumbers.has(number) && !index.reservedNumbers.has(number) && !claimed.has(number)) return { number, lease };
  }
  return { blocker: issue('LEASE_EXHAUSTED', { mainLineKey }) };
}

function flattenLeases(leases, namespace, blockers) {
  const rows = [];
  for (const lease of Array.isArray(leases) ? leases : []) {
    const status = text(lease?.status), mainLineKey = text(lease?.mainLineKey), leaseId = text(lease?.leaseId);
    if (!['ACTIVE', 'RETIRED'].includes(status)) blockers.push(issue('LEASE_INACTIVE', { leaseId, status }));
    const orderedRanges = [...(lease?.ranges || [])].sort(compareRawRanges);
    for (const [rangeIndex, range] of orderedRanges.entries()) {
      if (!validRange(range, namespace)) blockers.push(issue('LEASE_RANGE_INVALID', { leaseId, rangeIndex, range }));
      else rows.push({ leaseId, mainLineKey, status, rangeIndex, start: range.start, end: range.end, step: range.step });
    }
  }
  return rows.sort(compareRanges);
}

function detectOverlap(rows, blockers) {
  const sorted = [...rows].sort((a, b) => a.start - b.start || b.end - a.end || a.leaseId.localeCompare(b.leaseId));
  let furthest = null;
  for (const current of sorted) {
    if (furthest && current.start <= furthest.end) blockers.push(issue('LEASE_OVERLAP', {
      previous: furthest, current,
    }));
    if (!furthest || current.end > furthest.end) furthest = current;
  }
}

function validatePolicy(registry, policy, namespace, blockers) {
  if (text(policy.policyVersion) !== text(registry?.policyVersion) || text(policy.configVersion) !== text(registry?.configVersion)) blockers.push(issue('ALLOCATION_POLICY_MISMATCH', {
    expectedPolicyVersion: text(registry?.policyVersion), actualPolicyVersion: text(policy.policyVersion),
    expectedConfigVersion: text(registry?.configVersion), actualConfigVersion: text(policy.configVersion),
  }));
  if (text(policy.strategy || 'LOWEST_AVAILABLE') !== 'LOWEST_AVAILABLE') blockers.push(issue('ALLOCATION_POLICY_MISMATCH', { strategy: text(policy.strategy) }));
  if (!Array.isArray(policy.reservedNumbers)) {
    blockers.push(issue('ALLOCATION_POLICY_MISMATCH', { field: 'reservedNumbers', reason: 'ARRAY_REQUIRED' }));
    return new Set();
  }
  const valid = [];
  for (const number of policy.reservedNumbers) {
    if (!Number.isInteger(number) || number < namespace.minimum || number > namespace.maximum) blockers.push(issue(
      'ALLOCATION_POLICY_MISMATCH', { field: 'reservedNumbers', engineeringNodeNumber: number, reason: 'OUTSIDE_NAMESPACE_OR_NON_INTEGER' },
    ));
    else valid.push(number);
  }
  return new Set(valid);
}

function validRange(r, n) { return Number.isInteger(r?.start) && Number.isInteger(r?.end) && Number.isInteger(r?.step) && r.step > 0 && r.start <= r.end && r.start >= n.minimum && r.end <= n.maximum && (r.end - r.start) % r.step === 0; }
function rangeValues(row) { return Array.from({ length: Math.floor((row.end - row.start) / row.step) + 1 }, (_, index) => row.start + index * row.step); }
function addMap(map, key, value) { const rows = map.get(key) || []; rows.push(value); rows.sort(compareRanges); map.set(key, rows); }
function compareRawRanges(a, b) { return (a?.start ?? 0) - (b?.start ?? 0) || (a?.end ?? 0) - (b?.end ?? 0) || (a?.step ?? 0) - (b?.step ?? 0); }
function compareRanges(a, b) { return a.start - b.start || a.end - b.end || a.step - b.step || a.leaseId.localeCompare(b.leaseId); }
