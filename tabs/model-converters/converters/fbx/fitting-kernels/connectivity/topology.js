import { compareText } from '../../zone-geometry/compare.js';

function endpointOwner(endpointId, componentByMapping) {
  const split = endpointId.indexOf(':');
  return componentByMapping.get(endpointId.slice(0, split)) || null;
}

function adjacencyIndex(components, links) {
  const adjacency = new Map(components.map((component) => [component.managedRecordId, new Set()]));
  const byMapping = new Map(components.map((component) => [component.mappingEntryId, component]));
  for (const link of links) {
    const left = endpointOwner(link.endpoints[0], byMapping);
    const right = endpointOwner(link.endpoints[1], byMapping);
    if (!left || !right || left.managedRecordId === right.managedRecordId) continue;
    adjacency.get(left.managedRecordId).add(right.managedRecordId);
    adjacency.get(right.managedRecordId).add(left.managedRecordId);
  }
  return adjacency;
}

function connectedIds(start, remaining, adjacency) {
  const pending = [start], ids = [];
  while (pending.length) {
    const current = pending.pop();
    if (!remaining.delete(current)) continue;
    ids.push(current);
    for (const target of [...adjacency.get(current)].sort(compareText).reverse()) {
      if (remaining.has(target)) pending.push(target);
    }
  }
  return ids.sort(compareText);
}

function linkCountFor(ids, links, byMapping) {
  const set = new Set(ids), keys = new Set();
  for (const link of links) {
    const owners = link.endpoints.map((endpoint) => endpointOwner(endpoint, byMapping));
    if (owners.every((owner) => owner && set.has(owner.managedRecordId))) keys.add(link.pairKey);
  }
  return keys.size;
}

function topologyKind(componentCount, linkCount, degrees) {
  if (componentCount === 1 && linkCount === 0) return 'ISOLATED';
  const maximumDegree = Math.max(...degrees, 0);
  const allDegreeTwo = degrees.length > 1 && degrees.every((value) => value === 2);
  if (allDegreeTwo && linkCount === componentCount) return 'CYCLIC';
  if (maximumDegree > 2) return 'BRANCHED';
  if (linkCount === componentCount - 1 && maximumDegree <= 2) return 'LINEAR';
  return 'NETWORK';
}

function groupCounts(ids, components) {
  const records = ids.map((id) => components.get(id));
  return {
    openPortCount: records.reduce((sum, item) => sum + item.openPortCount, 0),
    boundaryLinkCount: records.reduce((sum, item) => sum + item.boundaryLinkCount, 0),
    blockedComponentCount: records.filter((item) => item.status === 'BLOCKED').length,
  };
}

function buildGroups(componentList, links, adjacency) {
  const components = new Map(componentList.map((component) => [component.managedRecordId, component]));
  const byMapping = new Map(componentList.map((component) => [component.mappingEntryId, component]));
  const remaining = new Set(componentList.map((component) => component.managedRecordId));
  const groups = [];
  while (remaining.size) {
    const start = [...remaining].sort(compareText)[0];
    const ids = connectedIds(start, remaining, adjacency);
    const degrees = ids.map((id) => adjacency.get(id).size);
    const internalLinkCount = linkCountFor(ids, links, byMapping);
    groups.push({
      groupId: `GROUP-${String(groups.length + 1).padStart(4, '0')}`,
      componentIds: ids,
      componentCount: ids.length,
      internalLinkCount,
      maximumInternalDegree: Math.max(...degrees, 0),
      topology: topologyKind(ids.length, internalLinkCount, degrees),
      ...groupCounts(ids, components),
    });
  }
  return groups;
}

function componentGroupIndex(groups) {
  const index = new Map();
  for (const group of groups) for (const id of group.componentIds) index.set(id, group.groupId);
  return index;
}

function annotateComponents(components, groups) {
  const index = componentGroupIndex(groups);
  return components.map((component) => ({
    ...component,
    groupId: index.get(component.managedRecordId),
  }));
}

function annotatePorts(ports, components) {
  const index = new Map(components.map((component) => [component.managedRecordId, component.groupId]));
  return ports.map((port) => ({ ...port, groupId: index.get(port.managedRecordId) }));
}

export function deriveConnectivityTopology(graph) {
  const adjacency = adjacencyIndex(graph.components, graph.internalLinks);
  const groups = buildGroups(graph.components, graph.internalLinks, adjacency);
  const components = annotateComponents(graph.components, groups);
  return {
    ...graph,
    components,
    ports: annotatePorts(graph.ports, components),
    groups,
  };
}
