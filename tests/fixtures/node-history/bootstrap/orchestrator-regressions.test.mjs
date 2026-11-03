import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSemanticHash } from '../../../../contracts/topo-enriched-xml/contract-core.js';
import { buildApprovedRegistryBootstrap } from '../../../../node-history/bootstrap/bootstrap-result.js';
import { validateApprovedIdentityAssignments } from '../../../../node-history/bootstrap/bootstrap-identity-assignments.js';
import { makeApprovedBootstrapInput } from './bootstrap-fixture.mjs';

const clone = structuredClone;

test('requires independent current-target and commit approval evidence', async () => {
  const missingTarget = await makeApprovedBootstrapInput();
  delete missingTarget.approval.currentRegistrySnapshotHash;
  const missingResult = await buildApprovedRegistryBootstrap(missingTarget);
  assertCode(missingResult, 'BOOTSTRAP_APPROVAL_MISSING');
  assertNoArtifacts(missingResult);

  const invalidCommit = await makeApprovedBootstrapInput();
  invalidCommit.approval.baseRegistryCommit = 'not-a-commit';
  const commitResult = await buildApprovedRegistryBootstrap(invalidCommit);
  assertCode(commitResult, 'BOOTSTRAP_APPROVAL_SCOPE_MISMATCH');
  assertNoArtifacts(commitResult);
});

test('binds lifecycle evidence to the approved revision and authority', async () => {
  const revision = await makeApprovedBootstrapInput();
  revision.revision.retirements[0].revisionId = 'REV-OLD';
  assertCode(await buildApprovedRegistryBootstrap(revision), 'BOOTSTRAP_APPROVAL_SCOPE_MISMATCH');

  const authority = await makeApprovedBootstrapInput();
  authority.revision.reactivations[0].authority = 'UNAPPROVED_AUTHORITY';
  assertCode(await buildApprovedRegistryBootstrap(authority), 'BOOTSTRAP_APPROVAL_SCOPE_MISMATCH');
});

test('requires exact matcher, allocator and revision lifecycle reconciliation', async () => {
  const missingCandidate = await makeApprovedBootstrapInput();
  missingCandidate.historyMatchResult = clone(missingCandidate.historyMatchResult);
  missingCandidate.historyMatchResult.retirementCandidates = [];
  await rehashMatchChain(missingCandidate);
  assertCode(await buildApprovedRegistryBootstrap(missingCandidate), 'BOOTSTRAP_LIFECYCLE_CONFLICT');

  const duplicateReactivation = await makeApprovedBootstrapInput();
  duplicateReactivation.allocationResult = clone(duplicateReactivation.allocationResult);
  duplicateReactivation.allocationResult.reactivations.push(clone(duplicateReactivation.allocationResult.reactivations[0]));
  await rehashAllocation(duplicateReactivation);
  assertCode(await buildApprovedRegistryBootstrap(duplicateReactivation), 'BOOTSTRAP_LIFECYCLE_CONFLICT');
});

test('blocks retirement of a currently accepted history identity', async () => {
  const input = await makeApprovedBootstrapInput();
  input.historyMatchResult = clone(input.historyMatchResult);
  input.historyMatchResult.retirementCandidates.push({
    historyNodeId: 'HN-A-100', mainLineKey: '/LINE-A',
    disposition: 'RETIREMENT_CANDIDATE_ONLY', reason: 'CONTRADICTORY_CURRENT_RETIREMENT',
  });
  input.allocationResult = clone(input.allocationResult);
  input.allocationResult.retirements.push({
    historyNodeId: 'HN-A-100', mainLineKey: '/LINE-A', engineeringNodeNumber: 100,
    disposition: 'RETIREMENT_INTENT_ONLY', reason: 'CONTRADICTORY_CURRENT_RETIREMENT',
  });
  input.revision.retirements.push({
    historyNodeId: 'HN-A-100', authority: input.approval.authority,
    revisionId: input.revision.revisionId, reason: 'Contradictory current retirement',
  });
  await rehashMatchChain(input);
  assertCode(await buildApprovedRegistryBootstrap(input), 'BOOTSTRAP_LIFECYCLE_CONFLICT');
});

test('blocks allocation-kind drift and ambiguous durable aliases', async () => {
  const kind = await makeApprovedBootstrapInput();
  kind.allocationResult = clone(kind.allocationResult);
  kind.allocationResult.allocations.find((row) => row.logicalNodeId === 'LN-A-NEW').allocationKind = 'HISTORICAL_PRESERVE';
  await rehashAllocation(kind);
  assertCode(await buildApprovedRegistryBootstrap(kind), 'BOOTSTRAP_HASH_CHAIN_MISMATCH');

  const alias = await makeApprovedBootstrapInput();
  alias.approvedIdentityAssignments[0].sourceAliases = ['SRC-A-100'];
  alias.approvedIdentityAssignments[0].identityEvidence[0].value = 'SRC-A-100';
  await refreshAssignmentHash(alias);
  assertCode(await buildApprovedRegistryBootstrap(alias), 'BOOTSTRAP_IDENTITY_CONFLICT');
});

test('requires a valid declared source root', async () => {
  const input = await makeApprovedBootstrapInput();
  input.sourceInventory.sourceIdentity.sourceHash = 'not-a-hash';
  const result = await buildApprovedRegistryBootstrap(input);
  assertCode(result, 'BOOTSTRAP_RECONCILIATION_INCOMPLETE');
  assertNoArtifacts(result);
});

async function rehashMatchChain(input) {
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

async function refreshAssignmentHash(input) {
  const acceptedMatches = new Map([
    ...input.historyMatchResult.matches.map((row) => [row.logicalNodeId, { kind: 'MATCH', historyNodeId: row.historyNodeId }]),
    ...input.historyMatchResult.newNodes.map((row) => [row.logicalNodeId, { kind: 'NEW', historyNodeId: '' }]),
    ...input.historyMatchResult.reactivated.map((row) => [row.logicalNodeId, { kind: 'REACTIVATE', historyNodeId: row.historyNodeId }]),
  ]);
  const result = await validateApprovedIdentityAssignments({
    assignments: input.approvedIdentityAssignments,
    acceptedMatches,
    seedLineHistories: input.seedLineHistories,
    approval: input.approval,
  });
  input.approval.approvedIdentityAssignmentHash = result.assignmentHash;
}

function codes(result) { return result.validation.blockers.map((row) => row.code); }
function assertCode(result, code) { assert.ok(codes(result).includes(code), `${code}: ${codes(result).join(', ')}`); }
function assertNoArtifacts(result) {
  assert.equal(result.proposedZoneRegistry, null);
  assert.deepEqual(result.proposedLineHistories, []);
  assert.equal(result.proposedManifest, null);
  assert.equal(result.registryPatch, null);
}
