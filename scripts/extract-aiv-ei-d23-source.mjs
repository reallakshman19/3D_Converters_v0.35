import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const AIV_D23_SOURCE_EXTRACTION_SCHEMA = 'AivD23ExamplesSourceExtraction.v1';
export const AIV_D23_EXPECTED_GIT_BLOB = '1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec';
export const AIV_D23_EXPECTED_SIZE_BYTES = 1602640;

const REQUIRED_ANCHORS = Object.freeze([
  Object.freeze({ id: 'RECYCLE_TEMPERATURE_136_7C', pattern: /136\.7/u }),
  Object.freeze({ id: 'RELIEF_SOURCE_PWL_164_7DB', pattern: /164\.7/u }),
  Object.freeze({ id: 'RECYCLE_SOURCE_PWL_159_4DB', pattern: /159\.4/u }),
  Object.freeze({ id: 'DIAMETER_RATIO_INPUTS', pattern: /168\.3\s*\/\s*60\.3/u }),
  Object.freeze({ id: 'DIAMETER_RATIO_2_791', pattern: /2\.791/u }),
  Object.freeze({ id: 'PUBLISHED_FLM1_1_2133', pattern: /1\.2133/u }),
  Object.freeze({ id: 'PUBLISHED_FLM2_0_2009', pattern: /0\.2009/u }),
  Object.freeze({ id: 'PUBLISHED_N_AFTER_FLM2_1_95E9', pattern: /1\.95\s*E\s*9/iu }),
  Object.freeze({ id: 'PUBLISHED_LF_0_31', pattern: /Lf\s*=\s*0\.31/iu }),
  Object.freeze({ id: 'PUBLISHED_LOF_0_29', pattern: /LOF\s*=\s*0\.29/iu }),
]);

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function gitBlobSha1Hex(bytesInput) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function normalizeExpectedGitBlob(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^sha1:/u, '');
}

export function assertExpectedAivD23Pdf(bytesInput, options = {}) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const expectedBlob = normalizeExpectedGitBlob(options.expectedGitBlob ?? AIV_D23_EXPECTED_GIT_BLOB);
  const expectedSizeBytes = options.expectedSizeBytes ?? AIV_D23_EXPECTED_SIZE_BYTES;
  if (!/^[0-9a-f]{40}$/u.test(expectedBlob)) {
    throw new TypeError('AIV_D23_EXPECTED_GIT_BLOB_INVALID: expected a 40-character SHA-1 Git blob id.');
  }
  const actualBlob = gitBlobSha1Hex(bytes);
  if (actualBlob !== expectedBlob) {
    throw new Error(`AIV_D23_SOURCE_MISMATCH: expected Git blob ${expectedBlob}, received ${actualBlob}.`);
  }
  if (expectedSizeBytes !== null && bytes.length !== expectedSizeBytes) {
    throw new Error(`AIV_D23_SOURCE_SIZE_MISMATCH: expected ${expectedSizeBytes} bytes, received ${bytes.length}.`);
  }
  return { gitBlobSha1: actualBlob, sizeBytes: bytes.length };
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').replace(/[ \t]+/gu, ' ');
}

export function splitPdfTextPages(textInput) {
  const chunks = String(textInput ?? '').replace(/\r\n?/gu, '\n').split('\f');
  if (chunks.length && chunks.at(-1).trim() === '') chunks.pop();
  return chunks.map((text, index) => ({ pdfPageNumber: index + 1, text }));
}

export function locateD23Section(pagesInput) {
  const pages = Array.isArray(pagesInput) ? pagesInput : [];
  const headingIndexes = pages
    .map((page, index) => ({ index, text: normalizeText(page.text) }))
    .filter(({ text }) => /D\.2\.3/u.test(text) && /High Frequency Acoustic Excitation/iu.test(text))
    .map(({ index }) => index);
  if (headingIndexes.length !== 1) {
    throw new Error(`AIV_D23_SECTION_HEADING_AMBIGUOUS: expected one D.2.3 heading page, received ${headingIndexes.length}.`);
  }
  const startIndex = headingIndexes[0];
  const sectionParts = [];
  const sectionPages = [];
  for (let index = startIndex; index < pages.length; index += 1) {
    const page = pages[index];
    const normalized = normalizeText(page.text);
    const nextIndex = normalized.search(/D\.2\.4\s+Mechanical Excitation/iu);
    const sectionText = nextIndex >= 0 ? normalized.slice(0, nextIndex) : normalized;
    sectionParts.push(sectionText);
    sectionPages.push(page);
    if (nextIndex >= 0) break;
  }
  const text = sectionParts.join('\n\f\n').trim();
  if (!text || sectionPages.length === 0) {
    throw new Error('AIV_D23_SECTION_EMPTY: D.2.3 section could not be extracted.');
  }
  return { text, pages: sectionPages };
}

export function verifyD23PublishedAnchors(sectionTextInput) {
  const sectionText = normalizeText(sectionTextInput);
  const anchors = REQUIRED_ANCHORS.map(({ id, pattern }) => ({ id, observed: pattern.test(sectionText) }));
  const missing = anchors.filter((anchor) => !anchor.observed).map((anchor) => anchor.id);
  if (missing.length) {
    throw new Error(`AIV_D23_PUBLISHED_ANCHORS_MISSING: ${missing.join(', ')}`);
  }
  return anchors;
}

function toolVersion(binary) {
  const result = spawnSync(binary, ['-v'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') return null;
  return String(result.stderr || result.stdout || '').trim().split(/\r?\n/u)[0] || null;
}

export function extractPdfText(pdfPath, options = {}) {
  const binary = options.binary || 'pdftotext';
  const result = spawnSync(binary, ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') throw new Error(`AIV_PDFTOTEXT_REQUIRED: ${binary} is not installed or not on PATH.`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`AIV_PDFTOTEXT_FAILED: ${String(result.stderr || '').trim() || `exit ${result.status}`}`);
  return { binary, version: toolVersion(binary), pages: splitPdfTextPages(result.stdout) };
}

export function buildAivD23SourceExtractionManifest(bytesInput, extraction, options = {}) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const sourceIdentity = assertExpectedAivD23Pdf(bytes, options);
  const section = locateD23Section(extraction.pages);
  const anchors = verifyD23PublishedAnchors(section.text);
  const sectionBytes = Buffer.from(section.text, 'utf8');
  const pages = section.pages.map((page) => {
    const pageBytes = Buffer.from(page.text, 'utf8');
    return {
      pdfPageNumber: page.pdfPageNumber,
      textSha256: `sha256:${sha256Hex(pageBytes)}`,
      utf8Bytes: pageBytes.length,
      lineCount: page.text === '' ? 0 : page.text.split('\n').length,
    };
  });
  return {
    schema: AIV_D23_SOURCE_EXTRACTION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    source: {
      repository: 'reallaksh19/Common',
      commit: 'fb549185b9b27edc2379734240320a85c5bef9f6',
      fileName: options.fileName || 'EI examples.pdf',
      gitBlobSha1: `sha1:${sourceIdentity.gitBlobSha1}`,
      sizeBytes: sourceIdentity.sizeBytes,
      sha256: `sha256:${sha256Hex(bytes)}`,
    },
    extraction: {
      tool: extraction.binary,
      toolVersion: extraction.version,
      totalPdfPageCount: extraction.pages.length,
      d23PdfPageNumbers: pages.map((page) => page.pdfPageNumber),
      sectionTextSha256: `sha256:${sha256Hex(sectionBytes)}`,
      printedPageLocator: '183-185',
    },
    pages,
    publishedAnchors: anchors,
    qualification: {
      directPinnedPdfExtractionComplete: true,
      publishedFinalLofObserved: true,
      publishedFlm1ArithmeticReconciliationRequired: true,
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
  };
}

function parseArguments(argv) {
  const positional = [];
  const options = { out: null, textOut: null, binary: 'pdftotext' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index] ?? null;
    else if (arg === '--section-text-out') options.textOut = argv[++index] ?? null;
    else if (arg === '--pdftotext') options.binary = argv[++index] ?? null;
    else if (arg.startsWith('--')) throw new TypeError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new TypeError('Usage: node scripts/extract-aiv-ei-d23-source.mjs <EI-examples.pdf> [--out manifest.json] [--section-text-out private-review.txt] [--pdftotext path]');
  }
  return { input: positional[0], ...options };
}

export function runAivD23SourceExtraction(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const inputPath = resolve(args.input);
  const bytes = readFileSync(inputPath);
  const extraction = extractPdfText(inputPath, { binary: args.binary });
  const manifest = buildAivD23SourceExtractionManifest(bytes, extraction, { fileName: basename(inputPath) });
  if (args.textOut) {
    const section = locateD23Section(extraction.pages);
    const textPath = resolve(args.textOut);
    mkdirSync(dirname(textPath), { recursive: true });
    writeFileSync(textPath, section.text, 'utf8');
  }
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (args.out) {
    const outputPath = resolve(args.out);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, json, 'utf8');
    return { manifest, outputPath };
  }
  process.stdout.write(json);
  return { manifest, outputPath: null };
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runAivD23SourceExtraction();
