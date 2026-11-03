import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  FIT_WORKBOOK_SOURCE_INVENTORY_SCHEMA,
  assertExpectedFitWorkbookGitBlob,
  buildFitWorkbookSourceInventory,
} from '../scripts/extract-fit-workbook-source.mjs';

function fixtureWorkbookBytes() {
  const workbook = XLSX.utils.book_new();
  const inputs = XLSX.utils.aoa_to_sheet([
    ['Outside diameter', 168.3, 'mm'],
    ['Wall thickness', 7.11, 'mm'],
    ['Inside diameter', null, 'mm'],
    ['Mechanism', 'FIT', null],
  ]);
  inputs.B3 = { t: 'n', f: 'B1-2*B2', v: 154.08, z: '0.00' };
  const calculations = XLSX.utils.aoa_to_sheet([
    ['Area', null, 'mm2'],
    ['Status', 'REFERENCE_ONLY', null],
  ]);
  calculations.B1 = { t: 'n', f: 'PI()*Inputs!B3^2/4', v: 18646.2, z: '0.0' };
  XLSX.utils.book_append_sheet(workbook, inputs, 'Inputs');
  XLSX.utils.book_append_sheet(workbook, calculations, 'Calculations');
  workbook.Workbook = workbook.Workbook ?? {};
  workbook.Workbook.Names = [{ Name: 'FIT_OD', Ref: 'Inputs!$B$1' }];
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsm' }));
}

test('FIT workbook extractor returns deterministic source hashes, names, cells and formulas', () => {
  const bytes = fixtureWorkbookBytes();
  const first = buildFitWorkbookSourceInventory(bytes, { fileName: 'FIT-fixture.xlsm' });
  const second = buildFitWorkbookSourceInventory(bytes, { fileName: 'FIT-fixture.xlsm' });

  assert.deepEqual(first, second);
  assert.equal(first.schema, FIT_WORKBOOK_SOURCE_INVENTORY_SCHEMA);
  assert.equal(first.source.fileName, 'FIT-fixture.xlsm');
  assert.equal(first.source.sizeBytes, bytes.length);
  assert.match(first.source.sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(first.source.gitBlobSha1, /^sha1:[0-9a-f]{40}$/u);
  assert.deepEqual(first.definedNames, [{
    name: 'FIT_OD', ref: 'Inputs!$B$1', sheetIndex: null, hidden: false, comment: null,
  }]);

  const inputs = first.sheets.find((sheet) => sheet.name === 'Inputs');
  assert.equal(inputs.formulaCount, 1);
  assert.equal(inputs.cells.find((cell) => cell.address === 'B3').formula, 'B1-2*B2');
  const calculations = first.sheets.find((sheet) => sheet.name === 'Calculations');
  assert.equal(calculations.cells.find((cell) => cell.address === 'B1').formula, 'PI()*Inputs!B3^2/4');
});

test('formulas-only extraction removes constants while retaining formula source context', () => {
  const inventory = buildFitWorkbookSourceInventory(fixtureWorkbookBytes(), {
    fileName: 'FIT-fixture.xlsm',
    formulasOnly: true,
  });

  assert.equal(inventory.extraction.formulasOnly, true);
  assert(inventory.sheets.every((sheet) => sheet.cells.every((cell) => cell.formula !== null)));
  assert.equal(inventory.sheets.find((sheet) => sheet.name === 'Inputs').cellCount, 11);
  assert.equal(inventory.sheets.find((sheet) => sheet.name === 'Inputs').cells.length, 1);
});

test('expected Git blob verification passes exact source identity and fails closed on mismatch', () => {
  const inventory = buildFitWorkbookSourceInventory(fixtureWorkbookBytes());
  const actual = inventory.source.gitBlobSha1;
  assert.equal(assertExpectedFitWorkbookGitBlob(inventory, actual), inventory);
  assert.equal(assertExpectedFitWorkbookGitBlob(inventory, actual.replace('sha1:', '')), inventory);
  assert.throws(
    () => assertExpectedFitWorkbookGitBlob(inventory, '0000000000000000000000000000000000000000'),
    /FIT_WORKBOOK_SOURCE_MISMATCH/u,
  );
  assert.throws(
    () => assertExpectedFitWorkbookGitBlob(inventory, 'not-a-sha'),
    /FIT_WORKBOOK_EXPECTED_GIT_BLOB_INVALID/u,
  );
});
