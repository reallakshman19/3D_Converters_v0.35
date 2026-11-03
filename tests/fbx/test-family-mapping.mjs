import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { validateConnectivityV2 } from '../../tabs/model-converters/converters/fbx/connectivity.js';
import { validateMappingManifest } from '../../tabs/model-converters/converters/fbx/mapping-validator.js';
import { resolveEntryPortsV2 } from '../../tabs/model-converters/converters/fbx/port-resolver.js';
import { writeNativeStagedJsonV2 } from '../../tabs/model-converters/converters/fbx/staged-writer.js';
import { familyFixtureMapping, syntheticFamilyGraphV2 } from './family-helpers.mjs';

function project(mapping, graph = syntheticFamilyGraphV2()) {
  const accepted = validateMappingManifest(mapping, graph);
  const ports = new Map(accepted.entries.map((entry) => [
    entry.mappingEntryId, resolveEntryPortsV2(entry, graph),
  ]));
  const links = validateConnectivityV2(accepted.entries, ports);
  return { accepted, ports, links, staged: writeNativeStagedJsonV2(accepted.entries, ports, links) };
}

function changed(value, mutate) {
  const result = structuredClone(value);
  mutate(result);
  return result;
}

function entry(mapping, id) {
  return mapping.entries.find((item) => item.mappingEntryId === id);
}

function validateSchema(schema, instance) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
errors = sorted(Draft202012Validator(payload["schema"]).iter_errors(payload["instance"]), key=lambda e: (list(e.absolute_path), e.message))
print(json.dumps([{"path": list(e.absolute_path), "message": e.message} for e in errors]))
`;
  const python = process.env.FBX_SCHEMA_PYTHON || 'python3';
  const result = spawnSync(python, ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

const mapping = await familyFixtureMapping();
const graph = syntheticFamilyGraphV2();
const result = project(mapping, graph);
assert.equal(result.staged.length, 3, 'main, TEE branch, and disconnected route must remain distinct');
assert.deepEqual(
  result.staged.flatMap((branch) => branch.children.map((item) => item.type)).sort(),
  ['PIPE', 'ELBO', 'TEE', 'REDU', 'FLAN', 'VALV', 'PIPE', 'PIPE'].sort(),
);
const tee = result.staged.flatMap((branch) => branch.children).find((item) => item.type === 'TEE');
assert.deepEqual(tee.attributes.POS, { x: 200, y: -150, z: 0 });
assert.ok(tee.attributes.CREF, 'TEE must explicitly reference its mapped branch');
assert.ok(result.staged.some((branch) => branch.attributes.HREF === tee.id || branch.attributes.TREF === tee.id));
assert.equal(tee.attributes.mappingEngineering.runDiameterMm, 100);
assert.equal(result.staged.find((branch) => branch.children.some((item) => item.id === 'PIPE-8')).children.length, 1);

const renamed = structuredClone(graph);
for (const source of renamed.sourceObjects) source.displayName = source.domSourceName = 'misleading-VALVE-TEE-name';
assert.equal(canonicalJson(project(mapping, renamed).staged), canonicalJson(result.staged), 'names created engineering meaning');
const permuted = structuredClone(mapping);
permuted.entries.reverse();
permuted.inScopeSourceObjectIds.reverse();
assert.equal(canonicalJson(project(permuted).staged), canonicalJson(result.staged), 'mapping order changed bytes');
const reversedGraph = structuredClone(graph);
for (const key of ['sourceObjects', 'occurrences', 'geometries']) reversedGraph[key].reverse();
assert.equal(canonicalJson(project(mapping, reversedGraph).staged), canonicalJson(result.staged), 'source order changed bytes');

const invalid = [
  ['missing dimension', (value) => { delete entry(value, 'map-2').engineering.bendRadiusMm; }, /bendRadiusMm/],
  ['negative dimension', (value) => { entry(value, 'map-5').engineering.thicknessMm = -1; }, /positive/],
  ['nonfinite dimension', (value) => { entry(value, 'map-6').engineering.faceToFaceMm = Number.NaN; }, /positive/],
  ['missing port', (value) => { delete entry(value, 'map-3').ports.P; }, /ports.P/],
  ['duplicate port identity', (value) => { entry(value, 'map-3').ports.P.portId = 'A'; }, /duplicate/],
  ['unknown model', (value) => { entry(value, 'map-4').sourceModelObjectId = '999'; }, /source model|occurrence|no disposition/],
  ['unknown geometry', (value) => { entry(value, 'map-4').sourceGeometryObjectIds = ['999']; }, /geometry evidence/],
  ['family field conflict', (value) => { entry(value, 'map-5').engineering.valveType = 'GATE'; }, /not allowed/],
  ['non-opposed connection', (value) => { entry(value, 'map-7').ports.A.direction.vector = [1, 0, 0]; }, /connection directions|opposed/],
  ['source evidence conflict', (value) => { entry(value, 'map-8').sourceGeometryObjectIds = ['606']; entry(value, 'map-8').ports.A.geometryObjectId = '606'; entry(value, 'map-8').ports.L.geometryObjectId = '606'; }, /claimed/],
  ['elbow geometry conflict', (value) => { entry(value, 'map-2').engineering.bendRadiusMm = 99; }, /port chord/],
  ['flange geometry conflict', (value) => { entry(value, 'map-5').engineering.thicknessMm = 21; }, /mapped length/],
  ['valve geometry conflict', (value) => { entry(value, 'map-6').engineering.faceToFaceMm = 99; }, /mapped length/],
  ['numeric source identity', (value) => { value.inScopeSourceObjectIds[0] = 500; }, /identity syntax|required/],
];
for (const [name, mutate, pattern] of invalid) {
  assert.throws(() => project(changed(mapping, mutate)), pattern, name);
}

const offRun = structuredClone(graph);
offRun.geometries.find((item) => item.geometryObjectId === '602').verticesMm[2] = [201, -150, 0];
assert.throws(() => project(mapping, offRun), /TEE P must lie/);
const selfLink = changed(mapping, (value) => {
  entry(value, 'map-8').ports.A.connections = [{ mappingEntryId: 'map-8', portId: 'L' }];
  entry(value, 'map-8').ports.L.connections = [{ mappingEntryId: 'map-8', portId: 'A' }];
});
assert.throws(() => project(selfLink), /self-link/);

const cycle = changed(mapping, (value) => {
  entry(value, 'map-7').ports.L.connections = [{ mappingEntryId: 'map-1', portId: 'A' }];
  entry(value, 'map-1').ports.A.connections = [{ mappingEntryId: 'map-7', portId: 'L' }];
});
assert.throws(() => project(cycle), /reconnects one route segment|cyclic/);

const schema = JSON.parse(await readFile(new URL('../../contracts/fbx/fbx-staged-mapping.v2.schema.json', import.meta.url), 'utf8'));
assert.equal(validateSchema(schema, mapping).length, 0, 'fixture mapping must satisfy executable schema');
assert.notEqual(validateSchema(schema, changed(mapping, (value) => { value.unexpected = true; })).length, 0);
assert.notEqual(validateSchema(schema, changed(mapping, (value) => { delete entry(value, 'map-3').ports.P; })).length, 0);
console.log('test-family-mapping: PASS');
