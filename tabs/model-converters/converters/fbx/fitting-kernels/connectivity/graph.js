import { compareText } from '../../zone-geometry/compare.js';

const GAP_METHOD = 'EXPLICIT_LINK_STRAIGHT_GAP_V1';
const BLOCKING_CODES = new Set([
  'MISSING_CROSSWALK_RECORD',
  'UNRESOLVED_SOURCE_BINDING',
  'UNSUPPORTED_GENERATED_AUTHORITY',
  'MULTIPLE_PORT_CONNECTIONS',
  'SELF_LINK',
  'ASYMMETRIC_LINK',
  'EXPLICIT_CONNECTIVITY_MISMATCH',
  'DUPLICATE_ENDPOINT',
]);

function endpointKey(connection) {
  return `${connection.mappingEntryId}:${connection.portId}`;
}

function pairFor(left, right) {
  const endpoints = [left, right].sort(compareText);
  return { pairKey: endpoints.join('|'), endpoints };
}

function diagnostic(code, subjectId, detail, blocking = BLOCKING_CODES.has(code)) {
  return { code, subjectId, detail, blocking };
}

function crosswalkIndex(componentCrosswalk) {
  const records = componentCrosswalk?.managedComponents;
  if (!Array.isArray(records)) throw new TypeError('FBX connectivity review: managedComponents must be an array.');
  return new Map(records.map((record) => [record.managedRecordId, record]));
}

function endpointIndex(components, diagnostics) {
  const endpoints = new Map();
  for (const component of components) for (const port of component.ports) {
    if (endpoints.has(port.endpointId)) {
      diagnostics.push(diagnostic('DUPLICATE_ENDPOINT', port.endpointId,
        `Endpoint is owned by ${endpoints.get(port.endpointId).managedRecordId} and ${component.managedRecordId}.`));
      continue;
    }
    endpoints.set(port.endpointId, { component, port });
  }
  return endpoints;
}

function explicitPairSet(component) {
  return new Set(component.explicitConnectivity.map((pair) => pair.pairKey));
}

function generatedAuthority(component, record) {
  const provenance = component.generationProvenance;
  return record.disposition === 'GENERATED_MANAGED_COMPONENT'
    && record.generationProvenanceStatus === 'EVIDENCED'
    && provenance?.generated === true
    && provenance.generationMethod === GAP_METHOD;
}

function authorityDisposition(component, crosswalk, diagnostics) {
  const record = crosswalk.get(component.managedRecordId);
  if (!record) {
    diagnostics.push(diagnostic('MISSING_CROSSWALK_RECORD', component.managedRecordId,
      'Mapped component is absent from the selected-zone component crosswalk.'));
    return { disposition: 'BLOCKED', exactSourceOccurrenceId: null };
  }
  if (generatedAuthority(component, record)) {
    return { disposition: 'EVIDENCED', exactSourceOccurrenceId: null };
  }
  if (record.disposition === 'GENERATED_MANAGED_COMPONENT') {
    diagnostics.push(diagnostic('UNSUPPORTED_GENERATED_AUTHORITY', component.managedRecordId,
      `Generated component method is ${component.generationProvenance?.generationMethod || 'UNRESOLVED'}.`));
    return { disposition: 'BLOCKED', exactSourceOccurrenceId: null };
  }
  if (record.disposition !== 'MATCHED_SOURCE_COMPONENT' || !record.exactSourceOccurrenceId) {
    diagnostics.push(diagnostic('UNRESOLVED_SOURCE_BINDING', component.managedRecordId,
      `Crosswalk disposition is ${record.disposition || 'UNKNOWN'}.`));
    return { disposition: 'BLOCKED', exactSourceOccurrenceId: record.exactSourceOccurrenceId || null };
  }
  return { disposition: 'EVIDENCED', exactSourceOccurrenceId: record.exactSourceOccurrenceId };
}

function reciprocalClaim(target, ownerEndpointId) {
  return target.port.connections.some((connection) => endpointKey(connection) === ownerEndpointId);
}

function explicitPairPresent(component, pairKey) {
  return explicitPairSet(component).has(pairKey);
}

function validateExplicitPair(owner, target, pair, diagnostics) {
  if (!explicitPairPresent(owner.component, pair.pairKey)) {
    diagnostics.push(diagnostic('EXPLICIT_CONNECTIVITY_MISMATCH', owner.port.endpointId,
      `Component explicitConnectivity omits ${pair.pairKey}.`));
  }
  if (target && !explicitPairPresent(target.component, pair.pairKey)) {
    diagnostics.push(diagnostic('EXPLICIT_CONNECTIVITY_MISMATCH', target.port.endpointId,
      `Target component explicitConnectivity omits ${pair.pairKey}.`));
  }
}

function classifyClaim(owner, connection, endpoints, diagnostics) {
  const targetId = endpointKey(connection), pair = pairFor(owner.port.endpointId, targetId);
  if (targetId === owner.port.endpointId) {
    diagnostics.push(diagnostic('SELF_LINK', owner.port.endpointId, `Port claims itself through ${pair.pairKey}.`));
    return { kind: 'BLOCKED', targetId, pair };
  }
  const target = endpoints.get(targetId);
  if (!target) {
    validateExplicitPair(owner, null, pair, diagnostics);
    return { kind: 'ZONE_BOUNDARY', targetId, pair };
  }
  if (!reciprocalClaim(target, owner.port.endpointId)) {
    diagnostics.push(diagnostic('ASYMMETRIC_LINK', owner.port.endpointId,
      `Target ${targetId} does not reciprocate the connection.`));
    return { kind: 'BLOCKED', targetId, target, pair };
  }
  validateExplicitPair(owner, target, pair, diagnostics);
  return { kind: 'INTERNAL', targetId, target, pair };
}

function portDiagnosticCodes(port, diagnostics) {
  return diagnostics.filter((item) => item.subjectId === port.endpointId)
    .map((item) => item.code).sort(compareText);
}

function portRecord(owner, claim, diagnostics) {
  const codes = portDiagnosticCodes(owner.port, diagnostics);
  const blocked = codes.some((code) => BLOCKING_CODES.has(code));
  const disposition = blocked ? 'BLOCKED'
    : claim?.kind === 'INTERNAL' ? 'CONNECTED_INTERNAL'
      : claim?.kind === 'ZONE_BOUNDARY' ? 'CONNECTED_BOUNDARY' : 'OPEN';
  return {
    endpointId: owner.port.endpointId,
    managedRecordId: owner.component.managedRecordId,
    mappingEntryId: owner.component.mappingEntryId,
    logicalComponentId: owner.component.logicalComponentId,
    role: owner.port.role,
    portId: owner.port.portId,
    positionMm: owner.port.positionMm,
    direction: owner.port.direction,
    disposition,
    targetEndpointId: claim?.targetId || null,
    diagnosticCodes: codes,
  };
}

function claimForPort(owner, endpoints, diagnostics) {
  const connections = owner.port.connections;
  if (!connections.length) return null;
  if (connections.length > 1) {
    diagnostics.push(diagnostic('MULTIPLE_PORT_CONNECTIONS', owner.port.endpointId,
      `Port contains ${connections.length} explicit connection claims.`));
    return { kind: 'BLOCKED', targetId: null, pair: null };
  }
  return classifyClaim(owner, connections[0], endpoints, diagnostics);
}

function uniqueEdges(claims, kind) {
  const index = new Map();
  for (const claim of claims) {
    if (claim.kind !== kind || !claim.pair) continue;
    if (!index.has(claim.pair.pairKey)) index.set(claim.pair.pairKey, claim.pair);
  }
  return [...index.values()].sort((left, right) => compareText(left.pairKey, right.pairKey));
}

function componentRecords(components, ports, crosswalk, diagnostics) {
  const portsByComponent = new Map();
  for (const port of ports) {
    const values = portsByComponent.get(port.managedRecordId) || [];
    values.push(port); portsByComponent.set(port.managedRecordId, values);
  }
  return components.map((component) => {
    const authority = authorityDisposition(component, crosswalk, diagnostics);
    const componentPorts = (portsByComponent.get(component.managedRecordId) || [])
      .sort((left, right) => compareText(left.endpointId, right.endpointId));
    const blocked = authority.disposition === 'BLOCKED'
      || componentPorts.some((port) => port.disposition === 'BLOCKED');
    return {
      managedRecordId: component.managedRecordId,
      branchId: component.branchId,
      mappingEntryId: component.mappingEntryId,
      logicalComponentId: component.logicalComponentId,
      nativeType: component.nativeType,
      sourceOccurrenceId: authority.exactSourceOccurrenceId || component.sourceOccurrenceId,
      authorityDisposition: authority.disposition,
      status: blocked ? 'BLOCKED' : 'EVIDENCED',
      portEndpointIds: componentPorts.map((port) => port.endpointId),
      internalLinkCount: componentPorts.filter((port) => port.disposition === 'CONNECTED_INTERNAL').length,
      boundaryLinkCount: componentPorts.filter((port) => port.disposition === 'CONNECTED_BOUNDARY').length,
      openPortCount: componentPorts.filter((port) => port.disposition === 'OPEN').length,
      blockedPortCount: componentPorts.filter((port) => port.disposition === 'BLOCKED').length,
    };
  }).sort((left, right) => compareText(left.managedRecordId, right.managedRecordId));
}

export function buildConnectivityGraph(components, componentCrosswalk) {
  const diagnostics = [], crosswalk = crosswalkIndex(componentCrosswalk);
  const endpoints = endpointIndex(components, diagnostics), claims = [], ports = [];
  for (const owner of endpoints.values()) {
    const claim = claimForPort(owner, endpoints, diagnostics);
    claims.push({ owner, ...(claim || { kind: 'OPEN', targetId: null, pair: null }) });
  }
  for (const claim of claims) ports.push(portRecord(claim.owner, claim, diagnostics));
  const componentRecordsValue = componentRecords(components, ports, crosswalk, diagnostics);
  const orderedDiagnostics = diagnostics.sort((left, right) => compareText(left.code, right.code)
    || compareText(left.subjectId, right.subjectId) || compareText(left.detail, right.detail));
  return {
    components: componentRecordsValue,
    ports: ports.sort((left, right) => compareText(left.endpointId, right.endpointId)),
    internalLinks: uniqueEdges(claims, 'INTERNAL'),
    boundaryLinks: uniqueEdges(claims, 'ZONE_BOUNDARY'),
    diagnostics: orderedDiagnostics,
  };
}
