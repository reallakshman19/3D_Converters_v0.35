// Validate real SourceGraph v2 evidence, multiplicity, and fail-closed schema cases.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { ALL_CATEGORY_URL, fixtureBytes } from './helpers.mjs';

const expected = new Map([
  ['400', ['NODE', 1, 'Model', 'Null', 'Model::EvidenceNull', 'Model::EvidenceNull']],
  ['401', ['NODE', 1, 'Model', 'Mesh', 'Model::EvidenceMesh', 'Model::EvidenceMesh']],
  ['402', ['MESH', 2, 'Geometry', 'Mesh', 'Geometry::EvidenceMesh', 'Geometry::EvidenceMesh']],
  ['403', ['NODE', 1, 'Model', 'NurbsCurve', 'Model::EvidenceCurve', 'Model::EvidenceCurve']],
  ['404', ['NURBS_CURVE', 8, 'Geometry', 'NurbsCurve', 'Geometry::EvidenceCurve', 'Geometry::EvidenceCurve']],
  ['405', ['MATERIAL', 24, 'Material', '', 'Material::EvidenceMaterial', 'Material::EvidenceMaterial']],
  ['406', ['CAMERA', 4, 'NodeAttribute', 'Camera', 'NodeAttribute::EvidenceCamera', 'NodeAttribute::EvidenceCamera']],
  ['407', ['LIGHT', 3, 'NodeAttribute', 'Light', 'NodeAttribute::EvidenceLight', 'NodeAttribute::EvidenceLight']],
  ['408', ['TEXTURE', 25, 'Texture', 'TextureVideoClip', 'Texture::EvidenceTexture', 'Texture::EvidenceTexture']],
  ['409', ['VIDEO', 26, 'Video', 'Clip', 'Video::EvidenceVideo', 'Video::EvidenceVideo']],
  ['410', ['SKIN_DEFORMER', 17, 'Deformer', 'Skin', 'Deformer::EvidenceSkin', 'Deformer::EvidenceSkin']],
  ['411', ['ANIM_STACK', 29, 'AnimationStack', '', 'AnimStack::EvidenceTake', 'AnimStack::EvidenceTake']],
  ['412', ['ANIM_LAYER', 30, 'AnimationLayer', '', 'AnimLayer::EvidenceLayer', 'AnimLayer::EvidenceLayer']],
  ['413', ['ANIM_CURVE', 32, 'AnimationCurve', '', 'AnimCurve::EvidenceCurve', 'AnimCurve::EvidenceCurve']],
  ['414', ['UNKNOWN', 0, 'MysteryObject', 'FutureSubtype', 'Mystery::EvidenceUnknown', 'Mystery::EvidenceUnknown']],
]);

const validatorProgram = String.raw`
import json, sys
try:
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource
except Exception as error:
    print("Draft 2020-12 validator unavailable: " + str(error), file=sys.stderr)
    raise
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
registry = Registry()
for type_schema in payload["typeSchemas"]:
    Draft202012Validator.check_schema(type_schema)
    registry = registry.with_resource(type_schema["$id"], Resource.from_contents(type_schema))
validator = Draft202012Validator(payload["schema"], registry=registry)
results = []
for instance in payload["instances"]:
    errors = sorted(validator.iter_errors(instance), key=lambda error: (list(error.absolute_path), error.message))
    results.append([{"path": list(error.absolute_path), "message": error.message} for error in errors])
print(json.dumps(results))
`;

function evidence(source) {
  return [
    source.ufbxElementType, source.ufbxElementTypeValue, source.domClass,
    source.domSubtype, source.domSourceName, source.displayName,
  ];
}

function changed(graph, mutate) {
  const value = structuredClone(graph);
  mutate(value);
  return value;
}

function validateAll(schema, typeSchemas, instances) {
  const validatorPython = process.env.FBX_SCHEMA_PYTHON || 'python3';
  const result = spawnSync(validatorPython, ['-c', validatorProgram], {
    input: JSON.stringify({ schema, typeSchemas, instances }), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`Unable to start schema validator Python '${validatorPython}': ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Draft 2020-12 validation failed to execute with '${validatorPython}'.\n`
      + 'Install scripts/fbx/schema-validator-requirements.txt in an isolated Python environment and set FBX_SCHEMA_PYTHON.\n'
      + result.stderr,
    );
  }
  return JSON.parse(result.stdout);
}

const schema = JSON.parse(await readFile(
  new URL('../../contracts/fbx/fbx-source-graph.v2.schema.json', import.meta.url), 'utf8',
));
const typeSchemas = await Promise.all([
  'fbx-type-evidence.v2.schema.json',
  'fbx-element-type-pair.v2.schema.json',
  'fbx-node-attribute-pair.v2.schema.json',
].map(async (name) => JSON.parse(await readFile(
  new URL(`../../contracts/fbx/${name}`, import.meta.url), 'utf8',
))));
const bytes = await fixtureBytes(ALL_CATEGORY_URL);
const graph = await parseFbxBytesNode(bytes);
assert.equal(graph.schema, 'FbxSourceGraph.v2');
assert.equal(schema.$id, 'FbxSourceGraph.v2');
assert.equal(graph.file.ascii, false);

const byId = new Map(graph.sourceObjects.map((source) => [source.sourceObjectId, source]));
for (const [id, values] of expected) assert.deepEqual(evidence(byId.get(id)), values, `evidence ${id}`);
assert.equal(new Set(graph.sourceObjects.map((source) => source.sourceObjectId)).size, graph.sourceObjects.length);
assert.ok(graph.sourceObjects.every((source) => source.ufbxElementType !== 'OTHER'));
assert.ok(graph.sourceObjects.every((source) => source.objectPropertyPath === null));
assert.equal(byId.get('406').sourceRecordDisposition, 'retained-evidence');
assert.equal(byId.get('401').nodeAttributeType, 'MESH');
assert.equal(byId.get('401').nodeAttributeTypeValue, 2);
assert.equal(byId.get('414').sourceRecordDisposition, 'unresolved-unknown');
assert.ok(graph.unsupportedRecords.some((record) => record.sourceObjectId === '414'));
assert.ok(graph.unresolvedReferences.some((record) => record.sourceObjectId === '414'));

const multiplicity = changed(graph, (value) => {
  value.sourceObjects[0].connectionPropertyNames.push('RepeatedEvidence', 'RepeatedEvidence');
  const occurrence = value.occurrences.find((item) => item.geometryObjectIds.length > 0);
  occurrence.geometryObjectIds.push(occurrence.geometryObjectIds[0]);
  value.geometries[0].ownerOccurrenceIds.push(value.geometries[0].ownerOccurrenceIds[0]);
});
const cases = [
  ['valid parser output', graph, true],
  ['valid repeated evidence', multiplicity, true],
  ['missing required field', changed(graph, (value) => { delete value.file.creator; }), false],
  ['wrong field type', changed(graph, (value) => { value.file.version = '7400'; }), false],
  ['unknown property', changed(graph, (value) => { value.unexpected = true; }), false],
  ['invalid disposition', changed(graph, (value) => { value.sourceObjects.find((item) => item.sourceObjectId === '405').sourceRecordDisposition = 'supported-geometry'; }), false],
  ['malformed geometry ownership', changed(graph, (value) => { value.geometries[0].ownerOccurrenceIds = [1]; }), false],
  ['malformed hierarchy edge', changed(graph, (value) => { value.hierarchyEdges.push({ parentOccurrenceId: 'occ:400', childOccurrenceId: 401 }); }), false],
  ['malformed connection edge', changed(graph, (value) => { value.connectionEdges.push({ sourceObjectId: '400', destinationObjectId: 401, sourceProperty: '', destinationProperty: '' }); }), false],
  ['invalid unresolved evidence', changed(graph, (value) => { value.unresolvedReferences.find((item) => item.sourceObjectId === '414').reason = 'lost'; }), false],
  ['invalid symbolic numeric pairing', changed(graph, (value) => { value.sourceObjects.find((item) => item.sourceObjectId === '405').ufbxElementTypeValue = 25; }), false],
  ['invalid node attribute numeric pairing', changed(graph, (value) => { value.sourceObjects.find((item) => item.sourceObjectId === '401').nodeAttributeTypeValue = 3; }), false],
  ['invalid node attribute symbolic pairing', changed(graph, (value) => { value.sourceObjects.find((item) => item.sourceObjectId === '401').nodeAttributeType = 'CAMERA'; }), false],
  ['non-attribute node evidence', changed(graph, (value) => { const node = value.sourceObjects.find((item) => item.sourceObjectId === '401'); node.nodeAttributeType = 'MATERIAL'; node.nodeAttributeTypeValue = 24; }), false],
  ['missing node attribute type', changed(graph, (value) => { delete value.sourceObjects.find((item) => item.sourceObjectId === '401').nodeAttributeType; }), false],
  ['missing node attribute value', changed(graph, (value) => { delete value.sourceObjects.find((item) => item.sourceObjectId === '401').nodeAttributeTypeValue; }), false],
  ['half-null node attribute evidence', changed(graph, (value) => { value.sourceObjects.find((item) => item.sourceObjectId === '401').nodeAttributeType = null; }), false],
  ['invented object path', changed(graph, (value) => { value.sourceObjects[0].objectPropertyPath = '/Objects/Model'; }), false],
  ['malformed custom property', changed(graph, (value) => { value.sourceObjects[0].customProperties.push({ name: 'Incomplete' }); }), false],
];
const results = validateAll(schema, typeSchemas, cases.map(([, instance]) => instance));
for (let index = 0; index < cases.length; index += 1) {
  const [name, , valid] = cases[index];
  assert.equal(results[index].length === 0, valid, `${name}: ${JSON.stringify(results[index])}`);
}
console.log('test-source-graph-v2: PASS');
