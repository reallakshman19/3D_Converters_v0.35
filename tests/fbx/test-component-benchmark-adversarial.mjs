import assert from 'node:assert/strict';
import {
  buildFbxBenchmarkZoneManifest,
} from '../../tabs/model-converters/converters/fbx/benchmark-zone-contract.js';
import {
  buildFbxZoneMembershipIndex,
} from '../../tabs/model-converters/converters/fbx/benchmark-zone-membership.js';
import {
  benchmark, branch, componentPolicy, fitting, point, qualify,
  toleranceProfile, zoneIndexFor,
} from './component-benchmark-fixtures.mjs';

const duplicateReference = branch('/LINE/B1', [
  fitting('FLAN', '=DUP'), fitting('FLAN', '=DUP'),
]);
const duplicateActual = branch('/LINE/B1', [fitting('FLAN', '=DUP')]);
const duplicate = await qualify({
  reference: duplicateReference,
  actual: duplicateActual,
  identityPolicy: componentPolicy(),
  toleranceProfile,
});
assert.equal(duplicate.summary.componentStatus, 'BLOCKED');
assert.ok(duplicate.inventory.referenceCollisionGroupCount >= 1);
assert.equal(
  duplicate.ledger.filter((record) => record.match.state === 'AMBIGUOUS_MATCH').length,
  3,
);
assert.equal(duplicate.collisionGroups[0].collisionGroupId, 'COL-000001');
assert.equal(duplicate.collisionGroups[0].resolution, 'UNRESOLVED');

const collisionResolvingPolicy = structuredClone(componentPolicy());
collisionResolvingPolicy.identityRules = [
  collisionResolvingPolicy.identityRules[0],
  collisionResolvingPolicy.identityRules[1],
  {
    ruleId: 'reference-name-branch-family', rank: 3,
    kind: 'APPROVED_COMPOSITE', applicableFamilies: ['FLANGE'],
    requiredFields: ['reference', 'name', 'branchId', 'family'],
    normalizationRuleIds: ['trim', 'normalize-slashes'], scope: 'BRANCH',
    uniquenessRequirement: 'COLLISION_PRESERVING', passing: true,
  },
  { ...collisionResolvingPolicy.identityRules[2], rank: 4 },
  { ...collisionResolvingPolicy.identityRules[3], rank: 5 },
];
collisionResolvingPolicy.policyContentSha256 = 'f6952ef2e35bd83ca9ee5923db1fa33c85a7ee6fbba5bf4ad4a997b1788a6ade';

const forgedPolicy = structuredClone(collisionResolvingPolicy);
forgedPolicy.policyContentSha256 = '0'.repeat(64);
await assert.rejects(
  () => qualify({
    reference: branch('/LINE/B1', [fitting('FLAN', '=SAME')]),
    actual: branch('/LINE/B1', [fitting('FLAN', '=SAME')]),
    identityPolicy: forgedPolicy,
    toleranceProfile,
  }),
  /does not match canonical normalized policy content/,
);

const resolvedCollision = await qualify({
  reference: branch('/LINE/B1', [
    fitting('FLAN', '=SAME', { extra: { NAME: 'FLANGE-A' } }),
    fitting('FLAN', '=SAME', { extra: { NAME: 'FLANGE-B' } }),
  ]),
  actual: branch('/LINE/B1', [
    fitting('FLAN', '=SAME', { extra: { NAME: 'FLANGE-B' } }),
    fitting('FLAN', '=SAME', { extra: { NAME: 'FLANGE-A' } }),
  ]),
  identityPolicy: collisionResolvingPolicy,
  toleranceProfile,
});
assert.equal(resolvedCollision.summary.componentStatus, 'PASS');
assert.ok(resolvedCollision.collisionGroups.some((group) => (
  group.resolution === 'RESOLVED_BY_APPROVED_RULE'
)));

const wrongFamily = await qualify({
  reference: branch('/LINE/B1', [fitting('FLAN', '=TYPE')]),
  actual: branch('/LINE/B1', [fitting('VALV', '=TYPE')]),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.ok(wrongFamily.ledger.every((record) => (
  record.match.state === 'ATTRIBUTE_MISMATCH'
  && record.mismatchCodes.includes('FAMILY_MISMATCH')
)));

const wrongBore = await qualify({
  reference: branch('/LINE/B1', [
    fitting('FLAN', '=F1', { abore: '100mm' }),
  ]),
  actual: branch('/LINE/B1', [
    fitting('FLAN', '=F1', { abore: '80mm' }),
  ]),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.equal(wrongBore.summary.componentStatus, 'FAIL');
assert.ok(wrongBore.ledger.every((record) => (
  record.match.state === 'ATTRIBUTE_MISMATCH'
  && record.mismatchCodes.includes('BOREA_MISMATCH')
)));

const shiftedEndpoint = await qualify({
  reference: branch('/LINE/B1', [fitting('VALV', '=V1')]),
  actual: branch('/LINE/B1', [
    fitting('VALV', '=V1', { lpos: point(100.1, 0, 0) }),
  ]),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.ok(shiftedEndpoint.ledger.every((record) => (
  record.match.state === 'GEOMETRY_MISMATCH'
)));

const unmatched = await qualify({
  reference: branch('/LINE/B1', [fitting('GASK', '=G1')]),
  actual: branch('/LINE/B1', [fitting('GASK', '=G2')]),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.equal(
  unmatched.ledger.find((record) => record.side === 'REFERENCE').match.state,
  'MISSING_ACTUAL',
);
assert.equal(
  unmatched.ledger.find((record) => record.side === 'ACTUAL').match.state,
  'UNEXPECTED_ACTUAL',
);

const diagnosticCollision = await qualify({
  reference: branch('/LINE/B1', [
    fitting('GASK', '=G1'), fitting('GASK', '=G2'),
  ]),
  actual: branch('/LINE/B1', []),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.equal(diagnosticCollision.collisionGroups.length, 0);
assert.ok(diagnosticCollision.ledger.every((record) => (
  record.match.state === 'MISSING_ACTUAL'
)));
assert.ok(diagnosticCollision.ledger.every((record) => (
  record.identityEvidence.candidateKeys.some((item) => item.ruleId === 'spatial-diagnostic')
)));

const missingTolerance = await qualify({
  reference: branch('/LINE/B1', [fitting('FLAN', '=T1')]),
  actual: branch('/LINE/B1', [fitting('FLAN', '=T1')]),
  identityPolicy: componentPolicy(), toleranceProfile: null,
});
assert.equal(missingTolerance.summary.componentStatus, 'BLOCKED');
assert.ok(missingTolerance.ledger.every((record) => (
  record.mismatchCodes.includes('TOLERANCE_RULE_UNAVAILABLE')
)));

const observationalDifference = await qualify({
  reference: branch('/LINE/B1', [
    fitting('FLAN', '=OBS', { orientation: 'Y is N and Z is U' }),
  ]),
  actual: branch('/LINE/B1', [
    fitting('FLAN', '=OBS', { orientation: 'Y is S and Z is U' }),
  ]),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.equal(
  observationalDifference.summary.componentStatus,
  'PASS_WITH_OBSERVATIONS',
);

const unknown = await qualify({
  reference: branch('/LINE/B1', [{
    name: 'MYSTERY 1', type: 'MYST', attributes: { TYPE: 'MYST', REF: '=M1' },
  }]),
  actual: branch('/LINE/B1', [{
    name: 'MYSTERY 1', type: 'MYST', attributes: { TYPE: 'MYST', REF: '=M1' },
  }]),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.equal(unknown.summary.componentStatus, 'BLOCKED');
assert.deepEqual(unknown.inventory.unknownReferenceTypes, ['MYST']);

const zoneReference = branch('/LINE/B1', [fitting('FLAN', '=ZONE')]);
const zoneActual = branch('/LINE/B1', [fitting('FLAN', '=ZONE')]);
const zoneMismatch = await qualify({
  reference: zoneReference,
  actual: zoneActual,
  referenceZoneIndex: zoneIndexFor(zoneReference, 'ZONE-A'),
  actualZoneIndex: zoneIndexFor(zoneActual, 'ZONE-B'),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.equal(zoneMismatch.summary.componentStatus, 'FAIL');
assert.ok(zoneMismatch.ledger.every((record) => (
  record.mismatchCodes.includes('ZONEIDS_MISMATCH')
)));

const conflictManifest = buildFbxBenchmarkZoneManifest({
  schema: 'FbxBenchmarkZoneManifest.v1',
  benchmark,
  zonePolicyId: 'explicit-branch-owner-site-v1',
  sharedBoundaryPolicy: 'explicit-only',
  zones: [
    {
      zoneId: 'ZONE-A', displayName: 'Zone A', ownerSites: [], owners: [],
      branches: ['/LINE/B1'], sharedBoundaryBranches: [],
    },
    {
      zoneId: 'ZONE-B', displayName: 'Zone B', ownerSites: ['SITE-LINE'],
      owners: [], branches: [], sharedBoundaryBranches: [],
    },
  ],
  exclusions: [],
});
const conflictIndex = buildFbxZoneMembershipIndex(conflictManifest, zoneReference);
const blockedZone = await qualify({
  reference: zoneReference,
  actual: zoneActual,
  referenceZoneIndex: conflictIndex,
  actualZoneIndex: zoneIndexFor(zoneActual, 'ZONE-A'),
  identityPolicy: componentPolicy(), toleranceProfile,
});
assert.equal(blockedZone.summary.componentStatus, 'BLOCKED');
assert.ok(blockedZone.ledger.some((record) => (
  record.mismatchCodes.includes('ZONE_CONFLICT')
)));

const forgedCoverage = structuredClone(zoneIndexFor(zoneReference));
forgedCoverage.records[0].branchName = '/OTHER/B1';
forgedCoverage.zones[0].branchNames = ['/OTHER/B1'];
assert.rejects(
  () => qualify({
    reference: zoneReference,
    actual: zoneActual,
    referenceZoneIndex: forgedCoverage,
    identityPolicy: componentPolicy(),
    toleranceProfile,
  }),
  /does not exactly cover/,
);

console.log('test-component-benchmark-adversarial: PASS');
