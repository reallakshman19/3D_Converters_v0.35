import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createComparisonReviewLedger, validateComparisonReviewLedger,
} from '../tabs/universal-enrichment-workbench/review-ledger.js';
import { validateComparisonReviewAuthority } from '../tabs/universal-enrichment-workbench/review-authority.js';
import { normalizedUpstream, dependencies, drafts } from './universal-enrichment-workbench-review-fixtures.test.js';

const clone = (value) => structuredClone(value);

async function validLedger() {
  const upstream = await normalizedUpstream();
  const ledger = await createComparisonReviewLedger(upstream, drafts([
    ['result:r1','confirm-match','m1','confirmed'],
    ['result:r3','confirm-match','m2','selected'],
  ], upstream), dependencies);
  return { upstream, ledger: clone(ledger) };
}

test('authority rejects stale graph, ledger, config, run and attachment identities', async () => {
  const cases = [
    (u) => { u.graph.contentHash = 'stale'; },
    (u) => { u.ledger.ledgerId = 'stale'; },
    (u) => { u.config.bindingConfigId = 'stale'; },
    (u) => { u.run.comparisonRunId = 'stale'; },
    (u) => { u.attachmentSet.attachments[0].datasetRole = 'custom'; },
  ];
  for (const mutate of cases) {
    const upstream = await normalizedUpstream(); mutate(upstream);
    const result = await validateComparisonReviewAuthority(upstream, dependencies);
    assert.equal(result.ok, false);
  }
});

test('authority rejects missing registry dataset, column and row references', async () => {
  const datasetMissing = await normalizedUpstream(); datasetMissing.registry.datasets = [];
  assert.equal((await validateComparisonReviewAuthority(datasetMissing, dependencies)).ok, false);
  const columnMissing = await normalizedUpstream(); columnMissing.registry.datasets[0].columns.pop();
  assert.equal((await validateComparisonReviewAuthority(columnMissing, dependencies)).ok, false);
  const rowMissing = await normalizedUpstream(); rowMissing.registry.datasets[0].rows.shift();
  assert.equal((await validateComparisonReviewAuthority(rowMissing, dependencies)).ok, false);
});



test('malformed authority arrays and status/count disagreement return findings without throwing', async () => {
  const malformed = await normalizedUpstream(); malformed.run.results = {};
  const result = await validateComparisonReviewAuthority(malformed, dependencies);
  assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /results must be an array/);
  const status = await normalizedUpstream(); status.run.results[0].status = 'multiple-match';
  const statusResult = await validateComparisonReviewAuthority(status, dependencies);
  assert.equal(statusResult.ok, false); assert.match(statusResult.errors.join('\n'), /status\/match-count mismatch/);
});

test('missing, extra, duplicate and reordered decisions are rejected', async () => {
  const { upstream, ledger } = await validLedger();
  const missing = clone(ledger); missing.decisions.pop();
  assert.match((await validateComparisonReviewLedger(missing, upstream, dependencies)).errors.join('\n'), /completely cover/);
  const extra = clone(ledger); extra.decisions.push(clone(extra.decisions[0]));
  assert.equal((await validateComparisonReviewLedger(extra, upstream, dependencies)).ok, false);
  const duplicate = clone(ledger); duplicate.decisions[1].reviewDecisionId = duplicate.decisions[0].reviewDecisionId;
  assert.match((await validateComparisonReviewLedger(duplicate, upstream, dependencies)).errors.join('\n'), /Duplicate review decision ID/);
  const reordered = clone(ledger); [reordered.decisions[0], reordered.decisions[1]] = [reordered.decisions[1], reordered.decisions[0]];
  assert.equal((await validateComparisonReviewLedger(reordered, upstream, dependencies)).ok, false);
});

test('foreign or missing selected matches and non-confirmed retained matches are rejected', async () => {
  const { upstream, ledger } = await validLedger();
  const foreign = clone(ledger); foreign.decisions[0].selectedMatch.matchId = 'm3';
  assert.match((await validateComparisonReviewLedger(foreign, upstream, dependencies)).errors.join('\n'), /does not belong|evidence mismatch/);
  const missing = clone(ledger); missing.decisions[0].selectedMatch = null;
  assert.match((await validateComparisonReviewLedger(missing, upstream, dependencies)).errors.join('\n'), /requires a selected match/);
  const retained = clone(ledger); retained.decisions[0].disposition = 'defer';
  assert.match((await validateComparisonReviewLedger(retained, upstream, dependencies)).errors.join('\n'), /retains a selected match/);
});

test('candidate, result, match, row and selected evidence tampering is rejected', async () => {
  const { upstream, ledger } = await validLedger();
  const decision = clone(ledger); decision.decisions[0].fieldKey = 'other';
  assert.equal((await validateComparisonReviewLedger(decision, upstream, dependencies)).ok, false);
  const result = await normalizedUpstream(); result.run.results[0].candidateValue = 'tampered';
  assert.equal((await validateComparisonReviewAuthority(result, dependencies)).ok, false);
  const match = await normalizedUpstream(); match.run.results[0].matches[0].masterValue = 'tampered';
  assert.equal((await validateComparisonReviewAuthority(match, dependencies)).ok, false);
  const normalized = await normalizedUpstream(); normalized.run.results[0].normalizedCandidate = 'tampered';
  assert.equal((await validateComparisonReviewAuthority(normalized, dependencies)).ok, false);
  const normalizedMatch = await normalizedUpstream(); normalizedMatch.run.results[0].matches[0].normalizedMasterValue = 'tampered';
  assert.equal((await validateComparisonReviewAuthority(normalizedMatch, dependencies)).ok, false);
  const row = await normalizedUpstream(); row.registry.datasets[0].rows[0].values.col1 = 'tampered';
  assert.equal((await validateComparisonReviewAuthority(row, dependencies)).ok, false);
});

test('invalid disposition and prohibited confirmation are rejected', async () => {
  const { upstream, ledger } = await validLedger();
  const invalid = clone(ledger); invalid.decisions[0].disposition = 'approve';
  assert.match((await validateComparisonReviewLedger(invalid, upstream, dependencies)).errors.join('\n'), /unsupported/);
  const unmatched = clone(ledger); unmatched.decisions[1].disposition = 'confirm-match'; unmatched.decisions[1].selectedMatch = clone(ledger.decisions[0].selectedMatch);
  assert.match((await validateComparisonReviewLedger(unmatched, upstream, dependencies)).errors.join('\n'), /cannot confirm/);
  const unbound = clone(ledger); unbound.decisions.at(-1).disposition = 'confirm-match';
  assert.match((await validateComparisonReviewLedger(unbound, upstream, dependencies)).errors.join('\n'), /cannot confirm|requires a selected match/);
});

test('note type, newline normalization, length and unreviewed decision language are validated', async () => {
  const { upstream, ledger } = await validLedger();
  const type = clone(ledger); type.decisions[0].note = 12;
  assert.match((await validateComparisonReviewLedger(type, upstream, dependencies)).errors.join('\n'), /note must be a string/);
  const newline = clone(ledger); newline.decisions[0].note = 'A\r\nB';
  assert.match((await validateComparisonReviewLedger(newline, upstream, dependencies)).errors.join('\n'), /newlines are not normalized/);
  const length = clone(ledger); length.decisions[0].note = '😀'.repeat(1001);
  assert.match((await validateComparisonReviewLedger(length, upstream, dependencies)).errors.join('\n'), /exceeds 1000/);
  const implied = clone(ledger); implied.decisions[1].note = 'confirmed later';
  assert.match((await validateComparisonReviewLedger(implied, upstream, dependencies)).errors.join('\n'), /implies a completed decision/);
});

test('summary, decision identity and ledger identity are independently recomputed', async () => {
  const { upstream, ledger } = await validLedger();
  const summary = clone(ledger); summary.summary.confirmedCount = 99;
  assert.match((await validateComparisonReviewLedger(summary, upstream, dependencies)).errors.join('\n'), /summary mismatch/);
  const decisionId = clone(ledger); decisionId.decisions[0].reviewDecisionId = 'bad';
  assert.match((await validateComparisonReviewLedger(decisionId, upstream, dependencies)).errors.join('\n'), /Decision 0 identity mismatch/);
  const ledgerId = clone(ledger); ledgerId.reviewLedgerId = 'bad';
  assert.match((await validateComparisonReviewLedger(ledgerId, upstream, dependencies)).errors.join('\n'), /Review ledger identity mismatch/);
});

test('non-serializable values are rejected', async () => {
  const { upstream, ledger } = await validLedger(); ledger.extra = () => {};
  const result = await validateComparisonReviewLedger(ledger, upstream, dependencies);
  assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /non-serializable function/);
});
