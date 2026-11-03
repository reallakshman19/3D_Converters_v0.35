import { createEngineeringCapabilityLifecycle } from '../../engineering-calculations/lifecycle.js';

export const SBC_PUBLIC_CALCULATION_ID = 'VIB.SBC.SMALL_BORE';
export const SBC_ASSESSMENT_UNIT_TYPE = 'SBC_CONNECTION';
export const SBC_VERTICAL_MANIFEST_VERSION = 'SbcVerticalManifest.v1';

export const SBC_VERTICAL_ISSUES = Object.freeze({
  scaffold: 563,
  family: 429,
  type3Evidence: 514,
  roadmapPr: 560,
});

export const SBC_TYPE_IDS = Object.freeze(['TYPE_1', 'TYPE_2', 'TYPE_3', 'TYPE_4']);

export const SBC_METHOD_STAGE_IDS = Object.freeze([
  'VALIDATE_SBC_CONNECTION',
  'RESOLVE_COHERENT_OPERATING_SCENARIO',
  'RESOLVE_QUALIFIED_EI_MAIN_LINE_ASSESSMENT',
  'CLASSIFY_OR_CONFIRM_SBC_TYPE',
  'RESOLVE_QUALIFIED_TYPE_INPUTS_AND_MASTERS',
  'EXECUTE_QUALIFIED_TYPE_KERNEL',
  'ASSESS_SBC_LOF_REFERENCE_BAND',
  'PRODUCE_REQUIRED_ACTIONS',
  'RETURN_PROVENANCE_EVIDENCE_AUTHORITY',
]);

export const SBC_CONTROLLED_STRUCTURE_SEQUENCE = Object.freeze([
  'METHOD_SPECIFICATION',
  'SOURCE_TRACE_REGISTER',
  'BENCHMARK_REGISTRY',
  'TYPE_INPUT_CONTRACTS',
  'APPLICABILITY_TYPE_CLASSIFICATION',
  'QUALIFIED_MASTER_DEPENDENCIES',
  'PURE_TYPE_KERNELS',
]);

export const SBC_CONTROLLED_ARTIFACTS = Object.freeze({
  METHOD_SPECIFICATION: Object.freeze({
    path: 'docs/vibration/SBC-Engineering-Method-Specification-v1.md',
    status: 'SCAFFOLD_PRESENT_NOT_FROZEN',
  }),
  SOURCE_TRACE_REGISTER: Object.freeze({
    path: 'docs/vibration/SBC-source-trace-register-v1.md',
    status: 'SCAFFOLD_PRESENT_NOT_FROZEN',
  }),
  BENCHMARK_REGISTRY: Object.freeze({
    path: 'Benchmarks/VibrationSBC/sbc-benchmark-registry-v1.json',
    status: 'SCAFFOLD_PRESENT_NOT_FROZEN',
  }),
  TYPE_INPUT_CONTRACTS: Object.freeze({ status: 'NOT_FROZEN' }),
  APPLICABILITY_TYPE_CLASSIFICATION: Object.freeze({ status: 'NOT_FROZEN' }),
  QUALIFIED_MASTER_DEPENDENCIES: Object.freeze({ status: 'NOT_FROZEN' }),
  PURE_TYPE_KERNELS: Object.freeze({ status: 'NOT_QUALIFIED' }),
});

export const SBC_VERTICAL_LIFECYCLE = createEngineeringCapabilityLifecycle({
  state: 'RESERVED',
  issueNumbers: [SBC_VERTICAL_ISSUES.scaffold, SBC_VERTICAL_ISSUES.family],
  notes: [
    'Public API/UI slot exists but SBC numerical execution remains fail-closed.',
    'Qualification and authority promotion are separate reviewed operations.',
  ],
});

const COMMON_BLOCKERS = Object.freeze([
  'SBC_ENGINEERING_METHOD_SPECIFICATION_NOT_FROZEN',
  'SBC_SOURCE_TRACE_REGISTER_NOT_FROZEN',
  'SBC_BENCHMARK_REGISTRY_NOT_FROZEN',
  'SBC_TYPE_INPUT_CONTRACTS_NOT_FROZEN',
  'SBC_APPLICABILITY_CLASSIFICATION_NOT_FROZEN',
  'SBC_QUALIFIED_MASTER_DEPENDENCIES_NOT_FROZEN',
  'SBC_PURE_TYPE_KERNELS_NOT_QUALIFIED',
  'SBC_MAIN_LINE_ASSESSMENT_CONTRACT_NOT_QUALIFIED',
  'SBC_REQUIRED_ACTION_CONTRACT_NOT_QUALIFIED',
]);

function typeArtifactRefs(typeId, exampleId) {
  return Object.freeze({
    methodSpecification: SBC_CONTROLLED_ARTIFACTS.METHOD_SPECIFICATION.path,
    sourceTraceRegister: SBC_CONTROLLED_ARTIFACTS.SOURCE_TRACE_REGISTER.path,
    benchmarkRegistry: SBC_CONTROLLED_ARTIFACTS.BENCHMARK_REGISTRY.path,
    b1RegistryId: `SBC-B1-${typeId}-${exampleId}`,
    b2RegistryId: `SBC-B2-${typeId}-INDEPENDENT`,
    inputContractStatus: SBC_CONTROLLED_ARTIFACTS.TYPE_INPUT_CONTRACTS.status,
    applicabilityClassificationStatus: SBC_CONTROLLED_ARTIFACTS.APPLICABILITY_TYPE_CLASSIFICATION.status,
    qualifiedMasterDependenciesStatus: SBC_CONTROLLED_ARTIFACTS.QUALIFIED_MASTER_DEPENDENCIES.status,
    pureTypeKernelStatus: SBC_CONTROLLED_ARTIFACTS.PURE_TYPE_KERNELS.status,
  });
}

function typeSlot(typeId, exampleId, nextFile, targetFunction, options = {}) {
  return Object.freeze({
    schema: 'SbcTypeImplementationSlot.v1',
    typeId,
    assessmentUnitType: SBC_ASSESSMENT_UNIT_TYPE,
    lifecycle: SBC_VERTICAL_LIFECYCLE,
    executionAllowed: false,
    owningIssues: Object.freeze([
      SBC_VERTICAL_ISSUES.scaffold,
      SBC_VERTICAL_ISSUES.family,
      ...(options.issueNumbers ?? []),
    ]),
    benchmarkRequirements: Object.freeze({
      publishedB1: Object.freeze({ required: true, exampleId }),
      independentB2: Object.freeze({ required: true, minimumFamilies: 1 }),
      branchBoundaryRegression: 'REQUIRED_ADDITIONAL_EVIDENCE',
    }),
    controlledArtifacts: typeArtifactRefs(typeId, exampleId),
    requiredTraceNamespaces: Object.freeze([
      'SBC-APP-*', 'SBC-TYPE-*', 'SBC-EQ-*', 'SBC-TBL-*',
      'SBC-FIG-*', 'SBC-CONST-*', 'SBC-ASS-*', 'SBC-SRC-*', 'SBC-UNIT-*',
    ]),
    blockedBy: Object.freeze([...COMMON_BLOCKERS, ...(options.blockedBy ?? [])]),
    nextImplementationSeam: nextFile,
    implementationTarget: targetFunction,
  });
}

export const SBC_TYPE_IMPLEMENTATION_SLOTS = Object.freeze({
  TYPE_1: typeSlot('TYPE_1', 'EI_APPENDIX_D5', 'converters/vibration/sbc/type1/calculate-type1.js', 'calculateSbcType1'),
  TYPE_2: typeSlot('TYPE_2', 'EI_APPENDIX_D6', 'converters/vibration/sbc/type2/calculate-type2.js', 'calculateSbcType2'),
  TYPE_3: typeSlot('TYPE_3', 'EI_APPENDIX_D7', 'converters/vibration/sbc/type3/calculate-type3.js', 'calculateSbcType3', {
    issueNumbers: [SBC_VERTICAL_ISSUES.type3Evidence],
    blockedBy: [
      'SBC_T3_CURVES_BLOCKED_SOURCE_DATA_CONFLICT',
      'SBC_TYPE3_INDEPENDENT_B2_NOT_FROZEN',
      'EXISTING_TYPE3_CANDIDATE_NOT_PRODUCTION_AUTHORITY',
    ],
  }),
  TYPE_4: typeSlot('TYPE_4', 'EI_APPENDIX_D8', 'converters/vibration/sbc/type4/calculate-type4.js', 'calculateSbcType4'),
});

export const SBC_MAIN_LINE_INPUT_REQUIREMENT = Object.freeze({
  sourceContract: 'QUALIFIED_EI_MAIN_LINE_ASSESSMENT',
  fitOnlyAccepted: false,
  assessmentCompletenessRequired: true,
  unknownMainLineRule: 'SOURCE_QUALIFICATION_REQUIRED_BEFORE_IMPLEMENTATION',
});

export function getSbcTypeImplementationSlot(typeId) {
  const key = String(typeId ?? '').trim().toUpperCase();
  return SBC_TYPE_IMPLEMENTATION_SLOTS[key] ?? null;
}
