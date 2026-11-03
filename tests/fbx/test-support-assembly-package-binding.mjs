import assert from 'node:assert/strict';
import { buildSupportAssemblyEvidence } from '../../tabs/model-converters/converters/fbx/support-assembly/evidence.js';
import { buildSupportQualificationChecks } from '../../tabs/model-converters/converters/fbx/zone-package/qualification-support.js';
import { verifyQualifiedSupportBindings } from '../../tabs/model-converters/converters/fbx/zone-package/package-validation-support.js';

const h = (c) => c.repeat(64);
const selectedSourceGraph = {
  schema: 'FbxSelectedZoneSourceGraph.v1',
  artifactId: `FBXZGRAPH-${'1'.repeat(32)}`, graphDigest: h('1'),
  selectedZone: { selectedOccurrenceIds: ['occ:support'] },
  occurrences: [{ sourceOccurrenceId: 'occ:support', sourceModelObjectId: 'obj:support',
    parentOccurrenceId: null, geometryObjectIds: ['geo:support'] }],
};
const candidate = {
  candidateId: '2'.repeat(32), occurrenceId: 'occ:support', rawType: 'SUPPORT',
  sourceIdentity: { tag: 'S1', reference: null, name: 'Support 1' },
  disposition: 'GENERIC_SUPPORT', dispositionReason: 'CANDIDATE_HAS_IDENTITY_EVIDENCE',
};
const supportEvidence = {
  schema: 'FbxSupportEvidence.v1', selectedZoneDigest: h('3'),
  candidates: [candidate], evidenceDigest: h('4'),
};
const associationId = `FBXSHA-${'5'.repeat(32)}`;
const hostEvidence = {
  schema: 'FbxSupportHostAssociationEvidence.v1', status: 'PASS',
  selectedZoneDigest: h('3'), sourceZoneGeometryArtifactId: 'zone:1',
  sourceSupportEvidenceDigest: h('4'), sourceSupportCandidateCount: 1,
  candidateDispositions: [{
    candidateId: candidate.candidateId, occurrenceId: candidate.occurrenceId,
    rawType: candidate.rawType, geometryObjectIds: ['geo:support'],
    geometryDisposition: 'ELIGIBLE', hostDisposition: 'SINGLE_HOST_PROVED',
    hostAssociationIds: [associationId], hostPipeOccurrenceIds: ['occ:pipe'],
    reasons: ['SINGLE_EXACT_PIPE_HOST_PROVED'],
  }],
  hostAssociations: [{
    associationId, candidateId: candidate.candidateId,
    hostPipeOccurrenceId: 'occ:pipe',
  }],
  counts: { candidateCount: 1, singleHostCount: 1, multiHostCount: 0,
    hostNotFoundCount: 0, hostAmbiguousCount: 0 },
  evidenceDigest: h('6'),
};
const assemblyEvidence = await buildSupportAssemblyEvidence({
  selectedSourceGraph, supportEvidence, hostEvidence,
});
const manifest = { selectedZoneDigest: h('3') };
const zoneGeometry = { artifactId: 'zone:1' };
const artifacts = {
  SUPPORT_HOST_ASSOCIATION_EVIDENCE: hostEvidence,
  SUPPORT_ASSEMBLY_EVIDENCE: assemblyEvidence,
};
const checks = buildSupportQualificationChecks({
  manifest, zoneGeometry, selectedSourceGraph, supportEvidence, artifacts,
});
assert.deepEqual(checks.map((item) => item.code), [
  'SUPPORT_EVIDENCE_BINDING',
  'SUPPORT_HOST_ASSOCIATION_BINDING',
  'SUPPORT_ASSEMBLY_BINDING',
]);
assert.ok(checks.every((item) => item.status === 'PASS'));
const root = { selectedZone: { zoneGeometryArtifactId: 'zone:1' }, checks };
verifyQualifiedSupportBindings(root, supportEvidence, selectedSourceGraph,
  hostEvidence, assemblyEvidence, manifest);

const changedGraph = { ...selectedSourceGraph,
  artifactId: `FBXZGRAPH-${'7'.repeat(32)}` };
assert.throws(() => verifyQualifiedSupportBindings(root, supportEvidence,
  changedGraph, hostEvidence, assemblyEvidence, manifest), /assembly binding differs/);
const changedAssembly = structuredClone(assemblyEvidence);
changedAssembly.evidenceDigest = h('8');
assert.throws(() => verifyQualifiedSupportBindings(root, supportEvidence,
  selectedSourceGraph, hostEvidence, changedAssembly, manifest), /assembly binding differs/);

const blockedHost = structuredClone(hostEvidence);
blockedHost.status = 'BLOCKED';
blockedHost.candidateDispositions[0].hostDisposition = 'HOST_NOT_FOUND';
blockedHost.candidateDispositions[0].hostAssociationIds = [];
blockedHost.candidateDispositions[0].hostPipeOccurrenceIds = [];
blockedHost.hostAssociations = [];
blockedHost.counts.singleHostCount = 0;
blockedHost.counts.hostNotFoundCount = 1;
blockedHost.evidenceDigest = h('9');
const blockedAssembly = await buildSupportAssemblyEvidence({
  selectedSourceGraph, supportEvidence, hostEvidence: blockedHost,
});
const blockedArtifacts = {
  SUPPORT_HOST_ASSOCIATION_EVIDENCE: blockedHost,
  SUPPORT_ASSEMBLY_EVIDENCE: blockedAssembly,
};
const blockedChecks = buildSupportQualificationChecks({
  manifest, zoneGeometry, selectedSourceGraph, supportEvidence,
  artifacts: blockedArtifacts,
});
assert.equal(blockedChecks[1].status, 'BLOCKED');
assert.equal(blockedChecks[2].status, 'BLOCKED');
verifyQualifiedSupportBindings({ selectedZone: { zoneGeometryArtifactId: 'zone:1' },
  checks: blockedChecks }, supportEvidence, selectedSourceGraph,
  blockedHost, blockedAssembly, manifest);

console.log('test-support-assembly-package-binding: PASS');
