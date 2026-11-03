import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildSelectedZoneGeometryManifest,
} from '../../tabs/model-converters/converters/fbx/zone-package/geometry-manifest.js';
import {
  buildSelectedZonePackage,
} from '../../tabs/model-converters/converters/fbx/zone-package/package-builder.js';
import {
  readPackageArchive,
} from '../../tabs/model-converters/converters/fbx/zone-package/archive.js';
import {
  FbxZonePackageError,
} from '../../tabs/model-converters/converters/fbx/zone-package/constants.js';
import {
  FBX2_BENCHMARK_COORDINATE_PROFILE,
  FBX2_BENCHMARK_COORDINATE_PROFILE_DIGEST,
} from '../../scripts/fbx/fbx2-small-benchmark/coordinate-profile.mjs';
import {
  buildDeterministicFbx2SelectedZonePackageClosure,
} from '../../scripts/fbx/fbx2-small-benchmark/package-closure.mjs';
import {
  COMPLETE_SOURCE_GRAPH_SHA256,
  quadGeometry,
  sourceIdentityFixture,
} from './zone-package-fixtures.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonical(value[key])]));
}

function compactDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function globalIndex() {
  const records = [
    {
      sourceOccurrenceId: 'occ:pipe', sourceModelObjectId: 'model:pipe',
      parentOccurrenceId: 'occ:zone', fullAncestryOccurrenceIds: ['occ:zone', 'occ:pipe'],
      fullAncestrySourceObjectIds: ['model:zone', 'model:pipe'],
      assignedZoneId: 'occ:zone', assignedZoneLabel: '/SMALL',
      geometryObjectIds: ['1'], displayName: 'Pipe', domSubtype: 'Mesh', rawType: 'PIPE',
      sourceProperties: {}, exactTagValues: ['PIPE-1'], worldMatrixMm: [],
      geometryMatrixMm: [], worldOriginMm: [0, 0, 0], worldBoundsMm: null,
      worldCentroidMm: [0, 0, 0],
    },
    {
      sourceOccurrenceId: 'occ:support', sourceModelObjectId: 'model:support',
      parentOccurrenceId: 'occ:ps',
      fullAncestryOccurrenceIds: ['occ:root', 'occ:ps', 'occ:support'],
      fullAncestrySourceObjectIds: ['model:root', 'model:ps', 'model:support'],
      assignedZoneId: null, assignedZoneLabel: null, geometryObjectIds: [],
      displayName: 'REST-1', domSubtype: 'Null', rawType: 'REST',
      sourceProperties: {}, exactTagValues: ['REST-1'], worldMatrixMm: [],
      geometryMatrixMm: [], worldOriginMm: [0, 0, 100000], worldBoundsMm: null,
      worldCentroidMm: [0, 0, 100000],
    },
    {
      sourceOccurrenceId: 'occ:support-mesh', sourceModelObjectId: 'model:support-mesh',
      parentOccurrenceId: 'occ:support',
      fullAncestryOccurrenceIds: ['occ:root', 'occ:ps', 'occ:support', 'occ:support-mesh'],
      fullAncestrySourceObjectIds: [
        'model:root', 'model:ps', 'model:support', 'model:support-mesh',
      ],
      assignedZoneId: 'occ:support-zone', assignedZoneLabel: '/PS',
      geometryObjectIds: ['2'], displayName: 'REST mesh', domSubtype: 'Mesh', rawType: null,
      sourceProperties: {}, exactTagValues: [], worldMatrixMm: [],
      geometryMatrixMm: [], worldOriginMm: [0, 0, 100000], worldBoundsMm: null,
      worldCentroidMm: [0, 0, 100000],
    },
    {
      sourceOccurrenceId: 'occ:unrelated-mesh', sourceModelObjectId: 'model:unrelated',
      parentOccurrenceId: 'occ:other',
      fullAncestryOccurrenceIds: ['occ:root', 'occ:other', 'occ:unrelated-mesh'],
      fullAncestrySourceObjectIds: ['model:root', 'model:other', 'model:unrelated'],
      assignedZoneId: 'occ:support-zone', assignedZoneLabel: '/PS',
      geometryObjectIds: ['3'], displayName: 'Unrelated', domSubtype: 'Mesh', rawType: null,
      sourceProperties: {}, exactTagValues: [], worldMatrixMm: [],
      geometryMatrixMm: [], worldOriginMm: [0, 0, 100000], worldBoundsMm: null,
      worldCentroidMm: [0, 0, 100000],
    },
  ];
  const payload = {
    schema: 'FbxGlobalOccurrenceIndex.v1',
    sourceOccurrenceCount: records.length,
    zoneAssignedOccurrenceCount: records.filter((record) => record.assignedZoneId).length,
    geometryOccurrenceCount: records.filter((record) => record.geometryObjectIds.length).length,
    records,
    bySourceModelObjectId: {}, byGeometryObjectId: {}, byExactTag: {},
    authority: {
      selectedZonePopulationChanged: false, siblingGeometryImported: false,
      fullSourceGraphIndexed: true, ancestryPreservedIndependentlyOfLeafName: true,
      worldGeometryDerivedFromGovernedOccurrenceMatrix: true,
    },
  };
  return { ...payload, indexDigest: compactDigest(payload) };
}

function supportEvidence() {
  const associations = [{
    managedRecordId: 'B-1::REST-1', branchId: 'B-1', managedReference: 'REST-1',
    status: 'PASS', disposition: 'MATCHED_CROSS_ZONE_SUPPORT',
    sourceOccurrenceId: 'occ:support', sourceModelObjectId: 'model:support',
    supportToken: 'REST', supportLabel: 'REST-1', structureAnchorOccurrenceId: 'occ:ps',
    structureLabel: 'PS-1', assignedZoneIds: ['occ:support-zone'],
    selectedDescendantOccurrenceIds: ['occ:support-mesh'], selectedGeometryObjectIds: ['2'],
    transformedManagedPositionMm: [0, 0, 100000], sourcePositionMm: [0, 0, 100000],
    positionResidualMm: 0, matchedTags: ['REST-1'],
    hostManagedRecordId: 'B-1::PIPE-1', hostAuthority: 'UNIQUE_BRANCH_PIPE_AXIS',
    hostResidualMm: 0, candidateSourceOccurrenceIds: ['occ:support'],
    reasons: ['EXACT_SUPPORT_TAG_CORROBORATED', 'GOVERNED_POSITION_CORROBORATED',
      'UNIQUE_BRANCH_PIPE_AXIS'],
  }];
  const payload = {
    schema: 'FbxCrossZoneSupportAssociationEvidence.v1',
    selectedZoneId: 'occ:zone',
    coordinateProfile: FBX2_BENCHMARK_COORDINATE_PROFILE,
    coordinateProfileDigest: FBX2_BENCHMARK_COORDINATE_PROFILE_DIGEST,
    expectedManagedSupportCount: 1, eligibleCrossZoneCandidateCount: 1,
    matchedCount: 1, blockedCount: 0, ambiguousCount: 0,
    associations,
    authority: {
      selectedZonePopulationChanged: false, siblingGeometryImported: false,
      exactTagsAreCorroborationOnly: true, governedCoordinateProfileRequired: true,
      uniqueBranchHostRequired: true, oneToOneSourceClaimRequired: true,
      restraintSubtypeParityClaimed: false,
    },
  };
  return { ...payload, evidenceDigest: compactDigest(payload) };
}

function rehashedSupport(source, change) {
  const copy = structuredClone(source);
  change(copy.associations[0]);
  delete copy.evidenceDigest;
  copy.evidenceDigest = compactDigest(copy);
  return copy;
}

function component(id, family, branchSequence) {
  return {
    managedRecordId: `B-1::${id}`, branchId: 'B-1', branchSequence,
    reference: id, outerType: family === 'PIPE' ? 'PIPE' : 'REST',
    rawType: family === 'PIPE' ? 'PIPE' : 'REST', family,
  };
}

function result(id, family, occurrenceId, disposition) {
  return {
    managedRecordId: `B-1::${id}`, branchId: 'B-1', reference: id,
    outerType: family === 'PIPE' ? 'PIPE' : 'REST',
    rawType: family === 'PIPE' ? 'PIPE' : 'REST', family,
    generated: false, generationMethod: null, status: 'PASS', disposition,
    exactSourceOccurrenceId: occurrenceId, candidateSourceOccurrenceIds: [], reasons: [],
  };
}

const { manifest, buffersByGeometryId } = await buildSelectedZoneGeometryManifest({
  completeSourceGraphSha256: COMPLETE_SOURCE_GRAPH_SHA256,
  sourceIdentity: sourceIdentityFixture(),
  geometries: [quadGeometry('1', 'occ:pipe', 'model:pipe')],
});
const index = globalIndex(), support = supportEvidence();
const run = {
  targetZone: { zoneId: 'occ:zone', label: '/SMALL' },
  managedInventory: { components: [
    component('PIPE-1', 'PIPE', 0), component('REST-1', 'SUPPORT', 1),
  ] },
  reconciliation: {
    records: [
      result('PIPE-1', 'PIPE', 'occ:pipe', 'PIPE_GEOMETRY_PARITY_PASS'),
      result('REST-1', 'SUPPORT', 'occ:support', 'MATCHED_CROSS_ZONE_SUPPORT'),
    ],
    summary: {
      managedComponentCount: 2, terminalDispositionCount: 2,
      passCount: 2, blockedCount: 0, unresolvedCount: 0,
      coverageRatio: 1, parityRatio: 1, parityTargetRatio: 1, parityTargetMet: true,
    },
  },
  globalOccurrenceIndex: index,
  crossZoneSupportAssociation: support,
  zonePackageInputs: { manifest, buffersByGeometryId, artifacts: {}, artifactOmissionReasons: {} },
};
const complete = { comparison: { status: 'PASS' }, coverage: { status: 'PASS' } };
const closure = await buildDeterministicFbx2SelectedZonePackageClosure([run, run], complete);
assert.equal(closure.branchMatchLedger.schema, 'FbxSelectedZoneBranchMatchLedger.v1');
assert.equal(closure.branchMatchLedger.terminalDispositionCount, 2);
assert.equal(closure.packageResult.audit.geometryCount, 1);
for (const role of [
  'BRANCH_MATCH_LEDGER', 'GLOBAL_OCCURRENCE_INDEX',
  'CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE', 'COORDINATE_PROFILE',
]) {
  assert.equal(closure.packageResult.audit.files
    .find((record) => record.role === role)?.disposition, 'PRESENT');
}
const archived = await readPackageArchive(closure.archive.bytes);
assert.equal(archived.length, closure.packageResult.files.length);
assert.ok(archived.some((file) => file.path === 'evidence/branch-match-ledger.json'));
assert.ok(archived.some((file) => file.path === 'evidence/global-occurrence-index.json'));
assert.ok(archived.some((file) => file.path === 'evidence/cross-zone-support-associations.json'));
assert.ok(archived.some((file) => file.path === 'evidence/coordinate-profile.json'));
await assert.rejects(() => buildDeterministicFbx2SelectedZonePackageClosure(
  [run, run], { ...complete, coverage: { status: 'BLOCKED' } }),
/FBX2_PACKAGE_CLOSURE_BENCHMARK_INCOMPLETE/);

async function rejectsSupportEvidence(candidate) {
  await assert.rejects(() => buildSelectedZonePackage({
    manifest, buffersByGeometryId,
    artifacts: {
      BRANCH_MATCH_LEDGER: closure.branchMatchLedger,
      GLOBAL_OCCURRENCE_INDEX: index,
      CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE: candidate,
      COORDINATE_PROFILE: FBX2_BENCHMARK_COORDINATE_PROFILE,
    },
  }), (error) => error instanceof FbxZonePackageError
    && error.code === 'ZONE_PACKAGE_INVALID_BENCHMARK_CLOSURE');
}

await rejectsSupportEvidence(rehashedSupport(support, (association) => {
  association.sourceOccurrenceId = 'occ:unrelated';
}));
await rejectsSupportEvidence(rehashedSupport(support, (association) => {
  association.assignedZoneIds = [];
}));
await rejectsSupportEvidence(rehashedSupport(support, (association) => {
  association.selectedGeometryObjectIds = ['3'];
}));

console.log('test-fbx2-selected-zone-package-closure: PASS');
