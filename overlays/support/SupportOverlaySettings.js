const PREFIX = 'supportOverlay.nonPrimitive.';

export const SUPPORT_OVERLAY_STORAGE_KEYS = Object.freeze({
  enabled: `${PREFIX}enabled`,
  scale: `${PREFIX}scale`,
  labels: `${PREFIX}labels`,
  labelsUserSet: `${PREFIX}labels.userSet`,
  warningsOnly: `${PREFIX}warningsOnly`,
  filters: `${PREFIX}filters`,
});

export function readNonPrimitiveSupportOverlaySettings(storage = globalThis?.localStorage) {
  const labelsUserSet = readBool(storage, SUPPORT_OVERLAY_STORAGE_KEYS.labelsUserSet, false);
  return {
    enabled: readBool(storage, SUPPORT_OVERLAY_STORAGE_KEYS.enabled, true),
    scale: clamp(readNumber(storage, SUPPORT_OVERLAY_STORAGE_KEYS.scale, 1), 0.2, 10),
    labels: labelsUserSet ? readBool(storage, SUPPORT_OVERLAY_STORAGE_KEYS.labels, false) : false,
    labelsUserSet,
    warningsOnly: readBool(storage, SUPPORT_OVERLAY_STORAGE_KEYS.warningsOnly, false),
    filters: readFilters(storage),
  };
}

export function writeNonPrimitiveSupportOverlaySettings(settings = {}, storage = globalThis?.localStorage) {
  if (!storage?.setItem) return;
  if ('enabled' in settings) storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.enabled, settings.enabled ? 'true' : 'false');
  if ('scale' in settings) storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.scale, String(clamp(Number(settings.scale) || 1, 0.2, 10)));
  if ('labels' in settings) {
    storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.labels, settings.labels ? 'true' : 'false');
    storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.labelsUserSet, 'true');
  }
  if ('labelsUserSet' in settings) storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.labelsUserSet, settings.labelsUserSet ? 'true' : 'false');
  if ('warningsOnly' in settings) storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.warningsOnly, settings.warningsOnly ? 'true' : 'false');
  if ('filters' in settings) storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.filters, JSON.stringify(normalizeFilters(settings.filters)));
}

export function resetNonPrimitiveSupportOverlayLabels(storage = globalThis?.localStorage) {
  if (!storage?.setItem) return;
  storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.labels, 'false');
  storage.setItem(SUPPORT_OVERLAY_STORAGE_KEYS.labelsUserSet, 'true');
}

function readFilters(storage) {
  const raw = storage?.getItem?.(SUPPORT_OVERLAY_STORAGE_KEYS.filters);
  if (!raw) return normalizeFilters(null);
  try { return normalizeFilters(JSON.parse(raw)); } catch (_) { return normalizeFilters(null); }
}

function normalizeFilters(value) {
  const fallback = {
    REST: true,
    GUIDE: true,
    LINESTOP: true,
    LIMIT: true,
    LIM: true,
    HOLDDOWN: true,
    SPRING_CAN: true,
    UNKNOWN: true,
  };
  if (!value || typeof value !== 'object') return fallback;
  return { ...fallback, ...Object.fromEntries(Object.entries(value).map(([key, enabled]) => [String(key).toUpperCase(), enabled !== false])) };
}

function readBool(storage, key, fallback) {
  const raw = storage?.getItem?.(key);
  if (raw == null || raw === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(String(raw))) return true;
  if (/^(0|false|no|off)$/i.test(String(raw))) return false;
  return fallback;
}

function readNumber(storage, key, fallback) {
  const raw = storage?.getItem?.(key);
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
