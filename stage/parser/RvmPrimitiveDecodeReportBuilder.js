import {
  createEmptyRvmPrimitiveDecodeReport,
  validateRvmPrimitiveDecodeReport,
} from '../contracts/RvmPrimitiveDecodeContract.js';
import { RVM_WIDE_RECORD_READER_SCHEMA } from './RvmWideRecordReader.js';
import { decodeRvmPrimitivePayload } from './RvmPrimitivePayloadDecoder.js';

export const RVM_PRIMITIVE_DECODE_REPORT_BUILDER_VERSION = '20260702-rvm-primitive-decode-report-builder-v1';

export function buildRvmPrimitiveDecodeReport(input = {}) {
  const ledger = input.ledger || {};
  const readerReport = input.readerReport || {};
  const report = createReport(readerReport, ledger);
  for (const record of ledger.primitiveRecords || []) addDecodeResult(report, decodeRvmPrimitivePayload({ arrayBuffer: input.arrayBuffer, primitiveRecord: record }));
  finalizeCoverage(report, ledger);
  return report;
}

export function validateBuiltRvmPrimitiveDecodeReport(report) {
  return validateRvmPrimitiveDecodeReport(report);
}

function createReport(readerReport, ledger) {
  const report = createEmptyRvmPrimitiveDecodeReport({
    ...ledger.source,
    readerSchema: readerReport.schema || RVM_WIDE_RECORD_READER_SCHEMA,
    readerVersion: readerReport.readerVersion || ledger.parser?.readerVersion || '',
    ledgerSchema: ledger.schema || '',
    ledgerVersion: ledger.ledgerVersion || '',
  });
  report.warnings.push(...(readerReport.warnings || []), ...(ledger.warnings || []));
  report.errors.push(...(readerReport.errors || []), ...(ledger.errors || []));
  report.diagnostics.push(...(readerReport.diagnostics || []), ...(ledger.diagnostics || []));
  return report;
}

function addDecodeResult(report, result) {
  if (result.decodeStatus === 'decoded-native') return addDecoded(report, result);
  if (result.decodeStatus === 'unsupported-diagnostic') return addUnsupported(report, result);
  return addFailed(report, result);
}

function addDecoded(report, result) {
  report.decodedPrimitives.push(result);
  report.coverage.decodedCount += 1;
  increment(report.coverage.decodedByCode, result.nativeCode);
}

function addUnsupported(report, result) {
  report.unsupportedPrimitives.push(result);
  report.coverage.unsupportedCount += 1;
  increment(report.coverage.unsupportedByCode, result.nativeCode);
  report.diagnostics.push(...(result.diagnostics || []));
}

function addFailed(report, result) {
  report.unsupportedPrimitives.push(result);
  report.coverage.failedCount += 1;
  increment(report.coverage.failedByCode, result.nativeCode);
  report.diagnostics.push(...(result.diagnostics || []));
}

function finalizeCoverage(report, ledger) {
  report.parser.parserComplete = false;
  report.parser.visualParityClaimed = false;
  report.coverage.primitiveRecordCount = Array.isArray(ledger.primitiveRecords) ? ledger.primitiveRecords.length : 0;
}

function increment(target, key) {
  const text = String(key);
  target[text] = (target[text] || 0) + 1;
}
