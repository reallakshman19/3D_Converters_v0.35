import { aivEitMassFlowKgH, aivEitPressureBarAbsolute, aivEitTemperatureC, aivEitTrimReductionDb } from './aiv-eit-units.js';

const DEVICE_LABEL = Object.freeze({
  RELIEF_VALVE: 'Relief',
  CONTROL_VALVE: 'Control',
  RESTRICTION_ORIFICE: 'Restriction orifice',
  PRESSURE_REDUCING_BRANCH_CONNECTION: 'Pressure reducing',
});

function numberText(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError('AIV .eit export requires finite numerical result.');
  return String(n);
}

export function buildAivEitSourceDetail({ source, sourceResult, assessmentResult, relationship, pathEvidence = null, importedDetail = null }) {
  const contribution = (assessmentResult.sourceContributionsAtPoint ?? []).find((item) => item.sourceCanonicalId === source.sourceCanonicalId);
  const trimDb = aivEitTrimReductionDb(source);
  const preservedSegments = pathEvidence?.segmentIds?.length
    ? pathEvidence.segmentIds
    : importedDetail?.segmentIds ?? [];
  return {
    vt: DEVICE_LABEL[source.sourceDeviceType] ?? source.sourceDeviceType,
    mfr: numberText(aivEitMassFlowKgH(source.massFlow)),
    usp: numberText(aivEitPressureBarAbsolute(source, 'upstreamPressure')),
    dsp: numberText(aivEitPressureBarAbsolute(source, 'downstreamPressure')),
    ust: numberText(aivEitTemperatureC(source.upstreamTemperature)),
    ...(trimDb > 0 ? { lnt: numberText(trimDb) } : {}),
    lof: Number(assessmentResult.lof),
    sourceCanonicalId: source.sourceCanonicalId,
    assessmentCanonicalId: assessmentResult.assessmentCanonicalId,
    caseId: assessmentResult.caseId,
    sourceDeviceType: source.sourceDeviceType,
    sourceState: source.sourceState,
    phase: source.phase,
    sonicState: source.sonicState,
    lowNoiseTrimState: source.lowNoiseTrim?.state ?? null,
    lowNoiseTrimSource: source.lowNoiseTrim?.source ?? null,
    lowNoiseTrimSourceRevision: source.lowNoiseTrim?.sourceRevision ?? null,
    sourcePwl: Number(sourceResult.effectiveSourcePwlDb),
    pointPwl: contribution ? Number(contribution.pointPwlDb) : null,
    combinedPointPwl: Number(assessmentResult.combinedPointPwlDb),
    distance: relationship?.physicalDistance?.value ?? pathEvidence?.physicalDistanceM ?? importedDetail?.distance ?? null,
    distanceUnit: relationship?.physicalDistance?.unit ?? (pathEvidence?.physicalDistanceM != null ? 'm' : importedDetail?.distanceUnit ?? null),
    distanceAuthority: pathEvidence?.distanceAuthority ?? relationship?.distanceSource ?? importedDetail?.distanceAuthority ?? null,
    simultaneousSourceGroup: relationship?.simultaneousSourceGroup ?? importedDetail?.simultaneousSourceGroup ?? null,
    segmentIds: [...preservedSegments],
  };
}
