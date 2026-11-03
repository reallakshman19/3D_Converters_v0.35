const PROCESS_FIELDS = Object.freeze([
  { field: 'p1', label: 'P1 / Design Pressure' },
  { field: 'hydroPressure', label: 'Hydro/Test Pressure' },
  { field: 't1', label: 'T1' },
  { field: 't2', label: 'T2' },
  { field: 't3', label: 'T3' },
  { field: 'density', label: 'Density' },
]);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function numericValue(value) {
  const raw = text(value).replace(/,/g, '');
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? raw : null;
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
  return parent[key];
}

export const MODE_A_PROCESS_FROM_FIELDS = PROCESS_FIELDS;

export function modeAProcessFromFields(row = {}) {
  return PROCESS_FIELDS.map(({ field, label }) => {
    const rawValue = text(row?.[field]);
    const value = numericValue(rawValue);
    return {
      field,
      label,
      rawValue,
      value: value ?? '',
      valid: value !== null,
      reason: value !== null ? '' : (rawValue ? 'Expected a numeric value.' : 'No source value.'),
    };
  });
}

export function modeAProcessFromSourceChoices(rows = [], targetRow = {}) {
  if (targetRow?.lineMiss === true) return [];
  const targetSourceId = text(targetRow?.sourceId);
  const targetLineKey = text(targetRow?.lineKey);
  const byIdentity = new Map();
  for (const row of rows || []) {
    if (row?.lineMiss === true) continue;
    const sourceId = text(row?.sourceId);
    const lineKey = text(row?.lineKey);
    if (!sourceId || !lineKey) continue;
    if (sourceId === targetSourceId && lineKey === targetLineKey) continue;
    const identity = `${sourceId}::${lineKey}`;
    if (byIdentity.has(identity)) continue;
    byIdentity.set(identity, {
      sourceId,
      fileName: text(row?.fileName),
      lineKey,
      branchName: text(row?.branchName),
      row: { ...row },
    });
  }
  return [...byIdentity.values()].sort((a, b) => (
    a.fileName.localeCompare(b.fileName)
    || a.lineKey.localeCompare(b.lineKey, undefined, { numeric: true })
  ));
}

export function findModeAProcessFromSource(rows = [], sourceId = '', lineKey = '') {
  const wantedSourceId = text(sourceId);
  const wantedLineKey = text(lineKey);
  return (rows || []).find((row) => (
    row?.lineMiss !== true
    && text(row?.sourceId) === wantedSourceId
    && text(row?.lineKey) === wantedLineKey
  )) || null;
}

export function buildModeAProcessFromPlan(
  rows = [],
  targetRow = {},
  sourceSourceId = '',
  sourceLineKey = '',
  selectedFields = [],
) {
  const targetSourceId = text(targetRow?.sourceId);
  const targetLineKey = text(targetRow?.lineKey);
  const sourceRow = findModeAProcessFromSource(rows, sourceSourceId, sourceLineKey);
  const selected = new Set(unique(selectedFields));
  const values = {};
  const invalidFields = [];

  if (targetRow?.lineMiss === true || !targetSourceId || !targetLineKey || !sourceRow) {
    return {
      valid: false,
      reason: !sourceRow ? 'Select a valid mapped source line.' : 'The current target line must be mapped first.',
      targetSourceId,
      targetLineKey,
      sourceSourceId: text(sourceSourceId),
      sourceLineKey: text(sourceLineKey),
      selectedFields: [...selected],
      values,
      invalidFields,
      change: null,
    };
  }

  for (const item of modeAProcessFromFields(sourceRow)) {
    if (!selected.has(item.field)) continue;
    if (!item.valid) {
      invalidFields.push({ field: item.field, rawValue: item.rawValue, reason: item.reason });
      continue;
    }
    values[item.field] = item.value;
  }

  const fields = Object.keys(values);
  if (!fields.length) {
    return {
      valid: false,
      reason: invalidFields.length ? 'None of the selected source fields are valid numeric process values.' : 'Select at least one process field.',
      targetSourceId,
      targetLineKey,
      sourceSourceId: text(sourceRow.sourceId),
      sourceLineKey: text(sourceRow.lineKey),
      selectedFields: [...selected],
      values,
      invalidFields,
      change: null,
    };
  }

  return {
    valid: true,
    reason: '',
    targetSourceId,
    targetFileName: text(targetRow.fileName),
    targetLineKey,
    sourceSourceId: text(sourceRow.sourceId),
    sourceFileName: text(sourceRow.fileName),
    sourceLineKey: text(sourceRow.lineKey),
    sourceBranchName: text(sourceRow.branchName),
    selectedFields: [...selected],
    values,
    invalidFields,
    change: {
      targetSourceId,
      targetFileName: text(targetRow.fileName),
      targetLineKey,
      sourceSourceId: text(sourceRow.sourceId),
      sourceFileName: text(sourceRow.fileName),
      sourceLineKey: text(sourceRow.lineKey),
      sourceBranchName: text(sourceRow.branchName),
      fields,
      values: { ...values },
    },
  };
}

export function modeAProcessFromReferenceFromConfig(config = {}, lineKey = '') {
  const reference = config?.overrides?.processData?.[text(lineKey)]?.__source?.processReference;
  return reference && typeof reference === 'object' && !Array.isArray(reference)
    ? { ...reference, fields: unique(reference.fields) }
    : null;
}

export function clearModeAProcessFromReference(config = {}, targetLineKey = '') {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config;
  const targetKey = text(targetLineKey);
  const processData = config?.overrides?.processData;
  const row = processData?.[targetKey];
  if (!targetKey || !row || typeof row !== 'object' || Array.isArray(row)) return config;

  const reference = row?.__source?.processReference;
  const fields = unique(reference?.fields || []);
  for (const field of fields) delete row[field];
  if (row.__source && typeof row.__source === 'object') {
    delete row.__source.processReference;
    if (!Object.keys(row.__source).length) delete row.__source;
  }
  if (!Object.keys(row).length) delete processData[targetKey];
  return config;
}

export function applyModeAProcessFromReferenceToConfig(config = {}, change = {}, createdAt = new Date().toISOString()) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config;
  const targetLineKey = text(change?.targetLineKey);
  if (!targetLineKey) return config;

  clearModeAProcessFromReference(config, targetLineKey);

  const overrides = ensureObject(config, 'overrides');
  const processData = ensureObject(overrides, 'processData');
  const row = ensureObject(processData, targetLineKey);
  const appliedFields = [];
  const appliedValues = {};
  for (const field of unique(change?.fields || [])) {
    const value = numericValue(change?.values?.[field]);
    if (value === null) continue;
    row[field] = value;
    appliedFields.push(field);
    appliedValues[field] = value;
  }
  if (!appliedFields.length) return config;

  const source = ensureObject(row, '__source');
  source.processReference = {
    direction: 'from',
    sourceLineKey: text(change?.sourceLineKey),
    sourceSourceId: text(change?.sourceSourceId),
    sourceFileName: text(change?.sourceFileName),
    sourceBranchName: text(change?.sourceBranchName),
    targetLineKey,
    fields: appliedFields,
    appliedValues,
    createdAt: text(createdAt),
  };
  return config;
}
