import { createAivInputTable } from './vibration-aiv-input-model.js';

function importedTable(kind, rows, fileName) {
  return createAivInputTable(kind, rows, {
    sourceName: fileName,
    sourceKind: 'EI_EIT_V5_IMPORT',
    dirty: false,
  });
}

export async function importAivEitFileIntoState(state, file, clearReadiness) {
  const text = await file.text();
  const { parseAivEitImport } = await import('../converters/vibration/aiv/aiv-eit-import.js?v=aiv-eit-import-1');
  const imported = parseAivEitImport(text, { sourceName: file.name });

  state.eitImport = imported;
  state.tables = {
    sources: importedTable('sources', imported.tables.sources, file.name),
    assessments: importedTable('assessments', imported.tables.assessments, file.name),
    relationships: importedTable('relationships', imported.tables.relationships, file.name),
  };
  state.files.eit = { name: file.name, kind: 'EnergyInstituteEit.v5' };
  state.files.topology = { name: file.name, kind: 'EIT compatibility connectivity projection' };
  state.files.sources = { name: file.name, kind: 'EIT imported Sources working table' };
  state.files.assessments = { name: file.name, kind: 'EIT imported Assessments working table' };
  state.files.relationships = { name: file.name, kind: 'EIT imported Source→Assessment working table' };
  state.topology = imported.topology;
  state.topologyInput = {
    format: 'FLARE_NETWORK',
    data: imported.topology,
    sourceFileName: file.name,
  };
  state.flareNetworkActive = false;
  state.generatedInputSet = null;
  state.benchmark.loaded = null;
  clearReadiness();
  state.error = null;
  return imported;
}
