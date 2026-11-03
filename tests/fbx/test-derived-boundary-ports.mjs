import assert from 'node:assert/strict';
import { analyseFbxZoneGeometry } from '../../tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js';
import { buildFixture, cylinderGeometry, diskGeometry } from './test-zone-geometry-evidence.mjs';

function candidate(result, index = 0) {
  return result.derivedPortEvidence.candidates[index];
}

function assertVectorNear(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance));
}

const ordinaryFixture = await buildFixture({ matrixA: [2,0,0,0,2,0,0,0,2,5,6,7] });
const ordinary = await analyseFbxZoneGeometry({ sourceGraph: ordinaryFixture.graph,
  geometryBundle: ordinaryFixture.bundle, zoneId: 'occ:3' });
assert.equal(ordinary.derivedPortEvidence.admittedPortCount, 1);
assertVectorNear(candidate(ordinary).centreMm, [5,6,7]);
assertVectorNear(candidate(ordinary).normal, [0,0,1]);
assert.ok(Math.abs(candidate(ordinary).radiusMm - 20) < 1e-9);
assert.equal(candidate(ordinary).transformDisposition, 'ORDINARY_POSITIVE_DETERMINANT');

const mirroredFixture = await buildFixture({ matrixA: [-1,0,0,0,1,0,0,0,1,5,0,0] });
const mirrored = await analyseFbxZoneGeometry({ sourceGraph: mirroredFixture.graph,
  geometryBundle: mirroredFixture.bundle, zoneId: 'occ:3' });
assert.equal(mirrored.derivedPortEvidence.admittedPortCount, 1);
assertVectorNear(candidate(mirrored).normal, [0,0,-1]);
assert.equal(candidate(mirrored).transformDisposition, 'MIRRORED_NEGATIVE_DETERMINANT_ACCEPTED');
assert.equal(candidate(mirrored).orientationRule, 'sign(det(A))*inverse-transpose(local-winding-normal)');

const cylinderFixture = await buildFixture({ geometry10: cylinderGeometry() });
const cylinder = await analyseFbxZoneGeometry({ sourceGraph: cylinderFixture.graph,
  geometryBundle: cylinderFixture.bundle, zoneId: 'occ:3' });
assert.equal(cylinder.derivedPortEvidence.admittedPortCount, 2);
assert.notEqual(candidate(cylinder, 0).boundaryLoopId, candidate(cylinder, 1).boundaryLoopId);
assert.notEqual(candidate(cylinder, 0).portEvidenceId, candidate(cylinder, 1).portEvidenceId);

const disk = diskGeometry();
const reordered = { points: disk.points, faces: [...disk.faces].reverse() };
const rotated = { points: disk.points, faces: disk.faces.map((face) => [face[1], face[2], face[0]]) };
const reversedWinding = { points: disk.points, faces: disk.faces.map((face) => [...face].reverse()) };
const baseFixture = await buildFixture({ geometry10: disk });
const reorderFixture = await buildFixture({ geometry10: reordered });
const rotateFixture = await buildFixture({ geometry10: rotated });
const reverseFixture = await buildFixture({ geometry10: reversedWinding });
const results = [];
for (const fixture of [baseFixture, reorderFixture, rotateFixture, reverseFixture]) results.push(await analyseFbxZoneGeometry({
  sourceGraph: fixture.graph, geometryBundle: fixture.bundle, zoneId: 'occ:3' }));
assert.equal(candidate(results[0]).shellId, candidate(results[1]).shellId);
assert.equal(candidate(results[0]).boundaryLoopId, candidate(results[1]).boundaryLoopId);
assert.equal(candidate(results[0]).shellId, candidate(results[2]).shellId);
assert.equal(candidate(results[0]).boundaryLoopId, candidate(results[2]).boundaryLoopId);
assert.deepEqual(candidate(results[0]).orderedTopology, candidate(results[1]).orderedTopology);
assert.deepEqual(candidate(results[0]).orderedTopology, candidate(results[2]).orderedTopology);
assert.equal(candidate(results[0]).shellId, candidate(results[3]).shellId);
assert.equal(candidate(results[0]).boundaryLoopId, candidate(results[3]).boundaryLoopId);
assert.deepEqual(candidate(results[0]).orderedTopology.orderedVertexIndices,
  candidate(results[3]).orderedTopology.orderedVertexIndices);
assertVectorNear(candidate(results[0]).normal, [0,0,1]);
assertVectorNear(candidate(results[3]).normal, [0,0,-1]);

const orderedFixture = await buildFixture({ geometryAId: '2', geometryBId: '10',
  geometryA: diskGeometry(), geometryB: diskGeometry(12, 15),
  selectedGeometryIds: ['10', '2'], siblingGeometryIds: [] });
const orderedPermuted = await buildFixture({ geometryAId: '2', geometryBId: '10',
  geometryA: diskGeometry(), geometryB: diskGeometry(12, 15),
  selectedGeometryIds: ['10', '2'], siblingGeometryIds: [], reverseInput: true });
const ordered = await analyseFbxZoneGeometry({ sourceGraph: orderedFixture.graph,
  geometryBundle: orderedFixture.bundle, zoneId: 'occ:3' });
const permuted = await analyseFbxZoneGeometry({ sourceGraph: orderedPermuted.graph,
  geometryBundle: orderedPermuted.bundle, zoneId: 'occ:3' });
assert.deepEqual(ordered.derivedPortEvidence.candidates.map((item) => item.geometryObjectId), ['2', '10']);
assert.equal(ordered.derivedPortJson, permuted.derivedPortJson);
assert.equal(ordered.derivedPortEvidence.artifactId, permuted.derivedPortEvidence.artifactId);

console.log('test-derived-boundary-ports: PASS');
