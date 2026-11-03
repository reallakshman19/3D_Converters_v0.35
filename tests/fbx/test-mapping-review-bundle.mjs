import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildReviewBundle, calculateBundleId, calculateShardId } from '../../tabs/model-converters/converters/fbx/mapping-review-bundle.js';
import { worklistFixture } from './worklist-helpers.mjs';

function schemaErrors(schema, auxSchemas, instances) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
registry = Registry()
for aux in payload["auxSchemas"]:
    registry = registry.with_resource(aux["$id"], Resource.from_contents(aux))
validator = Draft202012Validator(payload["schema"], registry=registry)
print(json.dumps([[error.message for error in validator.iter_errors(item)] for item in payload["instances"]]))
`;
  const child = spawnSync(
    process.env.FBX_SCHEMA_PYTHON || 'python3',
    ['-c', program],
    {
      input: JSON.stringify({ schema, auxSchemas, instances }),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (child.error || child.status !== 0) {
    throw new Error(child.error?.message || child.stderr);
  }
  return JSON.parse(child.stdout);
}

const family = await worklistFixture('family');

// Test 1: Bundle building determinism and shape
const bundleOutput1 = await buildReviewBundle(family.worklist, 2);
const bundleOutput2 = await buildReviewBundle(family.worklist, 2);
assert.equal(
  JSON.stringify(bundleOutput1.bundle),
  JSON.stringify(bundleOutput2.bundle),
  'Determinism check failed'
);

const expectedShardCount = Math.ceil(family.worklist.workItems.length / 2);
assert.equal(bundleOutput1.shards.length, expectedShardCount);
assert.equal(bundleOutput1.bundle.shards.length, expectedShardCount);

assert.equal(bundleOutput1.shards[0].workItems.length, 2);
assert.equal(bundleOutput1.bundle.shards[0].workItemCount, 2);

assert.equal(bundleOutput1.bundle.bundleId, await calculateBundleId(bundleOutput1.bundle));
for (const shard of bundleOutput1.shards) {
  assert.equal(shard.shardId, await calculateShardId(shard));
  assert.equal(shard.bundleId, bundleOutput1.bundle.bundleId);
}

// Test 2: Schema validation
const bundleSchema = JSON.parse(await readFile('contracts/fbx/fbx-mapping-review-bundle.v1.schema.json', 'utf8'));
const shardSchema = JSON.parse(await readFile('contracts/fbx/fbx-mapping-review-shard.v1.schema.json', 'utf8'));
const worklistSchema = JSON.parse(await readFile('contracts/fbx/fbx-mapping-worklist.v1.schema.json', 'utf8'));

const [bundleErrors] = schemaErrors(bundleSchema, [worklistSchema], [bundleOutput1.bundle]);
assert.deepEqual(bundleErrors, [], 'Bundle schema validation should pass');

const shardErrors = schemaErrors(shardSchema, [worklistSchema], bundleOutput1.shards);
for (const errors of shardErrors) {
  assert.deepEqual(errors, [], 'Shard schema validation should pass');
}

// Test 3: Invalid maxItemsPerShard
try {
  await buildReviewBundle(family.worklist, -1);
  assert.fail('Should block invalid maxItemsPerShard');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_REVIEW_BUNDLE_CONTRACT');
}

// Test 4: Empty worklist
const emptyWorklist = structuredClone(family.worklist);
emptyWorklist.workItems = [];
try {
  await buildReviewBundle(emptyWorklist, 2);
  assert.fail('Should block empty worklist');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_REVIEW_BUNDLE_CONTRACT');
}

// Test 5: Stale worklistId blocks buildReviewBundle
const staleWorklist = structuredClone(family.worklist);
staleWorklist.worklistId = '0'.repeat(64);
try {
  await buildReviewBundle(staleWorklist, 2);
  assert.fail('Should block stale worklistId');
} catch (error) {
  assert.equal(error.status, 'BLOCKED_REVIEW_BUNDLE_CONTRACT');
}

console.log('test-mapping-review-bundle: PASS');
