function csvEscape(text) {
  if (!text) return '';
  const value = String(text);
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function reviewShardCsv(shard) {
  const header = ['NON_AUTHORITATIVE_REVIEW_VIEW', 'workItemId', 'sourceModelObjectId', 'sourceOccurrenceId', 'displayName', 'geometryKind'];
  const rows = [header.join(',')];
  for (const item of shard.workItems) {
    rows.push([
      'NON_AUTHORITATIVE_REVIEW_VIEW',
      item.workItemId,
      item.sourceModelObjectId,
      item.sourceOccurrenceId,
      csvEscape(item.nameEvidence?.displayName),
      item.geometryEvidence?.[0]?.kind || '',
    ].join(','));
  }
  return `${rows.join('\n')}\n`;
}
