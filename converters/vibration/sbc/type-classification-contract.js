import { getSbcTypeTraceRecord } from './source-trace.js';

export const SBC_TYPE_CLASSIFICATION_CONTRACT_STATUS = 'SOURCE_GROUNDED_EXAMPLE_SCOPE_NOT_METHOD_FROZEN';

const CONTRACTS = Object.freeze({
  TYPE_1: Object.freeze({
    typeId: 'TYPE_1',
    topologyKind: 'CANTILEVER_SINGLE_PARENT',
    parentConnectionCount: 1,
    parentLineRelationship: 'SINGLE_PARENT_LINE',
    subsequentSpanEvidenceRequired: false,
  }),
  TYPE_2: Object.freeze({
    typeId: 'TYPE_2',
    topologyKind: 'LOOP_BYPASS_SAME_MAIN_LINE',
    parentConnectionCount: 2,
    parentLineRelationship: 'SAME_MAIN_LINE',
    subsequentSpanEvidenceRequired: false,
  }),
  TYPE_3: Object.freeze({
    typeId: 'TYPE_3',
    topologyKind: 'SUPPORTED_FIRST_AND_SUBSEQUENT_SPANS',
    parentConnectionCount: 1,
    parentLineRelationship: 'SINGLE_PARENT_LINE',
    subsequentSpanEvidenceRequired: true,
  }),
  TYPE_4: Object.freeze({
    typeId: 'TYPE_4',
    topologyKind: 'BRIDGE_DISTINCT_PARENT_LINES',
    parentConnectionCount: 2,
    parentLineRelationship: 'DISTINCT_MAIN_LINES',
    subsequentSpanEvidenceRequired: false,
  }),
});

export const SBC_TYPE_CLASSIFICATION_CONTRACTS = Object.freeze(Object.fromEntries(
  Object.entries(CONTRACTS).map(([typeId, contract]) => [typeId, Object.freeze({
    schema: 'SbcTypeClassificationContract.v1',
    status: SBC_TYPE_CLASSIFICATION_CONTRACT_STATUS,
    automaticClassificationAllowed: false,
    classificationAuthority: 'NONE',
    numericalExecutionAllowed: false,
    sourceTrace: getSbcTypeTraceRecord(typeId),
    ...contract,
  })]),
));

function normalizedType(value) {
  return String(value ?? '').trim().toUpperCase();
}

function relationshipOf(topology = {}) {
  const ids = Array.isArray(topology.parentLineIds) ? topology.parentLineIds.filter(Boolean) : [];
  if (ids.length < 2) return ids.length === 1 ? 'SINGLE_PARENT_LINE' : null;
  return new Set(ids).size === 1 ? 'SAME_MAIN_LINE' : 'DISTINCT_MAIN_LINES';
}

function structuralProblems(contract, topology = {}) {
  const problems = [];
  if (topology.topologyKind !== contract.topologyKind) problems.push('TOPOLOGY_KIND_NOT_CONFIRMED');
  if (topology.parentConnectionCount !== contract.parentConnectionCount) problems.push('PARENT_CONNECTION_COUNT_NOT_CONFIRMED');
  if (relationshipOf(topology) !== contract.parentLineRelationship) problems.push('PARENT_LINE_RELATIONSHIP_NOT_CONFIRMED');
  if (contract.subsequentSpanEvidenceRequired && topology.hasSubsequentSpans !== true) {
    problems.push('SUBSEQUENT_SPAN_EVIDENCE_REQUIRED');
  }
  return problems;
}

export function getSbcTypeClassificationContract(typeId) {
  return SBC_TYPE_CLASSIFICATION_CONTRACTS[normalizedType(typeId)] ?? null;
}

export function confirmSbcTypeStructure(declaredType, topology = {}) {
  const typeId = normalizedType(declaredType);
  const contract = getSbcTypeClassificationContract(typeId);
  if (!contract) return Object.freeze({
    status: 'EXPLICIT_TYPE_CONFIRMATION_REQUIRED',
    typeId: null,
    automaticClassificationAllowed: false,
    classificationAuthority: 'NONE',
    numericalExecutionAllowed: false,
    problems: Object.freeze(['SBC_TYPE_1_TO_4_REQUIRED']),
  });
  const problems = structuralProblems(contract, topology);
  return Object.freeze({
    status: problems.length ? 'STRUCTURAL_CONFIRMATION_FAILED' : 'CONFIRMED_EXAMPLE_SCOPE_NOT_QUALIFIED',
    typeId,
    automaticClassificationAllowed: false,
    classificationAuthority: 'NONE',
    numericalExecutionAllowed: false,
    sourceTrace: contract.sourceTrace,
    problems: Object.freeze(problems),
  });
}
