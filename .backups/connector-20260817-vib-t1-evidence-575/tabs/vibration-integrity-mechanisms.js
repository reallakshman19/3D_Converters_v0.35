import { mechanicalFacilityScopeId } from '../converters/vibration/mechanical/facility.js';
import { sbcFacilityScopeId } from '../converters/vibration/sbc/facility.js?v=20260815-sbc-pf05-cache-1';
import { evaluateVibrationCoverageAndCompleteness } from '../converters/vibration/mechanisms/coverage.js';
import { createVibrationMechanismIdentificationBundle } from '../converters/vibration/mechanisms/identification-producer.js';
import {
  buildFitVibrationMechanismAssessmentSet,
  buildMechanicalVibrationMechanismAssessmentSet,
  buildSbcVibrationMechanismAssessmentSet,
  createVibrationMechanismAssessmentSet,
} from '../converters/vibration/mechanisms/index.js?v=20260815-sbc-pf05-cache-1';

export const VIBRATION_INTEGRITY_MECHANISMS = Object.freeze([
  Object.freeze({
    id: 'fit', label: 'FIT', title: 'Flow-induced turbulence',
    sourceSection: 'EI AVIFF T2.2', implementationState: 'SCREENING',
  }),
  Object.freeze({
    id: 'mechanicalExcitation', label: 'Mechanical', title: 'Mechanical excitation',
    sourceSection: 'EI AVIFF T2.3', implementationState: 'CANDIDATE_MASTER',
  }),
  Object.freeze({
    id: 'reciprocatingPulsation', label: 'Recip / PD',
    title: 'Pulsation from reciprocating / positive-displacement items',
    sourceSection: 'EI AVIFF T2.4', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'rotatingStall', label: 'Rotating stall', title: 'Pulsation from rotating stall',
    sourceSection: 'EI AVIFF T2.5', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'deadlegPulsation', label: 'Deadlegs', title: 'Flow-induced pulsation from deadlegs',
    sourceSection: 'EI AVIFF worked-example section', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'corrugationPulsation', label: 'Corrugations', title: 'Pulsation from corrugated pipes',
    sourceSection: 'EI Subsea AVIFF E4.3', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'slugFlow', label: 'Slug', title: 'Slug flow',
    sourceSection: 'EI AVIFF specialist assessment', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'aiv', label: 'AIV', title: 'High-frequency acoustic-induced vibration',
    sourceSection: 'EI AVIFF T2.7', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'valveTransients', label: 'Transients', title: 'Valve transients',
    sourceSection: 'EI AVIFF T2.8', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'cavitationFlashing', label: 'Cav / flash', title: 'Cavitation and flashing',
    sourceSection: 'EI AVIFF T2.9', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'thermowells', label: 'Thermowells', title: 'Thermowells',
    sourceSection: 'ASME PTC 19.3 TW-2016', implementationState: 'NOT_IMPLEMENTED',
  }),
  Object.freeze({
    id: 'smallBoreConnections', label: 'SBC', title: 'Small-bore connections',
    sourceSection: 'EI AVIFF T3', implementationState: 'CANDIDATE_USER_INPUT',
  }),
]);

const MECHANISM_BY_ID = new Map(
  VIBRATION_INTEGRITY_MECHANISMS.map((mechanism) => [mechanism.id, mechanism]),
);

function rowScope(row = {}) {
  return { line: row.line, caseId: row.caseId ?? null, canonicalId: row.canonicalId };
}

function contractAssessment(mechanism, contractSet) {
  const item = contractSet.items[0];
  return Object.freeze({
    mechanism,
    contractSet,
    itemId: item.itemId,
    assessmentState: item.assessmentState,
    calculated: Boolean(item.result?.calculated),
    lof: item.result?.governingLof ?? null,
    referenceBand: item.result?.referenceBand ?? null,
    qualificationState: item.qualification?.effective ?? null,
    implementationState: item.implementationState,
    resultState: item.resultState,
    facilityScopeId: item.applicability?.facilityScopeId ?? item.request?.facilityScopeId ?? null,
    readiness: item.readiness,
  });
}

function fitAssessment(row, mechanism, context) {
  const contractSet = buildFitVibrationMechanismAssessmentSet({
    row,
    fitDetail: context.fitDetail ?? null,
    resultState: context.resultState ?? null,
    benchmark: context.benchmark ?? null,
    workingCells: context.workingCells ?? null,
  });
  const assessment = contractAssessment(mechanism, contractSet);
  if (assessment.assessmentState !== 'CALCULATED') return assessment;
  return Object.freeze({ ...assessment, assessmentState: 'CALCULATED_SCREENING' });
}

function mechanicalAssessment(row, mechanism, context) {
  const scopeId = mechanicalFacilityScopeId(row);
  const sourceKeys = context.mechanicalSourceKeysByScope?.[scopeId] ?? [];
  const notApplicable = context.mechanicalNotApplicableByScope?.[scopeId] === true;
  const cachedCandidate = context.mechanicalCandidateResultsByScope?.[scopeId] ?? null;
  const inheritedCurrency = context.resultState === 'STALE_RESULT' ? 'STALE_RESULT' : null;
  const contractSet = buildMechanicalVibrationMechanismAssessmentSet({
    row,
    sourceKeys,
    notApplicable,
    cachedCandidate,
    resultState: context.mechanicalResultState ?? inheritedCurrency,
  });
  const assessment = contractAssessment(mechanism, contractSet);
  if (assessment.assessmentState !== 'CALCULATED') return assessment;
  return Object.freeze({ ...assessment, assessmentState: 'CALCULATED_CANDIDATE' });
}

function sbcAssessment(row, mechanism, context) {
  const scopeId = sbcFacilityScopeId(row);
  const precomputedCandidate = context.sbcCandidateResultsByScope?.[scopeId] ?? null;
  const inheritedCurrency = context.resultState === 'STALE_RESULT' ? 'STALE_RESULT' : null;
  const contractSet = buildSbcVibrationMechanismAssessmentSet({
    row,
    userRows: context.userEngineeringDataRows ?? [],
    governed: context.sbcGoverned ?? {},
    precomputedCandidate,
    resultState: context.sbcResultState ?? inheritedCurrency,
  });
  const assessment = contractAssessment(mechanism, contractSet);
  if (assessment.assessmentState !== 'CALCULATED') return assessment;
  return Object.freeze({ ...assessment, assessmentState: 'CALCULATED_CANDIDATE' });
}

function unavailableAssessment(row, mechanism) {
  const contractSet = createVibrationMechanismAssessmentSet({
    mechanismId: mechanism.id,
    scope: rowScope(row),
    items: [],
  });
  return Object.freeze({
    mechanism,
    contractSet,
    itemId: null,
    assessmentState: 'NOT_IMPLEMENTED',
    calculated: false,
    lof: null,
    referenceBand: null,
    qualificationState: null,
    implementationState: 'NOT_IMPLEMENTED',
    resultState: 'UNRUN',
    facilityScopeId: null,
    readiness: Object.freeze({ missing: [], invalid: [], reasons: [] }),
  });
}

export function buildVibrationMechanismAssessment(row, mechanismId, context = {}) {
  const mechanism = MECHANISM_BY_ID.get(mechanismId);
  if (!mechanism) throw new Error(`Unknown vibration mechanism: ${mechanismId}`);
  if (mechanism.id === 'fit') return fitAssessment(row, mechanism, context);
  if (mechanism.id === 'mechanicalExcitation') return mechanicalAssessment(row, mechanism, context);
  if (mechanism.id === 'smallBoreConnections') return sbcAssessment(row, mechanism, context);
  return unavailableAssessment(row, mechanism);
}

function isScreeningAssessment(assessment) {
  return assessment.implementationState === 'IMPLEMENTED_SCREENING'
    && assessment.qualificationState === 'SCREENING';
}

function isCandidateAssessment(assessment) {
  return assessment.implementationState === 'IMPLEMENTED_CANDIDATE_USER_INPUT'
    || assessment.implementationState === 'IMPLEMENTED_CANDIDATE_MASTER'
    || assessment.qualificationState === 'CANDIDATE_USER_INPUT'
    || assessment.qualificationState === 'CANDIDATE_MASTER';
}

function governingAssessment(assessments, { currentOnly, accept }) {
  const candidates = assessments.filter((assessment) => (
    accept(assessment)
      && assessment.calculated
      && Number.isFinite(Number(assessment.lof))
      && (!currentOnly || assessment.resultState === 'CURRENT_RESULT')
  ));
  if (!candidates.length) return null;
  return candidates.reduce((governing, item) => (
    Number(item.lof) > Number(governing.lof) ? item : governing
  ));
}

function coverageAssessmentSets(assessments, bundle, supplementalSets = []) {
  if (!Array.isArray(supplementalSets)) {
    throw new TypeError('coverageAssessmentSets must be an array when provided.');
  }
  const expectedSet = new Set(bundle.expectedMechanismIds);
  const matrixSets = assessments
    .map((assessment) => assessment.contractSet)
    .filter((set) => set.cardinality.count > 0 && expectedSet.has(set.mechanismId));
  return [...matrixSets, ...supplementalSets];
}

function facilityCoverage(assessments, context) {
  if (context.coverage != null) throw new Error('CALLER_DEFINED_COVERAGE_CONFIG_FORBIDDEN');
  const identificationBundle = createVibrationMechanismIdentificationBundle({
    identifications: context.mechanismIdentifications ?? [],
  });
  const result = evaluateVibrationCoverageAndCompleteness({
    identifications: identificationBundle.identifications,
    knownMechanismIds: identificationBundle.expectedMechanismIds,
    assessmentSets: coverageAssessmentSets(
      assessments,
      identificationBundle,
      context.coverageAssessmentSets ?? [],
    ),
  });
  return { identificationBundle, ...result };
}

export function buildVibrationMechanismMatrixRow(row, context = {}) {
  const assessments = VIBRATION_INTEGRITY_MECHANISMS.map((mechanism) => (
    buildVibrationMechanismAssessment(row, mechanism.id, context)
  ));
  const screeningGoverning = governingAssessment(assessments, {
    currentOnly: true, accept: isScreeningAssessment,
  });
  const candidateGoverning = governingAssessment(assessments, {
    currentOnly: true, accept: isCandidateAssessment,
  });
  const retainedScreeningGoverning = governingAssessment(assessments, {
    currentOnly: false, accept: isScreeningAssessment,
  });
  const retainedCandidateGoverning = governingAssessment(assessments, {
    currentOnly: false, accept: isCandidateAssessment,
  });
  const coverageState = facilityCoverage(assessments, context);
  return Object.freeze({
    row,
    assessments: Object.freeze(assessments),
    screeningGoverning,
    candidateGoverning,
    retainedScreeningGoverning,
    retainedCandidateGoverning,
    implementedGoverning: screeningGoverning,
    retainedImplementedGoverning: retainedScreeningGoverning,
    mechanismIdentificationBundle: coverageState.identificationBundle,
    requiredAssessmentSet: coverageState.requiredAssessmentSet,
    mechanismCoverage: coverageState.coverage,
    assessmentCompleteness: coverageState.completeness,
    fullScreeningGoverningEstablished: false,
  });
}
