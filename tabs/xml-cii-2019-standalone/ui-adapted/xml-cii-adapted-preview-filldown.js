// Group-wise fill-down helpers for XML->CII Preview.
//
// Behaviour intentionally differs from plain Excel Ctrl+D:
// - Fill starts at the clicked/source row.
// - Manual/original values below the source act as boundaries and become the new source.
// - Blank cells and previous auto-filled cells are overwritten.
// - A user edit to an auto-filled cell promotes that cell to a manual boundary.
//
// Metadata is stored under overrides.__previewFillDown so old configs remain valid.
// Existing overrides with no metadata are treated as manual to avoid destructive overwrites.

const FILL_META_KEY = '__previewFillDown';
const OVERRIDE_CATEGORIES = ['pipingClass', 'material', 'materialCode', 'rating', 'wallThickness', 'corrosion'];
const RUNTIME_OVERRIDE_STORAGE_KEY = 'xmlCii2019.preview.runtimeOverrides.v1';

function text(value) {
  return String(value ?? '').trim();
}

let runtimeOverridesCache = null;

function runtimeRoot() {
  if (!runtimeOverridesCache) {
    runtimeOverridesCache = readRuntimeOverrideStore();
  }
  return runtimeOverridesCache;
}

function readRuntimeOverrideStore() {
  if (typeof localStorage === 'undefined') return { overrides: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(RUNTIME_OVERRIDE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { overrides: {} };
  } catch {
    return { overrides: {} };
  }
}

function writeRuntimeOverrideStore(store) {
  if (typeof localStorage === 'undefined' || !store || typeof store !== 'object') return;
  try {
    localStorage.setItem(RUNTIME_OVERRIDE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage can be blocked
  }
}

function ensureRuntimeOverrides(store) {
  if (!store.overrides || typeof store.overrides !== 'object' || Array.isArray(store.overrides)) store.overrides = {};
  return store.overrides;
}

function setRuntimeBucketValue(bucketName, key, value) {
  const cleanKey = text(key);
  if (!cleanKey) return;
  const store = runtimeRoot();
  if (!store) return;
  const overrides = ensureRuntimeOverrides(store);
  if (!overrides[bucketName] || typeof overrides[bucketName] !== 'object' || Array.isArray(overrides[bucketName])) overrides[bucketName] = {};
  const cleanValue = text(value);
  if (cleanValue) overrides[bucketName][cleanKey] = cleanValue;
  else delete overrides[bucketName][cleanKey];
  store.updatedAt = new Date().toISOString();
  writeRuntimeOverrideStore(store);
}

function setRuntimeProcessValue(lineKey, field, value) {
  const cleanLineKey = text(lineKey);
  const cleanField = text(field);
  if (!cleanLineKey || !cleanField) return;
  const store = runtimeRoot();
  if (!store) return;
  const overrides = ensureRuntimeOverrides(store);
  if (!overrides.processData || typeof overrides.processData !== 'object' || Array.isArray(overrides.processData)) overrides.processData = {};
  if (!overrides.processData[cleanLineKey] || typeof overrides.processData[cleanLineKey] !== 'object' || Array.isArray(overrides.processData[cleanLineKey])) overrides.processData[cleanLineKey] = {};
  const cleanValue = text(value);
  if (cleanValue) overrides.processData[cleanLineKey][cleanField] = cleanValue;
  else delete overrides.processData[cleanLineKey][cleanField];
  if (Object.keys(overrides.processData[cleanLineKey]).length === 0) delete overrides.processData[cleanLineKey];
  store.updatedAt = new Date().toISOString();
  writeRuntimeOverrideStore(store);
}

export function getXmlCiiAdaptedPreviewRuntimeConfig() {
  const store = runtimeRoot() || readRuntimeOverrideStore();
  return store && typeof store === 'object' && !Array.isArray(store) ? store : { overrides: {} };
}

export function clearXmlCiiAdaptedRuntimeBuckets(...bucketNames) {
  const store = runtimeRoot() || readRuntimeOverrideStore();
  if (!store) return;
  const overrides = ensureRuntimeOverrides(store);
  for (const name of bucketNames) {
    delete overrides[name];
  }
  writeRuntimeOverrideStore(store);
}

function ensureFillMeta(overrides) {
  if (!overrides[FILL_META_KEY] || typeof overrides[FILL_META_KEY] !== 'object') {
    overrides[FILL_META_KEY] = { processData: {} };
  }
  if (!overrides[FILL_META_KEY].processData || typeof overrides[FILL_META_KEY].processData !== 'object') {
    overrides[FILL_META_KEY].processData = {};
  }
  for (const category of OVERRIDE_CATEGORIES) {
    if (!overrides[FILL_META_KEY][category] || typeof overrides[FILL_META_KEY][category] !== 'object') {
      overrides[FILL_META_KEY][category] = {};
    }
  }
  return overrides[FILL_META_KEY];
}

function overrideCategoryForField(field) {
  if (field === 'materialCode') return 'materialCode';
  if (field === 'wallThickness') return 'wallThickness';
  if (field === 'corrosion') return 'corrosion';
  if (field === 'rating') return 'rating';
  if (field === 'material') return 'material';
  return 'pipingClass';
}

function keyForOverrideCell(field, cell) {
  return text(cell.getAttribute('data-mc-edit-key'));
}

function valueFromOverrideCell(cell) {
  const valSpan = cell.querySelector('.mc-preview-editable-val');
  const txt = text(valSpan?.textContent);
  return txt === '—' ? '' : txt;
}

function hasOwn(obj, key) {
  return obj && Object.hasOwn(obj, key);
}

function setOverrideState(meta, category, key, state, source) {
  if (!meta[category]) meta[category] = {};
  meta[category][key] = { fillState: state, fillSource: source || null };
}

function setProcessState(meta, field, lineKey, state, source) {
  if (!meta.processData[lineKey]) meta.processData[lineKey] = {};
  meta.processData[lineKey][field] = { fillState: state, fillSource: source || null };
}

function processFieldMeta(meta, field) {
  const out = {};
  for (const lineKey of Object.keys(meta.processData || {})) {
    if (meta.processData[lineKey]?.[field]) {
      out[lineKey] = meta.processData[lineKey][field];
    }
  }
  return out;
}

function sortedByPreviewRow(elements = [], rowAttr = 'data-mc-row') {
  return [...elements].sort((a, b) => {
    return Number(a.getAttribute(rowAttr) || 0) - Number(b.getAttribute(rowAttr) || 0);
  });
}

function inferOverrideFillState({ metaBucket, overridesBucket, key, visibleValue }) {
  const state = metaBucket?.[key]?.fillState;
  if (state === 'manual' || state === 'auto' || state === 'blank') return state;
  if (hasOwn(overridesBucket, key) && text(visibleValue)) return 'manual';
  return text(visibleValue) ? 'manual' : 'blank';
}

function inferProcessFillState({ metaBucket, overrides, lineKey, field, cell, value }) {
  const state = metaBucket?.[lineKey]?.fillState;
  if (state === 'manual' || state === 'auto' || state === 'blank') return state;
  if (hasOwn(overrides.processData?.[lineKey], field)) return 'manual';
  if (cell?.classList?.contains('mc-preview-pd-linelist') && text(value)) return 'manual';
  return text(value) ? 'manual' : 'blank';
}

export function markAdaptedPreviewOverrideManual({ config, ensureOverrides, field, key, value }) {
  const overrides = ensureOverrides(config);
  const meta = ensureFillMeta(overrides);
  const category = overrideCategoryForField(field);
  const cleanValue = text(value);
  if (!overrides[category] || typeof overrides[category] !== 'object') overrides[category] = {};
  if (cleanValue) setOverrideState(meta, category, key, 'manual', null);
  else setOverrideState(meta, category, key, 'blank', null);
  setRuntimeBucketValue(category, key, cleanValue);
  if (category === 'rating') setRuntimeProcessValue(key, 'rating', cleanValue);
}

export function markAdaptedPreviewProcessManual({ config, ensureOverrides, field, lineKey, value }) {
  const overrides = ensureOverrides(config);
  const meta = ensureFillMeta(overrides);
  const cleanValue = text(value);
  if (cleanValue) setProcessState(meta, field, lineKey, 'manual', null);
  else setProcessState(meta, field, lineKey, 'blank', null);
  setRuntimeProcessValue(lineKey, field, cleanValue);
  if (field === 'rating') setRuntimeBucketValue('rating', lineKey, cleanValue);
}

export function applyAdaptedPreviewOverrideFillDown({ host, config, ensureOverrides, field, fromRow, currentValue }) {
  const sourceValueInitial = text(currentValue);
  if (!sourceValueInitial || sourceValueInitial === '—') return 0;

  const overrides = ensureOverrides(config);
  const meta = ensureFillMeta(overrides);
  const category = overrideCategoryForField(field);
  const bucket = overrides[category] || {};
  const metaBucket = meta[category] || {};

  let sourceValue = sourceValueInitial;
  let sourceKey = '';
  let filled = 0;
  const cells = sortedByPreviewRow(host.querySelectorAll(`[data-mc-edit-type="${field}"]`), 'data-mc-edit-row');

  for (const cell of cells) {
    const rowIndex = Number(cell.getAttribute('data-mc-edit-row') || 0);
    const key = keyForOverrideCell(field, cell);
    if (!key) continue;

    if (rowIndex === fromRow) {
      sourceKey = key;
      setOverrideState(meta, category, key, 'manual', null);
      if (!overrides[category]) overrides[category] = {};
      overrides[category][key] = sourceValue;
      setRuntimeBucketValue(category, key, sourceValue);
      if (category === 'rating') setRuntimeProcessValue(key, 'rating', sourceValue);
      continue;
    }
    if (rowIndex < fromRow) continue;

    const visibleValue = valueFromOverrideCell(cell);
    const fillState = inferOverrideFillState({ metaBucket, overridesBucket: bucket, key, visibleValue });
    if (fillState === 'manual') {
      sourceValue = visibleValue;
      sourceKey = key;
      continue;
    }

    if (!overrides[category]) overrides[category] = {};
    overrides[category][key] = sourceValue;
    setOverrideState(meta, category, key, 'auto', sourceKey);
    setRuntimeBucketValue(category, key, sourceValue);
    if (category === 'rating') setRuntimeProcessValue(key, 'rating', sourceValue);

    const valSpan = cell.querySelector('.mc-preview-editable-val');
    if (valSpan) valSpan.textContent = sourceValue;
    const badge = cell.querySelector('.mc-preview-badge');
    if (badge) {
      badge.textContent = '✓ auto-fill';
      badge.className = 'mc-preview-badge exact';
    }
    cell.dataset.mcFillState = 'auto';
    filled += 1;
  }
  return filled;
}

export function applyAdaptedPreviewProcessFillDown({ host, config, ensureOverrides, field, fromRow, currentValue }) {
  const sourceValueInitial = text(currentValue);
  if (!sourceValueInitial) return 0;
  const overrides = ensureOverrides(config);
  if (!overrides.processData || typeof overrides.processData !== 'object') overrides.processData = {};
  const meta = ensureFillMeta(overrides);
  const fieldMeta = processFieldMeta(meta, field);
  let sourceValue = sourceValueInitial;
  let sourceKey = '';
  let filled = 0;
  const inputs = sortedByPreviewRow([...host.querySelectorAll('[data-mc-pd-field]')].filter((input) => input.dataset.mcPdField === field), 'data-mc-pd-row');

  for (const input of inputs) {
    const rowIndex = Number(input.getAttribute('data-mc-pd-row') || 0);
    const lineKey = text(input.getAttribute('data-mc-pd-linekey'));
    if (!lineKey) continue;

    if (rowIndex === fromRow) {
      sourceKey = lineKey;
      setProcessState(meta, field, lineKey, 'manual', null);
      if (!overrides.processData[lineKey]) overrides.processData[lineKey] = {};
      overrides.processData[lineKey][field] = sourceValue;
      setRuntimeProcessValue(lineKey, field, sourceValue);
      if (field === 'rating') setRuntimeBucketValue('rating', lineKey, sourceValue);
      continue;
    }
    if (rowIndex < fromRow) continue;

    const cell = input.closest('.mc-preview-pd-cell');
    const fillState = inferProcessFillState({ metaBucket: fieldMeta, overrides, lineKey, field, cell, value: input.value });
    if (fillState === 'manual') {
      sourceValue = text(input.value);
      sourceKey = lineKey;
      continue;
    }

    if (!overrides.processData[lineKey]) overrides.processData[lineKey] = {};
    overrides.processData[lineKey][field] = sourceValue;
    setProcessState(meta, field, lineKey, 'auto', sourceKey);
    setRuntimeProcessValue(lineKey, field, sourceValue);
    if (field === 'rating') setRuntimeBucketValue('rating', lineKey, sourceValue);
    input.value = sourceValue;
    input.dataset.mcFillState = 'auto';
    filled += 1;
  }
  return filled;
}

export function applyAdaptedPreviewSmartFillByClass({ host, config, ensureOverrides, field, pipingClassKey, currentValue }) {
  const sourceValue = text(currentValue);
  if (!sourceValue || sourceValue === '—') return 0;
  if (!pipingClassKey) return 0;
  const overrides = ensureOverrides(config);
  const meta = ensureFillMeta(overrides);
  const category = overrideCategoryForField(field);
  let filled = 0;
  host.querySelectorAll(`[data-mc-edit-type="${field}"]`).forEach((cell) => {
    const cellPcKey = text(cell.getAttribute('data-mc-pc-key'));
    if (!cellPcKey || cellPcKey !== pipingClassKey) return;
    const key = keyForOverrideCell(field, cell);
    if (!key) return;
    if (!overrides[category]) overrides[category] = {};
    overrides[category][key] = sourceValue;
    setOverrideState(meta, category, key, 'manual', null);
    setRuntimeBucketValue(category, key, sourceValue);
    if (category === 'rating') setRuntimeProcessValue(key, 'rating', sourceValue);
    const valSpan = cell.querySelector('.mc-preview-editable-val');
    if (valSpan) valSpan.textContent = sourceValue;
    const badge = cell.querySelector('.mc-preview-badge');
    if (badge) { badge.textContent = '✓ class-fill'; badge.className = 'mc-preview-badge exact'; }
    cell.dataset.mcFillState = 'class-fill';
    filled += 1;
  });
  return filled;
}

export function applyAdaptedPreviewSmartProcessFillByClass({ host, config, ensureOverrides, field, pipingClassKey, lineKey, currentValue }) {
  const sourceValue = text(currentValue);
  if (!sourceValue) return 0;
  const overrides = ensureOverrides(config);
  if (!overrides.processData || typeof overrides.processData !== 'object') overrides.processData = {};
  const meta = ensureFillMeta(overrides);
  let filled = 0;
  host.querySelectorAll(`[data-mc-pd-field="${field}"]`).forEach((input) => {
    if (pipingClassKey) {
      const pcKey = text(input.getAttribute('data-mc-pd-pckey'));
      if (!pcKey || pcKey !== pipingClassKey) return;
    } else {
      const lk = text(input.getAttribute('data-mc-pd-linekey'));
      if (!lk || lk !== lineKey) return;
    }
    const lk = text(input.getAttribute('data-mc-pd-linekey'));
    if (!lk) return;
    if (!overrides.processData[lk]) overrides.processData[lk] = {};
    overrides.processData[lk][field] = sourceValue;
    setProcessState(meta, field, lk, 'manual', null);
    setRuntimeProcessValue(lk, field, sourceValue);
    if (field === 'rating') setRuntimeBucketValue('rating', lk, sourceValue);
    input.value = sourceValue;
    input.dataset.mcFillState = 'class-fill';
    const cell = input.closest('.mc-preview-pd-cell');
    if (cell) cell.className = 'mc-preview-pd-cell mc-preview-pd-override';
    filled += 1;
  });
  return filled;
}
