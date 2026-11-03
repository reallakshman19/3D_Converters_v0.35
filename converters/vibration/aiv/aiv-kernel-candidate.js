export const AIV_KERNEL_CANDIDATE_SCHEMA = 'AivKernelCandidate.v1';
export const AIV_KERNEL_CANDIDATE_SOURCE_RESULT_SCHEMA = 'AivKernelCandidateSourceResult.v1';
export const AIV_KERNEL_CANDIDATE_POINT_CONTRIBUTION_SCHEMA = 'AivKernelCandidatePointContribution.v1';
export const AIV_KERNEL_CANDIDATE_COMBINATION_SCHEMA = 'AivKernelCandidateCombination.v1';

export const AIV_KERNEL_CANDIDATE_AUTHORITY = Object.freeze({
  implementationState: 'CANDIDATE_NOT_AUTHORIZED',
  registeredInEngineeringApi: false,
  uiExecutionAuthorized: false,
  benchmarkExecutionAuthorized: false,
  screeningExecutionAuthorized: false,
  calculationState: 'BLOCKED',
  qualificationState: 'BLOCKED',
  engineeringAuthority: 'NONE',
  productionEquationAuthorized: false,
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
});

export const AIV_KERNEL_CANDIDATE_IMPLEMENTED_STAGES = Object.freeze([
  'VALIDATE_INPUT',
  'RESOLVE_INPUT',
  'EVALUATE_APPLICABILITY',
  'CALCULATE_SOURCE_PWL',
  'APPLY_SOURCE_MODIFIERS',
  'CALCULATE_POINT_ATTENUATION',
  'COMBINE_SIMULTANEOUS_SOURCES',
]);

export const AIV_KERNEL_CANDIDATE_BLOCKED_STAGES = Object.freeze([
  'CALCULATE_DISCONTINUITY_RESULT',
  'AGGREGATE_LINE_CASE_RESULT',
  'ASSESS_RESULT',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function candidateError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.name = 'AivKernelCandidateError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function finitePositive(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw candidateError('AIV_CANDIDATE_INPUT_INVALID', `${field} must be finite and positive.`, { field, value });
  }
  return value;
}

function finiteNonNegative(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw candidateError('AIV_CANDIDATE_INPUT_INVALID', `${field} must be finite and non-negative.`, { field, value });
  }
  return value;
}

function quantityValue(quantity, field) {
  if (!quantity || typeof quantity !== 'object') {
    throw candidateError('AIV_CANDIDATE_QUANTITY_REQUIRED', `${field} quantity is required.`, { field });
  }
  const value = Number(quantity.value);
  if (!Number.isFinite(value)) {
    throw candidateError('AIV_CANDIDATE_QUANTITY_INVALID', `${field} quantity value must be finite.`, { field, value: quantity.value });
  }
  const unit = String(quantity.unit ?? '').trim();
  if (!unit) throw candidateError('AIV_CANDIDATE_UNIT_REQUIRED', `${field} unit is required.`, { field });
  return { value, unit };
}

function massFlowKgS(quantity) {
  const { value, unit } = quantityValue(quantity, 'Mass Flow');
  if (unit === 'kg/s') return finiteNonNegative(value, 'Mass Flow');
  if (unit === 'kg/h') return finiteNonNegative(value, 'Mass Flow') / 3600;
  throw candidateError('AIV_CANDIDATE_UNIT_UNSUPPORTED', `Unsupported mass-flow unit ${unit}.`, { field: 'Mass Flow', unit });
}

function pressurePa(quantity, field) {
  const { value, unit } = quantityValue(quantity, field);
  const factor = ({ Pa: 1, kPa: 1e3, MPa: 1e6, bar: 1e5 })[unit];
  if (!factor) throw candidateError('AIV_CANDIDATE_UNIT_UNSUPPORTED', `Unsupported pressure unit ${unit}.`, { field, unit });
  return value * factor;
}

function temperatureK(quantity) {
  const { value, unit } = quantityValue(quantity, 'Upstream Temperature');
  if (unit === 'K') return finitePositive(value, 'Upstream Temperature');
  if (unit === 'degC') return finitePositive(value + 273.15, 'Upstream Temperature');
  throw candidateError('AIV_CANDIDATE_UNIT_UNSUPPORTED', `Unsupported temperature unit ${unit}.`, { field: 'Upstream Temperature', unit });
}

function molecularWeightGPerMol(quantity) {
  const { value, unit } = quantityValue(quantity, 'Molecular Weight');
  if (unit === 'g/mol' || unit === 'kg/kmol') return finitePositive(value, 'Molecular Weight');
  if (unit === 'kg/mol') return finitePositive(value * 1000, 'Molecular Weight');
  throw candidateError('AIV_CANDIDATE_UNIT_UNSUPPORTED', `Unsupported molecular-weight unit ${unit}.`, { field: 'Molecular Weight', unit });
}

function distanceM(quantity) {
  const { value, unit } = quantityValue(quantity, 'Physical Distance');
  if (unit === 'm') return finiteNonNegative(value, 'Physical Distance');
  if (unit === 'mm') return finiteNonNegative(value, 'Physical Distance') / 1000;
  throw candidateError('AIV_CANDIDATE_UNIT_UNSUPPORTED', `Unsupported distance unit ${unit}.`, { field: 'Physical Distance', unit });
}

function diameterMm(quantity) {
  const { value, unit } = quantityValue(quantity, 'Main Inside Diameter');
  if (unit === 'mm') return finitePositive(value, 'Main Inside Diameter');
  if (unit === 'm') return finitePositive(value * 1000, 'Main Inside Diameter');
  throw candidateError('AIV_CANDIDATE_UNIT_UNSUPPORTED', `Unsupported diameter unit ${unit}.`, { field: 'Main Inside Diameter', unit });
}

function pressureAbsolutePa(source, key, field) {
  const pressure = source?.[key];
  if (!pressure) throw candidateError('AIV_CANDIDATE_PRESSURE_REQUIRED', `${field} is required.`);
  const pressureValuePa = pressurePa(pressure, field);
  if (pressure.basis === 'ABSOLUTE') return finitePositive(pressureValuePa, field);
  if (pressure.basis !== 'GAUGE') {
    throw candidateError('AIV_CANDIDATE_PRESSURE_BASIS_INVALID', `${field} basis must be ABSOLUTE or GAUGE.`, { basis: pressure.basis });
  }
  if (!source.referencePressure || !source.referencePressureSource || !source.referencePressureSourceRevision) {
    throw candidateError(
      'AIV_CANDIDATE_GAUGE_REFERENCE_REQUIRED',
      'Gauge pressure conversion requires explicit reference pressure, source and revision.',
      { field },
    );
  }
  return finitePositive(pressureValuePa + pressurePa(source.referencePressure, 'Reference Pressure'), field);
}

function sonicFlowFactorDb(sonicState) {
  if (sonicState === 'NON_SONIC') return 0;
  if (sonicState === 'SONIC') return 6;
  throw candidateError('AIV_CANDIDATE_SONIC_STATE_UNRESOLVED', 'Sonic state must be explicitly SONIC or NON_SONIC before candidate calculation.');
}

function trimReductionDb(lowNoiseTrim) {
  if (lowNoiseTrim?.state === 'NONE') return 0;
  if (lowNoiseTrim?.state !== 'MANUFACTURER_REDUCTION') {
    throw candidateError('AIV_CANDIDATE_TRIM_UNRESOLVED', 'Low-noise trim state must be NONE or MANUFACTURER_REDUCTION before candidate calculation.');
  }
  if (!lowNoiseTrim.reduction || !lowNoiseTrim.source || !lowNoiseTrim.sourceRevision) {
    throw candidateError('AIV_CANDIDATE_TRIM_EVIDENCE_REQUIRED', 'Manufacturer trim requires reduction, source and source revision.');
  }
  const { value, unit } = quantityValue(lowNoiseTrim.reduction, 'Low Noise Trim Reduction');
  if (unit !== 'dB') throw candidateError('AIV_CANDIDATE_UNIT_UNSUPPORTED', `Unsupported trim unit ${unit}.`, { field: 'Low Noise Trim Reduction', unit });
  return finitePositive(value, 'Low Noise Trim Reduction');
}

function sourcePwlDb({ p1PaAbs, p2PaAbs, massFlowKgS: flow, temperatureK: tempK, molecularWeightGPerMol: mw, sffDb }) {
  if (!(p1PaAbs > p2PaAbs)) {
    throw candidateError('AIV_CANDIDATE_PRESSURE_DROP_INVALID', 'Upstream absolute pressure must exceed downstream absolute pressure.', { p1PaAbs, p2PaAbs });
  }
  const argument = (((p1PaAbs - p2PaAbs) / p1PaAbs) ** 3.6)
    * (flow ** 2)
    * ((tempK / mw) ** 1.2);
  if (!(argument > 0) || !Number.isFinite(argument)) {
    throw candidateError('AIV_CANDIDATE_SOURCE_PWL_DOMAIN_INVALID', 'Source PWL logarithm argument must be finite and positive.', { argument });
  }
  return 10 * Math.log10(argument) + 126.1 + sffDb;
}

function sourceTrace(source) {
  return {
    sourceCanonicalId: source.sourceCanonicalId,
    caseId: source.caseId,
    source: source.source ?? null,
    sourceRevision: source.sourceRevision ?? null,
    recordId: source.recordId ?? null,
    traceIds: ['AIV-EQ-SOURCE-PWL-001', 'AIV-CONST-SFF-001'],
  };
}

export function calculateAivKernelCandidateSource(source) {
  if (!source?.sourceCanonicalId || !source?.caseId) {
    throw candidateError('AIV_CANDIDATE_SOURCE_IDENTITY_REQUIRED', 'Candidate source calculation requires Source Canonical ID and Operating Case.');
  }
  const resolved = {
    p1PaAbs: pressureAbsolutePa(source, 'upstreamPressure', 'Upstream Pressure'),
    p2PaAbs: pressureAbsolutePa(source, 'downstreamPressure', 'Downstream Pressure'),
    massFlowKgS: massFlowKgS(source.massFlow),
    temperatureK: temperatureK(source.upstreamTemperature),
    molecularWeightGPerMol: molecularWeightGPerMol(source.molecularWeight),
    sonicFlowFactorDb: sonicFlowFactorDb(source.sonicState),
    trimReductionDb: trimReductionDb(source.lowNoiseTrim),
  };
  const rawSourcePwlDb = sourcePwlDb({
    ...resolved,
    sffDb: resolved.sonicFlowFactorDb,
  });
  const effectiveSourcePwlDb = rawSourcePwlDb - resolved.trimReductionDb;
  return deepFreeze({
    schema: AIV_KERNEL_CANDIDATE_SOURCE_RESULT_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    sourceCanonicalId: source.sourceCanonicalId,
    caseId: source.caseId,
    rawSourcePwlDb,
    sonicFlowFactorDb: resolved.sonicFlowFactorDb,
    trimReductionDb: resolved.trimReductionDb,
    effectiveSourcePwlDb,
    resolvedInput: resolved,
    authority: AIV_KERNEL_CANDIDATE_AUTHORITY,
    trace: sourceTrace(source),
  });
}

export function calculateAivKernelCandidatePointContribution({ sourceResult, relationship, assessment } = {}) {
  if (sourceResult?.schema !== AIV_KERNEL_CANDIDATE_SOURCE_RESULT_SCHEMA) {
    throw candidateError('AIV_CANDIDATE_SOURCE_RESULT_REQUIRED', `Point contribution requires ${AIV_KERNEL_CANDIDATE_SOURCE_RESULT_SCHEMA}.`);
  }
  if (!relationship || relationship.applicabilityDisposition !== 'APPLICABLE') {
    throw candidateError('AIV_CANDIDATE_RELATIONSHIP_NOT_APPLICABLE', 'Point contribution requires an explicitly APPLICABLE source-to-assessment relationship.');
  }
  if (relationship.sourceCanonicalId !== sourceResult.sourceCanonicalId || relationship.caseId !== sourceResult.caseId) {
    throw candidateError('AIV_CANDIDATE_RELATIONSHIP_IDENTITY_MISMATCH', 'Relationship source/case identity must match the source result.');
  }
  if (!relationship.physicalDistance || !relationship.distanceSource || !relationship.distanceSourceRevision) {
    throw candidateError('AIV_CANDIDATE_DISTANCE_EVIDENCE_REQUIRED', 'Point contribution requires explicit physical distance, source and revision.');
  }
  if (!assessment || assessment.assessmentCanonicalId !== relationship.assessmentCanonicalId) {
    throw candidateError('AIV_CANDIDATE_ASSESSMENT_IDENTITY_MISMATCH', 'Assessment identity must match the relationship assessment Canonical ID.');
  }
  const physicalDistanceM = distanceM(relationship.physicalDistance);
  const mainInsideDiameterMm = diameterMm(assessment.mainInsideDiameter);
  const attenuationDb = 60 * physicalDistanceM / mainInsideDiameterMm;
  const pointPwlDb = sourceResult.effectiveSourcePwlDb - attenuationDb;
  return deepFreeze({
    schema: AIV_KERNEL_CANDIDATE_POINT_CONTRIBUTION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    sourceCanonicalId: sourceResult.sourceCanonicalId,
    assessmentCanonicalId: relationship.assessmentCanonicalId,
    caseId: relationship.caseId,
    simultaneousSourceGroup: relationship.simultaneousSourceGroup ?? null,
    effectiveSourcePwlDb: sourceResult.effectiveSourcePwlDb,
    physicalDistanceM,
    mainInsideDiameterMm,
    attenuationDb,
    pointPwlDb,
    authority: AIV_KERNEL_CANDIDATE_AUTHORITY,
    trace: {
      relationshipSource: relationship.source ?? null,
      relationshipSourceRevision: relationship.sourceRevision ?? null,
      distanceSource: relationship.distanceSource,
      distanceSourceRevision: relationship.distanceSourceRevision,
      traceIds: ['AIV-EQ-ATTENUATION-001'],
    },
  });
}

function simultaneousGroupToken(value) {
  const token = String(value ?? '').trim();
  return token || '(IMPLICIT_SINGLE_GROUP)';
}

export function combineAivKernelCandidatePointContributions(contributions) {
  if (!Array.isArray(contributions) || contributions.length === 0) {
    throw candidateError('AIV_CANDIDATE_CONTRIBUTIONS_REQUIRED', 'At least one point-level source contribution is required.');
  }
  const first = contributions[0];
  const firstGroup = simultaneousGroupToken(first.simultaneousSourceGroup);
  for (const contribution of contributions) {
    if (contribution?.schema !== AIV_KERNEL_CANDIDATE_POINT_CONTRIBUTION_SCHEMA) {
      throw candidateError('AIV_CANDIDATE_CONTRIBUTION_SCHEMA_INVALID', `All contributions must use ${AIV_KERNEL_CANDIDATE_POINT_CONTRIBUTION_SCHEMA}.`);
    }
    if (contribution.assessmentCanonicalId !== first.assessmentCanonicalId || contribution.caseId !== first.caseId) {
      throw candidateError('AIV_CANDIDATE_CONTRIBUTION_SCOPE_MISMATCH', 'Combined contributions must share Assessment Canonical ID and Operating Case.');
    }
    if (simultaneousGroupToken(contribution.simultaneousSourceGroup) !== firstGroup) {
      throw candidateError(
        'AIV_MULTIPLE_SIMULTANEOUS_GROUPS_UNSUPPORTED',
        'Multiple simultaneous-source groups for one Assessment + Operating Case require a separately qualified result-scope contract.',
        { assessmentCanonicalId: first.assessmentCanonicalId, caseId: first.caseId },
      );
    }
  }
  const energySum = contributions.reduce((sum, contribution) => sum + (10 ** (contribution.pointPwlDb / 10)), 0);
  const combinedPointPwlDb = 10 * Math.log10(energySum);
  return deepFreeze({
    schema: AIV_KERNEL_CANDIDATE_COMBINATION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    assessmentCanonicalId: first.assessmentCanonicalId,
    caseId: first.caseId,
    contributionCount: contributions.length,
    sourceCanonicalIds: contributions.map((item) => item.sourceCanonicalId),
    combinedPointPwlDb,
    authority: AIV_KERNEL_CANDIDATE_AUTHORITY,
    trace: {
      traceIds: ['AIV-EQ-MULTI-SOURCE-SUM-001'],
      contributionSchemas: contributions.map((item) => item.schema),
    },
  });
}

export function buildAivKernelCandidateStatus() {
  return deepFreeze({
    schema: AIV_KERNEL_CANDIDATE_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    implementedStages: AIV_KERNEL_CANDIDATE_IMPLEMENTED_STAGES,
    blockedStages: AIV_KERNEL_CANDIDATE_BLOCKED_STAGES,
    authority: AIV_KERNEL_CANDIDATE_AUTHORITY,
    notes: [
      'Candidate equations are not registered, exported through the AIV facade, or callable from the product UI.',
      'Explicit SONIC/NON_SONIC input is consumed; the candidate does not infer sonic state.',
      'T2-6 discontinuity calculation, line aggregation and assessment remain blocked pending human reconciliation and release evidence.',
    ],
  });
}
