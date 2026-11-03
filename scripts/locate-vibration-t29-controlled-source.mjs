import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertExpectedControlledPdf,
  extractPdfText,
} from './extract-vibration-master-source.mjs';
import {
  findVibrationMasterSourceEntry,
  validateVibrationMasterSourceRegister,
} from './vibration-master-source-register.mjs';

const MASTER_ID = 'EI_AVIFF.T2.9.VALVE_RECOVERY_FACTORS.v1';
const SCHEMA = 'T29ControlledSourceLocator.v1';

const TOKENS = Object.freeze([
  ['t29', /\bT2\.9\b/giu],
  ['t291', /\bT2\.9\.1\b/giu],
  ['t292', /\bT2\.9\.2\b/giu],
  ['cavitation', /\bcavitation\b/giu],
  ['flashing', /\bflashing\b/giu],
  ['pressureRecovery', /pressure\s+recovery/giu],
  ['recoveryFactor', /recovery\s+factor/giu],
]);

function sha256(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function count(regex, text) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function classifyReason(tokenCounts) {
  if (tokenCounts.t292 > 0) return 'EXPLICIT_T2_9_2_IDENTIFIER';
  if (tokenCounts.t291 > 0) return 'EXPLICIT_T2_9_1_IDENTIFIER';
  if (tokenCounts.t29 > 0) return 'EXPLICIT_T2_9_IDENTIFIER';
  if (tokenCounts.cavitation > 0 && tokenCounts.flashing > 0) return 'CAVITATION_FLASHING_PAIR';
  return null;
}

export function scoreT29TextPage(pdfPageNumber, textInput) {
  if (!Number.isInteger(pdfPageNumber) || pdfPageNumber < 1) {
    throw new TypeError('T29_LOCATOR_PDF_PAGE_INVALID');
  }
  const text = String(textInput ?? '');
  const tokenCounts = Object.fromEntries(TOKENS.map(([key, regex]) => [key, count(regex, text)]));
  const selectionReason = classifyReason(tokenCounts);
  const pairedMechanismTerms = tokenCounts.cavitation > 0 && tokenCounts.flashing > 0;
  const score = (
    tokenCounts.t292 * 100
    + tokenCounts.t291 * 60
    + tokenCounts.t29 * 30
    + tokenCounts.cavitation * 4
    + tokenCounts.flashing * 4
    + tokenCounts.pressureRecovery * 5
    + tokenCounts.recoveryFactor * 5
    + (pairedMechanismTerms ? 20 : 0)
  );
  return {
    pdfPageNumber,
    textSha256: sha256(text),
    utf8Bytes: Buffer.byteLength(text, 'utf8'),
    lineCount: text === '' ? 0 : text.split('\n').length,
    tokenCounts,
    navigationCandidate: selectionReason !== null,
    selectionReason,
    score,
  };
}

export function rankT29NavigationCandidates(pages) {
  if (!Array.isArray(pages)) throw new TypeError('T29_LOCATOR_PAGES_REQUIRED');
  return pages
    .filter((page) => page?.navigationCandidate === true)
    .sort((left, right) => right.score - left.score || left.pdfPageNumber - right.pdfPageNumber);
}

function parseArgs(argv) {
  const args = { input: null, out: null, register: 'docs/Masters/Vibration/source-register.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--out') args.out = argv[++index] ?? null;
    else if (value === '--register') args.register = argv[++index] ?? null;
    else if (value.startsWith('--')) throw new TypeError(`Unknown option: ${value}`);
    else if (args.input === null) args.input = value;
    else throw new TypeError(`Unexpected positional argument: ${value}`);
  }
  if (!args.input || !args.out || !args.register) {
    throw new TypeError('Usage: node scripts/locate-vibration-t29-controlled-source.mjs <controlled.pdf> --out <manifest.json> [--register <source-register.json>]');
  }
  return args;
}

export function locateT29ControlledSource(pdfPath, registerPath) {
  const bytes = readFileSync(resolve(pdfPath));
  const register = validateVibrationMasterSourceRegister(JSON.parse(readFileSync(resolve(registerPath), 'utf8')));
  const { entry, source } = findVibrationMasterSourceEntry(register, MASTER_ID);
  if (!source) throw new Error('T29_CONTROLLED_SOURCE_REQUIRED');
  const identity = assertExpectedControlledPdf(bytes, source);
  const extraction = extractPdfText(resolve(pdfPath));

  const pages = extraction.pages.map(({ pdfPageNumber, text }) => scoreT29TextPage(pdfPageNumber, text));
  const navigationCandidates = rankT29NavigationCandidates(pages);
  if (navigationCandidates.length === 0) throw new Error('T29_CONTROLLED_SECTION_NOT_LOCATED');

  return {
    schema: SCHEMA,
    masterId: MASTER_ID,
    sourceRegisterState: entry.sourceState,
    source: { ...source, ...identity },
    extraction: {
      tool: extraction.binary,
      toolVersion: extraction.version,
      totalPdfPageCount: extraction.pages.length,
    },
    navigationCandidates,
    rankingPolicy: {
      candidateGate: 'EXPLICIT_T2_9_IDENTIFIER_OR_CAVITATION_FLASHING_PAIR',
      genericPressureRecoveryAloneIsCandidate: false,
      reviewerSelectionRequired: true,
    },
    reviewerSelectionRequired: true,
    exactMethodSemanticsAuthorized: false,
    authority: {
      engineeringAuthority: 'NONE',
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
      masterValuesPublished: false,
    },
  };
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifest = locateT29ControlledSource(args.input, args.register);
  writeFileSync(resolve(args.out), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  }
}
