const PREFIX = 'autoBend.nonPrimitive.';

export const AUTO_BEND_STORAGE_KEYS = Object.freeze({
  enabled: `${PREFIX}enabled`,
  radiusMode: `${PREFIX}radiusMode`,
  defaultRadiusFactor: `${PREFIX}defaultRadiusFactor`,
  showDiagnostics: `${PREFIX}showDiagnostics`,
});

export function readNonPrimitiveAutoBendSettings(storage = globalThis?.localStorage) {
  return {
    enabled: readBool(storage, AUTO_BEND_STORAGE_KEYS.enabled, true),
    radiusMode: readString(storage, AUTO_BEND_STORAGE_KEYS.radiusMode, 'source-or-od'),
    defaultRadiusFactor: clamp(readNumber(storage, AUTO_BEND_STORAGE_KEYS.defaultRadiusFactor, 1.5), 0.5, 10),
    showDiagnostics: readBool(storage, AUTO_BEND_STORAGE_KEYS.showDiagnostics, false),
  };
}

export function writeNonPrimitiveAutoBendSettings(settings = {}, storage = globalThis?.localStorage) {
  if (!storage?.setItem) return;
  if ('enabled' in settings) storage.setItem(AUTO_BEND_STORAGE_KEYS.enabled, settings.enabled ? 'true' : 'false');
  if ('radiusMode' in settings) storage.setItem(AUTO_BEND_STORAGE_KEYS.radiusMode, String(settings.radiusMode || 'source-or-od'));
  if ('defaultRadiusFactor' in settings) storage.setItem(AUTO_BEND_STORAGE_KEYS.defaultRadiusFactor, String(clamp(Number(settings.defaultRadiusFactor) || 1.5, 0.5, 10)));
  if ('showDiagnostics' in settings) storage.setItem(AUTO_BEND_STORAGE_KEYS.showDiagnostics, settings.showDiagnostics ? 'true' : 'false');
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

function readString(storage, key, fallback) {
  const value = storage?.getItem?.(key);
  return value == null || value === '' ? fallback : value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
