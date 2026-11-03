import assert from 'node:assert/strict';
import { classifySelectedPipes } from '../../tabs/model-converters/converters/fbx/auto-pipe/classify.js';
import { buildSolidFittingPortEvidence } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/evidence.js';
import { classifySolidFittingPipeOccurrence } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/classifier.js';
import { SOLID_FITTING_PORT_PROFILE } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/profile.js';
import { buildDerivedPortEvidence } from '../../tabs/model-converters/converters/fbx/zone-geometry/derived-ports.js';
import { occurrenceFixture, selectionFromGeometry } from './solid-fitting-port-fixtures.mjs';

function splitCappedCylinder(radius = 30.15, height = 240, sides = 32, seam = 1.5e-6) {
  const points = [];
  for (let end = 0; end < 2; end += 1) for (let index = 0; index < sides; index += 1) {
    const angle = (index * Math.PI * 2) / sides;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), end * height]);
  }
  const faces = [Array.from({ length: sides }, (_, index) => sides - 1 - index)];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    faces.push([index, next, sides + next, sides + index]);
  }
  const capStart = points.length;
  for (let index = 0; index < sides; index += 1) {
    const angle = (index * Math.PI * 2) / sides;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), height + seam]);
  }
  const centre = points.length;
  points.push([0, 0, height + seam]);
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    faces.push([centre, capStart + index, capStart + next]);
  }
  const polygonOffsets = [0], polygonVertexIndices = [];
  for (const face of faces) {
    polygonVertexIndices.push(...face);
    polygonOffsets.push(polygonVertexIndices.length);
  }
  return { controlPointsMm: points.flat(), polygonOffsets, polygonVertexIndices };
}

function fixtureFor(seam) {
  const selection = selectionFromGeometry('101', '1', splitCappedCylinder(30.15, 240, 32, seam));
  const occurrence = occurrenceFixture('occ:1', '1', '101', {
    inheritMode: 2, originalInheritMode: 2,
  });
  return { occurrence, selection, scope: { selectedOccurrences: [occurrence] } };
}

async function assertRouted(fixture, evidence) {
  const derived = await buildDerivedPortEvidence({}, fixture.scope, [fixture.selection]);
  assert.equal(derived.candidates.length, 2);
  assert.equal(new Set(derived.candidates.map((item) => item.shellId)).size, 2);
  const [routed] = classifySelectedPipes({
    zoneGeometryEvidence: { occurrenceEvidence: [fixture.occurrence] },
    derivedPortEvidence: derived, closedSolidPipeEvidence: evidence, selections: [fixture.selection],
  });
  assert.equal(routed.admitted, true);
  assert.equal(routed.inferenceMethod, 'CLOSED_SOLID_CYLINDER');
}

async function main() {
  const zoneArtifact = { artifactId: `fbx-zone-geometry-evidence:${'b'.repeat(64)}` };
  const baseFixture = fixtureFor(1.5e-6);
  const baseEvidence = await buildSolidFittingPortEvidence(
    zoneArtifact, baseFixture.scope, [baseFixture.selection]);
  const [baseRecord] = baseEvidence.occurrenceEvidence;
  assert.equal(baseRecord.analysisProjection.mergedVertexCount, 32);
  assert(baseRecord.analysisProjection.maximumMergeResidualMm > 1e-6);
  assert(baseRecord.analysisProjection.maximumMergeResidualMm <= 2e-6);
  assert.equal(baseRecord.analysisProjection.terminalCapBridge, null);
  assert.equal(baseRecord.topologyDisposition, 'STRAIGHT_TWO_PORT');
  assert.equal(baseRecord.candidates.filter((item) => item.admissionDisposition === 'ADMITTED').length, 2);
  const baseClassified = classifySolidFittingPipeOccurrence({
    occurrence: baseFixture.occurrence, selection: baseFixture.selection, record: baseRecord,
  });
  assert.equal(baseClassified?.admitted, true);
  await assertRouted(baseFixture, baseEvidence);

  const bridgeFixture = fixtureFor(5e-5);
  const bridgeEvidence = await buildSolidFittingPortEvidence(
    zoneArtifact, bridgeFixture.scope, [bridgeFixture.selection]);
  const [bridgeRecord] = bridgeEvidence.occurrenceEvidence;
  assert.equal(bridgeRecord.topologyDisposition, 'STRAIGHT_TWO_PORT');
  assert.equal(bridgeRecord.analysisProjection.finalAnalysisShellCount, 1);
  assert.equal(bridgeRecord.analysisProjection.terminalCapBridge.method, 'DETACHED_CAP_RING_BRIDGE_V1');
  assert.equal(bridgeRecord.analysisProjection.terminalCapBridge.disposition, 'APPLIED');
  assert(bridgeRecord.analysisProjection.terminalCapBridge.maximumVertexPairResidualMm <= 1e-4);
  await assertRouted(bridgeFixture, bridgeEvidence);

  const blockedProfile = {
    ...SOLID_FITTING_PORT_PROFILE,
    vertexMergeAbsoluteMm: 1e-6,
    terminalCapBridgeAbsoluteMm: 1e-6,
  };
  const blocked = await buildSolidFittingPortEvidence(
    zoneArtifact, baseFixture.scope, [baseFixture.selection], blockedProfile);
  assert.equal(blocked.occurrenceEvidence[0].topologyDisposition, 'REJECTED');
  assert.deepEqual(blocked.occurrenceEvidence[0].rejectionReasons, ['MULTIPLE_SHELLS']);

  const beyondFixture = fixtureFor(2e-4);
  const beyond = await buildSolidFittingPortEvidence(
    zoneArtifact, beyondFixture.scope, [beyondFixture.selection]);
  assert.equal(beyond.occurrenceEvidence[0].topologyDisposition, 'REJECTED');
  assert.equal(beyond.occurrenceEvidence[0].analysisProjection.terminalCapBridge, null);

  console.log('PASS test-solid-fitting-welded-taya-profile');
}
await main();
