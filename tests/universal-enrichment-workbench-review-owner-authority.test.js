import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createComparisonIdentity,
  graphComparisonIdentity,
} from '../tabs/universal-enrichment-workbench/comparison-identity.js';
import {
  summarizeCandidateComparisonRun,
} from '../tabs/universal-enrichment-workbench/comparison-run.js';
import {
  validateComparisonReviewAuthority,
} from '../tabs/universal-enrichment-workbench/review-authority.js';
import {
  createComparisonReviewSubjects,
} from '../tabs/universal-enrichment-workbench/review-ledger.js';
import {
  dependencies,
  hashText,
  normalizedUpstream,
} from './universal-enrichment-workbench-review-fixtures.test.js';

async function refreshRunIdentity(upstream) {
  upstream.run.summary = summarizeCandidateComparisonRun(upstream.run);
  upstream.run.comparisonRunId = await createComparisonIdentity('candidate-comparison-run', {
    graph: graphComparisonIdentity(upstream.graph),
    ledgerId: upstream.ledger.ledgerId,
    bindingConfigId: upstream.config.bindingConfigId,
    attachmentSetIdentity: upstream.run.attachmentSetIdentity,
    results: upstream.run.results,
    unbound: upstream.run.unbound,
  }, hashText);
}

test('review authority independently revalidates attached dataset content', async () => {
  const upstream = await normalizedUpstream();
  let calls = 0;
  const validation = await validateComparisonReviewAuthority(upstream, {
    ...dependencies,
    validateMasterDataset: async () => {
      calls += 1;
      return { ok: false, errors: ['Dataset identity does not match normalized content.'], warnings: [] };
    },
  });
  assert.equal(calls, 1);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /Dataset d1: Dataset identity/);
});

test('review authority rejects an identity-consistent run that omits a matching row', async () => {
  const upstream = await normalizedUpstream();
  const result = upstream.run.results[2];
  result.matches.pop();
  result.status = 'unique-match';
  await refreshRunIdentity(upstream);
  const validation = await validateComparisonReviewAuthority(upstream, dependencies);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /complete authoritative projection/);
});

test('review authority rejects an identity-consistent nonmatching retained row', async () => {
  const upstream = await normalizedUpstream();
  const result = upstream.run.results[0];
  const row = upstream.registry.datasets[0].rows[1];
  const masterValue = row.values[result.columnId];
  result.matches = [{
    matchId: await createComparisonIdentity('candidate-master-match', {
      comparisonResultId: result.comparisonResultId,
      datasetId: result.datasetId,
      rowId: row.rowId,
      columnId: result.columnId,
      masterValue,
      normalizedMasterValue: masterValue,
    }, hashText),
    rowId: row.rowId,
    rowSourceOrder: row.sourceOrder,
    masterValue,
    normalizedMasterValue: masterValue,
  }];
  result.status = 'unique-match';
  await refreshRunIdentity(upstream);
  const validation = await validateComparisonReviewAuthority(upstream, dependencies);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /complete authoritative projection/);
});

test('malformed comparison arrays produce no review subjects before diagnostics', () => {
  assert.deepEqual(createComparisonReviewSubjects({ results: {}, unbound: {} }), []);
});
