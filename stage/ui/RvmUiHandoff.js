export const RVM_UI_STATUS = Object.freeze({
  parsed: 'RVM StageModel generated successfully.',
  diagnosticsOnly: 'RVM diagnostics only — worker could not build staged model',
  preflightFailed: 'RVM preflight failed',
});

export function classifyRvmWorkerResult(result = {}) {
  const code = result?.error?.code || '';
  const hasStage = Boolean(result?.ok && result?.stageModel?.schema === 'RvmStageModel.v1');
  if (hasStage) return { kind: 'evidence-success', statusText: RVM_UI_STATUS.parsed };
  if (code === 'STAGE_RVM_PREFLIGHT_FAILED') return { kind: 'preflight-failed', statusText: RVM_UI_STATUS.preflightFailed };
  if (code === 'STAGE_RVM_PARSING_NOT_IMPLEMENTED') return { kind: 'diagnostics-only', statusText: RVM_UI_STATUS.diagnosticsOnly };
  return { kind: 'rvm-failed', statusText: RVM_UI_STATUS.diagnosticsOnly };
}

export function summarizeRvmUiHandoff(result = {}) {
  const context = result?.error?.context || result?.context || {};
  const readerReport = result?.readerReport || context.readerReport;
  const ledger = result?.nativeRecordLedger || context.nativeRecordLedger;
  const decodeReport = result?.primitiveDecodeReport || context.primitiveDecodeReport;
  return {
    readerSummary: summarizeReader(readerReport),
    ledgerSummary: summarizeLedger(ledger),
    primitiveDecodeSummary: summarizeDecode(decodeReport),
    preflightSummary: context.preflightSummary || context.preflight?.summary || context.preflight || result?.preflightSummary || null,
  };
}

export function createRvmUiDiagnostics(result = {}) {
  const summary = summarizeRvmUiHandoff(result);
  const diagnostics = [];
  if (summary.preflightSummary) diagnostics.push(info('STAGE_RVM_PREFLIGHT_SUMMARY', compact(summary.preflightSummary)));
  if (summary.readerSummary) diagnostics.push(info('STAGE_RVM_WIDE_READER_SUMMARY', compact(summary.readerSummary)));
  if (summary.ledgerSummary) diagnostics.push(info('STAGE_RVM_NATIVE_LEDGER_SUMMARY', compact(summary.ledgerSummary)));
  if (summary.primitiveDecodeSummary) diagnostics.push(info('STAGE_RVM_PRIMITIVE_DECODE_SUMMARY', compact(summary.primitiveDecodeSummary)));
  return diagnostics;
}

export function isRvmParserSuccess(result = {}) {
  return classifyRvmWorkerResult(result).kind === 'evidence-success';
}

function summarizeReader(report) {
  if (!report) return null;
  return { schema: report.schema || '', recordCount: report.records?.length || report.recordCount || 0, byTag: report.counts?.byTag || report.recordsByTag || {} };
}

function summarizeLedger(ledger) {
  if (!ledger) return null;
  return { schema: ledger.schema || '', nodeCount: ledger.nodes?.length || 0, primitiveRecordCount: ledger.primitiveRecords?.length || 0, balanced: ledger.hierarchy?.balanced === true };
}

function summarizeDecode(report) {
  if (!report) return null;
  return { schema: report.schema || '', coverage: report.coverage || {} };
}

function info(code, message) { return { severity: 'info', code, message }; }
function compact(value) { if (typeof value === 'string') return value; try { return JSON.stringify(value); } catch { return String(value); } }
