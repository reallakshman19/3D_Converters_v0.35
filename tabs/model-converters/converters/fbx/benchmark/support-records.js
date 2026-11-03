import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

function compareText(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pointValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = [value.x, value.y, value.z];
  if (raw.some((item) => item === null || item === undefined || item === '')) return null;
  const point = { x: Number(raw[0]), y: Number(raw[1]), z: Number(raw[2]) };
  return Object.values(point).every(Number.isFinite) ? point : null;
}

function branchIdentity(branch) {
  const attributes = branch?.attributes && typeof branch.attributes === 'object' ? branch.attributes : {};
  return nonEmptyText(attributes.NAME) || nonEmptyText(branch?.name) || nonEmptyText(attributes.REF) || null;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function expectedBranchId(branchIndex) {
  return `branch:${branchIndex}`;
}

function validateBranchOccurrence(loaded, occurrence, index) {
  const at = `loaded.occurrences[${index}]`;
  const expectedId = expectedBranchId(occurrence.branchIndex);
  if (occurrence.childIndex !== null || occurrence.recordRole !== 'BRANCH_RECORD'
    || occurrence.parentOccurrenceId !== null
    || occurrence.occurrenceId !== expectedId
    || occurrence.branchOccurrenceId !== expectedId
    || occurrence.record.type !== 'BRANCH') {
    throw new TypeError(`${at} is not a valid Agent E branch occurrence.`);
  }
  if (loaded.branches[occurrence.branchIndex] !== occurrence.record) {
    throw new TypeError(`${at} does not preserve loaded.branches identity.`);
  }
}

function validateChildOccurrence(loaded, occurrence, index) {
  const at = `loaded.occurrences[${index}]`;
  const branchOccurrenceId = expectedBranchId(occurrence.branchIndex);
  const expectedId = `${branchOccurrenceId}/child:${occurrence.childIndex}`;
  if (!Number.isInteger(occurrence.childIndex) || occurrence.childIndex < 0
    || occurrence.recordRole !== 'CHILD_RECORD'
    || occurrence.branchOccurrenceId !== branchOccurrenceId
    || occurrence.parentOccurrenceId !== branchOccurrenceId
    || occurrence.occurrenceId !== expectedId) {
    throw new TypeError(`${at} is not a valid Agent E child occurrence.`);
  }
  const branch = loaded.branches[occurrence.branchIndex];
  if (!branch || !Array.isArray(branch.children)
    || branch.children[occurrence.childIndex] !== occurrence.record) {
    throw new TypeError(`${at} does not preserve branch child identity.`);
  }
  const parent = loaded.occurrenceById[branchOccurrenceId];
  if (!parent || parent.childIndex !== null || parent.branchIndex !== occurrence.branchIndex) {
    throw new TypeError(`${at} references an invalid branch occurrence.`);
  }
}

function validateOccurrence(loaded, occurrence, index, ids) {
  const at = `loaded.occurrences[${index}]`;
  assertObject(occurrence, at);
  if (!nonEmptyText(occurrence.occurrenceId)
    || !nonEmptyText(occurrence.branchOccurrenceId)
    || !Number.isInteger(occurrence.branchIndex) || occurrence.branchIndex < 0
    || occurrence.branchIndex >= loaded.branches.length) {
    throw new TypeError(`${at} has invalid Agent E identity fields.`);
  }
  assertObject(occurrence.record, `${at}.record`);
  if (ids.has(occurrence.occurrenceId)) {
    throw new TypeError(`Loaded benchmark contains duplicate occurrence ${occurrence.occurrenceId}.`);
  }
  ids.add(occurrence.occurrenceId);
  if (loaded.occurrenceById[occurrence.occurrenceId] !== occurrence) {
    throw new TypeError(`${at} is not preserved by occurrenceById.`);
  }
  if (occurrence.childIndex === null) validateBranchOccurrence(loaded, occurrence, index);
  else validateChildOccurrence(loaded, occurrence, index);
}

function expectedOccurrenceCount(branches) {
  return branches.reduce((count, branch, index) => {
    assertObject(branch, `loaded.branches[${index}]`);
    if (branch.type !== 'BRANCH' || !Array.isArray(branch.children)) {
      throw new TypeError(`loaded.branches[${index}] is not a valid branch record.`);
    }
    return count + 1 + branch.children.length;
  }, 0);
}

function assertLoadedBenchmark(value) {
  const loaded = assertObject(value, 'loaded benchmark');
  if (loaded.schema !== 'FbxBenchmarkLoaded.v1') {
    throw new TypeError('Support qualification requires FbxBenchmarkLoaded.v1.');
  }
  if (!Array.isArray(loaded.branches) || !Array.isArray(loaded.occurrences)
    || !loaded.occurrenceById || typeof loaded.occurrenceById !== 'object'
    || Array.isArray(loaded.occurrenceById)) {
    throw new TypeError('Loaded benchmark branches, occurrences, and occurrenceById are required.');
  }
  const expectedCount = expectedOccurrenceCount(loaded.branches);
  if (loaded.occurrences.length !== expectedCount) {
    throw new TypeError('Loaded benchmark occurrences do not exactly cover branch records and children.');
  }
  const ids = new Set();
  loaded.occurrences.forEach((occurrence, index) => {
    validateOccurrence(loaded, occurrence, index, ids);
  });
  if (Object.keys(loaded.occurrenceById).length !== expectedCount) {
    throw new TypeError('Loaded benchmark occurrenceById does not exactly cover occurrences.');
  }
  return loaded;
}

function rawTypeEvidence(attributes) {
  const values = [attributes.RAW_TYPE, attributes.TYPE].map(nonEmptyText).filter(Boolean);
  const unique = [...new Set(values)].sort(compareText);
  return { rawType: unique.length === 1 ? unique[0] : null, rawTypeConflicts: unique.length > 1 ? unique : [] };
}

function rawCandidate(loaded, occurrence) {
  const node = occurrence.record;
  const branch = loaded.branches[occurrence.branchIndex];
  const attributes = node?.attributes && typeof node.attributes === 'object' && !Array.isArray(node.attributes)
    ? node.attributes : {};
  const rawType = rawTypeEvidence(attributes);
  return {
    parentBranch: branchIdentity(branch),
    sourceOccurrenceId: occurrence.occurrenceId,
    branchOccurrenceId: occurrence.branchOccurrenceId,
    rawNode: structuredClone(node),
    attributes: structuredClone(attributes),
    sourceRef: nonEmptyText(attributes.REF),
    sourceName: nonEmptyText(attributes.NAME),
    supportTag: nonEmptyText(attributes.SUPPORT_TAG) || nonEmptyText(node?.name),
    rawType: rawType.rawType,
    rawTypeConflicts: rawType.rawTypeConflicts,
    ownerBranch: nonEmptyText(attributes.OWNER),
    position: pointValue(attributes.POS),
    orientation: nonEmptyText(attributes.ORI),
  };
}

function supportCandidates(loaded) {
  return loaded.occurrences
    .filter((occurrence) => occurrence.childIndex !== null && occurrence.record.type === 'SUPPORT')
    .map((occurrence) => rawCandidate(loaded, occurrence));
}

async function evidenceCandidate(candidate) {
  const canonical = canonicalJson({
    branchOccurrenceId: candidate.branchOccurrenceId,
    parentBranch: candidate.parentBranch,
    rawNode: candidate.rawNode,
  });
  return { ...candidate, evidenceSha256: await sha256Hex(canonical), canonical };
}

async function assignStableIds(candidates) {
  const evidenced = await Promise.all(candidates.map(evidenceCandidate));
  const groups = new Map();
  for (const candidate of evidenced) {
    const key = `${candidate.branchOccurrenceId}\u0000${candidate.evidenceSha256}\u0000${candidate.canonical}`;
    const list = groups.get(key) || [];
    list.push(candidate);
    groups.set(key, list);
  }
  return finalizeGroups(groups);
}

async function finalizeGroups(groups) {
  const records = [];
  for (const [groupKey, group] of [...groups.entries()].sort(([a], [b]) => compareText(a, b))) {
    const groupSha256 = await sha256Hex(groupKey);
    group.sort((left, right) => compareText(left.sourceOccurrenceId, right.sourceOccurrenceId));
    for (let index = 0; index < group.length; index += 1) {
      records.push(finalRecord(group[index], groupSha256, index + 1));
    }
  }
  return records.sort((left, right) => compareText(left.recordId, right.recordId));
}

function finalRecord(candidate, groupSha256, occurrence) {
  const { canonical, ...retained } = candidate;
  return deepFreeze({
    ...retained,
    recordId: `support:sha256:${groupSha256}:${String(occurrence).padStart(4, '0')}`,
    sourceLocator: `${candidate.branchOccurrenceId}/SUPPORT/${groupSha256}/${occurrence}`,
  });
}

export async function collectSupportRecords(loadedValue) {
  const loaded = assertLoadedBenchmark(loadedValue);
  return assignStableIds(supportCandidates(loaded));
}

function increment(counts, value) {
  const key = value ?? '<UNCLASSIFIED>';
  counts[key] = (counts[key] || 0) + 1;
}

export function buildSupportInventory(records) {
  if (!Array.isArray(records)) throw new TypeError('Support records must be an array.');
  const countsByRawType = {};
  const tags = new Map();
  let unassignedOwnerCount = 0;
  let rawTypeConflictCount = 0;
  for (const record of records) {
    increment(countsByRawType, record.rawType);
    if (!record.ownerBranch) unassignedOwnerCount += 1;
    if (record.rawTypeConflicts.length) rawTypeConflictCount += 1;
    if (record.supportTag) {
      const list = tags.get(record.supportTag) || [];
      list.push(record.recordId);
      tags.set(record.supportTag, list);
    }
  }
  const duplicateTagGroups = [...tags.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([supportTag, recordIds]) => ({ supportTag, recordIds: [...recordIds].sort(compareText) }))
    .sort((left, right) => compareText(left.supportTag, right.supportTag));
  return deepFreeze({ supportCount: records.length, countsByRawType, unassignedOwnerCount, rawTypeConflictCount, duplicateTagGroups });
}
