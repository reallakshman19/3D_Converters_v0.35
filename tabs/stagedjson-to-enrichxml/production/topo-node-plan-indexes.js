import { text } from '../../../contracts/topo-enriched-xml/contract-core.js';
import { array, issue } from './production-common.js';

export function uniqueIndex(rows, field) {
  const result = new Map();
  for (const row of array(rows)) {
    const key = text(row?.[field]);
    if (!key || result.has(key)) result.set(key, null);
    else result.set(key, row);
  }
  for (const [key, value] of [...result]) if (!value) result.delete(key);
  return result;
}

export function historyIndex(histories) {
  const result = new Map();
  for (const history of array(histories)) for (const node of array(history?.historyNodes)) {
    const historyNodeId = text(node?.historyNodeId);
    if (!historyNodeId || result.has(historyNodeId)) result.set(historyNodeId, null);
    else result.set(historyNodeId, { mainLineKey: text(history.mainLineKey), node });
  }
  for (const [key, value] of [...result]) if (!value) result.delete(key);
  return result;
}

export function validateCurrentHistory(state, logicalNodeId, historyNodeId, allocation) {
  const row = state.currentHistory.get(historyNodeId);
  if (!row) {
    state.blockers.push(issue('CURRENT_REGISTRY_HISTORY_MISSING', { logicalNodeId, historyNodeId }));
    return;
  }
  if (row.node.engineeringNodeNumber !== allocation.engineeringNodeNumber) state.blockers.push(issue(
    'CURRENT_REGISTRY_NUMBER_MISMATCH', {
      logicalNodeId, historyNodeId, expected: allocation.engineeringNodeNumber,
      actual: row.node.engineeringNodeNumber,
    },
  ));
  if (text(row.mainLineKey) !== text(allocation.mainLineKey)) state.blockers.push(issue(
    'CURRENT_REGISTRY_LINE_MISMATCH', {
      logicalNodeId, historyNodeId, expected: text(allocation.mainLineKey), actual: text(row.mainLineKey),
    },
  ));
}

export function groupBy(rows, field) {
  const result = new Map();
  for (const row of array(rows)) append(result, text(row?.[field]), row);
  return result;
}

export function append(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function compareEntry(a, b) {
  return a[0].localeCompare(b[0]);
}
