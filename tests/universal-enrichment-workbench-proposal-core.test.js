import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEnrichmentProposalSet, serializeEnrichmentProposalSet, summarizeEnrichmentProposalSet,
} from '../tabs/universal-enrichment-workbench/proposal-set.js';
import { deps, proposalFixture } from './universal-enrichment-workbench-proposal-fixtures.test.js';

test('projects confirm decisions and excludes every non-confirm decision exactly once', async () => {
  const upstream = proposalFixture(); const set = await createEnrichmentProposalSet(upstream, deps);
  assert.equal(set.validation.ok, true, set.validation.errors.join('\n'));
  assert.equal(set.proposals.length, 5); assert.equal(set.exclusions.length, 3);
  assert.deepEqual(set.proposals.map((item) => item.sourceOrder), [0,1,2,3,4]);
  assert.deepEqual(set.exclusions.map((item) => item.sourceOrder), [0,1,2]);
  assert.equal(set.summary.reviewDecisionCount, upstream.reviewLedger.decisions.length);
});

test('retains exact candidate, selected match, master row, proposed value and review note evidence', async () => {
  const set = await createEnrichmentProposalSet(proposalFixture(), deps); const proposal = set.proposals[0];
  assert.equal(proposal.candidateValue, 'A'); assert.equal(proposal.normalizedCandidate, 'A');
  assert.equal(proposal.matchId, 'match-1'); assert.equal(proposal.rowId, 'row-1');
  assert.equal(proposal.proposedValue, 'A'); assert.equal(proposal.normalizedProposedValue, 'A');
  assert.equal(proposal.reviewNote, 'review\nnote');
});

test('uses exact exclusion reasons and retains review notes', async () => {
  const set = await createEnrichmentProposalSet(proposalFixture(), deps);
  assert.deepEqual(set.exclusions.map((item) => item.reason), [
    'Review decision explicitly rejected the comparison result.',
    'Review decision remains unreviewed.',
    'Review decision was deferred.',
  ]);
  assert.deepEqual(set.exclusions.map((item) => item.reviewNote), ['rejected evidence','','later']);
});

test('classifies single, equivalent and conflicting groups without collapsing provenance', async () => {
  const set = await createEnrichmentProposalSet(proposalFixture(), deps);
  assert.deepEqual(set.groups.map((item) => item.status), ['single-proposal','equivalent-proposals','conflicting-proposals']);
  assert.deepEqual(set.groups.map((item) => item.proposalCount), [1,2,2]);
  assert.equal(set.groups[1].proposalIds.length, 2); assert.equal(set.groups[2].distinctValueCount, 2);
});

test('normalized values do not erase exact primitive type conflicts', async () => {
  const set = await createEnrichmentProposalSet(proposalFixture(), deps);
  const conflicting = set.groups.find((item) => item.status === 'conflicting-proposals');
  const values = conflicting.proposalIds.map((id) => set.proposals.find((item) => item.proposalId === id).proposedValue);
  assert.deepEqual(values, ['2', 2]);
});

test('group order follows first proposal order', async () => {
  const set = await createEnrichmentProposalSet(proposalFixture(), deps);
  assert.deepEqual(set.groups.map((item) => [item.sourceOrder,item.entityId,item.fieldKey]), [
    [0,'entity-1','single'],[1,'entity-2','equiv'],[2,'entity-3','conflict'],
  ]);
});

test('identical authority produces deterministic identities', async () => {
  const first = await createEnrichmentProposalSet(proposalFixture(), deps);
  const second = await createEnrichmentProposalSet(proposalFixture(), deps);
  assert.equal(first.proposalSetId, second.proposalSetId);
  assert.deepEqual(first.proposals.map((item) => item.proposalId), second.proposals.map((item) => item.proposalId));
  assert.deepEqual(first.exclusions.map((item) => item.exclusionId), second.exclusions.map((item) => item.exclusionId));
  assert.deepEqual(first.groups.map((item) => item.proposalGroupId), second.groups.map((item) => item.proposalGroupId));
});

test('decision, match and note evidence changes appropriate identities', async () => {
  const firstUpstream = proposalFixture(); const first = await createEnrichmentProposalSet(firstUpstream, deps);
  const secondUpstream = proposalFixture(); secondUpstream.reviewLedger.decisions[0].note = 'changed';
  const second = await createEnrichmentProposalSet(secondUpstream, deps);
  assert.notEqual(first.proposals[0].proposalId, second.proposals[0].proposalId);
  assert.notEqual(first.groups[0].proposalGroupId, second.groups[0].proposalGroupId);
  assert.notEqual(first.proposalSetId, second.proposalSetId);
});

test('artifact is deeply immutable and serializes exactly', async () => {
  const set = await createEnrichmentProposalSet(proposalFixture(), deps);
  assert.equal(Object.isFrozen(set), true); assert.equal(Object.isFrozen(set.proposals), true);
  assert.equal(Object.isFrozen(set.groups[1].proposalIds), true);
  assert.deepEqual(JSON.parse(serializeEnrichmentProposalSet(set)), set);
  assert.deepEqual(summarizeEnrichmentProposalSet(set), set.summary);
});

test('upstream artifacts remain byte-for-byte unchanged', async () => {
  const upstream = proposalFixture(); const before = JSON.stringify(upstream);
  await createEnrichmentProposalSet(upstream, deps); assert.equal(JSON.stringify(upstream), before);
});
