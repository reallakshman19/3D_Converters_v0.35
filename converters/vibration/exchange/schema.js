export const VIBRATION_TABLE_EXCHANGE_SCHEMA = 'VibrationTableExchange.v1';
export const ADVANCED_ANALYSIS_TOPOLOGY_EXPORT_SCHEMA = 'TopologyEditTableHumanExport.v1';
export const ADVANCED_ANALYSIS_EXPORT_AUTHORITY = 'CERTIFIED_CANONICAL_PROJECTION_ONLY';

export const VIBRATION_TABLE_EXCHANGE_SHEETS = Object.freeze({
  Elements: Object.freeze([
    'Tag', 'Type', 'Line', 'Connect From', 'Connect To', 'DN In (mm)', 'DN Out (mm)',
    'Length (mm)', 'Schedule', 'Material', 'Piping Class', 'Pressure Class',
    'Catalogue Authority', 'Source Status', 'Canonical ID',
  ]),
  Connections: Object.freeze([
    'Canonical ID', 'Element Type', 'Port Role', 'Port Key', 'Node ID',
  ]),
  'Source Mapping': Object.freeze([
    'Canonical ID', 'Component Key', 'Entity ID', 'Source Entity ID', 'Source Path',
    'Source Node Key', 'JSON Pointer', 'Source Status', 'Source Hash',
  ]),
  'Catalogue Evidence': Object.freeze([
    'Canonical ID', 'Authority', 'Catalogue ID', 'Catalogue Version', 'Catalogue Hash',
    'Source Hash', 'Record ID', 'Record Hash', 'Source Reference',
  ]),
  'Export Metadata': Object.freeze(['Key', 'Value']),
});

export const VIBRATION_TABLE_EXCHANGE_REQUIRED_METADATA = Object.freeze([
  'Schema',
  'Canonical Hash',
  'Projection Hash',
  'Authority',
  'Row Count',
  'Ordering',
]);

export const VIBRATION_TABLE_EXCHANGE_INTEGRITY = Object.freeze({
  DECLARED_NOT_REVERIFIED: 'DECLARED_NOT_REVERIFIED',
  LIMITED_ELEMENTS_ONLY: 'LIMITED_ELEMENTS_ONLY',
});

export const VIBRATION_TABLE_EXCHANGE_FORMAT = Object.freeze({
  XLSX: 'XLSX',
  CSV_ELEMENTS_ONLY: 'CSV_ELEMENTS_ONLY',
});

export function vibrationTableExchangeError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationTableExchangeError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

export function assertVibrationTableExchangeShape(value, options = {}) {
  if (value?.schema !== VIBRATION_TABLE_EXCHANGE_SCHEMA) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_SCHEMA_MISMATCH',
      `Exchange must use ${VIBRATION_TABLE_EXCHANGE_SCHEMA}.`,
      { actual: value?.schema ?? null },
    );
  }
  if (!Array.isArray(value.elements)) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_INVALID',
      'Exchange elements must be an array.',
    );
  }
  if (options.requireCompleteExchange === true && value.completeExchange !== true) {
    throw vibrationTableExchangeError(
      'VIBRATION_TABLE_EXCHANGE_INCOMPLETE',
      'A complete multi-sheet vibration exchange is required for this operation.',
      { sourceFormat: value.sourceFormat, integrityStatus: value.integrityStatus },
    );
  }
  return value;
}

export function deepFreezeVibrationExchange(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezeVibrationExchange(child);
  return Object.freeze(value);
}
