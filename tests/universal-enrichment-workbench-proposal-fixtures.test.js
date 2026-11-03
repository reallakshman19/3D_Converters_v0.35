import { createHash } from 'node:crypto';

export const hashText = async (value) => createHash('sha256').update(String(value ?? '')).digest('hex');
export const validReview = async () => ({ ok: true, errors: [], warnings: [] });
export const deps = { hashText, validateComparisonReviewLedger: validReview };

function graphFields() {
  return { sourceFileId: 'source-a', sourceRevision: 1, sourceContentHash: 'graph-hash', sourceGraphSchema: 'UniversalSourceGraph.v1' };
}

function result(id, sourceOrder, entryId, candidateId, entityId, fieldKey, value, normalized, match) {
  return { comparisonResultId: id, sourceOrder, entryId, candidateId, entityId, fieldKey,
    bindingId: `binding-${id}`, datasetId: 'dataset-a', columnId: 'column-a',
    candidateValue: value, normalizedCandidate: normalized, status: match ? 'unique-match' : 'unmatched',
    matches: match ? [match] : [] };
}

function match(id, rowId, rowSourceOrder, value, normalized = value) {
  return { matchId: id, rowId, rowSourceOrder, masterValue: value, normalizedMasterValue: normalized };
}

function decision(resultRow, sourceOrder, disposition, selectedMatch = null, note = '') {
  return { reviewDecisionId: `decision-${sourceOrder}`, sourceOrder, subjectKind: 'comparison-result',
    comparisonResultId: resultRow.comparisonResultId, entryId: resultRow.entryId, candidateId: resultRow.candidateId,
    entityId: resultRow.entityId, fieldKey: resultRow.fieldKey, bindingId: resultRow.bindingId,
    datasetId: resultRow.datasetId, columnId: resultRow.columnId, comparisonStatus: resultRow.status,
    disposition, selectedMatch, note };
}

export function proposalFixture() {
  const graph = { schema: 'UniversalSourceGraph.v1', sourceFileId: 'source-a', sourceRevision: 1,
    contentHash: 'graph-hash', entities: [], validation: { ok: true, errors: [], warnings: [] } };
  const rows = [
    result('result-1',0,'entry-1','candidate-1','entity-1','single','A','A',match('match-1','row-1',0,'A')),
    result('result-2',1,'entry-2','candidate-2','entity-2','equiv','x','x',match('match-2','row-2',1,'X','x')),
    result('result-3',2,'entry-3','candidate-3','entity-2','equiv','x','x',match('match-3','row-3',2,'X','x')),
    result('result-4',3,'entry-4','candidate-4','entity-3','conflict','2','2',match('match-4','row-4',3,'2','2')),
    result('result-5',4,'entry-5','candidate-5','entity-3','conflict',2,'2',match('match-5','row-5',4,2,'2')),
    result('result-6',5,'entry-6','candidate-6','entity-4','rejected','Q','Q',null),
    result('result-7',6,'entry-7','candidate-7','entity-5','pending','P','P',match('match-7','row-7',6,'P')),
  ];
  const unbound = [{ sourceOrder: 0, entryId: 'entry-8', candidateId: 'candidate-8', entityId: 'entity-6', fieldKey: 'unbound', reason: 'No enabled binding exists for this field key.' }];
  const ledger = { schema: 'FieldCandidateLedger.v1', ledgerId: 'ledger-a', ...graphFields(), entries: [], validation: { ok: true, errors: [], warnings: [] } };
  const config = { schema: 'MasterFieldBindingConfig.v1', bindingConfigId: 'config-a', ledgerId: 'ledger-a', attachmentSetIdentity: 'attachment-a', ...graphFields(), bindings: [], validation: { ok: true, errors: [], warnings: [] } };
  const run = { schema: 'CandidateComparisonRun.v1', comparisonRunId: 'run-a', ledgerId: 'ledger-a', bindingConfigId: 'config-a', attachmentSetIdentity: 'attachment-a', ...graphFields(), results: rows, unbound, validation: { ok: true, errors: [], warnings: [] } };
  const decisions = rows.slice(0,5).map((row, index) => decision(row, index, 'confirm-match', row.matches[0], index === 0 ? 'review\nnote' : ''));
  decisions.push(decision(rows[5],5,'reject-result',null,'rejected evidence'));
  decisions.push(decision(rows[6],6,'unreviewed'));
  decisions.push({ reviewDecisionId: 'decision-7', sourceOrder: 7, subjectKind: 'unbound-candidate',
    comparisonResultId: '', entryId: 'entry-8', candidateId: 'candidate-8', entityId: 'entity-6', fieldKey: 'unbound',
    bindingId: '', datasetId: '', columnId: '', comparisonStatus: 'unbound', disposition: 'defer', selectedMatch: null, note: 'later' });
  const reviewLedger = { schema: 'ComparisonReviewLedger.v1', reviewLedgerId: 'review-a', ledgerId: 'ledger-a', bindingConfigId: 'config-a', comparisonRunId: 'run-a', attachmentSetIdentity: 'attachment-a', ...graphFields(), decisions, validation: { ok: true, errors: [], warnings: [] } };
  const attachmentSet = { schema: 'MasterAttachmentSet.v1', attachmentSetIdentity: 'attachment-a', ...graphFields(), attachments: [{ datasetId: 'dataset-a', datasetRole: 'line-list', attachmentOrder: 0 }], validation: { ok: true, errors: [], warnings: [] } };
  const registry = { datasets: [{ schema: 'MasterDataset.v1', datasetId: 'dataset-a', datasetRole: 'line-list', contentHash: 'dataset-hash', columns: [{ columnId: 'column-a' }], rows: rows.slice(0,5).map((row, index) => ({ rowId: `row-${index + 1}`, sourceOrder: index, values: { 'column-a': row.matches[0].masterValue } })), validation: { ok: true, errors: [], warnings: [] } }] };
  return { graph, ledger, config, run, reviewLedger, attachmentSet, registry };
}
