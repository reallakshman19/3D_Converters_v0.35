import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  AIV_RETAINED_WORKBOOKS,
  AIV_WORKBOOK_BASELINE,
  AIV_WORKBOOK_SOURCE_INVENTORY_SCHEMA,
  buildAivWorkbookInventory,
  gitBlobSha1Hex,
} from '../scripts/extract-aiv-workbook-sources.mjs';

const ROOT = new URL('../', import.meta.url);

function fixtureWorkbookBytes() {
  const wb = XLSX.utils.book_new();
  const visible = XLSX.utils.aoa_to_sheet([
    ['Input', 2],
    ['Calculated', { f: 'B1*3', v: 6 }],
  ]);
  const hidden = XLSX.utils.aoa_to_sheet([
    ['Hidden calc', { f: '1+1', v: 2 }],
  ]);
  XLSX.utils.book_append_sheet(wb, visible, 'Visible');
  XLSX.utils.book_append_sheet(wb, hidden, 'HiddenCalc');
  wb.Workbook = {
    Sheets: [{ name: 'Visible', Hidden: 0 }, { name: 'HiddenCalc', Hidden: 1 }],
    Names: [{ Name: 'TEST_INPUT', Ref: 'Visible!$B$1' }],
  };
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellFormula: true });
}

test('retained AIV workbook baseline pins the CRF-4-1 revision and all three exact blobs', () => {
  assert.equal(AIV_WORKBOOK_SOURCE_INVENTORY_SCHEMA, 'AivWorkbookSourceInventory.v1');
  assert.deepEqual(AIV_WORKBOOK_BASELINE, {
    repository: 'reallaksh19/CRF-4-1',
    commit: '68dc8e1fa2ef67073c59b3afc56f1bf40953d535',
  });
  assert.deepEqual(AIV_RETAINED_WORKBOOKS.map((item) => item.gitBlob), [
    '2566d41c02768a2345513ed42d270b123fe5087c',
    '048332ed93abd258ffced6b83af0ae343dfcbc9d',
    '83eeb40d9b224ddd5020c26410a659e01bcea991',
  ]);
});

test('workbook inventory records formulas, hidden sheets and defined names without granting authority', () => {
  const bytes = fixtureWorkbookBytes();
  const source = {
    workbookId: 'FIXTURE',
    path: 'fixture.xlsx',
    gitBlob: gitBlobSha1Hex(bytes),
  };
  const result = buildAivWorkbookInventory(bytes, source);
  assert.equal(result.summary.gitBlobSha1, `sha1:${source.gitBlob}`);
  assert.equal(result.summary.sheetCount, 2);
  assert.equal(result.summary.formulaCount, 2);
  assert.equal(result.summary.hiddenSheetCount, 1);
  assert.equal(result.summary.definedNameCount, 1);
  assert.equal(result.summary.migrationEvidenceOnly, true);
  assert.equal(result.summary.productionAuthority, false);
  assert.equal(result.summary.formulaImplementationAuthorized, false);
  assert.equal(result.summary.eiReconciliationRequired, true);
  assert(/^sha256:[0-9a-f]{64}$/u.test(result.detailsSha256));
  assert.equal(result.summary.privateDetailsSha256, result.detailsSha256);
  assert.equal(result.details.sheets.find((sheet) => sheet.name === 'HiddenCalc').visibility, 'HIDDEN');
  assert.equal(result.details.sheets.flatMap((sheet) => sheet.formulas).length, 2);
});

test('workbook source inventory rejects a same-name file with different bytes', () => {
  const bytes = fixtureWorkbookBytes();
  assert.throws(
    () => buildAivWorkbookInventory(bytes, {
      workbookId: 'FIXTURE',
      path: 'fixture.xlsx',
      gitBlob: '0'.repeat(40),
    }),
    /AIV_WORKBOOK_SOURCE_MISMATCH/u,
  );
});

test('package exposes retained AIV workbook extraction command', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('package.json', ROOT), 'utf8'));
  assert.equal(pkg.scripts['extract:aiv-workbook-sources'], 'node scripts/extract-aiv-workbook-sources.mjs');
});
