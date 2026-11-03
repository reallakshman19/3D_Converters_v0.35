import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AIV_D23_PDF_REVALIDATION,
  AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE,
} from '../converters/vibration/aiv/aiv-d23-pdf-revalidation.js';

export const AIV_WORKED_EXAMPLE_RESULT_SCOPE_REVIEW_SCHEMA = 'AivWorkedExampleResultScopeReview.v1';

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function controlledScopeEvidence() {
  const line = AIV_D23_PDF_REVALIDATION.controlledMarkdownAivRows.reliefDownstreamLine;
  const assessment = AIV_D23_PDF_REVALIDATION.reliefFirstDiscontinuity.published;
  return {
    readableSource: {
      repository: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.repository,
      commit: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.commit,
      path: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.path,
      gitBlob: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.gitBlob,
    },
    reliefDownstreamLineReport: {
      reportedPwlDb: line.reportedPwlDb,
      reportedLof: line.reportedLof,
      proposedResultScope: 'LINE_CASE_SUMMARY',
    },
    d23FirstDiscontinuity: {
      sourcePwlDb: assessment.sourcePwlDb,
      assessmentPwlDb: assessment.assessmentPwlDb,
      reportedLof: assessment.LOF,
      proposedResultScope: 'ASSESSMENT',
    },
    sourceResultScope: {
      rawSourcePwlField: 'rawSourcePwlDb',
      resultScope: 'SOURCE',
    },
  };
}

export function createAivWorkedExampleResultScopeReviewTemplate() {
  const evidence = controlledScopeEvidence();
  return {
    schema: AIV_WORKED_EXAMPLE_RESULT_SCOPE_REVIEW_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    evidence,
    evidenceSha256: sha256Json(evidence),
    review: {
      state: 'PENDING',
      reviewerType: null,
      reviewer: null,
      reviewDate: null,
      sourceResultDisposition: null,
      assessmentResultDisposition: null,
      lineCaseSummaryDisposition: null,
      lineAggregationDisposition: null,
      implementationDisposition: null,
      rationale: null,
      implementationNote: null,
    },
    authority: {
      productionEquationAuthorized: false,
      lineAggregationImplementationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
  };
}

export function assertAivWorkedExampleResultScopeReviewComplete(review) {
  const expectedEvidence = controlledScopeEvidence();
  if (review?.schema !== AIV_WORKED_EXAMPLE_RESULT_SCOPE_REVIEW_SCHEMA || review?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw fail('AIV_RESULT_SCOPE_REVIEW_SCHEMA_INVALID', `Expected ${AIV_WORKED_EXAMPLE_RESULT_SCOPE_REVIEW_SCHEMA}.`);
  }
  if (review.evidenceSha256 !== sha256Json(expectedEvidence)
    || JSON.stringify(review.evidence) !== JSON.stringify(expectedEvidence)) {
    throw fail('AIV_RESULT_SCOPE_REVIEW_EVIDENCE_MISMATCH', 'Result-scope review is not bound to the controlled worked-example evidence set.');
  }
  const human = review.review;
  if (human?.state !== 'REVIEWED'
    || human?.reviewerType !== 'HUMAN_ENGINEER'
    || !nonBlank(human?.reviewer)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(human?.reviewDate ?? ''))) {
    throw fail('AIV_RESULT_SCOPE_HUMAN_REVIEW_REQUIRED', 'A named HUMAN_ENGINEER review with ISO date is required.');
  }
  if (human.sourceResultDisposition !== 'RAW_EFFECTIVE_SOURCE_PWL_BELONG_TO_SOURCE_RESULT') {
    throw fail('AIV_RESULT_SCOPE_SOURCE_DISPOSITION_REQUIRED', 'Source PWL scope must be explicitly assigned to Source Result.');
  }
  if (human.assessmentResultDisposition !== 'FIRST_DISCONTINUITY_POINT_PWL_AND_LOF_BELONG_TO_ASSESSMENT_RESULT') {
    throw fail('AIV_RESULT_SCOPE_ASSESSMENT_DISPOSITION_REQUIRED', 'D.2.3 first-discontinuity point PWL/LOF must be explicitly assigned to Assessment Result.');
  }
  if (human.lineCaseSummaryDisposition !== 'DERIVED_REPORT_LINE_LOF_BELONGS_TO_LINE_CASE_SUMMARY') {
    throw fail('AIV_RESULT_SCOPE_LINE_DISPOSITION_REQUIRED', 'Derived report line LOF must be explicitly assigned to Line/Case Summary.');
  }
  if (human.lineAggregationDisposition !== 'NOT_DERIVED_FROM_SINGLE_FIRST_DISCONTINUITY_RESULT') {
    throw fail('AIV_RESULT_SCOPE_AGGREGATION_DISPOSITION_REQUIRED', 'Line-result aggregation must not be inferred from the first-discontinuity result.');
  }
  if (human.implementationDisposition !== 'KEEP_SOURCE_ASSESSMENT_AND_LINE_SCOPES_SEPARATE') {
    throw fail('AIV_RESULT_SCOPE_IMPLEMENTATION_DISPOSITION_REQUIRED', 'Implementation must preserve separate Source, Assessment and Line/Case result scopes.');
  }
  if (!nonBlank(human.rationale) || !nonBlank(human.implementationNote)) {
    throw fail('AIV_RESULT_SCOPE_REVIEW_NOTES_REQUIRED', 'Result-scope review requires rationale and implementation note.');
  }
  if (review?.authority?.productionEquationAuthorized !== false
    || review?.authority?.lineAggregationImplementationAuthorized !== false
    || review?.authority?.screeningAuthority !== 'NOT_AUTHORIZED'
    || review?.authority?.designAuthority !== false) {
    throw fail('AIV_RESULT_SCOPE_REVIEW_AUTHORITY_INVALID', 'Result-scope reconciliation cannot authorize numerical implementation, screening or design use.');
  }
  return {
    schema: 'AivWorkedExampleResultScopeReviewVerification.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    reviewComplete: true,
    scopeSeparationAccepted: true,
    evidenceSha256: review.evidenceSha256,
    productionEquationAuthorized: false,
    lineAggregationImplementationAuthorized: false,
    remainingPromotionGates: [
      'CONTROLLED_T2_7_HUMAN_RECONCILIATION',
      'RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC',
      'INDEPENDENT_SONIC_SFF6_BENCHMARK',
      'INDEPENDENT_MULTI_SOURCE_BENCHMARK',
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
    throw new TypeError('Usage: node scripts/verify-aiv-worked-example-result-scope.mjs (--template-out review.json | --verify review.json)');
  }
  return options;
}

export function runAivWorkedExampleResultScopeReview(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.templateOut) {
    const outputPath = resolve(args.templateOut);
    const template = createAivWorkedExampleResultScopeReviewTemplate();
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    return { template, outputPath };
  }
  const review = JSON.parse(readFileSync(resolve(args.verify), 'utf8'));
  const verification = assertAivWorkedExampleResultScopeReviewComplete(review);
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  return verification;
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runAivWorkedExampleResultScopeReview();
