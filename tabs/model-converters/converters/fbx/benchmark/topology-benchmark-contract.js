/**
 * Closed input normalization for FBX topology benchmark qualification.
 * No engineering identity, zone, or tolerance is inferred in this module.
 */

export const TOPOLOGY_RELATIONSHIP_KINDS = Object.freeze([
  'BRANCH_OWNERSHIP',
  'FLOW_ADJACENCY',
  'REFERENCE_ADJACENCY',
  'SUPPORT_HOST',
  'ZONE_BOUNDARY',
]);

export const FAIL_STATES = Object.freeze(new Set([
  'ENDPOINT_MISMATCH', 'RELATIONSHIP_KIND_CONFLICT', 'RECIPROCITY_MISMATCH',
  'ZONE_BOUNDARY_MISMATCH', 'MISSING_ACTUAL', 'UNEXPECTED_ACTUAL',
  'DUPLICATE_EDGE', 'SELF_CONNECTION',
]));

const KIND_SET = new Set(TOPOLOGY_RELATIONSHIP_KINDS);

export function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
  return value.trim();
}

function nullableText(value, label) {
  return value == null || value === '' ? null : text(value, label);
}

export function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function stableUnique(values) {
  return [...new Set(values)].sort(compareText);
}

export function endpoint(entityId, portRole) {
  return `${entityId ?? '@UNRESOLVED'}:${portRole ?? ''}`;
}

export function directedEndpointKey(relationship) {
  const left = endpoint(relationship.sourceEntityId, relationship.sourcePortRole);
  const right = endpoint(relationship.targetEntityId, relationship.targetPortRole);
  return relationship.directed ? `${left}->${right}` : [left, right].sort(compareText).join('<->');
}

export function reciprocityKey(relationship) {
  const pair = [
    endpoint(relationship.sourceEntityId, relationship.sourcePortRole),
    endpoint(relationship.targetEntityId, relationship.targetPortRole),
  ].sort(compareText);
  return `${relationship.kind}|${pair.join('<->')}`;
}

export function relationshipSortKey(relationship) {
  return [relationship.relationshipId, relationship.kind, directedEndpointKey(relationship), relationship.sourcePath].join('|');
}

export function bucketsBy(items, keyOf) {
  const buckets = new Map();
  for (const item of items) {
    const key = keyOf(item);
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return buckets;
}

function normalizePosition(value, label) {
  const position = record(value, label);
  const result = Object.fromEntries(['x', 'y', 'z'].map((key) => [key, Number(position[key])]));
  if (!Object.values(result).every(Number.isFinite)) throw new TypeError(`${label} must contain finite x, y, and z.`);
  return Object.freeze(result);
}

function normalizeEntity(value, index, label) {
  const entity = record(value, `${label}.entities[${index}]`);
  const ports = Array.isArray(entity.ports) ? entity.ports.map((raw, portIndex) => {
    const port = record(raw, `${label}.entities[${index}].ports[${portIndex}]`);
    return Object.freeze({
      role: text(port.role, `${label}.entities[${index}].ports[${portIndex}].role`),
      position: port.position == null ? null : normalizePosition(port.position, `${label}.entities[${index}].ports[${portIndex}].position`),
    });
  }) : [];
  return Object.freeze({
    entityId: text(entity.entityId, `${label}.entities[${index}].entityId`),
    kind: text(entity.kind, `${label}.entities[${index}].kind`).toUpperCase(),
    zoneId: nullableText(entity.zoneId, `${label}.entities[${index}].zoneId`),
    sourcePath: nullableText(entity.sourcePath, `${label}.entities[${index}].sourcePath`) ?? '',
    flowParticipant: entity.flowParticipant === true,
    routeSequence: Array.isArray(entity.routeSequence) ? entity.routeSequence.map((item, itemIndex) => (
      text(item, `${label}.entities[${index}].routeSequence[${itemIndex}]`)
    )) : [],
    junctionKind: nullableText(entity.junctionKind, `${label}.entities[${index}].junctionKind`),
    expectedFlowDegree: Number.isInteger(entity.expectedFlowDegree) ? entity.expectedFlowDegree : null,
    ports: Object.freeze(ports),
  });
}

function normalizeRelationship(value, index, label) {
  const relationship = record(value, `${label}.relationships[${index}]`);
  const kind = text(relationship.kind, `${label}.relationships[${index}].kind`).toUpperCase();
  if (!KIND_SET.has(kind)) throw new TypeError(`${label}.relationships[${index}].kind is unsupported.`);
  const residual = relationship.endpointResidual == null ? null : Number(relationship.endpointResidual);
  if (residual != null && (!Number.isFinite(residual) || residual < 0)) {
    throw new TypeError(`${label}.relationships[${index}].endpointResidual must be non-negative.`);
  }
  return Object.freeze({
    relationshipId: text(relationship.relationshipId, `${label}.relationships[${index}].relationshipId`),
    kind,
    directed: relationship.directed === true,
    sourceEntityId: text(relationship.sourceEntityId, `${label}.relationships[${index}].sourceEntityId`),
    sourcePortRole: nullableText(relationship.sourcePortRole, `${label}.relationships[${index}].sourcePortRole`),
    targetEntityId: nullableText(relationship.targetEntityId, `${label}.relationships[${index}].targetEntityId`),
    targetPortRole: nullableText(relationship.targetPortRole, `${label}.relationships[${index}].targetPortRole`),
    authorityField: text(relationship.authorityField, `${label}.relationships[${index}].authorityField`),
    rawReference: nullableText(relationship.rawReference, `${label}.relationships[${index}].rawReference`),
    sourcePath: nullableText(relationship.sourcePath, `${label}.relationships[${index}].sourcePath`) ?? '',
    endpointResidual: residual,
  });
}

export function normalizeGraph(value, label) {
  const graph = record(value, label);
  if (graph.schema !== 'FbxBenchmarkTopologyGraph.v1') {
    throw new TypeError(`${label}.schema must be FbxBenchmarkTopologyGraph.v1.`);
  }
  if (!Array.isArray(graph.entities) || !Array.isArray(graph.relationships)) {
    throw new TypeError(`${label} must contain entities and relationships arrays.`);
  }
  const entities = graph.entities.map((item, index) => normalizeEntity(item, index, label))
    .sort((left, right) => compareText(left.entityId, right.entityId) || compareText(left.sourcePath, right.sourcePath));
  const relationships = graph.relationships.map((item, index) => normalizeRelationship(item, index, label))
    .sort((left, right) => compareText(relationshipSortKey(left), relationshipSortKey(right)));
  const entityBuckets = new Map();
  for (const entity of entities) entityBuckets.set(entity.entityId, [...(entityBuckets.get(entity.entityId) ?? []), entity]);
  return Object.freeze({ schema: graph.schema, entities: Object.freeze(entities), relationships: Object.freeze(relationships), entityBuckets });
}

function textSet(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  return new Set(values.map((value, index) => text(value, `${label}[${index}]`)));
}

export function normalizePolicy(value) {
  const policy = record(value, 'policy');
  if (policy.schema !== 'FbxTopologyBenchmarkPolicy.v1') {
    throw new TypeError('policy.schema must be FbxTopologyBenchmarkPolicy.v1.');
  }
  const reciprocalKinds = [...textSet(policy.reciprocalKinds, 'policy.reciprocalKinds')].map((kind) => kind.toUpperCase());
  if (reciprocalKinds.some((kind) => !KIND_SET.has(kind))) throw new TypeError('policy.reciprocalKinds contains an unsupported kind.');
  const cyclePolicy = record(policy.cyclePolicy, 'policy.cyclePolicy');
  if (!['FAIL_ALL', 'REFERENCE_AND_ALLOW_LIST'].includes(cyclePolicy.mode)) {
    throw new TypeError('policy.cyclePolicy.mode is unsupported.');
  }
  if (!['AUTHORITATIVE', 'DIAGNOSTIC'].includes(policy.branchSequenceAuthority)) {
    throw new TypeError('policy.branchSequenceAuthority is unsupported.');
  }
  return Object.freeze({
    policyId: text(policy.policyId, 'policy.policyId'),
    branchSequenceAuthority: policy.branchSequenceAuthority,
    reciprocalKinds: new Set(reciprocalKinds),
    approvedOneWayReciprocityKeys: textSet(policy.approvedOneWayReciprocityKeys, 'policy.approvedOneWayReciprocityKeys'),
    cyclePolicy: Object.freeze({
      mode: cyclePolicy.mode,
      allowedCycleClosingRelationshipIds: textSet(
        cyclePolicy.allowedCycleClosingRelationshipIds,
        'policy.cyclePolicy.allowedCycleClosingRelationshipIds',
      ),
    }),
  });
}

export function normalizeTolerance(value) {
  const tolerance = record(value, 'toleranceProfile');
  if (tolerance.schema !== 'FbxBenchmarkToleranceProfile.v1') {
    throw new TypeError('toleranceProfile.schema must be FbxBenchmarkToleranceProfile.v1.');
  }
  const endpointTolerance = Number(tolerance.endpointTolerance);
  if (!Number.isFinite(endpointTolerance) || endpointTolerance < 0) {
    throw new TypeError('toleranceProfile.endpointTolerance must be non-negative.');
  }
  return Object.freeze({
    profileId: text(tolerance.profileId ?? tolerance.toleranceProfileId, 'toleranceProfile.profileId'),
    endpointTolerance,
  });
}
