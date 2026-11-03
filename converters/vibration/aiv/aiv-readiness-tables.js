import { assertVibrationTableExchangeShape } from '../exchange/schema.js';
import { parseVibrationTableExchangeXlsx } from '../exchange/parse.js';
import { parseAivAssessmentCsv, AIV_ASSESSMENT_CSV_SCHEMA } from './assessment-csv.js';
import { buildAivReadiness } from './aiv-readiness.js';
import { parseAivSourceCsv, AIV_SOURCE_CSV_SCHEMA } from './source-csv.js';
import {
  AIV_SOURCE_ASSESSMENT_CSV_SCHEMA,
  parseAivSourceAssessmentCsv,
} from './source-assessment-csv.js';

export const AIV_TOPOLOGY_INPUT_FORMAT = Object.freeze({
  PARSED_EXCHANGE: 'PARSED_EXCHANGE',
  XLSX: 'XLSX',
  FLARE_NETWORK: 'FLARE_NETWORK',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function tableError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'AivReadinessTableError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function assertFlareNetworkExchange(value) {
  if (value?.schema !== 'AivFlareNetworkTopologyExchange.v1'
    || !Array.isArray(value.elements) || !Array.isArray(value.segments)) {
    throw tableError(
      'AIV_FLARE_NETWORK_TOPOLOGY_INVALID',
      'AIV flare-network readiness requires AivFlareNetworkTopologyExchange.v1 with elements and segments.',
    );
  }
  return value;
}

function parseTopology(topology) {
  if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
    throw tableError('AIV_TOPOLOGY_INPUT_REQUIRED', 'AIV readiness requires a topology input object.');
  }
  let exchange;
  if (topology.format === AIV_TOPOLOGY_INPUT_FORMAT.PARSED_EXCHANGE) {
    exchange = assertVibrationTableExchangeShape(topology.data);
  } else if (topology.format === AIV_TOPOLOGY_INPUT_FORMAT.XLSX) {
    exchange = parseVibrationTableExchangeXlsx(topology.data, {
      sourceFileName: topology.sourceFileName === undefined ? undefined : String(topology.sourceFileName),
    });
  } else if (topology.format === AIV_TOPOLOGY_INPUT_FORMAT.FLARE_NETWORK) {
    exchange = assertFlareNetworkExchange(topology.data);
  } else {
    throw tableError(
      'AIV_TOPOLOGY_FORMAT_UNSUPPORTED',
      'AIV readiness requires either complete five-sheet topology evidence or an explicit authored flare-network graph.',
      { format: topology.format ?? null },
    );
  }
  if (topology.format !== AIV_TOPOLOGY_INPUT_FORMAT.FLARE_NETWORK && exchange.completeExchange !== true) {
    throw tableError(
      'AIV_COMPLETE_TOPOLOGY_REQUIRED',
      'Imported AIV topology requires Connections, Source Mapping, Catalogue Evidence and Export Metadata in addition to Elements.',
      { sourceFormat: exchange.sourceFormat ?? null, integrityStatus: exchange.integrityStatus ?? null },
    );
  }
  return exchange;
}

export function buildAivReadinessFromTables(input = {}) {
  const exchange = parseTopology(input.topology);
  const sources = parseAivSourceCsv(input.sourceCsv ?? '');
  const assessments = parseAivAssessmentCsv(input.assessmentCsv ?? '');
  const sourceAssessments = parseAivSourceAssessmentCsv(input.sourceAssessmentCsv ?? '');
  const readiness = buildAivReadiness(exchange, sources, assessments, sourceAssessments);
  return deepFreeze({
    schema: 'AivReadinessTableEnvelope.v2',
    imports: {
      topologyFormat: input.topology.format,
      topologySourceFileName: exchange.sourceFileName ?? input.topology.sourceFileName ?? null,
      exchangeSchema: exchange.schema,
      exchangeIntegrityStatus: exchange.integrityStatus ?? null,
      sourceSchema: AIV_SOURCE_CSV_SCHEMA,
      sourceCount: sources.length,
      assessmentSchema: AIV_ASSESSMENT_CSV_SCHEMA,
      assessmentCount: assessments.length,
      sourceAssessmentSchema: AIV_SOURCE_ASSESSMENT_CSV_SCHEMA,
      sourceAssessmentCount: sourceAssessments.length,
    },
    exchange,
    sources,
    assessments,
    sourceAssessments,
    readiness,
  });
}
