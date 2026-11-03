export const DEFAULT_PROPERTY_TRANSFER_REPORT_COLUMNS = Object.freeze([
  'targetNode',
  'targetNodeNumber',
  'targetComponentType',
  'decision',
  'sourceNode',
  'sourceNodeNumber',
  'sourceComponentType',
  'targetLineFamily',
  'sourceLineFamily',
  'candidateCount',
  'propertyChanges',
  'changedProperties',
  'retainedTargetValues',
  'reason',
]);

export function propertyTransferRowsToCsv(rows = [], columns = DEFAULT_PROPERTY_TRANSFER_REPORT_COLUMNS) {
  const header = columns.join(',');
  const body = (rows || []).map((row) => columns.map((column) => csvCell(row?.[column] ?? '')).join(','));
  return [header, ...body].join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
