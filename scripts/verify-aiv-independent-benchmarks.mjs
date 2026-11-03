import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AIV_INDEPENDENT_BENCHMARKS,
  AIV_INDEPENDENT_BENCHMARK_EVIDENCE,
} from '../converters/vibration/aiv/aiv-independent-benchmark-evidence.js';

export const AIV_INDEPENDENT_BENCHMARK_REVIEW_SCHEMA = 'AivIndependentBenchmarkReview.v1';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Json(value) {
  return `sha256:${sha256Hex(Buffer.from(JSON.stringify(value), 'utf8'))}`;
}

function sha256Value(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? '').trim().toLowerCase());
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

export function createAivIndependentBenchmarkReviewTemplate() {
  return {
    schema: AIV_INDEPENDENT_BENCHMARK_REVIEW_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    sourceEvidence: {
      schema: AIV_INDEPENDENT_BENCHMARK_EVIDENCE.schema,
      sha256: sha256Json(AIV_INDEPENDENT_BENCHMARK_EVIDENCE),
    },
    authority: {
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    records: AIV_INDEPENDENT_BENCHMARKS.map((benchmark) => ({
      benchmarkId: benchmark.benchmarkId,
      benchmarkSha256: sha256Json(benchmark),
      requiredTraceIds: [...benchmark.requiredTraceIds],
      traceTranscriptionSha256: Object.fromEntries(benchmark.requiredTraceIds.map((traceId) => [traceId, null])),
      reviewState: 'PENDING',
      reviewerType: null,
      reviewer: null,
      reviewDate: null,
      independentCalculationSha256: null,
      disposition: null,
      toleranceDisposition: null,
      rationale: null,
      implementationNote: null,
    })),
  };
}

function assertRecord(record, benchmark) {
  if (record.benchmarkSha256 !== sha256Json(benchmark)) {
    throw fail('AIV_INDEPENDENT_BENCHMARK_HASH_MISMATCH', `${benchmark.benchmarkId} review does not match the benchmark evidence.`);
  }
  if (!Array.isArray(record.requiredTraceIds)
    || record.requiredTraceIds.length !== benchmark.requiredTraceIds.length
    || benchmark.requiredTraceIds.some((id, index) => record.requiredTraceIds[index] !== id)) {
    throw fail('AIV_INDEPENDENT_BENCHMARK_TRACE_SET_MISMATCH', `${benchmark.benchmarkId} trace set changed.`);
  }
  for (const traceId of benchmark.requiredTraceIds) {
    if (!sha256Value(record.traceTranscriptionSha256?.[traceId])) {
      throw fail('AIV_INDEPENDENT_BENCHMARK_TRACE_REVIEW_REQUIRED', `${benchmark.benchmarkId} requires a reviewed transcription SHA-256 for ${traceId}.`);
    }
  }
  if (record.reviewState !== 'REVIEWED'
    || record.reviewerType !== 'HUMAN_ENGINEER'
    || !nonBlank(record.reviewer)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(record.reviewDate ?? ''))) {
    throw fail('AIV_INDEPENDENT_BENCHMARK_HUMAN_REVIEW_REQUIRED', `${benchmark.benchmarkId} requires named HUMAN_ENGINEER review with ISO date.`);
  }
  if (!sha256Value(record.independentCalculationSha256)) {
    throw fail('AIV_INDEPENDENT_BENCHMARK_CALCULATION_HASH_REQUIRED', `${benchmark.benchmarkId} requires an independent calculation SHA-256.`);
  }
  if (record.disposition !== 'ACCEPTED_AS_INDEPENDENT_ANALYTICAL_BENCHMARK') {
    throw fail('AIV_INDEPENDENT_BENCHMARK_ACCEPTANCE_REQUIRED', `${benchmark.benchmarkId} has not been accepted as an independent analytical benchmark.`);
  }
  if (record.toleranceDisposition !== 'BENCHMARK_TOLERANCE_ACCEPTED_QUALIFICATION_ONLY') {
    throw fail('AIV_INDEPENDENT_BENCHMARK_TOLERANCE_REVIEW_REQUIRED', `${benchmark.benchmarkId} requires explicit qualification-only tolerance acceptance.`);
  }
  if (!nonBlank(record.rationale) || !nonBlank(record.implementationNote)) {
    throw fail('AIV_INDEPENDENT_BENCHMARK_NOTES_REQUIRED', `${benchmark.benchmarkId} requires rationale and implementation note.`);
  }
}

export function assertAivIndependentBenchmarkReviewComplete(review) {
  if (review?.schema !== AIV_INDEPENDENT_BENCHMARK_REVIEW_SCHEMA || review?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw fail('AIV_INDEPENDENT_BENCHMARK_REVIEW_SCHEMA_INVALID', `Expected ${AIV_INDEPENDENT_BENCHMARK_REVIEW_SCHEMA}.`);
  }
  if (review?.sourceEvidence?.schema !== AIV_INDEPENDENT_BENCHMARK_EVIDENCE.schema
    || review?.sourceEvidence?.sha256 !== sha256Json(AIV_INDEPENDENT_BENCHMARK_EVIDENCE)) {
    throw fail('AIV_INDEPENDENT_BENCHMARK_EVIDENCE_MISMATCH', 'Review is not bound to the current independent benchmark evidence set.');
  }
  if (review?.authority?.productionEquationAuthorized !== false
    || review?.authority?.screeningAuthority !== 'NOT_AUTHORIZED'
    || review?.authority?.designAuthority !== false) {
    throw fail('AIV_INDEPENDENT_BENCHMARK_AUTHORITY_INVALID', 'Benchmark review cannot promote AIV authority.');
  }
  if (!Array.isArray(review.records) || review.records.length !== AIV_INDEPENDENT_BENCHMARKS.length) {
    throw fail('AIV_INDEPENDENT_BENCHMARK_RECORD_SET_INVALID', 'Review requires one record per independent benchmark vector.');
  }
  const byId = new Map();
  for (const record of review.records) {
    if (!nonBlank(record?.benchmarkId) || byId.has(record.benchmarkId)) {
      throw fail('AIV_INDEPENDENT_BENCHMARK_ID_INVALID', 'Benchmark review IDs must be present and unique.');
    }
    byId.set(record.benchmarkId, record);
  }
  for (const benchmark of AIV_INDEPENDENT_BENCHMARKS) {
    const record = byId.get(benchmark.benchmarkId);
    if (!record) throw fail('AIV_INDEPENDENT_BENCHMARK_MISSING', `Missing review for ${benchmark.benchmarkId}.`);
    assertRecord(record, benchmark);
  }
  return {
    schema: 'AivIndependentBenchmarkReviewVerification.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    reviewComplete: true,
    acceptedBenchmarkCount: AIV_INDEPENDENT_BENCHMARKS.length,
    sonicSff6BenchmarkAccepted: true,
    multiSourceBenchmarksAccepted: true,
    productionEquationAuthorized: false,
    remainingPromotionGates: [
      'RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC',
      'RECONCILE_WORKED_EXAMPLES_DERIVED_REPORT_RESULT_SCOPE',
      'CONTROLLED_T2_7_HUMAN_RECONCILIATION',
      'RETAINED_WORKBOOK_RECONCILIATION',
      'INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW',
    ],
  };
}

function parseArguments(argv) {
  const options = { templateOut: null, verify: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--template-out') options.templateOut = argv[++index] ?? null;
    else if (arg === '--verify') options.verify = argv[++index] ?? null;
    else throw new TypeError(`Unknown argument: ${arg}`);
  }
  if (Boolean(options.templateOut) === Boolean(options.verify)) {
    throw new TypeError('Usage: node scripts/verify-aiv-independent-benchmarks.mjs (--template-out review.json | --verify review.json)');
  }
  return options;
}

export function runAivIndependentBenchmarkReview(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.templateOut) {
    const outputPath = resolve(args.templateOut);
    const template = createAivIndependentBenchmarkReviewTemplate();
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    return { template, outputPath };
  }
  const review = JSON.parse(readFileSync(resolve(args.verify), 'utf8'));
  const result = assertAivIndependentBenchmarkReviewComplete(review);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runAivIndependentBenchmarkReview();
