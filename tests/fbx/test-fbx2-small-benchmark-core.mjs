import assert from 'node:assert/strict';
import {
  inventoryFbx2ManagedStage,
} from '../../scripts/fbx/fbx2-small-benchmark/managed-inventory.mjs';
import {
  benchmarkCanonicalJson,
  buildFbx2SmallBenchmarkReport,
  validateFbx2SmallBenchmarkReport,
} from '../../scripts/fbx/fbx2-small-benchmark/report.mjs';
import {
  reconcileFbx2SmallBenchmark,
} from '../../scripts/fbx/fbx2-small-benchmark/reconcile.mjs';
import {
  inventoryFbx2SelectedSource,
} from '../../scripts/fbx/fbx2-small-benchmark/source-inventory.mjs';

function sourceObject(id, name, rawType = null) {
  return {
    sourceObjectId: id,
    displayName: name,
    domSubtype: 'Mesh',
    customProperties: rawType ? [{ name: 'RAW_TYPE', valueString: rawType }] : [],
  };
}

function occurrence(id, model, geometry) {
  return {
    sourceOccurrenceId: id,
    sourceModelObjectId: model,
    parentOccurrenceId: 'occ:zone',
    geometryObjectIds: [geometry],
  };
}

function component(type, id, attributes = {}) {
  return { type, id, name: id, attributes: { REF: id, ...attributes }, children: [] };
}

const sourceGraph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [
    sourceObject('m:pipe-pass', 'Pipe pass'),
    sourceObject('m:elbow', 'Elbow'),
    sourceObject('m:tee', 'Tee'),
    sourceObject('m:support', 'Support', 'SUPPORT'),
    sourceObject('m:pipe-blocked', 'Pipe blocked'),
  ],
  occurrences: [
    occurrence('occ:pipe-pass', 'm:pipe-pass', 'g:pipe-pass'),
    occurrence('occ:elbow', 'm:elbow', 'g:elbow'),
    occurrence('occ:tee', 'm:tee', 'g:tee'),
    occurrence('occ:support', 'm:support', 'g:support'),
    occurrence('occ:pipe-blocked', 'm:pipe-blocked', 'g:pipe-blocked'),
  ],
};

const zoneGeometryEvidence = {
  schema: 'FbxZoneGeometryEvidence.v1',
  artifactId: 'FBXZGEOM-small-test',
  selectedZone: { zoneId: 'occ:zone', label: '/SMALL' },
  selectedOccurrenceIds: sourceGraph.occurrences.map((item) => item.sourceOccurrenceId),
};

const autoPipe = {
  classificationDispositions: [
    { sourceOccurrenceId: 'occ:pipe-pass', admitted: true },
    { sourceOccurrenceId: 'occ:elbow', admitted: false, reason: 'NOT_STRAIGHT' },
    { sourceOccurrenceId: 'occ:tee', admitted: false, reason: 'NOT_STRAIGHT' },
    { sourceOccurrenceId: 'occ:support', admitted: false, reason: 'BOUNDARY_COUNT' },
    { sourceOccurrenceId: 'occ:pipe-blocked', admitted: false, reason: 'AXIS_RESIDUAL' },
  ],
};

const solidFittingPortEvidence = {
  occurrenceEvidence: [
    { sourceOccurrenceId: 'occ:elbow', topologyDisposition: 'BENT_TWO_PORT', rejectionReasons: [] },
    { sourceOccurrenceId: 'occ:tee', topologyDisposition: 'THREE_PORT', rejectionReasons: [] },
  ],
};

const supportEvidence = {
  candidates: [{
    candidateId: 'support-candidate',
    occurrenceId: 'occ:support',
    dispositionReason: 'CANDIDATE_HAS_IDENTITY_EVIDENCE',
  }],
};

const sourceInventory = inventoryFbx2SelectedSource({
  sourceGraph,
  zoneGeometryEvidence,
  autoPipe,
  solidFittingPortEvidence,
  supportEvidence,
});
assert.equal(sourceInventory.summary.selectedOccurrenceCount, 5);
assert.equal(sourceInventory.summary.terminalDispositionCount, 5);
assert.equal(sourceInventory.summary.coverageRatio, 1);
assert.equal(sourceInventory.summary.passCount, 4);
assert.equal(sourceInventory.summary.blockedCount, 1);

const stagedBranches = [{
  type: 'BRANCH',
  id: 'B-1',
  attributes: { REF: 'B-1' },
  children: [
    component('PIPE', 'P-PASS', { sourceOccurrenceId: 'occ:pipe-pass' }),
    component('ELBO', 'E-PASS', { sourceOccurrenceId: 'occ:elbow' }),
    component('TEE', 'T-CANDIDATE', { sourceModelObjectId: 'm:tee' }),
    component('SUPPORT', 'S-PASS', { sourceOccurrenceId: 'occ:support', RAW_TYPE: 'SUPPORT' }),
    component('ANCI', 'A-UNSUPPORTED'),
    component('PIPE', 'P-BLOCKED', { sourceOccurrenceId: 'occ:pipe-blocked' }),
    { type: 'VALV', attributes: {}, children: [] },
  ],
}];

const managedInventory = inventoryFbx2ManagedStage(stagedBranches);
assert.equal(managedInventory.summary.branchCount, 1);
assert.equal(managedInventory.summary.componentCount, 7);
assert.equal(managedInventory.summary.supportComponentCount, 1);
assert.equal(managedInventory.summary.unsupportedComponentCount, 1);
assert.equal(managedInventory.summary.positionalIdentityCount, 1);

const componentCrosswalk = {
  managedComponents: [
    { managedRecordId: 'B-1::P-PASS', exactSourceOccurrenceId: 'occ:pipe-pass', candidateSourceOccurrenceIds: [], disposition: 'MATCHED_SOURCE_COMPONENT' },
    { managedRecordId: 'B-1::E-PASS', exactSourceOccurrenceId: 'occ:elbow', candidateSourceOccurrenceIds: [], disposition: 'MATCHED_SOURCE_COMPONENT' },
    { managedRecordId: 'B-1::T-CANDIDATE', exactSourceOccurrenceId: null, candidateSourceOccurrenceIds: ['occ:tee'], disposition: 'SOURCE_OCCURRENCE_CANDIDATES' },
    { managedRecordId: 'B-1::A-UNSUPPORTED', exactSourceOccurrenceId: null, candidateSourceOccurrenceIds: [], disposition: 'UNMATCHED_MANAGED_COMPONENT' },
    { managedRecordId: 'B-1::P-BLOCKED', exactSourceOccurrenceId: 'occ:pipe-blocked', candidateSourceOccurrenceIds: [], disposition: 'MATCHED_SOURCE_COMPONENT' },
    { managedRecordId: 'B-1::benchmark-child-0007', exactSourceOccurrenceId: null, candidateSourceOccurrenceIds: [], disposition: 'UNMATCHED_MANAGED_COMPONENT' },
  ],
};

const familyEvidence = {
  elbowEvidence: { elbowEvidence: [{ managedRecordId: 'B-1::E-PASS', disposition: 'ADMITTED', blockingReasons: [] }] },
  teeEvidence: { teeEvidence: [{ managedRecordId: 'B-1::T-CANDIDATE', disposition: 'BLOCKED', blockingReasons: ['NO_EXACT_SOURCE_BINDING'] }] },
  reducerEvidence: { reducerEvidence: [] },
  branchFittingEvidence: { branchFittingEvidence: [] },
  inlineAssemblyEvidence: { inlineAssemblyEvidence: [{ managedRecordId: 'B-1::benchmark-child-0007', disposition: 'BLOCKED', blockingReasons: ['NO_EXACT_SOURCE_BINDING'] }] },
};

const supportHostEvidence = {
  candidateDispositions: [{
    occurrenceId: 'occ:support',
    hostDisposition: 'SINGLE_HOST_PROVED',
    reasons: ['SINGLE_EXACT_PIPE_HOST_PROVED'],
  }],
};

const reconciliation = reconcileFbx2SmallBenchmark({
  managedInventory,
  componentCrosswalk,
  sourceInventory,
  autoPipe,
  familyEvidence,
  supportEvidence,
  supportHostEvidence,
});
assert.deepEqual(reconciliation.summary, {
  managedComponentCount: 7,
  terminalDispositionCount: 7,
  passCount: 3,
  blockedCount: 1,
  unresolvedCount: 3,
  coverageRatio: 1,
  parityRatio: 3 / 7,
  parityTargetRatio: 1,
  parityTargetMet: false,
});
assert.equal(reconciliation.records.find((item) => item.reference === 'P-PASS').status, 'PASS');
assert.equal(reconciliation.records.find((item) => item.reference === 'P-BLOCKED').status, 'BLOCKED');
assert.equal(reconciliation.records.find((item) => item.reference === 'T-CANDIDATE').status, 'UNRESOLVED');
assert.equal(reconciliation.records.find((item) => item.reference === 'A-UNSUPPORTED').status, 'UNRESOLVED');

function run(identitySuffix = '') {
  return {
    identities: {
      sourceGraphDigest: `sg${identitySuffix}`,
      geometryBundleDigest: `gb${identitySuffix}`,
      zoneGeometryArtifactId: `zg${identitySuffix}`,
      autoPipeDigest: `ap${identitySuffix}`,
      componentCrosswalkArtifactId: `cw${identitySuffix}`,
      elbowArtifactId: `el${identitySuffix}`,
      teeArtifactId: `te${identitySuffix}`,
      reducerArtifactId: `re${identitySuffix}`,
      branchFittingArtifactId: `bf${identitySuffix}`,
      inlineAssemblyArtifactId: `ia${identitySuffix}`,
      supportEvidenceDigest: `se${identitySuffix}`,
      supportHostEvidenceDigest: `sh${identitySuffix}`,
      supportAssemblyEvidenceDigest: `sa${identitySuffix}`,
      qualificationRootDigest: `qr${identitySuffix}`,
    },
    managedInventory,
    sourceInventory,
    reconciliation,
    packageSummary: { status: 'BLOCKED', checks: [], blockedChecks: ['MAPPING_REQUIRED'] },
  };
}

const report = buildFbx2SmallBenchmarkReport({
  source: { sha256: 'source', byteLength: 10 },
  managedStage: { sha256: 'managed', byteLength: 20 },
  selectedZone: { zoneId: 'occ:zone', label: '/SMALL' },
  runs: [run(), run()],
});
assert.equal(report.status, 'COMPLETE_TARGET_NOT_MET');
assert.equal(report.comparison.status, 'PASS');
assert.equal(report.coverage.status, 'PASS');
assert.equal(report.coverage.overallCoverageRatio, 1);
assert.equal(report.parity.status, 'BLOCKED');
assert.equal(report.parity.actualRatio, 3 / 7);
assert.equal(validateFbx2SmallBenchmarkReport(report), report);

const reordered = inventoryFbx2ManagedStage([{ ...stagedBranches[0], children: [...stagedBranches[0].children].reverse() }]);
assert.equal(benchmarkCanonicalJson(reordered.summary), benchmarkCanonicalJson(managedInventory.summary));

const tampered = structuredClone(report);
tampered.parity.passCount += 1;
assert.throws(() => validateFbx2SmallBenchmarkReport(tampered), /digest is invalid/);

const nondeterministic = buildFbx2SmallBenchmarkReport({
  source: { sha256: 'source', byteLength: 10 },
  managedStage: { sha256: 'managed', byteLength: 20 },
  selectedZone: { zoneId: 'occ:zone', label: '/SMALL' },
  runs: [run(), run('-changed')],
});
assert.equal(nondeterministic.status, 'BLOCKED_NONDETERMINISTIC');
assert.ok(nondeterministic.comparison.differingFields.length > 0);

console.log('test-fbx2-small-benchmark-core: PASS');
