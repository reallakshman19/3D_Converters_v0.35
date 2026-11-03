import { validateFbxZoneMembershipIndex } from '../benchmark-zone-index.js';
import { cloneJson, compareText, fail, isObject } from './component-common.js';

const PASSING_ZONE_STATUSES = new Set(['ASSIGNED', 'SHARED_BOUNDARY']);
const BENCHMARK_KEYS = ['commit', 'path', 'blobSha'];

function branchName(branch, side) {
  const name = branch?.name;
  if (typeof name !== 'string' || !name) {
    fail(`${side} component branch lacks the name required by the zone index.`);
  }
  return name;
}

function comparableBenchmark(value) {
  if (!isObject(value) || !BENCHMARK_KEYS.every((key) => typeof value[key] === 'string')) {
    return null;
  }
  return Object.fromEntries(BENCHMARK_KEYS.map((key) => [key, value[key]]));
}

function assertBenchmarkIdentity(index, benchmarkIdentity, side) {
  const expected = comparableBenchmark(benchmarkIdentity);
  if (!expected) return;
  if (BENCHMARK_KEYS.some((key) => index.benchmark[key] !== expected[key])) {
    fail(`${side} zone index is bound to a different benchmark identity.`);
  }
}

function assertExactCoverage(index, branches, side) {
  const branchNames = branches.map((branch) => branchName(branch, side)).sort(compareText);
  if (new Set(branchNames).size !== branchNames.length) {
    fail(`${side} component input contains duplicate branch names.`);
  }
  const recordNames = index.records.map((record) => record.branchName);
  if (JSON.stringify(branchNames) !== JSON.stringify(recordNames)) {
    fail(`${side} zone index does not exactly cover the component branch population.`);
  }
}

function membershipRecord(record) {
  return {
    branchName: record.branchName,
    status: record.status,
    authority: record.authority,
    zoneIds: [...record.zoneIds],
    candidateZoneIds: [...record.candidateZoneIds],
    exclusionReason: record.exclusionReason,
  };
}

export function componentZoneBlockers(membership) {
  if (PASSING_ZONE_STATUSES.has(membership.status)) return [];
  return [`ZONE_${membership.status}`];
}

export function buildComponentZoneResolver(
  indexValue,
  branches,
  side,
  benchmarkIdentity = {},
) {
  if (!indexValue) fail(`${side} zone membership index is required.`);
  const index = validateFbxZoneMembershipIndex(indexValue);
  assertBenchmarkIdentity(index, benchmarkIdentity, side);
  assertExactCoverage(index, branches, side);
  const byBranchName = new Map(index.records.map((record) => [
    record.branchName,
    membershipRecord(record),
  ]));
  return (branch) => cloneJson(byBranchName.get(branchName(branch, side)));
}
