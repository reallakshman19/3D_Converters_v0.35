function normalizeCell(value) {
  if (value === null) return null;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return String(value ?? '');
}

function valueType(values) {
  const types = new Set(values.filter((value) => value !== '').map((value) => value === null ? 'null' : typeof value));
  if (!types.size) return 'empty';
  return types.size === 1 ? [...types][0] : 'mixed';
}

function maxColumnCount(table) {
  return Math.max(table.headers.length, ...table.rows.map((row) => row.length), 0);
}

export function normalizeMasterTable(table) {
  const columnCount = maxColumnCount(table);
  const headers = Array.from({ length: columnCount }, (_, index) => String(table.headers[index] ?? ''));
  const rows = table.rows.map((row) => Array.from({ length: columnCount }, (_, index) => index < row.length ? normalizeCell(row[index]) : ''));
  const inferredValueTypes = headers.map((_, index) => valueType(rows.map((row) => row[index])));
  return {
    headers,
    rows,
    inferredValueTypes,
    errors: [...(table.errors || [])],
    warnings: [...(table.warnings || [])],
  };
}

export function canonicalMasterTable(table) {
  return JSON.stringify({ columns: table.headers, rows: table.rows });
}

export function rowContentKey(row) {
  return JSON.stringify(row);
}
