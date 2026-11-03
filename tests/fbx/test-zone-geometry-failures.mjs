import assert from 'node:assert/strict';
import { analyseFbxZoneGeometry } from '../../tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js';
import { createZoneAnalysisController } from '../../tabs/model-converters/converters/fbx/zone-geometry/analysis-controller.js';
import { ZONE_GEOMETRY_STATUS } from '../../tabs/model-converters/converters/fbx/zone-geometry/constants.js';
import { buildFixture } from './test-zone-geometry-evidence.mjs';

async function expectCode(run, code) {
  await assert.rejects(run, (error) => error?.code === code);
}

async function analyse(fixture, zoneId = 'occ:3') {
  return analyseFbxZoneGeometry({ sourceGraph: fixture.graph,
    geometryBundle: fixture.bundle, zoneId });
}

const graphMismatch = await buildFixture();
graphMismatch.graph.file.creator = 'tampered-active-graph';
await expectCode(() => analyse(graphMismatch), ZONE_GEOMETRY_STATUS.BINDING);

const membershipMismatch = await buildFixture();
membershipMismatch.graph.occurrences.find((item) => item.sourceOccurrenceId === 'occ:5')
  .geometryObjectIds.push('11');
await expectCode(() => analyse(membershipMismatch), ZONE_GEOMETRY_STATUS.BINDING);

const unknownZone = await buildFixture();
await expectCode(() => analyse(unknownZone, 'occ:999'), ZONE_GEOMETRY_STATUS.SCOPE);

const siblingTamper = await buildFixture();
const siblingBuffer = siblingTamper.bundle.buffers.find((item) => item.bufferId.startsWith('geometry/11/'));
new Uint8Array(siblingBuffer.bytes)[0] ^= 1;
await expectCode(() => analyse(siblingTamper), ZONE_GEOMETRY_STATUS.TOPOLOGY);

const selectedTamper = await buildFixture();
selectedTamper.bundle.manifest.geometries[0].bufferIds.controlPointsMm = 'geometry/10/missing';
await expectCode(() => analyse(selectedTamper), ZONE_GEOMETRY_STATUS.TOPOLOGY);

const sourceLength = await buildFixture();
sourceLength.bundle.manifest.sourceIdentity.byteLength += 1;
await expectCode(() => analyse(sourceLength), ZONE_GEOMETRY_STATUS.TOPOLOGY);

const sourceSha = await buildFixture();
sourceSha.bundle.manifest.sourceIdentity.sha256 = 'd'.repeat(64);
await expectCode(() => analyse(sourceSha), ZONE_GEOMETRY_STATUS.TOPOLOGY);

const sourceVersion = await buildFixture();
sourceVersion.bundle.manifest.sourceIdentity.fbxVersion = 7400;
await expectCode(() => analyse(sourceVersion), ZONE_GEOMETRY_STATUS.TOPOLOGY);

const parserIdentity = await buildFixture();
parserIdentity.bundle.manifest.parserIdentity.wasmSha256 = 'd'.repeat(64);
await expectCode(() => analyse(parserIdentity), ZONE_GEOMETRY_STATUS.TOPOLOGY);

const descriptorOrder = await buildFixture();
descriptorOrder.bundle.manifest.buffers.reverse();
await expectCode(() => analyse(descriptorOrder), ZONE_GEOMETRY_STATUS.TOPOLOGY);

const descriptorLength = await buildFixture();
descriptorLength.bundle.manifest.buffers[0].byteLength += 8;
await expectCode(() => analyse(descriptorLength), ZONE_GEOMETRY_STATUS.TOPOLOGY);

const resourceLimit = await buildFixture();
resourceLimit.bundle.manifest.geometries[0].controlPointCount = Number.MAX_SAFE_INTEGER;
await expectCode(() => analyse(resourceLimit), ZONE_GEOMETRY_STATUS.RESOURCE);

const lifecycleFixture = await buildFixture();
let failNext = false;
const controller = createZoneAnalysisController({
  parseBundle: async () => {
    if (failNext) throw Object.assign(new Error('resource exhausted'), { code: 'FBX_WORKER_TIMEOUT' });
    return lifecycleFixture.bundle;
  },
  analyse: analyseFbxZoneGeometry,
});
await controller.run({ bytes: lifecycleFixture.sourceBytes,
  sourceGraph: lifecycleFixture.graph, zoneId: 'occ:3' });
assert.equal(controller.snapshot().phase, 'complete');
assert.ok(controller.snapshot().zoneGeometryJson);
assert.ok(controller.snapshot().derivedPortJson);
failNext = true;
await assert.rejects(() => controller.run({ bytes: lifecycleFixture.sourceBytes,
  sourceGraph: lifecycleFixture.graph, zoneId: 'occ:3' }),
(error) => error?.code === ZONE_GEOMETRY_STATUS.RESOURCE);
assert.equal(controller.snapshot().phase, 'failed');
assert.equal(controller.snapshot().zoneGeometryJson, null);
assert.equal(controller.snapshot().derivedPortJson, null);

console.log('test-zone-geometry-failures: PASS');
