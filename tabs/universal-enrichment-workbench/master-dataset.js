import { sha256Hex } from './source-envelope.js';
import { parseDelimitedMasterText, parseJsonMasterRows } from './master-parser.js';
import { canonicalMasterTable, normalizeMasterTable, rowContentKey } from './master-normalize.js';
import { createMasterColumnId, createMasterDatasetId, createMasterRowId } from './master-identity.js';

export const MASTER_SOURCE_KINDS = Object.freeze(['csv', 'tsv', 'json']);
export const MASTER_DATASET_ROLES = Object.freeze(['line-list', 'piping-class', 'material-map', 'weight-master', 'custom']);

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((item) => deepFreeze(item, seen));
  return Object.freeze(value);
}

function parseMasterText(sourceText, sourceKind) {
  if (sourceKind === 'csv') return parseDelimitedMasterText(sourceText, ',');
  if (sourceKind === 'tsv') return parseDelimitedMasterText(sourceText, '\t');
  if (sourceKind === 'json') return parseJsonMasterRows(sourceText);
  return { headers: [], rows: [], errors: ['Unsupported master source kind.'], warnings: [] };
}

function duplicateCount(rows) {
  const seen = new Set();
  let count = 0;
  rows.forEach((row) => {
    const key = rowContentKey(row);
    if (seen.has(key)) count += 1; else seen.add(key);
  });
  return count;
}

function createSummary(table) {
  let emptyCellCount = 0;
  table.rows.forEach((row) => row.forEach((value) => { if (value === '' || value === null) emptyCellCount += 1; }));
  return {
    rowCount: table.rows.length,
    columnCount: table.headers.length,
    emptyCellCount,
    duplicateRowCount: duplicateCount(table.rows),
  };
}

async function createColumns(table, sourceKind, datasetRole, hashText) {
  return Promise.all(table.headers.map(async (name, sourceOrder) => ({
    columnId: await createMasterColumnId(table, sourceKind, datasetRole, name, sourceOrder, hashText),
    name,
    sourceOrder,
    inferredValueType: table.inferredValueTypes[sourceOrder],
  })));
}

async function createRows(table, columns, sourceKind, datasetRole, hashText) {
  return Promise.all(table.rows.map(async (row, sourceOrder) => ({
    rowId: await createMasterRowId(table, sourceKind, datasetRole, row, sourceOrder, hashText),
    sourceOrder,
    values: Object.fromEntries(columns.map((column, index) => [column.columnId, row[index]])),
  })));
}

function duplicateValues(values) {
  const seen = new Set();
  return values.filter((value) => seen.has(value) || !seen.add(value));
}

function orderErrors(items, label) {
  const orders = items.map((item) => item.sourceOrder);
  const errors = [];
  if (orders.some((order) => !Number.isInteger(order) || order < 0)) errors.push(`${label} sourceOrder values must be non-negative integers.`);
  if (duplicateValues(orders).length) errors.push(`${label} sourceOrder values must be unique.`);
  if (orders.some((order, index) => order !== index)) errors.push(`${label} sourceOrder values must be contiguous and deterministic.`);
  return errors;
}

function jsonSafetyError(value) {
  const seen = new Set();
  function visit(item) {
    if (item === null || ['string', 'boolean'].includes(typeof item)) return '';
    if (typeof item === 'number') return Number.isFinite(item) ? '' : 'Non-finite numbers are not JSON-safe.';
    if (typeof item !== 'object') return `Unsupported JSON value type: ${typeof item}.`;
    if (seen.has(item)) return 'Cyclic values are not JSON-safe.';
    seen.add(item);
    for (const child of Object.values(item)) { const error = visit(child); if (error) return error; }
    seen.delete(item);
    return '';
  }
  return visit(value);
}

function structuralErrors(dataset) {
  const errors = [];
  if (dataset?.schema !== 'MasterDataset.v1') errors.push('Dataset schema must be MasterDataset.v1.');
  if (!MASTER_DATASET_ROLES.includes(dataset?.datasetRole)) errors.push('Dataset role is invalid.');
  if (!MASTER_SOURCE_KINDS.includes(dataset?.sourceKind)) errors.push('Dataset source kind is invalid.');
  if (!Array.isArray(dataset?.columns)) errors.push('Dataset columns must be an array.');
  if (!Array.isArray(dataset?.rows)) errors.push('Dataset rows must be an array.');
  if (!Array.isArray(dataset?.columns) || !dataset.columns.length) errors.push('Dataset must contain at least one column.');
  if (!Array.isArray(dataset?.rows) || !dataset.rows.length) errors.push('Dataset must contain at least one row.');
  return errors;
}

function columnErrors(columns = []) {
  const errors = [];
  const names = columns.map((column) => column.name);
  if (names.some((name) => !String(name || '').trim())) errors.push('Dataset contains an empty column name.');
  if (duplicateValues(names).length) errors.push('Dataset contains duplicate column names.');
  if (duplicateValues(columns.map((column) => column.columnId)).length) errors.push('Dataset contains duplicate column IDs.');
  return [...errors, ...orderErrors(columns, 'Column')];
}

function rowErrors(rows = [], columns = []) {
  const errors = [];
  const columnIds = new Set(columns.map((column) => column.columnId));
  if (duplicateValues(rows.map((row) => row.rowId)).length) errors.push('Dataset contains duplicate row IDs.');
  rows.forEach((row, index) => {
    const keys = Object.keys(row.values || {});
    if (keys.some((key) => !columnIds.has(key))) errors.push(`Row ${index + 1} references an unknown column.`);
    if (columns.some((column) => !Object.hasOwn(row.values || {}, column.columnId))) errors.push(`Row ${index + 1} is missing normalized column values.`);
  });
  return [...errors, ...orderErrors(rows, 'Row')];
}

function tableFromDataset(dataset) {
  const columns = [...(Array.isArray(dataset.columns) ? dataset.columns : [])].sort((a, b) => a.sourceOrder - b.sourceOrder);
  const rows = [...(Array.isArray(dataset.rows) ? dataset.rows : [])].sort((a, b) => a.sourceOrder - b.sourceOrder);
  return {
    headers: columns.map((column) => column.name),
    rows: rows.map((row) => columns.map((column) => row.values?.[column.columnId] ?? null)),
    inferredValueTypes: columns.map((column) => column.inferredValueType),
  };
}

function summaryErrors(dataset, table) {
  const actual = createSummary(table);
  const summary = dataset?.summary || {};
  const errors = [];
  for (const key of Object.keys(actual)) {
    if (summary[key] !== actual[key]) errors.push(`Dataset summary ${key} does not match normalized content.`);
  }
  return { errors, duplicateRowCount: actual.duplicateRowCount };
}

async function identityErrors(dataset, hashText) {
  if (!dataset?.columns?.length) return [];
  const table = tableFromDataset(dataset);
  const expectedHash = await hashText(canonicalMasterTable(table));
  const expectedId = await createMasterDatasetId(table, dataset.sourceKind, dataset.datasetRole, hashText);
  const errors = [];
  if (dataset.contentHash !== expectedHash) errors.push('Dataset contentHash does not match normalized content.');
  if (dataset.datasetId !== expectedId) errors.push('Dataset ID does not match normalized content, source kind and role.');
  const columns = await createColumns(table, dataset.sourceKind, dataset.datasetRole, hashText);
  const rows = await createRows(table, columns, dataset.sourceKind, dataset.datasetRole, hashText);
  if (columns.some((column, index) => column.columnId !== dataset.columns[index]?.columnId)) errors.push('Dataset column IDs do not match content evidence.');
  if (rows.some((row, index) => row.rowId !== dataset.rows[index]?.rowId)) errors.push('Dataset row IDs do not match content evidence.');
  return errors;
}

export async function validateMasterDataset(dataset, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const table = tableFromDataset({ columns, rows });
  const summary = summaryErrors(dataset, table);
  const errors = [...structuralErrors(dataset), ...columnErrors(columns), ...rowErrors(rows, columns), ...summary.errors];
  const safetyError = jsonSafetyError(dataset);
  if (safetyError) errors.push(safetyError);
  if (!errors.length) errors.push(...await identityErrors(dataset, hashText));
  const warnings = summary.duplicateRowCount ? [`Dataset contains ${summary.duplicateRowCount} duplicate row occurrence(s).`] : [];
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings };
}

export async function createMasterDataset(input, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const parsed = parseMasterText(input.sourceText, input.sourceKind);
  const table = normalizeMasterTable(parsed);
  const contentHash = await hashText(canonicalMasterTable(table));
  const datasetId = await createMasterDatasetId(table, input.sourceKind, input.datasetRole, hashText);
  const columns = await createColumns(table, input.sourceKind, input.datasetRole, hashText);
  const rows = await createRows(table, columns, input.sourceKind, input.datasetRole, hashText);
  const dataset = {
    schema: 'MasterDataset.v1', datasetId, datasetRole: input.datasetRole,
    sourceKind: input.sourceKind, sourceName: String(input.sourceName || 'untitled-master'),
    contentHash, columns, rows, summary: createSummary(table),
    validation: { ok: false, errors: [...table.errors], warnings: [...table.warnings] },
  };
  const validation = table.errors.length ? dataset.validation : await validateMasterDataset(dataset, dependencies);
  return deepFreeze({ ...dataset, validation });
}

export function serializeMasterDataset(dataset) {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

export function summarizeMasterDataset(dataset) {
  if (!dataset) return null;
  return {
    datasetId: dataset.datasetId, datasetRole: dataset.datasetRole, sourceKind: dataset.sourceKind,
    sourceName: dataset.sourceName, contentHash: dataset.contentHash,
    rowCount: dataset.summary.rowCount, columnCount: dataset.summary.columnCount,
    emptyCellCount: dataset.summary.emptyCellCount, duplicateRowCount: dataset.summary.duplicateRowCount,
    validation: dataset.validation,
  };
}
