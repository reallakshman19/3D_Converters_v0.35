// Build a bounded, transform-aware point preview from governed FBX source-graph geometry.
// Preview zones are derived only from hierarchy ancestry and never change conversion evidence.
import { transformPoint } from './converters/fbx/transform-policy.js';

export const FBX_SOURCE_GRAPH_PREVIEW_POINT_LIMIT = 250000;
export const FBX_SOURCE_GRAPH_PREVIEW_ALL_ZONES = '';

const UNOWNED_ZONE_ID = 'preview-zone:unowned';
const PARTITION_CACHE = new WeakMap();
const IDENTITY_MATRIX = Object.freeze([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
  0, 0, 0,
]);

function geometryPoints(geometry) {
  if (geometry?.kind === 'MESH') return geometry.verticesMm;
  if (geometry?.kind === 'NURBS_CURVE') return geometry.controlPointsMm;
  return [];
}

function cleanName(value) {
  return String(value ?? '').replace(/^[^:]+::/, '').trim();
}

function graphMaps(graph) {
  return {
    occurrenceById: new Map(graph.occurrences.map((item) => [item.sourceOccurrenceId, item])),
    geometryById: new Map(graph.geometries.map((item) => [item.geometryObjectId, item])),
    sourceById: new Map(graph.sourceObjects.map((item) => [item.sourceObjectId, item])),
  };
}

function occurrenceChain(occurrence, occurrenceById) {
  const chain = [], seen = new Set();
  let current = occurrence;
  while (current && !seen.has(current.sourceOccurrenceId)) {
    seen.add(current.sourceOccurrenceId);
    chain.unshift(current);
    current = current.parentOccurrenceId
      ? occurrenceById.get(current.parentOccurrenceId)
      : null;
  }
  return chain;
}

function commonPrefixLength(chains) {
  if (!chains.length) return 0;
  const limit = Math.min(...chains.map((chain) => chain.length));
  let index = 0;
  while (index < limit && chains.every((chain) => (
    chain[index].sourceOccurrenceId === chains[0][index].sourceOccurrenceId
  ))) index += 1;
  return index;
}

function renderableOccurrences(graph, maps) {
  return graph.occurrences.filter((occurrence) => occurrence.geometryObjectIds.some((id) => (
    geometryPoints(maps.geometryById.get(id)).length > 0
  )));
}

function isNullGroup(occurrence, maps) {
  const source = maps.sourceById.get(occurrence?.sourceModelObjectId);
  return String(source?.domSubtype || '').trim().toUpperCase() === 'NULL';
}

function zoneOccurrenceFor(chain, commonLength, maps) {
  for (let index = commonLength; index < chain.length; index += 1) {
    if (isNullGroup(chain[index], maps)) return chain[index];
  }
  for (let index = Math.min(commonLength - 1, chain.length - 1); index >= 0; index -= 1) {
    if (isNullGroup(chain[index], maps)) return chain[index];
  }
  return chain[Math.min(commonLength, chain.length - 1)];
}

function assignZonesByRoot(occurrences, maps, assignment) {
  const byRoot = new Map();
  for (const occurrence of occurrences) {
    const chain = occurrenceChain(occurrence, maps.occurrenceById);
    const rootId = chain[0]?.sourceOccurrenceId || occurrence.sourceOccurrenceId;
    const group = byRoot.get(rootId) || [];
    group.push({ occurrence, chain });
    byRoot.set(rootId, group);
  }
  for (const group of byRoot.values()) {
    const commonLength = commonPrefixLength(group.map((item) => item.chain));
    for (const item of group) {
      const zone = zoneOccurrenceFor(item.chain, commonLength, maps);
      assignment.set(item.occurrence.sourceOccurrenceId, zone.sourceOccurrenceId);
    }
  }
}

function globallyReferencedGeometry(graph) {
  return new Set(graph.occurrences.flatMap((item) => item.geometryObjectIds));
}

function zoneLabel(zoneId, maps) {
  if (zoneId === UNOWNED_ZONE_ID) return 'Unowned geometry';
  const occurrence = maps.occurrenceById.get(zoneId);
  const source = maps.sourceById.get(occurrence?.sourceModelObjectId);
  return cleanName(source?.displayName) || cleanName(source?.domSourceName) || zoneId;
}

function partitionSourcePoints(graph, maps, assignment) {
  const counts = new Map();
  for (const occurrence of graph.occurrences) {
    const zoneId = assignment.get(occurrence.sourceOccurrenceId);
    if (!zoneId) continue;
    const count = [...new Set(occurrence.geometryObjectIds)].reduce((total, id) => (
      total + geometryPoints(maps.geometryById.get(id)).length
    ), 0);
    counts.set(zoneId, (counts.get(zoneId) || 0) + count);
  }
  const referenced = globallyReferencedGeometry(graph);
  const unownedCount = graph.geometries.reduce((total, geometry) => (
    referenced.has(geometry.geometryObjectId) ? total : total + geometryPoints(geometry).length
  ), 0);
  if (unownedCount) counts.set(UNOWNED_ZONE_ID, unownedCount);
  return counts;
}

function previewPartition(graph) {
  const cached = PARTITION_CACHE.get(graph);
  if (cached) return cached;
  const maps = graphMaps(graph), assignment = new Map();
  assignZonesByRoot(renderableOccurrences(graph, maps), maps, assignment);
  const counts = partitionSourcePoints(graph, maps, assignment);
  const labels = new Map([...counts.keys()].map((id) => [id, zoneLabel(id, maps)]));
  const partition = { maps, assignment, counts, labels };
  PARTITION_CACHE.set(graph, partition);
  return partition;
}

function stableZoneOptions(partition) {
  const duplicateLabels = new Map();
  for (const label of partition.labels.values()) {
    duplicateLabels.set(label, (duplicateLabels.get(label) || 0) + 1);
  }
  return [...partition.counts.entries()].map(([zoneId, sourcePointCount]) => {
    const baseLabel = partition.labels.get(zoneId);
    const label = duplicateLabels.get(baseLabel) > 1 ? `${baseLabel} · ${zoneId}` : baseLabel;
    return { zoneId, label, sourcePointCount };
  }).sort((left, right) => left.label.localeCompare(right.label) || left.zoneId.localeCompare(right.zoneId));
}

export function listFbxSourceGraphPreviewZones(graph) {
  if (graph?.schema !== 'FbxSourceGraph.v2') return [];
  return stableZoneOptions(previewPartition(graph));
}

function previewItems(graph, selectedZoneId, partition) {
  const items = [], referenced = globallyReferencedGeometry(graph);
  for (const occurrence of graph.occurrences) {
    if (selectedZoneId && partition.assignment.get(occurrence.sourceOccurrenceId) !== selectedZoneId) continue;
    for (const geometryId of [...new Set(occurrence.geometryObjectIds)]) {
      const geometry = partition.maps.geometryById.get(geometryId);
      if (geometry) items.push({ geometry, matrix: occurrence.geometryMatrixMm });
    }
  }
  if (!selectedZoneId || selectedZoneId === UNOWNED_ZONE_ID) {
    for (const geometry of graph.geometries) {
      if (!referenced.has(geometry.geometryObjectId)) items.push({ geometry, matrix: IDENTITY_MATRIX });
    }
  }
  return selectedZoneId === UNOWNED_ZONE_ID
    ? items.filter((item) => !referenced.has(item.geometry.geometryObjectId))
    : items;
}

function countSourcePoints(items) {
  return items.reduce((total, item) => total + geometryPoints(item.geometry).length, 0);
}

function sampledPoints(items, sourcePointCount, maxPoints) {
  const stride = Math.max(1, Math.ceil(sourcePointCount / maxPoints));
  const points = [];
  let ordinal = 0;
  for (const item of items) {
    for (const point of geometryPoints(item.geometry)) {
      if (ordinal % stride === 0 && points.length < maxPoints) {
        const transformed = transformPoint(item.matrix, point);
        points.push({ x: transformed[0], y: transformed[1], z: transformed[2] });
      }
      ordinal += 1;
    }
  }
  return points;
}

function normalizeZoneSelection(options, zones) {
  const zoneId = String(options?.zoneId ?? FBX_SOURCE_GRAPH_PREVIEW_ALL_ZONES);
  if (!zoneId) return { zoneId: '', label: 'All zones' };
  const zone = zones.find((item) => item.zoneId === zoneId);
  if (!zone) throw new RangeError(`Unknown FBX preview zone: ${zoneId}`);
  return { zoneId, label: zone.label };
}

function attachSourceMetadata(project, graph, sourceName, maxPoints) {
  Object.defineProperties(project, {
    previewSourceGraph: { value: graph },
    previewSourceName: { value: sourceName },
    previewMaxPoints: { value: maxPoints },
  });
  return project;
}

export function buildFbxSourceGraphPreviewProject(graph, sourceName, maxPoints, options = {}) {
  if (graph?.schema !== 'FbxSourceGraph.v2') return null;
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 1) {
    throw new TypeError('FBX source-graph preview maxPoints must be a positive integer.');
  }
  const partition = previewPartition(graph);
  const zones = stableZoneOptions(partition);
  const selection = normalizeZoneSelection(options, zones);
  const items = previewItems(graph, selection.zoneId, partition);
  const sourcePointCount = countSourcePoints(items);
  if (!sourcePointCount) return null;
  const points = sampledPoints(items, sourcePointCount, maxPoints);
  return attachSourceMetadata({
    id: 'fbx-source-graph-preview',
    name: `FBX Source Graph Preview: ${sourceName}`,
    points,
    segments: [],
    nodes: [],
    supports: [],
    annotations: [],
    previewZones: zones,
    selectedZoneId: selection.zoneId,
    selectedZoneLabel: selection.label,
    sourcePointCount,
    displayedPointCount: points.length,
    truncated: points.length < sourcePointCount,
  }, graph, sourceName, maxPoints);
}
