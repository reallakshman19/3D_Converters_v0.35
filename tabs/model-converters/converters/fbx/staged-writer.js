import { compareText, nativeTypeFor, rolesFor } from './family-policy.js';

const POSITION_EPSILON_MM = 1e-6;

function fail(message) {
  throw new Error(`BLOCKED_STAGEDJSON_CONTRACT ${message}`);
}

function pointObject(port) {
  return { x: port.positionMm[0], y: port.positionMm[1], z: port.positionMm[2] };
}

function portAttributes(port) {
  return {
    authority: port.authority,
    geometryObjectId: port.geometryObjectId,
    positionMm: pointObject(port),
    ...(port.vertexIndex === undefined ? {} : { vertexIndex: port.vertexIndex }),
    ...(port.controlPointIndex === undefined ? {} : { controlPointIndex: port.controlPointIndex }),
    connections: port.connections.map((item) => ({ ...item })),
  };
}

function adjacencyFor(entries, links) {
  const adjacency = new Map(entries.map((entry) => [entry.mappingEntryId, []]));
  for (const link of links) {
    const [left, right] = link.endpoints.map((value) => {
      const split = value.lastIndexOf(':');
      return { entryId: value.slice(0, split), port: value.slice(split + 1) };
    });
    adjacency.get(left.entryId).push({ localPort: left.port, targetId: right.entryId, targetPort: right.port });
    adjacency.get(right.entryId).push({ localPort: right.port, targetId: left.entryId, targetPort: left.port });
  }
  return adjacency;
}

function connectedComponents(entries, adjacency) {
  const remaining = new Set(entries.map((entry) => entry.mappingEntryId)), components = [];
  while (remaining.size) {
    const start = [...remaining].sort(compareText)[0], stack = [start], ids = [];
    while (stack.length) {
      const id = stack.pop();
      if (!remaining.delete(id)) continue;
      ids.push(id);
      for (const edge of adjacency.get(id)) if (remaining.has(edge.targetId)) stack.push(edge.targetId);
    }
    components.push(ids.sort(compareText));
  }
  return components;
}

function pathOrder(componentIds, adjacency) {
  for (const id of componentIds) if (adjacency.get(id).length > 2) fail(`component ${id} is not a linear PIPE path.`);
  const endpoints = componentIds.filter((id) => adjacency.get(id).length < 2).sort(compareText);
  if (!endpoints.length && componentIds.length > 1) fail('cyclic PIPE connectivity is not representable as native branch order.');
  const ordered = [], visited = new Set();
  let current = endpoints[0] || componentIds[0], previous = null, incomingPort = null;
  while (current) {
    if (visited.has(current)) fail('cyclic PIPE fconnectivity is not representable as native branch order.');
    visited.add(current);
    const nextEdges = adjacency.get(current).filter((edge) => edge.targetId !== previous);
    if (nextEdges.length > 1) fail(`component ${current} has ambiguous branch order.`);
    const outgoing = nextEdges[0] || null;
    ordered.push({ entryId: current, incomingPort, outgoingPort: outgoing?.localPort || null });
    previous = current;
    current = outgoing?.targetId || null;
    incomingPort = outgoing?.targetPort || null;
  }
  if (visited.size !== componentIds.length) fail('PIPE connectivity traversal was incomplete.');
  return ordered;
}

function orientedPorts(step, ports) {
  if (!step.incomingPort && !step.outgoingPort) return { start: ports.A, end: ports.B };
  if (!step.incomingPort) return step.outgoingPort === 'A'
    ? { start: ports.B, end: ports.A } : { start: ports.A, end: ports.B };
  if (!step.outgoingPort) return step.incomingPort === 'A'
    ? { start: ports.A, end: ports.B } : { start: ports.B, end: ports.A };
  if (step.incomingPort === step.outgoingPort) fail(`component ${step.entryId} reuses one port for two links.`);
  return { start: ports[step.incomingPort], end: ports[step.outgoingPort] };
}

function assertCoincident(left, right, label) {
  const residual = Math.hypot(
    left.positionMm[0] - right.positionMm[0],
    left.positionMm[1] - right.positionMm[1],
    left.positionMm[2] - right.positionMm[2],
  );
  if (residual > POSITION_EPSILON_MM) efail(`${label} has ${residual} mm endpoint residual.`);
}

function componentNode(entry, ports, links) {
  return {
    type: 'PIPE', id: entry.logicalComponentId, name: entry.logicalComponentId,
    attributes: {
      REF: entry.logicalComponentId, APOS: pointObject(ports.start), LPOS: pointObject(ports.end),
      mappingEntryId: entry.mappingEntryId, logicalComponentId: entry.logicalComponentId,
      sourceModelObjectId: entry.sourceModelObjectId, sourceOccurrenceId: entry.sourceOccurrenceId,
      ports: { A: portAttributes(ports.A), B: portAttributes(ports.B) },
      explicitConnectivity: links.filter((link) => (
        link.endpoints.some((value) => value.startsWith(`${entry.mappingEntryId}:`))
      )).map((link) => [...link.endpoints]),
    },
    children: [],
  };
}

function branchNode(index, ordered, entryById, resolvedByEntry, links) {
  const children = ordered.map((step) => {
    const raw = resolvedByEntry.get(step.entryId), oriented = orientedPorts(step, raw);
    return componentNode(entryById.get(step.entryId), { ...raw, ...oriented }, links);
  });
  for (let position = 1; position < children.length; position += 1) {
    const left = resolvedByEntry.get(ordered[position - 1].entryId)[ordered[position - 1].outgoingPort];
    const right = resolvedByEntry.get(ordered[position].entryId)[ordered[position].incomingPort];
    assertCoincident(left, right, `${ordered[position - 1].entryId} -> ${ordered[position].entryId}`);
  }
  return {
    type: 'BRANCH', id: `FBX-BRANCH-${String(index + 1).padStart(4, '0')}`,
    name: `FBX Mapping Branch ${index + 1}`,
    attributes: {
      REF: `FBX-BRANCH-${String(index + 1).padStart(4, '0')}`,
      HPOS: children[0].attributes.APOS, TPOS: children.at(-1).attributes.LPOS,
      sourceFormat: 'FBX', mappingSchema: 'FbxStagedMapping.v1',
      connectivityAuthority: 'explicit-mapping-port-links',
    }, children,
  };
}

export function writeNativeStagedJson(entries, resolvedByEntry, links) {
  const entryById = new Map(entries.map((entry) => [entry.mappingEntryId, entry]));
  const adjacency = adjacencyFor(entries, links);
  return connectedComponents(entries, adjacency).map((ids, index) => (
    branchNode(index, pathOrder(ids, adjacency), entryById, resolvedByEntry, links)
  ));
}

function endpoint(value, entries, resolvedByEntry) {
  const split = value.indexOf(':'), entryId = value.slice(0, split), portId = value.slice(split + 1);
  const entry = entries.get(entryId);
  const role = rolesFor(entry.componentType).find((candidate) => resolvedByEntry.get(entryId)[candidate].portId === portId);
  if (!role) fail(`port ${value} cannot be resolved.`);
  return { entryId, portId, role };
}

function graphV2(entries, resolvedByEntry, links) {
  const entryById = new Map(entries.map((entry) => [entry.mappingEntryId, entry]));
  const adjacency = new Map(entries.map((entry) => [entry.mappingEntryId, []])), cuts = [];
  for (const link of links) {
    const ends = link.endpoints.map((value) => endpoint(value, entryById, resolvedByEntry));
    const pEnds = ends.filter((item) => item.role === 'P');
    if (pEnds.length) {
      if (pEnds.length !== 1) fail(`unsupported P-to-P link ${link.pairKey}.`);
      const tee = entryById.get(pEnds[0].entryId);
      if (tee.componentType !== 'TEE') fail(`non-TEE branch port ${pEnds[0].entryId}.`);
      cuts.push({ tee: pEnds[0], target: ends.find((item) => item !== pEnds[0]), link });
      continue;
    }
    const [left, right] = ends;
    adjacency.get(left.entryId).push({ localPort: left.role, targetId: right.entryId, targetPort: right.role });
    adjacency.get(right.entryId).push({ localPort: right.role, targetId: left.entryId, targetPort: left.role });
  }
  return { entryById, adjacency, cuts };
}

function segmentOrder(ids, adjacency, anchor = null) {
  for (const id of ids) if (adjacency.get(id).length > 2) fail(`component ${id} has unsupported nonlinear run connectivity.`);
  const endpoints = ids.filter((id) => adjacency.get(id).length < 2).sort(compareText);
  if (!endpoints.length && ids.length > 1) fail('cyclic mapped connectivity is not representable.');
  if (anchor && !endpoints.includes(anchor.entryId)) fail(`branch target ${anchor.entryId} is not a route endpoint.`);
  const ordered = [], visited = new Set();
  let current = anchor?.entryId || endpoints[0] || ids[0], previous = null, incomingPort = anchor?.role || null;
  while (current) {
    if (visited.has(current)) fail('cyclic mapped connectivity is not representable.');
    visited.add(current);
    const candidates = adjacency.get(current).filter((edge) => edge.targetId !== previous);
    if (candidates.length > 1) fail(`component ${current} has ambiguous route order.`);
    const outgoing = candidates[0] || null;
    if (incomingPort && outgoing?.localPort === incomingPort) fail(`component ${current} reuses ${incomingPort}.`);
    ordered.push({ entryId: current, incomingPort, outgoingPort: outgoing?.localPort || null });
    previous = current; current = outgoing?.targetId || null; incomingPort = outgoing?.targetPort || null;
  }
  if (visited.size !== ids.length) fail('mapped route traversal was incomplete.');
  return ordered;
}

function v2Segments(entries, graph) {
  const components = connectedComponents(entries, graph.adjacency).map((ids) => ({ ids, key: ids.join('|') }));
  components.sort((left, right) => compareText(left.key, right.key));
  const segmentByEntry = new Map();
  components.forEach((segment, index) => segment.ids.forEach((id) => segmentByEntry.set(id, index)));
  for (const cut of graph.cuts) {
    cut.teeSegment = segmentByEntry.get(cut.tee.entryId);
    cut.targetSegment = segmentByEntry.get(cut.target.entryId);
    if (cut.teeSegment === cut.targetSegment) fail(`TEE branch link ${cut.link.pairKey} reconnects one route segment.`);
  }
  return { components, segmentByEntry };
}

function orientedRun(step, entry, ports) {
  if (entry.componentType === 'TEE' && [step.incomingPort, step.outgoingPort].includes('P')) {
    fail('TEE P cannot be part of run order.');
  }
  let startRole = 'A', endRole = 'L';
  if (!step.incomingPort && step.outgoingPort === 'A') [startRole, endRole] = ['L', 'A'];
  else if (step.incomingPort && !step.outgoingPort) {
    [startRole, endRole] = step.incomingPort === 'A' ? ['A', 'L'] : ['L', 'A'];
  } else if (step.incomingPort && step.outgoingPort) {
    if (step.incomingPort === step.outgoingPort) fail(`component ${step.entryId} reuses ${step.incomingPort}.`);
    [startRole, endRole] = [step.incomingPort, step.outgoingPort];
  }
  return { start: ports[startRole], end: ports[endRole], startRole, endRole };
}

function portAttributesV2(port) {
  return {
    ...portAttributes(port), portId: port.portId, role: port.role,
    direction: { authority: port.direction.authority, vector: [...port.direction.vector] },
  };
}

function componentNodeV2(entry, ports, oriented, links, cref) {
  const attributes = {
    REF: entry.logicalComponentId, APOS: pointObject(oriented.start), LPOS: pointObject(oriented.end),
    ...(entry.componentType === 'TEE' ? { POS: pointObject(ports.P) } : {}),
    ...(cref ? { CREF: cref } : {}),
    mappingEntryId: entry.mappingEntryId, logicalComponentId: entry.logicalComponentId,
    sourceModelObjectId: entry.sourceModelObjectId, sourceOccurrenceId: entry.sourceOccurrenceId,
    sourceGeometryObjectIds: [...entry.sourceGeometryObjectIds], mappingEngineering: structuredClone(entry.engineering),
    ports: Object.fromEntries(rolesFor(entry.componentType).map((role) => [role, portAttributesV2(ports[role])])),
    explicitConnectivity: links.filter((link) => (
      link.endpoints.some((value) => value.startsWith(`${entry.mappingEntryId}:`))
    )).map((link) => [...link.endpoints]),
  };
  return { type: nativeTypeFor(entry.componentType), id: entry.logicalComponentId, name: entry.logicalComponentId, attributes, children: [] };
}

function branchReferences(segmentIndex, ordered, cuts, entryById) {
  const result = {};
  for (const cut of cuts.filter((item) => item.targetSegment === segmentIndex)) {
    const first = ordered[0], last = ordered.at(-1);
    const firstRole = first.startRole, lastRole = last.endRole;
    const teeRef = entryById.get(cut.tee.entryId).logicalComponentId;
    if (cut.target.entryId === first.entryId && cut.target.role === firstRole) result.HREF = teeRef;
    else if (cut.target.entryId === last.entryId && cut.target.role === lastRole) result.TREF = teeRef;
    else fail(`TEE branch target ${cut.target.entryId}:${cut.target.role} is not a branch endpoint.`);
  }
  return result;
}

function v2Metadata(options = {}) {
  return {
    mappingSchema: options.mappingSchema || 'FbxStagedMapping.v2',
    connectivityAuthority: options.connectivityAuthority || 'explicit-mapping-port-links',
  };
}

export function writeNativeStagedJsonV2(entries, resolvedByEntry, links, options = {}) {
  const graph = graphV2(entries, resolvedByEntry, links), { components } = v2Segments(entries, graph);
  const metadata = v2Metadata(options);
  const branchNames = components.map((_, index) => `FBX Mapping Branch ${index + 1}`);
  const cutsByTee = new Map(graph.cuts.map((cut) => [cut.tee.entryId, branchNames[cut.targetSegment]]));
  return components.map((segment, index) => {
    const anchors = graph.cuts.filter((cut) => cut.targetSegment === index).map((cut) => cut.target);
    if (anchors.length > 2) fail(`route segment ${segment.key} has too many branch references.`);
    const steps = segmentOrder(segment.ids, graph.adjacency, anchors.sort((a, b) => compareText(a.entryId, b.entryId))[0]);
    const ordered = steps.map((step) => {
      const entry = graph.entryById.get(step.entryId), ports = resolvedByEntry.get(step.entryId);
      return { ...step, entry, ports, ...orientedRun(step, entry, ports) };
    });
    for (let position = 1; position < ordered.length; position += 1) {
      assertCoincident(ordered[position - 1].end, ordered[position].start, `${ordered[position - 1].entryId} -> ${ordered[position].entryId}`);
    }
    for (const cut of graph.cuts.filter((item) => item.targetSegment === index)) {
      const teePort = resolvedByEntry.get(cut.tee.entryId).P;
      const targetPort = resolvedByEntry.get(cut.target.entryId)[cut.target.role];
      assertCoincident(teePort, targetPort, cut.link.pairKey);
    }
    const references = branchReferences(index, ordered, graph.cuts, graph.entryById);
    const children = ordered.map((item) => componentNodeV2(
      item.entry, item.ports, item, links, cutsByTee.get(item.entryId),
    ));
    const id = `FBX-BRANCH-${String(index + 1).padStart(4, '0')}`;
    return {
      type: 'BRANCH', id, name: branchNames[index], attributes: {
        REF: id, HPOS: children[0].attributes.APOS, TPOS: children.at(-1).attributes.LPOS,
        ...references, sourceFormat: 'FBX', ...metadata,
      }, children,
    };
  });
}
