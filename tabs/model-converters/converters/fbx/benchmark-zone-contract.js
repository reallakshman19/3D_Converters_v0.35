import { deepFreeze } from './canonical-json.js';

export const FBX_BENCHMARK_ZONE_MANIFEST_SCHEMA = 'FbxBenchmarkZoneManifest.v1';
export const FBX_BENCHMARK_ZONE_POLICY = 'explicit-branch-owner-site-v1';
export const FBX_BENCHMARK_SHARED_BOUNDARY_POLICY = 'explicit-only';
export const FBX_BENCHMARK_ZONE_ERROR_CODES = deepFreeze({
  INVALID: 'FBX_BENCHMARK_ZONE_MANIFEST_INVALID',
});

const TOP_KEYS = [
  'schema', 'benchmark', 'zonePolicyId', 'sharedBoundaryPolicy', 'zones', 'exclusions',
];
const BENCHMARK_KEYS = ['commit', 'path', 'blobSha'];
const ZONE_KEYS = [
  'zoneId', 'displayName', 'ownerSites', 'owners', 'branches', 'sharedBoundaryBranches',
];
const EXCLUSION_KEYS = ['branchName', 'reason'];

export class FbxBenchmarkZoneManifestError extends Error {
  constructor(message) {
    super(`${FBX_BENCHMARK_ZONE_ERROR_CODES.INVALID} ${message}`);
    this.name = 'FbxBenchmarkZoneManifestError';
    this.code = FBX_BENCHMARK_ZONE_ERROR_CODES.INVALID;
  }
}

function fail(message) {
  throw new FbxBenchmarkZoneManifestError(message);
}

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.join('\0') !== expected.join('\0')) fail(`${label} fields are invalid.`);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be non-empty text.`);
  if (value !== value.trim()) fail(`${label} must not have surrounding whitespace.`);
  return value;
}

function canonicalTextList(values, label) {
  if (!Array.isArray(values)) fail(`${label} must be an array.`);
  const result = values.map((value, index) => requiredText(value, `${label}[${index}]`));
  const unique = new Set(result);
  if (unique.size !== result.length) fail(`${label} contains duplicates.`);
  return [...result].sort(compareText);
}

function canonicalBenchmark(benchmark) {
  exactKeys(benchmark, BENCHMARK_KEYS, 'benchmark');
  for (const key of BENCHMARK_KEYS) requiredText(benchmark[key], `benchmark.${key}`);
  if (!/^[0-9a-f]{40}$/.test(benchmark.commit)) fail('benchmark.commit must be a lowercase SHA-1.');
  if (!/^[0-9a-f]{40}$/.test(benchmark.blobSha)) fail('benchmark.blobSha must be a lowercase blob SHA-1.');
  return { commit: benchmark.commit, path: benchmark.path, blobSha: benchmark.blobSha };
}

function canonicalZone(zone, index) {
  exactKeys(zone, ZONE_KEYS, `zones[${index}]`);
  const canonical = {
    zoneId: requiredText(zone.zoneId, `zones[${index}].zoneId`),
    displayName: requiredText(zone.displayName, `zones[${index}].displayName`),
    ownerSites: canonicalTextList(zone.ownerSites, `zones[${index}].ownerSites`),
    owners: canonicalTextList(zone.owners, `zones[${index}].owners`),
    branches: canonicalTextList(zone.branches, `zones[${index}].branches`),
    sharedBoundaryBranches: canonicalTextList(
      zone.sharedBoundaryBranches,
      `zones[${index}].sharedBoundaryBranches`,
    ),
  };
  const selectorCount = canonical.ownerSites.length + canonical.owners.length
    + canonical.branches.length + canonical.sharedBoundaryBranches.length;
  if (!selectorCount) fail(`zones[${index}] has no membership authority.`);
  return canonical;
}

function canonicalExclusion(exclusion, index) {
  exactKeys(exclusion, EXCLUSION_KEYS, `exclusions[${index}]`);
  return {
    branchName: requiredText(exclusion.branchName, `exclusions[${index}].branchName`),
    reason: requiredText(exclusion.reason, `exclusions[${index}].reason`),
  };
}

function registerUnique(map, selector, zoneId, label) {
  const prior = map.get(selector);
  if (prior) fail(`${label} ${selector} is assigned to both ${prior} and ${zoneId}.`);
  map.set(selector, zoneId);
}

function validateZoneSelectors(zones, exclusions) {
  const zoneIds = new Set();
  const maps = { ownerSites: new Map(), owners: new Map(), branches: new Map() };
  const shared = new Map();
  for (const zone of zones) {
    if (zoneIds.has(zone.zoneId)) fail(`Duplicate zoneId ${zone.zoneId}.`);
    zoneIds.add(zone.zoneId);
    for (const key of Object.keys(maps)) {
      for (const selector of zone[key]) registerUnique(maps[key], selector, zone.zoneId, key);
    }
    for (const branch of zone.sharedBoundaryBranches) {
      const owners = shared.get(branch) || new Set();
      owners.add(zone.zoneId);
      shared.set(branch, owners);
    }
  }
  for (const [branch, owners] of shared) {
    if (owners.size < 2) fail(`Shared boundary ${branch} must belong to at least two zones.`);
    if (maps.branches.has(branch)) fail(`Branch ${branch} cannot be both ordinary and shared.`);
  }
  const excluded = new Set();
  for (const item of exclusions) {
    if (excluded.has(item.branchName)) fail(`Duplicate exclusion ${item.branchName}.`);
    excluded.add(item.branchName);
    if (maps.branches.has(item.branchName) || shared.has(item.branchName)) {
      fail(`Excluded branch ${item.branchName} also has zone authority.`);
    }
  }
}

function canonicalManifest(value) {
  exactKeys(value, TOP_KEYS, 'manifest');
  if (value.schema !== FBX_BENCHMARK_ZONE_MANIFEST_SCHEMA) fail('Manifest schema is invalid.');
  if (value.zonePolicyId !== FBX_BENCHMARK_ZONE_POLICY) fail('zonePolicyId is invalid.');
  if (value.sharedBoundaryPolicy !== FBX_BENCHMARK_SHARED_BOUNDARY_POLICY) {
    fail('sharedBoundaryPolicy is invalid.');
  }
  const benchmark = canonicalBenchmark(value.benchmark);
  if (!Array.isArray(value.zones) || !value.zones.length) fail('zones must be a non-empty array.');
  if (!Array.isArray(value.exclusions)) fail('exclusions must be an array.');
  const zones = value.zones.map(canonicalZone).sort((a, b) => compareText(a.zoneId, b.zoneId));
  const exclusions = value.exclusions.map(canonicalExclusion)
    .sort((a, b) => compareText(a.branchName, b.branchName));
  validateZoneSelectors(zones, exclusions);
  return {
    schema: FBX_BENCHMARK_ZONE_MANIFEST_SCHEMA,
    benchmark,
    zonePolicyId: FBX_BENCHMARK_ZONE_POLICY,
    sharedBoundaryPolicy: FBX_BENCHMARK_SHARED_BOUNDARY_POLICY,
    zones,
    exclusions,
  };
}

export function validateFbxBenchmarkZoneManifest(value) {
  const canonical = canonicalManifest(value);
  if (JSON.stringify(value) !== JSON.stringify(canonical)) fail('Manifest is not canonically ordered.');
  return value;
}

export function buildFbxBenchmarkZoneManifest(value) {
  return deepFreeze(canonicalManifest(value));
}
