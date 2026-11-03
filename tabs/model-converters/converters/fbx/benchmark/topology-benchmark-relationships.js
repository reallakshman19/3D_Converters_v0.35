/** Relationship matching, reciprocity, and boundary analysis. */

import {
  bucketsBy,
  compareText,
  directedEndpointKey,
  endpoint,
  reciprocityKey,
  stableUnique,
} from './topology-benchmark-contract.js';

function zonePair(relationship, graph) {
  if (!relationship) return null;
  const source = graph.entityBuckets.get(relationship.sourceEntityId)?.[0] ?? null;
  const target = relationship.targetEntityId ? graph.entityBuckets.get(relationship.targetEntityId)?.[0] ?? null : null;
  const pair = [source?.zoneId ?? null, target?.zoneId ?? null];
  return relationship.directed ? pair : pair.sort(compareText);
}

function relationshipState(reference, actual, duplicate, tolerance, referenceGraph, actualGraph) {
  if (duplicate) return 'DUPLICATE_EDGE';
  if (!reference) return 'UNEXPECTED_ACTUAL';
  if (!actual) return 'MISSING_ACTUAL';
  if (reference.kind !== actual.kind) return 'RELATIONSHIP_KIND_CONFLICT';
  if (directedEndpointKey(reference) !== directedEndpointKey(actual)) return 'ENDPOINT_MISMATCH';
  if (reference.kind === 'ZONE_BOUNDARY'
      && JSON.stringify(zonePair(reference, referenceGraph)) !== JSON.stringify(zonePair(actual, actualGraph))) {
    return 'ZONE_BOUNDARY_MISMATCH';
  }
  if (actual.endpointResidual != null && actual.endpointResidual > tolerance.endpointTolerance) return 'ENDPOINT_MISMATCH';
  return 'EXACT_MATCH';
}

export function buildRelationshipLedger(reference, actual, tolerance) {
  const referenceBuckets = bucketsBy(reference.relationships, (item) => item.relationshipId);
  const actualBuckets = bucketsBy(actual.relationships, (item) => item.relationshipId);
  const ids = stableUnique([...referenceBuckets.keys(), ...actualBuckets.keys()]);
  const records = [];
  for (const id of ids) {
    const expected = referenceBuckets.get(id) ?? [];
    const observed = actualBuckets.get(id) ?? [];
    const width = Math.max(expected.length, observed.length);
    for (let index = 0; index < width; index += 1) {
      const referenceOccurrence = expected[index] ?? null;
      const actualOccurrence = observed[index] ?? null;
      const duplicate = index > 0 || expected.length > 1 || observed.length > 1;
      const matchState = relationshipState(
        referenceOccurrence, actualOccurrence, duplicate, tolerance, reference, actual,
      );
      records.push(Object.freeze({
        ledgerId: `TR-${String(records.length + 1).padStart(6, '0')}`,
        relationshipId: id,
        kind: actualOccurrence?.kind ?? referenceOccurrence?.kind ?? 'REFERENCE_ADJACENCY',
        directed: actualOccurrence?.directed ?? referenceOccurrence?.directed ?? false,
        reference: referenceOccurrence,
        actual: actualOccurrence,
        matchState,
        endpointResidual: actualOccurrence?.endpointResidual ?? null,
        toleranceApplied: actualOccurrence?.endpointResidual == null ? null : Object.freeze({
          profileId: tolerance.profileId,
          dimension: 'endpointTolerance',
          absoluteTolerance: tolerance.endpointTolerance,
        }),
        status: matchState === 'EXACT_MATCH' ? 'PASS' : 'FAIL',
      }));
    }
  }
  return Object.freeze(records);
}

export function duplicateEntityAnomalies(graph, side) {
  return [...graph.entityBuckets.entries()].filter(([, rows]) => rows.length > 1).map(([entityId, rows]) => Object.freeze({
    code: 'DUPLICATE_ENTITY_IDENTITY', side, entityId,
    sourcePaths: rows.map((row) => row.sourcePath), blocking: true,
  }));
}

export function unresolvedAnomalies(graph, side) {
  return graph.relationships.flatMap((relationship) => {
    const problems = [];
    if (!graph.entityBuckets.has(relationship.sourceEntityId)) problems.push('SOURCE_ENTITY_UNRESOLVED');
    if (!relationship.targetEntityId || !graph.entityBuckets.has(relationship.targetEntityId)) problems.push('TARGET_ENTITY_UNRESOLVED');
    return problems.map((code) => Object.freeze({
      code, side, relationshipId: relationship.relationshipId, sourcePath: relationship.sourcePath,
      rawReference: relationship.rawReference, blocking: side === 'reference',
    }));
  });
}

export function selfConnectionAnomalies(graph) {
  return graph.relationships.filter((relationship) => (
    relationship.targetEntityId != null
    && relationship.sourceEntityId === relationship.targetEntityId
  )).map((relationship) => Object.freeze({
    code: 'SELF_CONNECTION', relationshipId: relationship.relationshipId,
    sourcePath: relationship.sourcePath, blocking: false,
  }));
}

export function reciprocityAnomalies(graph, policy) {
  const claims = graph.relationships.filter((relationship) => (
    relationship.directed && policy.reciprocalKinds.has(relationship.kind)
  ));
  const groups = bucketsBy(claims, reciprocityKey);
  return [...groups.entries()].flatMap(([key, rows]) => {
    if (policy.approvedOneWayReciprocityKeys.has(key)) return [];
    const directions = new Set(rows.map(directedEndpointKey));
    const reverse = rows.some((row) => directions.has(
      `${endpoint(row.targetEntityId, row.targetPortRole)}->${endpoint(row.sourceEntityId, row.sourcePortRole)}`,
    ));
    return reverse ? [] : [Object.freeze({
      code: 'RECIPROCITY_MISMATCH', reciprocityKey: key,
      relationshipIds: rows.map((row) => row.relationshipId).sort(compareText), blocking: false,
    })];
  }).sort((left, right) => compareText(left.reciprocityKey, right.reciprocityKey));
}

export function boundaryAnomalies(graph) {
  const entityById = new Map(graph.entities.map((entity) => [entity.entityId, entity]));
  const boundaryPairs = new Set(graph.relationships.filter((row) => row.kind === 'ZONE_BOUNDARY')
    .map((row) => reciprocityKey(row)));
  const anomalies = [];
  for (const relationship of graph.relationships.filter((row) => (
    ['FLOW_ADJACENCY', 'REFERENCE_ADJACENCY'].includes(row.kind) && row.targetEntityId
  ))) {
    const sourceZone = entityById.get(relationship.sourceEntityId)?.zoneId ?? null;
    const targetZone = entityById.get(relationship.targetEntityId)?.zoneId ?? null;
    if (!sourceZone || !targetZone || sourceZone === targetZone) continue;
    const key = reciprocityKey({ ...relationship, kind: 'ZONE_BOUNDARY' });
    if (!boundaryPairs.has(key)) anomalies.push(Object.freeze({
      code: 'CROSS_ZONE_BOUNDARY_UNDECLARED', relationshipId: relationship.relationshipId,
      sourceZoneId: sourceZone, targetZoneId: targetZone, blocking: false,
    }));
  }
  for (const relationship of graph.relationships.filter((row) => row.kind === 'ZONE_BOUNDARY' && row.targetEntityId)) {
    const sourceZone = entityById.get(relationship.sourceEntityId)?.zoneId ?? null;
    const targetZone = entityById.get(relationship.targetEntityId)?.zoneId ?? null;
    if (sourceZone && targetZone && sourceZone === targetZone) anomalies.push(Object.freeze({
      code: 'ZONE_BOUNDARY_WITHIN_ONE_ZONE', relationshipId: relationship.relationshipId,
      zoneId: sourceZone, blocking: false,
    }));
  }
  return anomalies.sort((left, right) => compareText(left.relationshipId, right.relationshipId));
}

export function boundaryReports(ledger, reference, actual) {
  const referenceEntities = new Map(reference.entities.map((entity) => [entity.entityId, entity]));
  const actualEntities = new Map(actual.entities.map((entity) => [entity.entityId, entity]));
  return ledger.filter((row) => row.kind === 'ZONE_BOUNDARY').map((row) => {
    const relationship = row.actual ?? row.reference;
    const sourceEntity = actualEntities.get(relationship.sourceEntityId) ?? referenceEntities.get(relationship.sourceEntityId);
    const targetEntity = relationship.targetEntityId
      ? actualEntities.get(relationship.targetEntityId) ?? referenceEntities.get(relationship.targetEntityId) : null;
    return Object.freeze({
      ledgerId: `TB-${row.ledgerId.slice(3)}`,
      boundaryId: row.relationshipId,
      sourceZoneId: sourceEntity?.zoneId ?? null,
      targetZoneId: targetEntity?.zoneId ?? null,
      sourceEntityId: relationship.sourceEntityId,
      sourceEndpointRole: relationship.sourcePortRole,
      targetEntityId: relationship.targetEntityId,
      targetEndpointRole: relationship.targetPortRole,
      boundaryClass: sourceEntity?.zoneId && targetEntity?.zoneId && sourceEntity.zoneId !== targetEntity.zoneId
        ? 'CROSS_ZONE' : targetEntity ? 'INTERNAL_ZONE' : 'UNRESOLVED',
      referencePair: row.reference,
      actualPair: row.actual,
      status: row.status,
    });
  });
}
