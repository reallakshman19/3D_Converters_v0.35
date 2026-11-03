const BLANK_DENSITY_VALUES = new Set(['', '-', '--', '---', 'NA', 'N/A', 'NULL', 'NONE', 'NIL']);

function rawText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

export function isBlankDensityValue(value) {
  const normalized = rawText(value).toUpperCase().replace(/\s+/g, '');
  return BLANK_DENSITY_VALUES.has(normalized);
}

function text(value) {
  const raw = rawText(value);
  return isBlankDensityValue(raw) ? '' : raw;
}

export function resolveDensityRangeToMax(value) {
  const raw = text(value);
  if (!raw) return '';
  const withoutCommas = raw.replace(/,/g, '');
  if (Number.isFinite(Number(withoutCommas))) return raw;
  const pair = withoutCommas.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|\/|\bto\b)\s*(-?\d+(?:\.\d+)?)$/i);
  if (pair) {
    const left = Number(pair[1]);
    const right = Number(pair[2]);
    if (Number.isFinite(left) && Number.isFinite(right)) return String(Math.max(left, right));
  }
  const values = (withoutCommas.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  return values.length > 1 ? String(Math.max(...values)) : raw;
}

function upper(value) {
  return text(value).toUpperCase();
}

function readRowValue(row, keys = []) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    if (!key) continue;
    const value = row[key] ?? row._raw?.[key];
    const cleaned = text(value);
    if (cleaned) return cleaned;
  }
  return '';
}

function readOverride(processOverride, key) {
  if (!processOverride || typeof processOverride !== 'object') return '';
  if (!Object.prototype.hasOwnProperty.call(processOverride, key)) return '';
  return text(processOverride[key]);
}

function densityResult(value, source, phase, selected) {
  const raw = text(value);
  const resolved = resolveDensityRangeToMax(raw);
  const resolvedSource = raw && resolved && raw !== resolved ? `${source}-range-max` : source;
  return { value: resolved, source: resolvedSource, phase, selected };
}

const DENSITY_ALIASES = Object.freeze({
  density: Object.freeze(['density', 'Density', 'DENSITY', 'FluidDensity', 'Fluid Density', 'Density kg/m3', 'kg/m3']),
  densityMixed: Object.freeze(['densityMixed', 'Density Mixed', 'Mixed Density', 'Mixed kg/m3', 'Density (Mixed)', 'Mixed']),
  densityGas: Object.freeze(['densityGas', 'Density Gas', 'Gas Density', 'Gas kg/m3', 'Density (Gas)', 'Gas']),
  densityLiquid: Object.freeze(['densityLiquid', 'Density Liquid', 'Liquid Density', 'Liquid kg/m3', 'Density (Liquid)', 'Liquid', 'Liq Density']),
  phase: Object.freeze(['phase', 'Phase', 'PHASE', 'Fluid Phase', 'Medium Phase', 'Medium', 'State']),
});

export function resolveLineListDensity(row, processOverride = null) {
  const overrideDensity = readOverride(processOverride, 'density');
  if (overrideDensity) return densityResult(overrideDensity, 'override', '', 'density');

  const direct = readRowValue(row, DENSITY_ALIASES.density);
  const mixed = readRowValue(row, DENSITY_ALIASES.densityMixed);
  const gas = readRowValue(row, DENSITY_ALIASES.densityGas);
  const liquid = readRowValue(row, DENSITY_ALIASES.densityLiquid);
  const phase = upper(readRowValue(row, DENSITY_ALIASES.phase));

  if (phase.startsWith('M') || phase.includes('MIX')) {
    if (mixed) return densityResult(mixed, 'linelist-density-mixed', phase, 'densityMixed');
    if (liquid) return densityResult(liquid, 'linelist-density-liquid-fallback', phase, 'densityLiquid');
  }
  if ((phase.startsWith('G') || phase.includes('GAS')) && gas) return densityResult(gas, 'linelist-density-gas', phase, 'densityGas');
  if ((phase.startsWith('L') || phase.includes('LIQ')) && liquid) return densityResult(liquid, 'linelist-density-liquid', phase, 'densityLiquid');

  if (direct) return densityResult(direct, 'linelist-density', phase, 'density');
  if (mixed) return densityResult(mixed, 'linelist-density-mixed', phase, 'densityMixed');
  if (gas) return densityResult(gas, 'linelist-density-gas', phase, 'densityGas');
  if (liquid) return densityResult(liquid, 'linelist-density-liquid', phase, 'densityLiquid');
  return { value: '', source: 'none', phase, selected: '' };
}
