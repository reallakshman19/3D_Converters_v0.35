import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  AIV_KERNEL_CANDIDATE_POINT_CONTRIBUTION_SCHEMA,
  buildAivKernelCandidateStatus,
  calculateAivKernelCandidatePointContribution,
  calculateAivKernelCandidateSource,
  combineAivKernelCandidatePointContributions,
} from '../converters/vibration/aiv/aiv-kernel-candidate.js';
import { AIV_D23_PDF_REVALIDATION } from '../converters/vibration/aiv/aiv-d23-pdf-revalidation.js';
import { solveAivD23QualificationExample } from './solve-aiv-d23-qualification.mjs';
import { solveAivIndependentQualificationBenchmarks } from './solve-aiv-independent-qualification-benchmarks.mjs';

export const AIV_KERNEL_CANDIDATE_PARITY_SCHEMA = 'AivKernelCandidateParity.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function quantity(value, unit) { return { value, unit }; }

function sourceRecord(caseId) {
  const evidence = AIV_D23_PDF_REVALIDATION.sourceCases[caseId];
  const relief = caseId === 'relief';
  return {
    sourceCanonicalId: relief ? 'AIV-D23-RELIEF-SOURCE' : 'AIV-D23-RECYCLE-SOURCE',
    caseId: relief ? 'D2.3-RELIEF' : 'D2.3-RECYCLE',
    sourceDeviceType: relief ? 'RELIEF_VALVE' : 'CONTROL_VALVE',
    sourceState: relief ? 'RELIEVING' : 'OPEN',
    phase: 'GAS',
    massFlow: quantity(evidence.massFlow.value, evidence.massFlow.unit),
    upstreamPressure: { value: evidence.upstreamPressure.value, unit: 'bar', basis: 'GAUGE' },
    downstreamPressure: { value: evidence.downstreamPressure.value, unit: 'bar', basis: 'GAUGE' },
    referencePressure: quantity(1, 'bar'),
    referencePressureSource: 'EI D.2.3 displayed gauge-to-absolute pressure conversion',
    referencePressureSourceRevision: AIV_D23_PDF_REVALIDATION.readableWorkedExampleSource.derivedFrom.commit,
    upstreamTemperature: quantity(evidence.upstreamTemperature.value, evidence.upstreamTemperature.unit),
    molecularWeight: quantity(evidence.molecularWeight.value, evidence.molecularWeight.unit),
    lowNoiseTrim: relief ? { state: 'NONE' } : {
      state: 'MANUFACTURER_REDUCTION',
      reduction: quantity(evidence.lowNoiseTrim.reduction.value, evidence.lowNoiseTrim.reduction.unit),
      source: 'EI D.2.3 reported manufacturer low-noise trim reduction',
      sourceRevision: AIV_D23_PDF_REVALIDATION.readableWorkedExampleSource.commit,
    },
    sonicState: evidence.sonicState,
    source: AIV_D23_PDF_REVALIDATION.readableWorkedExampleSource.path,
    sourceRevision: AIV_D23_PDF_REVALIDATION.readableWorkedExampleSource.commit,
    recordId: relief ? 'D2.3-RELIEF-SOURCE' : 'D2.3-RECYCLE-SOURCE',
  };
}

const assessment = Object.freeze({
  assessmentCanonicalId: 'AIV-D23-WELDOLET-01',
  mainInsideDiameter: quantity(
    AIV_D23_PDF_REVALIDATION.reliefFirstDiscontinuity.mainPipeInsideDiameter.value,
    AIV_D23_PDF_REVALIDATION.reliefFirstDiscontinuity.mainPipeInsideDiameter.unit,
  ),
});

const relationship = Object.freeze({
  sourceCanonicalId: 'AIV-D23-RELIEF-SOURCE',
  assessmentCanonicalId: 'AIV-D23-WELDOLET-01',
  caseId: 'D2.3-RELIEF',
  physicalDistance: quantity(
    AIV_D23_PDF_REVALIDATION.reliefFirstDiscontinuity.sourceToAssessmentDistance.value,
    AIV_D23_PDF_REVALIDATION.reliefFirstDiscontinuity.sourceToAssessmentDistance.unit,
  ),
  distanceSource: 'EI D.2.3 source-to-first-discontinuity distance',
  distanceSourceRevision: AIV_D23_PDF_REVALIDATION.readableWorkedExampleSource.commit,
  applicabilityDisposition: 'APPLICABLE',
  source: AIV_D23_PDF_REVALIDATION.readableWorkedExampleSource.path,
  sourceRevision: AIV_D23_PDF_REVALIDATION.readableWorkedExampleSource.commit,
});

function check(checkId, actual, expected, toleranceAbs) {
  const absoluteDifference = Math.abs(actual - expected);
  return {
    checkId,
    actual,
    expected,
    toleranceAbs,
    absoluteDifference,
    status: absoluteDifference <= toleranceAbs ? 'PASS' : 'FAIL',
  };
}

function candidateSyntheticContribution(sourceCanonicalId, pointPwlDb) {
  return {
    schema: AIV_KERNEL_CANDIDATE_POINT_CONTRIBUTION_SCHEMA,
    sourceCanonicalId,
    assessmentCanonicalId: 'AIV-HAND-ASSESSMENT',
    caseId: 'AIV-HAND-CASE',
    pointPwlDb,
  };
}

export function buildAivKernelCandidateParity() {
  const qualificationD23 = solveAivD23QualificationExample();
  const independent = solveAivIndependentQualificationBenchmarks();
  const relief = calculateAivKernelCandidateSource(sourceRecord('relief'));
  const recycle = calculateAivKernelCandidateSource(sourceRecord('recycle'));
  const reliefPoint = calculateAivKernelCandidatePointContribution({ sourceResult: relief, relationship, assessment });

  const sonicQualification = independent.results.find((row) => row.benchmarkId === 'AIV-HAND-SONIC-SFF6-001');
  const sonic = calculateAivKernelCandidateSource({
    ...sourceRecord('relief'),
    sourceCanonicalId: 'AIV-HAND-SONIC-SOURCE',
    caseId: 'AIV-HAND-SONIC',
    upstreamPressure: { value: 5, unit: 'MPa', basis: 'ABSOLUTE' },
    downstreamPressure: { value: 1, unit: 'MPa', basis: 'ABSOLUTE' },
    massFlow: quantity(10, 'kg/s'),
    upstreamTemperature: quantity(300, 'K'),
    molecularWeight: quantity(20, 'g/mol'),
    sonicState: 'SONIC',
  });

  const equalQualification = independent.results.find((row) => row.benchmarkId === 'AIV-HAND-MULTI-SOURCE-EQUAL-001');
  const asymmetricQualification = independent.results.find((row) => row.benchmarkId === 'AIV-HAND-MULTI-SOURCE-ASYM-001');
  const equal = combineAivKernelCandidatePointContributions([
    candidateSyntheticContribution('SRC-1', 160),
    candidateSyntheticContribution('SRC-2', 160),
  ]);
  const asymmetric = combineAivKernelCandidatePointContributions([
    candidateSyntheticContribution('SRC-1', 160),
    candidateSyntheticContribution('SRC-2', 150),
  ]);

  const checks = [
    check('RELIEF_RAW_SOURCE_PWL', relief.rawSourcePwlDb, qualificationD23.sourceResults.relief.calculatedRawSourcePwlDb, 1e-10),
    check('RECYCLE_RAW_SOURCE_PWL', recycle.rawSourcePwlDb, qualificationD23.sourceResults.recycle.calculatedRawSourcePwlDb, 1e-10),
    check('RECYCLE_EFFECTIVE_SOURCE_PWL', recycle.effectiveSourcePwlDb, qualificationD23.sourceResults.recycle.calculatedEffectiveSourcePwlDb, 1e-10),
    check('RELIEF_ATTENUATION', reliefPoint.attenuationDb, qualificationD23.reliefFirstDiscontinuity.calculatedAttenuationDb, 1e-12),
    check('RELIEF_POINT_PWL', reliefPoint.pointPwlDb, qualificationD23.reliefFirstDiscontinuity.calculatedPointPwlDb, 1e-10),
    check('SONIC_SFF6_PWL', sonic.rawSourcePwlDb, sonicQualification.calculated.sonicPwlDb, 1e-10),
    check('MULTI_SOURCE_EQUAL', equal.combinedPointPwlDb, equalQualification.calculated.combinedPwlDb, 1e-12),
    check('MULTI_SOURCE_ASYMMETRIC', asymmetric.combinedPointPwlDb, asymmetricQualification.calculated.combinedPwlDb, 1e-12),
  ];
  const failed = checks.filter((item) => item.status !== 'PASS');
  return deepFreeze({
    schema: AIV_KERNEL_CANDIDATE_PARITY_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    candidateStatus: buildAivKernelCandidateStatus(),
    status: failed.length === 0 ? 'CANDIDATE_PARITY_PASS' : 'CANDIDATE_PARITY_FAIL',
    counts: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    checks,
    sourceIdentity: {
      readableWorkedExample: AIV_D23_PDF_REVALIDATION.readableWorkedExampleSource,
      corroboratingPdf: AIV_D23_PDF_REVALIDATION.source,
    },
    authority: {
      calculationState: 'BLOCKED',
      qualificationState: 'BLOCKED',
      engineeringAuthority: 'NONE',
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    blockedStages: [
      'CALCULATE_DISCONTINUITY_RESULT',
      'AGGREGATE_LINE_CASE_RESULT',
      'ASSESS_RESULT',
    ],
    notes: [
      'This manifest compares the independent production-shaped candidate stages 1–7 against the isolated qualification solve.',
      'It does not qualify T2-6 discontinuity arithmetic, line/case aggregation, assessment, screening authority, or design authority.',
    ],
  });
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) process.stdout.write(`${JSON.stringify(buildAivKernelCandidateParity(), null, 2)}\n`);
