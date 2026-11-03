import assert from 'node:assert/strict';
import { convertFbxToStagedJson } from '../../tabs/model-converters/converters/fbx/conversion.js';
import { canonicalDigest, calculatePackageId } from '../../tabs/model-converters/converters/fbx/mapping-package.js';
import { parseFbxBytesNode } from '../../tabs/model-converters/converters/fbx/parser-node.js';
import {
  familyPackage, repositoryParserEvidence, twoPipePackage, withPackageId,
} from './mapping-package-helpers.mjs';

function output(result, suffix) {
  return result.outputs.find((item) => item.name.endsWith(suffix));
}

function assertNoStaged(result) {
  assert.ok(!output(result, '.staged.json'), `${result.conversionStatus} emitted StagedJSON`);
}

async function convert(bytes, mapping, parserEvidence, parse = parseFbxBytesNode) {
  return convertFbxToStagedJson({
    bytes, inputName: 'bound.fbx', mapping, parserEvidence, parse,
  });
}

async function compareLegacy(bytes, mapping, packageValue, parserEvidence) {
  const legacy = await convert(bytes, mapping, parserEvidence);
  const bound = await convert(bytes, packageValue, parserEvidence);
  assert.equal(legacy.conversionStatus, 'STAGEDJSON_PASS');
  assert.equal(legacy.outputs.length, 5);
  assert.ok(legacy.logs.stdout.includes('UNBOUND_LEGACY_MAPPING'));
  assert.ok(legacy.logs.stdout.includes('ENGINEERING_ATTRIBUTES_PASS'));
  assert.equal(bound.conversionStatus, 'STAGEDJSON_PASS');
  assert.equal(bound.outputs.length, 6);
  for (const suffix of [
    '.fbx-source-graph.json',
    '.fbx-mapping-ledger.json',
    '.FbxEngineeringAttributeLedger.v1.json',
    '.staged.json',
  ]) {
    assert.equal(output(bound, suffix).text, output(legacy, suffix).text, `${suffix} changed in package mode`);
  }
  const engineering = JSON.parse(output(bound, '.FbxEngineeringAttributeLedger.v1.json').text);
  assert.equal(engineering.status, 'PASS');
  assert.equal(engineering.authority.engineeringValueAuthority, 'APPROVED_MAPPING');
  const report = JSON.parse(output(bound, '.fbx-binding-report.json').text);
  for (const status of [
    'SOURCE_BINDING_PASS', 'PARSER_BINDING_PASS', 'SOURCE_GRAPH_BINDING_PASS',
    'MAPPING_BINDING_PASS', 'MAPPING_PASS', 'STAGEDJSON_PASS',
  ]) assert.ok(report.statuses.includes(status), `${status} missing`);
  assert.equal(report.status, 'STAGEDJSON_PASS');
  return bound;
}

const parserEvidence = await repositoryParserEvidence();
const v1 = await twoPipePackage();
const v2 = await familyPackage();
await compareLegacy(v1.bytes, v1.mapping, v1.packageValue, parserEvidence);
await compareLegacy(v2.bytes, v2.mapping, v2.packageValue, parserEvidence);

const mutatedBytes = v1.bytes.slice();
mutatedBytes[mutatedBytes.length - 1] ^= 1;
let parseCalls = 0;
const sourceBlocked = await convert(mutatedBytes, v1.packageValue, parserEvidence, async () => {
  parseCalls += 1;
  return parseFbxBytesNode(mutatedBytes);
});
assert.equal(sourceBlocked.conversionStatus, 'BLOCKED_SOURCE_BINDING');
assert.equal(parseCalls, 0, 'source mismatch reached parser');
assertNoStaged(sourceBlocked);

parseCalls = 0;
const wrongFile = await convert(v2.bytes, v1.packageValue, parserEvidence, async () => {
  parseCalls += 1;
  return parseFbxBytesNode(v2.bytes);
});
assert.equal(wrongFile.conversionStatus, 'BLOCKED_SOURCE_BINDING');
assert.equal(parseCalls, 0, 'wrong FBX reached parser despite source binding');
assertNoStaged(wrongFile);

const wrongParser = await withPackageId(v1.packageValue, (value) => {
  value.parser.wasmSha256 = '0'.repeat(64);
});
parseCalls = 0;
const parserBlocked = await convert(v1.bytes, wrongParser, parserEvidence, async () => {
  parseCalls += 1;
  return parseFbxBytesNode(v1.bytes);
});
assert.equal(parserBlocked.conversionStatus, 'BLOCKED_PARSER_BINDING');
assert.equal(parseCalls, 0, 'parser mismatch reached parser execution');
assertNoStaged(parserBlocked);

const wrongProvenance = await withPackageId(v1.packageValue, (value) => {
  value.parser.upstreamRevision = 'f'.repeat(40);
});
assert.equal((await convert(v1.bytes, wrongProvenance, parserEvidence)).conversionStatus, 'BLOCKED_PARSER_BINDING');

const wrongGraph = await withPackageId(v1.packageValue, (value) => {
  value.sourceGraph.canonicalSha256 = '0'.repeat(64);
});
const graphBlocked = await convert(v1.bytes, wrongGraph, parserEvidence);
assert.equal(graphBlocked.conversionStatus, 'BLOCKED_SOURCE_GRAPH_BINDING');
assertNoStaged(graphBlocked);

const wrongMapping = structuredClone(v1.packageValue);
wrongMapping.mapping.manifest.entries[0].logicalComponentId = 'ALTERED';
const mappingBlocked = await convert(v1.bytes, wrongMapping, parserEvidence);
assert.equal(mappingBlocked.conversionStatus, 'BLOCKED_MAPPING_BINDING');
assertNoStaged(mappingBlocked);

const malformedPackage = structuredClone(v1.packageValue);
malformedPackage.schema = 'FbxMappingPackage.v0';
const malformedBlocked = await convert(v1.bytes, malformedPackage, parserEvidence);
assert.equal(malformedBlocked.conversionStatus, 'BLOCKED_MAPPING_BINDING');
assertNoStaged(malformedBlocked);

const stalePackage = structuredClone(v1.packageValue);
stalePackage.packageId = `${stalePackage.packageId.slice(0, 63)}${stalePackage.packageId.endsWith('0') ? '1' : '0'}`;
const packageBlocked = await convert(v1.bytes, stalePackage, parserEvidence);
assert.equal(packageBlocked.conversionStatus, 'BLOCKED_MAPPING_BINDING');
assertNoStaged(packageBlocked);

const semanticallyInvalid = structuredClone(v1.packageValue);
semanticallyInvalid.mapping.manifest.entries[0].componentType = 'VALVE';
semanticallyInvalid.mapping.canonicalSha256 = await canonicalDigest(semanticallyInvalid.mapping.manifest);
semanticallyInvalid.packageId = '0'.repeat(64);
semanticallyInvalid.packageId = await calculatePackageId(semanticallyInvalid);
const semanticBlocked = await convert(v1.bytes, semanticallyInvalid, parserEvidence);
assert.equal(semanticBlocked.conversionStatus, 'BLOCKED_MAPPING');
assertNoStaged(semanticBlocked);
console.log('test-fbx-mapping-package: PASS');
