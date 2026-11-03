import assert from 'node:assert/strict';
import { buildSelectedZoneSupportEvidence } from '../../tabs/model-converters/converters/fbx/zone-package/selected-support-evidence.js';
import { validateSupportCandidateEvidence } from '../../tabs/model-converters/converters/fbx/zone-package/support-evidence.js';

function property(name, valueString) {
  return { name, valueString };
}

const sourceGraph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [
    { sourceObjectId: '10', displayName: 'SUP-10', customProperties: [
      property('RAW_TYPE', 'SUPPORT'), property('SUPPORT_TAG', 'S-100'),
    ] },
    { sourceObjectId: '20', displayName: 'ATTA-20', customProperties: [
      property('TYPE', 'ATTA'), property('REF', 'A-20'),
    ] },
    { sourceObjectId: '30', displayName: 'SUPPORT-BY-NAME-ONLY', customProperties: [] },
    { sourceObjectId: '40', displayName: 'PIPE-40', customProperties: [
      property('RAW_TYPE', 'PIPE'),
    ] },
  ],
};
const selectedOccurrences = ['10', '20', '30', '40'].map((id) => ({
  sourceOccurrenceId: `occ:${id}`, sourceModelObjectId: id, geometryObjectIds: [],
}));
const input = {
  sourceGraph,
  scope: { selectedOccurrences },
  manifest: { selectedZoneDigest: 'a'.repeat(64) },
};
const first = await buildSelectedZoneSupportEvidence(input);
const second = await buildSelectedZoneSupportEvidence(input);
assert.deepEqual(first, second, 'support evidence must be deterministic');
assert.equal(first.schema, 'FbxSupportEvidence.v1');
assert.equal(first.candidates.length, 2);
assert.deepEqual(new Set(first.candidates.map((item) => item.occurrenceId)),
  new Set(['occ:10', 'occ:20']));
assert.equal(first.candidates.find((item) => item.occurrenceId === 'occ:10').sourceIdentity.tag, 'S-100');
assert.equal(first.candidates.find((item) => item.occurrenceId === 'occ:20').rawType, 'ATTA');
assert.ok(!first.candidates.some((item) => item.occurrenceId === 'occ:30'),
  'a support-like display name must not create a candidate');
await validateSupportCandidateEvidence(first);
await assert.rejects(() => buildSelectedZoneSupportEvidence({
  ...input,
  scope: { selectedOccurrences: [...selectedOccurrences, {
    sourceOccurrenceId: 'occ:50', sourceModelObjectId: '50', geometryObjectIds: [],
  }] },
}), /has no source object/);
console.log('test-selected-zone-support-evidence: PASS');
