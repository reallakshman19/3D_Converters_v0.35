import { compareText, rolesFor } from '../family-policy.js';

function fail(message) {
  throw new Error(`BLOCKED_GAP_PIPE ${message}`);
}

function finiteVector(value, label) {
  if (!Array.isArray(value) || value.length !== 3
    || !value.every((item) => Number.isFinite(item))) {
    fail(`${label} must contain three finite values.`);
  }
  return [...value];
}

function endpointParts(endpointId) {
  const split = String(endpointId).lastIndexOf(':');
  if (split <= 0 || split === String(endpointId).length - 1) {
    fail(`endpoint ${String(endpointId)} is invalid.`);
  }
  return {
    entryId: String(endpointId).slice(0, split),
    portId: String(endpointId).slice(split + 1),
  };
}

function entryIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    if (!entry?.mappingEntryId || index.has(entry.mappingEntryId)) {
      fail('mapping entry identities must be unique and non-empty.');
    }
    index.set(entry.mappingEntryId, entry);
  }
  return index;
}

function roleForPort(entry, resolved, portId) {
  return rolesFor(entry.componentType).find((role) => resolved?.[role]?.portId === portId) || null;
}

function directionOf(port, endpointId) {
  const vector = finiteVector(port?.direction?.vector, `${endpointId} direction`);
  return {
    authority: port?.direction?.authority || null,
    vector,
  };
}

export function endpointId(entryId, portId) {
  return `${entryId}:${portId}`;
}

export function linkPairKey(leftId, rightId) {
  return [leftId, rightId].sort(compareText).join('|');
}

export function linkRecord(leftId, rightId) {
  const endpoints = [leftId, rightId].sort(compareText);
  return Object.freeze({ pairKey: endpoints.join('|'), endpoints });
}

export function resolveLinkEndpoint(endpoint, entries, resolvedByEntry) {
  const parts = endpointParts(endpoint);
  const entry = entries.get(parts.entryId);
  const resolved = resolvedByEntry.get(parts.entryId);
  if (!entry || !resolved) fail(`endpoint ${endpoint} references an unavailable mapping entry.`);
  const role = roleForPort(entry, resolved, parts.portId);
  if (!role) fail(`endpoint ${endpoint} does not resolve to a governed port.`);
  const port = resolved[role];
  return Object.freeze({
    endpointId: String(endpoint),
    entryId: parts.entryId,
    portId: parts.portId,
    role,
    entry,
    positionMm: finiteVector(port.positionMm, `${endpoint} positionMm`),
    direction: directionOf(port, endpoint),
  });
}

export function describeLinks(entries, resolvedByEntry, links) {
  const entriesById = entryIndex(entries);
  return [...links].sort((a, b) => compareText(a.pairKey, b.pairKey)).map((link) => {
    if (!Array.isArray(link?.endpoints) || link.endpoints.length !== 2) {
      fail('every connectivity link must contain two endpoints.');
    }
    const left = resolveLinkEndpoint(link.endpoints[0], entriesById, resolvedByEntry);
    const right = resolveLinkEndpoint(link.endpoints[1], entriesById, resolvedByEntry);
    return Object.freeze({ pairKey: linkPairKey(left.endpointId, right.endpointId), left, right });
  });
}

function clonedPort(port) {
  return {
    ...structuredClone(port),
    connections: Array.isArray(port?.connections)
      ? port.connections.map((item) => ({ ...item })) : [],
  };
}

export function cloneResolvedPorts(entries, resolvedByEntry) {
  const result = new Map();
  for (const entry of entries) {
    const source = resolvedByEntry.get(entry.mappingEntryId);
    if (!source) fail(`resolved ports are missing for ${entry.mappingEntryId}.`);
    result.set(entry.mappingEntryId, Object.fromEntries(
      rolesFor(entry.componentType).map((role) => [role, clonedPort(source[role])]),
    ));
  }
  return result;
}

export function setEndpointConnection(resolvedByEntry, endpoint, target) {
  const ports = resolvedByEntry.get(endpoint.entryId);
  if (!ports?.[endpoint.role]) fail(`cannot rewrite ${endpoint.endpointId}.`);
  ports[endpoint.role].connections = [{
    mappingEntryId: target.entryId,
    portId: target.portId,
  }];
}

export function sourceOccurrenceIds(left, right) {
  return [...new Set([
    left.entry.sourceOccurrenceId,
    right.entry.sourceOccurrenceId,
  ].filter(Boolean))].sort(compareText);
}
