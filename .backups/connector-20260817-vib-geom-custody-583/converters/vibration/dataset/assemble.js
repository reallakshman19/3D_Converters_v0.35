import { assertVibrationTableExchangeShape } from '../exchange/schema.js';
import {
  normalizeVibrationEnrichment,
  normalizeVibrationOperatingCases,
} from './records.js';
import {
  VIBRATION_INTEGRITY_DATASET_AUTHORITY,
  VIBRATION_INTEGRITY_DATASET_SCHEMA,
  deepFreezeVibrationDataset,
} from './schema.js';

function knownLines(exchange) {
  return new Set(exchange.elements.map((element) => element.line).filter((line) => line));
}

function buildLines(exchange, operatingCases) {
  const cases = new Map();
  for (const row of operatingCases) {
    if (!cases.has(row.line)) cases.set(row.line, []);
    cases.get(row.line).push(row);
  }
  const elements = new Map();
  for (const element of exchange.elements) {
    if (!element.line) continue;
    if (!elements.has(element.line)) elements.set(element.line, []);
    elements.get(element.line).push(element.canonicalId);
  }
  return [...elements.keys()].sort().map((line) => ({
    line,
    elementCanonicalIds: elements.get(line).sort(),
    operatingCases: cases.get(line) ?? [],
  }));
}

function datasetWarnings(exchange, lines, unassignedElementCanonicalIds) {
  const warnings = [];
  if (exchange.completeExchange !== true) {
    warnings.push({
      code: 'LIMITED_EXCHANGE_ACCEPTED',
      message: 'Dataset was assembled from an explicitly allowed limited Elements-only exchange.',
    });
  }
  if (unassignedElementCanonicalIds.length) {
    warnings.push({
      code: 'ELEMENTS_WITHOUT_LINE',
      message: 'Some elements have no Line value and cannot receive line-level operating cases.',
      details: { canonicalIds: [...unassignedElementCanonicalIds] },
    });
  }
  const linesWithoutCases = lines.filter((row) => row.operatingCases.length === 0).map((row) => row.line);
  if (linesWithoutCases.length) {
    warnings.push({
      code: 'LINES_WITHOUT_OPERATING_CASES',
      message: 'Some lines do not have operating cases; mechanism calculations may be not assessed.',
      details: { lines: linesWithoutCases },
    });
  }
  return warnings;
}

export function assembleVibrationIntegrityDataset(input = {}, options = {}) {
  const exchange = assertVibrationTableExchangeShape(input.exchange, {
    requireCompleteExchange: options.allowLimitedExchange !== true,
  });
  const operatingCases = normalizeVibrationOperatingCases(
    input.operatingCases ?? [],
    knownLines(exchange),
  );
  const enrichment = normalizeVibrationEnrichment(input.enrichment ?? [], exchange, operatingCases);
  const lineRows = buildLines(exchange, operatingCases);
  const unassignedElementCanonicalIds = exchange.elements
    .filter((element) => !element.line)
    .map((element) => element.canonicalId)
    .sort();

  return deepFreezeVibrationDataset({
    schema: VIBRATION_INTEGRITY_DATASET_SCHEMA,
    authority: VIBRATION_INTEGRITY_DATASET_AUTHORITY,
    engineeringAuthority: 'NONE',
    screeningAuthorized: false,
    exchangeSchema: exchange.schema,
    exchangeIntegrityStatus: exchange.integrityStatus,
    exchangeAuthority: exchange.authority,
    sourceFileName: exchange.sourceFileName ?? null,
    lines: lineRows,
    unassignedElementCanonicalIds,
    operatingCases,
    enrichment,
    counts: {
      elements: exchange.elements.length,
      lines: lineRows.length,
      operatingCases: operatingCases.length,
      enrichment: enrichment.length,
    },
    warnings: datasetWarnings(exchange, lineRows, unassignedElementCanonicalIds),
  });
}
