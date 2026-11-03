import {
  ENGINEERING_CALCULATION_BATCH_VERSION,
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  ENGINEERING_CALCULATION_RESULT_VERSION,
  cloneEngineeringValue,
  createEngineeringCalculationError,
  immutableEngineeringSnapshot,
  normalizeEngineeringCalculationId,
  normalizeThrownEngineeringError,
} from './contracts.js';
import { composeEngineeringQualification } from './qualification.js';
import {
  resolveEngineeringInputsForDefinition,
  validateEngineeringInputsForDefinition,
} from './input-resolution.js';

const NON_EXECUTABLE_STATES = new Set(['CONCEPT', 'SOURCE_INVENTORIED', 'METHOD_SPECIFIED', 'BLOCKED']);

function methodState(definition) {
  return definition.authority?.qualificationState ?? definition.authority?.calculationState ?? 'CONCEPT';
}

function defaultQualification(definition) {
  return composeEngineeringQualification({
    method: methodState(definition),
    data: 'DRAFT',
    designAuthority: false,
    reasons: ['CALCULATOR_DID_NOT_DECLARE_DATA_QUALIFICATION'],
  });
}

function normalizeKernelFailure(result) {
  if (Array.isArray(result?.errors) && result.errors.length) return result.errors;
  if (result?.error?.code) return [result.error];
  if (result?.code) return [createEngineeringCalculationError(result.code, result.message ?? 'Calculation failed.', result.details ?? {})];
  return [createEngineeringCalculationError('CALCULATION_FAILED', 'Calculation returned an unsuccessful result.')];
}

function applicabilityFor(definition, override = null) {
  if (override) return override;
  return { applicable: true, limitations: [...(definition.applicability?.limitations ?? [])] };
}

export function createEngineeringCalculationEngine({
  registry,
  implementationRevision = 'runtime',
  clock = () => new Date().toISOString(),
} = {}) {
  if (!registry?.get || !registry?.list) throw new TypeError('A calculation registry is required.');
  let executionCounter = 0;

  function executionInfo(definition) {
    const timestamp = clock();
    executionCounter += 1;
    return {
      executionId: `ENG-${timestamp}-${executionCounter}`,
      timestamp,
      implementationRevision: definition?.implementationVersion ?? implementationRevision,
    };
  }

  function failureEnvelope(definition, calculationId, errors, request = {}, extra = {}) {
    return immutableEngineeringSnapshot({
      contractVersion: ENGINEERING_CALCULATION_RESULT_VERSION,
      ok: false,
      calculationId: normalizeEngineeringCalculationId(calculationId),
      family: definition?.family ?? null,
      methodRevision: definition?.methodRevision ?? null,
      execution: executionInfo(definition),
      applicability: extra.applicability ?? { applicable: false, limitations: [] },
      inputs: cloneEngineeringValue(request.inputs ?? {}),
      resolvedInputs: cloneEngineeringValue(extra.resolvedInputs ?? {}),
      checks: [],
      warnings: cloneEngineeringValue(extra.warnings ?? []),
      errors: cloneEngineeringValue(errors),
      qualification: extra.qualification ?? (definition ? defaultQualification(definition) : null),
      provenance: cloneEngineeringValue(extra.provenance ?? {}),
      evidence: cloneEngineeringValue(extra.evidence ?? {}),
    });
  }

  function getDefinition(calculationId) {
    return registry.get(calculationId);
  }

  function resolve(calculationId, input = {}, context = {}, options = {}) {
    const definition = getDefinition(calculationId);
    if (!definition) return { ok: false, errors: [createEngineeringCalculationError('CALCULATION_NOT_REGISTERED', `Calculation not registered: ${calculationId}`)] };
    return resolveEngineeringInputsForDefinition(definition, input, options.inputUnits ?? {}, context, options);
  }

  function validate(calculationId, input = {}, options = {}) {
    const definition = getDefinition(calculationId);
    if (!definition) return immutableEngineeringSnapshot({ ok: false, errors: [createEngineeringCalculationError('CALCULATION_NOT_REGISTERED', `Calculation not registered: ${calculationId}`)], warnings: [] });
    return validateEngineeringInputsForDefinition(definition, input, options);
  }

  function calculate(request = {}) {
    const calculationId = normalizeEngineeringCalculationId(request.calculationId);
    if (request.contractVersion && request.contractVersion !== ENGINEERING_CALCULATION_CONTRACT_VERSION) {
      return failureEnvelope(null, calculationId, [createEngineeringCalculationError('CONTRACT_VERSION_UNSUPPORTED', `Unsupported request contract: ${request.contractVersion}`)], request);
    }
    const definition = getDefinition(calculationId);
    if (!definition) return failureEnvelope(null, calculationId, [createEngineeringCalculationError('CALCULATION_NOT_REGISTERED', `Calculation not registered: ${calculationId}`)], request);
    const state = methodState(definition);
    if (NON_EXECUTABLE_STATES.has(state)) {
      const code = state === 'BLOCKED' ? 'ENGINEERING_METHOD_BLOCKED' : 'ENGINEERING_METHOD_NOT_QUALIFIED';
      return failureEnvelope(definition, calculationId, [createEngineeringCalculationError(code, `${definition.name} is not executable at qualification state ${state}.`)], request);
    }

    const options = request.options ?? {};
    const resolution = resolveEngineeringInputsForDefinition(definition, request.inputs ?? {}, request.inputUnits ?? {}, request.context ?? {}, options);
    if (!resolution.ok) return failureEnvelope(definition, calculationId, resolution.errors, request, resolution);

    let fragment;
    try {
      fragment = definition.calculate(immutableEngineeringSnapshot(resolution.canonicalInput), {
        context: immutableEngineeringSnapshot(request.context ?? {}),
        options: immutableEngineeringSnapshot(options),
        resolvedInputs: immutableEngineeringSnapshot(resolution.resolvedInputs),
      });
    } catch (error) {
      return failureEnvelope(definition, calculationId, [normalizeThrownEngineeringError(error)], request, resolution);
    }
    if (!fragment?.ok) return failureEnvelope(definition, calculationId, normalizeKernelFailure(fragment), request, {
      ...resolution,
      warnings: [...resolution.warnings, ...(fragment?.warnings ?? [])],
      qualification: fragment?.qualification ?? defaultQualification(definition),
      provenance: fragment?.provenance ?? {},
      evidence: options.includeEvidence === false ? {} : fragment?.evidence ?? {},
      applicability: fragment?.applicability ?? resolution.applicability,
    });

    return immutableEngineeringSnapshot({
      contractVersion: ENGINEERING_CALCULATION_RESULT_VERSION,
      ok: true,
      calculationId,
      family: definition.family,
      methodRevision: definition.methodRevision,
      execution: executionInfo(definition),
      applicability: applicabilityFor(definition, fragment.applicability ?? resolution.applicability),
      inputs: cloneEngineeringValue(request.inputs ?? {}),
      resolvedInputs: cloneEngineeringValue(resolution.resolvedInputs),
      outputs: cloneEngineeringValue(fragment.outputs ?? {}),
      intermediates: cloneEngineeringValue(fragment.intermediates ?? {}),
      checks: cloneEngineeringValue(fragment.checks ?? []),
      assessment: cloneEngineeringValue(fragment.assessment ?? null),
      warnings: cloneEngineeringValue([...resolution.warnings, ...(fragment.warnings ?? [])]),
      errors: [],
      qualification: fragment.qualification ?? defaultQualification(definition),
      provenance: cloneEngineeringValue(fragment.provenance ?? {}),
      evidence: options.includeEvidence === false ? {} : cloneEngineeringValue(fragment.evidence ?? {}),
    });
  }

  function calculateBatch(batchRequest = {}) {
    if (batchRequest.contractVersion && batchRequest.contractVersion !== ENGINEERING_CALCULATION_BATCH_VERSION) {
      return immutableEngineeringSnapshot({
        ok: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        results: [],
        errors: [createEngineeringCalculationError('CONTRACT_VERSION_UNSUPPORTED', `Unsupported batch contract: ${batchRequest.contractVersion}`)],
      });
    }
    const requests = Array.isArray(batchRequest.requests) ? batchRequest.requests : [];
    const results = [];
    for (const request of requests) {
      const result = calculate(request);
      results.push(result);
      if (!result.ok && batchRequest.options?.stopOnError === true) break;
    }
    const succeeded = results.filter((result) => result.ok).length;
    return immutableEngineeringSnapshot({
      ok: results.every((result) => result.ok),
      total: requests.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    });
  }

  return Object.freeze({ getDefinition, validate, resolve, calculate, calculateBatch });
}
