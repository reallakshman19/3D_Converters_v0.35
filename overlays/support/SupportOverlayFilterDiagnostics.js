export const SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA = 'support-overlay-filter-diagnostics/v1';

const FAMILY_ALIASES = Object.freeze({
  SPRING: 'SPRING_CAN',
  CAN: 'SPRING_CAN',
  SPRINGCAN: 'SPRING_CAN',
  'SPRING CAN': 'SPRING_CAN',
  LINE_STOP: 'LINESTOP',
  'LINE STOP': 'LINESTOP',
  STOP: 'LINESTOP',
});

const DEFAULT_FAMILIES = Object.freeze([
  'REST',
  'GUIDE',
  'LINESTOP',
  'LIMIT',
  'LIM',
  'HOLDDOWN',
  'SPRING_CAN',
  'UNKNOWN',
]);

export function buildSupportOverlayFilterPlan(records = [], settings = {}) {
  const list = Array.isArray(records) ? records : [];
  const filters = normalizeSupportOverlayFilters(settings?.filters);
  const acceptedRecords = [];
  const filteredRecords = [];
  const sourceByFamily = {};
  const filteredByFamily = {};

  for (const record of list) {
    const family = normalizeSupportFamily(record?.kind || record?.family || record?.rawType || 'UNKNOWN');
    sourceByFamily[family] = (sourceByFamily[family] || 0) + 1;

    if (filters[family] === false) {
      filteredByFamily[family] = (filteredByFamily[family] || 0) + 1;
      filteredRecords.push({
        id: record?.tag || record?.id || record?.supportNo || '',
        family,
        reason: 'family-filter-disabled',
      });
      continue;
    }

    acceptedRecords.push(record);
  }

  const disabledFamilies = Object.entries(filters)
    .filter(([, enabled]) => enabled === false)
    .map(([family]) => family)
    .sort();

  return {
    schema: SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA,
    totalRecords: list.length,
    acceptedRecords,
    acceptedCount: acceptedRecords.length,
    filteredOut: filteredRecords.length,
    filteredRecords,
    filteredByFamily,
    sourceByFamily,
    disabledFamilies,
    filtersApplied: disabledFamilies.length > 0,
    filters,
  };
}

export function normalizeSupportOverlayFilters(value = {}) {
  const out = Object.fromEntries(DEFAULT_FAMILIES.map((family) => [family, true]));
  if (!value || typeof value !== 'object') return out;

  for (const [rawKey, rawEnabled] of Object.entries(value)) {
    const family = normalizeSupportFamily(rawKey);
    if (!family) continue;
    out[family] = rawEnabled !== false;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'SPRING')) {
    out.SPRING_CAN = value.SPRING !== false;
  }

  return out;
}

export function isSupportFamilyEnabled(settings = {}, family = '') {
  const filters = normalizeSupportOverlayFilters(settings?.filters);
  const key = normalizeSupportFamily(family);
  return filters[key] !== false;
}

export function normalizeSupportFamily(value = '') {
  const raw = String(value || 'UNKNOWN').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!raw) return 'UNKNOWN';
  const spaced = raw.replace(/_/g, ' ');
  if (FAMILY_ALIASES[raw]) return FAMILY_ALIASES[raw];
  if (FAMILY_ALIASES[spaced]) return FAMILY_ALIASES[spaced];
  if (DEFAULT_FAMILIES.includes(raw)) return raw;
  return raw === 'SPRING_CAN' ? 'SPRING_CAN' : 'UNKNOWN';
}
