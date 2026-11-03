import {
  AIV_ASSESSMENT_RESULT_SCHEMA,
  AIV_LINE_CASE_SUMMARY_SCHEMA,
  AIV_RESULT_SET_SCHEMA,
  AIV_SOURCE_RESULT_SCHEMA,
} from './aiv-result-contracts.js';

export const AIV_KERNEL_CONTRACT_SCHEMA = 'AivKernelContract.v1';
export const AIV_KERNEL_EXECUTION_STATE = Object.freeze({
  CONTRACT_ONLY: 'CONTRACT_ONLY',
  BLOCKED: 'BLOCKED',
});

export const AIV_KERNEL_STAGE_IDS = Object.freeze([
  'VALIDATE_INPUT',
  'RESOLVE_INPUT',
  'EVALUATE_APPLICABILITY',
  'CALCULATE_SOURCE_PWL',
  'APPLY_SOURCE_MODIFIERS',
  'CALCULATE_POINT_ATTENUATION',
  'COMBINE_SIMULTANEOUS_SOURCES',
  'CALCULATE_DISCONTINUITY_RESULT',
  'AGGREGATE_LINE_CASE_RESULT',
  'ASSESS_RESULT',
]);

const BLOCKED_AUTHORITY = Object.freeze({
  calculationState: 'BLOCKED',
  qualificationState: 'BLOCKED',
  engineeringAuthority: 'NONE',
  productionEquationAuthorized: false,
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
});

const STAGES = Object.freeze([
  { stageId: 'VALIDATE_INPUT', input: 'AIV_SPLIT_INPUTS', output: 'VALIDATED_INPUT' },
  { stageId: 'RESOLVE_INPUT', input: 'VALIDATED_INPUT', output: 'RESOLVED_INPUT' },
  { stageId: 'EVALUATE_APPLICABILITY', input: 'RESOLVED_INPUT', output: 'APPLICABILITY_RESULT' },
  { stageId: 'CALCULATE_SOURCE_PWL', input: 'APPLICABLE_SOURCE_CASE', output: AIV_SOURCE_RESULT_SCHEMA },
  { stageId: 'APPLY_SOURCE_MODIFIERS', input: AIV_SOURCE_RESULT_SCHEMA, output: AIV_SOURCE_RESULT_SCHEMA },
  { stageId: 'CALCULATE_POINT_ATTENUATION', input: 'SOURCE_ASSESSMENT_RELATIONSHIP', output: 'SOURCE_POINT_CONTRIBUTION' },
  { stageId: 'COMBINE_SIMULTANEOUS_SOURCES', input: 'SOURCE_POINT_CONTRIBUTIONS', output: 'COMBINED_POINT_PWL' },
  { stageId: 'CALCULATE_DISCONTINUITY_RESULT', input: 'COMBINED_POINT_PWL_AND_ASSESSMENT', output: AIV_ASSESSMENT_RESULT_SCHEMA },
  { stageId: 'AGGREGATE_LINE_CASE_RESULT', input: AIV_ASSESSMENT_RESULT_SCHEMA, output: AIV_LINE_CASE_SUMMARY_SCHEMA },
  { stageId: 'ASSESS_RESULT', input: AIV_RESULT_SET_SCHEMA, output: 'AUTHORITY_SCOPED_ASSESSMENT' },
].map((stage, index) => Object.freeze({
  sequence: index + 1,
  ...stage,
  implementationState: 'CONTRACT_ONLY',
  numericalExecutionAuthorized: false,
})));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function kernelError(code, message) {
  const error = new Error(message);
  error.name = 'AivKernelContractError';
  error.code = code;
  return error;
}

export function buildAivKernelContractPlan() {
  return deepFreeze({
    schema: AIV_KERNEL_CONTRACT_SCHEMA,
    calculationId: 'VIB.AIV.ACOUSTIC',
    executionState: AIV_KERNEL_EXECUTION_STATE.BLOCKED,
    productionExecutionAuthorized: false,
    benchmarkExecutionAuthorized: false,
    screeningExecutionAuthorized: false,
    authority: BLOCKED_AUTHORITY,
    inputContracts: Object.freeze([
      'AivSourceCsv.v2',
      'AivAssessmentCsv.v1',
      'AivSourceAssessmentCsv.v1',
      'VibrationTopologyGraph.v1',
    ]),
    resultContracts: Object.freeze([
      AIV_SOURCE_RESULT_SCHEMA,
      AIV_ASSESSMENT_RESULT_SCHEMA,
      AIV_LINE_CASE_SUMMARY_SCHEMA,
      AIV_RESULT_SET_SCHEMA,
    ]),
    stages: STAGES,
    stageIds: AIV_KERNEL_STAGE_IDS,
    notes: Object.freeze([
      'This object freezes the production-shaped stage contract only; it contains no AIV numerical equations.',
      'Stage order does not grant implementation or engineering authority.',
      'Numerical execution remains isolated to qualification scripts until reviewed authority explicitly changes.',
    ]),
  });
}

export function assertAivKernelExecutionAuthorized() {
  throw kernelError(
    'AIV_KERNEL_EXECUTION_NOT_AUTHORIZED',
    'VIB.AIV.ACOUSTIC kernel execution is not authorized while engineering authority remains BLOCKED.',
  );
}
