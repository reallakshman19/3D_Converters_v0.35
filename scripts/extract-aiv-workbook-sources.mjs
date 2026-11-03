import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';

export const AIV_WORKBOOK_SOURCE_INVENTORY_SCHEMA = 'AivWorkbookSourceInventory.v1';
export const AIV_WORKBOOK_BASELINE = Object.freeze({
  repository: 'reallaksh19/CRF-4-1',
  commit: '68dc8e1fa2ef67073c59b3afc56f1bf40953d535',
});

export const AIV_RETAINED_WORKBOOKS = Object.freeze([
  Object.freeze({
    workbookId: 'AIV-WB-KS-PR-CAL-0087',
    path: 'Enhanced stress report/extended calc/KS-PR-CAL-0087 Vibration Assessment Calculation V and V.xlsx',
    gitBlob: '2566d41c02768a2345513ed42d270b123fe5087c',
  }),
  Object.freeze({
    workbookId: 'AIV-WB-AIV-FIV',
    path: 'Extended calc2/AIV FIV/AIV.xlsx',
    gitBlob: '048332ed93abd258ffced6b83af0ae343dfcbc9d',
  }),
  Object.freeze({
    workbookId: 'AIV-WB-CLOSED-RV',
    path: 'Enhanced stress report/extended calc/9.4_AIV Closed RV Calc.xls',
    gitBlob: '83eeb40d9b224ddd5020c26410a659e01bcea991',
  }),
]);

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function gitBlobSha1Hex(bytesInput) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function formulaCells(sheet) {
  return Object.keys(sheet)
    .filter((address) => !address.startsWith('!') && sheet[address]?.f)
    .sort((a, b) => a.localeCompare(b))
    .map((address) => {
      const cell = sheet[address];
      return {
        address,
        formula: cell.f,
        cachedValue: cell.v ?? null,
        formatted: cell.w ?? null,
        numberFormat: cell.z ?? null,
      };
    });
}

function sheetVisibility(workbook, index) {
  const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0;
  if (hidden === 2) return 'VERY_HIDDEN';
  if (hidden === 1) return 'HIDDEN';
  return 'VISIBLE';
}

function definedNames(workbook) {
  return (workbook.Workbook?.Names ?? [])
    .map((item) => ({
      name: item.Name ?? null,
      ref: item.Ref ?? null,
      sheetIndex: Number.isInteger(item.Sheet) ? item.Sheet : null,
      hidden: item.Hidden === true,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.ref).localeCompare(String(b.ref)));
}

export function buildAivWorkbookInventory(bytesInput, source, options = {}) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const actualBlob = gitBlobSha1Hex(bytes);
  const expectedBlob = String(source.gitBlob ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(expectedBlob)) throw new TypeError(`AIV_WORKBOOK_EXPECTED_GIT_BLOB_INVALID: ${source.workbookId}`);
  if (actualBlob !== expectedBlob) {
    throw new Error(`AIV_WORKBOOK_SOURCE_MISMATCH: ${source.workbookId} expected ${expectedBlob}, received ${actualBlob}.`);
  }
  const workbook = XLSX.read(bytes, {
    type: 'buffer',
    cellFormula: true,
    cellNF: true,
    bookVBA: true,
    raw: true,
  });
  const sheetDetails = workbook.SheetNames.map((name, index) => {
    const sheet = workbook.Sheets[name];
    const formulas = formulaCells(sheet);
    const formulaBytes = Buffer.from(JSON.stringify(formulas), 'utf8');
    return {
      name,
      visibility: sheetVisibility(workbook, index),
      range: sheet['!ref'] ?? null,
      mergeCount: (sheet['!merges'] ?? []).length,
      formulaCount: formulas.length,
      formulasSha256: `sha256:${sha256Hex(formulaBytes)}`,
      formulas,
    };
  });
  const names = definedNames(workbook);
  const publicSheets = sheetDetails.map(({ formulas, ...summary }) => summary);
  const details = {
    workbookId: source.workbookId,
    sourcePath: source.path,
    sheets: sheetDetails,
    definedNames: names,
  };
  const privateDetailsSha256 = `sha256:${sha256Hex(Buffer.from(JSON.stringify(details), 'utf8'))}`;
  return {
    summary: {
      workbookId: source.workbookId,
      sourcePath: source.path,
      gitBlobSha1: `sha1:${actualBlob}`,
      sizeBytes: bytes.length,
      sha256: `sha256:${sha256Hex(bytes)}`,
      workbookType: String(source.path).toLowerCase().endsWith('.xls') ? 'XLS_BIFF' : 'XLSX',
      vbaProjectPresent: Boolean(workbook.vbaraw?.length),
      sheetCount: publicSheets.length,
      formulaCount: publicSheets.reduce((sum, sheet) => sum + sheet.formulaCount, 0),
      hiddenSheetCount: publicSheets.filter((sheet) => sheet.visibility !== 'VISIBLE').length,
      definedNameCount: names.length,
      definedNamesSha256: `sha256:${sha256Hex(Buffer.from(JSON.stringify(names), 'utf8'))}`,
      privateDetailsSha256,
      sheets: publicSheets,
      migrationEvidenceOnly: true,
      productionAuthority: false,
      formulaImplementationAuthorized: false,
      eiReconciliationRequired: true,
    },
    details,
    detailsSha256: privateDetailsSha256,
    fileName: options.fileName || basename(source.path),
  };
}

export function buildAivWorkbookSourceInventory(rootDir) {
  const results = AIV_RETAINED_WORKBOOKS.map((source) => {
    const filePath = resolve(rootDir, source.path);
    const bytes = readFileSync(filePath);
    return buildAivWorkbookInventory(bytes, source, { fileName: basename(filePath) });
  });
  return {
    schema: AIV_WORKBOOK_SOURCE_INVENTORY_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    baseline: AIV_WORKBOOK_BASELINE,
    workbooks: results.map((item) => item.summary),
    details: results.map((item) => ({ workbookId: item.summary.workbookId, details: item.details, detailsSha256: item.detailsSha256 })),
    authority: {
      evidenceClass: 'MIGRATION_REFERENCE_ONLY',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
  };
}

function parseArguments(argv) {
  const positional = [];
  const options = { out: null, detailsDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index] ?? null;
    else if (arg === '--details-dir') options.detailsDir = argv[++index] ?? null;
    else if (arg.startsWith('--')) throw new TypeError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new TypeError('Usage: node scripts/extract-aiv-workbook-sources.mjs <CRF-4-1-root> [--out manifest.json] [--details-dir private-review-dir]');
  }
  return { rootDir: positional[0], ...options };
}

export function runAivWorkbookSourceExtraction(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const inventory = buildAivWorkbookSourceInventory(resolve(args.rootDir));
  if (args.detailsDir) {
    const detailsDir = resolve(args.detailsDir);
    mkdirSync(detailsDir, { recursive: true });
    for (const item of inventory.details) {
      writeFileSync(resolve(detailsDir, `${item.workbookId}.json`), `${JSON.stringify(item.details, null, 2)}\n`, 'utf8');
    }
  }
  const publicManifest = { ...inventory };
  delete publicManifest.details;
  const json = `${JSON.stringify(publicManifest, null, 2)}\n`;
  if (args.out) {
    const outputPath = resolve(args.out);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, json, 'utf8');
    return { inventory: publicManifest, outputPath };
  }
  process.stdout.write(json);
  return { inventory: publicManifest, outputPath: null };
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runAivWorkbookSourceExtraction();
