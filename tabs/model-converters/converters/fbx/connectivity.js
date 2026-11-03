// Validate symmetric FBX mapping connections and return deterministic link ordering.
// Inputs must resolve every referenced port; invalid topology has no fallback.
import { compareText, rolesFor } from './family-policy.js';

function key(entryId, port) {
  return `${entryId}:${port}`;
}

function fail(message) {
  throw new Error(`BLOCKED_MAPPING ${message}`);
}

function addLink(links, pairs, ownerKey, targetKey) {
  const endpoints = [ownerKey, targetKey].sort(compareText);
  const pairKey = endpoints.join('|');
  if (!pairs.has(pairKey)) {
    pairs.add(pairKey);
    links.push({ pairKey, endpoints });
  }
}

export function validateConnectivity(entries, resolvedByEntry) {
  const ports = new Map();
  for (const entry of entries) {
    ports.set(key(entry.mappingEntryId, 'A'), resolvedByEntry.get(entry.mappingEntryId).A);
    ports.set(key(entry.mappingEntryId, 'B'), resolvedByEntry.get(entry.mappingEntryId).B);
  }
  const ownership = new Set(), pairs = new Set(), links = [];
  for (const [ownerKey, port] of ports) for (const connection of port.connections) {
    const targetKey = key(connection.mappingEntryId, connection.port);
    if (targetKey === ownerKey) fail(`self-link ${ownerKey}.`);
    const target = ports.get(targetKey);
    if (!target) fail(`dangling link ${ownerKey} -> ${targetKey}.`);
    const symmetric = target.connections.some((item) => key(item.mappingEntryId, item.port) === ownerKey);
    if (!symmetric) fail(`asymmetric link ${ownerKey} -> ${targetKey}.`);
    addLink(links, pairs, ownerKey, targetKey);
    if (ownership.has(ownerKey)) fail(`duplicate port ownership ${ownerKey}.`);
    ownership.add(ownerKey);
  }
  return links.sort((left, right) => compareText(left.pairKey, right.pairKey));
}

function v2Ports(entries, resolvedByEntry) {
  const ports = new Map();
  for (const entry of entries) for (const role of rolesFor(entry.componentType)) {
    const port = resolvedByEntry.get(entry.mappingEntryId)[role];
    ports.set(key(entry.mappingEntryId, port.portId), port);
  }
  return ports;
}

function opposite(left, right) {
  const a = left.direction.vector, b = right.direction.vector;
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] <= -1 + 1e-8;
}

export function validateConnectivityV2(entries, resolvedByEntry) {
  const ports = v2Ports(entries, resolvedByEntry), pairs = new Set(), links = [];
  for (const [ownerKey, port] of ports) for (const connection of port.connections) {
    const targetKey = key(connection.mappingEntryId, connection.portId);
    const ownerEntryId = ownerKey.slice(0, ownerKey.indexOf(':'));
    if (connection.mappingEntryId === ownerEntryId) fail(`self-link ${ownerKey} -> ${targetKey}.`);
    const target = ports.get(targetKey);
    if (!target) fail(`dangling link ${ownerKey} -> ${targetKey}.`);
    const symmetric = target.connections.some((item) => (
      key(item.mappingEntryId, item.portId) === ownerKey
    ));
    if (!symmetric) fail(`asymmetric link ${ownerKey} -> ${targetKey}.`);
    if (!opposite(port, target)) fail(`connection directions conflict for ${ownerKey} -> ${targetKey}.`);
    addLink(links, pairs, ownerKey, targetKey);
  }
  return links.sort((left, right) => compareText(left.pairKey, right.pairKey));
}
