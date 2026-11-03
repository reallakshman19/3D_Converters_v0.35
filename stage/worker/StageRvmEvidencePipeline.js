import { readRvmWideRecords } from '../parser/RvmWideRecordReader.js';
import { buildRvmNativeRecordLedger } from '../parser/RvmNativeRecordLedgerBuilder.js';
import { buildRvmPrimitiveDecodeReport } from '../parser/RvmPrimitiveDecodeReportBuilder.js';
import { buildRvmStageModelFromEvidence } from '../parser/RvmStageModelEmitter.js';
import { validateRvmStageModelFromEvidence } from '../contracts/RvmStageModelEvidenceContract.js';

export const STAGE_RVM_EVIDENCE_PIPELINE_VERSION = '20260702-rvm-evidence-stage-worker-pipeline-v1';

export function runStageRvmEvidencePipeline(job = {}) {
  try {
    const arrayBuffer = arrayBufferOf(job.arrayBuffer);
    const options = sourceOptions(job, arrayBuffer.byteLength);
    const readerReport = readRvmWideRecords({ arrayBuffer, ...options });
    const nativeRecordLedger = buildRvmNativeRecordLedger(readerReport);
    const primitiveDecodeReport = buildRvmPrimitiveDecodeReport({ arrayBuffer, readerReport, ledger: nativeRecordLedger });
    const stageModel = buildRvmStageModelFromEvidence({ readerReport, ledger: nativeRecordLedger, primitiveDecodeReport, options });
    const validation = validateRvmStageModelFromEvidence(stageModel);
    if (!validation.valid) return invalidResult(readerReport, nativeRecordLedger, primitiveDecodeReport, validation);
    return okResult(stageModel, readerReport, nativeRecordLedger, primitiveDecodeReport, validation);
  } catch (error) {
    return failedResult(error);
  }
}

function okResult(stageModel, readerReport, nativeRecordLedger, primitiveDecodeReport, validation) {
  return { ok: true, stageModel, readerReport, nativeRecordLedger, primitiveDecodeReport, validation, warnings: collectWarnings(readerReport, nativeRecordLedger, primitiveDecodeReport), diagnostics: collectDiagnostics(readerReport, nativeRecordLedger, primitiveDecodeReport) };
}

function invalidResult(readerReport, nativeRecordLedger, primitiveDecodeReport, validation) {
  return { ok: false, code: 'STAGE_RVM_EVIDENCE_MODEL_VALIDATION_FAILED', message: 'RVM evidence pipeline produced an invalid RvmStageModel.v1.', validationErrors: validation.errors, readerReport, nativeRecordLedger, primitiveDecodeReport };
}

function failedResult(error) {
  return { ok: false, code: 'STAGE_RVM_EVIDENCE_PIPELINE_FAILED', message: error?.message || String(error || 'RVM evidence pipeline failed.'), validationErrors: [] };
}

function sourceOptions(job, byteLength) {
  return { fileName: job.fileName || '', fileHash: job.fileHash || '', byteLength: Number(job.byteLength || job.fileSize || byteLength) || byteLength };
}

function arrayBufferOf(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return new ArrayBuffer(0);
}

function collectWarnings(...reports) {
  return reports.flatMap((report) => Array.isArray(report?.warnings) ? report.warnings : []);
}

function collectDiagnostics(...reports) {
  return reports.flatMap((report) => Array.isArray(report?.diagnostics) ? report.diagnostics : []);
}
