const EPSILON = 1e-9;

export function cloneEmpiricalWeightModel(model) {
  if (typeof structuredClone === 'function') return structuredClone(model);
  return JSON.parse(JSON.stringify(model));
}

function issue(code, message, path, value) {
  return { code, message, path, value };
}

function finite(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return Number.isFinite(Number(value));
}

export function validateEmpiricalWeightTuningModel(model) {
  const errors = [];
  const warnings = [];
  if (!model || typeof model !== 'object') {
    return { ok: false, errors: [issue('MODEL_REQUIRED', 'Model must be an object.', '', model)], warnings, stats: {} };
  }

  const constants = model.approach2?.constants;
  if (!constants || typeof constants !== 'object') {
    errors.push(issue('A2_CONSTANTS_REQUIRED', 'Approach 2 constants are required.', 'approach2.constants', constants));
  } else {
    for (const [name, raw] of Object.entries(constants)) {
      if (!finite(raw)) {
        errors.push(issue('INVALID_CONSTANT', 'Tuning constant must be finite.', `approach2.constants.${name}`, raw));
        continue;
      }
      const value = Number(raw);
      if (['ratioRegressionWeight', 'ratioSideMedianWeight', 'crossTrimQuantile', 'metaSimplexStep'].includes(name)) {
        if (value < 0 || value > 1) errors.push(issue('CONSTANT_OUT_OF_RANGE', 'Constant must be between 0 and 1.', `approach2.constants.${name}`, value));
      } else if (value <= 0) {
        errors.push(issue('NONPOSITIVE_CONSTANT', 'Constant must be positive.', `approach2.constants.${name}`, value));
      }
      if (['ratioOneSidedMaxPoints', 'sameRatingNearestPoints', 'crossNearestRectangles', 'metaFolds', 'metaSeed'].includes(name) && !Number.isInteger(value)) {
        errors.push(issue('INTEGER_CONSTANT_REQUIRED', 'Constant must be an integer.', `approach2.constants.${name}`, value));
      }
    }
    const regression = finite(constants.ratioRegressionWeight) ? Number(constants.ratioRegressionWeight) : NaN;
    const median = finite(constants.ratioSideMedianWeight) ? Number(constants.ratioSideMedianWeight) : NaN;
    if (Number.isFinite(regression) && Number.isFinite(median) && Math.abs(regression + median - 1) > EPSILON) {
      errors.push(issue('RATIO_BLEND_SUM', 'ratioRegressionWeight + ratioSideMedianWeight must equal 1.', 'approach2.constants', regression + median));
    }
  }

  let stackRowCount = 0;
  for (const [target, families] of Object.entries(model.approach2?.stackWeights || {})) {
    for (const [typeDesc, weights] of Object.entries(families || {})) {
      stackRowCount += 1;
      const path = `approach2.stackWeights.${target}.${typeDesc}`;
      if (!Array.isArray(weights) || weights.length !== 3 || weights.some((value) => !finite(value) || Number(value) < 0)) {
        errors.push(issue('INVALID_STACK_WEIGHTS', 'Stack weights must contain three non-negative finite values.', path, weights));
        continue;
      }
      const total = weights.reduce((sum, value) => sum + Number(value), 0);
      if (!(total > 0)) errors.push(issue('EMPTY_STACK', 'At least one stack weight must be positive.', path, weights));
      else if (Math.abs(total - 1) > 1e-6) errors.push(issue('STACK_SUM', 'Stack weights must sum to 1 before runtime renormalization.', path, total));
    }
  }

  let a1RowCount = 0;
  for (const [index, row] of (model.approach1?.models || []).entries()) {
    a1RowCount += 1;
    const base = `approach1.models.${index}`;
    if (!row?.typeDesc || !row?.target || !finite(row.rating) || !finite(row.band)) errors.push(issue('INVALID_A1_IDENTITY', 'Approach 1 row is missing identity fields.', base, row));
    if (!finite(row.nsMin) || !finite(row.nsMax) || Number(row.nsMin) <= 0 || Number(row.nsMax) < Number(row.nsMin)) errors.push(issue('INVALID_A1_RANGE', 'Approach 1 size range is invalid.', `${base}.nsMin/nsMax`, [row?.nsMin, row?.nsMax]));
    for (const key of ['a', 'b']) if (!finite(row?.[key])) errors.push(issue('INVALID_A1_COEFFICIENT', `${key} must be finite.`, `${base}.${key}`, row?.[key]));
    if (['LOG2', 'RAW2'].includes(row?.model) && !finite(row?.c)) errors.push(issue('INVALID_A1_COEFFICIENT', 'c must be finite for quadratic models.', `${base}.c`, row?.c));
  }

  if (!stackRowCount) warnings.push(issue('NO_STACK_WEIGHTS', 'No Approach 2 stack weights are configured.', 'approach2.stackWeights', null));
  if (!a1RowCount) warnings.push(issue('NO_A1_MODELS', 'No Approach 1 models are configured.', 'approach1.models', null));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      approach1Rows: a1RowCount,
      approach2StackRows: stackRowCount,
      approach2Constants: Object.keys(constants || {}).length,
    },
  };
}

function findA1Row(model, selector = {}) {
  return (model.approach1?.models || []).find((row) =>
    row.target === selector.target &&
    row.typeDesc === selector.typeDesc &&
    Number(row.rating) === Number(selector.rating) &&
    Number(row.band) === Number(selector.band)
  );
}

export function createEmpiricalWeightTuningSession(activeModel) {
  const baseline = cloneEmpiricalWeightModel(activeModel);
  let candidate = cloneEmpiricalWeightModel(activeModel);

  function snapshot() { return cloneEmpiricalWeightModel(candidate); }
  function isDirty() { return JSON.stringify(candidate) !== JSON.stringify(baseline); }
  function validation() { return validateEmpiricalWeightTuningModel(candidate); }
  function replace(next) { candidate = cloneEmpiricalWeightModel(next); return snapshot(); }
  function revert() { candidate = cloneEmpiricalWeightModel(baseline); return snapshot(); }

  function updateConstant(name, value) {
    if (!(name in (candidate.approach2?.constants || {}))) throw new Error(`Unknown Approach 2 constant: ${name}`);
    candidate.approach2.constants[name] = value === '' || value == null ? null : Number(value);
    return validation();
  }

  function updateStackWeights(target, typeDesc, weights) {
    if (!candidate.approach2?.stackWeights?.[target]?.[typeDesc]) throw new Error(`Unknown stack row: ${target} / ${typeDesc}`);
    candidate.approach2.stackWeights[target][typeDesc] = weights.map((value) => value === '' || value == null ? null : Number(value));
    return validation();
  }

  function updateA1Coefficient(selector, coefficient, value) {
    if (!['a', 'b', 'c'].includes(coefficient)) throw new Error(`Unsupported coefficient: ${coefficient}`);
    const row = findA1Row(candidate, selector);
    if (!row) throw new Error('Approach 1 row not found.');
    row[coefficient] = value === '' || value == null ? null : Number(value);
    return validation();
  }

  return Object.freeze({ snapshot, isDirty, validation, replace, revert, updateConstant, updateStackWeights, updateA1Coefficient });
}
