import {
  FIT_REFERENCE_AUTHORITY,
  FIT_WORKBOOK_SOURCE,
  fitAdvancedCorrelation,
  fitStandardCorrelation,
} from './method.js';
import {
  evaluateFitApplicability,
  fitAdvancedEligibility,
  resolveFitMultiphaseResolutionMode,
} from './applicability.js';
import { evaluateFitQualificationCoverage } from './qualification-coverage.js';
import { evaluateFitScreeningCandidateScope } from './screening-candidate.js';

function gasViscosityFactor(input) {
  if (input.phase !== 'GAS') return 1;
  return Math.sqrt(input.gasDynamicViscosityPaS / 0.001);
}

function phaseHydraulics(input) {
  const derivedInsideDiameterM = input.outsideDiameterM - 2 * input.wallThicknessM;
  const insideDiameterM = input.insideDiameterM ?? derivedInsideDiameterM;
  const flowAreaM2 = Math.PI * insideDiameterM ** 2 / 4;
  const resolution = resolveFitMultiphaseResolutionMode(input);

  if (input.phase === 'MULTIPHASE' && resolution.mode === 'AGGREGATE_EFFECTIVE') {
    const aggregateVolumetricFlowM3S = input.fluidVelocityMS !== undefined
      ? input.fluidVelocityMS * flowAreaM2
      : input.massFlowKgS / input.densityKgM3;
    return Object.freeze({
      insideDiameterM,
      insideDiameterSource: input.insideDiameterM !== undefined ? 'CALLER' : 'DERIVED_FROM_OD_AND_WALL',
      flowAreaM2,
      gasVolumetricFlowM3S: null,
      liquidVolumetricFlowM3S: null,
      aggregateVolumetricFlowM3S,
      velocityMS: input.fluidVelocityMS ?? aggregateVolumetricFlowM3S / flowAreaM2,
      velocitySource: input.fluidVelocityMS !== undefined ? 'CALLER_OVERRIDE' : 'DERIVED_FROM_AGGREGATE_MASS_AND_DENSITY',
      resolutionMode: resolution.mode,
      resolutionModeSelection: resolution.selection,
      alternateModeDataPresent: resolution.alternateModeDataPresent,
    });
  }

  const gasVolumetricFlowM3S = input.gasMassFlowKgS !== undefined
    ? input.gasMassFlowKgS / input.gasDensityKgM3
    : input.phase === 'GAS' && input.massFlowKgS !== undefined
      ? input.massFlowKgS / input.densityKgM3
      : 0;
  const liquidVolumetricFlowM3S = input.liquidMassFlowKgS !== undefined
    ? input.liquidMassFlowKgS / input.liquidDensityKgM3
    : input.phase === 'LIQUID' && input.massFlowKgS !== undefined
      ? input.massFlowKgS / input.densityKgM3
      : 0;
  const aggregateVolumetricFlowM3S = gasVolumetricFlowM3S + liquidVolumetricFlowM3S;
  const derivedVelocity = aggregateVolumetricFlowM3S / flowAreaM2;
  return Object.freeze({
    insideDiameterM,
    insideDiameterSource: input.insideDiameterM !== undefined ? 'CALLER' : 'DERIVED_FROM_OD_AND_WALL',
    flowAreaM2,
    gasVolumetricFlowM3S,
    liquidVolumetricFlowM3S,
    aggregateVolumetricFlowM3S,
    velocityMS: input.fluidVelocityMS ?? derivedVelocity,
    velocitySource: input.fluidVelocityMS !== undefined ? 'CALLER_OVERRIDE' : 'DERIVED',
    resolutionMode: input.phase === 'MULTIPHASE' ? resolution.mode : 'SINGLE_PHASE',
    resolutionModeSelection: input.phase === 'MULTIPHASE' ? resolution.selection : 'NOT_APPLICABLE',
    alternateModeDataPresent: input.phase === 'MULTIPHASE' ? resolution.alternateModeDataPresent : false,
  });
}

function excitation(input, hydraulics) {
  const velocitySquared = hydraulics.velocityMS ** 2;
  if (input.phase === 'LIQUID' || input.phase === 'GAS'
      || (input.phase === 'MULTIPHASE' && hydraulics.resolutionMode === 'AGGREGATE_EFFECTIVE')) {
    return Object.freeze({
      densityKgM3: input.densityKgM3,
      densitySource: input.phase === 'MULTIPHASE' ? 'CALLER_EFFECTIVE_DENSITY' : 'CALLER',
      rhoV2: input.densityKgM3 * velocitySquared,
    });
  }
  const totalMassFlow = input.gasMassFlowKgS + input.liquidMassFlowKgS;
  const totalVolumetricFlow = hydraulics.gasVolumetricFlowM3S + hydraulics.liquidVolumetricFlowM3S;
  const mixtureDensityKgM3 = totalMassFlow / totalVolumetricFlow;
  return Object.freeze({
    densityKgM3: mixtureDensityKgM3,
    densitySource: 'DERIVED_FROM_COMPONENTS',
    rhoV2: mixtureDensityKgM3 * velocitySquared,
  });
}

function formulaEvidence(advanced = false) {
  const standard = [
    'FIT-EQ-001', 'FIT-EQ-002', 'FIT-EQ-003', 'FIT-EQ-004',
    'FIT-EQ-005', 'FIT-EQ-006', 'FIT-EQ-007', 'FIT-EQ-008',
    'FIT-EQ-009', 'FIT-EQ-010', 'FIT-EQ-011', 'FIT-EQ-012',
    'FIT-EQ-013',
  ];
  return Object.freeze(advanced
    ? [...standard, 'FIT-EQ-014', 'FIT-EQ-015', 'FIT-EQ-016']
    : standard);
}

export function calculateFit(input = {}) {
  const applicability = evaluateFitApplicability(input);
  if (!applicability.applicable) {
    return Object.freeze({
      ok: false,
      errors: applicability.errors,
      applicability,
      authority: FIT_REFERENCE_AUTHORITY,
    });
  }

  const hydraulics = phaseHydraulics(input);
  const sourceTerm = excitation(input, hydraulics);
  const viscosityFactor = gasViscosityFactor(input);
  const demand = sourceTerm.rhoV2 * viscosityFactor;
  const diameterMm = input.outsideDiameterM * 1000;
  const wallThicknessMm = input.wallThicknessM * 1000;
  const correlation = fitStandardCorrelation(diameterMm, wallThicknessMm, applicability.support.category);
  const standard = Object.freeze({
    correlation,
    fluidViscosityFactor: viscosityFactor,
    demand,
    lof: demand / correlation.fv,
  });

  const partial = {
    ok: true,
    input: Object.freeze({ ...input }),
    applicability,
    hydraulics,
    excitation: sourceTerm,
    support: applicability.support,
    standard,
  };
  const eligibility = fitAdvancedEligibility(partial);
  let advanced = null;
  if (eligibility.eligible) {
    const advancedCorrelation = fitAdvancedCorrelation(
      diameterMm,
      wallThicknessMm,
      input.naturalFrequencyHz,
      applicability.support.category,
    );
    advanced = Object.freeze({
      correlation: advancedCorrelation,
      lof: demand / advancedCorrelation.fv,
      naturalFrequencyHz: input.naturalFrequencyHz,
    });
  }

  const calculated = {
    ...partial,
    advancedEligibility: eligibility,
    advanced,
    governingReferenceLof: advanced?.lof ?? standard.lof,
  };
  const qualificationCoverage = evaluateFitQualificationCoverage(calculated);
  const screeningCandidate = evaluateFitScreeningCandidateScope({
    ...calculated,
    qualificationCoverage,
  });

  return Object.freeze({
    ...calculated,
    qualificationCoverage,
    screeningCandidate,
    authority: FIT_REFERENCE_AUTHORITY,
    qualification: Object.freeze({
      method: 'SCREENING',
      data: 'SCREENING',
      designAuthority: false,
      reasons: Object.freeze([
        'CONTROLLED_EI_WORKED_EXAMPLE_PRODUCT_PATH_QUALIFICATION',
        'OWNER_WORKED_EXAMPLE_BENCHMARK_SUFFICIENT_POLICY',
        'BOUNDED_BRANCH_QUALIFICATION_EVIDENCE',
        'QST_003_DIAMETER_GAP_FAIL_CLOSED',
      ]),
    }),
    provenance: Object.freeze({
      source: FIT_WORKBOOK_SOURCE,
      qualificationCoverageId: qualificationCoverage.coverageId,
      screeningCandidateScopeId: screeningCandidate.scopeId,
      qualificationBasis: qualificationCoverage.qualificationBasis ?? null,
    }),
    evidence: Object.freeze({
      equationIds: formulaEvidence(Boolean(advanced)),
      inputResolution: Object.freeze({
        multiphaseResolutionMode: hydraulics.resolutionMode,
        selection: hydraulics.resolutionModeSelection,
        alternateModeDataPresent: hydraulics.alternateModeDataPresent,
      }),
      qualificationCoverage,
      screeningCandidate,
    }),
  });
}
