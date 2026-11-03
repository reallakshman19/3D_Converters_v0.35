import {
  EMPIRICAL_WEIGHT_MODEL,
  createEmpiricalWeightEstimator,
  estimateEmpiricalWeight,
  lookupEmpiricalWeight,
  estimateEmpiricalWeightApproach1,
  estimateEmpiricalWeightApproach2,
} from '../../empirical-weight/index.js';
import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';

function qualification(candidate) {
  return composeEngineeringQualification({
    method: 'BENCHMARK_ONLY',
    data: candidate ? 'DRAFT' : 'BENCHMARK_ONLY',
    designAuthority: false,
    reasons: candidate
      ? ['SANDBOX_CANDIDATE_EMPIRICAL_DATA', 'EMPIRICAL_ESTIMATE_NOT_DESIGN_AUTHORITY']
      : ['EMPIRICAL_MODEL_BENCHMARK_QUALIFIED', 'EMPIRICAL_ESTIMATE_NOT_DESIGN_AUTHORITY'],
  });
}

function domainFailure(result, q) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      result?.error?.code || result?.code || 'CALCULATION_FAILED',
      result?.error?.message || result?.message || 'Empirical weight estimation failed.',
      result?.request ?? {},
    )],
    qualification: q,
    evidence: { domainResult: result },
  };
}

function selectRunner(input, runtime, deps) {
  const candidateModel = runtime.options.candidateModel ?? null;
  const candidateMasterRows = runtime.options.candidateMasterRows ?? null;
  const candidate = Boolean(candidateModel || candidateMasterRows);
  if (candidate && runtime.options.executionMode !== 'sandbox') {
    return { error: createEngineeringCalculationError('INPUT_INVALID', 'Candidate empirical model/master data may only be injected in sandbox mode.') };
  }
  if (!candidate) {
    const normal = {
      FINAL: (value) => deps.estimate(value, { allowExtrapolation: value.allowExtrapolation }),
      EXACT: deps.exact,
      A1: (value) => deps.approach1(value, { allowExtrapolation: value.allowExtrapolation }),
      A2: deps.approach2,
    };
    return { run: normal[input.approach], candidate: false, model: deps.model };
  }
  const estimator = deps.createEstimator({
    ...(candidateMasterRows ? { masterRows: candidateMasterRows } : {}),
    model: candidateModel ?? deps.model,
  });
  const candidateRunners = {
    FINAL: (value) => estimator.estimate(value, { allowExtrapolation: value.allowExtrapolation }),
    EXACT: estimator.exact,
    A1: (value) => estimator.approach1(value, { allowExtrapolation: value.allowExtrapolation }),
    A2: estimator.approach2,
  };
  return { run: candidateRunners[input.approach], candidate: true, model: estimator.model };
}

function definition(deps) {
  return {
    contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
    id: 'ESTIMATION.WEIGHT.EMPIRICAL',
    family: 'ESTIMATION',
    name: 'Empirical Component Weight Estimate',
    shortName: 'Empirical Weight',
    methodRevision: 'A1-A2-stacked-v1',
    purpose: 'Estimate component weight using exact master cells, size-band equations, and matrix-assisted stacked estimation.',
    authority: { calculationState: 'BENCHMARK_ONLY', qualificationState: 'BENCHMARK_ONLY', codeCompliance: false },
    applicability: { description: 'Validated component families/ratings/size bands represented by the empirical model and weight master.', limitations: ['Empirical estimate; not design authority.'] },
    inputs: [
      { key: 'target', label: 'Weight target', type: 'enum', required: true, values: ['RF/RTJ KG', 'BW KG'] },
      { key: 'typeDesc', label: 'Component type', type: 'string', required: true },
      { key: 'rating', label: 'Rating', type: 'number', required: true, quantity: 'dimensionless', canonicalUnit: null, minExclusive: 0 },
      { key: 'ns', label: 'Nominal size', type: 'number', quantity: 'dimensionless', canonicalUnit: null, minExclusive: 0 },
      { key: 'dn', label: 'DN', type: 'number', quantity: 'dimensionless', canonicalUnit: null, minExclusive: 0 },
      { key: 'approach', label: 'Approach', type: 'enum', values: ['FINAL', 'EXACT', 'A1', 'A2'], engineeringDefault: 'FINAL' },
      { key: 'allowExtrapolation', label: 'Allow A1 extrapolation', type: 'boolean', engineeringDefault: false },
    ],
    outputs: [
      { key: 'weightKg', label: 'Estimated weight', type: 'number', quantity: 'mass', canonicalUnit: 'kg' },
      { key: 'approach', label: 'Resolved approach', type: 'string' },
      { key: 'confidence', label: 'Confidence', type: 'string' },
      { key: 'modelId', label: 'Model ID', type: 'string' },
    ],
    validateInput(input) {
      if (input.ns || input.dn) return { ok: true, errors: [], warnings: [] };
      return { ok: false, errors: [createEngineeringCalculationError('INPUT_REQUIRED', 'NS is required, or DN must map to a known NS.', {}, 'ns')] };
    },
    calculate(input, runtime) {
      const runner = selectRunner(input, runtime, deps);
      if (runner.error) return { ok: false, errors: [runner.error], qualification: qualification(true) };
      const domainInput = {
        target: input.target,
        typeDesc: input.typeDesc,
        rating: input.rating,
        ...(input.ns ? { ns: input.ns } : {}),
        ...(input.dn ? { dn: input.dn } : {}),
      };
      const result = runner.run(domainInput);
      const q = qualification(runner.candidate);
      if (!result?.ok) return domainFailure(result, q);
      return {
        ok: true,
        outputs: {
          weightKg: result.weightKg,
          approach: result.approach,
          confidence: result.confidence,
          modelId: result.modelId,
          ...(result.predictions ? { predictions: result.predictions } : {}),
          ...(result.configuredWeights ? { configuredWeights: result.configuredWeights } : {}),
          ...(result.weights ? { effectiveWeights: result.weights } : {}),
          ...(result.support ? { support: result.support } : {}),
          ...(result.validatedRange ? { validatedRange: result.validatedRange } : {}),
        },
        intermediates: {},
        checks: [],
        assessment: null,
        qualification: q,
        provenance: {
          domainApi: `empirical-weight:${input.approach}`,
          modelSchemaVersion: runner.model?.schemaVersion ?? null,
          sourceMasterCommit: runner.model?.sourceMasterCommit ?? null,
          candidate: runner.candidate,
        },
        evidence: { domainResult: result },
      };
    },
  };
}

export function createEmpiricalWeightEngineeringCalculationDefinition({
  model = EMPIRICAL_WEIGHT_MODEL,
  createEstimator = createEmpiricalWeightEstimator,
  estimate = estimateEmpiricalWeight,
  exact = lookupEmpiricalWeight,
  approach1 = estimateEmpiricalWeightApproach1,
  approach2 = estimateEmpiricalWeightApproach2,
} = {}) {
  return definition({ model, createEstimator, estimate, exact, approach1, approach2 });
}

export const EMPIRICAL_WEIGHT_ENGINEERING_CALCULATION_DEFINITION = createEmpiricalWeightEngineeringCalculationDefinition();
