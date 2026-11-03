function csvCell(value) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function buildCandidateComparisonCsv(run) {
  const rows = [[
    'comparison_result_id','source_order','entry_id','candidate_id','entity_id','field_key',
    'binding_id','dataset_id','column_id','candidate_value','normalized_candidate','status','match_count',
  ]];
  for (const item of run?.results || []) rows.push([
    item.comparisonResultId,item.sourceOrder,item.entryId,item.candidateId,item.entityId,item.fieldKey,
    item.bindingId,item.datasetId,item.columnId,item.candidateValue,item.normalizedCandidate,item.status,item.matches.length,
  ]);
  for (const item of run?.unbound || []) rows.push([
    '',item.sourceOrder,item.entryId,item.candidateId,item.entityId,item.fieldKey,'','','','','','unbound',0,
  ]);
  return csv(rows);
}

export function buildCandidateMatchCsv(run) {
  const rows = [[
    'comparison_result_id','match_id','entry_id','candidate_id','binding_id','dataset_id','column_id',
    'row_id','row_source_order','candidate_value','normalized_candidate','master_value','normalized_master_value',
  ]];
  for (const item of run?.results || []) for (const match of item.matches) rows.push([
    item.comparisonResultId,match.matchId,item.entryId,item.candidateId,item.bindingId,item.datasetId,item.columnId,
    match.rowId,match.rowSourceOrder,item.candidateValue,item.normalizedCandidate,match.masterValue,match.normalizedMasterValue,
  ]);
  return csv(rows);
}
