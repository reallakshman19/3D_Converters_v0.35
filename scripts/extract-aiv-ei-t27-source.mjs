import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const AIV_T27_SOURCE_EXTRACTION_SCHEMA = 'AivT27SourceExtraction.v1';
export const AIV_T27_EXPECTED_GIT_BLOB = '9d3eccc56429411e17c07a579bdebbd13cb0bdc5';
export const AIV_T27_PAGE_RANGE = Object.freeze({ first: 59, last: 62 });

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function gitBlobSha1Hex(bytesInput) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function normalizedExpectedGitBlob(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^sha1:/u, '');
}

export function assertExpectedAivT27GitBlob(bytesInput, expected = AIV_T27_EXPECTED_GIT_BLOB) {
  const wanted = normalizedExpectedGitBlob(expected);
  if (!/^[0-9a-f]{40}$/u.test(wanted)) {
    throw new TypeError('AIV_T27_EXPECTED_GIT_BLOB_INVALID: expected a 40-character SHA-1 Git blob id.');
  }
  const actual = gitBlobSha1Hex(bytesInput);
  if (actual !== wanted) {
    throw new Error(`AIV_T27_SOURCE_MISMATCH: expected Git blob ${wanted}, received ${actual}.`);
  }
  return actual;
}

function toolVersion(binary) {
  const result = spawnSync(binary, ['-v'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') return null;
  return String(result.stderr || result.stdout || '').trim().split(/\r?\n/u)[0] || null;
}

export function splitExtractedPdfPages(textInput, firstPage = AIV_T27_PAGE_RANGE.first, lastPage = AIV_T27_PAGE_RANGE.last) {
  const expectedCount = lastPage - firstPage + 1;
  const normalized = String(textInput ?? '').replace(/\r\n?/gu, '\n');
  const chunks = normalized.split('\f');
  if (chunks.length && chunks.at(-1).trim() === '') chunks.pop();
  if (chunks.length !== expectedCount) {
    throw new Error(`AIV_T27_PAGE_COUNT_MISMATCH: expected ${expectedCount} extracted pages, received ${chunks.length}.`);
  }
  return chunks.map((text, index) => ({ pageNumber: firstPage + index, text }));
}

export function extractAivT27Text(pdfPath, options = {}) {
  const binary = options.binary || 'pdftotext';
  const firstPage = options.firstPage ?? AIV_T27_PAGE_RANGE.first;
  const lastPage = options.lastPage ?? AIV_T27_PAGE_RANGE.last;
  const result = spawnSync(binary, [
    '-f', String(firstPage), '-l', String(lastPage), '-layout', pdfPath, '-',
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`AIV_PDFTOTEXT_REQUIRED: ${binary} is not installed or not on PATH.`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`AIV_PDFTOTEXT_FAILED: ${String(result.stderr || '').trim() || `exit ${result.status}`}`);
  }
  return {
    binary,
    version: toolVersion(binary),
    pages: splitExtractedPdfPages(result.stdout, firstPage, lastPage),
  };
}

export function buildAivT27SourceExtractionManifest(bytesInput, extraction, options = {}) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const gitBlobSha1 = assertExpectedAivT27GitBlob(bytes, options.expectedGitBlob);
  const pages = extraction.pages.map(({ pageNumber, text }) => {
    const pageBytes = Buffer.from(text, 'utf8');
    return {
      pageNumber,
      utf8Bytes: pageBytes.length,
      lineCount: text === '' ? 0 : text.split('\n').length,
      textSha256: `sha256:${sha256Hex(pageBytes)}`,
    };
  });
  return {
    schema: AIV_T27_SOURCE_EXTRACTION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    source: {
      fileName: options.fileName || 'EI - AVIFF Guidelines 2nd Edition.pdf',
      sizeBytes: bytes.length,
      sha256: `sha256:${sha256Hex(bytes)}`,
      gitBlobSha1: `sha1:${gitBlobSha1}`,
      repository: 'reallaksh19/Common',
      commit: 'aef163a5def3bfe04ca0ba860da05728a27daf42',
    },
    extraction: {
      tool: extraction.binary,
      toolVersion: extraction.version,
      firstPage: pages[0]?.pageNumber ?? null,
      lastPage: pages.at(-1)?.pageNumber ?? null,
      pageCount: pages.length,
      layoutPreserved: true,
    },
    pages,
    qualification: {
      productionEquationAuthorized: false,
      humanEquationReconciliationRequired: true,
      page61OfficialErrataReconciliationRequired: true,
    },
  };
}

function parseArguments(argv) {
  const positional = [];
  const options = { out: null, textDir: null, expectedGitBlob: AIV_T27_EXPECTED_GIT_BLOB, binary: 'pdftotext' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index] ?? null;
    else if (arg === '--text-dir') options.textDir = argv[++index] ?? null;
    else if (arg === '--expected-git-blob') options.expectedGitBlob = argv[++index] ?? null;
    else if (arg === '--pdftotext') options.binary = argv[++index] ?? null;
    else if (arg.startsWith('--')) throw new TypeError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new TypeError('Usage: node scripts/extract-aiv-ei-t27-source.mjs <EI-AVIFF.pdf> [--out manifest.json] [--text-dir private-review-dir] [--expected-git-blob SHA1] [--pdftotext path]');
  }
  return { input: positional[0], ...options };
}

export function runAivT27SourceExtraction(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const inputPath = resolve(args.input);
  const bytes = readFileSync(inputPath);
  assertExpectedAivT27GitBlob(bytes, args.expectedGitBlob);
  const extraction = extractAivT27Text(inputPath, { binary: args.binary });
  const manifest = buildAivT27SourceExtractionManifest(bytes, extraction, {
    expectedGitBlob: args.expectedGitBlob,
    fileName: basename(inputPath),
  });
  if (args.textDir) {
    const textDir = resolve(args.textDir);
    mkdirSync(textDir, { recursive: true });
    for (const page of extraction.pages) {
      writeFileSync(resolve(textDir, `t2.7-page-${page.pageNumber}.txt`), page.text, 'utf8');
    }
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
if (invokedAsScript) runAivT27SourceExtraction();
