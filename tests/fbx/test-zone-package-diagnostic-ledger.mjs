import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildSelectedZoneGeometryManifest } from '../../tabs/model-converters/converters/fbx/zone-package/geometry-manifest.js';
import { buildSelectedZoneDiagnosticLedger } from '../../tabs/model-converters/converters/fbx/zone-package/diagnostic-ledger.js';
import { FbxZonePackageError } from '../../tabs/model-converters/converters/fbx/zone-package/constants.js';
import {
  COMPLETE_SOURCE_GRAPH_SHA256, degenerateGeometry, openTubeGeometry, quadGeometry,
  sourceIdentityFixture, tetrahedronGeometry, twoTetrahedraGeometry, twoTrianglesGeometry,
} from './zone-package-fixtures.mjs';

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

const schema = JSON.parse(await readFile(new URL('../../contracts/fbx/fbx-selected-zone-diagnostic-ledger.v1.schema.json', import.meta.url), 'utf8'));

const geometries = [
  tetrahedronGeometry('1', 'occ:1', '1'),
  openTubeGeometry('2', 'occ:2', '2'),
  quadGeometry('3', 'occ:3', '3'),
  twoTetrahedraGeometry('4', 'occ:4', '4'),
  twoTrianglesGeometry('5', 'occ:5', '5'),
  degenerateGeometry('6', 'occ:6', '6'),
];
const { manifest } = await buildSelectedZoneGeometryManifest({
  completeSourceGraphSha256: COMPLETE_SOURCE_GRAPH_SHA256,
  sourceIdentity: sourceIdentityFixture(),
  geometries,
});

{
  const ledger = await buildSelectedZoneDiagnosticLedger({ manifest, geometries });
  assert.equal(ledger.entries.length, geometries.length, 'every selected geometry must be explained exactly once');
  const dispositionById = Object.fromEntries(ledger.entries.map((entry) => [entry.geometryId, entry.disposition]));
  assert.equal(dispositionById['1'], 'CLOSED');
  assert.equal(dispositionById['2'], 'CAPPED');
  assert.equal(dispositionById['3'], 'MERGED');
  assert.equal(dispositionById['4'], 'MULTI_SHELL');
  assert.equal(dispositionById['5'], 'OTHER_GOVERNED');
  assert.equal(dispositionById['6'], 'INVALID_TOPOLOGY');
  assert.equal(ledger.summary.totalGeometries, 6);
  assert.equal(ledger.summary.countsByDisposition.CLOSED, 1);
  assert.equal(ledger.summary.countsByDisposition.INVALID_TOPOLOGY, 1);
  const sumOfCounts = Object.values(ledger.summary.countsByDisposition).reduce((a, b) => a + b, 0);
  assert.equal(sumOfCounts, 6, 'every governed disposition bucket must sum to the total selection');
  assert.deepEqual(validate(schema, ledger), []);
  const again = await buildSelectedZoneDiagnosticLedger({ manifest, geometries });
  assert.deepEqual(ledger, again, 'the ledger must be deterministic on repeated builds');
}

{
  const partial = geometries.slice(0, -1);
  await assert.rejects(() => buildSelectedZoneDiagnosticLedger({ manifest, geometries: partial }),
    (error) => error instanceof FbxZonePackageError && error.code === 'ZONE_PACKAGE_UNEXPLAINED_GEOMETRY');
}

console.log('test-zone-package-diagnostic-ledger: PASS');
