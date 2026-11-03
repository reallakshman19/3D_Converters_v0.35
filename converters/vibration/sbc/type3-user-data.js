import {
  VIBRATION_USER_ENGINEERING_DATA_AUTHORITY,
  resolveBlockedVibrationData,
  validateVibrationUserEngineeringDataRow,
} from '../user-engineering-data.js';
import { combineSbcType3Terms } from './type3-combination.js?v=20260815-sbc-pf05-cache-1';

export const SBC_TYPE3_USER_METHOD_ID = 'VIB.SBC.T3.TYPE3.USER_INPUT_CANDIDATE';
export const SBC_TYPE3_RECORD_KEY = 'TYPE3';

export const SBC_TYPE3_BLOCKERS = Object.freeze({
  mainlineLof: 'EI_AVIFF.T3.SBC.MAINLINE_LOF',
  mainlineMultiplier: 'EI_AVIFF.T3.SBC.MAINLINE_MULTIPLIER',
  firstHasMass: 'PROJECT.SBC.T3.FIRST_SPAN_UNSUPPORTED_MASS',
  firstMassGeometryLof: 'EI_AVIFF.T3.SBC.FIRST_MASS_GEOMETRY_LOF_C',
  firstMinimumSpanLof: 'EI_AVIFF.T3.SBC.FIRST_MINIMUM_SPAN_LOF_E',
  firstLocationLof: 'EI_AVIFF.T3.SBC.FIRST_LOCATION_LOF',
  figureT31: 'EI_AVIFF.T3.SBC.FIGURE_T3_1',
  figureT32: 'EI_AVIFF.T3.SBC.FIGURE_T3_2',
  figureT33: 'EI_AVIFF.T3.SBC.FIGURE_T3_3',
  figureT34: 'EI_AVIFF.T3.SBC.FIGURE_T3_4',
});

const NUMERIC_BLOCKERS = new Set(Object.entries(SBC_TYPE3_BLOCKERS)
  .filter(([key]) => key !== 'firstHasMass')
  .map(([, blockerId]) => blockerId));

const AUTHORITY = Object.freeze({
  ...VIBRATION_USER_ENGINEERING_DATA_AUTHORITY,
  methodStatus: 'CANDIDATE_USER_INPUT',
  qualificationStatus: 'NOT_QUALIFIED',
});

function seed(blockerId, scopeId, overrides = {}) {
  return Object.freeze({
    mechanismId: 'smallBoreConnections', blockerId, scopeId,
    recordKey: SBC_TYPE3_RECORD_KEY,
    xValue: '', xUnit: '', yValue: '', yUnit: '',
    value: '', unit: '1', sourceReference: '', notes: '',
    ...overrides,
  });
}

export function createSbcType3UserInputTemplate(scopeId, firstSpanHasUnsupportedMass) {
  const hasMass = firstSpanHasUnsupportedMass === true;
  const rows = [
    seed(SBC_TYPE3_BLOCKERS.mainlineLof, scopeId),
    seed(SBC_TYPE3_BLOCKERS.mainlineMultiplier, scopeId),
    seed(SBC_TYPE3_BLOCKERS.firstHasMass, scopeId, {
      value: hasMass ? 'TRUE' : 'FALSE', unit: '',
      sourceReference: 'USER_SELECTED_FIRST_SPAN_CONFIGURATION',
    }),
  ];
  if (hasMass) rows.push(seed(SBC_TYPE3_BLOCKERS.firstMassGeometryLof, scopeId));
  rows.push(seed(hasMass ? SBC_TYPE3_BLOCKERS.figureT31 : SBC_TYPE3_BLOCKERS.figureT32, scopeId));
  rows.push(seed(SBC_TYPE3_BLOCKERS.firstMinimumSpanLof, scopeId));
  rows.push(seed(SBC_TYPE3_BLOCKERS.firstLocationLof, scopeId));
  rows.push(seed(SBC_TYPE3_BLOCKERS.figureT33, scopeId));
  rows.push(seed(SBC_TYPE3_BLOCKERS.figureT34, scopeId));
  return Object.freeze(rows);
}

function booleanText(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return ['TRUE', 'YES', '1', 'FALSE', 'NO', '0'].includes(normalized);
}

export function validateSbcType3UserEngineeringDataRow(row) {
  const base = validateVibrationUserEngineeringDataRow(row);
  if (row?.recordKey !== SBC_TYPE3_RECORD_KEY) return base;
  const errors = [...base.errors];
  if (NUMERIC_BLOCKERS.has(row.blockerId)) {
    const numeric = Number(row.value);
    if (!Number.isFinite(numeric) || numeric < 0) errors.push('NON_NEGATIVE_NUMBER_REQUIRED');
  }
  if (row.blockerId === SBC_TYPE3_BLOCKERS.firstHasMass && !booleanText(row.value)) {
    errors.push('BOOLEAN_VALUE_REQUIRED');
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]), valueType: base.valueType });
}

function resolveTerm(userRows, scopeId, blockerId, governedValue) {
  return resolveBlockedVibrationData({
    governedValue,
    userRows,
    request: {
      mechanismId: 'smallBoreConnections', blockerId, scopeId,
      recordKey: SBC_TYPE3_RECORD_KEY,
    },
  });
}

function resolvedValue(result) {
  return result.status === 'RESOLVED_USER_INPUT' || result.status === 'RESOLVED_GOVERNED_MASTER';
}

function numberValue(result, name, problems) {
  if (!resolvedValue(result)) {
    problems.push(Object.freeze({ term: name, status: result.status, reason: result.reason ?? null }));
    return null;
  }
  const value = Number(result.value);
  if (!Number.isFinite(value) || value < 0) {
    problems.push(Object.freeze({ term: name, status: 'INVALID_INPUT', reason: 'NON_NEGATIVE_NUMBER_REQUIRED' }));
    return null;
  }
  return value;
}

function booleanValue(result, name, problems) {
  if (!resolvedValue(result)) {
    problems.push(Object.freeze({ term: name, status: result.status, reason: result.reason ?? null }));
    return null;
  }
  const value = String(result.value).trim().toUpperCase();
  if (value === 'TRUE' || value === 'YES' || value === '1') return true;
  if (value === 'FALSE' || value === 'NO' || value === '0') return false;
  problems.push(Object.freeze({ term: name, status: 'INVALID_INPUT', reason: 'BOOLEAN_VALUE_REQUIRED' }));
  return null;
}

function evidenceEntry(term, resolution) {
  return Object.freeze({
    term,
    blockerId: resolution.row?.blockerId ?? null,
    resolutionStatus: resolution.status,
    sourceReference: resolution.row?.sourceReference ?? null,
    row: resolution.row ?? null,
    provenance: resolution.provenance ?? null,
  });
}

function notReady(scopeId, problems) {
  return Object.freeze({
    ok: false,
    status: 'NOT_READY',
    methodId: SBC_TYPE3_USER_METHOD_ID,
    scopeId,
    problems: Object.freeze(problems),
    authority: AUTHORITY,
  });
}

export function calculateSbcType3FromUserEngineeringData(options = {}) {
  const scopeId = String(options.scopeId ?? '').trim();
  if (!scopeId) throw new TypeError('SBC Type-3 evaluation requires a scopeId.');
  const userRows = options.userRows ?? [];
  const governed = options.governed ?? {};
  const problems = [];
  const resolutions = {};
  const get = (name, blockerId) => {
    const result = resolveTerm(userRows, scopeId, blockerId, governed[name]);
    resolutions[name] = result;
    return result;
  };

  const mainlineLof = numberValue(get('mainlineLof', SBC_TYPE3_BLOCKERS.mainlineLof), 'mainlineLof', problems);
  const multiplier = numberValue(get('mainlineMultiplier', SBC_TYPE3_BLOCKERS.mainlineMultiplier), 'mainlineMultiplier', problems);
  const hasMass = booleanValue(get('firstHasMass', SBC_TYPE3_BLOCKERS.firstHasMass), 'firstHasMass', problems);
  const c = hasMass === true
    ? numberValue(get('firstMassGeometryLof', SBC_TYPE3_BLOCKERS.firstMassGeometryLof), 'LOFGEOM(C)', problems)
    : hasMass === false ? 0 : null;
  const firstCurveBlocker = hasMass === true ? SBC_TYPE3_BLOCKERS.figureT31 : SBC_TYPE3_BLOCKERS.figureT32;
  const d = hasMass === null ? null : numberValue(get('firstCurveLof', firstCurveBlocker), 'LOFGEOM(D)', problems);
  const e = numberValue(get('firstMinimumSpanLof', SBC_TYPE3_BLOCKERS.firstMinimumSpanLof), 'LOFGEOM(E)', problems);
  const firstLocation = numberValue(get('firstLocationLof', SBC_TYPE3_BLOCKERS.firstLocationLof), 'firstLocationLof', problems);
  const f = numberValue(get('figureT33', SBC_TYPE3_BLOCKERS.figureT33), 'LOFGEOM(F)', problems);
  const g = numberValue(get('figureT34', SBC_TYPE3_BLOCKERS.figureT34), 'LOFGEOM(G)', problems);

  if (problems.length) return notReady(scopeId, problems);

  const combination = combineSbcType3Terms({
    hasMass, c, d, e, firstLocation, f, g, mainlineLof, multiplier,
  });
  if (!combination.ok) return notReady(scopeId, combination.problems);

  const evidence = Object.entries(resolutions).map(([term, resolution]) => evidenceEntry(term, resolution));
  return Object.freeze({
    ok: true,
    status: 'CALCULATED_USER_INPUT_CANDIDATE',
    methodId: SBC_TYPE3_USER_METHOD_ID,
    scopeId,
    firstSpan: combination.firstSpan,
    subsequentSpans: combination.subsequentSpans,
    overallModifier: combination.overallModifier,
    mainline: combination.mainline,
    lof: combination.lof,
    evidence: Object.freeze(evidence),
    authority: AUTHORITY,
  });
}
