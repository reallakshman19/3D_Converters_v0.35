import { deepFreeze } from '../canonical-json.js';

function text(value) {
  return value == null ? '' : String(value);
}

function add(index, key, occurrence) {
  const observed = text(key);
  if (!observed) return;
  const values = index.get(observed) || [];
  values.push(occurrence);
  index.set(observed, values);
}

function freezeIndex(index) {
  return Object.freeze(Object.fromEntries(
    [...index.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, values]) => [key, deepFreeze([...values])]),
  ));
}

function observeRawRecord(occurrence, indexes) {
  const { record } = occurrence, attributes = record.attributes || {};
  add(indexes.byOuterType, record.type, occurrence);
  add(indexes.byRecordName, record.name, occurrence);
  add(indexes.byAttributesType, attributes.TYPE, occurrence);
  add(indexes.byAttributesRawType, attributes.RAW_TYPE, occurrence);
  add(indexes.bySourceReference, attributes.REF, occurrence);
  add(indexes.byHref, attributes.HREF, occurrence);
  add(indexes.byTref, attributes.TREF, occurrence);
}

function observeSupport(occurrence, indexes) {
  const { record } = occurrence, attributes = record.attributes || {};
  if (record.type !== 'SUPPORT') return;
  add(indexes.supportByTag, attributes.SUPPORT_TAG, occurrence);
  add(indexes.supportByRecordName, record.name, occurrence);
  add(indexes.supportByOwnerBranch, attributes.OWNER, occurrence);
  add(indexes.supportByKindObservation, attributes.SUPPORT_KIND, occurrence);
  add(indexes.supportByMapperKindObservation, attributes.SUPPORT_MAPPER_KIND, occurrence);
  add(indexes.supportByTypeObservation, attributes.SUPPORT_TYPE, occurrence);
}

export function buildFbxBenchmarkIndexes(loaded) {
  const indexes = {
    branchByName: new Map(), branchByOwner: new Map(), branchByOwnerSite: new Map(),
    byOuterType: new Map(), byRecordName: new Map(), byAttributesType: new Map(),
    byAttributesRawType: new Map(), bySourceReference: new Map(), byHref: new Map(), byTref: new Map(),
    supportByTag: new Map(), supportByRecordName: new Map(), supportByOwnerBranch: new Map(),
    supportByKindObservation: new Map(), supportByMapperKindObservation: new Map(),
    supportByTypeObservation: new Map(),
  };
  for (const occurrence of loaded.occurrences) {
    observeRawRecord(occurrence, indexes);
    if (occurrence.childIndex !== null) { observeSupport(occurrence, indexes); continue; }
    const attributes = occurrence.record.attributes || {};
    add(indexes.branchByName, attributes.NAME || occurrence.record.name, occurrence);
    add(indexes.branchByOwner, attributes.OWNER, occurrence);
    add(indexes.branchByOwnerSite, attributes.OWNER_SITE, occurrence);
  }
  return deepFreeze(Object.fromEntries(Object.entries(indexes).map(([name, index]) => [name, freezeIndex(index)])));
}

export function benchmarkIndexCollisions(indexes) {
  const collisions = [];
  const identityIndexes = ['branchByName', 'bySourceReference', 'supportByTag', 'supportByRecordName'];
  for (const indexName of identityIndexes) {
    const index = indexes[indexName];
    for (const [key, occurrences] of Object.entries(index)) {
      if (occurrences.length > 1) collisions.push({ indexName, key,
        occurrenceIds: occurrences.map((item) => item.occurrenceId).sort() });
    }
  }
  return deepFreeze(collisions.sort((left, right) => left.indexName === right.indexName
    ? left.key < right.key ? -1 : left.key > right.key ? 1 : 0
    : left.indexName < right.indexName ? -1 : 1));
}
