import { createHash } from 'node:crypto';
import { transformPoint } from '../../../tabs/model-converters/converters/fbx/transform-policy.js';

function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function clean(value) {
  const text = String(value ?? '').replace(/^[^:]+::/, '').trim();
  return text || null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compareText)
    .map((key) => [key, canonical(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function propertyIndex(sourceObject) {
  const result = {};
  for (const property of sourceObject?.customProperties || []) {
    const name = clean(property?.name)?.toUpperCase();
    if (!name || Object.hasOwn(result, name)) continue;
    const value = clean(property?.valueString);
    if (value !== null) result[name] = value;
  }
  return result;
}

function rawTypeOf(properties) {
  return clean(properties.RAW_TYPE ?? properties.TYPE)?.toUpperCase() ?? null;
}

function sourceTags(sourceObject, properties) {
  const propertyValues = Object.entries(properties)
    .filter(([name]) => /(?:^|_)(?:TAG|REF|NAME|ID)$/.test(name))
    .map(([, value]) => value);
  return [...new Set([
    clean(sourceObject?.displayName), clean(sourceObject?.domSourceName), ...propertyValues,
  ].filter(Boolean).map((value) => value.toUpperCase()))].sort(compareText);
}

function occurrenceChain(occurrence, occurrences) {
  const chain = [], seen = new Set();
  let current = occurrence;
  while (current) {
    const id = String(current.sourceOccurrenceId);
    if (seen.has(id)) throw new TypeError(`FBX2_GLOBAL_INDEX_ANCESTRY_CYCLE ${id}`);
    seen.add(id); chain.unshift(current);
    current = current.parentOccurrenceId
      ? occurrences.get(String(current.parentOccurrenceId)) : null;
  }
  return chain;
}

function zoneAssignment(zoneScopes) {
  const result = new Map();
  for (const scope of zoneScopes || []) {
    for (const occurrence of scope?.selectedOccurrences || []) {
      const id = String(occurrence.sourceOccurrenceId);
      if (result.has(id) && result.get(id).zoneId !== scope.zoneId) {
        throw new TypeError(`FBX2_GLOBAL_INDEX_MULTIPLE_ZONE_ASSIGNMENT ${id}`);
      }
      result.set(id, { zoneId: scope.zoneId, zoneLabel: scope.zoneLabel });
    }
  }
  return result;
}

function pointsFor(occurrence, geometryById) {
  const points = [];
  for (const geometryId of occurrence.geometryObjectIds || []) {
    const geometry = geometryById.get(String(geometryId));
    if (!geometry) continue;
    const local = geometry.kind === 'MESH'
      ? geometry.verticesMm || []
      : geometry.kind === 'NURBS_CURVE'
        ? (geometry.controlPointsMm || []).map((point) => point.slice(0, 3))
        : [];
    for (const point of local) points.push(transformPoint(occurrence.geometryMatrixMm, point));
  }
  return points;
}

function boundsOf(points) {
  if (!points.length) return null;
  const min = [...points[0]], max = [...points[0]];
  for (const point of points.slice(1)) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function centroidOf(points, fallback) {
  if (!points.length) return Object.freeze([...fallback]);
  const sum = [0, 0, 0];
  for (const point of points) for (let axis = 0; axis < 3; axis += 1) sum[axis] += point[axis];
  return Object.freeze(sum.map((value) => value / points.length));
}

function recordFor(occurrence, maps, assignments) {
  const source = maps.sources.get(String(occurrence.sourceModelObjectId));
  const properties = propertyIndex(source);
  const chain = occurrenceChain(occurrence, maps.occurrences);
  const points = pointsFor(occurrence, maps.geometries);
  const origin = Object.freeze([
    occurrence.worldMatrixMm?.[9] ?? occurrence.geometryMatrixMm?.[9] ?? 0,
    occurrence.worldMatrixMm?.[10] ?? occurrence.geometryMatrixMm?.[10] ?? 0,
    occurrence.worldMatrixMm?.[11] ?? occurrence.geometryMatrixMm?.[11] ?? 0,
  ]);
  const zone = assignments.get(String(occurrence.sourceOccurrenceId)) || null;
  return Object.freeze({
    sourceOccurrenceId: String(occurrence.sourceOccurrenceId),
    sourceModelObjectId: String(occurrence.sourceModelObjectId),
    parentOccurrenceId: occurrence.parentOccurrenceId
      ? String(occurrence.parentOccurrenceId) : null,
    fullAncestryOccurrenceIds: Object.freeze(chain.map((item) => String(item.sourceOccurrenceId))),
    fullAncestrySourceObjectIds: Object.freeze(chain.map((item) => String(item.sourceModelObjectId))),
    assignedZoneId: zone?.zoneId ?? null,
    assignedZoneLabel: zone?.zoneLabel ?? null,
    geometryObjectIds: Object.freeze([...(occurrence.geometryObjectIds || [])]
      .map(String).sort(compareText)),
    displayName: clean(source?.displayName ?? source?.domSourceName),
    domSubtype: clean(source?.domSubtype),
    rawType: rawTypeOf(properties),
    sourceProperties: Object.freeze(properties),
    exactTagValues: Object.freeze(sourceTags(source, properties)),
    worldMatrixMm: Object.freeze([...(occurrence.worldMatrixMm || [])]),
    geometryMatrixMm: Object.freeze([...(occurrence.geometryMatrixMm || [])]),
    worldOriginMm: origin,
    worldBoundsMm: boundsOf(points),
    worldCentroidMm: centroidOf(points, origin),
  });
}

function indexValues(records, field) {
  const result = {};
  for (const record of records) {
    const values = Array.isArray(record[field]) ? record[field] : [record[field]];
    for (const value of values.filter(Boolean)) {
      const key = String(value);
      const ids = result[key] || [];
      ids.push(record.sourceOccurrenceId);
      result[key] = ids;
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(result)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, ids]) => [key, Object.freeze([...new Set(ids)].sort(compareText))])));
}

export function buildFbx2GlobalOccurrenceIndex({ sourceGraph, zoneScopes } = {}) {
  if (sourceGraph?.schema !== 'FbxSourceGraph.v2'
      || !Array.isArray(sourceGraph.sourceObjects)
      || !Array.isArray(sourceGraph.occurrences)
      || !Array.isArray(sourceGraph.geometries)
      || !Array.isArray(zoneScopes)) {
    throw new TypeError('FBX2_GLOBAL_INDEX_INPUT_INVALID');
  }
  const maps = {
    sources: new Map(sourceGraph.sourceObjects.map((item) => [String(item.sourceObjectId), item])),
    occurrences: new Map(sourceGraph.occurrences
      .map((item) => [String(item.sourceOccurrenceId), item])),
    geometries: new Map(sourceGraph.geometries
      .map((item) => [String(item.geometryObjectId), item])),
  };
  const assignments = zoneAssignment(zoneScopes);
  const records = sourceGraph.occurrences.map((occurrence) => recordFor(
    occurrence, maps, assignments,
  )).sort((left, right) => compareText(left.sourceOccurrenceId, right.sourceOccurrenceId));
  const payload = {
    schema: 'FbxGlobalOccurrenceIndex.v1',
    sourceOccurrenceCount: records.length,
    zoneAssignedOccurrenceCount: records.filter((item) => item.assignedZoneId).length,
    geometryOccurrenceCount: records.filter((item) => item.geometryObjectIds.length).length,
    records: Object.freeze(records),
    bySourceModelObjectId: indexValues(records, 'sourceModelObjectId'),
    byGeometryObjectId: indexValues(records, 'geometryObjectIds'),
    byExactTag: indexValues(records, 'exactTagValues'),
    authority: Object.freeze({
      selectedZonePopulationChanged: false,
      siblingGeometryImported: false,
      fullSourceGraphIndexed: true,
      ancestryPreservedIndependentlyOfLeafName: true,
      worldGeometryDerivedFromGovernedOccurrenceMatrix: true,
    }),
  };
  const indexDigest = sha256(payload);
  return Object.freeze({ ...payload, indexDigest });
}
