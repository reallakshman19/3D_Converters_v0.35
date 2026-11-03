import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  buildFbxBenchmarkZoneManifest,
  FbxBenchmarkZoneManifestError,
} from '../../tabs/model-converters/converters/fbx/benchmark-zone-contract.js';
import {
  buildFbxZoneMembershipIndex,
} from '../../tabs/model-converters/converters/fbx/benchmark-zone-membership.js';
import {
  validateFbxZoneMembershipIndex,
} from '../../tabs/model-converters/converters/fbx/benchmark-zone-index.js';
import {
  buildFbxZoneBenchmarkReport,
} from '../../tabs/model-converters/converters/fbx/benchmark-zone-report.js';

const benchmark = {
  commit: 'ecd841cd41cc7a8df1764cec502e0873f578a5dc',
  path: 'Benchmarks/fbx BM/StaggedJsonBMforFBX',
  blobSha: 'e4ce63f180d3bcc3cba0e85137ce9811cef477e9',
};

function manifestInput() {
  return {
    schema: 'FbxBenchmarkZoneManifest.v1',
    benchmark,
    zonePolicyId: 'explicit-branch-owner-site-v1',
    sharedBoundaryPolicy: 'explicit-only',
    zones: [
      {
        zoneId: 'ZONE-B', displayName: 'Zone B', ownerSites: ['SITE-B'],
        owners: ['OWNER-B'], branches: ['BR-B-EXPLICIT'],
        sharedBoundaryBranches: ['BR-BOUNDARY'],
      },
      {
        zoneId: 'ZONE-A', displayName: 'Zone A', ownerSites: ['SITE-A'],
        owners: ['OWNER-A'], branches: ['BR-A-EXPLICIT'],
        sharedBoundaryBranches: ['BR-BOUNDARY'],
      },
    ],
    exclusions: [{ branchName: 'BR-IGNORED', reason: 'Non-benchmark branch.' }],
  };
}

function branch(name, owner = '', ownerSite = '') {
  return { name, type: 'BRANCH', attributes: { OWNER: owner, OWNER_SITE: ownerSite }, children: [] };
}

const manifest = buildFbxBenchmarkZoneManifest(manifestInput());
assert.equal(Object.isFrozen(manifest), true);
assert.deepEqual(manifest.zones.map((zone) => zone.zoneId), ['ZONE-A', 'ZONE-B']);
assert.deepEqual(Object.keys(manifest.benchmark), ['commit', 'path', 'blobSha']);

const branches = [
  branch('BR-UNKNOWN'),
  branch('BR-B-EXPLICIT', 'OWNER-B', 'SITE-B'),
  branch('BR-A-SITE', '', 'SITE-A'),
  branch('BR-BOUNDARY', 'OWNER-A', 'SITE-A'),
  branch('BR-A-OWNER', 'OWNER-A', 'SITE-A'),
  branch('BR-IGNORED'),
  branch('BR-A-EXPLICIT', 'OWNER-B', 'SITE-B'),
];
const index = buildFbxZoneMembershipIndex(manifest, branches);
const byName = new Map(index.records.map((record) => [record.branchName, record]));

assert.deepEqual(byName.get('BR-A-SITE').zoneIds, ['ZONE-A']);
assert.equal(byName.get('BR-A-SITE').authority, 'owner-site');
assert.deepEqual(byName.get('BR-A-OWNER').zoneIds, ['ZONE-A']);
assert.equal(byName.get('BR-A-OWNER').authority, 'owner');
assert.equal(byName.get('BR-B-EXPLICIT').authority, 'branch');
assert.equal(byName.get('BR-A-EXPLICIT').status, 'CONFLICT');
assert.deepEqual(byName.get('BR-A-EXPLICIT').candidateZoneIds, ['ZONE-A', 'ZONE-B']);
assert.equal(byName.get('BR-BOUNDARY').status, 'SHARED_BOUNDARY');
assert.deepEqual(byName.get('BR-BOUNDARY').zoneIds, ['ZONE-A', 'ZONE-B']);
assert.equal(byName.get('BR-UNKNOWN').status, 'UNASSIGNED');
assert.equal(byName.get('BR-IGNORED').status, 'EXCLUDED');
assert.equal(Object.isFrozen(index.records[0]), true);
assert.equal(validateFbxZoneMembershipIndex(index), index);

const reordered = buildFbxZoneMembershipIndex(manifest, [...branches].reverse());
assert.equal(canonicalJson(index), canonicalJson(reordered));

const passingReference = buildFbxZoneMembershipIndex(manifest, [
  branch('BR-B-EXPLICIT', 'OWNER-B', 'SITE-B'),
  branch('BR-A-SITE', '', 'SITE-A'),
  branch('BR-BOUNDARY', 'OWNER-A', 'SITE-A'),
]);
const passingActual = buildFbxZoneMembershipIndex(manifest, [
  branch('BR-BOUNDARY', 'OWNER-A', 'SITE-A'),
  branch('BR-A-SITE', '', 'SITE-A'),
  branch('BR-B-EXPLICIT', 'OWNER-B', 'SITE-B'),
]);
assert.equal(buildFbxZoneBenchmarkReport(passingReference, passingActual).status, 'PASS');

const missingActual = buildFbxZoneMembershipIndex(manifest, [
  branch('BR-A-SITE', '', 'SITE-A'),
  branch('BR-BOUNDARY', 'OWNER-A', 'SITE-A'),
]);
const failed = buildFbxZoneBenchmarkReport(passingReference, missingActual);
assert.equal(failed.status, 'FAIL');
assert.deepEqual(
  failed.zones.find((zone) => zone.zoneId === 'ZONE-B').missingBranchNames,
  ['BR-B-EXPLICIT'],
);
assert.equal(buildFbxZoneBenchmarkReport(index, passingActual).status, 'BLOCKED_REFERENCE');

const forgedIndex = structuredClone(passingReference);
forgedIndex.conflictBranchNames = ['FORGED'];
assert.throws(
  () => buildFbxZoneBenchmarkReport(forgedIndex, passingActual),
  /not derived from records/,
);

const forgedAuthority = structuredClone(passingReference);
forgedAuthority.records[0].authority = 'none';
assert.throws(
  () => validateFbxZoneMembershipIndex(forgedAuthority),
  /assigned state is invalid/,
);

const otherManifest = buildFbxBenchmarkZoneManifest({
  ...manifestInput(),
  benchmark: { ...benchmark, commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
});
const otherIndex = buildFbxZoneMembershipIndex(otherManifest, [
  branch('BR-A-SITE', '', 'SITE-A'),
]);
assert.throws(
  () => buildFbxZoneBenchmarkReport(passingReference, otherIndex),
  /different benchmark identities/,
);

const duplicateOwnerSite = manifestInput();
duplicateOwnerSite.zones[1].ownerSites = ['SITE-B'];
assert.throws(
  () => buildFbxBenchmarkZoneManifest(duplicateOwnerSite),
  (error) => error instanceof FbxBenchmarkZoneManifestError,
);

const oneSidedBoundary = manifestInput();
oneSidedBoundary.zones[1].sharedBoundaryBranches = [];
assert.throws(
  () => buildFbxBenchmarkZoneManifest(oneSidedBoundary),
  /must belong to at least two zones/,
);

assert.throws(
  () => buildFbxZoneMembershipIndex(manifest, [branch('DUP'), branch('DUP')]),
  /Duplicate FBX benchmark branch/,
);

console.log('test-benchmark-zone-membership: PASS');
