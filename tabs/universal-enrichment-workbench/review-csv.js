import { REVIEW_LIMITS } from './review-ledger.js';

const HEADERS = [
  'review_decision_id','source_order','subject_kind','comparison_result_id','entry_id','candidate_id',
  'entity_id','field_key','binding_id','dataset_id','column_id','comparison_status','disposition',
  'selected_match_id','selected_row_id','selected_row_source_order','selected_master_value',
  'selected_normalized_master_value','note',
];

export class ComparisonReviewCsvError extends Error {
  constructor(code, message) { super(message); this.name = 'ComparisonReviewCsvError'; this.code = code; }
}

function primitiveEvidence(value) {
  if (value === undefined) return '';
  return JSON.stringify(value);
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function decisionRow(decision) {
  const match = decision.selectedMatch;
  return [
    decision.reviewDecisionId, decision.sourceOrder, decision.subjectKind, decision.comparisonResultId,
    decision.entryId, decision.candidateId, decision.entityId, decision.fieldKey, decision.bindingId,
    decision.datasetId, decision.columnId, decision.comparisonStatus, decision.disposition,
    match?.matchId || '', match?.rowId || '', match ? match.rowSourceOrder : '',
    match ? primitiveEvidence(match.masterValue) : '',
    match ? primitiveEvidence(match.normalizedMasterValue) : '', decision.note,
  ];
}

export function buildComparisonReviewCsv(ledger) {
  const decisions = ledger?.decisions || [];
  if (decisions.length > REVIEW_LIMITS.csvRows) {
    throw new ComparisonReviewCsvError('CSV_ROW_LIMIT', `Review CSV row limit ${REVIEW_LIMITS.csvRows} exceeded.`);
  }
  const rows = [HEADERS, ...decisions.map(decisionRow)];
  return `${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}\r\n`;
}
