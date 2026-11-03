import { convertEngineeringUnit } from '../../engineering-calculations/units.js';

function quantity(value, field) {
  if (!value || typeof value !== 'object') throw new TypeError(`AIV .eit export requires ${field}.`);
  const number = Number(value.value);
  const unit = String(value.unit ?? '').trim();
  if (!Number.isFinite(number) || !unit) throw new TypeError(`AIV .eit export requires finite ${field} with unit.`);
  return { value: number, unit };
}

function canonicalTemperatureUnit(unit) {
  const key = String(unit).trim();
  if (key === 'degC' || key === '°C') return 'C';
  if (key === 'degF' || key === '°F') return 'F';
  return key;
}

export function aivEitLengthMm(input, field = 'Length') {
  const q = quantity(input, field);
  return convertEngineeringUnit(q.value, 'length', q.unit, 'mm');
}

export function aivEitMolecularWeightGPerMol(input) {
  const q = quantity(input, 'Molecular Weight');
  if (q.unit === 'g/mol' || q.unit === 'kg/kmol') return q.value;
  if (q.unit === 'kg/mol') return q.value * 1000;
  throw new TypeError(`AIV .eit export does not support molecular-weight unit ${q.unit}.`);
}

export function aivEitMassFlowKgH(input) {
  const q = quantity(input, 'Mass Flow');
  return convertEngineeringUnit(q.value, 'mass_flow', q.unit, 'kg/h');
}

export function aivEitTemperatureC(input) {
  const q = quantity(input, 'Upstream Temperature');
  return convertEngineeringUnit(q.value, 'temperature', canonicalTemperatureUnit(q.unit), 'C');
}

function pressureBar(input) {
  const q = quantity(input, 'Pressure');
  return convertEngineeringUnit(q.value, 'pressure', q.unit, 'bar');
}

export function aivEitPressureBarAbsolute(source, key) {
  const pressure = source?.[key];
  if (!pressure) throw new TypeError(`AIV .eit export requires ${key}.`);
  const basis = String(pressure.basis ?? '').toUpperCase();
  const valueBar = pressureBar(pressure);
  if (basis === 'ABSOLUTE') return valueBar;
  if (basis !== 'GAUGE') throw new TypeError(`AIV .eit export requires explicit ABSOLUTE or GAUGE basis for ${key}.`);
  if (!source.referencePressure || !source.referencePressureSource || !source.referencePressureSourceRevision) {
    throw new TypeError('AIV .eit gauge-pressure export requires explicit reference-pressure evidence.');
  }
  return valueBar + pressureBar(source.referencePressure);
}

export function aivEitTrimReductionDb(source) {
  const trim = source?.lowNoiseTrim;
  if (!trim || trim.state === 'NONE') return 0;
  if (trim.state !== 'MANUFACTURER_REDUCTION') {
    throw new TypeError('AIV .eit export requires resolved low-noise-trim state.');
  }
  const q = quantity(trim.reduction, 'Low Noise Trim Reduction');
  if (q.unit !== 'dB') throw new TypeError('AIV .eit trim reduction must use dB.');
  return q.value;
}
