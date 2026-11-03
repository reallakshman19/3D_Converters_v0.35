import { activeProfileFor, profileFieldMap } from './xml-cii-table-trace-config.js';

/**
 * Table parsing and fuzzy mapping for XML->CII JSON Trace alternates.
 * Inputs: pasted CSV/TSV text or worksheet row objects.
 * Outputs: normalized raw rows, explicit field maps, and preview text.
 * Fallback: unknown headers remain unmapped for user correction.
 */
export const TRACE_TABLE_FIELDS = Object.freeze([
  { name: 'componentRefNo', label: 'ComponentRefNo / element reference', required: false, aliases: ['Reference of the element', 'ComponentRefNo', 'Component Ref No', 'REF', 'Element Reference', 'reference'] },
  { name: 'dtxrPos', label: 'DTXR_POS / detailing text', required: true, aliases: ['RTEXT of detailing text', 'DTXR_POS', 'DTXR', 'Detailing Text', 'Description', 'RTEXT', 'SPRE'] },
  { name: 'nodeName', label: 'NodeName / support name', required: false, aliases: ['Name of the element', 'NodeName', 'Support Tag', 'Support Name', 'PS', 'PS tag', 'NAME'] },
  { name: 'position', label: 'Position / coordinates', required: false, aliases: ['POS WRT /*', 'Position', 'POSI', 'POS', 'Coordinates', 'Coord'] },
  { name: 'componentType', label: 'Component type', required: false, aliases: ['TYPE', 'ComponentType', 'Component Type'] },
  { name: 'dtxrPs', label: 'DTXR_PS / isometric note', required: false, aliases: ['ISOMETRIC NOTES', 'DTXR_PS', 'Isometric Note', 'Iso Note'] },
  { name: 'cmpSupGap', label: 'CMPSUPGAP / support gap', required: false, aliases: ['SUPPORT GAP', 'CMPSUPGAP', 'CMP SUP GAP', 'Gap'] },
  { name: 'branchName', label: 'Branch / pipe', required: false, aliases: ['PIPE', 'Branch', 'BranchName', 'Line ID', 'LineId', 'PIPE OF COMPREF'] },
  { name: 'supportReference', label: 'Ancillary support reference', required: false, aliases: ['ANCILIARY SUPPORT REFERENCE', 'Support Reference', 'Ancillary Reference'] },
  { name: 'componentSpec', label: 'Component spec', required: false, aliases: ['Component spec reference', 'Spec Reference', 'Component Spec', 'Specification', 'SPRE'] },
  { name: 'bore', label: 'Bore', required: false, aliases: ['BORE', 'ABORE', 'LBORE', 'Nominal Bore', 'Size'] },
  { name: 'site', label: 'Site', required: false, aliases: ['SITE', 'Site Area'] },
]);

export const REQUIRED_TRACE_TABLE_FIELD_NAMES = Object.freeze(
  TRACE_TABLE_FIELDS.filter((field) => field.required).map((field) => field.name)
);

function text(value) { return String(value ?? '').trim(); }
function compact(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function normRef(value) { return text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase(); }

function csvLine(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => text(value).replace(/^['"]|['"]$/g, ''));
}

function bestDelimiter(lines) {
  const first = lines.find((line) => text(line)) || '';
  return ['\t', ',', ';', '|']
    .map((delimiter) => ({ delimiter, count: csvLine(first, delimiter).length }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function uniqueHeader(value, index, used) {
  const base = text(value) || `Column ${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function parseTraceTableText(rawText) {
  const source = String(rawText ?? '').replace(/^\uFEFF/, '');
  const lines = source.split(/\r?\n/).filter((line) => text(line));
  if (!lines.length) return [];
  const delimiter = bestDelimiter(lines);
  const used = new Set();
  const headers = csvLine(lines[0], delimiter).map((header, index) => uniqueHeader(header, index, used));
  return lines.slice(1).map((line, rowIndex) => {
    const cells = csvLine(line, delimiter);
    const row = { _rowIndex: rowIndex + 2 };
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  }).filter((row) => headers.some((header) => text(row[header])));
}

export function headersFromTraceRows(rows) {
  const headers = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const key of Object.keys(row || {})) {
      if (key !== '_rowIndex' && !headers.includes(key)) headers.push(key);
    }
  }
  return headers;
}

function tokens(value) {
  return text(value).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

function headerScore(header, aliases) {
  const headerKey = compact(header);
  if (!headerKey) return 0;
  let best = 0;
  for (const alias of aliases || []) {
    const aliasKey = compact(alias);
    if (!aliasKey) continue;
    if (headerKey === aliasKey) best = Math.max(best, 120);
    else if (headerKey.startsWith(aliasKey) || aliasKey.startsWith(headerKey)) best = Math.max(best, 86);
    else if (headerKey.includes(aliasKey) || aliasKey.includes(headerKey)) best = Math.max(best, 72);
    const aliasTokens = tokens(alias);
    const headerTokens = tokens(header);
    const matched = aliasTokens.filter((token) => headerTokens.includes(token)).length;
    if (aliasTokens.length && matched) best = Math.max(best, Math.round((matched / aliasTokens.length) * 70));
  }
  return best;
}

function sampleValues(rows, header) {
  const values = [];
  for (const row of rows || []) {
    if (values.length >= 20) break;
    const value = text(row?.[header]);
    if (value) values.push(value);
  }
  return values;
}

function dataScore(fieldName, values) {
  if (!values.length) return 0;
  const rate = (fn) => values.filter(fn).length / values.length;
  if (fieldName === 'componentRefNo') return Math.round(rate((v) => /^=?\d+\/\d+$/i.test(v)) * 92);
  if (fieldName === 'nodeName') return Math.round(rate((v) => /\/?PS-?\d+(?:\.\d+)?/i.test(v)) * 82);
  if (fieldName === 'dtxrPos') return Math.round(rate((v) => /REST|GUIDE|SHOE|ANCHOR|PLATE|SUPPORT|STOP/i.test(v) && v.length > 3) * 78);
  if (fieldName === 'position') return Math.round(rate((v) => /\b[ENSUWD]\s*-?\d+(?:\.\d+)?mm/i.test(v) || (v.match(/-?\d+(?:\.\d+)?/g) || []).length >= 3) * 88);
  if (fieldName === 'componentType') return Math.round(rate((v) => /^[A-Z]{3,6}$/i.test(v)) * 70);
  if (fieldName === 'cmpSupGap') return Math.round(rate((v) => v === '' || /^-?\d+(\.\d+)?$/.test(v)) * 58);
  if (fieldName === 'branchName') return Math.round(rate((v) => /ASIM|\/B\d+|PIPE/i.test(v)) * 70);
  if (fieldName === 'componentSpec') return Math.round(rate((v) => /MDS|SPEC|PIPE|PMP/i.test(v)) * 62);
  if (fieldName === 'site') return Math.round(rate((v) => /-CU-PI|SITE|FCSG/i.test(v)) * 68);
  return 0;
}

export function autoMapTraceTableFields(headers, rawRows, config) {
  const mapped = {};
  const claimed = new Set();
  const profile = activeProfileFor(headers, config);
  const profileMap = profileFieldMap(headers, profile.id);
  for (const [fieldName, header] of Object.entries(profileMap)) {
    if (header) {
      mapped[fieldName] = header;
      claimed.add(header);
    }
  }
  for (const field of TRACE_TABLE_FIELDS) {
    if (mapped[field.name]) continue;
    let bestHeader = '';
    let bestScore = 0;
    for (const header of headers || []) {
      if (claimed.has(header)) continue;
      const score = Math.max(headerScore(header, field.aliases), dataScore(field.name, sampleValues(rawRows, header)));
      if (score > bestScore) {
        bestHeader = header;
        bestScore = score;
      }
    }
    mapped[field.name] = bestScore >= 58 ? bestHeader : '';
    if (mapped[field.name]) claimed.add(mapped[field.name]);
  }
  return mapped;
}

export function rowsToTraceTableText(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = headersFromTraceRows(safeRows);
  const quote = (value) => {
    const out = String(value ?? '');
    return /[",\n\r]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
  };
  return [headers.join(','), ...safeRows.map((row) => headers.map((header) => quote(row?.[header])).join(','))].join('\n');
}

export function mapTraceTableRows(rawRows, fieldMap) {
  return (Array.isArray(rawRows) ? rawRows : []).map((row, index) => {
    const mapped = { _rowIndex: row?._rowIndex || index + 2, raw: row || {} };
    for (const field of TRACE_TABLE_FIELDS) mapped[field.name] = text(row?.[fieldMap?.[field.name]]);
    mapped.componentRefKey = normRef(mapped.componentRefNo);
    mapped.nodeNameKey = compact(mapped.nodeName);
    return mapped;
  });
}
