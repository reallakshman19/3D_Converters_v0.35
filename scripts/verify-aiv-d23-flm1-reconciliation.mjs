import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AIV_D23_EXPECTED_GIT_BLOB,
  AIV_D23_SOURCE_EXTRACTION_SCHEMA,
} from './extract-aiv-ei-d23-source.mjs';

export const AIV_D23_FLM1_RECONCILIATION_SCHEMA = 'AivD23Flm1Reconciliation.v1';

const ALLOWED_DISPOSITIONS = Object.freeze([
  'PUBLISHED_EXAMPLE_VARIANCE_ACCEPTED',
  'MAIN_GUIDANCE_TRANSCRIPTION_CHANGES_RECALCULATION',
  'SOURCE_CORRECTION_IDENTIFIED',
]);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function sha256Value(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? '').trim().toLowerCase());
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function flm1(diameterRatio) {
  return -0.07
    + 0.91 * diameterRatio
    + 1.32 / diameterRatio
    - 0.48 * (diameterRatio ** 1.5)
    + 0.065 * (diameterRatio ** 2);
}

export function assertD23ExtractionForFlm1Reconciliation(manifest) {
  if (manifest?.schema !== AIV_D23_SOURCE_EXTRACTION_SCHEMA || manifest?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw fail('AIV_D23_FLM1_EXTRACTION_SCHEMA_INVALID', `Expected ${AIV_D23_SOURCE_EXTRACTION_SCHEMA} for VIB.AIV.ACOUSTIC.`);
  }
  if (manifest?.source?.gitBlobSha1 !== `sha1:${AIV_D23_EXPECTED_GIT_BLOB}`) {
    throw fail('AIV_D23_FLM1_SOURCE_MISMATCH', 'D.2.3 extraction is not from the pinned EI examples PDF blob.');
  }
  if (!sha256Value(manifest?.extraction?.sectionTextSha256)) {
    throw fail('AIV_D23_FLM1_SECTION_HASH_REQUIRED', 'D.2.3 section SHA-256 is required.');
  }
  if (manifest?.qualification?.directPinnedPdfExtractionComplete !== true
    || manifest?.qualification?.publishedFinalLofObserved !== true
    || manifest?.qualification?.publishedFlm1ArithmeticReconciliationRequired !== true
    || manifest?.qualification?.productionEquationAuthorized !== false) {
    throw fail('AIV_D23_FLM1_EXTRACTION_STATE_INVALID', 'Pinned-PDF extraction must be complete while FLM1 reconciliation and production blocking remain explicit.');
  }
  return manifest;
}

export function createAivD23Flm1ReconciliationTemplate(manifestInput, options = {}) {
  const manifest = assertD23ExtractionForFlm1Reconciliation(manifestInput);
  const ratioExact = 168.3 / 60.3;
  const recalculated = flm1(ratioExact);
  return {
    schema: AIV_D23_FLM1_RECONCILIATION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    source: {
      gitBlobSha1: manifest.source.gitBlobSha1,
      sectionTextSha256: manifest.extraction.sectionTextSha256,
      extractionManifestSha256: options.extractionManifestSha256 ?? null,
    },
    mainGuidance: {
      traceId: 'AIV-EQ-T2-6-001',
      reviewedTranscriptionSha256: null,
      errataTraceId: 'AIV-EQ-T2-6-FEED-ERRATA-001',
    },
    discrepancy: {
      displayedMainOutsideDiameterMm: 168.3,
      displayedBranchOutsideDiameterMm: 60.3,
      publishedDisplayedRatio: 2.791,
      exactRatioFromDisplayedDiameters: ratioExact,
      publishedFlm1: 1.2133,
      recalculatedFlm1FromDisplayedInputs: recalculated,
      absoluteDifference: Math.abs(1.2133 - recalculated),
      finalPublishedLof: 0.29,
      independentFinalLofDisposition: 'UNCHANGED_AT_0_29',
    },
    review: {
      state: 'PENDING',
      reviewerType: null,
      reviewer: null,
      reviewDate: null,
      disposition: null,
      benchmarkExpectedFlm1: null,
      benchmarkToleranceAbs: null,
      rationale: null,
      implementationNote: null,
    },
    authority: {
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
  };
}

export function assertAivD23Flm1ReconciliationComplete(manifestInput, reconciliation, options = {}) {
  const manifest = assertD23ExtractionForFlm1Reconciliation(manifestInput);
  if (reconciliation?.schema !== AIV_D23_FLM1_RECONCILIATION_SCHEMA || reconciliation?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw fail('AIV_D23_FLM1_RECONCILIATION_SCHEMA_INVALID', `Expected ${AIV_D23_FLM1_RECONCILIATION_SCHEMA}.`);
  }
  if (reconciliation?.source?.gitBlobSha1 !== manifest.source.gitBlobSha1
    || reconciliation?.source?.sectionTextSha256 !== manifest.extraction.sectionTextSha256) {
    throw fail('AIV_D23_FLM1_RECONCILIATION_SOURCE_MISMATCH', 'Reconciliation is not bound to the controlled D.2.3 section.');
  }
  if (options.extractionManifestSha256
    && reconciliation?.source?.extractionManifestSha256 !== options.extractionManifestSha256) {
    throw fail('AIV_D23_FLM1_RECONCILIATION_MANIFEST_HASH_MISMATCH', 'Reconciliation is not bound to the supplied extraction-manifest bytes.');
  }
  if (reconciliation?.mainGuidance?.traceId !== 'AIV-EQ-T2-6-001'
    || reconciliation?.mainGuidance?.errataTraceId !== 'AIV-EQ-T2-6-FEED-ERRATA-001'
    || !sha256Value(reconciliation?.mainGuidance?.reviewedTranscriptionSha256)) {
    throw fail('AIV_D23_FLM1_MAIN_GUIDANCE_REVIEW_REQUIRED', 'A reviewed T2-6 transcription hash and page-61 errata trace are required.');
  }
  const review = reconciliation?.review;
  if (review?.state !== 'REVIEWED'
    || review?.reviewerType !== 'HUMAN_ENGINEER'
    || !nonBlank(review?.reviewer)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(review?.reviewDate ?? ''))) {
    throw fail('AIV_D23_FLM1_HUMAN_REVIEW_REQUIRED', 'A named HUMAN_ENGINEER review with ISO date is required.');
  }
  if (!ALLOWED_DISPOSITIONS.includes(review.disposition)) {
    throw fail('AIV_D23_FLM1_DISPOSITION_REQUIRED', `Disposition must be one of: ${ALLOWED_DISPOSITIONS.join(', ')}.`);
  }
  if (!Number.isFinite(review.benchmarkExpectedFlm1)
    || !Number.isFinite(review.benchmarkToleranceAbs)
    || review.benchmarkToleranceAbs < 0
    || !nonBlank(review.rationale)
    || !nonBlank(review.implementationNote)) {
    throw fail('AIV_D23_FLM1_BENCHMARK_DISPOSITION_INCOMPLETE', 'Reviewed benchmark value, non-negative tolerance, rationale and implementation note are required.');
  }
  if (reconciliation?.authority?.productionEquationAuthorized !== false
    || reconciliation?.authority?.screeningAuthority !== 'NOT_AUTHORIZED'
    || reconciliation?.authority?.designAuthority !== false) {
    throw fail('AIV_D23_FLM1_AUTHORITY_INVALID', 'FLM1 reconciliation cannot promote numerical, screening or design authority.');
  }
  return {
    schema: 'AivD23Flm1ReconciliationVerification.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    reconciliationComplete: true,
    disposition: review.disposition,
    benchmarkExpectedFlm1: review.benchmarkExpectedFlm1,
    benchmarkToleranceAbs: review.benchmarkToleranceAbs,
    productionEquationAuthorized: false,
    remainingPromotionGates: [
      'CONTROLLED_T2_7_HUMAN_RECONCILIATION',
      'RECONCILE_WORKED_EXAMPLES_DERIVED_REPORT_RESULT_SCOPE',
      'INDEPENDENT_SONIC_SFF6_BENCHMARK',
      'INDEPENDENT_MULTI_SOURCE_BENCHMARK',
      'RETAINED_WORKBOOK_RECONCILIATION',
      'INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW',
    ],
  };
}

function parseArguments(argv) {
  const positional = [];
  const options = { templateOut: null, verify: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--template-out') options.templateOut = argv[++index] ?? null;
    else if (arg === '--verify') options.verify = argv[++index] ?? null;
    else if (arg.startsWith('--')) throw new TypeError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1 || Boolean(options.templateOut) === Boolean(options.verify)) {
    throw new TypeError('Usage: node scripts/verify-aiv-d23-flm1-reconciliation.mjs <d23-extraction-manifest.json> (--template-out reconciliation.json | --verify reconciliation.json)');
  }
  return { manifestPath: positional[0], ...options };
}

export function runAivD23Flm1Reconciliation(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const manifestPath = resolve(args.manifestPath);
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const extractionManifestSha256 = `sha256:${sha256Hex(manifestBytes)}`;
  if (args.templateOut) {
    const outputPath = resolve(args.templateOut);
    const template = createAivD23Flm1ReconciliationTemplate(manifest, { extractionManifestSha256 });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    return { template, outputPath };
  }
  const reconciliation = JSON.parse(readFileSync(resolve(args.verify), 'utf8'));
  const verification = assertAivD23Flm1ReconciliationComplete(manifest, reconciliation, { extractionManifestSha256 });
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  return verification;
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runAivD23Flm1Reconciliation();
