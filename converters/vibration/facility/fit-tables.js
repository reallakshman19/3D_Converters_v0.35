import { assertVibrationTableExchangeShape } from '../exchange/schema.js';
import {
  parseVibrationTableExchangeCsv,
  parseVibrationTableExchangeXlsx,
} from '../exchange/parse.js';
import {
  applyVibrationFitDataBlockers,
  parseVibrationEnrichmentCsv,
  parseVibrationFitDataBlockerCsv,
  parseVibrationOperatingCaseCsv,
} from '../tabular/index.js';

export const VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT = Object.freeze({
  PARSED_EXCHANGE: 'PARSED_EXCHANGE',
  XLSX: 'XLSX',
  CSV_ELEMENTS_ONLY: 'CSV_ELEMENTS_ONLY',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function tableError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationFacilityFitTableError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function parseTopology(topology) {
  if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
    throw tableError(
      'FIT_FACILITY_TOPOLOGY_INPUT_REQUIRED',
      'topology must be an object containing format and data.',
    );
  }
  const sourceFileName = topology.sourceFileName === undefined || topology.sourceFileName === null
    ? undefined
    : String(topology.sourceFileName);
  if (topology.format === VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.PARSED_EXCHANGE) {
    return assertVibrationTableExchangeShape(topology.data);
  }
  if (topology.format === VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.XLSX) {
    return parseVibrationTableExchangeXlsx(topology.data, { sourceFileName });
  }
  if (topology.format === VIBRATION_FACILITY_TOPOLOGY_INPUT_FORMAT.CSV_ELEMENTS_ONLY) {
    return parseVibrationTableExchangeCsv(topology.data, { sourceFileName });
  }
  throw tableError(
    'FIT_FACILITY_TOPOLOGY_FORMAT_UNSUPPORTED',
    'Unsupported topology input format.',
    { format: topology.format ?? null },
  );
}

function parseOptionalCsv(value, parser) {
  if (value === undefined || value === null || value === '') return Object.freeze([]);
  return parser(value);
}

export function parseVibrationFacilityFitTables(input = {}) {
  const exchange = parseTopology(input.topology);
  const sourceOperatingCases = parseOptionalCsv(input.operatingCaseCsv, parseVibrationOperatingCaseCsv);
  const sourceEnrichment = parseOptionalCsv(input.enrichmentCsv, parseVibrationEnrichmentCsv);
  const dataBlockers = parseOptionalCsv(input.dataBlockerCsv, parseVibrationFitDataBlockerCsv);
  const applied = applyVibrationFitDataBlockers({
    operatingCases: sourceOperatingCases,
    enrichment: sourceEnrichment,
    blockers: dataBlockers,
  });
  return deepFreeze({
    exchange,
    operatingCases: applied.operatingCases,
    enrichment: applied.enrichment,
    dataBlockers,
    imports: {
      topologyFormat: input.topology.format,
      topologySourceFileName: exchange.sourceFileName ?? input.topology.sourceFileName ?? null,
      exchangeSchema: exchange.schema,
      exchangeIntegrityStatus: exchange.integrityStatus ?? null,
      operatingCaseCount: sourceOperatingCases.length,
      enrichmentCount: sourceEnrichment.length,
      dataBlockerCount: dataBlockers.length,
      activeDataBlockerCount: applied.appliedCount,
    },
  });
}
