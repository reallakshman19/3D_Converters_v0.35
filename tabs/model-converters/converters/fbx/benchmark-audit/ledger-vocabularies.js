import { deepFreeze, fail, requireEnum } from './audit-utils.js';

export const POPULATION_KINDS = deepFreeze([
  'ZONE_BRANCH', 'COMPONENT', 'SUPPORT', 'TOPOLOGY_BRANCH',
  'TOPOLOGY_RELATIONSHIP', 'TOPOLOGY_JUNCTION', 'TOPOLOGY_BOUNDARY',
]);
export const DIAGNOSTIC_STATES = deepFreeze([
  'DIAGNOSTIC_CANDIDATE', 'DIAGNOSTIC_COLLISION',
  'DIAGNOSTIC_SPATIAL', 'DIAGNOSTIC_STRUCTURAL',
]);

const POPULATION_KIND_SET = new Set(POPULATION_KINDS);
const DIAGNOSTIC_STATE_SET = new Set(DIAGNOSTIC_STATES);
const paired = (classification) => ({ classification, shape: 'PAIRED' });
const referenceOnly = (classification) => ({ classification, shape: 'REFERENCE_ONLY' });
const actualOnly = (classification) => ({ classification, shape: 'ACTUAL_ONLY' });
const collision = (classification) => ({ classification, shape: 'COLLISION' });
const blockedAuthority = (classification) => ({ classification, shape: 'BLOCKED_AUTHORITY' });

function topologyStates() {
  return {
    EXACT_MATCH: paired('PASS'), APPROVED_EQUIVALENT: paired('OBSERVATION'),
    ENDPOINT_MISMATCH: paired('FAIL'), RELATIONSHIP_KIND_CONFLICT: paired('FAIL'),
    RECIPROCITY_MISMATCH: paired('FAIL'), ZONE_BOUNDARY_MISMATCH: paired('FAIL'),
    MISSING_ACTUAL: referenceOnly('FAIL'), UNEXPECTED_ACTUAL: actualOnly('FAIL'),
    DUPLICATE_EDGE: collision('FAIL'), SELF_CONNECTION: actualOnly('FAIL'),
    DEGREE_MISMATCH: paired('FAIL'), AMBIGUOUS_MATCH: collision('BLOCKED'),
    BLOCKED_IDENTITY: blockedAuthority('BLOCKED'),
  };
}

const DEFINITIONS = {
  ZONE_BRANCH: {
    ledgerSchema: 'FbxZoneMembershipIndex.v1',
    states: {
      ASSIGNED: referenceOnly('PASS'), SHARED_BOUNDARY: referenceOnly('OBSERVATION'),
      CONFLICT: referenceOnly('BLOCKED'), UNASSIGNED: referenceOnly('BLOCKED'),
      EXCLUDED: referenceOnly('BLOCKED'),
    },
  },
  COMPONENT: {
    ledgerSchema: 'FbxComponentBenchmarkReport.v1',
    states: {
      EXACT_MATCH: paired('PASS'), APPROVED_EQUIVALENT: paired('OBSERVATION'),
      TOPOLOGY_MISMATCH: paired('FAIL'), GEOMETRY_MISMATCH: paired('FAIL'),
      ATTRIBUTE_MISMATCH: paired('FAIL'), MISSING_ACTUAL: referenceOnly('FAIL'),
      UNEXPECTED_ACTUAL: actualOnly('FAIL'), AMBIGUOUS_MATCH: collision('BLOCKED'),
      BLOCKED_IDENTITY: blockedAuthority('BLOCKED'),
    },
  },
  SUPPORT: {
    ledgerSchema: 'FbxSupportBenchmarkReport.v1',
    states: {
      EXACT_MATCH: paired('PASS'), APPROVED_EQUIVALENT: paired('OBSERVATION'),
      TYPE_MISMATCH: paired('FAIL'), POSITION_MISMATCH: paired('FAIL'),
      ORIENTATION_MISMATCH: paired('FAIL'), PROPERTY_MISMATCH: paired('FAIL'),
      HOST_MISMATCH: paired('FAIL'), MISSING_ACTUAL: referenceOnly('FAIL'),
      UNEXPECTED_ACTUAL: actualOnly('FAIL'), DUPLICATE_IDENTITY: collision('FAIL'),
      ORPHAN_SUPPORT: paired('FAIL'), AMBIGUOUS_MATCH: collision('BLOCKED'),
      BLOCKED: paired('BLOCKED'),
    },
  },
  TOPOLOGY_BRANCH: { ledgerSchema: 'FbxTopologyBenchmarkReport.v1', states: topologyStates() },
  TOPOLOGY_RELATIONSHIP: { ledgerSchema: 'FbxTopologyBenchmarkReport.v1', states: topologyStates() },
  TOPOLOGY_JUNCTION: { ledgerSchema: 'FbxTopologyBenchmarkReport.v1', states: topologyStates() },
  TOPOLOGY_BOUNDARY: { ledgerSchema: 'FbxTopologyBenchmarkReport.v1', states: topologyStates() },
};

export const LEDGER_VOCABULARIES = deepFreeze(DEFINITIONS);

export function requirePopulationKind(value, label = 'populationKind') {
  return requireEnum(value, POPULATION_KIND_SET, label);
}

export function vocabularyForPopulation(populationKind) {
  return LEDGER_VOCABULARIES[requirePopulationKind(populationKind)];
}

export function requireLedgerSchema(populationKind, value, label = 'ledgerSchema') {
  const expected = vocabularyForPopulation(populationKind).ledgerSchema;
  if (value !== expected) fail('BLOCKED_AUDIT_VOCABULARY', `${label} must be ${expected} for ${populationKind}.`);
  return value;
}

export function requireTerminalState(populationKind, value, label = 'state') {
  const states = vocabularyForPopulation(populationKind).states;
  return requireEnum(value, new Set(Object.keys(states)), label);
}

export function requireDiagnosticState(value, label = 'diagnostic state') {
  return requireEnum(value, DIAGNOSTIC_STATE_SET, label);
}

export function terminalDefinition(populationKind, state) {
  const normalized = requireTerminalState(populationKind, state);
  return vocabularyForPopulation(populationKind).states[normalized];
}

export function terminalClassForState(populationKind, state) {
  return terminalDefinition(populationKind, state).classification;
}
