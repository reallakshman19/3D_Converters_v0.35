import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeSemanticHash } from '../contracts/topo-enriched-xml/contract-core.js';
import { buildApprovedRegistryBootstrap, serializeBootstrapArtifact } from '../node-history/bootstrap/bootstrap-result.js';
import { validateApprovedIdentityAssignments } from '../node-history/bootstrap/bootstrap-identity-assignments.js';
import { makeAllNewBootstrapInput, makeApprovedBootstrapInput } from './fixtures/node-history/bootstrap/bootstrap-fixture.mjs';

const APPROVED = new URL('../node-history/bootstrap/approved/PROJECT-TE012/ZONE-01/', import.meta.url);
const clone = structuredClone;

test('builds a complete approved mixed bootstrap and verifies the TE-005 patch', async () => {
  const input = await makeApprovedBootstrapInput();
  const result = await buildApprovedRegistryBootstrap(input);
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.registryPatch.validation.status, 'PASS');
  assert.equal(result.proposedManifest.validation.status, 'PASS');
  assert.equal(result.proposedLineHistories.length, 2);
  assert.equal(node(result, 'HN-A-100').lastObservedRevision, 'REV-003');
  assert.equal(node(result, 'HN-A-110').lifecycleStatus, 'REACTIVATED');
  assert.equal(node(result, 'HN-A-120').lifecycleStatus, 'RETIRED');
  assert.equal(node(result, 'HN-A-130').engineeringNodeNumber, 130);
  assert.equal(node(result, 'HN-B-510').engineeringNodeNumber, 510);
  assert.deepEqual(result.registryPatch.preconditions, [{
    type: 'SNAPSHOT_EQUALS', registrySnapshotHash: input.seedManifest.registrySnapshotHash,
  }]);
});

test('supports a valid empty-history seed with approved leases and all-new nodes', async () => {
  const result = await buildApprovedRegistryBootstrap(await makeAllNewBootstrapInput());
  assert.equal(result.validation.status, 'PASS');
  assert.deepEqual(result.proposedLineHistories.map((row) => row.historyNodes.length), [1, 1]);
  assert.deepEqual(result.registryPatch.operations.map((row) => row.type), ['ADD_NODE', 'ADD_NODE']);
});

test('is deterministic under shuffled non-authoritative input order and timestamp changes', async () => {
  const leftInput = await makeApprovedBootstrapInput();
  const rightInput = clone(leftInput);
  reverse(rightInput.currentLogicalNodes);
  reverse(rightInput.approvedIdentityAssignments);
  reverse(rightInput.seedLineHistories);
  reverse(rightInput.seedZoneRegistry.leases);
  reverse(rightInput.seedZoneRegistry.lineHistoryRefs);
  reverse(rightInput.revision.reactivations);
  reverse(rightInput.revision.retirements);
  rightInput.evaluatedAt = '2026-07-20T13:30:00Z';
  const left = await buildApprovedRegistryBootstrap(leftInput);
  const right = await buildApprovedRegistryBootstrap(rightInput);
  assert.equal(left.bootstrapResultHash, right.bootstrapResultHash);
  assert.deepEqual(left.proposedLineHistories, withoutAudit(right.proposedLineHistories, left.evaluatedAt));
  assert.equal(left.registryPatch.proposedRegistryHash, right.registryPatch.proposedRegistryHash);
});

test('does not mutate or freeze inputs and deeply freezes output', async () => {
  const input = await makeApprovedBootstrapInput();
  const before = clone(input);
  const result = await buildApprovedRegistryBootstrap(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.currentLogicalNodes[0]), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.proposedLineHistories[0].historyNodes[0]), true);
});

test('blocks missing and duplicate durable-history assignments atomically', async () => {
  const missing = await makeApprovedBootstrapInput();
  missing.approvedIdentityAssignments.pop();
  const missingResult = await buildApprovedRegistryBootstrap(missing);
  assertCode(missingResult, 'BOOTSTRAP_IDENTITY_ASSIGNMENT_MISSING');
  assertNoProposedArtifacts(missingResult);

  const duplicate = await makeApprovedBootstrapInput();
  duplicate.approvedIdentityAssignments[1].historyNodeId = duplicate.approvedIdentityAssignments[0].historyNodeId;
  const duplicateResult = await buildApprovedRegistryBootstrap(duplicate);
  assertCode(duplicateResult, 'BOOTSTRAP_IDENTITY_ASSIGNMENT_DUPLICATE');
  assertNoProposedArtifacts(duplicateResult);
});

test('blocks identity assignments for accepted historical matches and unapproved aliases', async () => {
  const conflict = await makeApprovedBootstrapInput();
  conflict.approvedIdentityAssignments.push({
    ...clone(conflict.approvedIdentityAssignments[0]), logicalNodeId: 'LN-A-100', historyNodeId: 'HN-OTHER',
  });
  assertCode(await buildApprovedRegistryBootstrap(conflict), 'BOOTSTRAP_IDENTITY_CONFLICT');

  const alias = await makeApprovedBootstrapInput();
  alias.approvedIdentityAssignments[0].sourceAliases = [];
  assertCode(await buildApprovedRegistryBootstrap(alias), 'BOOTSTRAP_UNAPPROVED_ALIAS');
});

test('blocks stale seed, match and allocation hashes', async () => {
  const seed = await makeApprovedBootstrapInput();
  seed.seedManifest = clone(seed.seedManifest);
  seed.seedManifest.registrySnapshotHash = fakeHash('1');
  assertCode(await buildApprovedRegistryBootstrap(seed), 'BOOTSTRAP_SEED_HASH_MISMATCH');

  const match = await makeApprovedBootstrapInput();
  match.historyMatchResult = clone(match.historyMatchResult);
  match.historyMatchResult.historyMatchResultHash = fakeHash('2');
  assertCode(await buildApprovedRegistryBootstrap(match), 'BOOTSTRAP_MATCH_RESULT_HASH_MISMATCH');

  const allocation = await makeApprovedBootstrapInput();
  allocation.allocationResult = clone(allocation.allocationResult);
  allocation.allocationResult.allocationResultHash = fakeHash('3');
  assertCode(await buildApprovedRegistryBootstrap(allocation), 'BOOTSTRAP_ALLOCATION_RESULT_HASH_MISMATCH');
});

test('blocks hash-chain drift and approval scope drift', async () => {
  const chain = await makeApprovedBootstrapInput();
  chain.allocationResult = clone(chain.allocationResult);
  chain.allocationResult.baseRegistrySnapshotHash = fakeHash('4');
  await rehashAllocation(chain);
  assertCode(await buildApprovedRegistryBootstrap(chain), 'BOOTSTRAP_HASH_CHAIN_MISMATCH');

  const approval = await makeApprovedBootstrapInput();
  approval.approval.approvedAllocationResultHash = fakeHash('5');
  assertCode(await buildApprovedRegistryBootstrap(approval), 'BOOTSTRAP_APPROVAL_SCOPE_MISMATCH');
});

test('blocks omitted and extra current, match or allocation rows', async () => {
  const omitted = await makeApprovedBootstrapInput();
  omitted.currentLogicalNodes.pop();
  assertCode(await buildApprovedRegistryBootstrap(omitted), 'BOOTSTRAP_RECONCILIATION_INCOMPLETE');

  const extra = await makeApprovedBootstrapInput();
  extra.allocationResult = clone(extra.allocationResult);
  extra.allocationResult.allocations.push({ ...extra.allocationResult.allocations[0], logicalNodeId: 'LN-EXTRA' });
  await rehashAllocation(extra);
  assertCode(await buildApprovedRegistryBootstrap(extra), 'BOOTSTRAP_RECONCILIATION_INCOMPLETE');
});

test('blocks partial and non-authoritative retirement materialization', async () => {
  const partial = await makeApprovedBootstrapInput();
  partial.coverage = { scope: 'PARTIAL_LINE', authoritativeForRetirement: false, coveredMainLines: ['/LINE-A'] };
  assertCode(await buildApprovedRegistryBootstrap(partial), 'PARTIAL_COVERAGE_RETIREMENT_PROHIBITED');

  const fullLine = await makeApprovedBootstrapInput();
  fullLine.coverage = { scope: 'FULL_LINE', authoritativeForRetirement: false, coveredMainLines: ['/LINE-A'] };
  assertCode(await buildApprovedRegistryBootstrap(fullLine), 'PARTIAL_COVERAGE_RETIREMENT_PROHIBITED');
});

test('restricts full-line retirement to explicitly covered lines', async () => {
  const input = await makeApprovedBootstrapInput();
  input.coverage = { scope: 'FULL_LINE', authoritativeForRetirement: true, coveredMainLines: ['/LINE-A'] };
  input.currentLogicalNodes = input.currentLogicalNodes.filter((row) => row.mainLineKey === '/LINE-A');
  input.historyMatchResult = clone(input.historyMatchResult);
  input.historyMatchResult.matches = input.historyMatchResult.matches.filter((row) => row.logicalNodeId.startsWith('LN-A-'));
  input.historyMatchResult.newNodes = input.historyMatchResult.newNodes.filter((row) => row.logicalNodeId.startsWith('LN-A-'));
  input.historyMatchResult.reactivated = input.historyMatchResult.reactivated.filter((row) => row.logicalNodeId.startsWith('LN-A-'));
  input.allocationResult = clone(input.allocationResult);
  input.allocationResult.leases = input.allocationResult.leases.filter((row) => row.mainLineKey === '/LINE-A');
  input.allocationResult.allocations = input.allocationResult.allocations.filter((row) => row.mainLineKey === '/LINE-A');
  input.approvedIdentityAssignments = input.approvedIdentityAssignments.filter((row) => row.mainLineKey === '/LINE-A');
  await rehashMatch(input);
  await refreshAssignmentApproval(input);
  const result = await buildApprovedRegistryBootstrap(input);
  assert.equal(result.validation.status, 'PASS', JSON.stringify(result.validation));
  assert.equal(node(result, 'HN-A-120').lifecycleStatus, 'RETIRED');
  assert.equal(node(result, 'HN-B-500').lifecycleStatus, 'ACTIVE');
});

test('blocks reactivation of a different identity and active-history renumbering', async () => {
  const reactivation = await makeApprovedBootstrapInput();
  reactivation.historyMatchResult = clone(reactivation.historyMatchResult);
  reactivation.historyMatchResult.reactivated[0].historyNodeId = 'HN-A-120';
  await rehashMatch(reactivation);
  reactivation.allocationResult = clone(reactivation.allocationResult);
  const row = reactivation.allocationResult.allocations.find((item) => item.logicalNodeId === 'LN-A-110');
  row.historyNodeId = 'HN-A-120'; row.engineeringNodeNumber = 120;
  reactivation.allocationResult.reactivations[0].historyNodeId = 'HN-A-120';
  reactivation.allocationResult.reactivations[0].engineeringNodeNumber = 120;
  await rehashAllocation(reactivation);
  assertCode(await buildApprovedRegistryBootstrap(reactivation), 'BOOTSTRAP_LIFECYCLE_CONFLICT');

  const renumber = await makeApprovedBootstrapInput();
  renumber.allocationResult = clone(renumber.allocationResult);
  renumber.allocationResult.allocations.find((item) => item.logicalNodeId === 'LN-A-100').engineeringNodeNumber = 140;
  await rehashAllocation(renumber);
  assertCode(await buildApprovedRegistryBootstrap(renumber), 'BOOTSTRAP_LIFECYCLE_CONFLICT');
});

test('blocks stale current-target approval before patch construction and emits no publication artifacts', async () => {
  const input = await makeApprovedBootstrapInput();
  input.approval.currentRegistrySnapshotHash = fakeHash('6');
  const result = await buildApprovedRegistryBootstrap(input);
  assertCode(result, 'BOOTSTRAP_APPROVAL_SCOPE_MISMATCH');
  assertNoProposedArtifacts(result);
});

test('reproduces the committed approved bootstrap byte-for-byte', async () => {
  const input = await makeApprovedBootstrapInput();
  const result = await buildApprovedRegistryBootstrap(input);
  const expected = new Map([
    ['bootstrap-input.json', input],
    ['zone-registry.json', result.proposedZoneRegistry],
    ['lines/LINE-A.json', result.proposedLineHistories.find((row) => row.mainLineKey === '/LINE-A')],
    ['lines/LINE-B.json', result.proposedLineHistories.find((row) => row.mainLineKey === '/LINE-B')],
    ['manifest.json', result.proposedManifest],
    ['registry-patch.json', result.registryPatch],
    ['bootstrap-result.json', result],
  ]);
  for (const [path, value] of expected) assert.equal(readFileSync(new URL(path, APPROVED), 'utf8'), serializeBootstrapArtifact(value), path);
});

test('production bootstrap files contain no matching, allocation or runtime write authority', () => {
  const files = [
    'bootstrap-input-validator.js', 'bootstrap-identity-assignments.js', 'bootstrap-line-history-builder.js',
    'bootstrap-registry-builder.js', 'bootstrap-result.js',
  ];
  const forbidden = [/matchExactHistoricalNodes\s*\(/, /matchRegisteredHistoricalNodes\s*\(/, /allocateZoneEngineeringNodes\s*\(/,
    /writeFile\s*\(/, /appendFile\s*\(/, /createWriteStream\s*\(/, /Math\.random\s*\(/, /Date\.now\s*\(/];
  for (const file of files) {
    const source = readFileSync(new URL(`../node-history/bootstrap/${file}`, import.meta.url), 'utf8');
    forbidden.forEach((pattern) => assert.doesNotMatch(source, pattern, `${file}: ${pattern}`));
  }
});

async function refreshAssignmentApproval(input) {
  const acceptedMatches = new Map([
    ...input.historyMatchResult.matches.map((row) => [row.logicalNodeId, { kind: 'MATCH', historyNodeId: row.historyNodeId }]),
    ...input.historyMatchResult.newNodes.map((row) => [row.logicalNodeId, { kind: 'NEW', historyNodeId: '' }]),
    ...input.historyMatchResult.reactivated.map((row) => [row.logicalNodeId, { kind: 'REACTIVATE', historyNodeId: row.historyNodeId }]),
  ]);
  const assignments = await validateApprovedIdentityAssignments({
    assignments: input.approvedIdentityAssignments,
    acceptedMatches,
    seedLineHistories: input.seedLineHistories,
    approval: input.approval,
  });
  input.approval.approvedIdentityAssignmentHash = assignments.assignmentHash;
}

async function rehashMatch(input) {
  input.historyMatchResult.historyMatchResultHash = await computeSemanticHash(input.historyMatchResult, 'historyMatchResultHash');
  input.approval.approvedHistoryMatchResultHash = input.historyMatchResult.historyMatchResultHash;
  input.allocationResult = clone(input.allocationResult);
  input.allocationResult.historyMatchResultHash = input.historyMatchResult.historyMatchResultHash;
  await rehashAllocation(input);
}
async function rehashAllocation(input) {
  input.allocationResult.allocationResultHash = await computeSemanticHash(input.allocationResult, 'allocationResultHash');
  input.approval.approvedAllocationResultHash = input.allocationResult.allocationResultHash;
}
function node(result, historyNodeId) { return result.proposedLineHistories.flatMap((row) => row.historyNodes).find((row) => row.historyNodeId === historyNodeId); }
function codes(result) { return result.validation.blockers.map((row) => row.code); }
function assertCode(result, code) { assert.ok(codes(result).includes(code), `${code}: ${codes(result).join(', ')}`); }
function assertNoProposedArtifacts(result) { assert.equal(result.proposedZoneRegistry, null); assert.deepEqual(result.proposedLineHistories, []); assert.equal(result.proposedManifest, null); assert.equal(result.registryPatch, null); }
function reverse(rows) { rows.reverse(); }
function fakeHash(char) { return `sha256:${char.repeat(64)}`; }
function withoutAudit(histories, evaluatedAt) { const copy = clone(histories); for (const row of copy) row.audit.evaluatedAt = evaluatedAt; return copy; }
