export const RVM_BENCHMARK_EVIDENCE_GATE_VERSION = '20260702-rvm-benchmark-evidence-gate-v1';
export const RVM_BENCHMARK_EVIDENCE_GATE_SCHEMA = 'RvmBenchmarkEvidenceGate.v1';
export const RVM_BENCHMARK_EVIDENCE_LEVELS = Object.freeze({
  none: 'none',
  diagnostics: 'diagnostics-evidence',
  recordReader: 'record-reader-evidence',
  parserAttempt: 'parser-attempt-evidence',
  syntheticCode4: 'synthetic-code4-stage-evidence',
});
export const RVM_BENCHMARK_EVIDENCE_CATEGORIES = Object.freeze(['preflight', 'diagnostics', 'recordReader', 'parser', 'code4Decoder', 'worker', 'renderReady']);

export function createRvmBenchmarkEvidenceCase(options = {}) {
  return {
    id: options.id || 'SYNTHETIC',
    label: options.label || 'RVM benchmark evidence case',
    family: options.family || 'synthetic-mvp',
    expectedFileName: options.expectedFileName || '',
    expectedFileHash: options.expectedFileHash || '',
  };
}

export function evaluateRvmBenchmarkEvidence(input = {}, benchmarkCase = createRvmBenchmarkEvidenceCase(), options = {}) {
  const bench = createRvmBenchmarkEvidenceCase(benchmarkCase);
  const counts = collectCounts(input);
  const claims = collectClaims(input, counts, options);
  const categories = collectCategories(input, counts, claims);
  const errors = [];
  const warnings = [];
  validateEvidenceEnvelope(input, bench, categories, claims, errors, warnings);
  const evidenceLevel = chooseEvidenceLevel(categories, claims);
  return {
    schema: RVM_BENCHMARK_EVIDENCE_GATE_SCHEMA,
    gateVersion: RVM_BENCHMARK_EVIDENCE_GATE_VERSION,
    benchmark: { id: bench.id, label: bench.label, family: bench.family },
    evidenceLevel,
    categories,
    counts,
    claims,
    pass: errors.length === 0 && Object.values(categories).some((category) => category.present),
    warnings,
    errors,
  };
}

export function summarizeRvmBenchmarkEvidence(result) {
  return {
    schema: result?.schema || RVM_BENCHMARK_EVIDENCE_GATE_SCHEMA,
    gateVersion: result?.gateVersion || RVM_BENCHMARK_EVIDENCE_GATE_VERSION,
    benchmarkId: result?.benchmark?.id || '',
    family: result?.benchmark?.family || '',
    evidenceLevel: result?.evidenceLevel || RVM_BENCHMARK_EVIDENCE_LEVELS.none,
    pass: Boolean(result?.pass),
    parserSucceeded: result?.claims?.parserSucceeded === true,
    stageModelProduced: result?.claims?.stageModelProduced === true,
    renderPlanProduced: result?.claims?.renderPlanProduced === true,
    code4SyntheticOnly: result?.claims?.code4SyntheticOnly === true,
    realCompatibilityProven: result?.claims?.realCompatibilityProven === true,
    visualParityClaimed: result?.claims?.visualParityClaimed === true,
    counts: result?.counts || emptyCounts(),
    warningCount: Array.isArray(result?.warnings) ? result.warnings.length : 0,
    errorCount: Array.isArray(result?.errors) ? result.errors.length : 0,
  };
}

export function validateRvmBenchmarkEvidenceResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object') return invalid('result must be an object');
  if (result.schema !== RVM_BENCHMARK_EVIDENCE_GATE_SCHEMA) errors.push(`schema must be ${RVM_BENCHMARK_EVIDENCE_GATE_SCHEMA}`);
  if (result.gateVersion !== RVM_BENCHMARK_EVIDENCE_GATE_VERSION) errors.push('gateVersion is invalid');
  if (!Object.values(RVM_BENCHMARK_EVIDENCE_LEVELS).includes(result.evidenceLevel)) errors.push('evidenceLevel is invalid');
  for (const key of RVM_BENCHMARK_EVIDENCE_CATEGORIES) if (!result.categories?.[key]) errors.push(`categories.${key} is required`);
  for (const key of Object.keys(emptyCounts())) if (!Number.isFinite(result.counts?.[key])) errors.push(`counts.${key} must be finite`);
  for (const key of Object.keys(defaultClaims())) if (typeof result.claims?.[key] !== 'boolean') errors.push(`claims.${key} must be boolean`);
  if (result.claims?.realCompatibilityProven !== false) errors.push('realCompatibilityProven must remain false');
  if (result.claims?.visualParityClaimed !== false) errors.push('visualParityClaimed must remain false');
  if (!Array.isArray(result.warnings)) errors.push('warnings must be an array');
  if (!Array.isArray(result.errors)) errors.push('errors must be an array');
  return { valid: errors.length === 0, errors };
}

function collectCategories(input, counts, claims) {
  return {
    preflight: category(Boolean(input.preflightReport), Boolean(input.preflightReport?.valid !== false)),
    diagnostics: category(Boolean(input.diagnosticsReport), countTotal(counts) > 0 || Boolean(input.diagnosticsReport)),
    recordReader: category(Boolean(input.recordReaderReport), counts.prim > 0 || Boolean(input.recordReaderReport)),
    parser: category(claims.parserAttempted, claims.parserSucceeded || claims.parserAttempted),
    code4Decoder: category(hasCode4DecoderEvidence(input), counts.code4DecodeSuccess > 0),
    worker: category(Boolean(input.workerResult), input.workerResult?.ok === true),
    renderReady: category(claims.renderPlanProduced, claims.renderPlanProduced && claims.stageModelProduced),
  };
}

function collectClaims(input, counts, options) {
  const worker = input.workerResult || {};
  const stageModelValid = worker.ok === true && worker.stageModel?.schema === 'RvmStageModel.v1';
  const renderPlanProduced = stageModelValid && Boolean(worker.renderPlan);
  return {
    diagnosticsOnly: Boolean(input.diagnosticsReport) && !input.parserReport && !worker.ok,
    parserAttempted: Boolean(input.parserReport || worker.rvmParserReport),
    parserSucceeded: stageModelValid && Boolean(input.parserReport || worker.rvmParserReport || worker.stageModel),
    stageModelProduced: stageModelValid,
    renderPlanProduced,
    code4SyntheticOnly: Boolean((stageModelValid || counts.code4DecodeSuccess > 0) && options.syntheticCode4Only !== false),
    realCompatibilityProven: false,
    visualParityClaimed: false,
  };
}

function collectCounts(input) {
  const diagnostics = input.diagnosticsReport || {};
  const reader = input.recordReaderReport || {};
  const parser = input.parserReport || input.workerResult?.rvmParserReport || {};
  const decoderSummaries = getDecoderSummaries(input);
  const counts = emptyCounts();
  counts.cntb = maxNum(diagnostics.counts?.cntb, diagnostics.recordCounts?.cntb, reader.candidateRecords?.cntb);
  counts.cnte = maxNum(diagnostics.counts?.cnte, diagnostics.recordCounts?.cnte, reader.candidateRecords?.cnte);
  counts.prim = maxNum(diagnostics.counts?.prim, diagnostics.recordCounts?.prim, reader.candidateRecords?.prim);
  counts.code4Candidates = maxNum(diagnostics.counts?.code4, diagnostics.nativeCodeCounts?.[4], diagnostics.nativeCodeCounts?.['4'], reader.nativeCodeCounts?.[4], reader.nativeCodeCounts?.['4'], parser.decodedCodes?.[4], parser.decodedCodes?.['4']);
  counts.code11Candidates = maxNum(diagnostics.counts?.code11, diagnostics.nativeCodeCounts?.[11], diagnostics.nativeCodeCounts?.['11'], reader.nativeCodeCounts?.[11], reader.nativeCodeCounts?.['11']);
  counts.unsupportedNativeCodes = sumUnsupported(diagnostics, parser);
  counts.code4DecodeSuccess = decoderSummaries.filter((item) => item?.decodedOk === true || item?.decoded?.ok === true).length;
  counts.code4DecodeFailure = decoderSummaries.filter((item) => item && !(item.decodedOk === true || item.decoded?.ok === true)).length;
  return counts;
}

function validateEvidenceEnvelope(input, bench, categories, claims, errors, warnings) {
  if (!input || typeof input !== 'object' || Object.keys(input).length === 0) errors.push(error('RVM_BENCHMARK_EVIDENCE_EMPTY_INPUT', 'evidence input is required'));
  if (bench.expectedFileName && input.fileName && input.fileName !== bench.expectedFileName) warnings.push(warn('RVM_BENCHMARK_EVIDENCE_FILENAME_MISMATCH', 'input fileName differs from benchmark case'));
  if (bench.expectedFileHash && input.fileHash && input.fileHash !== bench.expectedFileHash) warnings.push(warn('RVM_BENCHMARK_EVIDENCE_HASH_MISMATCH', 'input fileHash differs from benchmark case'));
  if (claims.stageModelProduced && !categories.worker.pass) errors.push(error('RVM_BENCHMARK_STAGE_MODEL_WITHOUT_WORKER_OK', 'stage model evidence requires workerResult.ok true'));
  if (input.workerResult?.stageModel && input.workerResult.stageModel.schema !== 'RvmStageModel.v1') errors.push(error('RVM_BENCHMARK_INVALID_STAGE_SCHEMA', 'stageModel schema must be RvmStageModel.v1'));
  if (hasGeometryChunks(input)) warnings.push(warn('RVM_BENCHMARK_GEOMETRY_CHUNKS_IGNORED', 'geometryChunks evidence does not imply visual parity'));
}

function chooseEvidenceLevel(categories, claims) {
  if (claims.stageModelProduced && claims.code4SyntheticOnly) return RVM_BENCHMARK_EVIDENCE_LEVELS.syntheticCode4;
  if (claims.parserAttempted) return RVM_BENCHMARK_EVIDENCE_LEVELS.parserAttempt;
  if (categories.recordReader.present) return RVM_BENCHMARK_EVIDENCE_LEVELS.recordReader;
  if (categories.diagnostics.present) return RVM_BENCHMARK_EVIDENCE_LEVELS.diagnostics;
  return RVM_BENCHMARK_EVIDENCE_LEVELS.none;
}

function getDecoderSummaries(input) {
  return [
    ...array(input.code4DecoderSummaries),
    ...array(input.decoderSummaries),
    ...array(input.parserReport?.decoderSummaries),
    ...array(input.workerResult?.code4DecoderSummaries),
    ...array(input.workerResult?.rvmParserReport?.decoderSummaries),
  ];
}

function hasCode4DecoderEvidence(input) { return getDecoderSummaries(input).length > 0; }
function hasGeometryChunks(input) { return Boolean(input.geometryChunks || input.workerResult?.geometryChunks || input.workerResult?.stageModel?.geometryChunks?.length); }
function countTotal(counts) { return counts.cntb + counts.cnte + counts.prim + counts.code4Candidates + counts.code11Candidates; }
function sumUnsupported(diagnostics, parser) { return num(diagnostics.counts?.unknownNativeCodes) + Object.values(parser.unsupportedCodes || {}).reduce((sum, value) => sum + num(value), 0); }
function category(present, pass) { return { present: Boolean(present), pass: Boolean(present && pass) }; }
function emptyCounts() { return { cntb: 0, cnte: 0, prim: 0, code4Candidates: 0, code4DecodeSuccess: 0, code4DecodeFailure: 0, code11Candidates: 0, unsupportedNativeCodes: 0 }; }
function defaultClaims() { return { diagnosticsOnly: false, parserAttempted: false, parserSucceeded: false, stageModelProduced: false, renderPlanProduced: false, code4SyntheticOnly: false, realCompatibilityProven: false, visualParityClaimed: false }; }
function maxNum(...values) { return Math.max(0, ...values.map(num)); }
function num(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function array(value) { return Array.isArray(value) ? value : []; }
function warn(code, message) { return { severity: 'warning', code, message }; }
function error(code, message) { return { severity: 'error', code, message }; }
function invalid(messageText) { return { valid: false, errors: [messageText] }; }
