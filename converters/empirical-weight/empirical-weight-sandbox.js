import { DEFAULT_WEIGHT_MASTER_ROWS } from '../xml-cii2019-core/default-weight-master-rows.js';
import { createEmpiricalWeightEstimator } from './empirical-weight-estimator.js';
import { EMPIRICAL_WEIGHT_MODEL } from './empirical-weight-model.js';

const TARGETS = Object.freeze(['RF/RTJ KG', 'BW KG']);

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
}

function uniqueSortedText(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function availableTypes(model, masterRows, target) {
  return uniqueSortedText([
    ...(model.approach1?.models || [])
      .filter((row) => row.target === target)
      .map((row) => row.typeDesc),
    ...masterRows
      .filter((row) => finitePositive(row[target]))
      .map((row) => row.TypeDesc),
  ]);
}

function ratingsFor(model, masterRows, target, typeDesc) {
  return uniqueSortedNumbers([
    ...(model.approach1?.models || [])
      .filter((row) => row.target === target && row.typeDesc === typeDesc)
      .map((row) => row.rating),
    ...masterRows
      .filter((row) => row.TypeDesc === typeDesc && finitePositive(row[target]))
      .map((row) => row.Rating),
  ]);
}

function sizesFor(masterRows, target, typeDesc, rating) {
  return uniqueSortedNumbers(
    masterRows
      .filter((row) =>
        row.TypeDesc === typeDesc &&
        Number(row.Rating) === Number(rating) &&
        finitePositive(row.NS) &&
        finitePositive(row[target])
      )
      .map((row) => row.NS)
  );
}

/**
 * Returns real production choices for the empirical-weight Sandbox.
 * Choices come from the frozen model + built-in weight master; no synthetic
 * size/rating options are invented by the UI.
 */
export function listEmpiricalWeightSandboxOptions({
  masterRows = DEFAULT_WEIGHT_MASTER_ROWS,
  model = EMPIRICAL_WEIGHT_MODEL,
  target = 'RF/RTJ KG',
  typeDesc = null,
  rating = null,
} = {}) {
  const targets = TARGETS.filter((name) =>
    (model.approach1?.models || []).some((row) => row.target === name) ||
    masterRows.some((row) => finitePositive(row[name]))
  );
  const selectedTarget = targets.includes(target) ? target : targets[0] || 'RF/RTJ KG';
  const types = availableTypes(model, masterRows, selectedTarget);
  const selectedType = types.includes(typeDesc) ? typeDesc : types[0] || null;
  const ratings = selectedType ? ratingsFor(model, masterRows, selectedTarget, selectedType) : [];
  const numericRating = Number(rating);
  const selectedRating = ratings.includes(numericRating) ? numericRating : ratings[0] ?? null;
  const sizes = selectedType && selectedRating != null
    ? sizesFor(masterRows, selectedTarget, selectedType, selectedRating)
    : [];

  return {
    targets,
    types,
    ratings,
    sizes,
    selected: {
      target: selectedTarget,
      typeDesc: selectedType,
      rating: selectedRating,
      ns: sizes[0] ?? null,
    },
  };
}

function compactResult(result) {
  if (!result?.ok) {
    return {
      ok: false,
      code: result?.error?.code || result?.code || 'UNAVAILABLE',
      message: result?.error?.message || result?.message || 'Estimate unavailable.',
    };
  }
  return {
    ok: true,
    weightKg: Number(result.weightKg),
    approach: result.approach,
    confidence: result.confidence || null,
    modelId: result.modelId || null,
    predictions: result.predictions || null,
    configuredWeights: result.configuredWeights || null,
    weights: result.weights || null,
    support: result.support || null,
    coefficients: result.coefficients || null,
    validatedRange: result.validatedRange || null,
    bandRange: result.bandRange || null,
  };
}

function evaluateOne(estimator, input) {
  return {
    exact: compactResult(estimator.exact(input)),
    approach1: compactResult(estimator.approach1(input)),
    approach2: compactResult(estimator.approach2(input)),
    final: compactResult(estimator.estimate(input)),
  };
}

function delta(active, candidate) {
  if (!active?.ok || !candidate?.ok) return null;
  const kg = candidate.weightKg - active.weightKg;
  return {
    kg,
    pct: active.weightKg ? kg / active.weightKg : null,
  };
}

/**
 * Runs the same request through every published empirical path for both the
 * frozen active model and an optional tuning candidate.
 */
export function evaluateEmpiricalWeightSandbox({
  input,
  activeModel = EMPIRICAL_WEIGHT_MODEL,
  candidateModel = activeModel,
  masterRows = DEFAULT_WEIGHT_MASTER_ROWS,
} = {}) {
  const request = {
    target: input?.target,
    typeDesc: input?.typeDesc,
    rating: Number(input?.rating),
    ns: Number(input?.ns),
  };
  const activeEstimator = createEmpiricalWeightEstimator({ masterRows, model: activeModel });
  const candidateEstimator = createEmpiricalWeightEstimator({ masterRows, model: candidateModel });
  const active = evaluateOne(activeEstimator, request);
  const candidate = evaluateOne(candidateEstimator, request);

  return {
    input: request,
    active,
    candidate,
    delta: {
      exact: delta(active.exact, candidate.exact),
      approach1: delta(active.approach1, candidate.approach1),
      approach2: delta(active.approach2, candidate.approach2),
      final: delta(active.final, candidate.final),
    },
  };
}
