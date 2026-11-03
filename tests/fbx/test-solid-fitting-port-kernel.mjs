import assert from 'node:assert/strict';
import { buildSolidFittingPortEvidence } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/evidence.js';
import { classifySolidFittingPipeOccurrence } from '../../tabs/model-converters/converters/fbx/solid-fitting-ports/classifier.js';
import {
  occurrenceFixture, prismGeometry, selectionFromGeometry,
} from './solid-fitting-port-fixtures.mjs';

async function main() {
  const geometry = prismGeometry(10, 50, 8);
  const selection = selectionFromGeometry('geo:prism', 'src:prism', geometry);
  const occurrence = occurrenceFixture('occ:prism', 'model:prism', 'geo:prism');
  const scope = { selectedOccurrences: [occurrence] };
  const zoneArtifact = { artifactId: `fbx-zone-geometry-evidence:${'a'.repeat(64)}` };

  const evidence = await buildSolidFittingPortEvidence(zoneArtifact, scope, [selection]);
  assert.equal(evidence.schema, 'FbxSolidFittingPortEvidence.v3');
  assert.equal(evidence.toleranceProfile.schema, 'FbxSolidFittingPortProfile.v3');
  assert.equal(evidence.occurrenceCount, 1);
  assert.equal(evidence.admittedOccurrenceCount, 1);

  const [record] = evidence.occurrenceEvidence;
  assert.equal(record.analysisProjection.method, 'POSITION_WELD_AND_FACE_DEDUP_V1');
  assert.equal(record.analysisProjection.toleranceMm, 2e-6);
  assert.equal(record.analysisProjection.finalAnalysisShellCount, 1);
  assert.equal(record.analysisProjection.terminalCapBridge, null);
  assert.equal(record.topologyDisposition, 'STRAIGHT_TWO_PORT');
  const admitted = record.candidates.filter((item) => item.admissionDisposition === 'ADMITTED');
  assert.equal(admitted.length, 2);
  // Every side-wall quad must be rejected as non-disc-shaped, not admitted as a port.
  assert.equal(record.candidates.length - admitted.length, 8);

  const result = classifySolidFittingPipeOccurrence({ occurrence, selection, record });
  assert.equal(result.status, 'PIPE_INFERENCE_PASS');
  assert.equal(result.inferenceMethod, 'CLOSED_SOLID_CYLINDER');
  assert.equal(result.sourceOccurrenceId, 'occ:prism');
  assert(Math.abs(result.spanMm - 50) < 1e-6, `expected spanMm ~50, got ${result.spanMm}`);
  assert(Math.abs(result.A.radiusMm - 10) < 1e-6);
  assert(Math.abs(result.L.radiusMm - 10) < 1e-6);

  console.log('PASS test-solid-fitting-port-kernel');
}

await main();
