import { prepareXmlCiiMasterContext } from '../../converters/xml-cii2019-core/master-context.js';

const PREVIEW_LIMIT = 150;

// diagType is the exact diagnostic `type` string pushed by converters/xml-cii2019-core/master-context.js
// for this master kind. It does not follow one uniform naming convention across kinds (weight and
// piping-class use "{kind}-master-source", material map uses "{kind}-source", line list pushes none),
// so it must be looked up explicitly rather than derived from a shared suffix pattern.
export const STANDALONE_IMPORT_MASTER_DEFS = Object.freeze([
  Object.freeze({ key: 'lineList', label: 'Line List', rowsKey: 'lineRows', configKey: 'linelist', rowConfigKey: 'masterRows', diagPrefix: 'linelist', diagType: 'linelist-master-source' }),
  Object.freeze({ key: 'pipingClass', label: 'Piping Class', rowsKey: 'pipingClassRows', configKey: 'pipingClass', rowConfigKey: 'masterRows', diagPrefix: 'piping-class', diagType: 'piping-class-master-source' }),
  Object.freeze({ key: 'materialMap', label: 'Material Map', rowsKey: 'materialMapRows', configKey: 'material', rowConfigKey: 'mapRows', diagPrefix: 'material-map', diagType: 'material-map-source' }),
  Object.freeze({ key: 'weight', label: 'Weights / Valve CA8', rowsKey: 'weightMasterRows', configKey: 'weight', rowConfigKey: 'masterRows', diagPrefix: 'weight', diagType: 'weight-master-source' }),
]);

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function cloneRows(rows) {
  return asRows(rows).map((row) => (safeObject(row) === row ? { ...row } : row));
}

function sanitizeRow(row) {
  if (!row || typeof row !== 'object') return { value: String(row ?? '') };
  return Object.fromEntries(Object.entries(row).slice(0, 8));
}

function previewRows(rows, limit = PREVIEW_LIMIT) {
  return cloneRows(rows).slice(0, limit).map(sanitizeRow);
}

function findDiagnostic(diagnostics, diagType) {
  return diagnostics.find((item) => item?.type === diagType) || null;
}

function fallbackSource(config, def) {
  const section = safeObject(config?.[def.configKey]);
  return compactText(section.masterUrl || section.sourcePath || section.source || '', 'inline-config');
}

function sourceKindFrom(source, rows) {
  if (source === 'inline-config') return rows.length ? 'inline' : 'empty';
  if (source === 'fetch-unavailable') return 'autoload-unavailable';
  if (source === 'app-default') return rows.length ? 'app-default' : 'empty';
  if (/^https?:\/\//i.test(source) || source.includes('/')) return 'autoload';
  return rows.length ? 'manual' : 'empty';
}

function metadataFor(def, config, diagnostics, rows) {
  const diagnostic = findDiagnostic(diagnostics, def.diagType);
  const source = compactText(diagnostic?.source, fallbackSource(config, def));
  return {
    key: def.key,
    label: def.label,
    source,
    sourceType: sourceKindFrom(source, rows),
    status: rows.length ? 'loaded' : 'empty',
    rowCount: rows.length,
    diagnosticType: diagnostic?.type || '',
  };
}

function diagnosticsFor(def, diagnostics) {
  return diagnostics.filter((item) => String(item?.type || '').startsWith(def.diagPrefix));
}

function rowCountsFrom(context) {
  return Object.fromEntries(STANDALONE_IMPORT_MASTER_DEFS.map((def) => [def.key, asRows(context[def.rowsKey]).length]));
}

function previewRowsFrom(context, limit) {
  return Object.fromEntries(STANDALONE_IMPORT_MASTER_DEFS.map((def) => [def.key, previewRows(context[def.rowsKey], limit)]));
}

function metadataFrom(context, config) {
  return Object.fromEntries(STANDALONE_IMPORT_MASTER_DEFS.map((def) => {
    const rows = asRows(context[def.rowsKey]);
    return [def.key, metadataFor(def, config, context.diagnostics, rows)];
  }));
}

function diagnosticsFrom(context) {
  return Object.fromEntries(STANDALONE_IMPORT_MASTER_DEFS.map((def) => [def.key, diagnosticsFor(def, context.diagnostics)]));
}

function writeRows(config, context) {
  const next = { ...safeObject(config) };
  for (const def of STANDALONE_IMPORT_MASTER_DEFS) {
    const section = { ...safeObject(next[def.configKey]) };
    section[def.rowConfigKey] = cloneRows(context[def.rowsKey]);
    next[def.configKey] = section;
  }
  return next;
}

export function serializeStandaloneImportMastersConfig(masterContext) {
  const nextConfig = writeRows(masterContext?.config, masterContext || {});
  return JSON.stringify(nextConfig, null, 2);
}

export async function prepareStandaloneImportMasters(input = {}) {
  const diagnostics = [];
  const rawConfig = input.supportConfigJson ?? input.rawConfig ?? '{}';
  const coreContext = await prepareXmlCiiMasterContext({ rawConfig, diagnostics });
  const context = {
    lineRows: asRows(coreContext.lineRows),
    pipingClassRows: asRows(coreContext.pipingClassRows),
    pipingClassIndex: coreContext.pipingClassIndex,
    materialMapRows: asRows(coreContext.materialMapRows),
    weightMasterRows: asRows(coreContext.weightMasterRows),
    diagnostics: asRows(coreContext.diagnostics),
    config: coreContext.config,
  };
  context.rowCounts = rowCountsFrom(context);
  context.previewRows = previewRowsFrom(context, input.previewLimit || PREVIEW_LIMIT);
  context.sourceMetadata = metadataFrom(context, context.config);
  context.diagnosticsByMaster = diagnosticsFrom(context);
  context.supportConfigJson = serializeStandaloneImportMastersConfig(context);
  return context;
}

export function summarizeStandaloneImportMasters(masterContext) {
  const safe = safeObject(masterContext);
  return STANDALONE_IMPORT_MASTER_DEFS.map((def) => {
    const rowsKey = { lineList: 'lineRows', pipingClass: 'pipingClassRows', materialMap: 'materialMapRows', weight: 'weightMasterRows' }[def.key];
    return {
      ...def,
      rowCount: Number(safe.rowCounts?.[def.key] || 0),
      previewRows: asRows(safe.previewRows?.[def.key]),
      diagnostics: asRows(safe.diagnosticsByMaster?.[def.key]),
      sourceMetadata: safeObject(safe.sourceMetadata?.[def.key]),
      rows: asRows(safe[rowsKey])
    };
  });
}
