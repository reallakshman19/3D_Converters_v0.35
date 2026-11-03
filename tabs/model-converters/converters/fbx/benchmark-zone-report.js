import { deepFreeze } from './canonical-json.js';
import { validateFbxZoneMembershipIndex } from './benchmark-zone-index.js';

export const FBX_ZONE_BENCHMARK_REPORT_SCHEMA = 'FbxZoneBenchmarkReport.v1';
export const FBX_ZONE_BENCHMARK_STATUSES = deepFreeze([
  'PASS', 'FAIL', 'BLOCKED_REFERENCE',
]);

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function difference(left, right) {
  const accepted = new Set(right);
  return left.filter((value) => !accepted.has(value)).sort(compareText);
}

function zoneMap(index) {
  return new Map(index.zones.map((zone) => [zone.zoneId, zone]));
}

function compareZone(zoneId, expected, actual) {
  const expectedBranches = expected?.branchNames || [];
  const actualBranches = actual?.branchNames || [];
  const expectedBoundaries = expected?.sharedBoundaryBranchNames || [];
  const actualBoundaries = actual?.sharedBoundaryBranchNames || [];
  const result = {
    zoneId,
    missingBranchNames: difference(expectedBranches, actualBranches),
    unexpectedBranchNames: difference(actualBranches, expectedBranches),
    missingSharedBoundaryBranchNames: difference(expectedBoundaries, actualBoundaries),
    unexpectedSharedBoundaryBranchNames: difference(actualBoundaries, expectedBoundaries),
  };
  const failures = Object.values(result).slice(1).some((values) => values.length);
  return { ...result, status: failures ? 'FAIL' : 'PASS' };
}

function assertCompatible(reference, actual) {
  if (JSON.stringify(reference.benchmark) !== JSON.stringify(actual.benchmark)) {
    throw new Error('Zone indexes use different benchmark identities.');
  }
  if (reference.zonePolicyId !== actual.zonePolicyId) {
    throw new Error('Zone indexes use different zone policies.');
  }
}

function hasReferenceBlockers(index) {
  return index.conflictBranchNames.length > 0 || index.unassignedBranchNames.length > 0;
}

export function buildFbxZoneBenchmarkReport(reference, actual) {
  validateFbxZoneMembershipIndex(reference);
  validateFbxZoneMembershipIndex(actual);
  assertCompatible(reference, actual);
  const referenceZones = zoneMap(reference);
  const actualZones = zoneMap(actual);
  const zoneIds = [...new Set([...referenceZones.keys(), ...actualZones.keys()])].sort(compareText);
  const zones = zoneIds.map((zoneId) => compareZone(
    zoneId,
    referenceZones.get(zoneId),
    actualZones.get(zoneId),
  ));
  const blocked = hasReferenceBlockers(reference);
  const failed = zones.some((zone) => zone.status === 'FAIL')
    || actual.conflictBranchNames.length > 0
    || actual.unassignedBranchNames.length > 0;
  return deepFreeze({
    schema: FBX_ZONE_BENCHMARK_REPORT_SCHEMA,
    status: blocked ? 'BLOCKED_REFERENCE' : failed ? 'FAIL' : 'PASS',
    benchmark: structuredClone(reference.benchmark),
    zonePolicyId: reference.zonePolicyId,
    zones,
    referenceConflictBranchNames: [...reference.conflictBranchNames],
    referenceUnassignedBranchNames: [...reference.unassignedBranchNames],
    actualConflictBranchNames: [...actual.conflictBranchNames],
    actualUnassignedBranchNames: [...actual.unassignedBranchNames],
  });
}
