import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  createEngineeringCalculationError,
} from '../contracts.js';
import { composeEngineeringQualification } from '../qualification.js';
import { evaluateChapterIxUserCalculatedFatigueSpectrum } from '../../b313-chapter-ix/user-calculated-fatigue.js';

export const B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID = 'PIPE.B313.CH9.FATIGUE_USER_CALCULATED';

const QUALIFICATION_REASONS = Object.freeze([
  'USER_CALCULATED_KD3_EXTERNAL_AUTHORITY',
  'CALLER_SUPPLIED_EXTERNAL_DATA_NOT_GOVERNED_BY_REGISTRY',
  'CORE_NATIVE_KD320_NOT_QUALIFIED',
  'CORE_DERIVES_PRESSURE_CYCLE_SALT_AND_MINER_USAGE_ONLY',
  'CODE_COMPLIANCE_NOT_ESTABLISHED',
  'DESIGN_AUTHORITY_NOT_ESTABLISHED',
]);

function qualification() {
  return composeEngineeringQualification({
    method: 'IMPLEMENTED',
    data: 'DRAFT',
    designAuthority: false,
    reasons: QUALIFICATION_REASONS,
  });
}

function normalizedIdentity(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function domainFailure(result) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(
      result.code || 'CALCULATION_FAILED',
      result.message || 'USER_CALCULATED_KD3 evaluation failed.',
      { domainDetails: result.details ?? {} },
      result.details?.field ?? null,
    )],
    qualification: qualification(),
    provenance: {
      engineeringAuthority: 'EXTERNAL_KD3_REVIEW_ONLY',
      calculationMode: 'USER_CALCULATED_KD3',
      codeCompliance: false,
      canUseForDesignAuthority: false,
    },
    evidence: { domainResult: result },
  };
}

function integrationCustodyFailure(code, message, details = {}) {
  return {
    ok: false,
    errors: [createEngineeringCalculationError(code, message, details)],
    qualification: qualification(),
    provenance: {
      engineeringAuthority: 'EXTERNAL_KD3_REVIEW_ONLY',
      calculationMode: 'USER_CALCULATED_KD3',
      codeCompliance: false,
      canUseForDesignAuthority: false,
    },
    evidence: {},
  };
}

function validateIntegrationCustody(externalResults) {
  if (!Array.isArray(externalResults)) return null;
  for (const row of externalResults) {
    const calculatedBy = normalizedIdentity(row?.calculationBasis?.calculatedBy);
    const checkedBy = normalizedIdentity(row?.calculationBasis?.checkedBy);
    if (calculatedBy && checkedBy && calculatedBy === checkedBy) {
      return integrationCustodyFailure(
        'USER_FATIGUE_CHECKER_NOT_INDEPENDENT',
        `${row?.cycleId || '(unknown cycle)'} checker must differ from calculatedBy after identity normalization.`,
        { cycleId: row?.cycleId ?? null },
      );
    }
  }
  return null;
}

function cycleOutput(row) {
  return {
    cycleId: row.cycleId,
    locationId: row.locationId,
    category: row.category,
    fromStateId: row.fromStateId,
    toStateId: row.toStateId,
    appliedCycles: row.appliedCycles,
    pressureRangeMpa: row.pressureRangeMpa,
    coreSaltMpa: row.coreCycleStress.alternatingStressIntensityMpa,
    userSaltMpa: row.saltCrossCheck.userAlternatingStressIntensityMpa,
    saltCrossCheckStatus: row.saltCrossCheck.status,
    saltRelativeDifference: row.saltCrossCheck.relativeDifference,
    equivalentAlternatingStressMpa: row.equivalentAlternatingStressMpa,
    permissibleCycles: row.permissibleCycles,
    zeroDamage: row.zeroDamage,
    usage: row.usage,
    authorities: row.authorities,
    evidence: row.evidence,
    calculationBasis: row.calculationBasis,
    associatedMeanStressMpa: row.associatedMeanStressMpa,
    beta: row.beta,
    saPrimeMpa: row.saPrimeMpa,
  };
}

function checks(result) {
  const rows = result.cycles.map((row) => ({
    id: `B313.CH9.USER_KD3.${row.cycleId}.SALT`,
    label: `${row.cycleId} optional user Salt cross-check`,
    actual: row.saltCrossCheck.userAlternatingStressIntensityMpa,
    allowable: row.saltCrossCheck.coreAlternatingStressIntensityMpa,
    comparator: row.saltCrossCheck.status === 'NOT_PROVIDED' ? 'NOT_PROVIDED' : 'RELATIVE_MATCH',
    status: row.saltCrossCheck.status === 'MISMATCH' ? 'FAIL'
      : row.saltCrossCheck.status === 'MATCH' ? 'PASS' : 'NOT_CHECKED',
    authority: 'REPOSITORY_QA_CROSSCHECK_ONLY',
  }));
  rows.push({
    id: 'B313.CH9.USER_KD3.CUMULATIVE_USAGE',
    label: 'Cumulative Miner usage for supplied external N',
    actual: result.damage.cumulativeUsage,
    allowable: result.damage.usageLimit,
    comparator: '<=',
    status: result.damage.usageWithinUnity ? 'PASS' : 'FAIL',
    authority: 'CORE_DERIVED_REVIEW_ONLY',
  });
  return rows;
}

function calculate(input) {
  const custodyFailure = validateIntegrationCustody(input.externalResults);
  if (custodyFailure) return custodyFailure;

  const result = evaluateChapterIxUserCalculatedFatigueSpectrum({
    outsideDiameterMm: input.outsideDiameter,
    effectiveWallMm: input.effectiveWall,
    spectrum: input.spectrum,
    states: input.states,
    transitions: input.transitions,
    externalResults: input.externalResults,
  });
  if (!result.ok) return domainFailure(result);

  const cycles = result.cycles.map(cycleOutput);
  return {
    ok: true,
    outputs: {
      calculationMode: result.calculationMode,
      calculationState: result.calculationState,
      independentCheckComplete: result.independentCheckComplete,
      cumulativeUsage: result.damage.cumulativeUsage,
      usageLimit: result.damage.usageLimit,
      usageWithinUnity: result.damage.usageWithinUnity,
      referenceStatus: result.referenceStatus,
      cycles,
    },
    intermediates: {
      cycleCount: result.cycles.length,
      formulation: result.formulation,
      transientFormulation: result.transient.formulation,
      damageFormulation: result.damage.formulation,
    },
    checks: checks(result),
    assessment: {
      status: result.damage.usageWithinUnity ? 'REVIEW_WITHIN_UNITY' : 'REVIEW_EXCEEDS_UNITY',
      pass: result.damage.usageWithinUnity,
      authority: 'EXTERNAL_KD3_REVIEW_ONLY',
    },
    qualification: qualification(),
    warnings: [
      {
        code: 'USER_CALCULATED_KD3_REVIEW_ONLY',
        message: 'Seq and permissible cycles N are externally supplied. CORE derives pressure-cycle Salt, optional Salt QA cross-check, and Miner usage only. This result does not establish native CORE KD-3 qualification, ASME Code compliance, or design authority.',
      },
      ...(!result.independentCheckComplete ? [{
        code: 'EXTERNAL_KD3_INDEPENDENT_CHECK_INCOMPLETE',
        message: 'At least one external KD-3 row has not recorded distinct checker custody.',
      }] : []),
    ],
    applicability: {
      applicable: true,
      limitations: [
        'Straight-pipe pressure-cycle Salt reproduction only.',
        'Equivalent alternating stress Seq and permissible cycles N must originate from the controlled external/licensed KD-3 calculation.',
        'Caller-supplied external KD-3 data are not promoted to governed/project-approved master data by this adapter.',
        'Repository Salt comparison tolerance is QA-only and is not an ASME acceptance tolerance.',
        'No native KD320 mean-stress correction is executed.',
        'No routed-system, local discontinuity, component FEA, or non-pressure stress-state qualification is established by this adapter.',
      ],
    },
    provenance: {
      domainApi: 'evaluateChapterIxUserCalculatedFatigueSpectrum',
      calculationMode: result.calculationMode,
      calculationState: result.calculationState,
      engineeringAuthority: 'EXTERNAL_KD3_REVIEW_ONLY',
      externalDataQualification: 'DRAFT',
      codeCompliance: false,
      canUseForDesignAuthority: false,
      independentCheckComplete: result.independentCheckComplete,
    },
    evidence: { domainResult: result },
  };
}

export const B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ENGINEERING_CALCULATION_DEFINITION = Object.freeze({
  contractVersion: ENGINEERING_CALCULATION_CONTRACT_VERSION,
  id: B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
  family: 'PIPE',
  name: 'ASME B31.3 Chapter IX Fatigue — User Calculated KD-3 Intake',
  shortName: 'B31.3 Ch IX User KD-3',
  methodRevision: 'user-calculated-kd3-intake-v1',
  purpose: 'Consume externally calculated VIII-3 KD-3 Seq/N values through the central engineering calculation API while CORE independently reproduces bounded straight-pipe pressure-cycle Salt and Miner usage without promoting native KD-3 authority.',
  authority: {
    calculationState: 'IMPLEMENTED',
    qualificationState: 'IMPLEMENTED',
    codeCompliance: false,
  },
  applicability: {
    description: 'Uniform straight-pipe pressure-cycle fatigue intake with caller-supplied external KD-3 Seq/N evidence.',
    limitations: [
      'Native CORE KD320 is not qualified.',
      'External Seq and N remain user/external calculation authority.',
      'Caller-supplied external data are not automatically project-approved or governed master data.',
      'Design authority and Code compliance are not established.',
    ],
  },
  ui: {
    productSurface: 'ENGINEERING_CALCULATIONS',
    calculationMode: 'USER_CALCULATED_KD3',
    nativeAlternative: 'CORE KD-3 — Not Qualified',
    authorityLabel: 'External KD-3 review only',
  },
  inputs: [
    { key: 'outsideDiameter', label: 'Outside diameter', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
    { key: 'effectiveWall', label: 'Effective wall', type: 'number', required: true, quantity: 'length', canonicalUnit: 'mm', minExclusive: 0 },
    { key: 'spectrum', label: 'Governed transient spectrum', type: 'object', required: true },
    { key: 'states', label: 'Operating states', type: 'table', required: true },
    { key: 'transitions', label: 'Cycle transitions', type: 'table', required: true },
    { key: 'externalResults', label: 'External USER_CALCULATED_KD3 results', type: 'table', required: true },
  ],
  outputs: [
    { key: 'calculationMode', label: 'Calculation mode', type: 'string' },
    { key: 'calculationState', label: 'Calculation state', type: 'string' },
    { key: 'independentCheckComplete', label: 'Independent check complete', type: 'boolean' },
    { key: 'cumulativeUsage', label: 'Cumulative Miner usage', type: 'number', quantity: 'dimensionless', canonicalUnit: null },
    { key: 'usageLimit', label: 'Usage limit', type: 'number', quantity: 'dimensionless', canonicalUnit: null },
    { key: 'usageWithinUnity', label: 'Usage within unity', type: 'boolean' },
    { key: 'referenceStatus', label: 'Reference status', type: 'string' },
    { key: 'cycles', label: 'Cycle result table', type: 'table' },
  ],
  calculate,
});
