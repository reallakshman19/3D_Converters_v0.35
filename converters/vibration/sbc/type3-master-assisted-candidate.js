import { combineSbcType3Terms } from './type3-combination.js?v=20260815-sbc-pf05-cache-1';
import { deriveSbcType3MasterAssistedInputs } from './type3-master-assisted-derivation.js?v=20260815-sbc-pf05-cache-1';
import { SBC_TYPE3_RECORD_KEY } from './type3-user-data.js?v=20260815-sbc-pf05-cache-1';

export const SBC_TYPE3_MASTER_ASSISTED_METHOD_ID =
  'VIB.SBC.T3.TYPE3.MASTER_ASSISTED_CANDIDATE';

const COORDINATE_TOLERANCE = 1e-12;
const CURVE_TERMS = Object.freeze(['D', 'F', 'G']);

function text(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || text(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function closeEnough(actual, expected) {
  return actual !== null && Math.abs(actual - Number(expected)) <= COORDINATE_TOLERANCE;
}

function matchingRows(userRows, request) {
  return (Array.isArray(userRows) ? userRows : []).filter((row) => (
    row?.mechanismId === 'smallBoreConnections'
      && row?.recordKey === SBC_TYPE3_RECORD_KEY
      && row?.scopeId === request.scopeId
      && row?.blockerId === request.blockerId
  ));
}

function problem(term, status, reason, request) {
  return Object.freeze({
    term,
    status,
    reason,
    figureId: request.figureId,
    expected: Object.freeze({
      xValue: request.xValue,
      xUnit: request.xUnit,
      yValue: request.yValue,
      yUnit: request.yUnit,
    }),
  });
}

function validateCoordinates(row, request, term) {
  const x = numberOrNull(row.xValue);
  const y = numberOrNull(row.yValue);
  const unitsMatch = text(row.xUnit).toLowerCase() === text(request.xUnit).toLowerCase()
    && text(row.yUnit).toLowerCase() === text(request.yUnit).toLowerCase();
  if (!unitsMatch || !closeEnough(x, request.xValue) || !closeEnough(y, request.yValue)) {
    return problem(term, 'INVALID_INPUT', 'EXACT_CURVE_COORDINATE_MISMATCH', request);
  }
  return null;
}

function resolveOneCurve(userRows, request, term) {
  const rows = matchingRows(userRows, request);
  if (!rows.length) return { problem: problem(term, 'INPUT_REQUIRED', 'EXACT_CURVE_EVIDENCE_REQUIRED', request) };
  if (rows.length !== 1) return { problem: problem(term, 'INVALID_INPUT', 'AMBIGUOUS_CURVE_EVIDENCE_ROWS', request) };
  const row = rows[0];
  const coordinateProblem = validateCoordinates(row, request, term);
  if (coordinateProblem) return { problem: coordinateProblem };
  const value = numberOrNull(row.value);
  if (value === null || value < 0) {
    return { problem: problem(term, text(row.value) ? 'INVALID_INPUT' : 'INPUT_REQUIRED', 'NON_NEGATIVE_CURVE_LOF_REQUIRED', request) };
  }
  if (!text(row.sourceReference)) {
    return { problem: problem(term, 'INPUT_REQUIRED', 'PROJECT_SOURCE_REFERENCE_REQUIRED', request) };
  }
  return {
    evidence: Object.freeze({
      term,
      figureId: request.figureId,
      blockerId: request.blockerId,
      scopeId: request.scopeId,
      xValue: Number(request.xValue),
      xUnit: request.xUnit,
      yValue: Number(request.yValue),
      yUnit: request.yUnit,
      lof: value,
      evidenceOrigin: 'USER_PROJECT_EXACT_CURVE_READ',
      sourceReference: text(row.sourceReference),
      publicationState: request.status,
      runtimeCurveActivation: request.runtimeCurveActivation,
      masterPublicationAuthorized: request.masterPublicationAuthorized,
      row: Object.freeze({ ...row }),
    }),
  };
}

function resolveCurveEvidence(userRows, requests) {
  const evidence = [];
  const problems = [];
  requests.forEach((request, index) => {
    const resolution = resolveOneCurve(userRows, request, CURVE_TERMS[index]);
    if (resolution.problem) problems.push(resolution.problem);
    else evidence.push(resolution.evidence);
  });
  return Object.freeze({ ok: problems.length === 0, evidence: Object.freeze(evidence), problems: Object.freeze(problems) });
}

function notReady(derivation, problems) {
  return Object.freeze({
    ok: false,
    status: 'NOT_READY',
    methodId: SBC_TYPE3_MASTER_ASSISTED_METHOD_ID,
    scopeId: derivation.scopeId,
    derivation,
    curveRequests: derivation.curveRequests ?? Object.freeze([]),
    problems: Object.freeze(problems),
    governance: derivation.governance,
    authority: derivation.authority,
  });
}

function candidateResult(derivation, curveEvidence, combination) {
  return Object.freeze({
    ok: true,
    status: 'CALCULATED_MASTER_ASSISTED_CANDIDATE',
    methodId: SBC_TYPE3_MASTER_ASSISTED_METHOD_ID,
    scopeId: derivation.scopeId,
    firstSpan: combination.firstSpan,
    subsequentSpans: combination.subsequentSpans,
    overallModifier: combination.overallModifier,
    mainline: combination.mainline,
    lof: combination.lof,
    derived: derivation.derived,
    curveRequests: derivation.curveRequests,
    curveEvidence,
    evidence: derivation.evidence,
    governance: derivation.governance,
    authority: Object.freeze({
      ...derivation.authority,
      methodStatus: 'CANDIDATE_MASTER_ASSISTED_WITH_PROJECT_CURVE_EVIDENCE',
    }),
  });
}

export async function calculateSbcType3MasterAssistedCandidate(options = {}) {
  const derivation = await deriveSbcType3MasterAssistedInputs(options);
  if (!derivation.ok) return notReady(derivation, derivation.problems ?? []);
  const curves = resolveCurveEvidence(options.userRows, derivation.curveRequests);
  if (!curves.ok) return notReady(derivation, curves.problems);
  const [d, f, g] = curves.evidence.map((item) => item.lof);
  const combination = combineSbcType3Terms({
    hasMass: options.physical?.firstSpanHasUnsupportedMass,
    c: derivation.derived.c,
    d,
    e: derivation.derived.e,
    firstLocation: derivation.derived.firstLocationLof,
    f,
    g,
    mainlineLof: derivation.derived.mainlineLofForAssessment,
    multiplier: derivation.derived.mainlineMultiplier,
  });
  if (!combination.ok) return notReady(derivation, combination.problems);
  return candidateResult(derivation, curves.evidence, combination);
}
