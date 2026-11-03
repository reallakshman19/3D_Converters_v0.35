import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  discoverDocumentEvidenceTables,
  extractDocumentEvidenceTables,
} from './vibration-stage5c-document-evidence-client.mjs';
import {
  VIBRATION_STAGE5C_AUTHORITY,
  buildStage5cSourceBinding,
  buildStage5cSourceTargetDecision,
} from './vibration-stage5c-evidence-receipt.mjs';
import {
  CONTROLLED_EI_SOURCE,
  VIBRATION_STAGE5C_TABLE_TARGETS,
  assertControlledEiSource,
  validateStage5cSelectionDocument,
} from './vibration-stage5c-targets.mjs';

export const VIBRATION_STAGE5C_DISCOVERY_SCHEMA = 'VibrationStage5cEvidenceDiscovery.v1';
export const VIBRATION_STAGE5C_RECOVERY_SCHEMA = 'VibrationStage5cEvidenceRecovery.v1';

function controlledSourcePath(value) {
  const path = value ?? CONTROLLED_EI_SOURCE.apiSourcePath;
  if (path !== CONTROLLED_EI_SOURCE.apiSourcePath) {
    throw new Error('VIBRATION_STAGE5C_CONTROLLED_SOURCE_PATH_MISMATCH');
  }
  return path;
}

export async function discoverVibrationStage5cEvidence(options = {}) {
  const sourcePath = controlledSourcePath(options.sourcePath);
  const result = await discoverDocumentEvidenceTables({
    baseUrl: options.baseUrl,
    sourcePath,
    fetchImpl: options.fetchImpl,
  });
  assertControlledEiSource(result.source);
  return {
    schema: VIBRATION_STAGE5C_DISCOVERY_SCHEMA,
    source: result.source,
    sourceBinding: buildStage5cSourceBinding(result.source),
    candidates: result.candidates,
    diagnostics: result.diagnostics,
    supportedTableTargets: VIBRATION_STAGE5C_TABLE_TARGETS,
    selectionAuthority: 'EXPLICIT_REVIEWER_PAGE_AND_LOCATOR_SELECTION_REQUIRED',
    masterValuesPublished: false,
    authority: VIBRATION_STAGE5C_AUTHORITY,
  };
}

function assertEffectiveOptions(extraction, selection) {
  if (extraction?.options?.ocr !== selection.ocr || extraction?.options?.ocrLanguage !== 'eng') {
    throw new Error('VIBRATION_STAGE5C_EXTRACTION_OPTIONS_MISMATCH');
  }
}

export async function recoverVibrationStage5cEvidence(options = {}) {
  const sourcePath = controlledSourcePath(options.sourcePath);
  const document = validateStage5cSelectionDocument(options.selectionDocument);
  const decisions = [];
  for (const selection of document.selections) {
    const extraction = await extractDocumentEvidenceTables({
      baseUrl: options.baseUrl,
      sourcePath,
      sourceHash: document.sourceHash,
      pages: selection.pages,
      ocr: selection.ocr,
      ocrLanguage: 'eng',
      fetchImpl: options.fetchImpl,
    });
    assertControlledEiSource(extraction.source);
    assertEffectiveOptions(extraction, selection);
    decisions.push(buildStage5cSourceTargetDecision(selection, extraction));
  }
  return {
    schema: VIBRATION_STAGE5C_RECOVERY_SCHEMA,
    sourceHash: document.sourceHash,
    decisions,
    authority: VIBRATION_STAGE5C_AUTHORITY,
    masterValuesPublished: false,
  };
}

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function writeJson(path, value) {
  const output = resolve(path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseArguments(argv) {
  const args = {
    command: argv[0], baseUrl: undefined, sourcePath: undefined,
    selectionPath: null, out: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--api') args.baseUrl = argv[++index] ?? null;
    else if (arg === '--source-path') args.sourcePath = argv[++index] ?? null;
    else if (arg === '--selection') args.selectionPath = argv[++index] ?? null;
    else if (arg === '--out') args.out = argv[++index] ?? null;
    else throw new TypeError(`Unknown option: ${arg}`);
  }
  if (!['discover', 'extract'].includes(args.command) || !args.out) {
    throw new TypeError('Usage: node scripts/recover-vibration-stage5c-via-document-evidence.mjs <discover|extract> --out <json> [--api URL] [--source-path controlled-path] [--selection json]');
  }
  if (args.command === 'extract' && !args.selectionPath) {
    throw new TypeError('VIBRATION_STAGE5C_SELECTION_FILE_REQUIRED');
  }
  return args;
}

export async function runVibrationStage5cRecovery(argv = process.argv.slice(2), runtime = {}) {
  const args = parseArguments(argv);
  const common = {
    baseUrl: args.baseUrl,
    sourcePath: args.sourcePath,
    fetchImpl: runtime.fetchImpl,
  };
  const result = args.command === 'discover'
    ? await discoverVibrationStage5cEvidence(common)
    : await recoverVibrationStage5cEvidence({
        ...common,
        selectionDocument: loadJson(args.selectionPath),
      });
  writeJson(args.out, result);
  return result;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) await runVibrationStage5cRecovery();
