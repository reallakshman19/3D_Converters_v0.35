import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  findVibrationMasterSourceEntry,
  hashVibrationMasterSourceRegister,
  validateVibrationMasterSourceRegister,
} from './vibration-master-source-register.mjs';
export const VIBRATION_MASTER_SOURCE_EXTRACTION_SCHEMA = 'VibrationMasterSourceExtraction.v1';
export const VIBRATION_MASTER_SOURCE_REQUEST_SCHEMA = 'VibrationMasterSourceExtractionRequest.v1';
const REQUEST_FIELDS = new Set(['schema', 'masterId', 'pdfPages', 'locator', 'requiredAnchors']);
const LOCATOR_FIELDS = new Set(['identifier', 'section', 'printedPage']);
const ANCHOR_FIELDS = new Set(['id', 'text', 'expectedOccurrences', 'caseSensitive']);
function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function gitBlobSha1Hex(bytesInput) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}
function normalizeBlob(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^sha1:/u, '');
}
export function assertExpectedControlledPdf(bytesInput, source) {
  const bytes = Buffer.isBuffer(bytesInput) ? bytesInput : Buffer.from(bytesInput);
  const expectedBlob = normalizeBlob(source?.gitBlobSha1);
  if (!/^[0-9a-f]{40}$/u.test(expectedBlob)) throw new TypeError('VIBRATION_SOURCE_EXPECTED_GIT_BLOB_INVALID');
  const actualBlob = gitBlobSha1Hex(bytes);
  if (actualBlob !== expectedBlob) {
    throw new Error(`VIBRATION_SOURCE_MISMATCH: expected Git blob ${expectedBlob}, received ${actualBlob}`);
  }
  if (!Number.isInteger(source?.sizeBytes) || bytes.length !== source.sizeBytes) {
    throw new Error(`VIBRATION_SOURCE_SIZE_MISMATCH: expected ${source?.sizeBytes}, received ${bytes.length}`);
  }
  return {
    gitBlobSha1: `sha1:${actualBlob}`,
    sizeBytes: bytes.length,
    sha256: `sha256:${sha256Hex(bytes)}`,
  };
}
function assertPlainObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}
function assertKnownFields(value, allowed, code) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${code}: ${key}`);
}
function requireText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(code);
  return value.trim();
}
function normalizePdfPages(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('VIBRATION_SOURCE_REQUEST_PDF_PAGES_REQUIRED');
  let previous = 0;
  return value.map((page) => {
    if (!Number.isInteger(page) || page < 1 || page <= previous) {
      throw new TypeError('VIBRATION_SOURCE_REQUEST_PDF_PAGES_INVALID');
    }
    previous = page;
    return page;
  });
}
function normalizeRequestLocator(value) {
  assertPlainObject(value, 'VIBRATION_SOURCE_REQUEST_LOCATOR_REQUIRED');
  assertKnownFields(value, LOCATOR_FIELDS, 'VIBRATION_SOURCE_REQUEST_LOCATOR_FIELD_UNKNOWN');
  return {
    identifier: requireText(value.identifier, 'VIBRATION_SOURCE_REQUEST_IDENTIFIER_REQUIRED'),
    section: value.section === undefined ? null : requireText(value.section, 'VIBRATION_SOURCE_REQUEST_SECTION_INVALID'),
    printedPage: value.printedPage === undefined ? null : requireText(value.printedPage, 'VIBRATION_SOURCE_REQUEST_PRINTED_PAGE_INVALID'),
  };
}
function normalizeAnchor(value) {
  assertPlainObject(value, 'VIBRATION_SOURCE_REQUEST_ANCHOR_INVALID');
  assertKnownFields(value, ANCHOR_FIELDS, 'VIBRATION_SOURCE_REQUEST_ANCHOR_FIELD_UNKNOWN');
  const expectedOccurrences = value.expectedOccurrences ?? 1;
  if (!Number.isInteger(expectedOccurrences) || expectedOccurrences < 1) {
    throw new TypeError('VIBRATION_SOURCE_REQUEST_ANCHOR_OCCURRENCES_INVALID');
  }
  return {
    id: requireText(value.id, 'VIBRATION_SOURCE_REQUEST_ANCHOR_ID_REQUIRED'),
    text: requireText(value.text, 'VIBRATION_SOURCE_REQUEST_ANCHOR_TEXT_REQUIRED'),
    expectedOccurrences,
    caseSensitive: value.caseSensitive === true,
  };
}
export function validateVibrationMasterSourceExtractionRequest(raw) {
  assertPlainObject(raw, 'VIBRATION_SOURCE_REQUEST_INVALID');
  assertKnownFields(raw, REQUEST_FIELDS, 'VIBRATION_SOURCE_REQUEST_FIELD_UNKNOWN');
  if (raw.schema !== VIBRATION_MASTER_SOURCE_REQUEST_SCHEMA) throw new TypeError('VIBRATION_SOURCE_REQUEST_SCHEMA_INVALID');
  if (!Array.isArray(raw.requiredAnchors) || raw.requiredAnchors.length === 0) {
    throw new TypeError('VIBRATION_SOURCE_REQUEST_ANCHORS_REQUIRED');
  }
  const requiredAnchors = raw.requiredAnchors.map(normalizeAnchor);
  const ids = requiredAnchors.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new TypeError('VIBRATION_SOURCE_REQUEST_ANCHOR_ID_DUPLICATE');
  return {
    schema: raw.schema,
    masterId: requireText(raw.masterId, 'VIBRATION_SOURCE_REQUEST_MASTER_ID_REQUIRED'),
    pdfPages: normalizePdfPages(raw.pdfPages),
    locator: normalizeRequestLocator(raw.locator),
    requiredAnchors,
  };
}
function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').replace(/[ \t]+/gu, ' ').trim();
}
export function splitPdfTextPages(textInput) {
  const chunks = String(textInput ?? '').replace(/\r\n?/gu, '\n').split('\f');
  if (chunks.length && chunks.at(-1).trim() === '') chunks.pop();
  return chunks.map((text, index) => ({ pdfPageNumber: index + 1, text }));
}
function toolVersion(binary) {
  const result = spawnSync(binary, ['-v'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') return null;
  return String(result.stderr || result.stdout || '').trim().split(/\r?\n/u)[0] || null;
}
export function extractPdfText(pdfPath, options = {}) {
  const binary = options.binary || 'pdftotext';
  const result = spawnSync(binary, ['-layout', pdfPath, '-'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') throw new Error(`VIBRATION_SOURCE_PDFTOTEXT_REQUIRED: ${binary}`);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`VIBRATION_SOURCE_PDFTOTEXT_FAILED: ${String(result.stderr || '').trim() || `exit ${result.status}`}`);
  }
  return { binary, version: toolVersion(binary), pages: splitPdfTextPages(result.stdout) };
}
function assertRequestAllowed(entry, request) {
  if (['BLOCKED_SOURCE', 'SOURCE_NOT_LOCATED', 'RETIRED'].includes(entry.sourceState)) {
    throw new Error(`VIBRATION_SOURCE_ENTRY_NOT_EXTRACTABLE: ${entry.sourceState}`);
  }
  if (entry.masterId !== request.masterId) throw new Error('VIBRATION_SOURCE_REQUEST_MASTER_MISMATCH');
  const navigation = entry.locator;
  if (!navigation) return;
  for (const key of ['identifier', 'section', 'printedPage']) {
    if (navigation[key] !== null && navigation[key] !== request.locator[key]) {
      throw new Error(`VIBRATION_SOURCE_REQUEST_LOCATOR_MISMATCH: ${key}`);
    }
  }
}
function selectPages(extractionPages, selectedNumbers) {
  return selectedNumbers.map((pdfPageNumber) => {
    const page = extractionPages.find((item) => item.pdfPageNumber === pdfPageNumber);
    if (!page) throw new Error(`VIBRATION_SOURCE_REQUEST_PAGE_OUT_OF_RANGE: ${pdfPageNumber}`);
    return page;
  });
}
function countLiteral(text, needle, caseSensitive) {
  const haystack = caseSensitive ? text : text.toLocaleLowerCase('en-US');
  const target = caseSensitive ? needle : needle.toLocaleLowerCase('en-US');
  let count = 0;
  let offset = 0;
  while (true) {
    const index = haystack.indexOf(target, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + target.length;
  }
}
export function verifyRequiredAnchors(selectedTextInput, anchors) {
  const selectedText = normalizeText(selectedTextInput);
  return anchors.map((anchor) => {
    const anchorText = normalizeText(anchor.text);
    const observedOccurrences = countLiteral(selectedText, anchorText, anchor.caseSensitive);
    if (observedOccurrences !== anchor.expectedOccurrences) {
      throw new Error(`VIBRATION_SOURCE_ANCHOR_OCCURRENCE_MISMATCH: ${anchor.id} expected ${anchor.expectedOccurrences}, observed ${observedOccurrences}`);
    }
    return {
      id: anchor.id,
      expectedOccurrences: anchor.expectedOccurrences,
      observedOccurrences,
      caseSensitive: anchor.caseSensitive,
      anchorTextSha256: `sha256:${sha256Hex(Buffer.from(anchorText, 'utf8'))}`,
    };
  });
}
export function buildVibrationMasterSourceExtractionManifest(bytesInput, registerRaw, requestRaw, extraction) {
  const request = validateVibrationMasterSourceExtractionRequest(requestRaw);
  const { register, entry, source } = findVibrationMasterSourceEntry(registerRaw, request.masterId);
  assertRequestAllowed(entry, request);
  if (!source) throw new Error('VIBRATION_SOURCE_CONTROLLED_SOURCE_REQUIRED');
  const sourceIdentity = assertExpectedControlledPdf(bytesInput, source);
  const selectedPages = selectPages(extraction.pages, request.pdfPages);
  const selectedText = selectedPages.map(({ text }) => text).join('\n\f\n');
  const anchors = verifyRequiredAnchors(selectedText, request.requiredAnchors);
  const pages = selectedPages.map((page) => {
    const bytes = Buffer.from(page.text, 'utf8');
    return {
      pdfPageNumber: page.pdfPageNumber,
      textSha256: `sha256:${sha256Hex(bytes)}`,
      utf8Bytes: bytes.length,
      lineCount: page.text === '' ? 0 : page.text.split('\n').length,
    };
  });
  return {
    schema: VIBRATION_MASTER_SOURCE_EXTRACTION_SCHEMA,
    masterId: entry.masterId,
    mechanismId: entry.mechanismId,
    dataType: entry.dataType,
    sourceRegisterHash: hashVibrationMasterSourceRegister(register),
    source: { ...source, ...sourceIdentity },
    locator: {
      ...request.locator,
      pdfPages: [...request.pdfPages],
      selectionBasis: 'EXPLICIT_REVIEWER_SELECTION',
    },
    extraction: {
      tool: extraction.binary,
      toolVersion: extraction.version,
      totalPdfPageCount: extraction.pages.length,
      selectedTextSha256: `sha256:${sha256Hex(Buffer.from(selectedText, 'utf8'))}`,
    },
    pages,
    anchors,
    authority: {
      engineeringAuthority: 'NONE',
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
      masterValuesPublished: false,
      purpose: 'SOURCE_EXTRACTION_EVIDENCE_ONLY',
    },
  };
}
function loadJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}
function writeText(path, value) {
  const output = resolve(path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, value, 'utf8');
  return output;
}
function parseArguments(argv) {
  const positional = [];
  const args = {
    register: 'docs/Masters/Vibration/source-register.json',
    request: null, out: null, privateReviewOut: null, binary: 'pdftotext',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--register') args.register = argv[++index] ?? null;
    else if (arg === '--request') args.request = argv[++index] ?? null;
    else if (arg === '--out') args.out = argv[++index] ?? null;
    else if (arg === '--private-review-out') args.privateReviewOut = argv[++index] ?? null;
    else if (arg === '--pdftotext') args.binary = argv[++index] ?? null;
    else if (arg.startsWith('--')) throw new TypeError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1 || !args.register || !args.request || !args.out) {
    throw new TypeError('Usage: node scripts/extract-vibration-master-source.mjs <controlled.pdf> --request <request.json> --out <receipt.json> [--register source-register.json] [--private-review-out review.txt] [--pdftotext path]');
  }
  return { input: positional[0], ...args };
}
export function runVibrationMasterSourceExtraction(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const inputPath = resolve(args.input);
  const bytes = readFileSync(inputPath);
  const register = validateVibrationMasterSourceRegister(loadJson(args.register));
  const request = loadJson(args.request);
  const extraction = extractPdfText(inputPath, { binary: args.binary });
  const manifest = buildVibrationMasterSourceExtractionManifest(bytes, register, request, extraction);
  if (args.privateReviewOut) {
    const selected = selectPages(extraction.pages, request.pdfPages).map(({ text }) => text).join('\n\f\n');
    writeText(args.privateReviewOut, selected);
  }
  writeText(args.out, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  try {
    runVibrationMasterSourceExtraction();
  } catch (error) {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  }
}
