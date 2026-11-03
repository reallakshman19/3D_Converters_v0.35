import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  findVibrationMasterSourceEntry,
  hashVibrationMasterSourceRegister,
  validateVibrationMasterSourceRegister,
} from '../scripts/vibration-master-source-register.mjs';
import {
  VIBRATION_MASTER_SOURCE_REQUEST_SCHEMA,
  assertExpectedControlledPdf,
  buildVibrationMasterSourceExtractionManifest,
  gitBlobSha1Hex,
  splitPdfTextPages,
  validateVibrationMasterSourceExtractionRequest,
} from '../scripts/extract-vibration-master-source.mjs';

const REGISTER_PATH = resolve('docs/Masters/Vibration/source-register.json');
const REQUIRED_MASTER_IDS = Object.freeze([
  'EI_AVIFF.T3.SBC.GEOMETRY_SCORES.v1',
  'EI_AVIFF.T3.SBC.LOCATION_SCORES.v1',
  'EI_AVIFF.T3.SBC.FITTING_SPAN_FACTORS.v1',
  'EI_AVIFF.T3.SBC.FIRST_SPAN_LIMITS.v1',
  'EI_AVIFF.T3.SBC.BETWEEN_MAIN_LINES_LIMITS.v1',
  'EI_AVIFF.T3.SBC.FIGURE_T3_1.v1',
  'EI_AVIFF.T3.SBC.FIGURE_T3_2.v1',
  'EI_AVIFF.T3.SBC.FIGURE_T3_3.v1',
  'EI_AVIFF.T3.SBC.FIGURE_T3_4.v1',
  'EI_AVIFF.T2.8.VALVE_CLOSURE_CHARACTERISTICS.v1',
  'EI_AVIFF.T2.9.VALVE_RECOVERY_FACTORS.v1',
  'EI_AVIFF.T4.WALL_MODIFIER.v1',
  'EI_AVIFF.T4.GEOMETRY_TYPES.v1',
  'EI_AVIFF.T2.4.RECIP_PD_RULES.v1',
  'EI_AVIFF.T2.5.ROTATING_STALL_RULES.v1',
  'EI_AVIFF.T2.6.ADVANCED_DEADLEG.v1',
  'SUBSEA_AVIFF.E4.3.CORRUGATION.v1',
  'SPECIALIST.SLUG.ASSESSMENT.v1',
  'EI_AVIFF.APPENDIX_B.DEFAULTS.v1',
]);

function committedRegister() {
  return JSON.parse(readFileSync(REGISTER_PATH, 'utf8'));
}

function syntheticFixture() {
  const bytes = Buffer.from('%PDF-synthetic-controlled-source\n', 'utf8');
  const source = {
    sourceId: 'SYNTHETIC_SOURCE',
    repository: 'example/source',
    commit: '1'.repeat(40),
    path: 'controlled.pdf',
    gitBlobSha1: `sha1:${gitBlobSha1Hex(bytes)}`,
    sizeBytes: bytes.length,
    edition: 'test-edition',
  };
  const register = {
    schema: 'VibrationMasterSourceRegister.v1',
    registerRevision: 'test',
    controlledSources: [source],
    entries: [{
      masterId: 'TEST.MASTER.v1',
      mechanismId: 'testMechanism',
      dataType: 'TABLE',
      sourceState: 'SOURCE_PINNED',
      sourceRef: source.sourceId,
      locator: null,
      extractionReceipt: null,
      notes: 'synthetic only',
    }],
    authority: {
      engineeringAuthority: 'NONE',
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
      statement: 'SOURCE_REGISTER_ONLY',
    },
  };
  const request = {
    schema: VIBRATION_MASTER_SOURCE_REQUEST_SCHEMA,
    masterId: 'TEST.MASTER.v1',
    pdfPages: [2],
    locator: { identifier: 'Synthetic Table', section: 'T-X', printedPage: '10' },
    requiredAnchors: [
      { id: 'A1', text: 'Unique Anchor', expectedOccurrences: 1 },
      { id: 'A2', text: 'SECOND anchor', expectedOccurrences: 1, caseSensitive: false },
    ],
  };
  const extraction = {
    binary: 'fake-pdftotext',
    version: 'fake-pdftotext 1.0',
    pages: splitPdfTextPages('Cover page\fSynthetic Table\nUnique   Anchor\nSecond anchor\fEnd page\f'),
  };
  return { bytes, source, register, request, extraction };
}

test('committed register covers the #450 source-governance target set without duplicates', () => {
  const register = validateVibrationMasterSourceRegister(committedRegister());
  assert.equal(register.entries.length, REQUIRED_MASTER_IDS.length);
  assert.deepEqual(new Set(register.entries.map(({ masterId }) => masterId)), new Set(REQUIRED_MASTER_IDS));
});

test('controlled EI source identity is pinned exactly once', () => {
  const register = validateVibrationMasterSourceRegister(committedRegister());
  assert.equal(register.controlledSources.length, 1);
  assert.deepEqual(register.controlledSources[0], {
    sourceId: 'EI_AVIFF_2E_GUIDANCE',
    repository: 'reallaksh19/Common',
    commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
    path: 'EI - AVIFF Guidelines 2nd Edition.pdf',
    gitBlobSha1: 'sha1:9d3eccc56429411e17c07a579bdebbd13cb0bdc5',
    sizeBytes: 10348594,
    edition: '2nd Edition',
  });
});

test('blocked-source entries contain no fake source or locator', () => {
  const register = validateVibrationMasterSourceRegister(committedRegister());
  const blocked = register.entries.filter(({ sourceState }) => sourceState === 'BLOCKED_SOURCE');
  assert.equal(blocked.length, 3);
  for (const entry of blocked) {
    assert.equal(entry.sourceRef, null);
    assert.equal(entry.locator, null);
    assert.equal(entry.extractionReceipt, null);
  }
});

test('navigation locators do not pretend PDF-page/hash qualification', () => {
  const register = validateVibrationMasterSourceRegister(committedRegister());
  const navigation = register.entries.filter(({ locator }) => locator?.locatorStatus === 'NAVIGATION_ONLY');
  assert(navigation.length > 0);
  for (const entry of navigation) {
    assert.deepEqual(entry.locator.pdfPages, []);
    assert.equal(entry.extractionReceipt, null);
  }
});

test('register hash is deterministic across object-key ordering', () => {
  const register = committedRegister();
  const reordered = {
    authority: register.authority,
    entries: register.entries,
    controlledSources: register.controlledSources,
    registerRevision: register.registerRevision,
    schema: register.schema,
  };
  assert.equal(hashVibrationMasterSourceRegister(register), hashVibrationMasterSourceRegister(reordered));
});

test('source register fails on unknown source reference', () => {
  const register = syntheticFixture().register;
  register.entries[0].sourceRef = 'MISSING';
  assert.throws(() => validateVibrationMasterSourceRegister(register), /VIBRATION_SOURCE_REGISTER_SOURCE_REF_UNKNOWN/u);
});

test('source byte verification rejects wrong blob and wrong size', () => {
  const { bytes, source } = syntheticFixture();
  assert.deepEqual(assertExpectedControlledPdf(bytes, source).sizeBytes, bytes.length);
  assert.throws(
    () => assertExpectedControlledPdf(Buffer.from('wrong'), source),
    /VIBRATION_SOURCE_MISMATCH/u,
  );
  assert.throws(
    () => assertExpectedControlledPdf(bytes, { ...source, sizeBytes: bytes.length + 1 }),
    /VIBRATION_SOURCE_SIZE_MISMATCH/u,
  );
});

test('request requires strictly increasing explicit pages and unique anchors', () => {
  const { request } = syntheticFixture();
  assert.deepEqual(validateVibrationMasterSourceExtractionRequest(request).pdfPages, [2]);
  assert.throws(
    () => validateVibrationMasterSourceExtractionRequest({ ...request, pdfPages: [2, 2] }),
    /VIBRATION_SOURCE_REQUEST_PDF_PAGES_INVALID/u,
  );
  assert.throws(
    () => validateVibrationMasterSourceExtractionRequest({
      ...request,
      requiredAnchors: [request.requiredAnchors[0], request.requiredAnchors[0]],
    }),
    /VIBRATION_SOURCE_REQUEST_ANCHOR_ID_DUPLICATE/u,
  );
});

test('manifest hashes selected pages/section and never republishes anchor/source text', () => {
  const { bytes, register, request, extraction } = syntheticFixture();
  const manifest = buildVibrationMasterSourceExtractionManifest(bytes, register, request, extraction);
  assert.equal(manifest.pages.length, 1);
  assert.equal(manifest.pages[0].pdfPageNumber, 2);
  assert.match(manifest.extraction.selectedTextSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(manifest.anchors[0].observedOccurrences, 1);
  assert.equal(manifest.authority.masterValuesPublished, false);
  const serialized = JSON.stringify(manifest);
  assert(!serialized.includes('Unique Anchor'));
  assert(!serialized.includes('Second anchor'));
  assert(!serialized.includes('Synthetic Table\n'));
});

test('anchor occurrence mismatch fails closed for missing and repeated content', () => {
  const fixture = syntheticFixture();
  assert.throws(
    () => buildVibrationMasterSourceExtractionManifest(
      fixture.bytes,
      fixture.register,
      { ...fixture.request, requiredAnchors: [{ id: 'MISS', text: 'Absent', expectedOccurrences: 1 }] },
      fixture.extraction,
    ),
    /VIBRATION_SOURCE_ANCHOR_OCCURRENCE_MISMATCH/u,
  );
  const repeated = {
    ...fixture.extraction,
    pages: splitPdfTextPages('Cover\fUnique Anchor\nUnique Anchor\fEnd\f'),
  };
  assert.throws(
    () => buildVibrationMasterSourceExtractionManifest(
      fixture.bytes,
      fixture.register,
      { ...fixture.request, requiredAnchors: [{ id: 'A1', text: 'Unique Anchor', expectedOccurrences: 1 }] },
      repeated,
    ),
    /expected 1, observed 2/u,
  );
});

test('request page outside extracted PDF fails closed', () => {
  const fixture = syntheticFixture();
  assert.throws(
    () => buildVibrationMasterSourceExtractionManifest(
      fixture.bytes,
      fixture.register,
      { ...fixture.request, pdfPages: [9] },
      fixture.extraction,
    ),
    /VIBRATION_SOURCE_REQUEST_PAGE_OUT_OF_RANGE/u,
  );
});

test('register navigation locator must agree with reviewer extraction request', () => {
  const fixture = syntheticFixture();
  fixture.register.entries[0].locator = {
    identifier: 'Table X-1', section: 'T-X', printedPage: '10', pdfPages: [], locatorStatus: 'NAVIGATION_ONLY',
  };
  assert.throws(
    () => buildVibrationMasterSourceExtractionManifest(fixture.bytes, fixture.register, fixture.request, fixture.extraction),
    /VIBRATION_SOURCE_REQUEST_LOCATOR_MISMATCH: identifier/u,
  );
});

test('blocked source cannot be extracted even with synthetic bytes', () => {
  const fixture = syntheticFixture();
  fixture.register.entries[0] = {
    ...fixture.register.entries[0], sourceState: 'BLOCKED_SOURCE', sourceRef: null, locator: null,
  };
  assert.throws(
    () => buildVibrationMasterSourceExtractionManifest(fixture.bytes, fixture.register, fixture.request, fixture.extraction),
    /VIBRATION_SOURCE_CONTROLLED_SOURCE_REQUIRED|VIBRATION_SOURCE_ENTRY_NOT_EXTRACTABLE/u,
  );
});

test('CLI uses fake pdftotext, writes hash-only receipt, and keeps review text private', () => {
  const fixture = syntheticFixture();
  const dir = mkdtempSync(join(tmpdir(), 'vibration-source-extractor-'));
  const pdfPath = join(dir, 'controlled.pdf');
  const registerPath = join(dir, 'register.json');
  const requestPath = join(dir, 'request.json');
  const outputPath = join(dir, 'receipt.json');
  const reviewPath = join(dir, 'review.txt');
  const fake = join(dir, 'fake-pdftotext');
  writeFileSync(pdfPath, fixture.bytes);
  writeFileSync(registerPath, `${JSON.stringify(fixture.register, null, 2)}\n`);
  writeFileSync(requestPath, `${JSON.stringify(fixture.request, null, 2)}\n`);
  writeFileSync(fake, `#!/usr/bin/env node\nif (process.argv.includes('-v')) { process.stderr.write('fake-pdftotext 1.0\\n'); process.exit(0); }\nprocess.stdout.write('Cover page\\fSynthetic Table\\nUnique   Anchor\\nSecond anchor\\fEnd page\\f');\n`);
  chmodSync(fake, 0o755);
  const script = resolve('scripts/extract-vibration-master-source.mjs');
  const result = spawnSync(process.execPath, [
    script, pdfPath,
    '--register', registerPath,
    '--request', requestPath,
    '--out', outputPath,
    '--private-review-out', reviewPath,
    '--pdftotext', fake,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const receiptText = readFileSync(outputPath, 'utf8');
  const receipt = JSON.parse(receiptText);
  assert.equal(receipt.schema, 'VibrationMasterSourceExtraction.v1');
  assert.equal(receipt.extraction.toolVersion, 'fake-pdftotext 1.0');
  assert(!receiptText.includes('Unique Anchor'));
  assert.match(readFileSync(reviewPath, 'utf8'), /Unique   Anchor/u);
});

test('find helper returns the pinned source but never invents one for blocked entries', () => {
  const register = committedRegister();
  assert.equal(findVibrationMasterSourceEntry(register, 'EI_AVIFF.T3.SBC.FITTING_SPAN_FACTORS.v1').source.sourceId, 'EI_AVIFF_2E_GUIDANCE');
  assert.equal(findVibrationMasterSourceEntry(register, 'SPECIALIST.SLUG.ASSESSMENT.v1').source, null);
});
