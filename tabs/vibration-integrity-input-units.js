import { convertEngineeringUnit } from '../converters/engineering-calculations/units.js';
import { vibrationTabularInputError } from '../converters/vibration/tabular/csv.js';
import {
  revertVibrationWorkingCell,
  updateVibrationWorkingCell,
} from './vibration-integrity-working-state.js';

const OPERATING_QUANTITIES = Object.freeze([
  Object.freeze({ value: 4, unit: 5, quantity: 'mass_flow' }),
  Object.freeze({ value: 6, unit: 7, quantity: 'density' }),
  Object.freeze({ value: 8, unit: 9, quantity: 'pressure', reference: 10 }),
  Object.freeze({ value: 11, unit: 12, quantity: 'temperature' }),
  Object.freeze({ value: 13, unit: 14, quantity: 'dynamic_viscosity' }),
  Object.freeze({ value: 15, unit: 16, quantity: 'velocity' }),
]);

const ENRICHMENT_QUANTITIES = Object.freeze({
  OUTSIDE_DIAMETER: 'length', WALL_THICKNESS: 'length', INSIDE_DIAMETER: 'length',
  MAX_UNSUPPORTED_SPAN: 'length', NATURAL_FREQUENCY: 'frequency',
});

const DATA_BLOCKER_QUANTITIES = Object.freeze({
  OUTSIDE_DIAMETER: 'length', WALL_THICKNESS: 'length', INSIDE_DIAMETER: 'length',
  MAX_UNSUPPORTED_SPAN: 'length', NATURAL_FREQUENCY: 'frequency',
  MASS_FLOW: 'mass_flow', GAS_MASS_FLOW: 'mass_flow', LIQUID_MASS_FLOW: 'mass_flow',
  DENSITY: 'density', GAS_DENSITY: 'density', LIQUID_DENSITY: 'density',
  DYNAMIC_VISCOSITY: 'dynamic_viscosity', VELOCITY: 'velocity',
});

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function pairForColumn(table, rowIndex, columnIndex) {
  if (table.kind === 'operating') {
    return OPERATING_QUANTITIES.find((pair) => pair.value === columnIndex || pair.unit === columnIndex) ?? null;
  }
  const row = table.rows[rowIndex];
  if (table.kind === 'enrichment' && [4, 6].includes(columnIndex) && row?.[5] === 'NUMBER') {
    const quantity = ENRICHMENT_QUANTITIES[row[3]];
    return quantity ? { value: 4, unit: 6, quantity } : null;
  }
  if (table.kind === 'dataBlockers' && [4, 5].includes(columnIndex)) {
    const quantity = DATA_BLOCKER_QUANTITIES[text(row?.[3]).trim().toUpperCase()];
    return quantity ? { value: 4, unit: 5, quantity } : null;
  }
  return null;
}

function pressureOptions(row, pair) {
  if (pair.quantity !== 'pressure') return {};
  const reference = text(row[pair.reference]).trim().toLowerCase();
  return ['absolute', 'gauge'].includes(reference) ? { pressureReference: reference } : {};
}

function unresolvedUnitEdit(table, row, columnIndex, pair) {
  if (pair || !['enrichment', 'dataBlockers'].includes(table.kind)) return false;
  const unitColumn = table.kind === 'enrichment' ? 6 : 5;
  return columnIndex === unitColumn
    && text(row?.[4]).trim() !== ''
    && text(row?.[unitColumn]).trim() !== '';
}

function assertResolvedUnitContext(table, row, columnIndex, value, pair) {
  if (!unresolvedUnitEdit(table, row, columnIndex, pair)) return;
  const oldUnit = text(row[columnIndex]).trim();
  const nextUnit = text(value).trim();
  if (!nextUnit || oldUnit === nextUnit) return;
  throw vibrationTabularInputError(
    'VIBRATION_INPUT_UNIT_CONTEXT_UNRESOLVED',
    `Cannot convert unit for ${table.kind} property ${row[3]} without a known engineering quantity.`,
    { property: row[3], fromUnit: oldUnit, toUnit: nextUnit },
  );
}

function convertedText(value) {
  return String(Number(value.toPrecision(15)));
}

export function updateVibrationIntegrityUnitAwareCell(table, rowIndex, columnIndex, value) {
  const pair = pairForColumn(table, rowIndex, columnIndex);
  const row = table.rows[rowIndex];
  assertResolvedUnitContext(table, row, columnIndex, value, pair);
  if (!pair || columnIndex !== pair.unit) {
    return updateVibrationWorkingCell(table.records, rowIndex, columnIndex, value);
  }
  const fromUnit = text(row[pair.unit]).trim();
  const toUnit = text(value).trim();
  const rawValue = text(row[pair.value]).trim();
  let records = table.records;
  if (rawValue && fromUnit && toUnit && fromUnit !== toUnit) {
    const converted = convertEngineeringUnit(
      Number(rawValue), pair.quantity, fromUnit, toUnit, pressureOptions(row, pair),
    );
    records = updateVibrationWorkingCell(records, rowIndex, pair.value, convertedText(converted));
  }
  return updateVibrationWorkingCell(records, rowIndex, pair.unit, value);
}

export function revertVibrationIntegrityUnitAwareCell(table, rowIndex, columnIndex) {
  const pair = pairForColumn(table, rowIndex, columnIndex);
  let records = revertVibrationWorkingCell(table.records, rowIndex, columnIndex);
  if (!pair) return records;
  if (pair.value !== columnIndex) records = revertVibrationWorkingCell(records, rowIndex, pair.value);
  if (pair.unit !== columnIndex) records = revertVibrationWorkingCell(records, rowIndex, pair.unit);
  return records;
}
