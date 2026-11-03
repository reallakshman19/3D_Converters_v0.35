import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEnrichmentExclusionCsv, buildEnrichmentProposalCsv, buildEnrichmentProposalGroupCsv,
} from '../tabs/universal-enrichment-workbench/proposal-csv.js';

function proposal(value, normalized, sourceOrder = 0) {
  return { proposalId: `p-${sourceOrder}`, sourceOrder, reviewDecisionId: `d-${sourceOrder}`,
    comparisonResultId: `r-${sourceOrder}`, entryId: `e-${sourceOrder}`, candidateId: `c-${sourceOrder}`,
    entityId: 'entity,1', fieldKey: 'size', bindingId: 'b', datasetId: 'dataset', columnId: 'column',
    matchId: 'm', rowId: 'row', rowSourceOrder: sourceOrder, candidateValue: value,
    normalizedCandidate: normalized, proposedValue: value, normalizedProposedValue: normalized,
    reviewNote: 'note "quoted"\nnext' };
}

test('proposal CSV preserves null, empty, numeric, string and Boolean distinctions', () => {
  const values = [[null,null],['',''],[0,0],['0','0'],[false,false],['false','false']];
  const csv = buildEnrichmentProposalCsv({ proposals: values.map(([value, normalized], index) => proposal(value, normalized, index)) });
  const rows = csv.trimEnd().split('\r\n');
  assert.equal(rows.length, 7);
  assert.match(rows[1], /,null,null,null,null,/);
  assert.ok(rows[2].includes('""""""'));
  assert.match(rows[3], /,0,0,0,0,/);
  assert.match(rows[4], /,"""0""","""0""","""0""","""0""",/);
  assert.match(rows[5], /,false,false,false,false,/);
  assert.match(rows[6], /,"""false""","""false""","""false""","""false""",/);
});

test('proposal CSV uses RFC escaping and CRLF while preserving inch marks and newlines', () => {
  const item = proposal('4" SCH 40, pipe', '4" SCH 40, pipe');
  const csv = buildEnrichmentProposalCsv({ proposals: [item] });
  assert.ok(csv.endsWith('\r\n')); assert.ok(csv.includes('4\\"" SCH 40, pipe'));
  assert.match(csv, /"note ""quoted""\nnext"/);
});

test('group CSV preserves deterministic proposal order', () => {
  const csv = buildEnrichmentProposalGroupCsv({ groups: [{ proposalGroupId: 'g', sourceOrder: 0,
    entityId: 'e', fieldKey: 'f', status: 'equivalent-proposals', proposalCount: 2,
    distinctValueCount: 1, proposalIds: ['p-1','p-2'] }] });
  assert.match(csv, /"\[""p-1"",""p-2""\]"/);
});

test('exclusion CSV preserves dataset provenance, exact reason, quotes and commas', () => {
  const csv = buildEnrichmentExclusionCsv({ exclusions: [{ exclusionId: 'x', sourceOrder: 0,
    reviewDecisionId: 'd', subjectKind: 'comparison-result', comparisonResultId: 'r', entryId: 'e',
    candidateId: 'c', entityId: 'entity', fieldKey: 'field', bindingId: 'binding-a',
    datasetId: 'dataset-a', columnId: 'column-a', disposition: 'defer',
    reason: 'Review decision was deferred.', reviewNote: '2" item, later\nline' }] });
  assert.match(csv, /binding_id,dataset_id,column_id/); assert.match(csv, /binding-a,dataset-a,column-a/);
  assert.match(csv, /"2"" item, later\nline"/); assert.ok(csv.endsWith('\r\n'));
});

test('CSV row hard stop rejects 50,001 rows without truncation', () => {
  const proposals = Array.from({ length: 50001 }, (_, index) => proposal('A','A',index));
  assert.throws(() => buildEnrichmentProposalCsv({ proposals }), (error) => error.code === 'CSV_ROW_LIMIT');
});
