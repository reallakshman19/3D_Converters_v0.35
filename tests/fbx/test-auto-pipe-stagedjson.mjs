import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { executeInternalPipeMapping } from '../../tabs/model-converters/converters/fbx/auto-pipe/executor.js';
import { runFbxAutoPipe } from '../../tabs/model-converters/converters/fbx/auto-pipe/pipeline.js';
import { writeNativeStagedJsonV2 } from '../../tabs/model-converters/converters/fbx/staged-writer.js';

const hash = (digit) => digit.repeat(64);
const matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const buffer = (start, end) => new Float64Array([
  start, 1, 0, start, 0, 1, start, -1, 0, start, 0, -1,
  end, 1, 0, end, 0, 1, end, -1, 0, end, 0, -1,
]).buffer;
const port = (occ, geo, suffix, centreMm, normal, shell) => ({
  portEvidenceId: `port-evidence:${hash(suffix)}`,
  boundaryLoopId: `boundary-loop:${hash(suffix)}`,
  shellId: `shell:${hash(shell)}`,
  sourceOccurrenceId: occ, geometryObjectId: geo,
  admissionDisposition: 'ADMITTED', centreMm, normal, radiusMm: 1, diameterMm: 2,
});
const result = await runFbxAutoPipe({
  zoneGeometryEvidence: {
    artifactId: `fbx-zone-geometry-evidence:${hash('1')}`,
    sourceIdentity: { sha256: hash('2'), byteLength: 64, fbxVersion: 7400 },
    parserIdentity: {
      provenanceSchema: 'FbxParserProvenance.v1',
      upstreamRevision: '3'.repeat(40), sourceSha256: hash('4'), wasmSha256: hash('5'),
    },
    sourceGraphSha256: hash('6'), selectedZone: { zoneId: 'zone:pipe', label: 'Pipe' },
    occurrenceEvidence: [
      { sourceOccurrenceId: 'occ:1', sourceModelObjectId: '1',
        geometryObjectIds: ['2'], geometryMatrixMm: matrix },
      { sourceOccurrenceId: 'occ:2', sourceModelObjectId: '3',
        geometryObjectIds: ['4'], geometryMatrixMm: matrix },
    ],
    conservation: { selectedOccurrenceCount: 2 },
  },
  derivedPortEvidence: {
    artifactId: `fbx-derived-port-evidence:${hash('7')}`,
    candidates: [
      port('occ:1', '2', '8', [0, 0, 0], [-1, 0, 0], 'a'),
      port('occ:1', '2', '9', [10, 0, 0], [1, 0, 0], 'a'),
      port('occ:2', '4', 'b', [10, 0, 0], [-1, 0, 0], 'c'),
      port('occ:2', '4', 'd', [20, 0, 0], [1, 0, 0], 'c'),
    ],
  },
  selections: [
    { geometry: { geometryObjectId: '2' },
      buffers: [{ role: 'control-points-mm', buffer: { bytes: buffer(0, 10) } }] },
    { geometry: { geometryObjectId: '4' },
      buffers: [{ role: 'control-points-mm', buffer: { bytes: buffer(10, 20) } }] },
  ],
});
assert.equal(result.status, 'STAGEDJSON_PASS');
const branch = result.stagedJson[0];
assert.equal(branch.attributes.mappingSchema, 'FbxInternalPipeMapping.v1');
assert.equal(branch.attributes.connectivityAuthority, 'derived-boundary-port-match');
assert.equal(branch.children.length, 2);
assert.deepEqual(branch.children[0].attributes.LPOS, branch.children[1].attributes.APOS);

const execution = executeInternalPipeMapping(result.internalPipeMapping);
const defaultPublic = writeNativeStagedJsonV2(
  execution.entries, execution.resolvedByEntry, execution.links);
const explicitPublic = writeNativeStagedJsonV2(
  execution.entries, execution.resolvedByEntry, execution.links, {
    mappingSchema: 'FbxStagedMapping.v2',
    connectivityAuthority: 'explicit-mapping-port-links',
  });
assert.equal(canonicalJson(defaultPublic), canonicalJson(explicitPublic));
assert.equal(defaultPublic[0].attributes.mappingSchema, 'FbxStagedMapping.v2');
assert.equal(defaultPublic[0].attributes.connectivityAuthority, 'explicit-mapping-port-links');
console.log('PASS test-auto-pipe-stagedjson');
