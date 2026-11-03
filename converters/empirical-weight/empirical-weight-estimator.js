import { DEFAULT_WEIGHT_MASTER_ROWS } from '../xml-cii2019-core/default-weight-master-rows.js';
import { EMPIRICAL_WEIGHT_MODEL } from './empirical-weight-model.js';
import {
  buildEmpiricalWeightCatalog,
  estimateCollaborativeRatio,
  estimateCrossRatio,
  lookupExactCatalogWeight,
} from './empirical-weight-matrix.js';

const POSITIVE = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const TARGET_ALIASES = new Map([
  ['RF', 'RF/RTJ KG'], ['RTJ', 'RF/RTJ KG'], ['RF/RTJ', 'RF/RTJ KG'], ['RF/RTJ KG', 'RF/RTJ KG'],
  ['BW', 'BW KG'], ['BW KG', 'BW KG'], ['BUTT WELD', 'BW KG'], ['BUTTWELD', 'BW KG'],
]);

function targetOf(input = {}) {
  const raw = String(input.target ?? input.endType ?? '').trim().toUpperCase();
  if (TARGET_ALIASES.has(raw)) return TARGET_ALIASES.get(raw);
  return raw.includes('BW') ? 'BW KG' : 'RF/RTJ KG';
}

function fail(code, message, details = {}) {
  return { ok: false, error: { code, message }, ...details };
}

function buildFamilyLookup(model) {
  const lookup = new Map();
  for (const row of model.approach1.models) lookup.set(row.typeDesc.toLowerCase(), row.typeDesc);
  return lookup;
}

function buildA1Index(model) {
  const index = new Map();
  for (const row of model.approach1.models) {
    const key = `${row.target}|||${row.typeDesc}|||${row.rating}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  for (const rows of index.values()) rows.sort((a, b) => a.band - b.band);
  return index;
}

function evaluateA1Model(row, size) {
  const logSize = Math.log(size);
  if (row.model === 'LOG1') return Math.exp(row.a + row.b * logSize);
  if (row.model === 'LOG2') return Math.exp(row.a + row.b * logSize + row.c * logSize * logSize);
  if (row.model === 'RAW1') return row.a + row.b * size;
  return row.a + row.b * size + row.c * size * size;
}

function selectBand(rows, size, allowExtrapolation) {
  if (!rows?.length) return null;
  const groupMin = Math.min(...rows.map((row) => row.nsMin));
  const groupMax = Math.max(...rows.map((row) => row.nsMax));
  const inRange = size >= groupMin && size <= groupMax;
  if (!inRange && !allowExtrapolation) return { row: null, groupMin, groupMax, inRange };

  let row = rows.find((candidate) => {
    const lowerOk = candidate.lowerCut == null || size > candidate.lowerCut;
    const upperOk = candidate.upperCut == null || size <= candidate.upperCut;
    return lowerOk && upperOk;
  });
  if (!row && allowExtrapolation) row = size < groupMin ? rows[0] : rows.at(-1);
  return { row, groupMin, groupMax, inRange };
}

function normalizedWeights(configured, predictions) {
  const entries = [
    ['band', configured?.[0], predictions.band],
    ['ratio', configured?.[1], predictions.ratio],
    ['cross', configured?.[2], predictions.cross],
  ].filter(([, weight, prediction]) => POSITIVE(weight) && POSITIVE(prediction));
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!(total > 0)) return null;
  return Object.fromEntries(entries.map(([name, weight]) => [name, weight / total]));
}

function geometricStack(predictions, weights) {
  const terms = Object.entries(weights ?? {}).filter(([name]) => POSITIVE(predictions[name]));
  if (!terms.length) return null;
  return Math.exp(terms.reduce((sum, [name, weight]) => sum + weight * Math.log(predictions[name]), 0));
}

export function createEmpiricalWeightEstimator({
  masterRows = DEFAULT_WEIGHT_MASTER_ROWS,
  model = EMPIRICAL_WEIGHT_MODEL,
} = {}) {
  const catalog = buildEmpiricalWeightCatalog(masterRows);
  const familyLookup = buildFamilyLookup(model);
  const a1Index = buildA1Index(model);
  const constants = model.approach2.constants;

  function normalize(input = {}) {
    const rawType = String(input.typeDesc ?? input.TypeDesc ?? input.valveType ?? '').trim();
    const typeDesc = familyLookup.get(rawType.toLowerCase()) ?? rawType;
    if (!typeDesc || !familyLookup.has(typeDesc.toLowerCase())) {
      return fail('UNKNOWN_TYPE_DESC', 'A canonical TypeDesc is required.', { typeDesc: rawType || null });
    }
    const rating = POSITIVE(input.rating ?? input.Rating);
    if (!rating) return fail('INVALID_RATING', 'Rating must be a positive number.', { typeDesc });

    let size = POSITIVE(input.ns ?? input.NS);
    let sizeSource = size ? 'NS' : null;
    if (!size) {
      const dn = POSITIVE(input.dn ?? input.DN);
      const mappedNs = dn ? catalog.dnToNs.get(dn) : null;
      if (mappedNs) { size = mappedNs; sizeSource = 'DN_TO_NS'; }
    }
    if (!size) return fail('INVALID_SIZE', 'NS is required, or DN must map to a known NS.', { typeDesc, rating });
    return { ok: true, typeDesc, rating, size, sizeSource, target: targetOf(input) };
  }

  function approach1(input = {}, options = {}) {
    const request = normalize(input);
    if (!request.ok) return request;
    const key = `${request.target}|||${request.typeDesc}|||${request.rating}`;
    const selected = selectBand(a1Index.get(key), request.size, options.allowExtrapolation === true);
    if (!selected?.row) {
      return fail(
        selected ? 'OUTSIDE_VALIDATED_SIZE_RANGE' : 'A1_MODEL_NOT_FOUND',
        selected ? `Size ${request.size} is outside the validated Approach 1 range.` : 'No Approach 1 model exists for this family/rating/target.',
        { ...request, validatedRange: selected ? [selected.groupMin, selected.groupMax] : null }
      );
    }
    const weightKg = evaluateA1Model(selected.row, request.size);
    if (!POSITIVE(weightKg)) return fail('NONPOSITIVE_MODEL_RESULT', 'Approach 1 produced a non-positive result.', request);
    return {
      ...request,
      ok: true,
      weightKg,
      approach: selected.inRange ? 'A1_SIZE_BAND' : 'EXTRAPOLATED',
      confidence: selected.inRange ? 'EQUATION' : 'LOW',
      extrapolated: !selected.inRange,
      modelId: `A1|${request.target}|${request.typeDesc}|${request.rating}|B${selected.row.band}`,
      model: selected.row.model,
      coefficients: { a: selected.row.a, b: selected.row.b, c: selected.row.c },
      validatedRange: [selected.groupMin, selected.groupMax],
      bandRange: [selected.row.nsMin, selected.row.nsMax],
      bandCuts: [selected.row.lowerCut, selected.row.upperCut],
    };
  }

  function exact(input = {}) {
    const request = normalize(input);
    if (!request.ok) return request;
    const weightKg = lookupExactCatalogWeight(catalog, request.target, request.typeDesc, request.size, request.rating);
    return POSITIVE(weightKg)
      ? { ...request, ok: true, weightKg, approach: 'EXACT', confidence: 'EXACT', modelId: 'MASTER_CELL' }
      : fail('EXACT_CELL_NOT_FOUND', 'No exact master cell exists.', request);
  }

  function approach2(input = {}) {
    const request = normalize(input);
    if (!request.ok) return request;
    const configured = model.approach2.stackWeights?.[request.target]?.[request.typeDesc];
    if (!configured) return fail('A2_WEIGHTS_NOT_FOUND', 'No Approach 2 stack weights exist for this family/target.', request);

    const bandResult = approach1(input, { allowExtrapolation: false });
    const ratioResult = estimateCollaborativeRatio(catalog, request.target, request.typeDesc, request.size, request.rating, constants);
    const crossResult = estimateCrossRatio(catalog, request.target, request.typeDesc, request.size, request.rating, constants);
    if (!ratioResult && !crossResult) return fail('NO_MATRIX_SUPPORT', 'Approach 2 requires at least one matrix estimator.', request);

    const predictions = {
      band: bandResult.ok ? bandResult.weightKg : null,
      ratio: ratioResult?.prediction ?? null,
      cross: crossResult?.prediction ?? null,
    };
    const weights = normalizedWeights(configured, predictions);
    const weightKg = geometricStack(predictions, weights);
    if (!POSITIVE(weightKg)) return fail('A2_STACK_UNAVAILABLE', 'No positive Approach 2 stack could be formed.', request);

    const matrixPredictors = Number(Boolean(ratioResult)) + Number(Boolean(crossResult));
    return {
      ...request,
      ok: true,
      weightKg,
      approach: 'A2_MATRIX',
      confidence: matrixPredictors === 2 ? 'HIGH' : 'MEDIUM',
      modelId: `A2|${request.target}|${request.typeDesc}`,
      predictions,
      configuredWeights: { band: configured[0], ratio: configured[1], cross: configured[2] },
      weights,
      support: {
        ratioMethod: ratioResult?.method ?? null,
        ratioAnchors: ratioResult?.anchorCount ?? 0,
        crossRectangles: crossResult?.rectangleCount ?? 0,
      },
    };
  }

  function estimate(input = {}, options = {}) {
    if (options.exact !== false) {
      const exactResult = exact(input);
      if (exactResult.ok) return exactResult;
      if (!['EXACT_CELL_NOT_FOUND'].includes(exactResult.error?.code)) return exactResult;
    }
    const matrixResult = approach2(input);
    if (matrixResult.ok) return matrixResult;
    if (!['NO_MATRIX_SUPPORT', 'A2_WEIGHTS_NOT_FOUND'].includes(matrixResult.error?.code)) return matrixResult;
    const bandResult = approach1(input, { allowExtrapolation: false });
    if (bandResult.ok) return bandResult;
    if (options.allowExtrapolation === true) return approach1(input, { allowExtrapolation: true });
    return fail('NO_ESTIMATE', 'No exact, matrix-assisted, or in-range size-band estimate is available.', {
      request: normalize(input), matrixError: matrixResult.error, bandError: bandResult.error,
    });
  }

  return Object.freeze({ estimate, exact, approach1, approach2, model, masterRows });
}

const DEFAULT_ESTIMATOR = createEmpiricalWeightEstimator();
export const estimateEmpiricalWeight = (input, options) => DEFAULT_ESTIMATOR.estimate(input, options);
export const lookupEmpiricalWeight = (input) => DEFAULT_ESTIMATOR.exact(input);
export const estimateEmpiricalWeightApproach1 = (input, options) => DEFAULT_ESTIMATOR.approach1(input, options);
export const estimateEmpiricalWeightApproach2 = (input) => DEFAULT_ESTIMATOR.approach2(input);
