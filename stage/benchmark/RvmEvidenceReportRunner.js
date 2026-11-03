import { createRvmBinaryPreflightReport, summarizeRvmBinaryPreflight } from '../worker/StageRvmBinaryPreflight.js';
import { scanRvmBinaryDiagnostics, summarizeRvmDiagnostics } from '../parser/RvmDiagnosticsScanner.js';
import { readRvmRecordEvidence, summarizeRvmRecordEvidence } from '../parser/RvmRecordReader.js';
import { parseRvmBinaryToStageModel, summarizeRvmBinaryParserReport } from '../parser/RvmBinaryStageParser.js';

export const RVM_EVIDENCE_REPORT_RUNNER_VERSION = '20260702-rvm-evidence-report-runner-v1';
export const RVM_EVIDENCE_REPORT_SCHEMA = 'RvmEvidenceReport.v1';

export function createRvmEvidenceReport(options = {}) {
  return {
    schema: RVM_EVIDENCE_REPORT_SCHEMA,
    runnerVersion: RVM_EVIDENCE_REPORT_RUNNER_VERSION,
    source: sourceFrom(options),
    generatedAt: options.generatedAt || new Date().toISOString(),
    claims: { parserComplete: false, visualParityClaimed: false, realCompatibilityProven: false },
    preflight: { valid: false, summary: null, warnings: [], errors: [] },
    diagnostics: { available: false, summary: null, report: null },
    recordReader: { available: false, summary: null, report: null },
    parser: { attempted: false, ok: false, summary: null, report: null, stageModelProduced: false },
    worker: { attempted: false, ok: false, stageReady: false, packageReady: false },
    codeEvidence: { nativeCodeCounts: {}, code4: { candidateCount: 0, decodeSuccess: 0, decodeFailure: 0, decoderSummaries: [] }, code11: { candidateCount: 0, decoded: false } },
    decision: { category: 'not-run', nextAction: 'provide-rvm-array-buffer', reasonCodes: [] },
    warnings: [],
    errors: [],
  };
}

export function runRvmEvidenceReport(input = {}, options = {}) {
  const report = createRvmEvidenceReport({ ...input, generatedAt: options.generatedAt });
  try {
    const preflight = createRvmBinaryPreflightReport(input);
    report.preflight = { valid: preflight.valid, summary: summarizeRvmBinaryPreflight(preflight), warnings: preflight.warnings, errors: preflight.errors };
    collectMessages(report, preflight);
    if (!preflight.valid) return decide(report, 'preflight-failed', 'fix-input-envelope', ['RVM_PREFLIGHT_INVALID']);

    const diagnostics = scanRvmBinaryDiagnostics(input);
    report.diagnostics = { available: true, summary: summarizeRvmDiagnostics(diagnostics), report: diagnostics };
    collectMessages(report, diagnostics);

    const recordReader = readRvmRecordEvidence(input);
    report.recordReader = { available: true, summary: summarizeRvmRecordEvidence(recordReader), report: recordReader };
    collectMessages(report, recordReader);

    const parser = parseRvmBinaryToStageModel(input);
    report.parser = { attempted: true, ok: parser.ok === true, summary: summarizeRvmBinaryParserReport(parser.report), report: parser.report, stageModelProduced: Boolean(parser.stageModel) };
    collectMessages(report, parser.report);
    applyCodeEvidence(report);
    if (parser.ok) return decide(report, 'synthetic-mvp-success', 'inspect-decoder-summaries-before-real-compatibility-claims', ['SYNTHETIC_MVP_PARSER_SUCCEEDED']);
    return decide(report, 'evidence-only', 'inspect-record-reader-and-decoder-evidence', ['PARSER_DID_NOT_PRODUCE_STAGE_MODEL']);
  } catch (error) {
    report.errors.push(message('RVM_EVIDENCE_RUNNER_FAILED', error?.message || String(error)));
    return decide(report, 'runner-failed', 'inspect-runner-error', ['RUNNER_EXCEPTION']);
  }
}

export function summarizeRvmEvidenceReport(report) {
  return {
    schema: report?.schema || '', runnerVersion: report?.runnerVersion || '', generatedAt: report?.generatedAt || '',
    source: report?.source || {}, claims: report?.claims || {}, preflightValid: report?.preflight?.valid === true,
    diagnosticsAvailable: report?.diagnostics?.available === true, recordReaderAvailable: report?.recordReader?.available === true,
    parserAttempted: report?.parser?.attempted === true, parserOk: report?.parser?.ok === true, stageModelProduced: report?.parser?.stageModelProduced === true,
    nativeCodeCounts: report?.codeEvidence?.nativeCodeCounts || {}, code4: report?.codeEvidence?.code4 || {}, code11: report?.codeEvidence?.code11 || {},
    decision: report?.decision || {}, warningCount: (report?.warnings || []).length, errorCount: (report?.errors || []).length,
  };
}

export function validateRvmEvidenceReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return invalid('report must be an object');
  if (report.schema !== RVM_EVIDENCE_REPORT_SCHEMA) errors.push(`schema must be ${RVM_EVIDENCE_REPORT_SCHEMA}`);
  if (report.runnerVersion !== RVM_EVIDENCE_REPORT_RUNNER_VERSION) errors.push('runnerVersion is invalid');
  if (report.claims?.parserComplete !== false) errors.push('claims.parserComplete must remain false');
  if (report.claims?.visualParityClaimed !== false) errors.push('claims.visualParityClaimed must remain false');
  if (report.claims?.realCompatibilityProven !== false) errors.push('claims.realCompatibilityProven must remain false');
  for (const key of ['warnings', 'errors']) if (!Array.isArray(report[key])) errors.push(`${key} must be an array`);
  if (report.worker?.attempted !== false || report.worker?.ok !== false) errors.push('worker must remain not attempted');
  if (hasForbiddenTopLevel(report)) errors.push('report must not expose stageModel/renderPlan/manifest/geometryChunks');
  if (report.codeEvidence?.code11?.decoded !== false) errors.push('code11.decoded must remain false');
  if (!report.decision?.category) errors.push('decision.category is required');
  return { valid: errors.length === 0, errors };
}

function applyCodeEvidence(report) {
  const nativeCodeCounts = { ...(report.diagnostics.summary?.nativeCodeCounts || {}), ...(report.recordReader.summary?.nativeCodeCounts || {}) };
  const decoderSummaries = report.parser.summary?.decoderSummaries || [];
  report.codeEvidence.nativeCodeCounts = nativeCodeCounts;
  report.codeEvidence.code4 = { candidateCount: count(nativeCodeCounts, 4), decodeSuccess: decoderSummaries.filter((item) => item?.decodedOk === true).length, decodeFailure: decoderSummaries.filter((item) => item?.decodedOk === false).length, decoderSummaries };
  report.codeEvidence.code11 = { candidateCount: count(nativeCodeCounts, 11), decoded: false };
}

function decide(report, category, nextAction, reasonCodes) {
  applyCodeEvidence(report);
  report.decision = { category, nextAction, reasonCodes };
  return report;
}

function collectMessages(report, source) {
  report.warnings.push(...((source?.warnings || []).map((item) => ({ ...item }))));
  report.errors.push(...((source?.errors || []).map((item) => ({ ...item }))));
}

function sourceFrom(input) {
  return { jobId: input.jobId || '', fileName: input.fileName || '', fileHash: input.fileHash || '', fileSize: Number(input.fileSize) || 0, byteLength: byteLengthOf(input.arrayBuffer) };
}

function byteLengthOf(value) { return value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? value.byteLength : 0; }
function count(counts, code) { return Number(counts?.[String(code)] ?? counts?.[code]) || 0; }
function hasForbiddenTopLevel(report) { return ['stageModel', 'renderPlan', 'manifest', 'geometryChunks'].some((key) => Object.hasOwn(report, key)); }
function message(code, text) { return { code, message: text }; }
function invalid(messageText) { return { valid: false, errors: [messageText] }; }
