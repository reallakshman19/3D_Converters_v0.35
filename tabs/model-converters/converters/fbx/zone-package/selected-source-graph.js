import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { compareDecimalId, compareOccurrenceId, compareText } from '../zone-geometry/compare.js';

const SCHEMA = 'FbxSelectedZoneSourceGraph.v1';

function fail(message) {
  throw new TypeError(`FBX selected-zone source graph: ${message}`);
}

function uniqueSorted(values, compare = compareText) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))].sort(compare);
}

function indexBy(records, field) {
  return new Map(records.map((record) => [record[field], record]));
}

function requiredOccurrenceIds(scope) {
  return uniqueSorted([
    ...scope.selectedOccurrences.map((item) => item.sourceOccurrenceId),
    ...(scope.ancestorOccurrenceIds || []),
  ], compareOccurrenceId);
}

function selectedOccurrences(sourceGraph, scope) {
  const index = indexBy(sourceGraph.occurrences, 'sourceOccurrenceId');
  return requiredOccurrenceIds(scope).map((id) => {
    const record = index.get(id);
    if (!record) fail(`occurrence ${id} is missing from the authoritative source graph.`);
    return structuredClone(record);
  });
}

function geometryDescriptor(record, selectedOccurrenceIds) {
  const rawOwners = Array.isArray(record.ownerOccurrenceIds) ? record.ownerOccurrenceIds : [];
  const sourcePoints = record.kind === 'MESH' ? record.verticesMm : record.controlPointsMm;
  return {
    geometryObjectId: record.geometryObjectId, sourceObjectId: record.sourceObjectId,
    kind: record.kind,
    ownerOccurrenceIds: uniqueSorted(rawOwners.filter((id) => selectedOccurrenceIds.has(id)),
      compareOccurrenceId),
    sourcePointCount: Array.isArray(sourcePoints) ? sourcePoints.length : 0,
    coordinatePayloadDisposition: 'OMITTED_BINARY_BUFFER_AUTHORITY',
  };
}

function selectedGeometries(sourceGraph, scope) {
  const index = indexBy(sourceGraph.geometries, 'geometryObjectId');
  const selectedOccurrenceIds = new Set(scope.selectedOccurrences
    .map((item) => item.sourceOccurrenceId));
  return uniqueSorted(scope.selectedGeometryIds, compareDecimalId).map((id) => {
    const record = index.get(id);
    if (!record) fail(`geometry ${id} is missing from the authoritative source graph.`);
    return geometryDescriptor(record, selectedOccurrenceIds);
  });
}

function sourceObjectIds(occurrences, geometries) {
  const ids = occurrences.map((item) => item.sourceModelObjectId);
  for (const geometry of geometries) ids.push(geometry.sourceObjectId, geometry.geometryObjectId);
  return uniqueSorted(ids, compareDecimalId);
}

function selectedSourceObjects(sourceGraph, occurrences, geometries) {
  const index = indexBy(sourceGraph.sourceObjects, 'sourceObjectId');
  return sourceObjectIds(occurrences, geometries).map((id) => {
    const record = index.get(id);
    if (!record) fail(`source object ${id} is missing from the authoritative source graph.`);
    return structuredClone(record);
  });
}

function validateOwnership(scope, occurrences, geometries) {
  const selectedIds = new Set(scope.selectedOccurrences.map((item) => item.sourceOccurrenceId));
  const selectedGeometryIds = new Set(geometries.map((item) => item.geometryObjectId));
  for (const occurrence of occurrences) {
    if (!selectedIds.has(occurrence.sourceOccurrenceId)) continue;
    const references = occurrence.geometryObjectIds.filter((id) => selectedGeometryIds.has(id));
    if (!references.length) fail(`selected occurrence ${occurrence.sourceOccurrenceId} owns no selected geometry.`);
  }
  const referenced = new Set(occurrences.flatMap((item) => item.geometryObjectIds));
  for (const geometryId of selectedGeometryIds) {
    if (!referenced.has(geometryId)) fail(`selected geometry ${geometryId} has no packaged occurrence reference.`);
  }
}

function countsOf(scope, sourceObjects, occurrences, geometries) {
  const selectedOccurrenceIds = new Set(scope.selectedOccurrences.map((item) => item.sourceOccurrenceId));
  return {
    sourceObjectCount: sourceObjects.length,
    occurrenceCount: occurrences.length,
    selectedOccurrenceCount: occurrences.filter((item) => selectedOccurrenceIds.has(item.sourceOccurrenceId)).length,
    ancestorOccurrenceCount: occurrences.filter((item) => !selectedOccurrenceIds.has(item.sourceOccurrenceId)).length,
    geometryCount: geometries.length,
  };
}

function validateBuildInputs(sourceGraph, scope, zoneGeometryEvidence) {
  if (sourceGraph?.schema !== 'FbxSourceGraph.v2') fail('FbxSourceGraph.v2 is required.');
  if (!scope?.zoneId || !Array.isArray(scope.selectedOccurrences)
      || !Array.isArray(scope.selectedGeometryIds)) fail('validated selected-zone scope is required.');
  if (zoneGeometryEvidence?.schema !== 'FbxZoneGeometryEvidence.v1') {
    fail('FbxZoneGeometryEvidence.v1 is required.');
  }
  if (zoneGeometryEvidence.selectedZone?.zoneId !== scope.zoneId) {
    fail('scope and zone geometry evidence select different zones.');
  }
}

function graphPayload(sourceGraph, scope, zoneGeometryEvidence, records) {
  return {
    schema: SCHEMA, sourceGraphSchema: sourceGraph.schema,
    completeSourceGraphSha256: zoneGeometryEvidence.sourceGraphSha256,
    zoneGeometryArtifactId: zoneGeometryEvidence.artifactId,
    selectedZone: {
      zoneId: scope.zoneId, label: scope.zoneLabel,
      selectedOccurrenceIds: scope.selectedOccurrences.map((item) => item.sourceOccurrenceId)
        .sort(compareOccurrenceId),
      ancestorOccurrenceIds: [...(scope.ancestorOccurrenceIds || [])].sort(compareOccurrenceId),
      selectedGeometryIds: [...scope.selectedGeometryIds].sort(compareDecimalId),
    },
    ...records,
    counts: countsOf(scope, records.sourceObjects, records.occurrences, records.geometries),
    authority: {
      projectionAuthority: 'FbxSourceGraph.v2', selectedZoneAuthority: 'FbxZoneGeometryEvidence.v1',
      siblingExclusiveOccurrencesIncluded: false, siblingExclusiveGeometriesIncluded: false,
      sourceIdentityChanged: false, topologyChanged: false,
      exactCoordinatePayloadEmbedded: false,
      exactGeometryAuthority: 'FbxSelectedZoneGeometryManifest.v1_BINARY_BUFFERS',
    },
  };
}

export async function buildSelectedZoneSourceGraph({
  sourceGraph, scope, zoneGeometryEvidence,
} = {}) {
  validateBuildInputs(sourceGraph, scope, zoneGeometryEvidence);
  const occurrences = selectedOccurrences(sourceGraph, scope);
  const geometries = selectedGeometries(sourceGraph, scope);
  const sourceObjects = selectedSourceObjects(sourceGraph, occurrences, geometries);
  validateOwnership(scope, occurrences, geometries);
  const payload = graphPayload(sourceGraph, scope, zoneGeometryEvidence, {
    sourceObjects, occurrences, geometries,
  });
  const graphDigest = await sha256Hex(canonicalJson(payload));
  return deepFreeze({ ...payload, graphDigest, artifactId: `FBXZGRAPH-${graphDigest.slice(0, 32)}` });
}

export async function validateSelectedZoneSourceGraph(value) {
  if (value?.schema !== SCHEMA || !Array.isArray(value.sourceObjects)
      || !Array.isArray(value.occurrences) || !Array.isArray(value.geometries)) {
    fail(`${SCHEMA} structure is invalid.`);
  }
  const payload = structuredClone(value);
  const digest = payload.graphDigest;
  delete payload.graphDigest;
  delete payload.artifactId;
  const actual = await sha256Hex(canonicalJson(payload));
  if (digest !== actual || value.artifactId !== `FBXZGRAPH-${actual.slice(0, 32)}`) {
    fail('selected-zone source graph digest is invalid.');
  }
  return value;
}
