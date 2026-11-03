export const VIBRATION_WORKSPACE_FIT_DETAIL_SCHEMA = 'VibrationWorkspaceFitDetail.v1';

export function buildVibrationWorkspaceFitDetail(resultRow) {
  const result = resultRow?.centralResult;
  if (!result) return null;
  return Object.freeze({
    schema: VIBRATION_WORKSPACE_FIT_DETAIL_SCHEMA,
    mechanismId: 'FIT',
    calculationId: result.calculationId ?? null,
    methodRevision: result.methodRevision ?? null,
    execution: result.execution ?? null,
    applicability: result.applicability ?? null,
    resolvedInputs: result.resolvedInputs ?? Object.freeze({}),
    outputs: result.outputs ?? Object.freeze({}),
    intermediates: result.intermediates ?? Object.freeze({}),
    assessment: result.assessment ?? null,
    qualification: result.qualification ?? null,
    provenance: result.provenance ?? Object.freeze({}),
    equationIds: result.evidence?.equationIds ?? Object.freeze([]),
    correlationIds: result.evidence?.correlationIds ?? Object.freeze([]),
    warnings: result.warnings ?? Object.freeze([]),
    sourceTrace: resultRow.sourceTrace ?? null,
  });
}
