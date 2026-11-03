import assert from 'node:assert/strict';
import { convertFbxToStagedJson } from '../../tabs/model-converters/converters/fbx/conversion.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import { familyFixtureBytes, familyFixtureMapping } from './family-helpers.mjs';

function output(result, suffix) {
  return result.outputs.find((item) => item.name.endsWith(suffix));
}

const bytes = await familyFixtureBytes();
const mapping = await familyFixtureMapping();
const graph = await parseFbxBytesNode(bytes);
for (const id of ['500', '501', '502', '503', '504', '505', '506', '507']) {
  assert.ok(graph.sourceObjects.some((item) => item.sourceObjectId === id && item.ufbxElementType === 'NODE'));
  assert.ok(graph.occurrences.some((item) => item.sourceOccurrenceId === `occ:${id}`));
}
const success = await convertFbxToStagedJson({
  bytes, inputName: 'component-families.fbx', mapping, parse: parseFbxBytesNode,
});
assert.equal(success.conversionStatus, 'STAGEDJSON_PASS');
assert.equal(success.outputs.length, 5);
assert.ok(success.logs.stdout.includes('ENGINEERING_ATTRIBUTES_PASS'));
const staged = JSON.parse(output(success, '.staged.json').text);
assert.equal(staged.length, 3);
assert.deepEqual(
  staged.flatMap((branch) => branch.children.map((item) => item.type)).sort(),
  ['PIPE', 'ELBO', 'TEE', 'REDU', 'FLAN', 'VALV', 'PIPE', 'PIPE'].sort(),
);
const report = JSON.parse(output(success, '.fbx-conversion-report.json').text);
assert.equal(report.counts.promotedComponents, 8);
assert.deepEqual(report.counts.promotedByFamily, {
  BRANCH_FITTING: 0, ELBOW: 1, FLANGE: 1, GASKET: 0, INSTRUMENT: 0,
  PIPE: 3, REDUCER: 1, TEE: 1, VALVE: 1,
});
const ledger = JSON.parse(output(success, '.fbx-mapping-ledger.json').text);
assert.equal(ledger.mappingSchema, 'FbxStagedMapping.v2');
assert.equal(ledger.promoted.length, 8);
assert.ok(ledger.promoted.every((item) => item.sourceGeometryObjectIds?.length));
assert.equal(ledger.engineeringAttributes.status, 'PASS');
assert.equal(ledger.engineeringAttributes.counts.componentCount, 8);
const engineering = JSON.parse(output(success, '.FbxEngineeringAttributeLedger.v1.json').text);
assert.deepEqual(engineering, ledger.engineeringAttributes);
assert.equal(engineering.authority.geometryAttributeInference, false);

const missing = await convertFbxToStagedJson({ bytes, inputName: 'component-families.fbx', mapping: null, parse: parseFbxBytesNode });
assert.equal(missing.conversionStatus, 'BLOCKED_MAPPING');
assert.ok(!output(missing, '.staged.json'));
const malformed = await convertFbxToStagedJson({
  bytes, inputName: 'component-families.fbx', mapping: null,
  mappingError: 'Invalid mapping JSON: family-proof', parse: parseFbxBytesNode,
});
assert.equal(malformed.conversionStatus, 'BLOCKED_MAPPING');
assert.match(output(malformed, '.fbx-conversion-report.json').text, /family-proof/);
console.log('test-family-parser: PASS');
