import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEnrichmentProposalSet, validateEnrichmentProposalSet,
} from '../tabs/universal-enrichment-workbench/proposal-set.js';
import { deps, proposalFixture } from './universal-enrichment-workbench-proposal-fixtures.test.js';

const clone = (value) => structuredClone(value);

async function invalidAfter(mutator) {
  const upstream = proposalFixture(); const set = clone(await createEnrichmentProposalSet(upstream, deps));
  mutator(set, upstream); return validateEnrichmentProposalSet(set, upstream, deps);
}

test('rejects incorrect schema and stale graph/ledger/config/run/review/attachment identities', async () => {
  for (const [key, value] of [
    ['schema','Wrong.v1'],['sourceContentHash','stale'],['ledgerId','stale'],['bindingConfigId','stale'],
    ['comparisonRunId','stale'],['reviewLedgerId','stale'],['attachmentSetIdentity','stale'],
  ]) {
    const validation = await invalidAfter((set) => { set[key] = value; });
    assert.equal(validation.ok, false, key);
  }
});

test('rejects stale upstream review authority even when validation flags say valid', async () => {
  const upstream = proposalFixture(); const set = await createEnrichmentProposalSet(upstream, deps);
  const validation = await validateEnrichmentProposalSet(set, upstream, {
    ...deps, validateComparisonReviewLedger: async () => ({ ok: false, errors: ['stale row reference'], warnings: [] }),
  });
  assert.equal(validation.ok, false); assert.match(validation.errors.join('\n'), /stale row reference/);
});

test('rejects missing, extra, duplicated and reordered proposal projection', async () => {
  const missing = await invalidAfter((set) => { set.proposals.pop(); }); assert.equal(missing.ok, false);
  const extra = await invalidAfter((set) => { set.proposals.push({ ...set.proposals[0], sourceOrder: set.proposals.length }); }); assert.equal(extra.ok, false);
  const duplicate = await invalidAfter((set) => { set.proposals[1].proposalId = set.proposals[0].proposalId; }); assert.equal(duplicate.ok, false);
  const reordered = await invalidAfter((set) => { [set.proposals[0],set.proposals[1]] = [set.proposals[1],set.proposals[0]]; }); assert.equal(reordered.ok, false);
});

test('rejects missing, extra, duplicated and reordered exclusion projection', async () => {
  const missing = await invalidAfter((set) => { set.exclusions.pop(); }); assert.equal(missing.ok, false);
  const extra = await invalidAfter((set) => { set.exclusions.push({ ...set.exclusions[0], sourceOrder: set.exclusions.length }); }); assert.equal(extra.ok, false);
  const duplicate = await invalidAfter((set) => { set.exclusions[1].exclusionId = set.exclusions[0].exclusionId; }); assert.equal(duplicate.ok, false);
  const reordered = await invalidAfter((set) => { [set.exclusions[0],set.exclusions[1]] = [set.exclusions[1],set.exclusions[0]]; }); assert.equal(reordered.ok, false);
});

test('rejects missing, extra, duplicated and reordered groups', async () => {
  const missing = await invalidAfter((set) => { set.groups.pop(); }); assert.equal(missing.ok, false);
  const extra = await invalidAfter((set) => { set.groups.push({ ...set.groups[0], sourceOrder: set.groups.length }); }); assert.equal(extra.ok, false);
  const duplicate = await invalidAfter((set) => { set.groups[1].proposalGroupId = set.groups[0].proposalGroupId; }); assert.equal(duplicate.ok, false);
  const reordered = await invalidAfter((set) => { [set.groups[0],set.groups[1]] = [set.groups[1],set.groups[0]]; }); assert.equal(reordered.ok, false);
});

test('rejects candidate, selected-match, proposed-value, normalized-value and note tampering', async () => {
  for (const mutate of [
    (set) => { set.proposals[0].candidateValue = 'tampered'; },
    (set) => { set.proposals[0].matchId = 'foreign'; },
    (set) => { set.proposals[0].rowId = 'foreign'; },
    (set) => { set.proposals[0].proposedValue = 'tampered'; },
    (set) => { set.proposals[0].normalizedProposedValue = 'tampered'; },
    (set) => { set.proposals[0].reviewNote = 'tampered'; },
  ]) assert.equal((await invalidAfter(mutate)).ok, false);
});

test('rejects exclusion provenance, reason and note tampering', async () => {
  for (const mutate of [
    (set) => { set.exclusions[0].datasetId = 'different'; },
    (set) => { set.exclusions[0].columnId = 'different'; },
    (set) => { set.exclusions[0].reason = 'different'; },
    (set) => { set.exclusions[0].reviewNote = 'different'; },
  ]) assert.equal((await invalidAfter(mutate)).ok, false);
});

test('rejects group status, proposal order, counts and summary tampering', async () => {
  assert.equal((await invalidAfter((set) => { set.groups[1].status = 'conflicting-proposals'; })).ok, false);
  assert.equal((await invalidAfter((set) => { set.groups[1].proposalIds.reverse(); })).ok, false);
  assert.equal((await invalidAfter((set) => { set.groups[1].distinctValueCount = 2; })).ok, false);
  assert.equal((await invalidAfter((set) => { set.summary.proposalCount += 1; })).ok, false);
});

test('rejects recomputable proposal, exclusion, group and set identity mismatches', async () => {
  assert.equal((await invalidAfter((set) => { set.proposals[0].proposalId = 'bad'; })).ok, false);
  assert.equal((await invalidAfter((set) => { set.exclusions[0].exclusionId = 'bad'; })).ok, false);
  assert.equal((await invalidAfter((set) => { set.groups[0].proposalGroupId = 'bad'; })).ok, false);
  assert.equal((await invalidAfter((set) => { set.proposalSetId = 'bad'; })).ok, false);
});

test('rejects non-serializable evidence', async () => {
  const upstream = proposalFixture(); const set = clone(await createEnrichmentProposalSet(upstream, deps));
  set.proposals[0].bad = () => {};
  const validation = await validateEnrichmentProposalSet(set, upstream, deps);
  assert.equal(validation.ok, false); assert.match(validation.errors.join('\n'), /non-serializable function/);
});

test('hard-stops more than 50,000 review decisions without a partial artifact', async () => {
  const upstream = proposalFixture(); const template = upstream.reviewLedger.decisions[5];
  upstream.reviewLedger.decisions = Array.from({ length: 50001 }, (_, index) => ({ ...template, sourceOrder: index, reviewDecisionId: `d-${index}` }));
  await assert.rejects(() => createEnrichmentProposalSet(upstream, deps), (error) => error.code === 'REVIEW_DECISION_LIMIT');
});

test('hard-stops more than 10,000 proposals in one group before identity projection', async () => {
  const upstream = proposalFixture(); const template = upstream.reviewLedger.decisions[0];
  upstream.reviewLedger.decisions = Array.from({ length: 10001 }, (_, index) => ({ ...template, sourceOrder: index, reviewDecisionId: `d-${index}` }));
  await assert.rejects(() => createEnrichmentProposalSet(upstream, deps), (error) => error.code === 'GROUP_PROPOSAL_LIMIT');
});
