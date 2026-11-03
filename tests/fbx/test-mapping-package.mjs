import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import {
  calculatePackageId, canonicalDigest, validateMappingPackageShape,
  verifyMappingBinding,
} from '../../tabs/model-converters/converters/fbx/mapping-package.js';
import { enforceSourceGraphPolicy } from '../../tabs/model-converters/converters/fbx/source-graph.js';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';
import { packageFor, twoPipePackage } from './mapping-package-helpers.mjs';

function validateSchema(schema, instances) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
validator = Draft202012Validator(payload["schema"])
print(json.dumps([[error.message for error in validator.iter_errors(item)] for item in payload["instances"]]))
`;
  const python = process.env.FBX_SCHEMA_PYTHON || 'python3';
  const result = spawnSync(python, ['-c', program], {
    input: JSON.stringify({ schema, instances }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

const { bytes, mapping, graph, packageValue } = await twoPipePackage();
validateMappingPackageShape(packageValue);
assert.equal(packageValue.packageId, await calculatePackageId(packageValue));
assert.equal((await verifyMappingBinding(packageValue)).mapping.status, 'MAPPING_BINDING_PASS');

const nodeDigest = createHash('sha256').update(bytes).digest('hex');
assert.equal(await sha256Hex(bytes), nodeDigest, 'browser-compatible SHA-256 differs from Node');
const reordered = Object.fromEntries(Object.entries(mapping).reverse());
assert.equal(await canonicalDigest(mapping), await canonicalDigest(reordered));
const permutedGraph = structuredClone(graph);
for (const key of ['sourceObjects', 'occurrences', 'geometries', 'hierarchyEdges', 'connectionEdges']) {
  permutedGraph[key].reverse();
}
assert.equal(
  await canonicalDigest(enforceSourceGraphPolicy(permutedGraph)),
  packageValue.sourceGraph.canonicalSha256,
  'source-object iteration order changed canonical graph digest',
);
const rebuilt = await packageFor(bytes, reordered);
assert.equal(canonicalJson(rebuilt), canonicalJson(packageValue), 'mapping key order changed package bytes');
assert.equal(canonicalJson(await packageFor(bytes, mapping)), canonicalJson(packageValue), 'package generation is not repeatable');

const extra = structuredClone(packageValue);
extra.unexpected = true;
const malformed = structuredClone(packageValue);
malformed.source.sha256 = 'ABC';
const schema = JSON.parse(await readFile(
  new URL('../../contracts/fbx/fbx-mapping-package.v1.schema.json', import.meta.url), 'utf8',
));
const results = validateSchema(schema, [packageValue, extra, malformed]);
assert.equal(results[0].length, 0, JSON.stringify(results[0]));
assert.notEqual(results[1].length, 0, 'unexpected package field passed schema');
assert.notEqual(results[2].length, 0, 'malformed digest passed schema');
assert.throws(() => validateMappingPackageShape(extra), /missing or unexpected fields/);
assert.throws(() => validateMappingPackageShape(malformed), /lowercase SHA-256/);
console.log('test-mapping-package: PASS');
