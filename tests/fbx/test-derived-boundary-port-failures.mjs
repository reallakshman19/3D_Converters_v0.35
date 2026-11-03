import assert from 'node:assert/strict';
import { analyseFbxZoneGeometry } from '../../tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js';
import { deriveBoundaryLoops } from '../../tabs/model-converters/converters/fbx/zone-geometry/boundary-loops.js';
import { fitBoundaryCircleLocal } from '../../tabs/model-converters/converters/fbx/zone-geometry/circle-fit.js';
import { transformBoundaryFit } from '../../tabs/model-converters/converters/fbx/zone-geometry/occurrence-transform.js';
import { ZONE_GEOMETRY_STATUS } from '../../tabs/model-converters/converters/fbx/zone-geometry/constants.js';
import { buildFixture, diskGeometry } from './test-zone-geometry-evidence.mjs';

function edge(key, a, b, from = a, to = b) {
  return { key, a, b, incidentFaceIds: ['face:1'],
    occurrences: [{ faceId: 'face:1', from, to, corner: 0 }] };
}

const topology = { geometryObjectId: '10' };
const open = await deriveBoundaryLoops(topology, [{ shellId: 'shell:open', faces: [],
  edges: [edge('0:1',0,1), edge('1:2',1,2)], rejectionReasons: [] }]);
assert.ok(open[0].rejectionReasons.includes('OPEN_CHAIN'));

const branch = await deriveBoundaryLoops(topology, [{ shellId: 'shell:branch', faces: [],
  edges: [edge('0:1',0,1), edge('1:2',1,2), edge('1:3',1,3)], rejectionReasons: [] }]);
assert.ok(branch[0].rejectionReasons.includes('BRANCHING_BOUNDARY'));

const degenerate = await deriveBoundaryLoops(topology, [{ shellId: 'shell:degenerate', faces: [],
  edges: [edge('parallel-a',0,1), edge('parallel-b',0,1,1,0)], rejectionReasons: [] }]);
assert.ok(degenerate[0].rejectionReasons.includes('DEGENERATE_LOOP'));
assert.ok(fitBoundaryCircleLocal([[0,0,0],[1,0,0]]).rejectionReasons.includes('DEGENERATE_LOOP'));

const nonManifoldGeometry = { points: [[0,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1]],
  faces: [[0,1,2],[1,0,3],[0,1,4]] };
const nonManifoldFixture = await buildFixture({ geometry10: nonManifoldGeometry });
const nonManifold = await analyseFbxZoneGeometry({ sourceGraph: nonManifoldFixture.graph,
  geometryBundle: nonManifoldFixture.bundle, zoneId: 'occ:3' });
assert.equal(nonManifold.derivedPortEvidence.admittedPortCount, 0);
assert.ok(nonManifold.derivedPortEvidence.candidates.some((item) => (
  item.status === ZONE_GEOMETRY_STATUS.LOOP && item.rejectionReasons.includes('NON_MANIFOLD_SHELL')
)));

const nonPlanarShape = diskGeometry();
nonPlanarShape.points[2] = [...nonPlanarShape.points[2]]; nonPlanarShape.points[2][2] = 2;
const nonPlanarFixture = await buildFixture({ geometry10: nonPlanarShape });
const nonPlanar = await analyseFbxZoneGeometry({ sourceGraph: nonPlanarFixture.graph,
  geometryBundle: nonPlanarFixture.bundle, zoneId: 'occ:3' });
assert.ok(nonPlanar.derivedPortEvidence.candidates.some((item) => item.rejectionReasons.includes('NON_PLANAR')));

const ellipse = diskGeometry();
ellipse.points = ellipse.points.map(([x,y,z]) => [x * 2, y, z]);
const ellipseFixture = await buildFixture({ geometry10: ellipse });
const nonCircular = await analyseFbxZoneGeometry({ sourceGraph: ellipseFixture.graph,
  geometryBundle: ellipseFixture.bundle, zoneId: 'occ:3' });
assert.ok(nonCircular.derivedPortEvidence.candidates.some((item) => item.rejectionReasons.includes('NON_CIRCULAR')));

for (const [matrix, reason] of [
  [[0,0,0,0,1,0,0,0,1,0,0,0], 'SINGULAR_TRANSFORM'],
  [[1,0,0,0.5,1,0,0,0,1,0,0,0], 'SHEAR_TRANSFORM'],
  [[2,0,0,0,1,0,0,0,1,0,0,0], 'NON_UNIFORM_SCALE'],
]) {
  const fixture = await buildFixture({ matrixA: matrix });
  const result = await analyseFbxZoneGeometry({ sourceGraph: fixture.graph,
    geometryBundle: fixture.bundle, zoneId: 'occ:3' });
  assert.equal(result.derivedPortEvidence.admittedPortCount, 0);
  assert.ok(result.derivedPortEvidence.candidates.some((item) => item.rejectionReasons.includes(reason)));
}

const finiteFit = { centre: [0,0,0], normal: [0,0,1], radius: 10,
  planarityResidual: 0, circularResidual: 0, rejectionReasons: [] };
const infiniteTranslation = transformBoundaryFit({ sourceOccurrenceId: 'occ:finite-check', inheritMode: 0,
  geometryMatrixMm: [1,0,0,0,1,0,0,0,1,Number.POSITIVE_INFINITY,0,0] },
finiteFit, [[10,0,0],[0,10,0],[-10,0,0],[0,-10,0]]);
assert.deepEqual(infiniteTranslation, { rejectionReasons: ['NON_FINITE_RESULT'] });
assert.equal('centreMm' in infiniteTranslation, false);

const infiniteFit = transformBoundaryFit({ sourceOccurrenceId: 'occ:fit-check', inheritMode: 0,
  geometryMatrixMm: [1,0,0,0,1,0,0,0,1,0,0,0] },
{ ...finiteFit, radius: Number.NaN }, [[10,0,0],[0,10,0],[-10,0,0],[0,-10,0]]);
assert.deepEqual(infiniteFit, { rejectionReasons: ['NON_FINITE_RESULT'] });

const nonFiniteBasis = transformBoundaryFit({ sourceOccurrenceId: 'occ:basis-check', inheritMode: 0,
  geometryMatrixMm: [Number.NaN,0,0,0,1,0,0,0,1,0,0,0] },
finiteFit, [[10,0,0],[0,10,0],[-10,0,0],[0,-10,0]]);
assert.deepEqual(nonFiniteBasis, { rejectionReasons: ['NON_FINITE_RESULT'] });

for (const result of [nonManifold, nonPlanar, nonCircular]) {
  assert.equal(result.derivedPortEvidence.classificationDisposition, 'NOT_PERFORMED');
  assert.equal(result.derivedPortEvidence.connectivityDisposition, 'NOT_PERFORMED');
  assert.ok(result.derivedPortEvidence.candidates.filter((item) => item.admissionDisposition === 'ADMITTED')
    .every((item) => item.rejectionReasons.length === 0));
}

console.log('test-derived-boundary-port-failures: PASS');
