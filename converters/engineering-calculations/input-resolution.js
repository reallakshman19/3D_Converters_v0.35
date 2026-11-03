import {
  cloneEngineeringValue,
  createEngineeringCalculationError,
  immutableEngineeringSnapshot,
} from './contracts.js';
import { convertEngineeringUnit, engineeringUnitError } from './units.js';

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function normalizeScalar(field, value) {
  if (field.type === 'number' || !field.type) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError('must be a finite number');
    return number;
  }
  if (field.type === 'integer') {
    const number = Number(value);
    if (!Number.isInteger(number)) throw new TypeError('must be an integer');
    return number;
  }
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw new TypeError('must be boolean');
    return value;
  }
  if (field.type === 'string') return String(value);
  if (field.type === 'enum') {
    if (!field.values?.includes(value)) throw new TypeError(`must be one of: ${(field.values ?? []).join(', ')}`);
    return value;
  }
  return null;
}

function normalizeVector3(value) {
  const array = Array.isArray(value) ? value : [value?.x, value?.y, value?.z];
  if (array.length !== 3 || array.some((item) => !Number.isFinite(Number(item)))) {
    throw new TypeError('must contain three finite components');
  }
  return array.map(Number);
}

function normalizeFieldValue(field, value, unit) {
  if (field.type === 'vector3') return normalizeVector3(value);
  if (field.type === 'object' || field.type === 'table') return cloneEngineeringValue(value);
  const scalar = normalizeScalar(field, value);
  if (!['number', 'integer'].includes(field.type ?? 'number') || !field.quantity || field.quantity === 'dimensionless') return scalar;
  return convertEngineeringUnit(scalar, field.quantity, unit, field.canonicalUnit, {
    pressureReference: field.pressureReference ?? null,
  });
}

function validateRange(field, value) {
  const errors = [];
  if (!Number.isFinite(value)) return errors;
  if (field.min !== undefined && value < field.min) errors.push(`must be >= ${field.min}`);
  if (field.minExclusive !== undefined && value <= field.minExclusive) errors.push(`must be > ${field.minExclusive}`);
  if (field.max !== undefined && value > field.max) errors.push(`must be <= ${field.max}`);
  if (field.maxExclusive !== undefined && value >= field.maxExclusive) errors.push(`must be < ${field.maxExclusive}`);
  return errors;
}

function runDefinitionResolver(definition, inputs, context, options) {
  if (typeof definition.resolveInputs !== 'function') return { inputs, provenance: {}, warnings: [] };
  const result = definition.resolveInputs(
    immutableEngineeringSnapshot(inputs),
    immutableEngineeringSnapshot(context ?? {}),
    immutableEngineeringSnapshot(options ?? {}),
  );
  if (result?.ok === false) return result;
  if (result?.inputs) return { inputs: result.inputs, provenance: result.provenance ?? {}, warnings: result.warnings ?? [] };
  return { inputs: result ?? inputs, provenance: {}, warnings: [] };
}

export function resolveEngineeringInputsForDefinition(definition, rawInput = {}, inputUnits = {}, context = {}, options = {}) {
  const resolvedSource = runDefinitionResolver(definition, rawInput, context, options);
  if (resolvedSource?.ok === false) return resolvedSource;
  const sourceInputs = resolvedSource.inputs ?? rawInput;
  const canonicalInput = {};
  const resolvedInputs = {};
  const errors = [];

  for (const field of definition.inputs) {
    const callerProvided = hasOwn(sourceInputs, field.key) && sourceInputs[field.key] !== undefined;
    const hasDefault = field.engineeringDefault !== undefined && field.engineeringDefault !== null;
    if (!callerProvided && !hasDefault) {
      if (field.required) errors.push(createEngineeringCalculationError('INPUT_REQUIRED', `${field.label ?? field.key} is required.`, {}, field.key));
      continue;
    }
    const rawValue = callerProvided ? sourceInputs[field.key] : field.engineeringDefault;
    const fromUnit = inputUnits[field.key] ?? field.canonicalUnit ?? null;
    try {
      const canonicalValue = normalizeFieldValue(field, rawValue, fromUnit);
      for (const message of validateRange(field, canonicalValue)) errors.push(createEngineeringCalculationError('INPUT_INVALID', `${field.label ?? field.key} ${message}.`, {}, field.key));
      canonicalInput[field.key] = canonicalValue;
      resolvedInputs[field.key] = {
        key: field.key,
        value: cloneEngineeringValue(rawValue),
        unit: fromUnit,
        canonicalValue: cloneEngineeringValue(canonicalValue),
        canonicalUnit: field.canonicalUnit ?? null,
        source: resolvedSource.provenance?.[field.key] ?? { type: callerProvided ? 'CALLER' : 'ENGINEERING_DEFAULT' },
        transformation: fromUnit && field.canonicalUnit && fromUnit !== field.canonicalUnit ? `${fromUnit}->${field.canonicalUnit}` : null,
        overridden: Boolean(resolvedSource.provenance?.[field.key]?.type === 'CALLER_OVERRIDE'),
      };
    } catch (error) {
      errors.push(error?.code === 'INPUT_UNIT_UNSUPPORTED'
        ? engineeringUnitError(error, field.key)
        : createEngineeringCalculationError('INPUT_INVALID', `${field.label ?? field.key} ${error.message}.`, {}, field.key));
    }
  }

  const base = { ok: errors.length === 0, canonicalInput, resolvedInputs, errors, warnings: [...(resolvedSource.warnings ?? [])] };
  if (!base.ok || typeof definition.validateInput !== 'function') return base;
  const custom = definition.validateInput(immutableEngineeringSnapshot(canonicalInput), {
    context: immutableEngineeringSnapshot(context ?? {}),
    options: immutableEngineeringSnapshot(options ?? {}),
    resolvedInputs: immutableEngineeringSnapshot(resolvedInputs),
  }) ?? {};
  const customErrors = custom.errors ?? [];
  return {
    ...base,
    ok: custom.ok !== false && customErrors.length === 0,
    errors: [...errors, ...customErrors],
    warnings: [...base.warnings, ...(custom.warnings ?? [])],
    applicability: custom.applicability ?? null,
  };
}

export function validateEngineeringInputsForDefinition(definition, input = {}, options = {}) {
  const result = resolveEngineeringInputsForDefinition(
    definition,
    input,
    options.inputUnits ?? {},
    options.context ?? {},
    options,
  );
  return immutableEngineeringSnapshot({
    ok: result.ok,
    errors: result.errors ?? [],
    warnings: result.warnings ?? [],
    applicability: result.applicability ?? null,
  });
}
