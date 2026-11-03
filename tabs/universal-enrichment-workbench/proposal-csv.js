import { ENRICHMENT_PROPOSAL_LIMITS } from './proposal-set.js';

const PROPOSAL_HEADERS = [
  'proposal_id','source_order','review_decision_id','comparison_result_id','entry_id','candidate_id',
  'entity_id','field_key','binding_id','dataset_id','column_id','match_id','row_id','row_source_order',
  'candidate_value','normalized_candidate','proposed_value','normalized_proposed_value','review_note',
];
const GROUP_HEADERS = [
  'proposal_group_id','source_order','entity_id','field_key','status','proposal_count',
  'distinct_value_count','proposal_ids',
];
const EXCLUSION_HEADERS = [
  'exclusion_id','source_order','review_decision_id','subject_kind','comparison_result_id','entry_id',
  'candidate_id','entity_id','field_key','binding_id','dataset_id','column_id','disposition','reason','review_note',
];

export class EnrichmentProposalCsvError extends Error {
  constructor(code, message) { super(message); this.name = 'EnrichmentProposalCsvError'; this.code = code; }
}

function primitiveEvidence(value) {
  return value === undefined ? '' : JSON.stringify(value);
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(headers, rows, label) {
  if (rows.length > ENRICHMENT_PROPOSAL_LIMITS.csvRows) {
    throw new EnrichmentProposalCsvError('CSV_ROW_LIMIT', `${label} CSV row limit ${ENRICHMENT_PROPOSAL_LIMITS.csvRows} exceeded.`);
  }
  return `${[headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')}\r\n`;
}

function proposalRow(item) {
  return [
    item.proposalId,item.sourceOrder,item.reviewDecisionId,item.comparisonResultId,item.entryId,item.candidateId,
    item.entityId,item.fieldKey,item.bindingId,item.datasetId,item.columnId,item.matchId,item.rowId,item.rowSourceOrder,
    primitiveEvidence(item.candidateValue),primitiveEvidence(item.normalizedCandidate),primitiveEvidence(item.proposedValue),
    primitiveEvidence(item.normalizedProposedValue),item.reviewNote,
  ];
}

function groupRow(item) {
  return [item.proposalGroupId,item.sourceOrder,item.entityId,item.fieldKey,item.status,
    item.proposalCount,item.distinctValueCount,JSON.stringify(item.proposalIds)];
}

function exclusionRow(item) {
  return [item.exclusionId,item.sourceOrder,item.reviewDecisionId,item.subjectKind,item.comparisonResultId,
    item.entryId,item.candidateId,item.entityId,item.fieldKey,item.bindingId,item.datasetId,item.columnId,
    item.disposition,item.reason,item.reviewNote];
}

export function buildEnrichmentProposalCsv(proposalSet) {
  return buildCsv(PROPOSAL_HEADERS, (proposalSet?.proposals || []).map(proposalRow), 'Proposal');
}

export function buildEnrichmentProposalGroupCsv(proposalSet) {
  return buildCsv(GROUP_HEADERS, (proposalSet?.groups || []).map(groupRow), 'Proposal-group');
}

export function buildEnrichmentExclusionCsv(proposalSet) {
  return buildCsv(EXCLUSION_HEADERS, (proposalSet?.exclusions || []).map(exclusionRow), 'Exclusion');
}
