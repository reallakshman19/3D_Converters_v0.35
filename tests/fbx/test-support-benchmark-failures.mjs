import assert from 'node:assert/strict';
import { collectSupportRecords } from '../../tabs/model-converters/converters/fbx/benchmark/support-records.js';
import { validateSupportBenchmark } from '../../tabs/model-converters/converters/fbx/benchmark/support-validator.js';
import { benchmarkFixture, explicitHostResolver, loadedBenchmarkFixture, identityPolicy, normalizers, propertyRules, supportNode, toleranceProfile } from './support-benchmark-fixtures.mjs';

async function validate(actual, options = {}) {
  return validateSupportBenchmark({ reference: loadedBenchmarkFixture(), actual: loadedBenchmarkFixture(actual), identityPolicy: options.identityPolicy || identityPolicy(), toleranceProfile: options.toleranceProfile || toleranceProfile, propertyRules, normalizers, orientationComparator: options.orientationComparator, hostResolver: options.hostResolver || explicitHostResolver, hostRequired: options.hostRequired ?? true });
}

{
  const malformed = structuredClone(loadedBenchmarkFixture());
  delete malformed.occurrenceById;
  await assert.rejects(() => collectSupportRecords(malformed), /occurrenceById are required/);
}
{
  const malformed = structuredClone(loadedBenchmarkFixture());
  malformed.occurrences[1].branchOccurrenceId = 'branch:999';
  malformed.occurrenceById[malformed.occurrences[1].occurrenceId] = malformed.occurrences[1];
  await assert.rejects(() => collectSupportRecords(malformed), /not a valid Agent E child occurrence/);
}
{
  const empty = loadedBenchmarkFixture([{ name: '/EMPTY/B1', type: 'BRANCH', attributes: { NAME: '/EMPTY/B1' }, children: [] }]);
  await assert.rejects(() => validateSupportBenchmark({ reference: empty, actual: empty, identityPolicy: identityPolicy(), toleranceProfile: { schema: 'FbxBenchmarkToleranceProfile.v1', profileId: 'invalid' } }), /supportPositionTolerance must be an object/);
}
{
  const actual = benchmarkFixture(); actual[0].children.shift();
  const report = await validate(actual); assert.equal(report.summary.countsByMatchState.MISSING_ACTUAL, 1); assert.equal(report.summary.status, 'FAIL');
}
{
  const actual = benchmarkFixture(); actual[0].children.push(supportNode({ name: '/S-999.1', ref: '=999/1', tag: 'S-999', owner: '/SITE/PIPE/B1', supportClass: 'REST', pos: { x: 9, y: 9, z: 9 } }));
  assert.equal((await validate(actual)).summary.countsByMatchState.UNEXPECTED_ACTUAL, 1);
}
{
  const actual = benchmarkFixture(); actual[0].children[0].attributes.REF = '=100/2'; actual[0].children[0].attributes.NAME = '/S-002.1';
  const report = await validate(actual); assert.ok(report.summary.countsByMatchState.DUPLICATE_IDENTITY >= 2); assert.equal(report.coverage.invariantsPassed, true);
}
{
  const actual = benchmarkFixture(); Object.assign(actual[0].children[0].attributes, { SUPPORT_TYPE: 'GUIDE', SUPPORT_KIND: 'GUIDE', SUPPORT_MAPPER_KIND: 'GUIDE' });
  assert.equal((await validate(actual)).summary.countsByMatchState.TYPE_MISMATCH, 1);
}
{
  const actual = benchmarkFixture(); actual[0].children[0].attributes.POS.x += 0.02;
  assert.equal((await validate(actual)).summary.countsByMatchState.POSITION_MISMATCH, 1);
}
{
  const actual = benchmarkFixture(); actual[0].children[0].attributes.ORI = 'Y is S and Z is U';
  const report = await validate(actual); assert.equal(report.summary.countsByMatchState.BLOCKED, 1); assert.equal(report.summary.status, 'BLOCKED');
}
{
  const actual = benchmarkFixture();
  actual[0].children.shift();
  actual[0].children[0].attributes.ORI = 'Y is S and Z is U';
  const report = await validate(actual);
  assert.equal(report.summary.countsByMatchState.MISSING_ACTUAL, 1);
  assert.equal(report.summary.countsByMatchState.BLOCKED, 1);
  assert.equal(report.summary.status, 'BLOCKED');
}
{
  const actual = benchmarkFixture(); actual[0].children[0].attributes.NODEGAP = '2';
  assert.equal((await validate(actual)).summary.countsByMatchState.PROPERTY_MISMATCH, 1);
}
{
  const reference = benchmarkFixture(); const actual = benchmarkFixture();
  for (const dataset of [reference, actual]) Object.assign(dataset[0].children[0].attributes, { SUPPORT_TYPE: '', SUPPORT_KIND: '', SUPPORT_MAPPER_KIND: '' });
  const blocked = await validateSupportBenchmark({ reference: loadedBenchmarkFixture(reference), actual: loadedBenchmarkFixture(actual), identityPolicy: identityPolicy(), toleranceProfile, propertyRules, normalizers });
  assert.equal(blocked.summary.countsByMatchState.BLOCKED, 1);
  const allowed = await validateSupportBenchmark({ reference: loadedBenchmarkFixture(reference), actual: loadedBenchmarkFixture(actual), identityPolicy: identityPolicy({ allowUnclassified: true }), toleranceProfile, propertyRules, normalizers });
  assert.equal(allowed.summary.countsByMatchState.EXACT_MATCH, 3);
}
{
  const actual = benchmarkFixture(); actual[0].children[0].attributes.HOST_REF = 'PIPE-999';
  assert.equal((await validate(actual)).summary.countsByMatchState.HOST_MISMATCH, 1);
}
{
  const actual = benchmarkFixture(); delete actual[0].children[0].attributes.HOST_REF;
  assert.equal((await validate(actual)).summary.countsByMatchState.ORPHAN_SUPPORT, 1);
}
{
  const policy = identityPolicy(); policy.identityStages[0].authority = 'APPROVED_EQUIVALENT';
  await assert.rejects(() => validate(benchmarkFixture(), { identityPolicy: policy }), /approvedEquivalentRuleId is required/);
}
{
  const reference = benchmarkFixture(); const actual = benchmarkFixture(); actual[0].children[0].attributes.REF = '=CHANGED'; actual[0].children[0].attributes.NAME = '/CHANGED';
  const policy = identityPolicy(); policy.identityStages[2].authority = 'DIAGNOSTIC_ONLY';
  const report = await validateSupportBenchmark({ reference: loadedBenchmarkFixture(reference), actual: loadedBenchmarkFixture(actual), identityPolicy: policy, toleranceProfile, propertyRules, normalizers, hostResolver: explicitHostResolver, hostRequired: true });
  const missing = report.ledgerEntries.find((entry) => entry.matchState === 'MISSING_ACTUAL'); const unexpected = report.ledgerEntries.find((entry) => entry.matchState === 'UNEXPECTED_ACTUAL');
  assert.equal(missing.identityResult.state, 'CANDIDATE_ONLY'); assert.equal(unexpected.identityResult.state, 'CANDIDATE_ONLY'); assert.equal(missing.identityResult.candidateRecordIds.length, 1); assert.equal(unexpected.identityResult.candidateRecordIds.length, 1);
}
{
  const actual = benchmarkFixture(); actual[0].children[0].attributes.ORI = 'equivalent orientation';
  const report = await validate(actual, { orientationComparator: () => ({ authorityId: 'TEST_ORIENTATION_POLICY', angularResidual: 0.25 }) });
  assert.equal(report.summary.countsByMatchState.EXACT_MATCH, 3);
}
{
  const actual = benchmarkFixture(); actual[0].children[0].attributes.ORI = 'different orientation';
  const report = await validate(actual, { orientationComparator: () => ({ authorityId: 'TEST_ORIENTATION_POLICY', angularResidual: 0.75 }) });
  assert.equal(report.summary.countsByMatchState.ORIENTATION_MISMATCH, 1);
}
{
  const actual = benchmarkFixture(); const report = await validate(actual, { hostResolver: ({ record }) => ({ state: 'RESOLVED', hostIdentity: record.attributes.HOST_REF }) });
  assert.equal(report.summary.countsByMatchState.BLOCKED, 3);
}
console.log('test-support-benchmark-failures: PASS');
