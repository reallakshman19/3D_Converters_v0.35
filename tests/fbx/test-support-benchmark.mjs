import assert from 'node:assert/strict';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { collectSupportRecords, buildSupportInventory } from '../../tabs/model-converters/converters/fbx/benchmark/support-records.js';
import { buildSupportClassInventory } from '../../tabs/model-converters/converters/fbx/benchmark/support-classification.js';
import { validateSupportBenchmark } from '../../tabs/model-converters/converters/fbx/benchmark/support-validator.js';
import { benchmarkFixture, explicitHostResolver, loadedBenchmarkFixture, identityPolicy, normalizers, propertyRules, toleranceProfile } from './support-benchmark-fixtures.mjs';

const referenceBranches = benchmarkFixture();
const reference = loadedBenchmarkFixture(referenceBranches);
const records = await collectSupportRecords(reference);
assert.equal(records.length, 3);
assert.match(records[0].recordId, /^support:sha256:[0-9a-f]{64}:\d{4}$/);
assert.match(records[0].evidenceSha256, /^[0-9a-f]{64}$/);
const inventory = { ...buildSupportInventory(records), ...buildSupportClassInventory(records) };
assert.deepEqual(inventory.countsByClass, { GUIDE: 1, REST: 2 });
assert.equal(inventory.duplicateTagGroups.length, 1);
assert.equal(inventory.duplicateTagGroups[0].supportTag, 'SHARED');
assert.equal(Object.hasOwn(records[0], 'supportClass'), false, 'occurrence layer must not own normalized support class');
assert.ok(records.every((record) => record.sourceOccurrenceId.startsWith('branch:0/child:')));
assert.ok(records.every((record) => record.branchOccurrenceId === 'branch:0'));

const actualBranches = structuredClone(referenceBranches);
const actual = loadedBenchmarkFixture(actualBranches);
const report = await validateSupportBenchmark({ reference, actual, identityPolicy: identityPolicy(), toleranceProfile, propertyRules, normalizers, hostResolver: explicitHostResolver, hostRequired: true });
assert.equal(report.summary.status, 'PASS');
assert.deepEqual(report.summary.countsByMatchState, { EXACT_MATCH: 3 });
assert.equal(report.coverage.invariantsPassed, true);
assert.ok(report.ledgerEntries.every((entry) => (
  entry.reference.sourceOccurrenceId && entry.reference.branchOccurrenceId
  && entry.actual.sourceOccurrenceId && entry.actual.branchOccurrenceId
)));

function withReorderedProcessing(loaded) {
  return Object.freeze({
    ...loaded,
    occurrences: Object.freeze([...loaded.occurrences].reverse()),
  });
}

const reordered = await validateSupportBenchmark({
  reference: withReorderedProcessing(reference),
  actual: withReorderedProcessing(actual),
  identityPolicy: identityPolicy(), toleranceProfile, propertyRules, normalizers,
  hostResolver: explicitHostResolver, hostRequired: true,
});
assert.equal(canonicalJson(reordered), canonicalJson(report), 'support evidence depends on processing order');
console.log('test-support-benchmark: PASS');
