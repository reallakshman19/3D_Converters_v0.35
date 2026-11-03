import {
  VIBRATION_OPERATING_CASE_QUANTITIES,
  vibrationDatasetError,
} from './schema.js';

const OPERATING_CASE_KEYS = new Set([
  'caseId', 'line', 'label', 'phase', 'source', 'sourceRevision', 'recordId',
  ...VIBRATION_OPERATING_CASE_QUANTITIES,
]);
const ENRICHMENT_KEYS = new Set([
  'canonicalId', 'line', 'caseId', 'property', 'value', 'unit', 'source',
  'sourceRevision', 'recordId', 'status', 'reviewer',
]);

function text(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function requiredText(value, field, details = {}) {
  const result = text(value);
  if (!result || !result.trim()) {
    throw vibrationDatasetError('VIBRATION_DATASET_REQUIRED_VALUE', `${field} is required.`, details);
  }
  return result;
}

function assertKnownKeys(value, allowed, kind, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw vibrationDatasetError('VIBRATION_DATASET_INVALID_RECORD', `${kind} must be an object.`, { index });
  }
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw vibrationDatasetError(
      'VIBRATION_DATASET_UNKNOWN_FIELD',
      `${kind} contains unsupported fields: ${unknown.join(', ')}.`,
      { index, unknown },
    );
  }
}

function normalizeQuantity(quantity, field, details) {
  if (quantity === undefined || quantity === null) return undefined;
  if (!quantity || typeof quantity !== 'object' || Array.isArray(quantity)) {
    throw vibrationDatasetError(
      'VIBRATION_DATASET_INVALID_QUANTITY',
      `${field} must be an object containing value and unit.`,
      details,
    );
  }
  const allowed = field === 'pressure'
    ? new Set(['value', 'unit', 'reference'])
    : new Set(['value', 'unit']);
  const unknown = Object.keys(quantity).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw vibrationDatasetError(
      'VIBRATION_DATASET_INVALID_QUANTITY',
      `${field} contains unsupported quantity fields: ${unknown.join(', ')}.`,
      { ...details, unknown },
    );
  }
  if (typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) {
    throw vibrationDatasetError(
      'VIBRATION_DATASET_INVALID_QUANTITY',
      `${field}.value must be a finite number.`,
      { ...details, value: quantity.value },
    );
  }
  const normalized = { value: quantity.value, unit: requiredText(quantity.unit, `${field}.unit`, details) };
  if (quantity.reference !== undefined && quantity.reference !== null) {
    normalized.reference = requiredText(quantity.reference, `${field}.reference`, details);
  }
  return normalized;
}

function normalizeOperatingCase(value, index) {
  assertKnownKeys(value, OPERATING_CASE_KEYS, 'Operating case', index);
  const details = { index };
  const normalized = {
    caseId: requiredText(value.caseId, 'caseId', details),
    line: requiredText(value.line, 'line', details),
    source: requiredText(value.source, 'source', details),
  };
  for (const field of ['label', 'phase', 'sourceRevision', 'recordId']) {
    if (value[field] !== undefined && value[field] !== null) {
      normalized[field] = requiredText(value[field], field, details);
    }
  }
  for (const field of VIBRATION_OPERATING_CASE_QUANTITIES) {
    const quantity = normalizeQuantity(value[field], field, details);
    if (quantity !== undefined) normalized[field] = quantity;
  }
  return normalized;
}

function normalizeEnrichment(value, index) {
  assertKnownKeys(value, ENRICHMENT_KEYS, 'Enrichment row', index);
  const details = { index };
  const normalized = {
    canonicalId: requiredText(value.canonicalId, 'canonicalId', details),
    property: requiredText(value.property, 'property', details),
    source: requiredText(value.source, 'source', details),
  };
  if (value.value === undefined || value.value === null) {
    throw vibrationDatasetError('VIBRATION_DATASET_REQUIRED_VALUE', 'Enrichment value is required.', details);
  }
  if (typeof value.value === 'number' && !Number.isFinite(value.value)) {
    throw vibrationDatasetError(
      'VIBRATION_DATASET_INVALID_ENRICHMENT_VALUE',
      'Numeric enrichment value must be finite.',
      { ...details, value: value.value },
    );
  }
  if (!['string', 'number', 'boolean'].includes(typeof value.value)) {
    throw vibrationDatasetError(
      'VIBRATION_DATASET_INVALID_ENRICHMENT_VALUE',
      'Enrichment value must be a string, finite number or boolean.',
      { ...details, valueType: typeof value.value },
    );
  }
  normalized.value = value.value;
  for (const field of ['line', 'caseId', 'unit', 'sourceRevision', 'recordId', 'status', 'reviewer']) {
    if (value[field] !== undefined && value[field] !== null) {
      normalized[field] = requiredText(value[field], field, details);
    }
  }
  return normalized;
}

export function normalizeVibrationOperatingCases(values, knownLines) {
  if (!Array.isArray(values)) {
    throw vibrationDatasetError('VIBRATION_DATASET_INVALID_OPERATING_CASES', 'operatingCases must be an array.');
  }
  const seen = new Set();
  const normalized = values.map(normalizeOperatingCase);
  for (const row of normalized) {
    if (!knownLines.has(row.line)) {
      throw vibrationDatasetError(
        'VIBRATION_DATASET_ORPHAN_OPERATING_CASE',
        `Operating case ${row.caseId} references unknown line ${row.line}.`,
        { line: row.line, caseId: row.caseId },
      );
    }
    const key = `${row.line}\u0000${row.caseId}`;
    if (seen.has(key)) {
      throw vibrationDatasetError(
        'VIBRATION_DATASET_DUPLICATE_OPERATING_CASE',
        `Duplicate operating case ${row.caseId} on line ${row.line}.`,
        { line: row.line, caseId: row.caseId },
      );
    }
    seen.add(key);
  }
  return normalized.sort((a, b) => a.line.localeCompare(b.line) || a.caseId.localeCompare(b.caseId));
}

function caseIdsByLine(operatingCases) {
  const result = new Map();
  for (const row of operatingCases) {
    if (!result.has(row.line)) result.set(row.line, new Set());
    result.get(row.line).add(row.caseId);
  }
  return result;
}

export function normalizeVibrationEnrichment(values, exchange, operatingCases) {
  if (!Array.isArray(values)) {
    throw vibrationDatasetError('VIBRATION_DATASET_INVALID_ENRICHMENT', 'enrichment must be an array.');
  }
  const lineByElement = new Map(exchange.elements.map((element) => [element.canonicalId, element.line ?? null]));
  const casesByLine = caseIdsByLine(operatingCases);
  const seen = new Set();
  const normalized = values.map(normalizeEnrichment);
  for (const row of normalized) {
    if (!lineByElement.has(row.canonicalId)) {
      throw vibrationDatasetError(
        'VIBRATION_DATASET_ORPHAN_ENRICHMENT',
        `Enrichment references unknown Canonical ID ${row.canonicalId}.`,
        { canonicalId: row.canonicalId, property: row.property },
      );
    }
    const elementLine = lineByElement.get(row.canonicalId);
    if (row.line !== undefined && row.line !== elementLine) {
      throw vibrationDatasetError(
        'VIBRATION_DATASET_ENRICHMENT_LINE_MISMATCH',
        `Enrichment line ${row.line} does not match element line ${elementLine ?? '(none)'}.`,
        { canonicalId: row.canonicalId, enrichmentLine: row.line, elementLine },
      );
    }
    if (row.caseId !== undefined && (!elementLine || !casesByLine.get(elementLine)?.has(row.caseId))) {
      throw vibrationDatasetError(
        'VIBRATION_DATASET_ENRICHMENT_CASE_MISMATCH',
        `Enrichment case ${row.caseId} is not defined for element line ${elementLine ?? '(none)'}.`,
        { canonicalId: row.canonicalId, line: elementLine, caseId: row.caseId },
      );
    }
    const key = `${row.canonicalId}\u0000${row.caseId ?? ''}\u0000${row.property}`;
    if (seen.has(key)) {
      throw vibrationDatasetError(
        'VIBRATION_DATASET_DUPLICATE_ENRICHMENT',
        'Duplicate enrichment property for the same element/case.',
        { canonicalId: row.canonicalId, caseId: row.caseId ?? null, property: row.property },
      );
    }
    seen.add(key);
  }
  return normalized.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId)
    || String(a.caseId ?? '').localeCompare(String(b.caseId ?? ''))
    || a.property.localeCompare(b.property));
}
