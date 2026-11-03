import { FBX_BENCHMARK_ZONE_POLICY } from './benchmark-zone-contract.js';
import {
  FBX_ZONE_MEMBERSHIP_AUTHORITIES,
  FBX_ZONE_MEMBERSHIP_INDEX_SCHEMA,
  FBX_ZONE_MEMBERSHIP_STATUSES,
  FBX_ZONE_SIGNAL_ORDER,
} from './benchmark-zone-membership.js';

const INDEX_KEYS = [
  'schema', 'benchmark', 'zonePolicyId', 'records', 'zones',
  'conflictBranchNames', 'unassignedBranchNames', 'excludedBranchNames',
];
const BENCHMARK_KEYS = ['commit', 'path', 'blobSha'];
const RECORD_KEYS = [
  'branchName', 'owner', 'ownerSite', 'status', 'authority', 'zoneIds',
  'candidateZoneIds', 'signals', 'exclusionReason',
];
const SIGNAL_KEYS = ['authority', 'zoneIds'];
const ZONE_KEYS = ['zoneId', 'branchNames', 'sharedBoundaryBranchNames'];
const STATUS_SET = new Set(FBX_ZONE_MEMBERSHIP_STATUSES);
const AUTHORITY_SET = new Set(FBX_ZONE_MEMBERSHIP_AUTHORITIES);

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.join('\0') !== expected.join('\0')) throw new Error(`${label} fields are invalid.`);
}

function sortedUnique(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array.`);
  const sorted = [...values].sort(compareText);
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates.`);
  if (JSON.stringify(values) !== JSON.stringify(sorted)) throw new Error(`${label} is not sorted.`);
}

function uniqueZoneIds(signals) {
  return [...new Set(signals.flatMap((signal) => signal.zoneIds))].sort(compareText);
}

function validateBenchmark(benchmark) {
  exactKeys(benchmark, BENCHMARK_KEYS, 'benchmark');
  if (!/^[0-9a-f]{40}$/.test(benchmark.commit)
    || !/^[0-9a-f]{40}$/.test(benchmark.blobSha)
    || typeof benchmark.path !== 'string' || !benchmark.path) {
    throw new Error('Zone index benchmark identity is invalid.');
  }
}

function validateSignal(signal, label, zoneIds) {
  exactKeys(signal, SIGNAL_KEYS, label);
  if (!FBX_ZONE_SIGNAL_ORDER.includes(signal.authority)) {
    throw new Error(`${label} authority is invalid.`);
  }
  sortedUnique(signal.zoneIds, `${label}.zoneIds`);
  if (!signal.zoneIds.length) throw new Error(`${label}.zoneIds must not be empty.`);
  for (const zoneId of signal.zoneIds) if (!zoneIds.has(zoneId)) {
    throw new Error(`${label} references unknown zone ${zoneId}.`);
  }
}

function validateSignalOrder(record, label) {
  const authorities = record.signals.map((signal) => signal.authority);
  if (new Set(authorities).size !== authorities.length) {
    throw new Error(`${label}.signals repeat authority.`);
  }
  const ordered = [...authorities].sort((a, b) => (
    FBX_ZONE_SIGNAL_ORDER.indexOf(a) - FBX_ZONE_SIGNAL_ORDER.indexOf(b)
  ));
  if (JSON.stringify(authorities) !== JSON.stringify(ordered)) {
    throw new Error(`${label}.signals are not in authority order.`);
  }
}

function validateAssignedState(record, label) {
  const first = record.signals[0];
  if (!first || JSON.stringify(record.zoneIds) !== JSON.stringify(first.zoneIds)) {
    throw new Error(`${label} assignment does not match the highest authority signal.`);
  }
  if (record.status === 'ASSIGNED') {
    if (!['branch', 'owner', 'owner-site'].includes(record.authority) || record.zoneIds.length !== 1) {
      throw new Error(`${label} assigned state is invalid.`);
    }
  } else if (record.authority !== 'shared-boundary' || record.zoneIds.length < 2) {
    throw new Error(`${label} shared boundary state is invalid.`);
  }
}

function validateRecordState(record, label) {
  if (record.status === 'ASSIGNED' || record.status === 'SHARED_BOUNDARY') {
    validateAssignedState(record, label);
  } else if (record.zoneIds.length) throw new Error(`${label} must not assign zones.`);
  if (record.status === 'CONFLICT') {
    if (!record.signals.length || record.authority !== record.signals[0].authority
      || record.candidateZoneIds.length < 2) throw new Error(`${label} conflict state is invalid.`);
  }
  if (record.status === 'UNASSIGNED' && (record.authority !== 'none'
    || record.signals.length || record.candidateZoneIds.length)) {
    throw new Error(`${label} unassigned state is invalid.`);
  }
  if (record.status === 'EXCLUDED') validateExclusion(record, label);
  else if (record.exclusionReason !== null) throw new Error(`${label} has an unexpected exclusion.`);
}

function validateExclusion(record, label) {
  if (record.authority !== 'exclusion' || typeof record.exclusionReason !== 'string'
    || !record.exclusionReason.trim()) throw new Error(`${label} exclusion state is invalid.`);
}

function validateRecord(record, index, zoneIds) {
  const label = `records[${index}]`;
  exactKeys(record, RECORD_KEYS, label);
  if (typeof record.branchName !== 'string' || !record.branchName
    || typeof record.owner !== 'string' || typeof record.ownerSite !== 'string') {
    throw new Error(`${label} identity evidence is invalid.`);
  }
  if (!STATUS_SET.has(record.status) || !AUTHORITY_SET.has(record.authority)) {
    throw new Error(`${label} status or authority is invalid.`);
  }
  sortedUnique(record.zoneIds, `${label}.zoneIds`);
  sortedUnique(record.candidateZoneIds, `${label}.candidateZoneIds`);
  if (!Array.isArray(record.signals)) throw new Error(`${label}.signals must be an array.`);
  record.signals.forEach((signal, signalIndex) => validateSignal(
    signal, `${label}.signals[${signalIndex}]`, zoneIds,
  ));
  validateSignalOrder(record, label);
  if (JSON.stringify(record.candidateZoneIds) !== JSON.stringify(uniqueZoneIds(record.signals))) {
    throw new Error(`${label}.candidateZoneIds do not match signals.`);
  }
  validateRecordState(record, label);
}

function derivedZoneSummaries(zones, records) {
  return zones.map((zone) => ({
    zoneId: zone.zoneId,
    branchNames: records.filter((record) => (
      record.status === 'ASSIGNED' && record.zoneIds.includes(zone.zoneId)
    )).map((record) => record.branchName).sort(compareText),
    sharedBoundaryBranchNames: records.filter((record) => (
      record.status === 'SHARED_BOUNDARY' && record.zoneIds.includes(zone.zoneId)
    )).map((record) => record.branchName).sort(compareText),
  }));
}

function validateZones(zones, records) {
  if (!Array.isArray(zones)) throw new Error('zones must be an array.');
  sortedUnique(zones.map((zone) => zone.zoneId), 'zone ids');
  const ids = new Set();
  zones.forEach((zone, index) => {
    exactKeys(zone, ZONE_KEYS, `zones[${index}]`);
    ids.add(zone.zoneId);
    sortedUnique(zone.branchNames, `zones[${index}].branchNames`);
    sortedUnique(zone.sharedBoundaryBranchNames, `zones[${index}].sharedBoundaryBranchNames`);
  });
  if (JSON.stringify(zones) !== JSON.stringify(derivedZoneSummaries(zones, records))) {
    throw new Error('Zone summaries are not derived.');
  }
  return ids;
}

function validateDerivedLists(index) {
  const derived = (status) => index.records.filter((record) => record.status === status)
    .map((record) => record.branchName);
  for (const [status, key] of [
    ['CONFLICT', 'conflictBranchNames'],
    ['UNASSIGNED', 'unassignedBranchNames'],
    ['EXCLUDED', 'excludedBranchNames'],
  ]) {
    sortedUnique(index[key], key);
    if (JSON.stringify(index[key]) !== JSON.stringify(derived(status))) {
      throw new Error(`${key} is not derived from records.`);
    }
  }
}

export function validateFbxZoneMembershipIndex(index) {
  exactKeys(index, INDEX_KEYS, 'zone membership index');
  if (index.schema !== FBX_ZONE_MEMBERSHIP_INDEX_SCHEMA) throw new Error('Zone index schema is invalid.');
  validateBenchmark(index.benchmark);
  if (index.zonePolicyId !== FBX_BENCHMARK_ZONE_POLICY) throw new Error('Zone index policy is invalid.');
  if (!Array.isArray(index.records)) throw new Error('records must be an array.');
  const zoneIds = validateZones(index.zones, index.records);
  index.records.forEach((record, recordIndex) => validateRecord(record, recordIndex, zoneIds));
  sortedUnique(index.records.map((record) => record.branchName), 'record branch names');
  validateDerivedLists(index);
  return index;
}
