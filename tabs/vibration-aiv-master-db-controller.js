import { parseVibrationTableExchangeXlsx } from '../converters/vibration/exchange/parse.js';
import { loadBundledAivMasterDatabase } from '../converters/vibration/aiv/aiv-master-db-bundled.js';
import { resolveAivTablesFromMasterDb } from '../converters/vibration/aiv/aiv-master-db-resolver.js';
import { createAivInputTable } from './vibration-aiv-input-model.js';
import { didAivMasterEngineeringInputsChange } from './vibration-aiv-master-currentness.js';

function error(code, message) {
  const value = new Error(message);
  value.name = 'AivMasterDbUiError';
  value.code = code;
  return value;
}
function currentTopology(state) {
  if (state.topology?.elements) return state.topology;
  const input = state.topologyInput;
  if (input?.format === 'PARSED_EXCHANGE' || input?.format === 'FLARE_NETWORK') return input.data;
  if (input?.format === 'XLSX') {
    return parseVibrationTableExchangeXlsx(input.data, {
      sourceFileName: input.sourceFileName === undefined ? undefined : String(input.sourceFileName),
    });
  }
  return null;
}
function tableFromResolution(table) {
  return createAivInputTable(table.kind, table.rows, {
    sourceName: table.sourceName,
    sourceKind: table.sourceKind,
    benchmarkId: table.benchmarkId,
    dirty: table.dirty,
  });
}
function formatError(value) {
  return `${value?.code ? `${value.code}: ` : ''}${String(value?.message || value)}`;
}
function tableColumnIndex(table, column) {
  return table?.header?.indexOf(column) ?? -1;
}
function rebuildTable(table, rows) {
  return createAivInputTable(table.kind, rows, {
    sourceName: table.sourceName,
    sourceKind: table.sourceKind,
    benchmarkId: table.benchmarkId,
    dirty: table.dirty,
  });
}
function filteredResolution(resolution, predicate) {
  if (!resolution) return null;
  const resolutions = resolution.resolutions.filter((item) => !predicate(item));
  return Object.freeze({ ...resolution, resolutions: Object.freeze(resolutions), resolvedFieldCount: resolutions.length });
}
function shiftedAfterDelete(resolution, tableKind, rowIndex, deletedAssessmentId) {
  if (!resolution) return null;
  const resolutions = resolution.resolutions.flatMap((item) => {
    if (item.tableKind !== tableKind) return [item];
    if (item.rowIndex === rowIndex) return [];
    return [{ ...item, rowIndex: item.rowIndex > rowIndex ? item.rowIndex - 1 : item.rowIndex }];
  });
  const unresolved = (resolution.unresolved ?? []).flatMap((item) => {
    if (item.tableKind !== tableKind) return [item];
    if (item.rowIndex === rowIndex) return [];
    return [{ ...item, rowIndex: item.rowIndex > rowIndex ? item.rowIndex - 1 : item.rowIndex }];
  });
  const discovered = (resolution.discoveredAssessmentCanonicalIds ?? []).filter((id) => id !== deletedAssessmentId);
  return Object.freeze({
    ...resolution,
    resolutions: Object.freeze(resolutions.map(Object.freeze)),
    unresolved: Object.freeze(unresolved.map(Object.freeze)),
    resolvedFieldCount: resolutions.length,
    discoveredAssessmentCanonicalIds: Object.freeze(discovered),
    discoveredAssessmentCandidateCount: discovered.length,
  });
}

export function createAivMasterDbController({ state, render, clearReadiness, onEngineeringInputsChanged = null }) {
  function clearResolution({ clearDerivedValues = false } = {}) {
    const resolution = state.masterResolution;
    if (clearDerivedValues && resolution) {
      const discovered = new Set(resolution.discoveredAssessmentCanonicalIds ?? []);
      const next = {};
      for (const [kind, table] of Object.entries(state.tables)) {
        const rows = table.rows.map((row) => [...row]);
        for (const item of resolution.resolutions) {
          if (item.tableKind !== kind) continue;
          const columnIndex = tableColumnIndex(table, item.column);
          if (rows[item.rowIndex] && columnIndex >= 0) rows[item.rowIndex][columnIndex] = '';
        }
        if (kind === 'assessments' && discovered.size) {
          const idIndex = tableColumnIndex(table, 'Assessment Canonical ID');
          next[kind] = rebuildTable(table, rows.filter((row) => !discovered.has(String(row[idIndex] ?? '').trim())));
        } else next[kind] = rebuildTable(table, rows);
      }
      state.tables = next;
    }
    state.masterResolution = null;
  }

  function resolveCurrent({ silent = false } = {}) {
    if (!state.masterDb) {
      if (silent) return false;
      throw error('AIV_MASTER_DB_NOT_LOADED', 'The bundled AIV master database is not available.');
    }
    const topology = currentTopology(state);
    if (!topology?.elements?.length) {
      if (silent) return false;
      throw error('AIV_MASTER_TOPOLOGY_REQUIRED', 'Load/import topology before applying AIV master data.');
    }
    const previous = { tables: state.tables, resolution: state.masterResolution };
    try {
      clearResolution({ clearDerivedValues: true });
      const resolution = resolveAivTablesFromMasterDb({ tables: state.tables, topology, masterDb: state.masterDb });
      state.tables = {
        sources: tableFromResolution(resolution.tables.sources),
        assessments: tableFromResolution(resolution.tables.assessments),
        relationships: tableFromResolution(resolution.tables.relationships),
      };
      state.masterResolution = resolution;
    } catch (value) {
      state.tables = previous.tables;
      state.masterResolution = previous.resolution;
      throw value;
    }
    const current = { tables: state.tables, resolution: state.masterResolution };
    if (didAivMasterEngineeringInputsChange(previous, current)) {
      onEngineeringInputsChanged?.();
      clearReadiness();
    }
    return true;
  }

  async function loadBundled() {
    state.masterLoadState = 'LOADING';
    state.masterLoadError = null;
    render();
    try {
      state.masterDb = await loadBundledAivMasterDatabase();
      state.masterLoadState = 'VERIFIED';
      state.masterLoadError = null;
      resolveCurrent({ silent: true });
    } catch (value) {
      state.masterDb = null;
      state.masterResolution = null;
      state.masterLoadState = 'ERROR';
      state.masterLoadError = formatError(value);
    }
    render();
  }

  function apply({ silent = false } = {}) {
    try {
      const applied = resolveCurrent({ silent });
      if (applied) state.error = null;
      render();
      return applied;
    } catch (value) {
      if (!silent) state.error = formatError(value);
      render();
      return false;
    }
  }

  function prepareUserEdit(tableKind, rowIndex, columnIndex) {
    const table = state.tables?.[tableKind];
    const column = table?.header?.[columnIndex];
    if (!column || !state.masterResolution) return table;
    const invalidatesRow = (tableKind === 'sources' && column === 'Source Canonical ID')
      || (tableKind === 'assessments' && ['Assessment Canonical ID', 'Assessment Type'].includes(column));
    if (!invalidatesRow) {
      state.masterResolution = filteredResolution(state.masterResolution, (item) => (
        item.tableKind === tableKind && item.rowIndex === rowIndex && item.column === column
      ));
      return table;
    }
    const rows = table.rows.map((row) => [...row]);
    for (const item of state.masterResolution.resolutions) {
      if (item.tableKind !== tableKind || item.rowIndex !== rowIndex) continue;
      const index = tableColumnIndex(table, item.column);
      if (index >= 0 && index !== columnIndex) rows[rowIndex][index] = '';
    }
    state.masterResolution = filteredResolution(state.masterResolution, (item) => (
      item.tableKind === tableKind && item.rowIndex === rowIndex
    ));
    return rebuildTable(table, rows);
  }

  function noteRowDeleted(tableKind, rowIndex) {
    const table = state.tables?.[tableKind];
    const idIndex = tableKind === 'assessments' ? tableColumnIndex(table, 'Assessment Canonical ID') : -1;
    const deletedAssessmentId = idIndex >= 0 ? String(table.rows?.[rowIndex]?.[idIndex] ?? '').trim() : '';
    state.masterResolution = shiftedAfterDelete(state.masterResolution, tableKind, rowIndex, deletedAssessmentId);
  }

  return Object.freeze({ loadBundled, apply, clearResolution, prepareUserEdit, noteRowDeleted });
}
