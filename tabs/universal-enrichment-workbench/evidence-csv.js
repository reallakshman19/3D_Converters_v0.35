function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(headers, rows) {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

const CANDIDATE_HEADERS = ['entry_id','entity_id','entity_source_order','source_path','rule_id','rule_source_order','field_key','status','candidate_id','candidate_value','winning_strategy_index','attempt_count','trace_result_id'];
const REJECTED_HEADERS = ['entry_id','entity_id','entity_source_order','source_path','rule_id','rule_source_order','field_key','status','rejection_reason','attempt_count','trace_result_id'];

export function buildCandidateLedgerCsv(ledger) {
  const rows = [];
  for (const entry of ledger?.entries || []) {
    if (entry.status !== 'candidate') continue;
    for (const candidate of entry.candidates || []) rows.push([
      entry.entryId, entry.entityId, entry.entitySourceOrder, entry.sourcePath,
      entry.ruleId, entry.ruleSourceOrder, entry.fieldKey, entry.status,
      candidate.candidateId, candidate.value, candidate.winningStrategyIndex,
      candidate.attemptCount, entry.traceResultId,
    ]);
  }
  return csvRows(CANDIDATE_HEADERS, rows);
}

export function buildRejectedLedgerCsv(ledger) {
  const rows = (ledger?.entries || []).filter((entry) => entry.status === 'rejected').map((entry) => [
    entry.entryId, entry.entityId, entry.entitySourceOrder, entry.sourcePath,
    entry.ruleId, entry.ruleSourceOrder, entry.fieldKey, entry.status,
    entry.rejectionReason, entry.attemptCount, entry.traceResultId,
  ]);
  return csvRows(REJECTED_HEADERS, rows);
}
