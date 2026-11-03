import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  buildSupportCandidateEvidence, validateSupportCandidateEvidence,
} from '../../tabs/model-converters/converters/fbx/zone-package/support-evidence.js';
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
  '../../contracts/fbx/fbx-support-evidence.v1.schema.json', import.meta.url), 'utf8'));
const zoneDigest = COMPLETE_SOURCE_GRAPH_SHA256;
const occurrences = [
  { occurrenceId: 'occ:pipe-1', record: { type: 'PIPE', attributes: {} } },
  { occurrenceId: 'occ:support-1', record: { type: 'ATTA', name: 'S-1',
    attributes: { REF: '=1/1', SUPPORT_TAG: 'PS-1', RAW_TYPE: 'ATTA' } } },
  { occurrenceId: 'occ:support-2', record: { type: 'SUPPORT', attributes: { RAW_TYPE: 'SUPPORT' } } },
];

{
  const evidence = await buildSupportCandidateEvidence({ selectedZoneDigest: zoneDigest, occurrences });
  assert.equal(evidence.schema, 'FbxSupportEvidence.v1');
  assert.equal(evidence.candidates.length, 2,
    'only ATTA/SUPPORT-typed occurrences become candidates');
  const identified = evidence.candidates.find((item) => item.occurrenceId === 'occ:support-1');
  assert.equal(identified.rawType, 'ATTA');
  assert.equal(identified.disposition, 'GENERIC_SUPPORT');
  assert.equal(identified.sourceIdentity.tag, 'PS-1');
  const unidentified = evidence.candidates.find((item) => item.occurrenceId === 'occ:support-2');
  assert.equal(unidentified.rawType, 'SUPPORT');
  assert.equal(unidentified.disposition, 'UNCLASSIFIED_SUPPORT');
  assert.deepEqual(evidence.candidates.map((item) => item.candidateId),
    [...evidence.candidates.map((item) => item.candidateId)].sort(),
    'candidates must sort deterministically by candidateId');
  assert.match(evidence.evidenceDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(validate(schema, evidence), []);
  await validateSupportCandidateEvidence(evidence);

  const again = await buildSupportCandidateEvidence({ selectedZoneDigest: zoneDigest, occurrences });
  assert.deepEqual(evidence, again,
    'support evidence must be deterministic on repeated builds');
  const otherZone = await buildSupportCandidateEvidence({
    selectedZoneDigest: 'c'.repeat(64), occurrences,
  });
  assert.notDeepEqual(evidence.candidates.map((item) => item.candidateId),
    otherZone.candidates.map((item) => item.candidateId),
    'candidate identities must be selected-zone bound');

  for (const candidate of evidence.candidates) {
    assert.ok(!('restraintKind' in candidate));
    assert.ok(!('hostOccurrenceId' in candidate));
  }
  await assert.rejects(() => validateSupportCandidateEvidence({
    ...structuredClone(evidence), evidenceDigest: '0'.repeat(64),
  }), (error) => error instanceof FbxZonePackageError
    && error.code === 'ZONE_PACKAGE_INVALID_SUPPORT_EVIDENCE');
}

await assert.rejects(() => buildSupportCandidateEvidence({
  selectedZoneDigest: zoneDigest,
  occurrences: [...occurrences, {
    occurrenceId: 'occ:support-1', record: { type: 'ATTA', attributes: { RAW_TYPE: 'ATTA' } },
  }],
}), (error) => error instanceof FbxZonePackageError
  && error.code === 'ZONE_PACKAGE_DUPLICATE_OCCURRENCE');

await assert.rejects(() => buildSupportCandidateEvidence({
  selectedZoneDigest: 'not-a-hash', occurrences: [],
}), (error) => error instanceof FbxZonePackageError
  && error.code === 'ZONE_PACKAGE_INVALID_IDENTITY');

console.log('test-zone-package-support-evidence: PASS');
