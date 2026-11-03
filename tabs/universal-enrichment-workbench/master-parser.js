import { normalizeMasterSourceText } from './master-source.js';

function commitField(record, field) {
  record.push(field);
  return '';
}

function commitRecord(records, record, field) {
  record.push(field);
  records.push(record);
  return { record: [], field: '' };
}

function scanDelimited(text, delimiter) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; continue; }
      if (char === '"') { quoted = false; continue; }
      field += char;
      continue;
    }
    if (char === '"' && field.length === 0) { quoted = true; continue; }
    if (char === '"') { field += char; continue; }
    if (char === delimiter) { field = commitField(record, field); continue; }
    if (char === '\n') {
      const next = commitRecord(records, record, field);
      record = next.record; field = next.field; continue;
    }
    field += char;
  }
  if (quoted) return { records, errors: ['Delimited text contains an unclosed quoted field.'] };
  if (field !== '' || record.length) records.push([...record, field]);
  return { records, errors: [] };
}

function headerFindings(headers) {
  const errors = [];
  const seen = new Set();
  headers.forEach((header, index) => {
    const name = String(header ?? '');
    if (!name.trim()) errors.push(`Header column ${index + 1} is empty.`);
    if (seen.has(name)) errors.push(`Header name is duplicated: ${name || '(empty)'}.`);
    seen.add(name);
  });
  return errors;
}

export function parseDelimitedMasterText(sourceText, delimiter = ',') {
  if (delimiter !== ',' && delimiter !== '\t') throw new Error('Only CSV and TSV delimiters are supported.');
  const text = normalizeMasterSourceText(sourceText);
  if (!text) return { headers: [], rows: [], errors: ['Master text is empty.'], warnings: [] };
  const scanned = scanDelimited(text, delimiter);
  const [headers = [], ...rows] = scanned.records;
  const errors = [...scanned.errors, ...headerFindings(headers)];
  if (!headers.length) errors.push('A header row is required.');
  return { headers: [...headers], rows: rows.map((row) => [...row]), errors, warnings: [] };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function primitiveCell(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function unwrapJsonRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  const keys = isPlainObject(parsed) ? Object.keys(parsed) : [];
  if (keys.length === 1 && keys[0] === 'rows' && Array.isArray(parsed.rows)) return parsed.rows;
  return null;
}

export function parseJsonMasterRows(sourceText) {
  let parsed;
  try { parsed = JSON.parse(normalizeMasterSourceText(sourceText)); }
  catch (error) { return { headers: [], rows: [], errors: [`Malformed JSON: ${error.message}`], warnings: [] }; }
  const sourceRows = unwrapJsonRows(parsed);
  if (!sourceRows) return { headers: [], rows: [], errors: ['JSON master must be an array of row objects or an object containing only a rows array.'], warnings: [] };
  if (!sourceRows.every(isPlainObject)) return { headers: [], rows: [], errors: ['Every JSON master row must be an object.'], warnings: [] };
  const headers = [];
  const seen = new Set();
  for (const row of sourceRows) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); headers.push(key); }
  const errors = [];
  sourceRows.forEach((row, rowIndex) => {
    for (const [key, value] of Object.entries(row)) if (!primitiveCell(value)) errors.push(`Row ${rowIndex + 1} column ${key} must contain a JSON-safe primitive or null.`);
  });
  const rows = sourceRows.map((row) => headers.map((key) => Object.hasOwn(row, key) ? row[key] : null));
  return { headers, rows, errors, warnings: [] };
}
