import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildSelectedZoneGeometryManifest } from '../../tabs/model-converters/converters/fbx/zone-package/geometry-manifest.js';
import { buildSelectedZonePackage } from '../../tabs/model-converters/converters/fbx/zone-package/package-builder.js';
import {
  COMPLETE_SOURCE_GRAPH_SHA256, quadGeometry, sourceIdentityFixture,
} from './zone-package-fixtures.mjs';

const validatorProgram = `
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
validator = Draft202012Validator(payload["schema"])
errors = sorted(validator.iter_errors(payload["instance"]), key=lambda e: (list(e.absolute_path), e.message))
print(json.dumps([{"path": list(e.absolute_path), "message": e.message} for e in errors]))
`;

function validate(schema, instance) {
  const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', validatorProgram], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Unable to start schema validator: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Draft 2020-12 validation failed to execute.\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function loadJson(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
}
function mutate(value, change) { const copy = structuredClone(value); change(copy); return copy; }

const manifestSchema = await loadJson('../../contracts/fbx/fbx-selected-zone-geometry-manifest.v1.schema.json');
const auditSchema = await loadJson('../../contracts/fbx/fbx-selected-zone-package-audit.v1.schema.json');

{
  const shared = quadGeometry('1', 'occ:1', '1');
  shared.occurrenceIds = ['occ:1', 'occ:2'];
  const { manifest, buffersByGeometryId } = await buildSelectedZoneGeometryManifest({
    completeSourceGraphSha256: COMPLETE_SOURCE_GRAPH_SHA256,
    sourceIdentity: sourceIdentityFixture(),
    geometries: [shared, quadGeometry('2', 'occ:3', '2', 20)],
  });
  assert.deepEqual(validate(manifestSchema, manifest), [],
    'a genuine runtime manifest with shared geometry must validate cleanly');
  const { audit } = await buildSelectedZonePackage({
    manifest, buffersByGeometryId, stagedJsonText: '[]\n',
  });
  assert.deepEqual(validate(auditSchema, audit), [],
    'a genuine runtime audit must validate cleanly');

  const malformedManifests = [
    mutate(manifest, (item) => { delete item.byteOrder; }),
    mutate(manifest, (item) => { item.geometries[0].occurrenceIds = []; }),
    mutate(manifest, (item) => { item.geometries[0].buffers[0].role = 'polygon-offsets'; }),
    mutate(manifest, (item) => { item.geometries[0].buffers[0].byteLength += 8; }),
    mutate(manifest, (item) => { item.geometries[0].unexpected = true; }),
  ];
  for (const instance of malformedManifests) {
    assert.ok(validate(manifestSchema, instance).length > 0,
      'malformed manifest must be rejected');
  }

  const malformedAudits = [
    mutate(audit, (item) => {
      item.files = item.files.filter((file) => file.role !== 'GEOMETRY_DESCRIPTOR');
    }),
    mutate(audit, (item) => {
      item.files = item.files.filter((file) => file.role !== 'GEOMETRY_BUFFER');
    }),
    mutate(audit, (item) => { item.files[0].path = '../escape'; }),
    mutate(audit, (item) => {
      item.files.find((file) => file.disposition === 'PRESENT').sha256 = null;
    }),
    mutate(audit, (item) => {
      item.supportSemantics = 'CANDIDATE_EVIDENCE_ONLY';
    }),
    mutate(audit, (item) => { item.unknown = true; }),
  ];
  for (const instance of malformedAudits) {
    assert.ok(validate(auditSchema, instance).length > 0,
      'malformed audit must be rejected');
  }
}

const malformedManifestFixtures = [
  'manifest-missing-digest.json', 'manifest-unexpected-property.json',
];
for (const name of malformedManifestFixtures) {
  const instance = await loadJson(`../fixtures/fbx/zone-package/${name}`);
  assert.ok(validate(manifestSchema, instance).length > 0,
    `${name} must remain rejected`);
}

const malformedAuditFixtures = [
  'audit-present-without-hash.json', 'audit-unknown-role.json',
];
for (const name of malformedAuditFixtures) {
  const instance = await loadJson(`../fixtures/fbx/zone-package/${name}`);
  assert.ok(validate(auditSchema, instance).length > 0,
    `${name} must remain rejected`);
}

console.log('test-zone-package-contracts: PASS');
