import {
  SBC_TYPE_CLASSIFICATION_CONTRACT_STATUS,
  confirmSbcTypeStructure,
} from './type-classification-contract.js';

export const SBC_TYPE_INPUT_CONTRACT_STATUS = 'SOURCE_GROUNDED_EXAMPLE_SCOPE_NOT_METHOD_FROZEN';

const COMMON_REQUIRED_FIELDS = Object.freeze([
  'connectionId',
  'declaredSbcType',
  'operatingScenario.scenarioId',
  'mainLineAssessment.assessmentId',
  'mainLineAssessment.sourceContract',
  'topology.topologyKind',
  'topology.parentConnectionCount',
  'topology.parentLineIds',
  'geometry.minimumNominalDiameter',
  'attachments.fittings',
  'attachments.valves',
  'locationContext',
]);

const TYPE_REQUIRED_FIELDS = Object.freeze({
  TYPE_1: Object.freeze([
    'geometry.overallBranchLength',
  ]),
  TYPE_2: Object.freeze([
    'topology.returnsToSameMainLine',
    'geometry.branchLegs',
  ]),
  TYPE_3: Object.freeze([
    'topology.hasSubsequentSpans',
    'geometry.firstSpan',
    'geometry.subsequentSpans',
    'supportTopology.firstSpanSupport',
  ]),
  TYPE_4: Object.freeze([
    'topology.bridgesDistinctMainLines',
    'geometry.endLegs',
    'geometry.bridgeSpan',
  ]),
});

const TYPE_NOTES = Object.freeze({
  TYPE_1: Object.freeze([
    'D5 is a cantilever connection example assessed by Flowchart T3-2.',
  ]),
  TYPE_2: Object.freeze([
    'D6 is a loop/bypass example that exits and re-enters the same main line.',
  ]),
  TYPE_3: Object.freeze([
    'D7 is a supported connection example with first-span and subsequent-span evidence.',
    'T3 curve dependencies remain quarantined under issue #514 and are not runtime master inputs.',
  ]),
  TYPE_4: Object.freeze([
    'D8 is a bridge example between two separate parent pipes.',
    'Any required T3 figure evidence remains non-authoritative while curve data are quarantined.',
  ]),
});

function contractFor(typeId) {
  const specific = TYPE_REQUIRED_FIELDS[typeId];
  if (!specific) return null;
  return Object.freeze({
    schema: 'SbcTypeInputContract.v1',
    typeId,
    status: SBC_TYPE_INPUT_CONTRACT_STATUS,
    classificationContractStatus: SBC_TYPE_CLASSIFICATION_CONTRACT_STATUS,
    validationPurpose: 'STRUCTURAL_COMPLETENESS_ONLY',
    numericalExecutionAllowed: false,
    benchmarkExecutionAllowed: false,
    engineeringDefaultsAllowed: false,
    mainLineAssessmentContract: 'QUALIFIED_EI_MAIN_LINE_ASSESSMENT',
    fitOnlyAccepted: false,
    requiredFields: Object.freeze([...COMMON_REQUIRED_FIELDS, ...specific]),
    notes: TYPE_NOTES[typeId],
  });
}

export const SBC_TYPE_INPUT_CONTRACTS = Object.freeze({
  TYPE_1: contractFor('TYPE_1'),
  TYPE_2: contractFor('TYPE_2'),
  TYPE_3: contractFor('TYPE_3'),
  TYPE_4: contractFor('TYPE_4'),
});

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function pathPresent(object, path) {
  const parts = path.split('.');
  let current = object;
  for (const part of parts) {
    if (!own(current, part)) return false;
    current = current[part];
    if (current === null || current === undefined || current === '') return false;
  }
  return true;
}

function mainLineProblems(input = {}) {
  const assessment = input.mainLineAssessment;
  if (!assessment) return [];
  const problems = [];
  if (assessment.fitOnly === true || assessment.sourceContract === 'FIT_LOF_ONLY') {
    problems.push('SBC_MAIN_LINE_FIT_ONLY_NOT_ACCEPTED');
  }
  if (assessment.sourceContract !== 'QUALIFIED_EI_MAIN_LINE_ASSESSMENT') {
    problems.push('SBC_MAIN_LINE_SOURCE_CONTRACT_NOT_DECLARED');
  }
  return problems;
}

export function getSbcTypeInputContract(typeId) {
  return SBC_TYPE_INPUT_CONTRACTS[String(typeId ?? '').trim().toUpperCase()] ?? null;
}

export function validateSbcTypeInputStructure(typeId, input = {}) {
  const contract = getSbcTypeInputContract(typeId);
  if (!contract) return Object.freeze({
    structureComplete: false,
    structuralStatus: 'SBC_TYPE_1_TO_4_REQUIRED',
    numericalExecutionAllowed: false,
    missingFields: Object.freeze([]),
    problems: Object.freeze(['SBC_TYPE_INPUT_CONTRACT_NOT_FOUND']),
  });
  const missingFields = contract.requiredFields.filter((path) => !pathPresent(input, path));
  const typeConfirmation = confirmSbcTypeStructure(input.declaredSbcType, input.topology);
  const problems = [...mainLineProblems(input), ...typeConfirmation.problems];
  const structureComplete = missingFields.length === 0 && problems.length === 0;
  return Object.freeze({
    structureComplete,
    structuralStatus: structureComplete
      ? 'STRUCTURE_COMPLETE_NOT_QUALIFIED_FOR_NUMERICAL_EXECUTION'
      : 'STRUCTURE_INCOMPLETE_OR_UNCONFIRMED',
    typeId: contract.typeId,
    numericalExecutionAllowed: false,
    qualificationEstablished: false,
    missingFields: Object.freeze(missingFields),
    problems: Object.freeze(problems),
    blockers: Object.freeze([
      'SBC_METHOD_SPECIFICATION_NOT_FROZEN',
      'SBC_MAIN_LINE_ASSESSMENT_QUALIFICATION_OWNED_BY_429',
      'SBC_TYPE_B1_B2_QUALIFICATION_REQUIRED',
      'SBC_QUALIFIED_MASTER_DEPENDENCIES_NOT_FROZEN',
    ]),
  });
}
