import { deepFreeze } from './canonical-json.js';
import { validateFbxBenchmarkZoneManifest } from './benchmark-zone-contract.js';

export const FBX_ZONE_MEMBERSHIP_INDEX_SCHEMA = 'FbxZoneMembershipIndex.v1';
export const FBX_ZONE_MEMBERSHIP_STATUSES = deepFreeze([
  'ASSIGNED', 'SHARED_BOUNDARY', 'CONFLICT', 'UNASSIGNED', 'EXCLUDED',
]);
export const FBX_ZONE_MEMBERSHIP_AUTHORITIES = deepFreeze([
  'shared-boundary', 'branch', 'owner', 'owner-site', 'none', 'exclusion',
]);
export const FBX_ZONE_SIGNAL_ORDER = deepFreeze([
  'shared-boundary', 'branch', 'owner', 'owner-site',
]);

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function branchText(branch, key) {
  const value = branch?.attributes?.[key];
  return value == null ? '' : String(value);
}

function validateBranches(branches) {
  if (!Array.isArray(branches)) throw new Error('FBX benchmark branches must be an array.');
  const names = new Set();
  for (const branch of branches) {
    if (!branch || branch.type !== 'BRANCH' || typeof branch.name !== 'string' || !branch.name) {
      throw new Error('FBX benchmark zone membership requires named BRANCH records.');
    }
    if (!branch.attributes || typeof branch.attributes !== 'object' || Array.isArray(branch.attributes)) {
      throw new Error(`FBX benchmark branch ${branch.name} lacks attributes.`);
    }
    if (names.has(branch.name)) throw new Error(`Duplicate FBX benchmark branch ${branch.name}.`);
    names.add(branch.name);
  }
}

function selectorMaps(manifest) {
  const maps = {
    branch: new Map(), owner: new Map(), 'owner-site': new Map(), 'shared-boundary': new Map(),
  };
  for (const zone of manifest.zones) {
    for (const value of zone.branches) maps.branch.set(value, [zone.zoneId]);
    for (const value of zone.owners) maps.owner.set(value, [zone.zoneId]);
    for (const value of zone.ownerSites) maps['owner-site'].set(value, [zone.zoneId]);
    for (const value of zone.sharedBoundaryBranches) {
      const zones = maps['shared-boundary'].get(value) || [];
      zones.push(zone.zoneId);
      maps['shared-boundary'].set(value, zones.sort(compareText));
    }
  }
  return maps;
}

function signalsFor(branch, maps) {
  const values = {
    'shared-boundary': branch.name,
    branch: branch.name,
    owner: branchText(branch, 'OWNER'),
    'owner-site': branchText(branch, 'OWNER_SITE'),
  };
  return FBX_ZONE_SIGNAL_ORDER.flatMap((authority) => {
    const zoneIds = maps[authority].get(values[authority]);
    return zoneIds ? [{ authority, zoneIds: [...zoneIds] }] : [];
  });
}

function uniqueZoneIds(signals) {
  return [...new Set(signals.flatMap((signal) => signal.zoneIds))].sort(compareText);
}

function hasConflictingSignal(selected, signals) {
  const accepted = new Set(selected.zoneIds);
  return signals.some((signal) => signal.zoneIds.some((zoneId) => !accepted.has(zoneId)));
}

function classifiedRecord(signals) {
  if (!signals.length) return { status: 'UNASSIGNED', authority: 'none', zoneIds: [] };
  const selected = signals[0];
  if (hasConflictingSignal(selected, signals.slice(1))) {
    return { status: 'CONFLICT', authority: selected.authority, zoneIds: [] };
  }
  return {
    status: selected.authority === 'shared-boundary' ? 'SHARED_BOUNDARY' : 'ASSIGNED',
    authority: selected.authority,
    zoneIds: [...selected.zoneIds],
  };
}

function exclusionMap(manifest) {
  return new Map(manifest.exclusions.map((item) => [item.branchName, item.reason]));
}

function recordFor(branch, maps, exclusions) {
  const signals = signalsFor(branch, maps);
  const exclusionReason = exclusions.get(branch.name) || null;
  const classification = exclusionReason
    ? { status: 'EXCLUDED', authority: 'exclusion', zoneIds: [] }
    : classifiedRecord(signals);
  return {
    branchName: branch.name,
    owner: branchText(branch, 'OWNER'),
    ownerSite: branchText(branch, 'OWNER_SITE'),
    status: classification.status,
    authority: classification.authority,
    zoneIds: classification.zoneIds,
    candidateZoneIds: uniqueZoneIds(signals),
    signals,
    exclusionReason,
  };
}

function zoneSummaries(manifest, records) {
  return manifest.zones.map((zone) => ({
    zoneId: zone.zoneId,
    branchNames: records.filter((record) => (
      record.status === 'ASSIGNED' && record.zoneIds.includes(zone.zoneId)
    )).map((record) => record.branchName).sort(compareText),
    sharedBoundaryBranchNames: records.filter((record) => (
      record.status === 'SHARED_BOUNDARY' && record.zoneIds.includes(zone.zoneId)
    )).map((record) => record.branchName).sort(compareText),
  }));
}

export function buildFbxZoneMembershipIndex(manifest, branches) {
  validateFbxBenchmarkZoneManifest(manifest);
  validateBranches(branches);
  const maps = selectorMaps(manifest);
  const exclusions = exclusionMap(manifest);
  const records = branches.map((branch) => recordFor(branch, maps, exclusions))
    .sort((a, b) => compareText(a.branchName, b.branchName));
  const byStatus = (status) => records.filter((record) => record.status === status)
    .map((record) => record.branchName);
  return deepFreeze({
    schema: FBX_ZONE_MEMBERSHIP_INDEX_SCHEMA,
    benchmark: structuredClone(manifest.benchmark),
    zonePolicyId: manifest.zonePolicyId,
    records,
    zones: zoneSummaries(manifest, records),
    conflictBranchNames: byStatus('CONFLICT'),
    unassignedBranchNames: byStatus('UNASSIGNED'),
    excludedBranchNames: byStatus('EXCLUDED'),
  });
}
