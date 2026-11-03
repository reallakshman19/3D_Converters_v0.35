import { validateRvmFacetGroupEvidence } from './RvmFacetGroupDecodeContract.js';

export const RVM_PRIMITIVE_DECODE_REPORT_SCHEMA = 'RvmPrimitiveDecodeReport.v1';
export const RVM_PRIMITIVE_DECODE_REPORT_VERSION = '20260702-rvm-primitive-decode-report-v1';

export function createEmptyRvmPrimitiveDecodeReport(options = {}) {
  return {
    schema: RVM_PRIMITIVE_DECODE_REPORT_SCHEMA,
    reportVersion: RVM_PRIMITIVE_DECODE_REPORT_VERSION,
    source: { fileName: options.fileName || '', fileHash: options.fileHash || '', byteLength: num(options.byteLength), sourceKind: 'rvm-binary' },
    parser: { readerSchema: options.readerSchema || '', readerVersion: options.readerVersion || '', ledgerSchema: options.ledgerSchema || '', ledgerVersion: options.ledgerVersion || '', parserComplete: false, visualParityClaimed: false },
    coverage: { primitiveRecordCount: 0, decodedCount: 0, unsupportedCount: 0, failedCount: 0, decodedByCode: {}, unsupportedByCode: {}, failedByCode: {} },
    decodedPrimitives: [],
    unsupportedPrimitives: [],
    diagnostics: [],
    warnings: [],
    errors: [],
  };
}

export function validateRvmPrimitiveDecodeReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return invalid('report must be an object');
  validateShape(report, errors);
  for (const item of report.decodedPrimitives || []) validateDecoded(item, errors);
  for (const item of report.unsupportedPrimitives || []) validateUnsupported(item, errors);
  return { valid: errors.length === 0, errors };
}

export function summarizeRvmPrimitiveDecodeReport(report) {
  return {
    schema: report?.schema || RVM_PRIMITIVE_DECODE_REPORT_SCHEMA,
    reportVersion: report?.reportVersion || RVM_PRIMITIVE_DECODE_REPORT_VERSION,
    sourceKind: report?.source?.sourceKind || '',
    parserComplete: report?.parser?.parserComplete === true,
    visualParityClaimed: report?.parser?.visualParityClaimed === true,
    coverage: { ...(report?.coverage || {}) },
    warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
    errorCount: Array.isArray(report?.errors) ? report.errors.length : 0,
  };
}

function validateShape(report, errors) {
  if (report.schema !== RVM_PRIMITIVE_DECODE_REPORT_SCHEMA) errors.push(`schema must be ${RVM_PRIMITIVE_DECODE_REPORT_SCHEMA}`);
  if (report.source?.sourceKind !== 'rvm-binary') errors.push('source.sourceKind must be rvm-binary');
  if (report.parser?.parserComplete !== false) errors.push('parser.parserComplete must remain false');
  if (report.parser?.visualParityClaimed !== false) errors.push('parser.visualParityClaimed must remain false');
  for (const key of ['decodedPrimitives', 'unsupportedPrimitives', 'diagnostics', 'warnings', 'errors']) if (!Array.isArray(report[key])) errors.push(`${key} must be an array`);
  for (const key of ['primitiveRecordCount', 'decodedCount', 'unsupportedCount', 'failedCount']) if (!Number.isFinite(report.coverage?.[key])) errors.push(`coverage.${key} must be finite`);
}

function validateDecoded(item, errors) {
  if (!item || typeof item !== 'object') return errors.push('decoded primitive must be an object');
  for (const key of ['id', 'primitiveRecordId', 'nodeId', 'parentPath', 'nativeKind']) requireString(item[key], `decoded.${key}`, errors);
  for (const key of ['recordOffset', 'recordEndOffset', 'nativeCode']) requireFinite(item[key], `decoded.${key}`, errors);
  if (item.decodeStatus !== 'decoded-native') errors.push('decoded.decodeStatus must be decoded-native');
  if (item.geometryDecoded !== true) errors.push('decoded.geometryDecoded must be true');
  if (!isMatrix3x4(item.transform3x4)) errors.push('decoded.transform3x4 must have 12 finite numbers');
  if (!isMatrix3x3(item.matrix3x3)) errors.push('decoded.matrix3x3 must have 9 finite numbers');
  if (!isPoint(item.origin)) errors.push('decoded.origin must be finite point');
  if (!isBbox(item.localBbox) || !isBbox(item.worldBbox)) errors.push('decoded local/world bbox must be finite bbox arrays');
  if (item.geometryBasis?.source !== 'rvm-native-primitive') errors.push('decoded.geometryBasis.source must be rvm-native-primitive');
  if (item.geometryBasis?.renderReady !== false) errors.push('decoded.geometryBasis.renderReady must be false');
  if (Number(item.nativeCode) === 11) validateFacetEvidence(item, errors);
}

function validateFacetEvidence(item, errors) {
  if (item.geometryBasis?.confidence !== 'native-facet-evidence') errors.push('decoded code 11 confidence must be native-facet-evidence');
  const validation = validateRvmFacetGroupEvidence(item.facetGroup);
  if (!validation.valid) errors.push(...validation.errors.map((error) => `facetGroup: ${error}`));
}

function validateUnsupported(item, errors) {
  if (!item || typeof item !== 'object') return errors.push('unsupported primitive must be an object');
  for (const key of ['primitiveRecordId', 'nodeId', 'parentPath', 'nativeKind', 'reason']) requireString(item[key], `unsupported.${key}`, errors);
  for (const key of ['recordOffset', 'recordEndOffset', 'nativeCode']) requireFinite(item[key], `unsupported.${key}`, errors);
  if (!['unsupported-diagnostic', 'failed-diagnostic'].includes(item.decodeStatus)) errors.push('unsupported.decodeStatus must be diagnostic');
  if (item.geometryDecoded !== false) errors.push('unsupported.geometryDecoded must be false');
  if (!Array.isArray(item.diagnostics)) errors.push('unsupported.diagnostics must be an array');
}

function requireString(value, label, errors) { if (typeof value !== 'string' || !value.trim()) errors.push(`${label} must be a non-empty string`); }
function requireFinite(value, label, errors) { if (!Number.isFinite(value)) errors.push(`${label} must be finite`); }
function isMatrix3x4(value) { return Array.isArray(value) && value.length === 12 && value.every(Number.isFinite); }
function isMatrix3x3(value) { return Array.isArray(value) && value.length === 9 && value.every(Number.isFinite); }
function isPoint(value) { return value && ['x', 'y', 'z'].every((key) => Number.isFinite(value[key])); }
function isBbox(value) { return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) && value[0] <= value[3] && value[1] <= value[4] && value[2] <= value[5]; }
function num(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function invalid(message) { return { valid: false, errors: [message] }; }
