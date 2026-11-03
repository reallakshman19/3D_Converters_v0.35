import { compareText } from '../../zone-geometry/compare.js';

const SUPPORTED_PORT_ROLES = new Set(['A', 'L', 'P']);

function fail(message) {
  throw new TypeError(`FBX connectivity review: ${message}`);
}

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function text(value, label) {
  const result = value === null || value === undefined ? '' : String(value).trim();
  if (!result) fail(`${label} is required.`);
  return result;
}

function optionalText(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function branchIdentity(branch, index) {
  const attributes = objectValue(branch.attributes || {}, `branch ${index}.attributes`);
  return text(attributes.REF ?? branch.id ?? branch.name, `branch ${index} identity`);
}

function componentIdentity(child, branchId, index) {
  const attributes = objectValue(child.attributes || {}, `${branchId} child ${index}.attributes`);
  return text(attributes.REF ?? child.id ?? attributes.mappingEntryId ?? child.name,
    `${branchId} child ${index} identity`);
}

function vectorObject(value, label) {
  if (value === undefined || value === null) return null;
  const record = objectValue(value, label), vector = record.vector;
  if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) {
    fail(`${label}.vector must contain three finite values.`);
  }
  return { authority: optionalText(record.authority), vector: [...vector] };
}

function pointObject(value, label) {
  if (value === undefined || value === null) return null;
  const record = objectValue(value, label);
  const point = [record.x, record.y, record.z];
  if (!point.every(Number.isFinite)) fail(`${label} must contain finite x/y/z values.`);
  return point;
}

function normalizeConnection(value, label) {
  const record = objectValue(value, label);
  return {
    mappingEntryId: text(record.mappingEntryId, `${label}.mappingEntryId`),
    portId: text(record.portId ?? record.port, `${label}.portId`),
  };
}

function normalizeConnections(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value.map((item, index) => normalizeConnection(item, `${label}[${index}]`))
    .sort((left, right) => compareText(left.mappingEntryId, right.mappingEntryId)
      || compareText(left.portId, right.portId));
}

function normalizePort(port, role, mappingEntryId, label) {
  const record = objectValue(port, label);
  const portId = text(record.portId ?? role, `${label}.portId`);
  return {
    endpointId: `${mappingEntryId}:${portId}`,
    mappingEntryId,
    portId,
    role,
    authority: optionalText(record.authority),
    geometryObjectId: optionalText(record.geometryObjectId),
    positionMm: pointObject(record.positionMm, `${label}.positionMm`),
    direction: vectorObject(record.direction, `${label}.direction`),
    connections: normalizeConnections(record.connections, `${label}.connections`),
  };
}

function normalizePorts(attributes, mappingEntryId, label) {
  const ports = objectValue(attributes.ports, `${label}.ports`), result = [];
  for (const role of Object.keys(ports).sort(compareText)) {
    if (!SUPPORTED_PORT_ROLES.has(role)) fail(`${label}.ports.${role} has unsupported role.`);
    result.push(normalizePort(ports[role], role, mappingEntryId, `${label}.ports.${role}`));
  }
  if (!result.length) fail(`${label}.ports must contain at least one port.`);
  const endpointIds = new Set(result.map((port) => port.endpointId));
  if (endpointIds.size !== result.length) fail(`${label} contains duplicate port identities.`);
  return result;
}

function normalizeExplicitConnectivity(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const pairs = value.map((item, index) => {
    if (!Array.isArray(item) || item.length !== 2) fail(`${label}[${index}] must contain two endpoints.`);
    const endpoints = item.map((endpoint) => text(endpoint, `${label}[${index}] endpoint`)).sort(compareText);
    return { pairKey: endpoints.join('|'), endpoints };
  }).sort((left, right) => compareText(left.pairKey, right.pairKey));
  if (new Set(pairs.map((pair) => pair.pairKey)).size !== pairs.length) fail(`${label} contains duplicates.`);
  return pairs;
}

function normalizeGeneration(attributes, label) {
  const value = attributes.mappingEngineering?.generationProvenance;
  if (value === undefined) return null;
  const record = objectValue(value, `${label}.generationProvenance`);
  return {
    generated: record.generated === true,
    generationMethod: optionalText(record.generationMethod),
    sourcePairKey: optionalText(record.sourcePairKey),
    sourceEndpointIds: Array.isArray(record.sourceEndpointIds)
      ? record.sourceEndpointIds.map(String).sort(compareText) : [],
    sourceOccurrenceIds: Array.isArray(record.sourceOccurrenceIds)
      ? record.sourceOccurrenceIds.map(String).sort(compareText) : [],
  };
}

function normalizeComponent(branch, branchIndex, child, childIndex) {
  const branchId = branchIdentity(branch, branchIndex);
  const logicalComponentId = componentIdentity(child, branchId, childIndex);
  const label = `${branchId}::${logicalComponentId}`;
  const attributes = objectValue(child.attributes || {}, `${label}.attributes`);
  const mappingEntryId = text(attributes.mappingEntryId, `${label}.mappingEntryId`);
  return {
    managedRecordId: `${branchId}::${logicalComponentId}`,
    branchId,
    logicalComponentId,
    mappingEntryId,
    nativeType: text(child.type, `${label}.type`).toUpperCase(),
    sourceOccurrenceId: optionalText(attributes.sourceOccurrenceId),
    sourceModelObjectId: optionalText(attributes.sourceModelObjectId),
    generationProvenance: normalizeGeneration(attributes, label),
    ports: normalizePorts(attributes, mappingEntryId, label),
    explicitConnectivity: normalizeExplicitConnectivity(
      attributes.explicitConnectivity, `${label}.explicitConnectivity`),
  };
}

function validateUnique(records, field, label) {
  const values = new Set();
  for (const record of records) {
    if (values.has(record[field])) fail(`duplicate ${label} ${record[field]}.`);
    values.add(record[field]);
  }
}

export function readMappedConnectivityComponents(stagedBranches) {
  if (!Array.isArray(stagedBranches)) fail('stagedBranches must be an array.');
  const components = [];
  stagedBranches.forEach((branch, branchIndex) => {
    if (!Array.isArray(branch?.children)) fail(`branch ${branchIndex}.children must be an array.`);
    branch.children.forEach((child, childIndex) => {
      components.push(normalizeComponent(branch, branchIndex, child, childIndex));
    });
  });
  components.sort((left, right) => compareText(left.managedRecordId, right.managedRecordId));
  validateUnique(components, 'managedRecordId', 'managedRecordId');
  validateUnique(components, 'mappingEntryId', 'mappingEntryId');
  return components;
}
