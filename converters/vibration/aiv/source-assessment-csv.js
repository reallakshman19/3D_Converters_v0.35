import {
  assertExactVibrationCsvHeader,
  nonBlankVibrationCsvRows,
  parseStrictVibrationCsvRows,
  serializeVibrationCsvRows,
  vibrationTabularInputError,
} from '../tabular/csv.js';
import {
  addOptionalAivTraceFields,
  aivEnumValue,
  aivQuantity,
  assertAivColumnCount,
  optionalAivText,
  requiredAivText,
} from './aiv-tabular-common.js';

export const AIV_SOURCE_ASSESSMENT_CSV_SCHEMA = 'AivSourceAssessmentCsv.v1';

export const AIV_SOURCE_ASSESSMENT_CSV_HEADER = Object.freeze([
  'Source Canonical ID',
  'Assessment Canonical ID',
  'Operating Case',
  'Physical Distance',
  'Physical Distance Unit',
  'Distance Source',
  'Distance Source Revision',
  'Simultaneous Source Group',
  'Applicability Disposition',
  'Source',
  'Source Revision',
  'Record ID',
  'Status',
  'Reviewer',
]);

export const AIV_APPLICABILITY_DISPOSITIONS = Object.freeze([
  'APPLICABLE',
  'NOT_APPLICABLE',
  'UNRESOLVED',
]);

function parseRow(row, index) {
  const rowNumber = index + 2;
  assertAivColumnCount(row, AIV_SOURCE_ASSESSMENT_CSV_HEADER, AIV_SOURCE_ASSESSMENT_CSV_SCHEMA, rowNumber);
  const result = {
    sourceCanonicalId: requiredAivText(row[0], 'Source Canonical ID', rowNumber),
    assessmentCanonicalId: requiredAivText(row[1], 'Assessment Canonical ID', rowNumber),
    caseId: requiredAivText(row[2], 'Operating Case', rowNumber),
    applicabilityDisposition: aivEnumValue(
      row[8],
      'Applicability Disposition',
      AIV_APPLICABILITY_DISPOSITIONS,
      rowNumber,
    ),
    source: requiredAivText(row[9], 'Source', rowNumber),
  };
  const physicalDistance = aivQuantity(row, rowNumber, 3, 4, 'Physical Distance', { optional: true });
  if (physicalDistance) result.physicalDistance = physicalDistance;
  const distanceSource = optionalAivText(row[5]);
  const distanceSourceRevision = optionalAivText(row[6]);
  const simultaneousSourceGroup = optionalAivText(row[7]);
  if (distanceSource) result.distanceSource = distanceSource;
  if (distanceSourceRevision) result.distanceSourceRevision = distanceSourceRevision;
  if (simultaneousSourceGroup) result.simultaneousSourceGroup = simultaneousSourceGroup;
  addOptionalAivTraceFields(result, row, [
    ['sourceRevision', 10], ['recordId', 11], ['status', 12], ['reviewer', 13],
  ]);
  return Object.freeze(result);
}

export function parseAivSourceAssessmentCsv(csvText) {
  const rows = parseStrictVibrationCsvRows(csvText);
  assertExactVibrationCsvHeader(rows, AIV_SOURCE_ASSESSMENT_CSV_HEADER, AIV_SOURCE_ASSESSMENT_CSV_SCHEMA);
  const records = nonBlankVibrationCsvRows(rows.slice(1)).map(parseRow);
  const seen = new Set();
  for (const row of records) {
    const key = `${row.sourceCanonicalId}\u0000${row.assessmentCanonicalId}\u0000${row.caseId}`;
    if (seen.has(key)) {
      throw vibrationTabularInputError(
        'AIV_SOURCE_ASSESSMENT_DUPLICATE',
        'Duplicate AIV source/assessment/operating-case relationship.',
        {
          sourceCanonicalId: row.sourceCanonicalId,
          assessmentCanonicalId: row.assessmentCanonicalId,
          caseId: row.caseId,
        },
      );
    }
    seen.add(key);
  }
  return Object.freeze(records.sort((a, b) => a.sourceCanonicalId.localeCompare(b.sourceCanonicalId)
    || a.assessmentCanonicalId.localeCompare(b.assessmentCanonicalId)
    || a.caseId.localeCompare(b.caseId)));
}

export function createAivSourceAssessmentCsvTemplate() {
  return serializeVibrationCsvRows([AIV_SOURCE_ASSESSMENT_CSV_HEADER]);
}
