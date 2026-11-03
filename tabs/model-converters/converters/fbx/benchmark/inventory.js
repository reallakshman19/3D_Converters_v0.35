import { deepFreeze } from '../canonical-json.js';
import { benchmarkIndexCollisions, buildFbxBenchmarkIndexes } from './semantic-indexes.js';

function increment(map, key) {
  if (key === undefined || key === null || key === '') return;
  const observed = String(key);
  map.set(observed, (map.get(observed) || 0) + 1);
}

function sortedCounts(map, keyName) {
  return [...map.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, count]) => ({ [keyName]: key, count }));
}

function coordinateValues(record) {
  const attributes = record.attributes || {};
  return ['POS', 'APOS', 'LPOS', 'HPOS', 'TPOS', 'BPOS'].map((key) => attributes[key])
    .filter((value) => value && ['x', 'y', 'z'].every((axis) => Number.isFinite(value[axis])));
}

function extendExtents(extents, point) {
  for (const axis of ['x', 'y', 'z']) {
    extents.minimum[axis] = Math.min(extents.minimum[axis], point[axis]);
    extents.maximum[axis] = Math.max(extents.maximum[axis], point[axis]);
  }
}

function finalExtents(extents) {
  if (!Number.isFinite(extents.minimum.x)) return null;
  return extents;
}

function observeSupportAttributes(attributes, state) {
  for (const field of Object.keys(state.supportAttributeValues)) {
    if (attributes[field] === undefined || attributes[field] === null || attributes[field] === '') continue;
    increment(state.supportAttributeValues[field], attributes[field]);
    state.supportAttributePresence[field] += 1;
  }
}

function observeOccurrence(occurrence, state) {
  const { record } = occurrence, attributes = record.attributes || {};
  increment(state.rawOuterTypes, record.type);
  increment(state.rawAttributeTypes, attributes.TYPE);
  increment(state.rawAttributeRawTypes, attributes.RAW_TYPE);
  if (occurrence.childIndex === null) increment(state.ownerSiteObservations, attributes.OWNER_SITE);
  if (record.type === 'SUPPORT') observeSupportAttributes(attributes, state);
  if (attributes.HREF !== undefined) state.referenceCounts.HREF += 1;
  if (attributes.TREF !== undefined) state.referenceCounts.TREF += 1;
  for (const point of coordinateValues(record)) extendExtents(state.extents, point);
}

function createState() {
  return {
    rawOuterTypes: new Map(), rawAttributeTypes: new Map(), rawAttributeRawTypes: new Map(),
    ownerSiteObservations: new Map(), referenceCounts: { HREF: 0, TREF: 0 },
    supportAttributeValues: { SUPPORT_KIND: new Map(), SUPPORT_MAPPER_KIND: new Map(), SUPPORT_TYPE: new Map() },
    supportAttributePresence: { SUPPORT_KIND: 0, SUPPORT_MAPPER_KIND: 0, SUPPORT_TYPE: 0 },
    extents: { minimum: { x: Infinity, y: Infinity, z: Infinity },
      maximum: { x: -Infinity, y: -Infinity, z: -Infinity } },
  };
}

function supportAttributeObservations(state, supportOuterTypeRecords) {
  return Object.fromEntries(Object.keys(state.supportAttributeValues).sort().map((field) => [field, {
    present: state.supportAttributePresence[field],
    missing: supportOuterTypeRecords - state.supportAttributePresence[field],
    values: sortedCounts(state.supportAttributeValues[field], 'value'),
  }]));
}

export function buildFbxBenchmarkInventory(loaded) {
  const state = createState();
  for (const occurrence of loaded.occurrences) observeOccurrence(occurrence, state);
  const indexes = buildFbxBenchmarkIndexes(loaded);
  const supportOuterTypeRecords = state.rawOuterTypes.get('SUPPORT') || 0;
  const childRecords = loaded.occurrences.length - loaded.branches.length;
  return deepFreeze({
    schema: 'FbxBenchmarkInventory.v1', benchmarkIdentity: loaded.identity,
    parseResult: { status: 'PASS', duplicateJsonKeyCount: loaded.parserMetrics.duplicateKeyCount,
      skippedRecordCount: 0 }, observedLimits: loaded.parserMetrics,
    counts: { totalRecords: loaded.occurrences.length, branchRecords: loaded.branches.length, childRecords,
      nonSupportChildRecords: childRecords - supportOuterTypeRecords, supportOuterTypeRecords },
    rawOuterTypes: sortedCounts(state.rawOuterTypes, 'outerType'),
    rawAttributeTypes: sortedCounts(state.rawAttributeTypes, 'attributeType'),
    rawAttributeRawTypes: sortedCounts(state.rawAttributeRawTypes, 'rawType'),
    supportAttributeObservations: supportAttributeObservations(state, supportOuterTypeRecords),
    ownerSiteObservations: sortedCounts(state.ownerSiteObservations, 'ownerSite'),
    referenceCounts: state.referenceCounts, duplicateIdentities: benchmarkIndexCollisions(indexes),
    coordinateExtents: finalExtents(state.extents), inventoryStatus: 'PASS',
  });
}
