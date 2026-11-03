import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidateComparisonCsv, buildCandidateMatchCsv } from '../tabs/universal-enrichment-workbench/comparison-csv.js';

const run = {
  results: [{
    comparisonResultId: 'result-1', sourceOrder: 0, entryId: 'entry-1', candidateId: 'candidate-1',
    entityId: 'entity-1', fieldKey: 'size', bindingId: 'binding-1', datasetId: 'dataset-1',
    columnId: 'column-1', candidateValue: '4" SCH 40\nnext', normalizedCandidate: '4" SCH 40 next',
    status: 'unique-match', matches: [{
      matchId: 'match-1', rowId: 'row-1', rowSourceOrder: 0,
      masterValue: '4" SCH 40,next', normalizedMasterValue: '4" sch 40,next',
    }],
  }],
  unbound: [{
    sourceOrder: 0, entryId: 'entry-2', candidateId: 'candidate-2',
    entityId: 'entity-2', fieldKey: 'empty', reason: 'No enabled binding exists for this field key.',
  }],
};

test('comparison CSV preserves exact null/empty/quote/newline evidence', () => {
  const text = buildCandidateComparisonCsv(run);
  assert.ok(text.includes('"4"" SCH 40\nnext"'));
  assert.ok(text.includes(',unbound,0'));
  assert.ok(text.endsWith('\r\n'));
});

test('match CSV preserves deterministic row evidence and inch marks', () => {
  const text = buildCandidateMatchCsv(run);
  assert.ok(text.startsWith('comparison_result_id,match_id'));
  assert.ok(text.includes('"4"" SCH 40,next"'));
  assert.ok(text.includes(',row-1,0,'));
  assert.ok(text.endsWith('\r\n'));
});
