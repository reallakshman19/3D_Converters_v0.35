import { deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import {
  canonicalKey, cloneJson, compareText, fail, isObject, point,
} from './component-common.js';
import {
  benchmarkBranchOccurrences, benchmarkComponentOccurrences,
  branchRecordForOccurrence, validateLoadedBenchmark,
} from './component-occurrences.js';
import {
  catalogEntryForTypes, validateComponentIdentityPolicy,
} from './component-policy.js';
import {
  buildComponentZoneResolver, componentZoneBlockers,
} from './component-zone.js';

const FIELD_ALIASES = Object.freeze({
  zoneId: (subject) => subject.zoneMembership.zoneIds.length === 1
    ? subject.zoneMembership.zoneIds[0] : null,
  zoneIds: (subject) => subject.zoneMembership.zoneIds,
  zoneStatus: (subject) => subject.zoneMembership.status,
  branchId: (subject) => subject.branchId,
  owner: (subject) => subject.owner,
  family: (subject) => subject.family,
  outerType: (subject) => subject.outerType,
  rawType: (subject) => subject.rawType,
  subtype: (subject) => subject.subtype,
  reference: (subject) => subject.reference,
  name: (subject) => subject.sourceName,
  sourceIdentity: (subject) => subject.sourceIdentity,
  'geometry.position': (subject) => subject.geometry.position,
  'geometry.apos': (subject) => subject.geometry.apos,
  'geometry.lpos': (subject) => subject.geometry.lpos,
  'attributes.AUTO_GENERATED_PIPE': (subject) => subject.attributes.AUTO_GENERATED_PIPE,
  'attributes.GAP_MM': (subject) => subject.attributes.GAP_MM,
  'attributes.ROUTE_TIER': (subject) => subject.attributes.ROUTE_TIER,
  'attributes.ROUTE_SPLIT': (subject) => subject.attributes.ROUTE_SPLIT,
  'attributes.BORE_SOURCE': (subject) => subject.attributes.BORE_SOURCE,
});

export function childType(record) {
  return String(record?.type ?? '').trim().toUpperCase();
}

export function rawType(record) {
  const attributes = isObject(record?.attributes) ? record.attributes : {};
  return String(attributes.RAW_TYPE ?? attributes.TYPE ?? record?.type ?? '')
    .trim().toUpperCase() || null;
}

function branchIdentity(record) {
  const attributes = isObject(record?.attributes) ? record.attributes : {};
  return String(
    attributes.REF ?? attributes.NAME ?? record?.id ?? record?.name ?? '',
  ).trim() || null;
}

function sourceIdentityOf(record) {
  const attributes = isObject(record?.attributes) ? record.attributes : {};
  const value = attributes.sourceModelObjectId
    ?? attributes.SOURCE_OBJECT_ID
    ?? record?.sourceModelObjectId;
  return value === undefined || value === null || value === '' ? null : String(value);
}

export function fieldValue(subject, path) {
  if (FIELD_ALIASES[path]) return FIELD_ALIASES[path](subject);
  const parts = path.split('.');
  let value = subject;
  for (const part of parts) {
    if (!isObject(value) && !Array.isArray(value)) return undefined;
    value = value[part];
  }
  return value;
}

function subjectFields(branch, record, attributes, catalogEntry, occurrence, side, zoneMembership, outer, raw) {
  return {
    side,
    sourceOccurrenceId: occurrence.occurrenceId,
    branchOccurrenceId: occurrence.branchOccurrenceId,
    zoneMembership,
    qualificationBlockers: componentZoneBlockers(zoneMembership),
    family: catalogEntry?.familyId ?? 'UNKNOWN',
    outerType: outer,
    rawType: raw,
    subtype: catalogEntry?.preserveRawSubtype ? raw : null,
    disposition: catalogEntry?.disposition ?? 'BLOCK',
    comparatorId: catalogEntry?.comparatorId ?? null,
    exclusionReason: catalogEntry?.exclusionReason ?? null,
    branchId: branchIdentity(branch),
    owner: attributes.OWNER == null ? null : String(attributes.OWNER),
    reference: attributes.REF == null ? null : String(attributes.REF),
    sourceName: attributes.NAME == null
      ? (record.name == null ? null : String(record.name)) : String(attributes.NAME),
    displayName: record.name == null ? null : String(record.name),
    sourceIdentity: sourceIdentityOf(record),
    geometry: {
      position: point(attributes.POS),
      apos: point(attributes.APOS),
      lpos: point(attributes.LPOS),
    },
    attributes: cloneJson(attributes),
    raw: cloneJson(record),
  };
}

function normalizeSubject(branchOccurrence, occurrence, policy, side, zoneMembership) {
  const branch = branchOccurrence.record, record = occurrence.record;
  const attributes = isObject(record.attributes) ? record.attributes : {};
  const outer = childType(record), raw = rawType(record);
  const catalogEntry = catalogEntryForTypes(outer, raw, policy);
  const subject = subjectFields(branch, record, attributes, catalogEntry, occurrence, side, zoneMembership, outer, raw);
  subject.canonicalSubject = canonicalKey({
    family: subject.family,
    outerType: subject.outerType,
    rawType: subject.rawType,
    zoneMembership: subject.zoneMembership,
    branchId: subject.branchId,
    owner: subject.owner,
    reference: subject.reference,
    sourceName: subject.sourceName,
    sourceIdentity: subject.sourceIdentity,
    geometry: subject.geometry,
    attributes: subject.attributes,
  });
  return subject;
}

async function assignSubjectIds(subjects, side) {
  const grouped = new Map();
  for (const subject of subjects) {
    const list = grouped.get(subject.canonicalSubject) || [];
    list.push(subject);
    grouped.set(subject.canonicalSubject, list);
  }
  const result = [];
  for (const key of [...grouped.keys()].sort(compareText)) {
    const hash = await sha256Hex(key);
    const list = grouped.get(key).sort((left, right) => (
      compareText(left.sourceOccurrenceId, right.sourceOccurrenceId)
    ));
    for (let index = 0; index < list.length; index += 1) {
      result.push({
        ...list[index],
        subjectId: `${side === 'REFERENCE' ? 'R' : 'A'}-COMP-${hash.slice(0, 24)}-${index + 1}`,
        canonicalSubjectPayloadSha256: hash,
        multiplicityIndex: index + 1,
      });
    }
  }
  return result.sort((left, right) => compareText(left.subjectId, right.subjectId));
}

export async function buildComponentSubjects(
  loadedValue,
  policyValue,
  side = 'REFERENCE',
  { zoneIndex, benchmarkIdentity = {} } = {},
) {
  const policy = validateComponentIdentityPolicy(policyValue);
  const loaded = validateLoadedBenchmark(loadedValue, side);
  const branchOccurrences = benchmarkBranchOccurrences(loaded, side);
  const branches = branchOccurrences.map((occurrence) => occurrence.record);
  const zoneFor = buildComponentZoneResolver(
    zoneIndex, branches, side, benchmarkIdentity,
  );
  const zoneByBranchOccurrence = new Map(branchOccurrences.map((occurrence) => [
    occurrence.occurrenceId, zoneFor(occurrence.record),
  ]));
  const subjects = benchmarkComponentOccurrences(loaded, side).map((occurrence) => {
    const branchOccurrence = branchRecordForOccurrence(loaded, occurrence, side);
    const zoneMembership = zoneByBranchOccurrence.get(occurrence.branchOccurrenceId);
    if (!zoneMembership) fail(`${side} occurrence ${occurrence.occurrenceId} lacks zone evidence.`);
    return normalizeSubject(
      branchOccurrence, occurrence, policy, side, cloneJson(zoneMembership),
    );
  });
  return deepFreeze(await assignSubjectIds(subjects, side));
}

export function discoverComponentCatalog(loadedValue) {
  const loaded = validateLoadedBenchmark(loadedValue, 'benchmark');
  const countsByOuterType = new Map(), countsByRawType = new Map();
  let supportCount = 0, componentCount = 0;
  for (const occurrence of loaded.occurrences) {
    if (occurrence.childIndex === null) continue;
    const outer = childType(occurrence.record);
    if (outer === 'SUPPORT') {
      supportCount += 1;
      continue;
    }
    componentCount += 1;
    const raw = rawType(occurrence.record) ?? 'UNKNOWN';
    countsByOuterType.set(outer, (countsByOuterType.get(outer) || 0) + 1);
    countsByRawType.set(raw, (countsByRawType.get(raw) || 0) + 1);
  }
  const sortedObject = (map) => Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => compareText(left, right)),
  );
  return deepFreeze({
    schema: 'FbxComponentCatalog.v1',
    branchCount: benchmarkBranchOccurrences(loaded).length,
    componentCount,
    supportCount,
    countsByOuterType: sortedObject(countsByOuterType),
    countsByRawType: sortedObject(countsByRawType),
  });
}
