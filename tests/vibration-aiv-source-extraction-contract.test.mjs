import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_T27_EXPECTED_GIT_BLOB,
  AIV_T27_PAGE_RANGE,
  AIV_T27_SOURCE_EXTRACTION_SCHEMA,
  assertExpectedAivT27GitBlob,
  buildAivT27SourceExtractionManifest,
  gitBlobSha1Hex,
  splitExtractedPdfPages,
} from '../scripts/extract-aiv-ei-t27-source.mjs';

const ROOT = new URL('../', import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, ROOT), 'utf8');

test('AIV T2.7 extraction contract is pinned to the controlled Common PDF blob and pages 59-62', () => {
  assert.equal(AIV_T27_EXPECTED_GIT_BLOB, '9d3eccc56429411e17c07a579bdebbd13cb0bdc5');
  assert.deepEqual(AIV_T27_PAGE_RANGE, { first: 59, last: 62 });
  assert.equal(AIV_T27_SOURCE_EXTRACTION_SCHEMA, 'AivT27SourceExtraction.v1');
});

test('Git blob verification is byte-exact and fails closed on a different source', () => {
  const bytes = Buffer.from('controlled-pdf-fixture-bytes', 'utf8');
  const expected = gitBlobSha1Hex(bytes);
  assert.equal(assertExpectedAivT27GitBlob(bytes, expected), expected);
  assert.throws(
    () => assertExpectedAivT27GitBlob(Buffer.from('different', 'utf8'), expected),
    /AIV_T27_SOURCE_MISMATCH/u,
  );
});

test('page splitter requires exactly four page-separated T2.7 pages and ignores trailing break whitespace', () => {
  const pages = splitExtractedPdfPages('page59\fpage60\fpage61\fpage62\f\n');
  assert.deepEqual(pages.map((page) => page.pageNumber), [59, 60, 61, 62]);
  assert.deepEqual(pages.map((page) => page.text), ['page59', 'page60', 'page61', 'page62']);
  assert.throws(() => splitExtractedPdfPages('page59\fpage60\f'), /AIV_T27_PAGE_COUNT_MISMATCH/u);
});

test('manifest records hashes only and cannot authorize production equations', () => {
  const bytes = Buffer.from('controlled-pdf-fixture-bytes', 'utf8');
  const expected = gitBlobSha1Hex(bytes);
  const manifest = buildAivT27SourceExtractionManifest(bytes, {
    binary: 'pdftotext', version: 'pdftotext fixture',
    pages: [59, 60, 61, 62].map((pageNumber) => ({ pageNumber, text: `page-${pageNumber}` })),
  }, { expectedGitBlob: expected, fileName: 'fixture.pdf' });
  assert.equal(manifest.schema, AIV_T27_SOURCE_EXTRACTION_SCHEMA);
  assert.equal(manifest.extraction.pageCount, 4);
  assert.equal(manifest.pages.length, 4);
  assert(manifest.pages.every((page) => /^sha256:[0-9a-f]{64}$/u.test(page.textSha256)));
  assert(manifest.pages.every((page) => !Object.hasOwn(page, 'text')));
  assert.equal(manifest.qualification.productionEquationAuthorized, false);
  assert.equal(manifest.qualification.humanEquationReconciliationRequired, true);
  assert.equal(manifest.qualification.page61OfficialErrataReconciliationRequired, true);
});

test('package exposes the controlled T2.7 extraction command', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.equal(pkg.scripts['extract:aiv-ei-t27-source'], 'node scripts/extract-aiv-ei-t27-source.mjs');
});
