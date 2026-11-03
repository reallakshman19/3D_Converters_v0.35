export const FIT_PHYSICAL_DERIVATIONS = Object.freeze([
  Object.freeze({
    id: 'FIT-PHYS-001',
    output: 'insideDiameterM',
    formula: 'outsideDiameterM - 2 * wallThicknessM',
    inputs: Object.freeze(['outsideDiameterM', 'wallThicknessM']),
  }),
  Object.freeze({
    id: 'FIT-PHYS-002',
    output: 'flowAreaM2',
    formula: 'PI * insideDiameterM^2 / 4',
    inputs: Object.freeze(['insideDiameterM']),
  }),
  Object.freeze({
    id: 'FIT-PHYS-003',
    output: 'volumetricFlowM3S',
    formula: 'massFlowKgS / densityKgM3',
    inputs: Object.freeze(['massFlowKgS', 'densityKgM3']),
  }),
  Object.freeze({
    id: 'FIT-PHYS-004',
    output: 'meanVelocityMS',
    formula: 'volumetricFlowM3S / flowAreaM2',
    inputs: Object.freeze(['volumetricFlowM3S', 'flowAreaM2']),
  }),
]);

const REQUIRED_FIELDS = Object.freeze([
  ['outsideDiameterM', 'positive'],
  ['wallThicknessM', 'positive'],
  ['massFlowKgS', 'nonNegative'],
  ['densityKgM3', 'positive'],
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function inputError(code, field, message, details = {}) {
  return deepFreeze({ code, field, message, details });
}

function validateNumber(input, field, rule, errors) {
  if (!Object.hasOwn(input, field) || input[field] === null || input[field] === undefined) {
    errors.push(inputError('FIT_INPUT_REQUIRED', field, `${field} is required.`));
    return false;
  }
  const value = input[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(inputError('FIT_INPUT_INVALID', field, `${field} must be a finite number.`));
    return false;
  }
  if (rule === 'positive' && value <= 0) {
    errors.push(inputError('FIT_INPUT_INVALID', field, `${field} must be greater than zero.`, { value }));
    return false;
  }
  if (rule === 'nonNegative' && value < 0) {
    errors.push(inputError('FIT_INPUT_INVALID', field, `${field} must be zero or greater.`, { value }));
    return false;
  }
  return true;
}

export function validateFitPhysicalInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return deepFreeze({
      ok: false,
      errors: [inputError('FIT_INPUT_INVALID', null, 'FIT physical input must be an object.')],
    });
  }

  const errors = [];
  const valid = new Map();
  for (const [field, rule] of REQUIRED_FIELDS) {
    valid.set(field, validateNumber(input, field, rule, errors));
  }

  if (input.maximumUnsupportedSpanM !== undefined && input.maximumUnsupportedSpanM !== null) {
    validateNumber(input, 'maximumUnsupportedSpanM', 'positive', errors);
  }

  if (valid.get('outsideDiameterM') && valid.get('wallThicknessM')) {
    if (2 * input.wallThicknessM >= input.outsideDiameterM) {
      errors.push(inputError(
        'FIT_INPUT_INVALID',
        'wallThicknessM',
        'Pipe wall thickness must leave a positive inside diameter.',
        { outsideDiameterM: input.outsideDiameterM, wallThicknessM: input.wallThicknessM },
      ));
    }
  }

  return deepFreeze({ ok: errors.length === 0, errors });
}

function derivationEvidence(derivation) {
  return deepFreeze({
    id: derivation.id,
    authority: 'DERIVED_PHYSICS',
    output: derivation.output,
    formula: derivation.formula,
    inputs: [...derivation.inputs],
  });
}

export function resolveFitPhysicalContext(input = {}) {
  const validation = validateFitPhysicalInput(input);
  if (!validation.ok) return deepFreeze({ ok: false, errors: validation.errors });

  const insideDiameterM = input.outsideDiameterM - 2 * input.wallThicknessM;
  const flowAreaM2 = Math.PI * insideDiameterM ** 2 / 4;
  const volumetricFlowM3S = input.massFlowKgS / input.densityKgM3;
  const meanVelocityMS = volumetricFlowM3S / flowAreaM2;

  const canonicalInput = {
    outsideDiameterM: input.outsideDiameterM,
    wallThicknessM: input.wallThicknessM,
    massFlowKgS: input.massFlowKgS,
    densityKgM3: input.densityKgM3,
  };
  if (input.maximumUnsupportedSpanM !== undefined && input.maximumUnsupportedSpanM !== null) {
    canonicalInput.maximumUnsupportedSpanM = input.maximumUnsupportedSpanM;
  }

  return deepFreeze({
    ok: true,
    canonicalInput,
    derived: {
      insideDiameterM,
      flowAreaM2,
      volumetricFlowM3S,
      meanVelocityMS,
    },
    evidence: FIT_PHYSICAL_DERIVATIONS.map(derivationEvidence),
    authority: 'PHYSICAL_CONTEXT_ONLY',
  });
}
