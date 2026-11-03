import assert from 'node:assert/strict';
import { buildSolidFittingPortEvidence } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/evidence.js';
import {
  degenerateGeometry, tetrahedronGeometry, twoTetrahedraGeometry,
} from './zone-package-fixtures.mjs';
import { occurrenceFixture, selectionFromGeometry } from './solid-fitting-port-fixtures.mjs';

async function dispositionFor(geometry) {
  const selection = selectionFromGeometry('geo:1', 'src:1', geometry);
  const occurrence = occurrenceFixture('occ:1', 'model:1', 'geo:1');
  const scope = { selectedOccurrences: [occurrence] };
  const zoneArtifact = { artifactId: `fbx-zone-geometry-evidence:${'a'.repeat(64)}` };
  const evidence = await buildSolidFittingPortEvidence(zoneArtifact, scope, [selection]);
  return evidence.occurrenceEvidence[0];
}

async function main() {
  // Two disjoint watertight tetrahedra bound to one occurrence: reject, never
  // merge two separate solids into one component.
  const multiShell = await dispositionFor(twoTetrahedraGeometry('g', 'o', 's'));
  assert.equal(multiShell.topologyDisposition, 'REJECTED');
  assert(multiShell.rejectionReasons.includes('MULTIPLE_SHELLS'));

  // A single degenerate two-vertex "polygon": invalid topology, not a crash.
  const degenerate = await dispositionFor(degenerateGeometry('g', 'o', 's'));
  assert.equal(degenerate.topologyDisposition, 'REJECTED');
  assert(degenerate.rejectionReasons.length > 0);

  // A single watertight tetrahedron: valid single shell, but every triangular
  // face is far too angular to be a disc-shaped port (area far below its
  // circumscribed circle), so it must never be admitted as a pipe/fitting.
  const tetrahedron = await dispositionFor(tetrahedronGeometry('g', 'o', 's'));
  assert.equal(tetrahedron.topologyDisposition, 'REJECTED');
  assert.equal(tetrahedron.rejectionReasons[0], 'ZERO_OR_ONE_PORT');
  assert.equal(tetrahedron.candidates.filter((item) => item.admissionDisposition === 'ADMITTED').length, 0);

  console.log('PASS test-solid-fitting-port-negative');
}

await main();
