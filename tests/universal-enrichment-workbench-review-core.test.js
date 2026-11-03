import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ComparisonReviewBuildError, createComparisonReviewLedger,
  createComparisonReviewSubjects, validateComparisonReviewLedger,
} from '../tabs/universal-enrichment-workbench/review-ledger.js';
import { normalizedUpstream, dependencies, drafts } from './universal-enrichment-workbench-review-fixtures.test.js';
test('default projection covers all results then unbound without automatic confirmation', async () => {
  const upstream = await normalizedUpstream(); const artifact = await createComparisonReviewLedger(upstream, {}, dependencies);
  assert.equal(artifact.validation.ok, true, artifact.validation.errors.join('\n'));
  assert.equal(artifact.decisions.length, upstream.run.results.length + upstream.run.unbound.length);
  assert.deepEqual(artifact.decisions.map((row) => row.sourceOrder), [0,1,2,3,4]);
  assert.equal(artifact.decisions.every((row) => row.disposition === 'unreviewed'), true);
  assert.equal(artifact.decisions[0].selectedMatch, null);
  assert.equal(artifact.decisions.at(-1).subjectKind, 'unbound-candidate');
});

test('decision and ledger identities are deterministic and evidence-sensitive', async () => {
  const upstream = await normalizedUpstream();
  const first = await createComparisonReviewLedger(upstream, {}, dependencies);
  const second = await createComparisonReviewLedger(upstream, {}, dependencies);
  assert.deepEqual(first, second);
  const changed = await createComparisonReviewLedger(upstream, drafts([['result:r1','reject-result','','reviewed']], upstream), dependencies);
  assert.notEqual(first.reviewLedgerId, changed.reviewLedgerId);
  assert.notEqual(first.decisions[0].reviewDecisionId, changed.decisions[0].reviewDecisionId);
});

test('unique and multiple matches require explicit exact selections', async () => {
  const upstream = await normalizedUpstream(); const before = JSON.stringify(upstream.run);
  const artifact = await createComparisonReviewLedger(upstream, drafts([
    ['result:r1','confirm-match','m1','explicit unique'],
    ['result:r3','confirm-match','m3','explicit multiple'],
  ], upstream), dependencies);
  assert.equal(artifact.validation.ok, true, artifact.validation.errors.join('\n'));
  assert.equal(artifact.decisions[0].selectedMatch.matchId, upstream.run.results[0].matches[0].matchId);
  assert.equal(artifact.decisions[2].selectedMatch.matchId, upstream.run.results[2].matches[1].matchId);
  assert.equal(upstream.run.results[2].matches.length, 2);
  assert.equal(JSON.stringify(upstream.run), before);
});

test('reject and defer retain no selected match', async () => {
  const upstream = await normalizedUpstream();
  const artifact = await createComparisonReviewLedger(upstream, drafts([
    ['result:r1','reject-result','m1','rejected'], ['result:r3','defer','m2','later'],
  ], upstream), dependencies);
  assert.equal(artifact.validation.ok, true, artifact.validation.errors.join('\n'));
  assert.equal(artifact.decisions[0].selectedMatch, null);
  assert.equal(artifact.decisions[2].selectedMatch, null);
});

test('confirmation is prohibited for unmatched and unbound evidence', async () => {
  const upstream = await normalizedUpstream();
  const artifact = await createComparisonReviewLedger(upstream, drafts([
    ['result:r2','confirm-match','m1'], ['unbound:e3:c3','confirm-match','m1'],
  ], upstream), dependencies);
  assert.equal(artifact.validation.ok, false);
  assert.match(artifact.validation.errors.join('\n'), /cannot confirm|requires a selected match/);
});

test('notes normalize only newlines and artifact is deeply immutable', async () => {
  const upstream = await normalizedUpstream();
  const artifact = await createComparisonReviewLedger(upstream, drafts([
    ['result:r1','defer','','A\r\nB\rC'],
  ], upstream), dependencies);
  assert.equal(artifact.decisions[0].note, 'A\nB\nC');
  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.decisions), true);
  assert.equal(Object.isFrozen(artifact.decisions[0]), true);
});

test('validation round-trip proves complete immutable projection', async () => {
  const upstream = await normalizedUpstream(); const artifact = await createComparisonReviewLedger(upstream, {}, dependencies);
  const validation = await validateComparisonReviewLedger(JSON.parse(JSON.stringify(artifact)), upstream, dependencies);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
});

test('note and subject hard limits fail without a partial valid artifact', async () => {
  const upstream = await normalizedUpstream();
  await assert.rejects(
    createComparisonReviewLedger(upstream, drafts([['result:r1','defer','', 'x'.repeat(1001)]], upstream), dependencies),
    (error) => error instanceof ComparisonReviewBuildError && error.code === 'NOTE_LIMIT',
  );
  const huge = await normalizedUpstream(); huge.ledger.entries = []; huge.run.results = []; huge.run.unbound = [];
  huge.config.bindings = [];
  for (let index = 0; index < 50001; index += 1) {
    const entryId = `e-${index}`; const candidateId = `c-${index}`;
    huge.ledger.entries.push({ entryId, sourceOrder: index, entityId: 'node-1', fieldKey: `f-${index}`, status: 'candidate', candidates: [{ candidateId, value: index }] });
    huge.run.unbound.push({ sourceOrder: index, entryId, candidateId, entityId: 'node-1', fieldKey: `f-${index}`, reason: 'No enabled binding exists for this field key.' });
  }
  await assert.rejects(createComparisonReviewLedger(huge, {}, dependencies), (error) => error.code === 'SUBJECT_LIMIT');
});
