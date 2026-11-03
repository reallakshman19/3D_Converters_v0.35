import {
  compareText,
  normalizeWorldVector,
  rolesFor,
  validateFamilyEvidence,
} from './family-policy.js';

const PORT_AUTHORITIES = new Set(['mesh-vertex', 'nurbs-control-point']);
const ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const SOURCE_ID_PATTERN = /^\d+$/;
const OCCURRENCE_ID_PATTERN = /^occ:\d+$/;

function fail(message) {
  throw new Error(`BLOCKED_MAPPING ${message}`);
}

function indexMany(items, key) {
  const result = new Map();
  for (const item of items) {
    const value = String(item[key]);
    const list = result.get(value) || [];
    list.push(item);
    result.set(value, list);
  }
  return result;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is required.`);
  return value;
}

function requireId(value, label) {
  const text = requireText(value, label);
  if (!ID_PATTERN.test(text)) fail(`${label} contains unsupported characters.`);
  return text;
}

function requirePattern(value, pattern, label) {
  const text = requireText(value, label);
  if (!pattern.test(text)) fail(`${label} has invalid identity syntax.`);
  return text;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function assertKeys(value, required, optional, label) {
  const record = requireObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(record, key)) fail(`${label}.${key} is required.`);
  for (const key of Object.keys(record)) if (!allowed.has(key)) fail(`${label}.${key} is not allowed.`);
  return record;
}

function validateUnique(items, key, label) {
  const values = new Set();
  for (const item of items) {
    const value = item[key];
    if (values.has(value)) fail(`duplicate ${label} ${value}.`);
    values.add(value);
  }
}

function normalizeConnectionsV1(connections = []) {
  return connections.map((item) => ({ ...item })).sort((left, right) => (
    compareText(left.mappingEntryId, right.mappingEntryId) || compareText(left.port, right.port)
  ));
}

function validatePortV1(port, label) {
  if (!port || typeof port !== 'object') fail(`${label} is required.`);
  if (!PORT_AUTHORITIES.has(port.authority)) fail(`${label} has unsupported authority.`);
  requireText(port.geometryObjectId, `${label}.geometryObjectId`);
  const indexName = port.authority === 'mesh-vertex' ? 'vertexIndex' : 'controlPointIndex';
  if (!Number.isInteger(port[indexName]) || port[indexName] < 0) fail(`${label}.${indexName} is invalid.`);
  if (port.coordinate || port.position || port.xyz) fail(`${label} cannot contain coordinate authority.`);
  if (port.connections !== undefined && !Array.isArray(port.connections)) fail(`${label}.connections must be an array.`);
}

function validateEntryV1(entry) {
  for (const key of ['mappingEntryId', 'logicalComponentId', 'sourceModelObjectId', 'sourceOccurrenceId']) {
    requireText(entry[key], key);
  }
  if (entry.componentType !== 'PIPE') fail(`${entry.mappingEntryId} componentType must be PIPE.`);
  if (entry.scopeDisposition !== 'promote') fail(`${entry.mappingEntryId} must be promoted.`);
  validatePortV1(entry.portA, `${entry.mappingEntryId}.portA`);
  validatePortV1(entry.portB, `${entry.mappingEntryId}.portB`);
}

function normalizeEntriesV1(entries) {
  return entries.map((entry) => ({
    ...entry,
    portA: { ...entry.portA, connections: normalizeConnectionsV1(entry.portA?.connections) },
    portB: { ...entry.portB, connections: normalizeConnectionsV1(entry.portB?.connections) },
  })).sort((left, right) => compareText(left.mappingEntryId, right.mappingEntryId));
}

function normalizeConnectionV2(item, label) {
  const record = assertKeys(item, ['mappingEntryId', 'portId'], [], label);
  return {
    mappingEntryId: requireId(record.mappingEntryId, `${label}.mappingEntryId`),
    portId: requireId(record.portId, `${label}.portId`),
  };
}

function normalizeConnectionsV2(connections, label) {
  if (!Array.isArray(connections)) fail(`${label} must be an array.`);
  const values = connections.map((item, index) => normalizeConnectionV2(item, `${label}[${index}]`));
  values.sort((left, right) => compareText(left.mappingEntryId, right.mappingEntryId) || compareText(left.portId, right.portId));
  if (values.length > 1) fail(`${label} cannot contain multiple connection claims.`);
  return values;
}

function normalizePortV2(port, role, label) {
  const required = ['portId', 'role', 'authority', 'geometryObjectId', 'direction', 'connections'];
  const record = assertKeys(port, required, ['vertexIndex', 'controlPointIndex'], label);
  if (record.role !== role) fail(`${label}.role must be ${role}.`);
  if (!PORT_AUTHORITIES.has(record.authority)) fail(`${label}.authority is unsupported.`);
  const indexName = record.authority === 'mesh-vertex' ? 'vertexIndex' : 'controlPointIndex';
  const otherIndex = indexName === 'vertexIndex' ? 'controlPointIndex' : 'vertexIndex';
  if (!Number.isInteger(record[indexName]) || record[indexName] < 0) fail(`${label}.${indexName} is invalid.`);
  if (record[otherIndex] !== undefined) fail(`${label}.${otherIndex} conflicts with ${record.authority}.`);
  return {
    portId: requireId(record.portId, `${label}.portId`),
    role,
    authority: record.authority,
    geometryObjectId: requirePattern(record.geometryObjectId, SOURCE_ID_PATTERN, `${label}.geometryObjectId`),
    [indexName]: record[indexName],
    direction: normalizeWorldVector(record.direction, `${label}.direction`),
    connections: normalizeConnectionsV2(record.connections, `${label}.connections`),
  };
}

function normalizeEntryV2(entry) {
  const required = [
    'mappingEntryId', 'logicalComponentId', 'sourceModelObjectId', 'sourceOccurrenceId',
    'sourceGeometryObjectIds', 'componentType', 'scopeDisposition', 'ports', 'engineering',
  ];
  const record = assertKeys(entry, required, [], `entry ${entry?.mappingEntryId || ''}`);
  if (record.scopeDisposition !== 'promote') fail(`${record.mappingEntryId} must be promoted.`);
  const roles = rolesFor(record.componentType);
  const portRecord = assertKeys(record.ports, roles, [], `${record.mappingEntryId}.ports`);
  const ports = Object.fromEntries(roles.map((role) => [
    role, normalizePortV2(portRecord[role], role, `${record.mappingEntryId}.ports.${role}`),
  ]));
  validateUnique(Object.values(ports), 'portId', `${record.mappingEntryId} portId`);
  if (!Array.isArray(record.sourceGeometryObjectIds) || !record.sourceGeometryObjectIds.length) {
    fail(`${record.mappingEntryId}.sourceGeometryObjectIds is required.`);
  }
  const sourceGeometryObjectIds = record.sourceGeometryObjectIds.map((id, index) => (
    requirePattern(id, SOURCE_ID_PATTERN, `${record.mappingEntryId}.sourceGeometryObjectIds[${index}]`)
  )).sort(compareText);
  if (new Set(sourceGeometryObjectIds).size !== sourceGeometryObjectIds.length) fail(`${record.mappingEntryId} has duplicate geometry IDs.`);
  return {
    mappingEntryId: requireId(record.mappingEntryId, 'mappingEntryId'),
    logicalComponentId: requireId(record.logicalComponentId, 'logicalComponentId'),
    sourceModelObjectId: requirePattern(record.sourceModelObjectId, SOURCE_ID_PATTERN, 'sourceModelObjectId'),
    sourceOccurrenceId: requirePattern(record.sourceOccurrenceId, OCCURRENCE_ID_PATTERN, 'sourceOccurrenceId'),
    sourceGeometryObjectIds,
    componentType: record.componentType,
    scopeDisposition: 'promote',
    ports,
    engineering: validateFamilyEvidence(record.componentType, ports, record.engineering),
  };
}

function normalizeEntriesV2(entries) {
  return entries.map(normalizeEntryV2).sort((left, right) => compareText(left.mappingEntryId, right.mappingEntryId));
}

function normalizeExclusions(exclusions = [], closed = false) {
  if (!Array.isArray(exclusions)) fail('exclusions must be an array.');
  return exclusions.map((item, index) => {
    if (!closed) return { ...item };
    const label = `exclusions[${index}]`;
    const record = assertKeys(item, ['sourceModelObjectId', 'scopeDisposition', 'reason'], [], label);
    return {
      sourceModelObjectId: requirePattern(record.sourceModelObjectId, SOURCE_ID_PATTERN, `${label}.sourceModelObjectId`),
      scopeDisposition: record.scopeDisposition,
      reason: requireText(record.reason, `${label}.reason`),
    };
  }).sort((left, right) => (
    compareText(left.sourceModelObjectId, right.sourceModelObjectId) || compareText(left.reason, right.reason)
  ));
}

function validateScope(manifest, entries, exclusions) {
  if (!Array.isArray(manifest.inScopeSourceObjectIds) || !manifest.inScopeSourceObjectIds.length) {
    fail('inScopeSourceObjectIds must declare the exact scope.');
  }
  const scope = manifest.inScopeSourceObjectIds.map(String);
  if (new Set(scope).size !== scope.length) fail('scope contains duplicate object IDs.');
  const dispositions = new Map(entries.map((entry) => [entry.sourceModelObjectId, 'promote']));
  for (const excluded of exclusions) {
    if (excluded.scopeDisposition !== 'exclude-with-reason' || !excluded.reason?.trim()) fail('exclusion requires a reason.');
    const id = String(excluded.sourceModelObjectId);
    if (dispositions.has(id)) fail('object has multiple dispositions.');
    dispositions.set(id, 'exclude-with-reason');
  }
  for (const id of scope) if (!dispositions.has(id)) fail(`object ${id} has no disposition.`);
  for (const id of dispositions.keys()) if (!scope.includes(id)) fail(`object ${id} is outside declared scope.`);
  return scope.sort(compareText);
}

function validateSourceResolutionV1(graph, scope, entries) {
  const objects = indexMany(graph.sourceObjects, 'sourceObjectId');
  const occurrences = indexMany(graph.occurrences, 'sourceOccurrenceId');
  const geometry = indexMany(graph.geometries, 'geometryObjectId');
  for (const id of scope) {
    const count = objects.get(id)?.length || 0;
    if (count !== 1) fail(`source object ${id} resolves ${count} times.`);
  }
  for (const entry of entries) {
    const occurrenceList = occurrences.get(entry.sourceOccurrenceId) || [];
    if (occurrenceList.length !== 1) fail(`occurrence ${entry.sourceOccurrenceId} resolves ${occurrenceList.length} times.`);
    const occurrence = occurrenceList[0];
    if (occurrence.sourceModelObjectId !== entry.sourceModelObjectId) fail('occurrence/model identity mismatch.');
    for (const port of [entry.portA, entry.portB]) {
      const list = geometry.get(port.geometryObjectId) || [];
      if (list.length !== 1) fail(`geometry ${port.geometryObjectId} resolves ${list.length} times.`);
      if (!occurrence.geometryObjectIds.includes(port.geometryObjectId)) fail('occurrence does not own referenced geometry.');
    }
  }
}

function claimEvidence(entries) {
  const claims = new Map();
  for (const entry of entries) for (const id of [entry.sourceModelObjectId, ...entry.sourceGeometryObjectIds]) {
    const owner = claims.get(id);
    if (owner && owner !== entry.mappingEntryId) fail(`source evidence ${id} is claimed by ${owner} and ${entry.mappingEntryId}.`);
    claims.set(id, entry.mappingEntryId);
  }
}

function validateSourceResolutionV2(graph, scope, entries) {
  if (graph.schema !== 'FbxSourceGraph.v2') fail('FbxStagedMapping.v2 requires FbxSourceGraph.v2.');
  const objects = indexMany(graph.sourceObjects, 'sourceObjectId');
  const occurrences = indexMany(graph.occurrences, 'sourceOccurrenceId');
  const geometry = indexMany(graph.geometries, 'geometryObjectId');
  for (const id of scope) {
    const source = objects.get(id) || [];
    if (source.length !== 1 || source[0].ufbxElementType !== 'NODE') fail(`source model ${id} is not one authoritative NODE.`);
  }
  claimEvidence(entries);
  for (const entry of entries) {
    const occurrenceList = occurrences.get(entry.sourceOccurrenceId) || [];
    if (occurrenceList.length !== 1) fail(`occurrence ${entry.sourceOccurrenceId} resolves ${occurrenceList.length} times.`);
    const occurrence = occurrenceList[0];
    if (occurrence.sourceModelObjectId !== entry.sourceModelObjectId) fail('occurrence/model identity mismatch.');
    for (const id of entry.sourceGeometryObjectIds) {
      const geometries = geometry.get(id) || [], sources = objects.get(id) || [];
      if (geometries.length !== 1 || sources.length !== 1) fail(`geometry evidence ${id} does not resolve once.`);
      if (!['MESH', 'NURBS_CURVE'].includes(sources[0].ufbxElementType)) fail(`geometry evidence ${id} has invalid type.`);
      if (!occurrence.geometryObjectIds.includes(id)) fail(`occurrence does not own geometry ${id}.`);
    }
    for (const port of Object.values(entry.ports)) {
      if (!entry.sourceGeometryObjectIds.includes(port.geometryObjectId)) fail(`${port.portId} uses undeclared geometry evidence.`);
    }
  }
}

function validateV1(manifest, graph) {
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) fail('mapping entries are required.');
  const entries = normalizeEntriesV1(manifest.entries), exclusions = normalizeExclusions(manifest.exclusions);
  entries.forEach(validateEntryV1);
  validateUnique(entries, 'mappingEntryId', 'mappingEntryId');
  validateUnique(entries, 'logicalComponentId', 'logicalComponentId');
  validateUnique(entries, 'sourceOccurrenceId', 'sourceOccurrenceId');
  const scope = validateScope(manifest, entries, exclusions);
  validateSourceResolutionV1(graph, scope, entries);
  return { schema: manifest.schema, scope, entries, exclusions };
}

function validateV2(manifest, graph) {
  assertKeys(manifest, ['schema', 'inScopeSourceObjectIds', 'entries', 'exclusions'], [], 'manifest');
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) fail('mapping entries are required.');
  if (!Array.isArray(manifest.inScopeSourceObjectIds)) fail('inScopeSourceObjectIds must be an array.');
  const strictScope = manifest.inScopeSourceObjectIds.map((id, index) => (
    requirePattern(id, SOURCE_ID_PATTERN, `inScopeSourceObjectIds[${index}]`)
  ));
  const entries = normalizeEntriesV2(manifest.entries), exclusions = normalizeExclusions(manifest.exclusions, true);
  for (const key of ['mappingEntryId', 'logicalComponentId', 'sourceModelObjectId', 'sourceOccurrenceId']) {
    validateUnique(entries, key, key);
  }
  const scope = validateScope({ ...manifest, inScopeSourceObjectIds: strictScope }, entries, exclusions);
  validateSourceResolutionV2(graph, scope, entries);
  return { schema: manifest.schema, scope, entries, exclusions };
}

export function validateMappingManifest(manifest, graph) {
  if (!manifest) fail('mapping manifest is required.');
  if (manifest.schema === 'FbxStagedMapping.v1') return validateV1(manifest, graph);
  if (manifest.schema === 'FbxStagedMapping.v2') return validateV2(manifest, graph);
  fail('unsupported mapping schema.');
}
