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
  requiredAivText,
} from './aiv-tabular-common.js';

export const AIV_ASSESSMENT_CSV_SCHEMA = 'AivAssessmentCsv.v1';

export const AIV_ASSESSMENT_CSV_HEADER = Object.freeze([
  'Assessment Canonical ID',
  'Assessment Type',
  'Main Outside Diameter',
  'Main Outside Diameter Unit',
  'Main Inside Diameter',
  'Main Inside Diameter Unit',
  'Main Wall Thickness',
  'Main Wall Thickness Unit',
  'Branch Outside Diameter',
  'Branch Outside Diameter Unit',
  'Branch Wall Thickness',
  'Branch Wall Thickness Unit',
  'Material',
  'Duplex State',
  'Source',
  'Source Revision',
  'Record ID',
  'Status',
  'Reviewer',
]);

export const AIV_ASSESSMENT_TYPES = Object.freeze([
  'WELDOLET',
  'WELDED_TEE',
  'WELDED_SUPPORT',
  'OTHER_WELDED_DISCONTINUITY',
]);
export const AIV_DUPLEX_STATES = Object.freeze(['YES', 'NO', 'UNRESOLVED']);

function parseRow(row, index) {
  const rowNumber = index + 2;
  assertAivColumnCount(row, AIV_ASSESSMENT_CSV_HEADER, AIV_ASSESSMENT_CSV_SCHEMA, rowNumber);
  const result = {
    assessmentCanonicalId: requiredAivText(row[0], 'Assessment Canonical ID', rowNumber),
    assessmentType: aivEnumValue(row[1], 'Assessment Type', AIV_ASSESSMENT_TYPES, rowNumber),
    mainOutsideDiameter: aivQuantity(row, rowNumber, 2, 3, 'Main Outside Diameter'),
    mainInsideDiameter: aivQuantity(row, rowNumber, 4, 5, 'Main Inside Diameter'),
    mainWallThickness: aivQuantity(row, rowNumber, 6, 7, 'Main Wall Thickness'),
    material: requiredAivText(row[12], 'Material', rowNumber),
    duplexState: aivEnumValue(row[13], 'Duplex State', AIV_DUPLEX_STATES, rowNumber),
    source: requiredAivText(row[14], 'Source', rowNumber),
  };
  const branchOutsideDiameter = aivQuantity(row, rowNumber, 8, 9, 'Branch Outside Diameter', { optional: true });
  const branchWallThickness = aivQuantity(row, rowNumber, 10, 11, 'Branch Wall Thickness', { optional: true });
  if (branchOutsideDiameter) result.branchOutsideDiameter = branchOutsideDiameter;
  if (branchWallThickness) result.branchWallThickness = branchWallThickness;
  addOptionalAivTraceFields(result, row, [
    ['sourceRevision', 15], ['recordId', 16], ['status', 17], ['reviewer', 18],
  ]);
  return Object.freeze(result);
}

export function parseAivAssessmentCsv(csvText) {
  const rows = parseStrictVibrationCsvRows(csvText);
  assertExactVibrationCsvHeader(rows, AIV_ASSESSMENT_CSV_HEADER, AIV_ASSESSMENT_CSV_SCHEMA);
  const records = nonBlankVibrationCsvRows(rows.slice(1)).map(parseRow);
  const seen = new Set();
  for (const row of records) {
    if (seen.has(row.assessmentCanonicalId)) {
      throw vibrationTabularInputError(
        'AIV_ASSESSMENT_DUPLICATE',
        'Duplicate AIV assessment record.',
        { assessmentCanonicalId: row.assessmentCanonicalId },
      );
    }
    seen.add(row.assessmentCanonicalId);
  }
  return Object.freeze(records.sort((a, b) => a.assessmentCanonicalId.localeCompare(b.assessmentCanonicalId)));
}

export function createAivAssessmentCsvTemplate() {
  return serializeVibrationCsvRows([AIV_ASSESSMENT_CSV_HEADER]);
}
