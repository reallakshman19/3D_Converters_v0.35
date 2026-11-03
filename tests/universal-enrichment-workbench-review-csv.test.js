import assert from 'node:assert/strict';
import test from 'node:test';
import { buildComparisonReviewCsv, ComparisonReviewCsvError } from '../tabs/universal-enrichment-workbench/review-csv.js';
import { createComparisonReviewLedger } from '../tabs/universal-enrichment-workbench/review-ledger.js';
import { normalizedUpstream, dependencies, drafts } from './universal-enrichment-workbench-review-fixtures.test.js';

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ',') { row.push(field); field = ''; continue; }
    if (!quoted && char === '\r' && text[index + 1] === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; index += 1; continue;
    }
    field += char;
  }
  return rows;
}

function typedLedger(values) {
  return {
    decisions: values.map((value, sourceOrder) => ({
      reviewDecisionId: `decision-${sourceOrder}`, sourceOrder, subjectKind: 'comparison-result',
      comparisonResultId: `result-${sourceOrder}`, entryId: `entry-${sourceOrder}`,
      candidateId: `candidate-${sourceOrder}`, entityId: 'entity', fieldKey: 'field', bindingId: 'binding',
      datasetId: 'dataset', columnId: 'column', comparisonStatus: 'unique-match', disposition: 'confirm-match',
      selectedMatch: { matchId: `match-${sourceOrder}`, rowId: `row-${sourceOrder}`, rowSourceOrder: sourceOrder,
        masterValue: value, normalizedMasterValue: value }, note: '',
    })),
  };
}

test('review CSV preserves deterministic ledger order and exact artifact evidence', async () => {
  const upstream = await normalizedUpstream();
  const draftMap = drafts([
    ['result:r1', 'confirm-match', 'm1', 'confirmed, explicitly'],
    ['result:r2', 'reject-result', '', 'Not accepted\r\nsecond line'],
  ], upstream);
  const ledger = await createComparisonReviewLedger(upstream, draftMap, dependencies);
  const csv = buildComparisonReviewCsv(ledger); const rows = parseCsv(csv);
  assert.equal(csv.endsWith('\r\n'), true); assert.equal(rows.length, ledger.decisions.length + 1);
  assert.deepEqual(rows.slice(1).map((row) => row[0]), ledger.decisions.map((row) => row.reviewDecisionId));
  assert.equal(rows[1][18], 'confirmed, explicitly'); assert.equal(rows[2][18], 'Not accepted\nsecond line');
  assert.equal(rows[1][16], JSON.stringify(ledger.decisions[0].selectedMatch.masterValue));
});

test('review CSV distinguishes null, empty, numeric/string zero and boolean/string false', () => {
  const values = [null, '', 0, '0', false, 'false'];
  const rows = parseCsv(buildComparisonReviewCsv(typedLedger(values)));
  assert.deepEqual(rows.slice(1).map((row) => row[16]), values.map((value) => JSON.stringify(value)));
  assert.deepEqual(rows.slice(1).map((row) => row[17]), values.map((value) => JSON.stringify(value)));
});

test('review CSV escapes commas, quotes, inch marks and embedded newlines', () => {
  const ledger = typedLedger(['4" SCH 40, A\nB']); ledger.decisions[0].note = 'He said "retain 2\"", then\nreview';
  const rows = parseCsv(buildComparisonReviewCsv(ledger));
  assert.equal(rows[1][16], '"4\\" SCH 40, A\\nB"');
  assert.equal(rows[1][18], 'He said "retain 2\"", then\nreview');
});

test('review CSV refuses more than 50,000 data rows without truncation', () => {
  const ledger = { decisions: Array.from({ length: 50001 }, (_, sourceOrder) => ({ sourceOrder })) };
  assert.throws(() => buildComparisonReviewCsv(ledger), (error) => error instanceof ComparisonReviewCsvError && error.code === 'CSV_ROW_LIMIT');
});
