// Build a deterministic FbxSourceGraph.v2 subset for one or more preview zones.
// The export preserves original occurrence ancestry while excluding sibling-zone evidence.
import { listFbxSourceGraphPreviewZones } from './fbx-source-graph-preview.js';

const UNOWNED_ZONE_ID = 'preview-zone:unowned';

function requireSourceGraph(graph) {
  if (!graph || graph.schema !== 'FbxSourceGraph.v2') {
    throw new TypeError('Expected FbxSourceGraph.v2 for zone export.');
  }
  return graph;
}

function normalizeZoneIds(graph, rawZoneIds) {
  const values = Array.isArray(rawZoneIds) ? rawZoneIds : [rawZoneIds];
  const zoneIds = [...new Set(values.map((value) => String(value ?? '').trim()))];
  if (!zoneIds.length || zoneIds.some((value) => !value)) {
    throw new RangeError('Select at least one explicit FBX preview zone before export.');
  }
  const admitted = new Set(listFbxSourceGraphPreviewZones(graph).map((item) => item.zoneId));
  for (const zoneId of zoneIds) {
    if (!admitted.has(zoneId)) throw new RangeError(`Unknown FBX preview zone: ${zoneId}`);
  }
  return zoneIds.sort();
}

function occurrenceMap(graph) {
  return new Map(graph.occurrences.map((item) => [item.sourceOccurrenceId, item]));
}

function hasSelectedAncestor(occurrence, byId, selectedRoots) {
  const seen = new Set();
  let current = occurrence;
  while (current && !seen.has(current.sourceOccurrenceId)) {
    if (selectedRoots.has(current.sourceOccurrenceId)) return true;
    seen.add(current.sourceOccurrenceId);
    current = current.parentOccurrenceId ? byId.get(current.parentOccurrenceId) : null;
  }
  return false;
}

function addAncestorClosure(ids, byId) {
  for (const occurrenceId of [...ids]) {
    const seen = new Set();
    let current = byId.get(occurrenceId);
    while (current?.parentOccurrenceId && !seen.has(current.parentOccurrenceId)) {
      seen.add(current.parentOccurrenceId);
      ids.add(current.parentOccurrenceId);
      current = byId.get(current.parentOccurrenceId);
    }
  }
  return ids;
}

function selectedOccurrenceIds(graph, zoneIds) {
  const selectedRoots = new Set(zoneIds.filter((zoneId) => zoneId !== UNOWNED_ZONE_ID));
  const byId = occurrenceMap(graph);
  const ids = new Set();
  for (const occurrence of graph.occurrences) {
    if (hasSelectedAncestor(occurrence, byId, selectedRoots)) ids.add(occurrence.sourceOccurrenceId);
  }
  return addAncestorClosure(ids, byId);
}

function globallyReferencedGeometry(graph) {
  return new Set(graph.occurrences.flatMap((item) => item.geometryObjectIds));
}

function selectedGeometryIds(graph, occurrenceIds, includeUnowned) {
  const ids = new Set();
  for (const occurrence of graph.occurrences) {
    if (!occurrenceIds.has(occurrence.sourceOccurrenceId)) continue;
    for (const geometryId of occurrence.geometryObjectIds) ids.add(geometryId);
  }
  if (includeUnowned) {
    const referenced = globallyReferencedGeometry(graph);
    for (const geometry of graph.geometries) {
      if (!referenced.has(geometry.geometryObjectId)) ids.add(geometry.geometryObjectId);
    }
  }
  return ids;
}

function selectedSourceObjectIds(occurrences, geometries) {
  const ids = new Set();
  for (const occurrence of occurrences) ids.add(occurrence.sourceModelObjectId);
  for (const geometry of geometries) {
    ids.add(geometry.geometryObjectId);
    ids.add(geometry.sourceObjectId);
  }
  return ids;
}

function filteredGeometries(graph, geometryIds, occurrenceIds) {
  return graph.geometries.filter((item) => geometryIds.has(item.geometryObjectId)).map((item) => ({
    ...item,
    ownerOccurrenceIds: item.ownerOccurrenceIds.filter((id) => occurrenceIds.has(id)),
  }));
}

function duplicateSourceIds(sourceObjects) {
  const seen = new Set(), duplicates = new Set();
  for (const source of sourceObjects) {
    if (seen.has(source.sourceObjectId)) duplicates.add(source.sourceObjectId);
    seen.add(source.sourceObjectId);
  }
  return [...duplicates].sort();
}

function selectedWarnings(graph, sourceObjects) {
  const elementIds = new Set(sourceObjects.map((item) => item.ufbxElementId));
  return graph.warnings.filter((item) => item.elementId === 0 || elementIds.has(item.elementId));
}

function filteredEdges(graph, occurrenceIds, sourceIds) {
  return {
    hierarchyEdges: graph.hierarchyEdges.filter((edge) => (
      occurrenceIds.has(edge.parentOccurrenceId) && occurrenceIds.has(edge.childOccurrenceId)
    )),
    connectionEdges: graph.connectionEdges.filter((edge) => (
      sourceIds.has(edge.sourceObjectId) && sourceIds.has(edge.destinationObjectId)
    )),
  };
}

export function buildFbxSourceGraphZoneExport(graph, rawZoneIds) {
  requireSourceGraph(graph);
  const zoneIds = normalizeZoneIds(graph, rawZoneIds);
  const occurrenceIds = selectedOccurrenceIds(graph, zoneIds);
  const includeUnowned = zoneIds.includes(UNOWNED_ZONE_ID);
  const geometryIds = selectedGeometryIds(graph, occurrenceIds, includeUnowned);
  const occurrences = graph.occurrences.filter((item) => occurrenceIds.has(item.sourceOccurrenceId));
  const geometries = filteredGeometries(graph, geometryIds, occurrenceIds);
  const sourceIds = selectedSourceObjectIds(occurrences, geometries);
  const sourceObjects = graph.sourceObjects.filter((item) => sourceIds.has(item.sourceObjectId));
  const edges = filteredEdges(graph, occurrenceIds, sourceIds);
  return {
    schema: graph.schema,
    file: graph.file,
    documentMetadata: graph.documentMetadata,
    globalSettings: graph.globalSettings,
    sourceObjects,
    occurrences,
    geometries,
    hierarchyEdges: edges.hierarchyEdges,
    connectionEdges: edges.connectionEdges,
    warnings: selectedWarnings(graph, sourceObjects),
    unsupportedRecords: graph.unsupportedRecords.filter((item) => sourceIds.has(item.sourceObjectId)),
    unresolvedReferences: graph.unresolvedReferences.filter((item) => sourceIds.has(item.sourceObjectId)),
    duplicateSourceObjectIds: duplicateSourceIds(sourceObjects),
  };
}
