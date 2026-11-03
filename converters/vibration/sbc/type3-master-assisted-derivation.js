import {
  EI_AVIFF_SBC_T3_MASTER_IDS,
  inspectEiAviffSbcT3TableCandidate,
  resolveEiAviffSbcT3CurveCandidate,
} from '../masters/ei-aviff-sbc-t3-candidate.js';
import { SBC_TYPE3_BLOCKERS, SBC_TYPE3_RECORD_KEY } from './type3-user-data.js?v=20260815-sbc-pf05-cache-1';
import {
  SBC_T3_CANDIDATE_AUTHORITY,
  SBC_T3_CANDIDATE_GOVERNANCE,
  resolveSbcT3CandidateRule,
  resolveSbcT3CandidateScore,
} from './type3-noncurve-candidate-data.js?v=20260815-sbc-pf05-cache-1';

export const SBC_TYPE3_MASTER_DERIVATION_METHOD_ID =
  'VIB.SBC.T3.TYPE3.MASTER_ASSISTED_DERIVATION_CANDIDATE';

const AUTHORITY = Object.freeze({
  ...SBC_T3_CANDIDATE_AUTHORITY,
  methodStatus: 'CANDIDATE_MASTER_ASSISTED_DERIVATION',
  qualificationStatus: 'NOT_QUALIFIED',
});

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(code);
  return number;
}

function nonNegativeNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError('SBC_T3_MAINLINE_LOF_INVALID');
  return number;
}

function normalizedScheduleText(value) {
  return String(value ?? '').trim().toUpperCase()
    .replace(/^SCHEDULE\s*/u, '').replace(/^SCH\s*/u, '');
}

export function sbcT3ParentScheduleKey(value) {
  const raw = normalizedScheduleText(value);
  if (raw === '10S') return '10S';
  const schedule = Number(raw);
  if (!Number.isFinite(schedule) || schedule < 10) throw new Error('SBC_T3_PARENT_SCHEDULE_NOT_READY');
  if (schedule > 160) return 'GT_160';
  const lower = [160, 80, 40, 20, 10].find((item) => schedule >= item);
  return lower === 10 ? '10S' : String(lower);
}

export function sbcT3BranchLengthKey(value) {
  const lengthMm = positiveNumber(value, 'SBC_T3_BRANCH_LENGTH_REQUIRED');
  if (lengthMm <= 200) return 'LE_200_MM';
  if (lengthMm <= 400) return 'GT_200_LE_400_MM';
  if (lengthMm <= 600) return 'GT_400_LE_600_MM';
  return 'GT_600_MM';
}

function valveScoreSelector(physical) {
  const rating = positiveNumber(physical.valvePressureClass, 'SBC_T3_VALVE_PRESSURE_CLASS_REQUIRED');
  const config = String(physical.valveConfiguration ?? '').trim().toUpperCase();
  if (rating >= 900 && config === 'FLANGE_ONLY') {
    return ['VALVE_FLANGE_ANSI_900_OR_GREATER', 'FLANGE_ONLY'];
  }
  if (rating >= 900 && ['ONE_OR_MORE_VALVES', 'ONE_VALVE_OR_INTEGRAL_DBB', 'TWO_OR_MORE_VALVES'].includes(config)) {
    return ['VALVE_FLANGE_ANSI_900_OR_GREATER', 'ONE_OR_MORE_VALVES'];
  }
  if (rating < 900 && ['FLANGE_ONLY', 'ONE_VALVE_OR_INTEGRAL_DBB', 'TWO_OR_MORE_VALVES'].includes(config)) {
    return ['VALVE_FLANGE_BELOW_ANSI_900', config];
  }
  throw new Error('SBC_T3_VALVE_CONFIGURATION_NOT_READY');
}

function score(kind, dimension, key) {
  return resolveSbcT3CandidateScore(kind, dimension, String(key));
}

function geometryComponentC(physical) {
  if (physical.firstSpanHasUnsupportedMass === false) {
    return Object.freeze({ value: 0, evidence: Object.freeze([]), automaticZeroRule: true });
  }
  const [valveDimension, valveKey] = valveScoreSelector(physical);
  const selectors = [
    ['FITTING_TYPE', physical.fittingKey],
    ['BRANCH_LENGTH_MM', sbcT3BranchLengthKey(physical.branchLengthMm)],
    [valveDimension, valveKey],
    ['PARENT_PIPE_SCHEDULE', sbcT3ParentScheduleKey(physical.parentSchedule)],
    ['SBC_MIN_DIAMETER_IN', positiveNumber(physical.sbcMinDiameterIn, 'SBC_T3_DIAMETER_REQUIRED')],
  ];
  const evidence = selectors.map(([dimension, key]) => score('GEOMETRY', dimension, key));
  const value = evidence.reduce((sum, item) => sum + item.row.score, 0) / evidence.length;
  return Object.freeze({ value, evidence: Object.freeze(evidence), automaticZeroRule: false });
}

async function minimumSpanComponentE(physical) {
  const size = positiveNumber(physical.sbcMinDiameterIn, 'SBC_T3_DIAMETER_REQUIRED');
  const firstSpanM = positiveNumber(physical.firstSpanLengthM, 'SBC_T3_FIRST_SPAN_REQUIRED');
  const [fitting, limit] = await Promise.all([
    inspectEiAviffSbcT3TableCandidate(
      EI_AVIFF_SBC_T3_MASTER_IDS.fittingSpanFactors,
      { fittingKey: physical.fittingKey },
    ),
    inspectEiAviffSbcT3TableCandidate(
      EI_AVIFF_SBC_T3_MASTER_IDS.firstSpanLimits,
      { sbcSizeIn: size },
    ),
  ]);
  const rule = resolveSbcT3CandidateRule('SPAN');
  const modifiedSpanM = firstSpanM * fitting.row.fittingSpanFactor;
  const value = modifiedSpanM < limit.row.minimumAllowableFirstSpanM
    ? rule.value.belowMinimumLof : rule.value.atOrAboveMinimumLof;
  return Object.freeze({ value, modifiedSpanM, fitting, limit, rule });
}

function firstLocationLof(physical, suppliedMainlineLof) {
  const rule = resolveSbcT3CandidateRule('LOCATION');
  if (suppliedMainlineLof === null) {
    return Object.freeze({
      mainlineLof: rule.value.unknownMainlineLofForAssessment,
      value: rule.value.lofWhenMainlineUnknown,
      evidence: Object.freeze([rule]),
    });
  }
  if (suppliedMainlineLof >= 1) {
    return Object.freeze({
      mainlineLof: suppliedMainlineLof,
      value: rule.value.lofWhenMainlineAtLeast1,
      evidence: Object.freeze([rule]),
    });
  }
  const location = score('LOCATION', 'LOCATION', physical.locationKey);
  const schedule = score('LOCATION', 'PARENT_PIPE_SCHEDULE', sbcT3ParentScheduleKey(physical.parentSchedule));
  return Object.freeze({
    mainlineLof: suppliedMainlineLof,
    value: (location.row.score + schedule.row.score) / 2,
    evidence: Object.freeze([location, schedule, rule]),
  });
}

function curveRequest(scopeId, blockerId, figureId, sizeIn, spanM) {
  const quarantine = resolveEiAviffSbcT3CurveCandidate(figureId);
  return Object.freeze({
    mechanismId: 'smallBoreConnections', blockerId, figureId, scopeId,
    recordKey: SBC_TYPE3_RECORD_KEY,
    xValue: String(sizeIn), xUnit: 'in', yValue: String(spanM), yUnit: 'm',
    value: '', unit: '1', sourceReference: '',
    status: quarantine.status,
    runtimeCurveActivation: quarantine.quarantine.runtimeCurveActivation,
    masterPublicationAuthorized: quarantine.quarantine.masterPublicationAuthorized,
    quarantineSource: quarantine.quarantine.source,
    notes: 'Manual exact-coordinate curve evidence required; runtime curve master remains quarantined.',
  });
}

function buildCurveRequests(scopeId, physical, spanComponent) {
  const size = positiveNumber(physical.sbcMinDiameterIn, 'SBC_T3_DIAMETER_REQUIRED');
  const firstSpanM = positiveNumber(physical.firstSpanLengthM, 'SBC_T3_FIRST_SPAN_REQUIRED');
  const hasMass = physical.firstSpanHasUnsupportedMass;
  const dBlocker = hasMass ? SBC_TYPE3_BLOCKERS.figureT31 : SBC_TYPE3_BLOCKERS.figureT32;
  const dFigure = hasMass ? 'T3-1' : 'T3-2';
  return Object.freeze([
    curveRequest(scopeId, dBlocker, dFigure, size, firstSpanM / spanComponent.fitting.row.fittingSpanFactor),
    curveRequest(scopeId, SBC_TYPE3_BLOCKERS.figureT33, 'T3-3', size,
      positiveNumber(physical.subsequentMassSpanM, 'SBC_T3_SUBSEQUENT_MASS_SPAN_REQUIRED')),
    curveRequest(scopeId, SBC_TYPE3_BLOCKERS.figureT34, 'T3-4', size,
      positiveNumber(physical.subsequentNoMassSpanM, 'SBC_T3_SUBSEQUENT_NO_MASS_SPAN_REQUIRED')),
  ]);
}

function notReady(scopeId, reason) {
  return Object.freeze({
    ok: false, status: 'NOT_READY', methodId: SBC_TYPE3_MASTER_DERIVATION_METHOD_ID,
    scopeId,
    problems: Object.freeze([Object.freeze({ term: 'masterAssistance', reason })]),
    governance: SBC_T3_CANDIDATE_GOVERNANCE,
    authority: AUTHORITY,
  });
}

export async function deriveSbcType3MasterAssistedInputs(options = {}) {
  const scopeId = String(options.scopeId ?? '').trim();
  if (!scopeId) throw new TypeError('SBC Type-3 master-assisted derivation requires a scopeId.');
  const physical = options.physical ?? {};
  if (typeof physical.firstSpanHasUnsupportedMass !== 'boolean') {
    return notReady(scopeId, 'SBC_T3_FIRST_SPAN_MASS_FLAG_REQUIRED');
  }
  try {
    const [geometryC, minimumSpanE] = await Promise.all([
      geometryComponentC(physical), minimumSpanComponentE(physical),
    ]);
    const location = firstLocationLof(physical, nonNegativeNumberOrNull(options.mainlineLof));
    const multiplier = resolveSbcT3CandidateRule('MAINLINE_MULTIPLIER');
    const curveRequests = buildCurveRequests(scopeId, physical, minimumSpanE);
    return Object.freeze({
      ok: true,
      status: 'READY_FOR_MANUAL_CURVE_EVIDENCE',
      methodId: SBC_TYPE3_MASTER_DERIVATION_METHOD_ID,
      scopeId,
      physical: Object.freeze({ ...physical }),
      derived: Object.freeze({
        c: geometryC.value,
        e: minimumSpanE.value,
        modifiedMinimumSpanM: minimumSpanE.modifiedSpanM,
        firstLocationLof: location.value,
        mainlineLofForAssessment: location.mainlineLof,
        mainlineMultiplier: multiplier.value,
      }),
      curveRequests,
      evidence: Object.freeze([
        ...geometryC.evidence, minimumSpanE.fitting, minimumSpanE.limit, minimumSpanE.rule,
        ...location.evidence, multiplier,
      ]),
      governance: SBC_T3_CANDIDATE_GOVERNANCE,
      authority: AUTHORITY,
    });
  } catch (error) {
    return notReady(scopeId, String(error?.message || error));
  }
}
