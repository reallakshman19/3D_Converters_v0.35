import { createModeASourceProcessingRef } from './xml-cii-adapted-mode-a-propagation.js';

const PROCESS_FIELDS = ['p1', 'hydroPressure', 't1', 't2', 't3', 'density'];
const text = (value) => value == null ? '' : String(value).trim();
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;

function parseConfig(value) {
  try { return object(JSON.parse(String(value || '{}'))) || {}; } catch { return {}; }
}

function protectedFields(config, lineKey, row) {
  const fields = new Set(row?.__source?.processReference?.fields || []);
  const meta = config?.overrides?.__previewFillDown?.processData?.[lineKey] || {};
  for (const field of PROCESS_FIELDS) if (meta?.[field]?.fillState === 'manual') fields.add(field);
  return fields;
}

export function repairExactMappedLineServiceFallback(config = {}, lineKey = '') {
  const key = text(lineKey);
  const processData = object(config?.overrides?.processData);
  const row = object(processData?.[key]);
  const fallback = object(row?.__source?.serviceProcessFallback);
  if (!key || !processData || !row || !fallback) return { changed: false, removedFields: [] };

  const keep = protectedFields(config, key, row);
  const owned = Array.isArray(fallback.fields) && fallback.fields.length
    ? fallback.fields
    : (object(fallback.appliedValues) ? Object.keys(fallback.appliedValues) : PROCESS_FIELDS);
  const removedFields = [];
  for (const field of owned) {
    if (!PROCESS_FIELDS.includes(field) || keep.has(field) || !Object.hasOwn(row, field)) continue;
    if (fallback.appliedValues && Object.hasOwn(fallback.appliedValues, field)
      && text(row[field]).replace(/,/g, '') !== text(fallback.appliedValues[field]).replace(/,/g, '')) continue;
    delete row[field];
    removedFields.push(field);
  }
  delete row.__source.serviceProcessFallback;
  if (!Object.keys(row.__source).length) delete row.__source;
  if (!Object.keys(row).length) delete processData[key];
  return { changed: true, removedFields };
}

export function repairModeAExactMappedProcessAuthority(stateRef, rows = []) {
  const bySource = new Map();
  for (const row of rows) {
    const sourceId = text(row?.sourceId), lineKey = text(row?.lineKey);
    if (!sourceId || !lineKey || row?.lineMiss === true) continue;
    if (!bySource.has(sourceId)) bySource.set(sourceId, new Set());
    bySource.get(sourceId).add(lineKey);
  }
  let repairedLines = 0, removedFields = 0;
  for (const [sourceId, lineKeys] of bySource) {
    const sourceRef = createModeASourceProcessingRef(stateRef, sourceId);
    const current = sourceRef.current;
    const config = parseConfig(current.supportConfigJson);
    let changed = false;
    for (const lineKey of lineKeys) {
      const result = repairExactMappedLineServiceFallback(config, lineKey);
      if (!result.changed) continue;
      changed = true;
      repairedLines += 1;
      removedFields += result.removedFields.length;
    }
    if (changed) sourceRef.current = { ...current, supportConfigJson: JSON.stringify(config, null, 2) };
  }
  return { changed: repairedLines > 0, repairedLines, removedFields };
}
