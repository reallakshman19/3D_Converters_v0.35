import assert from 'node:assert/strict';
import {
  buildSupportHostAssociationEvidence,
  validateSupportHostAssociationEvidence,
} from '../../tabs/model-converters/converters/fbx/support-host/evidence.js';

function float64Bytes(values) {
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return bytes;
}

function uint32Bytes(values) {
  const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

const occurrence = {
  sourceOccurrenceId: 'occ:support', sourceModelObjectId: 'obj:support',
  geometryObjectIds: ['g1'], inheritMode: 0,
  geometryMatrixMm: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
};
const selection = {
  geometry: { geometryObjectId: 'g1', sourceObjectId: 'mesh1' },
  buffers: [
    { role: 'control-points-mm', buffer: { bytes: float64Bytes([
      20, 10, 0, 40, 10, 0, 40, 10, 1, 20, 10, 1, 30, 40, 0,
    ]) } },
    { role: 'polygon-offsets', buffer: { bytes: uint32Bytes([0, 4]) } },
    { role: 'polygon-vertex-indices', buffer: { bytes: uint32Bytes([0, 1, 2, 3]) } },
  ],
};
const supportEvidence = {
  schema: 'FbxSupportEvidence.v1', selectedZoneDigest: 'a'.repeat(64),
  candidates: [{
    candidateId: '1'.repeat(32), occurrenceId: 'occ:support', rawType: 'SUPPORT',
    sourceIdentity: { tag: 'S1', reference: null, name: 'Support' },
    disposition: 'GENERIC_SUPPORT',
    dispositionReason: 'CANDIDATE_HAS_IDENTITY_EVIDENCE',
  }],
  evidenceDigest: 'b'.repeat(64),
};
const pipe = (id, y = 0) => ({
  admitted: true, sourceOccurrenceId: id, sourceModelObjectId: `obj:${id}`,
  geometryObjectId: `geo:${id}`, spanMm: 100, axis: [1, 0, 0],
  A: { centreMm: [0, y, 0], radiusMm: 10 },
  L: { centreMm: [100, y, 0], radiusMm: 10 },
});
const common = {
  supportEvidence,
  zoneGeometryEvidence: { schema: 'FbxZoneGeometryEvidence.v1', artifactId: 'zone:1' },
  scope: { selectedOccurrences: [occurrence] },
  selections: [selection],
  manifest: { selectedZoneDigest: 'a'.repeat(64) },
};

const single = await buildSupportHostAssociationEvidence({
  ...common, pipeClassifications: [pipe('pipe:1')],
});
assert.equal(single.status, 'PASS');
assert.equal(single.counts.singleHostCount, 1);
assert.equal(single.counts.associationCount, 1);
assert.equal(single.candidateDispositions[0].hostDisposition, 'SINGLE_HOST_PROVED');
assert.equal(single.authority.nearestPipeFallbackUsed, false);
assert.equal(single.authority.sourceNamesUsedAsClassificationAuthority, false);

const repeated = await buildSupportHostAssociationEvidence({
  ...common, pipeClassifications: [pipe('pipe:1')],
});
assert.deepEqual(single, repeated, 'identical authority must produce identical evidence');

const missing = await buildSupportHostAssociationEvidence({
  ...common, pipeClassifications: [pipe('pipe:far', 100)],
});
assert.equal(missing.status, 'BLOCKED');
assert.equal(missing.candidateDispositions[0].hostDisposition, 'HOST_NOT_FOUND');

const ambiguous = await buildSupportHostAssociationEvidence({
  ...common, pipeClassifications: [pipe('pipe:1'), pipe('pipe:duplicate')],
});
assert.equal(ambiguous.status, 'BLOCKED');
assert.equal(ambiguous.candidateDispositions[0].hostDisposition, 'HOST_AMBIGUOUS');
assert.equal(ambiguous.counts.associationCount, 2);

const zero = await buildSupportHostAssociationEvidence({
  ...common, supportEvidence: { ...supportEvidence, candidates: [] },
  pipeClassifications: [pipe('pipe:1')],
});
assert.equal(zero.status, 'PASS');
assert.equal(zero.counts.candidateCount, 0);

await assert.rejects(() => buildSupportHostAssociationEvidence({
  ...common, pipeClassifications: [pipe('pipe:1'), pipe('pipe:1')],
}), /host authority is not exclusive/);

const tampered = structuredClone(single);
tampered.counts.associationCount = 99;
await assert.rejects(() => validateSupportHostAssociationEvidence(tampered),
  /counts or status are inconsistent/);

console.log('test-support-host-association: PASS');
