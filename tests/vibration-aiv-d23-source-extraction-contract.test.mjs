import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AIV_D23_EXPECTED_GIT_BLOB,
  AIV_D23_EXPECTED_SIZE_BYTES,
  AIV_D23_SOURCE_EXTRACTION_SCHEMA,
  assertExpectedAivD23Pdf,
  buildAivD23SourceExtractionManifest,
  gitBlobSha1Hex,
  locateD23Section,
  splitPdfTextPages,
  verifyD23PublishedAnchors,
} from '../scripts/extract-aiv-ei-d23-source.mjs';

const ROOT = new URL('../', import.meta.url);
const D23 = `D.2.3 High Frequency Acoustic Excitation (see T2.7)
Recycle temperature 136.7 deg C
Relief PWL 164.7 dB
Recycle PWL 159.4 dB
Calculate Dext/dext (= 168.3 / 60.3) = 2.791
As this is <10 calculate FLM1 (= 1.2133)
As the connection is a weldolet, calculate FLM2 = 0.2009
Calculate new N = 1.95E9
The piping material is not duplex therefore calculate Lf = 0.31
As Lf < 0.5 then LOF = 0.29`;

test('D2.3 extraction contract is pinned to the requested Common PDF object', () => {
  assert.equal(AIV_D23_SOURCE_EXTRACTION_SCHEMA, 'AivD23ExamplesSourceExtraction.v1');
  assert.equal(AIV_D23_EXPECTED_GIT_BLOB, '1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec');
  assert.equal(AIV_D23_EXPECTED_SIZE_BYTES, 1602640);
});

test('byte identity fails closed and can be fixture-tested with an explicit expected identity', () => {
  const bytes = Buffer.from('fixture-pdf-bytes', 'utf8');
  const expectedBlob = gitBlobSha1Hex(bytes);
  assert.deepEqual(assertExpectedAivD23Pdf(bytes, { expectedGitBlob: expectedBlob, expectedSizeBytes: bytes.length }), {
    gitBlobSha1: expectedBlob,
    sizeBytes: bytes.length,
  });
  assert.throws(
    () => assertExpectedAivD23Pdf(Buffer.from('other', 'utf8'), { expectedGitBlob: expectedBlob, expectedSizeBytes: bytes.length }),
    /AIV_D23_SOURCE_MISMATCH/u,
  );
});

test('D2.3 locator cuts the section before D.2.4 and rejects ambiguous headings', () => {
  const pages = splitPdfTextPages(`front\f${D23}\fcontinued text\nD.2.4 Mechanical Excitation (see T2.3)\nignored\f`);
  const section = locateD23Section(pages);
  assert.deepEqual(section.pages.map((page) => page.pdfPageNumber), [2, 3]);
  assert.match(section.text, /LOF = 0\.29/u);
  assert.doesNotMatch(section.text, /Mechanical Excitation/u);
  assert.throws(
    () => locateD23Section(splitPdfTextPages(`${D23}\f${D23}\f`)),
    /AIV_D23_SECTION_HEADING_AMBIGUOUS/u,
  );
});

test('published anchor verification includes the final LOF and FLM1 discrepancy inputs', () => {
  const anchors = verifyD23PublishedAnchors(D23);
  assert.equal(anchors.length, 10);
  assert(anchors.every((anchor) => anchor.observed));
  assert.throws(
    () => verifyD23PublishedAnchors(D23.replace('1.2133', 'missing')),
    /PUBLISHED_FLM1_1_2133/u,
  );
});

test('manifest is hash-only evidence and never promotes AIV numerical authority', () => {
  const bytes = Buffer.from('fixture-pdf-bytes', 'utf8');
  const expectedBlob = gitBlobSha1Hex(bytes);
  const pages = splitPdfTextPages(`front\f${D23}\fcontinued\nD.2.4 Mechanical Excitation (see T2.3)\nignored\f`);
  const manifest = buildAivD23SourceExtractionManifest(bytes, {
    binary: 'pdftotext',
    version: 'fixture',
    pages,
  }, {
    expectedGitBlob: expectedBlob,
    expectedSizeBytes: bytes.length,
    fileName: 'fixture.pdf',
  });
  assert.equal(manifest.schema, AIV_D23_SOURCE_EXTRACTION_SCHEMA);
  assert.equal(manifest.source.gitBlobSha1, `sha1:${expectedBlob}`);
  assert.equal(manifest.qualification.directPinnedPdfExtractionComplete, true);
  assert.equal(manifest.qualification.publishedFinalLofObserved, true);
  assert.equal(manifest.qualification.publishedFlm1ArithmeticReconciliationRequired, true);
  assert.equal(manifest.qualification.productionEquationAuthorized, false);
  assert.equal(manifest.qualification.screeningAuthority, 'NOT_AUTHORIZED');
  assert(/^sha256:[0-9a-f]{64}$/u.test(manifest.extraction.sectionTextSha256));
  assert(!JSON.stringify(manifest).includes('High Frequency Acoustic Excitation'));
  assert(!Object.hasOwn(manifest, 'text'));
});

test('package exposes the controlled D2.3 extraction command', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('package.json', ROOT), 'utf8'));
  assert.equal(pkg.scripts['extract:aiv-ei-d23-source'], 'node scripts/extract-aiv-ei-d23-source.mjs');
});
