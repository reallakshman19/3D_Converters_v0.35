export const BM_CII_RESTRAINT_VISUAL_PROFILE_SCHEMA = 'bm-cii-restraint-visual-profile/v1';

export const RESTRAINT_VISUAL_PROFILE = Object.freeze({
  id: 'v4-engineering-readable',
  schema: BM_CII_RESTRAINT_VISUAL_PROFILE_SCHEMA,
  purpose: 'Readable engineering restraint glyphs for BM_CII GLB runtime and export paths.',
  minimums: Object.freeze({
    // These are relative to the symbol scale used by the viewer/exporter. QC reads these values.
    basePlateWidth: 1.05,
    basePlateDepth: 0.70,
    arrowHeadRadius: 0.12,
    arrowLength: 0.58,
    guideJawHeight: 0.86,
    linestopBlockHeight: 0.82,
    limitGapTickWidth: 0.42,
    axisIndicatorLength: 0.54,
  }),
  requiredKinds: Object.freeze(['REST', 'GUIDE', 'LINESTOP', 'LIMIT', 'ANCHOR', 'HANGER', 'SPRING', 'UNKNOWN']),
  directionalKinds: Object.freeze(['GUIDE', 'LINESTOP', 'LIMIT', 'ANCHOR']),
});

export const SUPPORT_SYMBOL_COLORS = Object.freeze({
  REST: 0x22c55e,
  GUIDE: 0x22c55e,
  LINESTOP: 0x10b981,
  LIMIT: 0xf97316,
  ANCHOR: 0xef4444,
  SPRING: 0xa855f7,
  HANGER: 0xa855f7,
  SHOE: 0x22c55e,
  HOLDDOWN: 0x22c55e,
  UNKNOWN: 0xf59e0b,
});

export const AXIS_SYMBOL_COLORS = Object.freeze({
  X: 0xef4444,
  Y: 0x22c55e,
  Z: 0x3b82f6,
});

export function normalizeRestraintKind(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!raw) return '';
  if (raw.includes('LINESTOP') || raw.includes('LINE_STOP') || raw.includes('LIMIT_STOP') || raw.includes('LIMT_STOP')) return 'LINESTOP';
  if (raw.includes('GUIDE')) return 'GUIDE';
  if (raw.includes('LIMIT')) return 'LIMIT';
  if (raw.includes('ANCHOR') || raw === 'ANC') return 'ANCHOR';
  if (raw.includes('HANGER')) return 'HANGER';
  if (raw.includes('SPRING')) return 'SPRING';
  if (raw.includes('HOLDDOWN')) return 'HOLDDOWN';
  if (raw.includes('REST') || raw.includes('SHOE') || raw.includes('SUPPORT')) return 'REST';
  if (raw.includes('TYPE0') || raw === '0' || raw.includes('UNKNOWN')) return 'UNKNOWN';
  return raw;
}

export function normalizeRestraintAxisLabel(value) {
  if (Array.isArray(value)) {
    const nums = value.map(Number);
    const abs = nums.map((n) => Math.abs(Number.isFinite(n) ? n : 0));
    const max = Math.max(...abs);
    if (max <= 0) return '';
    const index = abs.indexOf(max);
    return `${nums[index] < 0 ? '-' : '+'}${['X', 'Y', 'Z'][index]}`;
  }
  if (value && typeof value === 'object') {
    return normalizeRestraintAxisLabel([value.x, value.y, value.z]);
  }
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (/^[+-]?[XYZ]$/.test(raw)) return raw;
  if (raw.includes('DX') || raw.includes('+X') || raw.includes('-X') || raw === 'X') return raw.includes('-') ? '-X' : '+X';
  if (raw.includes('DY') || raw.includes('+Y') || raw.includes('-Y') || raw === 'Y') return raw.includes('-') ? '-Y' : '+Y';
  if (raw.includes('DZ') || raw.includes('+Z') || raw.includes('-Z') || raw === 'Z') return raw.includes('-') ? '-Z' : '+Z';
  return '';
}

export function layerIdsForRestraintSupport({ source = 'inputxml', kind = 'UNKNOWN', axisLabel = '' } = {}) {
  const normalizedKind = normalizeRestraintKind(kind) || 'UNKNOWN';
  const normalizedAxis = normalizeRestraintAxisLabel(axisLabel);
  const normalizedSource = String(source || '').toLowerCase().includes('isonote') ? 'isonote' : 'inputxml';
  const ids = [
    'plant.restraints',
    normalizedSource === 'isonote' ? 'restraints.isonote' : 'restraints.inputxml',
    `restraints.${normalizedKind.toLowerCase()}`,
  ];
  if (normalizedAxis.includes('X')) ids.push('axis.x');
  if (normalizedAxis.includes('Y')) ids.push('axis.y');
  if (normalizedAxis.includes('Z')) ids.push('axis.z');
  return ids;
}

export function visualProfileMetadata({ kind = '', source = '', axisLabel = '', scale = undefined, role = '' } = {}) {
  return {
    schema: BM_CII_RESTRAINT_VISUAL_PROFILE_SCHEMA,
    profile: RESTRAINT_VISUAL_PROFILE.id,
    role,
    source: String(source || '').toLowerCase().includes('isonote') ? 'isonote' : 'inputxml',
    kind: normalizeRestraintKind(kind) || 'UNKNOWN',
    axis: normalizeRestraintAxisLabel(axisLabel),
    renderScale: Number.isFinite(Number(scale)) ? Number(scale) : undefined,
    minimums: RESTRAINT_VISUAL_PROFILE.minimums,
  };
}
