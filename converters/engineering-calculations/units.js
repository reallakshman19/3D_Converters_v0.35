import { createEngineeringCalculationError } from './contracts.js';

const KSI_TO_PA = 6_894_757.293168361;
const PSI_TO_PA = 6_894.757293168361;

const LINEAR_UNITS = Object.freeze({
  length: { m: 1, mm: 1e-3, cm: 1e-2, in: 0.0254, ft: 0.3048 },
  area: { m2: 1, mm2: 1e-6, cm2: 1e-4, in2: 0.00064516, ft2: 0.09290304 },
  volume: { m3: 1, L: 1e-3, mm3: 1e-9, in3: 1.6387064e-5, ft3: 0.028316846592 },
  force: { N: 1, kN: 1e3, lbf: 4.4482216152605 },
  moment: { 'N*m': 1, 'N*mm': 1e-3, 'kN*m': 1e3, 'lbf*ft': 1.3558179483314, 'lbf*in': 0.1129848290276 },
  pressure: { Pa: 1, kPa: 1e3, MPa: 1e6, bar: 1e5, barg: 1e5, bara: 1e5, psi: PSI_TO_PA, psig: PSI_TO_PA, psia: PSI_TO_PA },
  stress: { Pa: 1, kPa: 1e3, MPa: 1e6, GPa: 1e9, psi: PSI_TO_PA, ksi: KSI_TO_PA },
  modulus: { Pa: 1, MPa: 1e6, GPa: 1e9, psi: PSI_TO_PA, ksi: KSI_TO_PA },
  mass: { kg: 1, g: 1e-3, lb: 0.45359237 },
  mass_flow: { 'kg/s': 1, 'kg/h': 1 / 3600, 'lb/s': 0.45359237, 'lb/hr': 0.45359237 / 3600 },
  volumetric_flow: { 'm3/s': 1, 'm3/h': 1 / 3600, 'L/s': 1e-3, gpm: 6.30901964e-5 },
  density: { 'kg/m3': 1, 'g/cm3': 1e3, 'lb/ft3': 16.01846337396 },
  dynamic_viscosity: { 'Pa*s': 1, 'mPa*s': 1e-3, cP: 1e-3 },
  velocity: { 'm/s': 1, 'mm/s': 1e-3, 'ft/s': 0.3048, mph: 0.44704 },
  acceleration: { 'm/s2': 1, 'mm/s2': 1e-3, 'ft/s2': 0.3048, g: 9.80665 },
  frequency: { Hz: 1, kHz: 1e3, rpm: 1 / 60 },
  time: { s: 1, ms: 1e-3, min: 60, h: 3600 },
  energy: { J: 1, kJ: 1e3, MJ: 1e6, 'ft*lbf': 1.3558179483314 },
  power: { W: 1, kW: 1e3, MW: 1e6, hp: 745.699871582 },
});

const UNIT_ALIASES = new Map([
  ['M²', 'm2'], ['MM²', 'mm2'], ['CM²', 'cm2'], ['IN²', 'in2'], ['FT²', 'ft2'],
  ['M³', 'm3'], ['MM³', 'mm3'], ['IN³', 'in3'], ['FT³', 'ft3'],
  ['LB/HR', 'lb/hr'], ['LB/H', 'lb/hr'], ['KG/H', 'kg/h'], ['M³/H', 'm3/h'],
  ['KG/M³', 'kg/m3'], ['LB/FT³', 'lb/ft3'], ['PA.S', 'Pa*s'], ['MPA.S', 'mPa*s'],
  ['N.MM', 'N*mm'], ['N.M', 'N*m'],
  ['KN.M', 'kN*m'], ['LBF.FT', 'lbf*ft'], ['LBF.IN', 'lbf*in'],
]);

function canonicalUnitKey(table, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const alias = UNIT_ALIASES.get(raw.toUpperCase());
  if (alias && Object.hasOwn(table, alias)) return alias;
  const match = Object.keys(table).find((key) => key.toLowerCase() === raw.toLowerCase());
  return match ?? null;
}

function pressureReference(unit) {
  const key = String(unit ?? '').toLowerCase();
  if (['barg', 'psig'].includes(key)) return 'gauge';
  if (['bara', 'psia'].includes(key)) return 'absolute';
  return null;
}

function unsupported(fromUnit, toUnit, quantity) {
  const error = new RangeError(`Unsupported ${quantity} conversion: ${fromUnit} -> ${toUnit}`);
  error.code = 'INPUT_UNIT_UNSUPPORTED';
  error.details = { quantity, fromUnit, toUnit };
  return error;
}

function assertPressureReference(fromUnit, toUnit, expectedReference) {
  const explicit = [pressureReference(fromUnit), pressureReference(toUnit)].filter(Boolean);
  if (new Set(explicit).size > 1) throw unsupported(fromUnit, toUnit, 'pressure');
  if (expectedReference && explicit.some((item) => item !== expectedReference)) {
    throw unsupported(fromUnit, toUnit, 'pressure');
  }
}

function convertTemperature(value, fromUnit, toUnit) {
  const from = String(fromUnit).trim().toUpperCase();
  const to = String(toUnit).trim().toUpperCase();
  const celsius = from === 'C' ? value
    : from === 'F' ? (value - 32) * 5 / 9
      : from === 'K' ? value - 273.15
        : from === 'R' ? (value - 491.67) * 5 / 9
          : NaN;
  if (!Number.isFinite(celsius)) throw unsupported(fromUnit, toUnit, 'temperature');
  if (to === 'C') return celsius;
  if (to === 'F') return celsius * 9 / 5 + 32;
  if (to === 'K') return celsius + 273.15;
  if (to === 'R') return (celsius + 273.15) * 9 / 5;
  throw unsupported(fromUnit, toUnit, 'temperature');
}

export function normalizeEngineeringUnit(quantity, unit) {
  if (quantity === 'temperature') {
    const key = String(unit ?? '').trim().toUpperCase();
    return ['C', 'F', 'K', 'R'].includes(key) ? key : null;
  }
  const table = LINEAR_UNITS[quantity];
  return table ? canonicalUnitKey(table, unit) : null;
}

export function convertEngineeringUnit(value, quantity, fromUnit, toUnit, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new TypeError('Engineering quantity must be a finite number.');
    error.code = 'INPUT_INVALID';
    throw error;
  }
  if (!quantity || fromUnit === toUnit || (!fromUnit && !toUnit)) return number;
  if (quantity === 'temperature') return convertTemperature(number, fromUnit, toUnit);
  const table = LINEAR_UNITS[quantity];
  if (!table) throw unsupported(fromUnit, toUnit, quantity);
  const from = canonicalUnitKey(table, fromUnit);
  const to = canonicalUnitKey(table, toUnit);
  if (!from || !to) throw unsupported(fromUnit, toUnit, quantity);
  if (quantity === 'pressure') assertPressureReference(from, to, options.pressureReference ?? null);
  return number * table[from] / table[to];
}

export function engineeringUnitError(error, field) {
  return createEngineeringCalculationError(
    error?.code || 'INPUT_UNIT_UNSUPPORTED',
    error?.message || 'Engineering unit conversion failed.',
    error?.details || {},
    field,
  );
}
