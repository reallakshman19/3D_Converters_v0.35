import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  AIV_EI_D23_SOURCE,
  AIV_EI_MAIN_GUIDANCE_SOURCE,
} from '../converters/vibration/aiv/aiv-qualification-evidence.js';
import {
  AIV_EI_EXAMPLES_PDF_SOURCE,
  AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE,
} from '../converters/vibration/aiv/aiv-d23-pdf-revalidation.js';
import { solveAivD23QualificationExample } from './solve-aiv-d23-qualification.mjs';
import { solveAivIndependentQualificationBenchmarks } from './solve-aiv-independent-qualification-benchmarks.mjs';

export const AIV_QUALIFICATION_PARITY_MANIFEST_SCHEMA = 'AivQualificationParityManifest.v1';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Object(value) {
  return `sha256:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}`;
}

function parity(id, actual, expected, tolerance) {
  const absoluteDifference = Math.abs(actual - expected);
  return Object.freeze({
    parityId: id,
    actual,
    expected,
    toleranceAbs: tolerance,
    absoluteDifference,
    status: absoluteDifference <= tolerance ? 'PASS' : 'FAIL',
  });
}

function independentById(result, benchmarkId) {
  const item = result.results.find((entry) => entry.benchmarkId === benchmarkId);
  if (!item) throw new TypeError(`Missing independent qualification result ${benchmarkId}.`);
  return item;
}

export function buildAivQualificationParityManifest() {
  const d23 = solveAivD23QualificationExample();
  const independent = solveAivIndependentQualificationBenchmarks();
  const relief = d23.reliefFirstDiscontinuity;
  const markdown = d23.controlledMarkdownSourceRowParity;
  const sonic = independentById(independent, 'AIV-HAND-SONIC-SFF6-001');
  const equal = independentById(independent, 'AIV-HAND-MULTI-SOURCE-EQUAL-001');
  const asym = independentById(independent, 'AIV-HAND-MULTI-SOURCE-ASYM-001');

  const checks = [
    parity('D23_RELIEF_RAW_SOURCE_PWL', d23.sourceResults.relief.calculatedRawSourcePwlDb, 164.7, 0.05),
    parity('D23_RECYCLE_RAW_SOURCE_PWL', d23.sourceResults.recycle.calculatedRawSourcePwlDb, 159.4, 0.05),
    parity('MARKDOWN_RECYCLE_DISCHARGE_PWL', markdown.recycleCompressorDischarge.calculatedReportedPwlDb, 129.36, 0.01),
    parity('MARKDOWN_RECYCLE_SUCTION_PWL', markdown.recycleCompressorSuction.calculatedReportedPwlDb, 129.02, 0.01),
    parity('MARKDOWN_RELIEF_LINE_PWL', markdown.reliefDownstreamLine.calculatedReportedPwlDb, 164.69, 0.01),
    parity('D23_ATTENUATION', relief.calculatedAttenuationDb, 0.312, 0.001),
    parity('D23_POINT_PWL', relief.calculatedPointPwlDb, 164.4, 0.05),
    parity('D23_ERRATA_LOG10_N', relief.errataFeed.calculatedLog10N, 9.9026, 0.00005),
    parity('D23_FLM2', relief.calculatedFLM2, 0.2009, 0.0001),
    parity('D23_LOF_PUBLISHED_FLM1_CHAIN', relief.chains.usingPublishedFLM1.LOF, 0.29, 0),
    parity('D23_LOF_RECALCULATED_FLM1_CHAIN', relief.chains.usingRecalculatedFLM1.LOF, 0.29, 0),
    parity('SONIC_NONSONIC_REFERENCE_PWL', sonic.calculated.nonSonicReferencePwlDb, sonic.expected.nonSonicReferencePwlDb, sonic.tolerance.pwlDbAbs),
    parity('SONIC_SFF6_PWL', sonic.calculated.sonicPwlDb, sonic.expected.sonicPwlDb, sonic.tolerance.pwlDbAbs),
    parity('SONIC_SFF6_DELTA', sonic.calculated.sonicDeltaDb, sonic.expected.sonicDeltaDb, sonic.tolerance.sonicDeltaDbAbs),
    parity('MULTI_SOURCE_EQUAL', equal.calculated.combinedPwlDb, equal.expected.combinedPwlDb, equal.tolerance.combinedPwlDbAbs),
    parity('MULTI_SOURCE_ASYMMETRIC', asym.calculated.combinedPwlDb, asym.expected.combinedPwlDb, asym.tolerance.combinedPwlDbAbs),
  ];

  const passed = checks.filter((item) => item.status === 'PASS').length;
  const failed = checks.length - passed;

  return Object.freeze({
    schema: AIV_QUALIFICATION_PARITY_MANIFEST_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    evidenceClass: 'MACHINE_QUALIFICATION_PARITY_HUMAN_REVIEW_PENDING',
    controlledSources: Object.freeze({
      mainGuidance: Object.freeze({
        repository: AIV_EI_MAIN_GUIDANCE_SOURCE.repository,
        commit: AIV_EI_MAIN_GUIDANCE_SOURCE.commit,
        path: AIV_EI_MAIN_GUIDANCE_SOURCE.path,
        gitBlob: AIV_EI_MAIN_GUIDANCE_SOURCE.gitBlob,
        locator: AIV_EI_MAIN_GUIDANCE_SOURCE.locator,
      }),
      workedExampleDocx: Object.freeze({
        repository: AIV_EI_D23_SOURCE.repository,
        commit: AIV_EI_D23_SOURCE.commit,
        path: AIV_EI_D23_SOURCE.path,
        gitBlob: AIV_EI_D23_SOURCE.gitBlob,
        locator: AIV_EI_D23_SOURCE.locator,
      }),
      workedExamplePdf: Object.freeze({
        repository: AIV_EI_EXAMPLES_PDF_SOURCE.repository,
        commit: AIV_EI_EXAMPLES_PDF_SOURCE.commit,
        path: AIV_EI_EXAMPLES_PDF_SOURCE.path,
        gitBlob: AIV_EI_EXAMPLES_PDF_SOURCE.gitBlob,
        sizeBytes: AIV_EI_EXAMPLES_PDF_SOURCE.sizeBytes,
      }),
      workedExampleMarkdown: Object.freeze({
        repository: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.repository,
        commit: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.commit,
        path: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.path,
        gitBlob: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.gitBlob,
        lineCount: AIV_EI_WORKED_EXAMPLES_MARKDOWN_SOURCE.lineCount,
      }),
    }),
    solveArtifacts: Object.freeze({
      d23: Object.freeze({ schema: d23.schema, canonicalSha256: sha256Object(d23) }),
      independentVectors: Object.freeze({ schema: independent.schema, canonicalSha256: sha256Object(independent) }),
    }),
    parity: Object.freeze({
      checks: Object.freeze(checks),
      counts: Object.freeze({ total: checks.length, passed, failed }),
      status: failed === 0 ? 'MACHINE_PARITY_PASS' : 'MACHINE_PARITY_FAIL',
    }),
    unresolvedAuthorityItems: Object.freeze([
      'A/S/B are controlled published D.2.3 intermediates and are not rederived before T2.6 human transcription reconciliation.',
      'Published FLM1=1.2133 versus recalculated 1.2109758194311824 remains a human reconciliation item.',
      'Relief downstream line LOF=1.48 remains a line/case result-scope and aggregation reconciliation item.',
      'Independent sonic and multi-source machine parity does not replace AivIndependentBenchmarkReview.v1 human acceptance.',
      'Retained workbook reconciliation and independent vibration-engineer promotion review remain required.',
    ]),
    authority: Object.freeze({
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      engineeringAuthority: 'NONE',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
      authorityTransitionApplied: false,
    }),
  });
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) process.stdout.write(`${JSON.stringify(buildAivQualificationParityManifest(), null, 2)}\n`);
