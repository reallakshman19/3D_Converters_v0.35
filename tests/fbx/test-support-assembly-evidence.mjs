import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  buildSupportAssemblyEvidence,
  validateSupportAssemblyEvidence,
} from '../../tabs/model-converters/converters/fbx/support-assembly/evidence.js';
import { buildSupportAssemblyReviewModel, supportAssemblySummaryText } from '../../tabs/model-converters/converters/fbx/support-assembly/review-model.js';

function schemaErrors(schema, instance) {
  const program = `
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
print(json.dumps([error.message for error in Draft202012Validator(payload["schema"]).iter_errors(payload["instance"])]))
`;
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

const hash = (value) => value.repeat(64);
const occurrence = (id, parent) => ({
  sourceOccurrenceId: id,
  sourceModelObjectId: `obj:${id}`,
  parentOccurrenceId: parent,
  geometryObjectIds: [`geo:${id}`],
});
const selectedSourceGraph = {
  schema: 'FbxSelectedZoneSourceGraph.v1',
  artifactId: 'FBXZGRAPH-' + 'a'.repeat(32),
  graphDigest: hash('a'),
  selectedZone: {
    selectedOccurrenceIds: ['occ:s1', 'occ:s1c', 'occ:s2', 'occ:s3', 'occ:s4'],
  },
  occurrences: [
    occurrence('occ:zone', null),
    occurrence('occ:s1', 'occ:zone'),
    occurrence('occ:s1c', 'occ:s1'),
    occurrence('occ:s2', 'occ:zone'),
    occurrence('occ:group', 'occ:zone'),
    occurrence('occ:s3', 'occ:group'),
    occurrence('occ:s4', 'occ:group'),
  ],
};
const candidate = (digit, id) => ({
  candidateId: digit.repeat(32), occurrenceId: id, rawType: 'SUPPORT',
  sourceIdentity: { tag: id, reference: null, name: id },
  disposition: 'GENERIC_SUPPORT', dispositionReason: 'CANDIDATE_HAS_IDENTITY_EVIDENCE',
});
const candidates = [
  candidate('1', 'occ:s1'), candidate('2', 'occ:s1c'),
  candidate('3', 'occ:s2'), candidate('4', 'occ:s3'), candidate('5', 'occ:s4'),
];
const supportEvidence = {
  schema: 'FbxSupportEvidence.v1', selectedZoneDigest: hash('b'),
  candidates, evidenceDigest: hash('c'),
};
const hostDisposition = (candidateId, disposition, hostIds) => ({
  candidateId, occurrenceId: candidates.find((item) => item.candidateId === candidateId).occurrenceId,
  rawType: 'SUPPORT', geometryObjectIds: [], geometryDisposition: 'ELIGIBLE',
  hostDisposition: disposition,
  hostAssociationIds: hostIds.map((id, index) => `FBXSHA-${id.slice(-1).repeat(31)}${index}`),
  hostPipeOccurrenceIds: hostIds,
  reasons: [disposition],
});
const dispositions = [
  hostDisposition(candidates[0].candidateId, 'SINGLE_HOST_PROVED', ['pipe:1']),
  hostDisposition(candidates[1].candidateId, 'SINGLE_HOST_PROVED', ['pipe:2']),
  hostDisposition(candidates[2].candidateId, 'SINGLE_HOST_PROVED', ['pipe:3']),
  hostDisposition(candidates[3].candidateId, 'MULTI_HOST_PROVED', ['pipe:4', 'pipe:5']),
  hostDisposition(candidates[4].candidateId, 'HOST_NOT_FOUND', []),
];
const hostAssociations = dispositions.flatMap((item) => item.hostAssociationIds.map((id, index) => ({
  associationId: id,
  candidateId: item.candidateId,
  hostPipeOccurrenceId: item.hostPipeOccurrenceIds[index],
})));
const hostEvidence = {
  schema: 'FbxSupportHostAssociationEvidence.v1', status: 'BLOCKED',
  selectedZoneDigest: hash('b'), sourceSupportEvidenceDigest: hash('c'),
  sourceSupportCandidateCount: candidates.length,
  candidateDispositions: dispositions,
  hostAssociations,
  evidenceDigest: hash('d'),
};

const first = await buildSupportAssemblyEvidence({
  selectedSourceGraph, supportEvidence, hostEvidence,
});
assert.equal(first.status, 'BLOCKED');
assert.equal(first.counts.candidateCount, 5);
assert.equal(first.counts.assemblyCount, 4);
assert.equal(first.counts.passedAssemblyCount, 3);
assert.equal(first.counts.blockedAssemblyCount, 1);
const nested = first.assemblies.find((item) => item.rootOccurrenceId === 'occ:s1');
assert.equal(nested.members.length, 2);
assert.deepEqual(nested.memberOccurrenceIds, ['occ:s1', 'occ:s1c']);
assert.equal(nested.disposition, 'MULTI_PIPE_ASSEMBLY_PROVED');
const siblingA = first.assemblies.find((item) => item.rootOccurrenceId === 'occ:s3');
const siblingB = first.assemblies.find((item) => item.rootOccurrenceId === 'occ:s4');
assert.notEqual(siblingA.assemblyId, siblingB.assemblyId,
  'siblings under a non-candidate parent must remain separate assemblies');
assert.equal(siblingB.disposition, 'ASSEMBLY_HOST_BLOCKED');
assert.equal(first.authority.siblingProximityGroupingUsed, false);
assert.equal(first.authority.restraintSubtypeEvaluated, false);
const schema = JSON.parse(await readFile(new URL('../../contracts/fbx/fbx-support-assembly-evidence.v1.schema.json', import.meta.url), 'utf8'));
assert.deepEqual(schemaErrors(schema, first), [], 'assembly schema rejected its production instance');

const repeated = await buildSupportAssemblyEvidence({
  selectedSourceGraph, supportEvidence, hostEvidence,
});
assert.deepEqual(first, repeated);
const review = buildSupportAssemblyReviewModel(first);
assert.equal(review.available, true);
assert.match(supportAssemblySummaryText(review), /3\/4 generic support assemblies proved/);

const tampered = structuredClone(first);
tampered.counts.assemblyCount += 1;
await assert.rejects(() => validateSupportAssemblyEvidence(tampered), /counts or release status/);

const cycleGraph = structuredClone(selectedSourceGraph);
cycleGraph.occurrences.find((item) => item.sourceOccurrenceId === 'occ:zone').parentOccurrenceId = 'occ:s1';
await assert.rejects(() => buildSupportAssemblyEvidence({
  selectedSourceGraph: cycleGraph, supportEvidence, hostEvidence,
}), /ancestry cycle/);

console.log('test-support-assembly-evidence: PASS');
