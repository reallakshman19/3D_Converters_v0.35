import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildSupportCandidateEvidence } from '../../tabs/model-converters/converters/fbx/zone-package/support-evidence.js';
import { buildHostAuthorityBinding } from '../../tabs/model-converters/converters/fbx/zone-package/host-authority.js';
import { FbxZonePackageError } from '../../tabs/model-converters/converters/fbx/zone-package/constants.js';
import { COMPLETE_SOURCE_GRAPH_SHA256 } from './zone-package-fixtures.mjs';

const validatorProgram = `
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
errors = list(Draft202012Validator(payload["schema"]).iter_errors(payload["instance"]))
print(json.dumps([e.message for e in errors]))
`;
function validate(schema, instance) {
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', validatorProgram], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const schema = JSON.parse(await readFile(new URL(
  '../../contracts/fbx/fbx-host-authority-binding.v1.schema.json', import.meta.url), 'utf8'));
const evidence = await buildSupportCandidateEvidence({
  selectedZoneDigest: COMPLETE_SOURCE_GRAPH_SHA256,
  occurrences: [
    { occurrenceId: 'occ:support-1', record: { type: 'ATTA', attributes: { REF: '=1/1', RAW_TYPE: 'ATTA' } } },
    { occurrenceId: 'occ:support-2', record: { type: 'ATTA', attributes: { REF: '=1/2', RAW_TYPE: 'ATTA' } } },
    { occurrenceId: 'occ:support-3', record: { type: 'ATTA', attributes: { REF: '=1/3', RAW_TYPE: 'ATTA' } } },
  ],
});
const [c1, c2, c3] = evidence.candidates;
const approved = (hosts, extra = {}) => ({
  status: 'APPROVED', reviewedBy: 'owner@example.com',
  reviewedAt: '2026-07-28T00:00:00Z', hostOccurrenceIds: hosts, ...extra,
});

{
  const binding = await buildHostAuthorityBinding({ supportEvidence: evidence, ownerMapping: {
    [c1.candidateId]: approved(['occ:pipe-1']),
    [c2.candidateId]: approved(['occ:pipe-2', 'occ:pipe-1']),
    [c3.candidateId]: approved(['occ:pipe-3']),
  } });
  assert.equal(binding.status, 'BOUND');
  assert.equal(binding.bindings.length, 3);
  const multiHost = binding.bindings.find((item) => item.candidateId === c2.candidateId);
  assert.equal(multiHost.multiHost, true);
  assert.deepEqual(multiHost.hostOccurrenceIds, ['occ:pipe-1', 'occ:pipe-2']);
  assert.deepEqual(binding.unresolvedCandidateIds, []);
  assert.deepEqual(binding.ambiguousCandidateIds, []);
  assert.deepEqual(validate(schema, binding), []);
  const again = await buildHostAuthorityBinding({ supportEvidence: evidence, ownerMapping: {
    [c1.candidateId]: approved(['occ:pipe-1']),
    [c2.candidateId]: approved(['occ:pipe-2', 'occ:pipe-1']),
    [c3.candidateId]: approved(['occ:pipe-3']),
  } });
  assert.deepEqual(binding, again,
    'host binding must be deterministic on repeated builds');
}

{
  const binding = await buildHostAuthorityBinding({ supportEvidence: evidence,
    ownerMapping: { [c1.candidateId]: approved(['occ:pipe-1']) } });
  assert.equal(binding.status, 'BLOCKED',
    'missing owner review for a candidate must block, never fall back');
  assert.deepEqual(binding.unresolvedCandidateIds,
    [c2.candidateId, c3.candidateId].sort());
}

{
  const binding = await buildHostAuthorityBinding({ supportEvidence: evidence, ownerMapping: {
    [c1.candidateId]: approved(['occ:pipe-1', 'occ:pipe-2'], { ambiguous: true }),
    [c2.candidateId]: approved(['occ:pipe-1']),
    [c3.candidateId]: approved(['occ:pipe-1']),
  } });
  assert.equal(binding.status, 'BLOCKED',
    'an explicit ambiguity record must block release');
  assert.deepEqual(binding.ambiguousCandidateIds, [c1.candidateId]);
}

await assert.rejects(() => buildHostAuthorityBinding({ supportEvidence: evidence, ownerMapping: {
  [c1.candidateId]: approved(['occ:pipe-1']),
  [c2.candidateId]: approved(['occ:pipe-2']),
  [c3.candidateId]: approved(['occ:pipe-3']),
  deadbeefdeadbeefdeadbeefdeadbeef: approved(['occ:pipe-x']),
} }), (error) => error instanceof FbxZonePackageError
  && error.code === 'ZONE_PACKAGE_INVALID_REVIEW');

await assert.rejects(() => buildHostAuthorityBinding({
  supportEvidence: { ...structuredClone(evidence), evidenceDigest: '0'.repeat(64) },
  ownerMapping: {},
}), (error) => error instanceof FbxZonePackageError
  && error.code === 'ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE');

{
  const singleEvidence = await buildSupportCandidateEvidence({
    selectedZoneDigest: COMPLETE_SOURCE_GRAPH_SHA256,
    occurrences: [{ occurrenceId: 'occ:single', record: {
      type: 'ATTA', attributes: { REF: '=9/9', RAW_TYPE: 'ATTA' },
    } }],
  });
  const single = singleEvidence.candidates[0];
  await assert.rejects(() => buildHostAuthorityBinding({
    supportEvidence: singleEvidence,
    ownerMapping: { [single.candidateId]: {
      status: 'PENDING', reviewedBy: 'x', reviewedAt: '2026-07-28T00:00:00Z',
      hostOccurrenceIds: ['occ:pipe-1'],
    } },
  }), (error) => error instanceof FbxZonePackageError
    && error.code === 'ZONE_PACKAGE_INVALID_REVIEW');
}

console.log('test-zone-package-host-authority: PASS');
