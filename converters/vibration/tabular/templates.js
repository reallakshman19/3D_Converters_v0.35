import { serializeVibrationCsvRows } from './csv.js';
import { VIBRATION_ENRICHMENT_CSV_HEADER } from './enrichment.js';
import { VIBRATION_OPERATING_CASE_CSV_HEADER } from './operating-cases.js';

export function createVibrationOperatingCaseCsvTemplate(options = {}) {
  const rows = [[...VIBRATION_OPERATING_CASE_CSV_HEADER]];
  if (options.includeExample === true) {
    rows.push([
      'SAMPLE_LINE_DO_NOT_USE',
      'SAMPLE_CASE_DO_NOT_USE',
      'Example only - replace or delete',
      'GAS',
      20000,
      'kg/h',
      8.1,
      'kg/m3',
      '',
      '',
      '',
      '',
      '',
      0.019,
      'cP',
      '',
      '',
      'SAMPLE_ONLY_NOT_PROJECT_DATA',
      '',
      'SAMPLE_RECORD',
    ]);
  }
  return serializeVibrationCsvRows(rows);
}

export function createVibrationEnrichmentCsvTemplate(options = {}) {
  const rows = [[...VIBRATION_ENRICHMENT_CSV_HEADER]];
  if (options.includeExample === true) {
    rows.push([
      'SAMPLE_CANONICAL_ID_DO_NOT_USE',
      'SAMPLE_LINE_DO_NOT_USE',
      '',
      'FIT_ASSESSMENT_POINT',
      true,
      'BOOLEAN',
      '',
      'SAMPLE_ONLY_NOT_PROJECT_DATA',
      '',
      'SAMPLE_RECORD',
      'EXAMPLE_ONLY',
      '',
    ]);
  }
  return serializeVibrationCsvRows(rows);
}
