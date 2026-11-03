/**
 * Functionality: reads stagedJson and master files selected in the parallel
 * browser workflow. Parameters: browser File and master kind. Outputs: parsed
 * JSON hierarchy or tabular rows. Fallback: invalid/empty files throw.
 */

import { normalizeStagedJson } from '../../../contracts/stagedjson-contract.js';

export async function readStagedJsonFile(file) {
  requireFile(file);
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new TypeError(`${file.name} is not a stagedJson object or array.`);
  const { branches, envelope } = normalizeStagedJson(parsed);
  return { parsed, branches, envelope, text, fileName: file.name };
}

export async function readStagedJsonMasterFile(file, masterKind) {
  requireFile(file);
  if (/\.json$/i.test(file.name)) return { rows: jsonRows(JSON.parse(await file.text()), masterKind), fileName: file.name };
  if (/\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(file.name)) return { rows: await spreadsheetRows(file), fileName: file.name };
  const text = await file.text();
  return { rows: parseDelimitedRows(text), fileName: file.name };
}

export function parseDelimitedRows(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new TypeError('Master file contains no rows.');
  const delimiter = delimiterFor(lines[0]);
  const headers = splitLine(lines[0], delimiter).map((value) => value.trim());
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header || `Column${index + 1}`, splitLine(line, delimiter)[index] ?? ''])));
}

async function spreadsheetRows(file) {
  const xlsx = await getXlsxModule();
  const workbook = xlsx.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false, raw: false });
  const firstSheet = workbook.SheetNames?.[0];
  if (!firstSheet) throw new TypeError(`${file.name} contains no worksheets.`);
  return xlsx.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '', raw: false });
}

async function getXlsxModule() {
  const candidates = [
    () => import('xlsx'),
    () => import('https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs'),
  ];
  const errors = [];
  for (const load of candidates) {
    try {
      const module = await load();
      const xlsx = module?.read ? module : module?.default;
      if (xlsx?.read && xlsx?.utils?.sheet_to_json) return xlsx;
      errors.push('module did not expose read/utils');
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  throw new Error(`XLSX parser failed to load. ${errors.join(' | ')}`);
}

function jsonRows(value, masterKind) {
  if (Array.isArray(value)) return value;
  const candidates = [value?.rows, value?.[masterKind], value?.masterRows, value?.data];
  const rows = candidates.find(Array.isArray);
  if (!rows) throw new TypeError(`JSON master ${masterKind} does not contain a row array.`);
  return rows;
}

function splitLine(line, delimiter) {
  const values = [];
  let current = '', quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { values.push(current); current = ''; }
    else current += char;
  }
  values.push(current);
  return values;
}

function delimiterFor(line) {
  const candidates = [',', '\t', ';'];
  return candidates.sort((left, right) => line.split(right).length - line.split(left).length)[0];
}

function requireFile(file) {
  if (!file || typeof file.text !== 'function') throw new TypeError('A readable browser File is required.');
  if (file.size === 0) throw new TypeError(`${file.name || 'File'} is empty.`);
}