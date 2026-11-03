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

function unique(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
  return parent[key];
}

export const MODE_A_PROCESS_REFERENCE_FIELDS = PROCESS_FIELDS;

export function modeAProcessReferenceFields(row = {}) {
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

export function modeAProcessReferenceTargetGroups(rows = [], sourceRow = {}) {
  if (sourceRow?.lineMiss === true) return [];
  const sourceLineKey = text(sourceRow.lineKey);
  const groups = new Map();
  for (const row of rows || []) {
    const lineKey = text(row?.lineKey);
    const sourceId = text(row?.sourceId);
    if (!lineKey || !sourceId || lineKey === sourceLineKey || row?.lineMiss === true) continue;
    if (!groups.has(lineKey)) groups.set(lineKey, new Map());
    const bySource = groups.get(lineKey);
    if (!bySource.has(sourceId)) {
      bySource.set(sourceId, {
        sourceId,
        fileName: text(row.fileName),
        lineKey,
        branchCount: 0,
      });
    }
    bySource.get(sourceId).branchCount += 1;
  }
  return [...groups.entries()]
    .map(([lineKey, bySource]) => ({
      lineKey,
      sources: [...bySource.values()].sort((a, b) => a.fileName.localeCompare(b.fileName) || a.sourceId.localeCompare(b.sourceId)),
      branchCount: [...bySource.values()].reduce((sum, item) => sum + item.branchCount, 0),
    }))
    .sort((a, b) => a.lineKey.localeCompare(b.lineKey));
}

export function buildModeAProcessReferencePlan(
  rows = [],
  sourceRow = {},
  targetLineKey = '',
  targetSourceIds = [],
  selectedFields = [],
) {
  const sourceLineKey = text(sourceRow.lineKey);
  const targetKey = text(targetLineKey);
  const selected = new Set(unique(selectedFields));
  const fieldRows = modeAProcessReferenceFields(sourceRow);
  const values = {};
  const invalidFields = [];
  for (const item of fieldRows) {
    if (!selected.has(item.field)) continue;
    if (!item.valid) {
      invalidFields.push({ field: item.field, rawValue: item.rawValue, reason: item.reason });
      continue;
    }
    values[item.field] = item.value;
  }

  const wantedSources = new Set(unique(targetSourceIds));
  const targetRows = sourceRow?.lineMiss !== true && wantedSources.size && targetKey && targetKey !== sourceLineKey
    ? (rows || []).filter((row) => (
      text(row?.lineKey) === targetKey
      && row?.lineMiss !== true
      && wantedSources.has(text(row?.sourceId))
    ))
    : [];
  const targetSources = new Map();
  for (const row of targetRows) {
    const sourceId = text(row.sourceId);
    if (!targetSources.has(sourceId)) {
      targetSources.set(sourceId, {
        sourceId,
        fileName: text(row.fileName),
        branchCount: 0,
      });
    }
    targetSources.get(sourceId).branchCount += 1;
  }

  const changes = [...targetSources.values()].map((target) => ({
    ...target,
    targetLineKey: targetKey,
    sourceLineKey,
    sourceSourceId: text(sourceRow.sourceId),
    sourceFileName: text(sourceRow.fileName),
    sourceBranchName: text(sourceRow.branchName),
    fields: Object.keys(values),
    values: { ...values },
  }));

  return {
    sourceLineKey,
    targetLineKey: targetKey,
    selectedFields: [...selected],
    values,
    invalidFields,
    changes,
    affectedSourceCount: changes.length,
    affectedBranchCount: changes.reduce((sum, change) => sum + change.branchCount, 0),
  };
}

export function applyModeAProcessReferenceToConfig(config = {}, change = {}, createdAt = new Date().toISOString()) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config;
  const targetLineKey = text(change.targetLineKey);
  if (!targetLineKey) return config;
  const fields = unique(change.fields);
  const overrides = ensureObject(config, 'overrides');
  const processData = ensureObject(overrides, 'processData');
  const row = ensureObject(processData, targetLineKey);
  const appliedFields = [];
  for (const field of fields) {
    const value = numericValue(change?.values?.[field]);
    if (value === null) continue;
    row[field] = value;
    appliedFields.push(field);
  }
  if (!appliedFields.length) return config;
  const source = ensureObject(row, '__source');
  source.processReference = {
    sourceLineKey: text(change.sourceLineKey),
    sourceSourceId: text(change.sourceSourceId),
    sourceFileName: text(change.sourceFileName),
    sourceBranchName: text(change.sourceBranchName),
    targetLineKey,
    fields: appliedFields,
    createdAt: text(createdAt),
  };
  return config;
}

export function modeAProcessReferenceFromConfig(config = {}, lineKey = '') {
  const reference = config?.overrides?.processData?.[text(lineKey)]?.__source?.processReference;
  return reference && typeof reference === 'object' && !Array.isArray(reference)
    ? { ...reference, fields: unique(reference.fields) }
    : null;
}
