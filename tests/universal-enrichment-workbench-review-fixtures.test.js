import { createHash } from 'node:crypto';
import {
  summarizeCandidateComparisonRun,
  validateCandidateComparisonRun,
} from '../tabs/universal-enrichment-workbench/comparison-run.js';

const hashText = async (value) => createHash('sha256').update(String(value ?? '')).digest('hex');
const dependencies = {
  hashText,
  validateMasterFieldBindingConfig: async () => ({ ok: true, errors: [], warnings: [] }),
  validateMasterDataset: async () => ({ ok: true, errors: [], warnings: [] }),
  validateCandidateComparisonRun,
};

function makeUpstream() {
  const graph = {
    schema: 'UniversalSourceGraph.v1', sourceFileId: 'source-a', sourceRevision: 1,
    contentHash: 'graph-hash', entities: [{ entityId: 'node-1', sourceOrder: 0 }],
    validation: { ok: true, errors: [], warnings: [] },
  };
  const ledger = {
    schema: 'FieldCandidateLedger.v1', ledgerId: 'ledger-a', sourceFileId: 'source-a',
    sourceRevision: 1, sourceContentHash: 'graph-hash', sourceGraphSchema: 'UniversalSourceGraph.v1',
    entries: [
      { entryId: 'e1', sourceOrder: 0, entityId: 'node-1', fieldKey: 'line-key', status: 'candidate', candidates: [{ candidateId: 'c1', value: 'A' }] },
      { entryId: 'e2', sourceOrder: 1, entityId: 'node-1', fieldKey: 'line-key', status: 'candidate', candidates: [{ candidateId: 'c2', value: '2"' }] },
      { entryId: 'e3', sourceOrder: 2, entityId: 'node-1', fieldKey: 'other-key', status: 'candidate', candidates: [{ candidateId: 'c3', value: false }] },
      { entryId: 'e4', sourceOrder: 3, entityId: 'node-1', fieldKey: 'ignored', status: 'rejected', candidates: [] },
    ], validation: { ok: true, errors: [], warnings: [] },
  };
  const dataset = {
    schema: 'MasterDataset.v1', datasetId: 'd1', datasetRole: 'line-list', contentHash: 'dataset-hash',
    columns: [{ columnId: 'col1', sourceOrder: 0 }, { columnId: 'col2', sourceOrder: 1 }],
    rows: [
      { rowId: 'row1', sourceOrder: 0, values: { col1: 'A', col2: 'X' } },
      { rowId: 'row2', sourceOrder: 1, values: { col1: '2"', col2: 'Y' } },
      { rowId: 'row3', sourceOrder: 2, values: { col1: '2"', col2: 'Z' } },
    ], validation: { ok: true, errors: [], warnings: [] },
  };
  const registry = { datasets: [dataset] };
  const attachmentSet = {
    schema: 'MasterAttachmentSet.v1', sourceFileId: 'source-a', sourceRevision: 1,
    sourceContentHash: 'graph-hash', sourceGraphSchema: 'UniversalSourceGraph.v1',
    attachments: [{ datasetId: 'd1', datasetRole: 'line-list', attachmentOrder: 0 }],
    validation: { ok: true, errors: [], warnings: [] },
  };
  const config = {
    schema: 'MasterFieldBindingConfig.v1', bindingConfigId: 'config-a', sourceFileId: 'source-a',
    sourceRevision: 1, sourceContentHash: 'graph-hash', sourceGraphSchema: 'UniversalSourceGraph.v1',
    ledgerId: 'ledger-a', attachmentSetIdentity: 'attachment-set-fixed',
    bindings: [
      { bindingId: 'b1', sourceOrder: 0, enabled: true, fieldKey: 'line-key', datasetId: 'd1', datasetRole: 'line-list', columnId: 'col1' },
      { bindingId: 'b2', sourceOrder: 1, enabled: true, fieldKey: 'line-key', datasetId: 'd1', datasetRole: 'line-list', columnId: 'col2' },
    ], validation: { ok: true, errors: [], warnings: [] },
  };
  const results = [
    { comparisonResultId: 'r1', sourceOrder: 0, entryId: 'e1', candidateId: 'c1', entityId: 'node-1', fieldKey: 'line-key', bindingId: 'b1', datasetId: 'd1', columnId: 'col1', candidateValue: 'A', normalizedCandidate: 'A', status: 'unique-match', matches: [{ matchId: 'm1', rowId: 'row1', rowSourceOrder: 0, masterValue: 'A', normalizedMasterValue: 'A' }] },
    { comparisonResultId: 'r2', sourceOrder: 1, entryId: 'e1', candidateId: 'c1', entityId: 'node-1', fieldKey: 'line-key', bindingId: 'b2', datasetId: 'd1', columnId: 'col2', candidateValue: 'A', normalizedCandidate: 'A', status: 'unmatched', matches: [] },
    { comparisonResultId: 'r3', sourceOrder: 2, entryId: 'e2', candidateId: 'c2', entityId: 'node-1', fieldKey: 'line-key', bindingId: 'b1', datasetId: 'd1', columnId: 'col1', candidateValue: '2"', normalizedCandidate: '2"', status: 'multiple-match', matches: [
      { matchId: 'm2', rowId: 'row2', rowSourceOrder: 1, masterValue: '2"', normalizedMasterValue: '2"' },
      { matchId: 'm3', rowId: 'row3', rowSourceOrder: 2, masterValue: '2"', normalizedMasterValue: '2"' },
    ] },
    { comparisonResultId: 'r4', sourceOrder: 3, entryId: 'e2', candidateId: 'c2', entityId: 'node-1', fieldKey: 'line-key', bindingId: 'b2', datasetId: 'd1', columnId: 'col2', candidateValue: '2"', normalizedCandidate: '2"', status: 'unmatched', matches: [] },
  ];
  const run = {
    schema: 'CandidateComparisonRun.v1', comparisonRunId: 'run-a', sourceFileId: 'source-a',
    sourceRevision: 1, sourceContentHash: 'graph-hash', sourceGraphSchema: 'UniversalSourceGraph.v1',
    ledgerId: 'ledger-a', bindingConfigId: 'config-a', attachmentSetIdentity: 'attachment-set-fixed',
    results, unbound: [{ sourceOrder: 0, entryId: 'e3', candidateId: 'c3', entityId: 'node-1', fieldKey: 'other-key', reason: 'No enabled binding exists for this field key.' }],
    summary: null, validation: { ok: true, errors: [], warnings: [] },
  };
  return { graph, ledger, config, run, attachmentSet, registry };
}

async function normalizedUpstream() {
  const upstream = makeUpstream();
  const { createMasterAttachmentSetIdentity } = await import('../tabs/universal-enrichment-workbench/comparison-binding.js');
  const { createComparisonIdentity, graphComparisonIdentity } = await import('../tabs/universal-enrichment-workbench/comparison-identity.js');
  const attachmentId = await createMasterAttachmentSetIdentity(upstream.graph, upstream.attachmentSet, hashText);
  upstream.config.attachmentSetIdentity = attachmentId; upstream.run.attachmentSetIdentity = attachmentId;
  for (const binding of upstream.config.bindings) {
    const { bindingId, ...evidence } = binding;
    binding.bindingId = await createComparisonIdentity('master-binding', evidence, hashText);
  }
  upstream.config.bindingConfigId = await createComparisonIdentity('master-binding-config', {
    graph: graphComparisonIdentity(upstream.graph), ledgerId: upstream.ledger.ledgerId, attachmentSetIdentity: attachmentId, bindings: upstream.config.bindings,
  }, hashText);
  for (const result of upstream.run.results) {
    result.bindingId = upstream.config.bindings[result.sourceOrder % 2].bindingId;
    result.comparisonResultId = await createComparisonIdentity('candidate-comparison-result', { entryId: result.entryId, candidateId: result.candidateId, bindingId: result.bindingId }, hashText);
    for (const match of result.matches) {
      match.matchId = await createComparisonIdentity('candidate-master-match', { comparisonResultId: result.comparisonResultId, datasetId: result.datasetId, rowId: match.rowId, columnId: result.columnId, masterValue: match.masterValue, normalizedMasterValue: match.normalizedMasterValue }, hashText);
    }
  }
  upstream.run.bindingConfigId = upstream.config.bindingConfigId;
  upstream.run.summary = summarizeCandidateComparisonRun(upstream.run);
  upstream.run.comparisonRunId = await createComparisonIdentity('candidate-comparison-run', {
    graph: graphComparisonIdentity(upstream.graph), ledgerId: upstream.ledger.ledgerId, bindingConfigId: upstream.config.bindingConfigId, attachmentSetIdentity: attachmentId, results: upstream.run.results, unbound: upstream.run.unbound,
  }, hashText);
  return upstream;
}

function drafts(rows, upstream = null) {
  const matches = (upstream?.run?.results || []).flatMap((result) => result.matches || []);
  return new Map(rows.map(([key, disposition, selectedMatchId = '', note = '']) => {
    const resultIndex = /^result:r(\d+)$/.exec(key)?.[1];
    const matchIndex = /^m(\d+)$/.exec(selectedMatchId)?.[1];
    const resolvedKey = resultIndex ? `result:${upstream.run.results[Number(resultIndex) - 1].comparisonResultId}` : key;
    const resolvedMatch = matchIndex ? matches[Number(matchIndex) - 1]?.matchId || selectedMatchId : selectedMatchId;
    return [resolvedKey, { subjectKey: resolvedKey, disposition, selectedMatchId: resolvedMatch, note }];
  }));
}

export { makeUpstream, normalizedUpstream, dependencies, drafts, hashText };
