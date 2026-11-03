import { normalizeComparisonValue } from './comparison-normalize.js';

export function buildMasterColumnIndex(dataset, columnId, binding) {
  if (!dataset?.columns?.some((column) => column.columnId === columnId)) throw new Error(`Unknown master column ${columnId}.`);
  const index = new Map();
  for (const row of dataset.rows || []) {
    const value = row.values?.[columnId];
    const normalized = normalizeComparisonValue(value, binding.comparisonMode, binding.normalization);
    if (!normalized.valid) throw new Error(`Master row ${row.rowId}: ${normalized.error}`);
    const evidence = {
      rowId: row.rowId, rowSourceOrder: row.sourceOrder, masterValue: value,
      normalizedMasterValue: normalized.normalizedValue,
    };
    const bucket = index.get(normalized.indexKey) || [];
    bucket.push(evidence); index.set(normalized.indexKey, bucket);
  }
  return index;
}
