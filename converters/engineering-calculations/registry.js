import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  ENGINEERING_CALCULATION_FAMILIES,
  ENGINEERING_CALCULATION_FAMILY_LABELS,
  immutableEngineeringSnapshot,
  normalizeEngineeringCalculationId,
} from './contracts.js';

const REQUIRED_FIELDS = Object.freeze([
  'contractVersion', 'id', 'family', 'name', 'methodRevision', 'purpose',
  'authority', 'applicability', 'inputs', 'outputs', 'calculate',
]);
const CALCULATION_ID_PATTERN = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*){1,}$/;
const FIELD_TYPES = new Set(['number', 'integer', 'boolean', 'string', 'enum', 'vector3', 'table', 'object']);

function definitionError(code, message, details = {}) {
  const error = new TypeError(message);
  error.code = code;
  error.details = details;
  return error;
}

function validateFieldList(fields, kind, calculationId) {
  if (!Array.isArray(fields)) throw definitionError('INVALID_CALCULATION_DEFINITION', `${kind} must be an array.`);
  const keys = new Set();
  for (const field of fields) {
    if (!field?.key || typeof field.key !== 'string') throw definitionError('INVALID_CALCULATION_DEFINITION', `${kind} field key is required.`);
    if (keys.has(field.key)) throw definitionError('INVALID_CALCULATION_DEFINITION', `Duplicate ${kind} field: ${field.key}`, { calculationId });
    if (!FIELD_TYPES.has(field.type ?? 'number')) throw definitionError('INVALID_CALCULATION_DEFINITION', `Unsupported field type: ${field.type}`, { calculationId, field: field.key });
    if (['number', 'integer'].includes(field.type ?? 'number') && field.quantity && field.quantity !== 'dimensionless' && !field.canonicalUnit) {
      throw definitionError('INVALID_CALCULATION_DEFINITION', `Numeric engineering field ${field.key} requires canonicalUnit.`, { calculationId, field: field.key });
    }
    keys.add(field.key);
  }
}

export function validateEngineeringCalculationDefinition(definition) {
  if (!definition || typeof definition !== 'object') throw definitionError('INVALID_CALCULATION_DEFINITION', 'Calculator definition must be an object.');
  for (const field of REQUIRED_FIELDS) {
    if (definition[field] === undefined || definition[field] === null) throw definitionError('INVALID_CALCULATION_DEFINITION', `Missing calculator definition field: ${field}`);
  }
  if (definition.contractVersion !== ENGINEERING_CALCULATION_CONTRACT_VERSION) throw definitionError('CONTRACT_VERSION_UNSUPPORTED', `Unsupported calculator contract: ${definition.contractVersion}`);
  const id = normalizeEngineeringCalculationId(definition.id);
  if (!CALCULATION_ID_PATTERN.test(id)) throw definitionError('INVALID_CALCULATION_DEFINITION', `Invalid calculation ID: ${definition.id}`);
  if (!ENGINEERING_CALCULATION_FAMILIES.includes(definition.family)) throw definitionError('INVALID_CALCULATION_DEFINITION', `Invalid calculation family: ${definition.family}`);
  if (typeof definition.calculate !== 'function') throw definitionError('INVALID_CALCULATION_DEFINITION', `${id} must expose calculate().`);
  if (typeof definition.methodRevision !== 'string' || !definition.methodRevision.trim()) throw definitionError('INVALID_CALCULATION_DEFINITION', `${id} requires methodRevision.`);
  validateFieldList(definition.inputs, 'input', id);
  validateFieldList(definition.outputs, 'output', id);
  return true;
}

function snapshotDefinition(definition) {
  return immutableEngineeringSnapshot({
    ...definition,
    id: normalizeEngineeringCalculationId(definition.id),
  });
}

export function createEngineeringCalculationRegistry({ definitions = [] } = {}) {
  const registry = new Map();

  function register(definition) {
    validateEngineeringCalculationDefinition(definition);
    const id = normalizeEngineeringCalculationId(definition.id);
    if (registry.has(id)) throw definitionError('DUPLICATE_CALCULATION_ID', `Calculation already registered: ${id}`);
    registry.set(id, snapshotDefinition(definition));
    return registry.get(id);
  }

  function get(calculationId) {
    return registry.get(normalizeEngineeringCalculationId(calculationId)) ?? null;
  }

  function list(options = {}) {
    const family = options.family ? String(options.family).toUpperCase() : null;
    const rows = [...registry.values()].filter((definition) => !family || definition.family === family);
    return Object.freeze(rows.sort((a, b) => a.id.localeCompare(b.id)));
  }

  function listFamilies() {
    return Object.freeze(ENGINEERING_CALCULATION_FAMILIES.map((id) => Object.freeze({
      id,
      label: ENGINEERING_CALCULATION_FAMILY_LABELS[id],
      count: [...registry.values()].filter((definition) => definition.family === id).length,
    })));
  }

  for (const definition of definitions) register(definition);
  return Object.freeze({ register, get, has: (id) => Boolean(get(id)), list, listFamilies });
}
