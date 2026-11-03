import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AIV_T27_EXPECTED_GIT_BLOB,
  AIV_T27_SOURCE_EXTRACTION_SCHEMA,
} from './extract-aiv-ei-t27-source.mjs';

export const AIV_T27_RECONCILIATION_SCHEMA = 'AivT27Reconciliation.v1';

export const AIV_T27_REQUIRED_RECONCILIATION_ITEMS = Object.freeze([
  Object.freeze({ traceId: 'AIV-APP-T2-7-EXTENT-001', pageNumber: 59, errataDisposition: 'NOT_APPLICABLE' }),
  Object.freeze({ traceId: 'AIV-UNIT-T2-7-INPUTS-001', pageNumber: 59, errataDisposition: 'NOT_APPLICABLE' }),
  Object.freeze({ traceId: 'AIV-EQ-SOURCE-PWL-001', pageNumber: 60, errataDisposition: 'NOT_APPLICABLE' }),
  Object.freeze({ traceId: 'AIV-CONST-SFF-001', pageNumber: 60, errataDisposition: 'NOT_APPLICABLE' }),
  Object.freeze({ traceId: 'AIV-ASS-155DB-001', pageNumber: 60, errataDisposition: 'NOT_APPLICABLE' }),
  Object.freeze({ traceId: 'AIV-EQ-ATTENUATION-001', pageNumber: 60, errataDisposition: 'NOT_APPLICABLE' }),
  Object.freeze({ traceId: 'AIV-EQ-MULTI-SOURCE-001', pageNumber: 60, errataDisposition: 'NOT_APPLICABLE' }),
  Object.freeze({
    traceId: 'AIV-ASS-LOW-NOISE-TRIM-001', pageNumber: 61,
    errataDisposition: 'NOT_AFFECTED_BY_T2_6_FEED_ERRATA',
  }),
  Object.freeze({
    traceId: 'AIV-EQ-T2-6-001', pageNumber: 61,
    errataDisposition: 'RECONCILED_WITH_AIV-EQ-T2-6-FEED-ERRATA-001',
  }),
]);

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

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

function pageMap(manifest) {
  return new Map((manifest.pages ?? []).map((page) => [page.pageNumber, page]));
}

export function assertAivT27ExtractionManifestForReconciliation(manifest) {
  if (manifest?.schema !== AIV_T27_SOURCE_EXTRACTION_SCHEMA) {
    throw fail('AIV_T27_RECONCILIATION_EXTRACTION_SCHEMA_INVALID', `Expected ${AIV_T27_SOURCE_EXTRACTION_SCHEMA}.`);
  }
  if (manifest?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw fail('AIV_T27_RECONCILIATION_METHOD_INVALID', 'Extraction manifest must be for VIB.AIV.ACOUSTIC.');
  }
  if (manifest?.source?.gitBlobSha1 !== `sha1:${AIV_T27_EXPECTED_GIT_BLOB}`) {
    throw fail('AIV_T27_RECONCILIATION_SOURCE_MISMATCH', 'Extraction manifest is not from the pinned Common PDF blob.');
  }
  if (manifest?.extraction?.firstPage !== 59 || manifest?.extraction?.lastPage !== 62 || manifest?.extraction?.pageCount !== 4) {
    throw fail('AIV_T27_RECONCILIATION_PAGE_RANGE_INVALID', 'Extraction manifest must contain exactly pages 59-62.');
  }
  const pages = pageMap(manifest);
  for (const pageNumber of [59, 60, 61, 62]) {
    const page = pages.get(pageNumber);
    if (!page || !sha256Value(page.textSha256)) {
      throw fail('AIV_T27_RECONCILIATION_PAGE_HASH_REQUIRED', `Page ${pageNumber} requires a SHA-256 text hash.`);
    }
  }
  if (manifest?.qualification?.productionEquationAuthorized !== false) {
    throw fail('AIV_T27_RECONCILIATION_EXTRACTION_AUTHORITY_INVALID', 'Extraction must not authorize production equations.');
  }
  return manifest;
}

export function createAivT27ReconciliationTemplate(manifestInput, options = {}) {
  const manifest = assertAivT27ExtractionManifestForReconciliation(manifestInput);
  const pages = pageMap(manifest);
  return {
    schema: AIV_T27_RECONCILIATION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    source: {
      gitBlobSha1: manifest.source.gitBlobSha1,
      extractionManifestSha256: options.extractionManifestSha256 ?? null,
    },
    authority: {
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    records: AIV_T27_REQUIRED_RECONCILIATION_ITEMS.map((item) => ({
      traceId: item.traceId,
      sourcePage: item.pageNumber,
      sourcePageTextSha256: pages.get(item.pageNumber).textSha256,
      reviewState: 'PENDING',
      reviewerType: null,
      reviewer: null,
      reviewDate: null,
      transcriptionSha256: null,
      equationOrRuleDisposition: null,
      branchPredicateDisposition: null,
      nativeUnitsDisposition: null,
      errataDisposition: item.errataDisposition === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'PENDING',
      notes: null,
    })),
  };
}

function assertExactRecordSet(records) {
  if (!Array.isArray(records) || records.length !== AIV_T27_REQUIRED_RECONCILIATION_ITEMS.length) {
    throw fail('AIV_T27_RECONCILIATION_RECORD_SET_INVALID', 'Reconciliation requires the complete nine-item T2.7 trace set.');
  }
  const seen = new Set();
  for (const record of records) {
    if (!nonBlank(record?.traceId) || seen.has(record.traceId)) {
      throw fail('AIV_T27_RECONCILIATION_TRACE_ID_INVALID', 'Reconciliation trace IDs must be present and unique.');
    }
    seen.add(record.traceId);
  }
  for (const item of AIV_T27_REQUIRED_RECONCILIATION_ITEMS) {
    if (!seen.has(item.traceId)) {
      throw fail('AIV_T27_RECONCILIATION_TRACE_MISSING', `Missing required trace ${item.traceId}.`);
    }
  }
}

function assertReviewedRecord(record, item, pages) {
  if (record.sourcePage !== item.pageNumber) {
    throw fail('AIV_T27_RECONCILIATION_PAGE_MISMATCH', `${item.traceId} must reconcile against page ${item.pageNumber}.`);
  }
  if (record.sourcePageTextSha256 !== pages.get(item.pageNumber).textSha256) {
    throw fail('AIV_T27_RECONCILIATION_PAGE_HASH_MISMATCH', `${item.traceId} page hash does not match the controlled extraction manifest.`);
  }
  if (record.reviewState !== 'REVIEWED') {
    throw fail('AIV_T27_RECONCILIATION_REVIEW_PENDING', `${item.traceId} has not completed human review.`);
  }
  if (record.reviewerType !== 'HUMAN_ENGINEER' || !nonBlank(record.reviewer)) {
    throw fail('AIV_T27_RECONCILIATION_HUMAN_REVIEWER_REQUIRED', `${item.traceId} requires a named HUMAN_ENGINEER reviewer.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(record.reviewDate ?? ''))) {
    throw fail('AIV_T27_RECONCILIATION_REVIEW_DATE_REQUIRED', `${item.traceId} requires an ISO review date.`);
  }
  if (!sha256Value(record.transcriptionSha256)) {
    throw fail('AIV_T27_RECONCILIATION_TRANSCRIPTION_HASH_REQUIRED', `${item.traceId} requires a SHA-256 hash of the reviewed transcription.`);
  }
  if (!['TRANSCRIBED_AND_VERIFIED', 'RULE_ONLY_NO_EQUATION'].includes(record.equationOrRuleDisposition)) {
    throw fail('AIV_T27_RECONCILIATION_RULE_DISPOSITION_REQUIRED', `${item.traceId} requires an equation/rule disposition.`);
  }
  if (!['RECORDED', 'NOT_APPLICABLE'].includes(record.branchPredicateDisposition)) {
    throw fail('AIV_T27_RECONCILIATION_BRANCH_DISPOSITION_REQUIRED', `${item.traceId} requires a branch-predicate disposition.`);
  }
  if (!['RECORDED', 'NOT_APPLICABLE'].includes(record.nativeUnitsDisposition)) {
    throw fail('AIV_T27_RECONCILIATION_UNIT_DISPOSITION_REQUIRED', `${item.traceId} requires a native-units disposition.`);
  }
  if (record.errataDisposition !== item.errataDisposition) {
    throw fail('AIV_T27_RECONCILIATION_ERRATA_DISPOSITION_INVALID', `${item.traceId} requires errata disposition ${item.errataDisposition}.`);
  }
}

export function assertAivT27ReconciliationComplete(manifestInput, reconciliation, options = {}) {
  const manifest = assertAivT27ExtractionManifestForReconciliation(manifestInput);
  if (reconciliation?.schema !== AIV_T27_RECONCILIATION_SCHEMA || reconciliation?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw fail('AIV_T27_RECONCILIATION_SCHEMA_INVALID', `Expected ${AIV_T27_RECONCILIATION_SCHEMA} for VIB.AIV.ACOUSTIC.`);
  }
  if (reconciliation?.source?.gitBlobSha1 !== manifest.source.gitBlobSha1) {
    throw fail('AIV_T27_RECONCILIATION_SOURCE_MISMATCH', 'Reconciliation source does not match the extraction manifest.');
  }
  if (options.extractionManifestSha256 && reconciliation?.source?.extractionManifestSha256 !== options.extractionManifestSha256) {
    throw fail('AIV_T27_RECONCILIATION_MANIFEST_HASH_MISMATCH', 'Reconciliation is not bound to the supplied extraction-manifest bytes.');
  }
  if (reconciliation?.authority?.productionEquationAuthorized !== false
    || reconciliation?.authority?.screeningAuthority !== 'NOT_AUTHORIZED'
    || reconciliation?.authority?.designAuthority !== false) {
    throw fail('AIV_T27_RECONCILIATION_AUTHORITY_INVALID', 'Source reconciliation cannot promote numerical/screening/design authority.');
  }
  assertExactRecordSet(reconciliation.records);
  const pages = pageMap(manifest);
  const byTrace = new Map(reconciliation.records.map((record) => [record.traceId, record]));
  for (const item of AIV_T27_REQUIRED_RECONCILIATION_ITEMS) {
    assertReviewedRecord(byTrace.get(item.traceId), item, pages);
  }
  return {
    schema: 'AivT27ReconciliationVerification.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    reconciliationComplete: true,
    reviewedTraceCount: AIV_T27_REQUIRED_RECONCILIATION_ITEMS.length,
    productionEquationAuthorized: false,
    remainingPromotionGates: [
      'RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC',
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
    throw new TypeError('Usage: node scripts/verify-aiv-t27-reconciliation.mjs <extraction-manifest.json> (--template-out reconciliation.json | --verify reconciliation.json)');
  }
  return { manifestPath: positional[0], ...options };
}

export function runAivT27Reconciliation(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const manifestPath = resolve(args.manifestPath);
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const extractionManifestSha256 = `sha256:${sha256Hex(manifestBytes)}`;
  if (args.templateOut) {
    const outputPath = resolve(args.templateOut);
    const template = createAivT27ReconciliationTemplate(manifest, { extractionManifestSha256 });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    return { template, outputPath };
  }
  const reconciliation = JSON.parse(readFileSync(resolve(args.verify), 'utf8'));
  const verification = assertAivT27ReconciliationComplete(manifest, reconciliation, { extractionManifestSha256 });
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  return verification;
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runAivT27Reconciliation();
