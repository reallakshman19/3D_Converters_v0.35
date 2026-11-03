import { AIV_EIT_SCHEMA, assertAivEitV5Document } from './aiv-eit-contract.js';
import { classifyImportedAivEitLine } from './aiv-eit-import-authority.js';
import { buildAivEitImportedRecords } from './aiv-eit-import-records.js';
import { buildAivEitImportedTopology } from './aiv-eit-import-topology.js';

export const AIV_EIT_IMPORT_SCHEMA = 'AivEitImportPackage.v1';
export const AIV_EIT_IMPORT_EVIDENCE_SCHEMA = 'AivEitImportEvidence.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function importError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'AivEitImportError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function isAivLine(line) {
  return String(line?.modules ?? '').split(',').map((item) => item.trim()).includes('aiv');
}

function importedResults(document) {
  return document.lines.flatMap((line, lineIndex) => {
    if (!isAivLine(line)) return [];
    const authority = classifyImportedAivEitLine(line);
    return [Object.freeze({
      lineIndex,
      rid: line.rid ?? null,
      pnid: line.pnid ?? null,
      lineReference: line.lref ?? null,
      lineDescription: line.ldesc ?? null,
      ...authority,
    })];
  });
}

export function parseAivEitImport(text, { sourceName = 'imported.eit' } = {}) {
  let document;
  try {
    document = JSON.parse(String(text ?? ''));
  } catch (error) {
    throw importError('AIV_EIT_IMPORT_JSON_INVALID', 'EI .eit import requires valid JSON.', {
      message: String(error?.message || error),
    });
  }
  try {
    assertAivEitV5Document(document);
  } catch (error) {
    throw importError('AIV_EIT_IMPORT_CONTRACT_INVALID', String(error?.message || error));
  }

  const results = importedResults(document);
  if (!results.length) {
    throw importError('AIV_EIT_IMPORT_NO_AIV_LINES', 'EI .eit v5 file contains no lines with the aiv module enabled.');
  }

  const records = buildAivEitImportedRecords(document, sourceName);
  if (!records.tables.relationships.length) {
    throw importError(
      'AIV_EIT_IMPORT_NO_SOURCE_DETAILS',
      'EI .eit AIV lines contain no source detail records in stringified aiv_data.',
    );
  }
  const topology = buildAivEitImportedTopology(document, records.detailEvidence, sourceName);
  const originalDocument = clone(document);

  return deepFreeze({
    schema: AIV_EIT_IMPORT_SCHEMA,
    sourceSchema: AIV_EIT_SCHEMA,
    sourceName: String(sourceName),
    title: String(document.options?.title ?? sourceName),
    counts: {
      documentLines: document.lines.length,
      documentPipes: document.pipes.length,
      documentStreams: document.streams.length,
      aivLines: results.length,
      sources: records.tables.sources.length,
      assessments: records.tables.assessments.length,
      relationships: records.tables.relationships.length,
      derivedInsideDiameters: records.derivedInsideDiameterCount,
    },
    tables: records.tables,
    topology,
    importedResults: results,
    authority: {
      importedResultsAreCurrentScreeningAuthority: false,
      requiredAction: 'RUN_REGISTERED_AIV_SCREENING',
      screeningResultScopeAfterRerun: 'ASSESSMENT',
      designAuthority: false,
    },
    evidence: {
      schema: AIV_EIT_IMPORT_EVIDENCE_SCHEMA,
      sourceName: String(sourceName),
      originalDocument,
      detailEvidence: records.detailEvidence,
      preserveUnrelatedModulesOnReExport: true,
      importedResultAuthority: 'REVIEW_REQUIRED',
    },
  });
}
