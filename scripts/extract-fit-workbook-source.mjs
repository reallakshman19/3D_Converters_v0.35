import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';

export const FIT_WORKBOOK_SOURCE_INVENTORY_SCHEMA = 'FitWorkbookSourceInventory.v1';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha1Hex(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function jsonValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

function compareCellAddresses(left, right) {
  const a = XLSX.utils.decode_cell(left);
  const b = XLSX.utils.decode_cell(right);
  return a.r - b.r || a.c - b.c;
}

function cellInventory(address, cell) {
  return {
    address,
    type: cell.t ?? null,
    value: jsonValue(cell.v),
    formatted: cell.w ?? null,
    numberFormat: cell.z ?? null,
    formula: cell.f ?? null,
    arrayRange: cell.F ?? null,
  };
}

function sheetVisibility(workbook, index) {
  const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0;
  if (hidden === 2) return 'VERY_HIDDEN';
  if (hidden === 1) return 'HIDDEN';
  return 'VISIBLE';
}

function sheetInventory(workbook, name, index, { formulasOnly }) {
  const sheet = workbook.Sheets[name];
  const addresses = Object.keys(sheet)
    .filter((key) => !key.startsWith('!'))
    .sort(compareCellAddresses);
  const allCells = addresses.map((address) => cellInventory(address, sheet[address]));
  const formulaCount = allCells.filter((cell) => cell.formula !== null).length;
  const cells = formulasOnly ? allCells.filter((cell) => cell.formula !== null) : allCells;
  return {
    name,
    visibility: sheetVisibility(workbook, index),
    range: sheet['!ref'] ?? null,
    mergeRanges: (sheet['!merges'] ?? []).map((range) => XLSX.utils.encode_range(range)).sort(),
    cellCount: allCells.length,
    formulaCount,
    cells,
  };
}

function definedNames(workbook) {
  return (workbook.Workbook?.Names ?? [])
    .map((item) => ({
      name: item.Name ?? null,
      ref: item.Ref ?? null,
      sheetIndex: Number.isInteger(item.Sheet) ? item.Sheet : null,
      hidden: item.Hidden === true,
      comment: item.Comment ?? null,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.ref).localeCompare(String(b.ref)));
}

export function buildFitWorkbookSourceInventory(bytesInput, options = {}) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const workbook = XLSX.read(bytes, {
    type: 'buffer',
    cellFormula: true,
    cellNF: true,
    bookVBA: true,
    raw: true,
  });
  const formulasOnly = options.formulasOnly === true;
  return {
    schema: FIT_WORKBOOK_SOURCE_INVENTORY_SCHEMA,
    source: {
      fileName: options.fileName || 'FIT.xlsm',
      sizeBytes: bytes.length,
      sha256: `sha256:${sha256Hex(bytes)}`,
      gitBlobSha1: `sha1:${gitBlobSha1Hex(bytes)}`,
    },
    extraction: {
      formulasOnly,
      vbaProjectPresent: Boolean(workbook.vbaraw?.length),
    },
    definedNames: definedNames(workbook),
    sheets: workbook.SheetNames.map((name, index) => sheetInventory(workbook, name, index, { formulasOnly })),
  };
}

function normalizeExpectedGitBlob(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^sha1:/u, '');
}

export function assertExpectedFitWorkbookGitBlob(inventory, expectedGitBlob) {
  if (!expectedGitBlob) return inventory;
  const expected = normalizeExpectedGitBlob(expectedGitBlob);
  const actual = normalizeExpectedGitBlob(inventory?.source?.gitBlobSha1);
  if (!/^[0-9a-f]{40}$/u.test(expected)) {
    throw new TypeError('FIT_WORKBOOK_EXPECTED_GIT_BLOB_INVALID: expected a 40-character SHA-1 Git blob id.');
  }
  if (actual !== expected) {
    throw new Error(`FIT_WORKBOOK_SOURCE_MISMATCH: expected Git blob ${expected}, received ${actual || 'unknown'}.`);
  }
  return inventory;
}

function parseArguments(argv) {
  const positional = [];
  const options = { out: null, expectedGitBlob: null, formulasOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index] ?? null;
    else if (arg === '--expected-git-blob') options.expectedGitBlob = argv[++index] ?? null;
    else if (arg === '--formulas-only') options.formulasOnly = true;
    else if (arg.startsWith('--')) throw new TypeError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new TypeError('Usage: node scripts/extract-fit-workbook-source.mjs <FIT.xlsm|xlsx> [--out inventory.json] [--expected-git-blob SHA1] [--formulas-only]');
  }
  return { input: positional[0], ...options };
}

export function runFitWorkbookSourceExtraction(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const inputPath = resolve(args.input);
  const bytes = readFileSync(inputPath);
  const inventory = buildFitWorkbookSourceInventory(bytes, {
    fileName: basename(inputPath),
    formulasOnly: args.formulasOnly,
  });
  assertExpectedFitWorkbookGitBlob(inventory, args.expectedGitBlob);
  const json = `${JSON.stringify(inventory, null, 2)}\n`;
  if (args.out) {
    const outputPath = resolve(args.out);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, json, 'utf8');
    return { inventory, outputPath };
  }
  process.stdout.write(json);
  return { inventory, outputPath: null };
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runFitWorkbookSourceExtraction();
