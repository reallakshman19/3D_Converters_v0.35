import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POPULATION_KINDS, LEDGER_VOCABULARIES } from '../../tabs/model-converters/converters/fbx/benchmark-audit/ledger-vocabularies.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fbxRoot = join(root, 'tabs/model-converters/converters/fbx');
const auditRoot = join(fbxRoot, 'benchmark-audit');
async function filesAt(path) {
  if ((await stat(path)).isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => filesAt(join(path, entry.name))))).flat();
}
for (const file of await filesAt(fbxRoot)) {
  if (!file.endsWith('.js') || file.startsWith(auditRoot)) continue;
  const text = await readFile(file, 'utf8');
  assert.doesNotMatch(text, /benchmark-audit\//, `${relative(root, file)} imports Agent Q audit code`);
}
for (const file of await filesAt(auditRoot)) {
  if (!file.endsWith('.js')) continue;
  const text = await readFile(file, 'utf8');
  assert.doesNotMatch(text, /from ['"]\.\.\/(?:conversion|staged-writer|mapping-)/,
    `${relative(root, file)} imports production behavior`);
}
assert.deepEqual(POPULATION_KINDS, [
  'ZONE_BRANCH', 'COMPONENT', 'SUPPORT', 'TOPOLOGY_BRANCH',
  'TOPOLOGY_RELATIONSHIP', 'TOPOLOGY_JUNCTION', 'TOPOLOGY_BOUNDARY',
]);
assert.equal(LEDGER_VOCABULARIES.ZONE_BRANCH.ledgerSchema, 'FbxZoneMembershipIndex.v1');
assert.equal(LEDGER_VOCABULARIES.COMPONENT.ledgerSchema, 'FbxComponentBenchmarkReport.v1');
assert.equal(LEDGER_VOCABULARIES.SUPPORT.ledgerSchema, 'FbxSupportBenchmarkReport.v1');
assert.equal(LEDGER_VOCABULARIES.TOPOLOGY_RELATIONSHIP.ledgerSchema, 'FbxTopologyBenchmarkReport.v1');

const runAll = await readFile(join(root, 'tests/fbx/run-all.mjs'), 'utf8');
const requiredAuthorityTests = [
  'test-benchmark-zone-membership.mjs',
  'test-benchmark-topology.mjs',
  'test-benchmark-topology-review.mjs',
  'test-benchmark-strict-json.mjs',
  'test-benchmark-inventory.mjs',
  'test-benchmark-real-inventory.mjs',
  'test-benchmark-source-binding.mjs',
  'test-benchmark-lineage-accounting.mjs',
  'test-benchmark-derivation-authority.mjs',
  'test-benchmark-determinism.mjs',
  'test-benchmark-static-guards.mjs',
  'test-component-benchmark.mjs',
  'test-component-benchmark-adversarial.mjs',
  'test-component-matching-boundaries.mjs',
  'test-component-benchmark-inventory.mjs',
  'test-support-benchmark.mjs',
  'test-support-benchmark-failures.mjs',
  'test-support-occurrence-boundaries.mjs',
];
let previous = -1;
for (const test of requiredAuthorityTests) {
  const index = runAll.indexOf(`'${test}'`);
  assert.ok(index > previous, `${test} must remain registered in integrated order`);
  previous = index;
}
const agentQTests = [
  'test-benchmark-coverage-reconciliation.mjs',
  'test-benchmark-audit-integrated-ledgers.mjs',
  'test-benchmark-audit-integrated-invariants.mjs',
  'test-benchmark-exact-head-evidence.mjs',
  'test-benchmark-exact-head-integrated-identities.mjs',
  'test-benchmark-adversarial-manifest.mjs',
  'test-benchmark-audit-stage4-closure.mjs',
  'test-benchmark-audit-boundaries.mjs',
];
for (const test of agentQTests) {
  assert.equal(runAll.split(`'${test}'`).length - 1, 1, `${test} must be registered exactly once`);
}
console.log('test-benchmark-audit-boundaries: PASS');
