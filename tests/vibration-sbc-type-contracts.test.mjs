import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SBC_APPLICABILITY_TRACE_RECORDS,
  SBC_SOURCE_IDENTITIES,
  SBC_SOURCE_TRACE_STATUS,
  SBC_TYPE_TRACE_RECORDS,
} from '../converters/vibration/sbc/source-trace.js';
import {
  SBC_TYPE_CLASSIFICATION_CONTRACTS,
  SBC_TYPE_CLASSIFICATION_CONTRACT_STATUS,
  confirmSbcTypeStructure,
} from '../converters/vibration/sbc/type-classification-contract.js';
import {
  SBC_TYPE_INPUT_CONTRACTS,
  SBC_TYPE_INPUT_CONTRACT_STATUS,
  validateSbcTypeInputStructure,
} from '../converters/vibration/sbc/type-input-contracts.js';
import {
  SBC_CONTROLLED_ARTIFACTS,
  SBC_TYPE_IDS,
  SBC_VERTICAL_LIFECYCLE,
} from '../converters/vibration/sbc/vertical-manifest.js';

const TOPOLOGY = Object.freeze({
  TYPE_1: { topologyKind: 'CANTILEVER_SINGLE_PARENT', parentConnectionCount: 1, parentLineIds: ['P-1'] },
  TYPE_2: { topologyKind: 'LOOP_BYPASS_SAME_MAIN_LINE', parentConnectionCount: 2, parentLineIds: ['P-2', 'P-2'] },
  TYPE_3: { topologyKind: 'SUPPORTED_FIRST_AND_SUBSEQUENT_SPANS', parentConnectionCount: 1, parentLineIds: ['P-3'], hasSubsequentSpans: true },
  TYPE_4: { topologyKind: 'BRIDGE_DISTINCT_PARENT_LINES', parentConnectionCount: 2, parentLineIds: ['P-4A', 'P-4B'] },
});

function completeInput(typeId) {
  const input = {
    connectionId: `C-${typeId}`,
    declaredSbcType: typeId,
    operatingScenario: { scenarioId: 'NORMAL' },
    mainLineAssessment: { assessmentId: 'ML-001', sourceContract: 'QUALIFIED_EI_MAIN_LINE_ASSESSMENT' },
    topology: { ...TOPOLOGY[typeId] },
    geometry: { minimumNominalDiameter: { value: 1, unit: 'in' } },
    attachments: { fittings: [{ id: 'F-1' }], valves: [] },
    locationContext: { source: 'PROJECT_EVIDENCE' },
  };
  if (typeId === 'TYPE_1') input.geometry.overallBranchLength = { value: 500, unit: 'mm' };
  if (typeId === 'TYPE_2') {
    input.topology.returnsToSameMainLine = true;
    input.geometry.branchLegs = [{ id: 'A' }, { id: 'B' }];
  }
  if (typeId === 'TYPE_3') {
    input.geometry.firstSpan = { length: { value: 0.9, unit: 'm' } };
    input.geometry.subsequentSpans = [{ id: 'S-2' }];
    input.supportTopology = { firstSpanSupport: { id: 'SUP-1' } };
  }
  if (typeId === 'TYPE_4') {
    input.topology.bridgesDistinctMainLines = true;
    input.geometry.endLegs = [{ id: 'H' }, { id: 'I' }];
    input.geometry.bridgeSpan = { value: 3, unit: 'm' };
  }
  return input;
}

test('source trace pins identities without granting engineering qualification', () => {
  assert.equal(SBC_SOURCE_TRACE_STATUS, 'REFERENCE_ROWS_POPULATED_NOT_ENGINEERING_QUALIFIED');
  assert.equal(SBC_SOURCE_IDENTITIES.EI_GUIDELINES_CONTROLLED_PDF.blob, '9d3eccc56429411e17c07a579bdebbd13cb0bdc5');
  assert.equal(SBC_SOURCE_IDENTITIES.EI_APPENDIX_D_STRUCTURED_TRANSCRIPTION.blob, 'c050cd90802c27241c510c6f0ac43bfaf7a89e9d');
  assert.equal(SBC_SOURCE_IDENTITIES.EI_T3_STRUCTURED_TRANSCRIPTION.blob, '5312c9e2cf86af9e940ba722fcbee64702aeccd3');
  for (const record of Object.values(SBC_APPLICABILITY_TRACE_RECORDS)) {
    assert.equal(record.useAllowed, 'APPLICABILITY_LABEL_ONLY');
    assert.equal(record.numericalCurveUseAllowed === true || record.numericalTableUseAllowed === true, false);
  }
});

test('Type 1-4 classification remains explicit confirmation, never automatic inference', () => {
  assert.equal(SBC_TYPE_CLASSIFICATION_CONTRACT_STATUS, 'SOURCE_GROUNDED_EXAMPLE_SCOPE_NOT_METHOD_FROZEN');
  for (const typeId of SBC_TYPE_IDS) {
    const contract = SBC_TYPE_CLASSIFICATION_CONTRACTS[typeId];
    const result = confirmSbcTypeStructure(typeId, TOPOLOGY[typeId]);
    assert.equal(contract.automaticClassificationAllowed, false);
    assert.equal(contract.classificationAuthority, 'NONE');
    assert.equal(result.status, 'CONFIRMED_EXAMPLE_SCOPE_NOT_QUALIFIED');
    assert.equal(result.numericalExecutionAllowed, false);
    assert.equal(result.sourceTrace.traceId, SBC_TYPE_TRACE_RECORDS[typeId].traceId);
  }
  assert.equal(confirmSbcTypeStructure(null, {}).status, 'EXPLICIT_TYPE_CONFIRMATION_REQUIRED');
});

test('classification fails closed on topology contradiction', () => {
  const result = confirmSbcTypeStructure('TYPE_4', {
    topologyKind: 'BRIDGE_DISTINCT_PARENT_LINES',
    parentConnectionCount: 2,
    parentLineIds: ['P-1', 'P-1'],
  });
  assert.equal(result.status, 'STRUCTURAL_CONFIRMATION_FAILED');
  assert.equal(result.problems.includes('PARENT_LINE_RELATIONSHIP_NOT_CONFIRMED'), true);
});

test('each Type input contract has no engineering defaults and cannot authorize numerics', () => {
  assert.equal(SBC_TYPE_INPUT_CONTRACT_STATUS, 'SOURCE_GROUNDED_EXAMPLE_SCOPE_NOT_METHOD_FROZEN');
  for (const typeId of SBC_TYPE_IDS) {
    const contract = SBC_TYPE_INPUT_CONTRACTS[typeId];
    assert.equal(contract.engineeringDefaultsAllowed, false);
    assert.equal(contract.numericalExecutionAllowed, false);
    assert.equal(contract.benchmarkExecutionAllowed, false);
    assert.equal(Object.hasOwn(contract, 'engineeringDefault'), false);
    const result = validateSbcTypeInputStructure(typeId, completeInput(typeId));
    assert.equal(result.structureComplete, true);
    assert.equal(result.structuralStatus, 'STRUCTURE_COMPLETE_NOT_QUALIFIED_FOR_NUMERICAL_EXECUTION');
    assert.equal(result.qualificationEstablished, false);
    assert.equal(result.numericalExecutionAllowed, false);
  }
});

test('FIT-only main-line substitution and missing Type fields fail structural validation', () => {
  const fitOnly = completeInput('TYPE_1');
  fitOnly.mainLineAssessment = { assessmentId: 'FIT-1', sourceContract: 'FIT_LOF_ONLY', fitOnly: true };
  const fitResult = validateSbcTypeInputStructure('TYPE_1', fitOnly);
  assert.equal(fitResult.structureComplete, false);
  assert.equal(fitResult.problems.includes('SBC_MAIN_LINE_FIT_ONLY_NOT_ACCEPTED'), true);

  const missing = completeInput('TYPE_3');
  delete missing.supportTopology;
  const missingResult = validateSbcTypeInputStructure('TYPE_3', missing);
  assert.equal(missingResult.structureComplete, false);
  assert.equal(missingResult.missingFields.includes('supportTopology.firstSpanSupport'), true);
});

test('manifest links contracts while lifecycle and controlled artifacts remain unqualified', () => {
  assert.equal(SBC_VERTICAL_LIFECYCLE.state, 'RESERVED');
  assert.equal(SBC_CONTROLLED_ARTIFACTS.TYPE_INPUT_CONTRACTS.status, 'NOT_FROZEN');
  assert.equal(SBC_CONTROLLED_ARTIFACTS.TYPE_INPUT_CONTRACTS.structuralContractStatus, SBC_TYPE_INPUT_CONTRACT_STATUS);
  assert.equal(SBC_CONTROLLED_ARTIFACTS.APPLICABILITY_TYPE_CLASSIFICATION.status, 'NOT_FROZEN');
  assert.equal(SBC_CONTROLLED_ARTIFACTS.APPLICABILITY_TYPE_CLASSIFICATION.automaticClassificationAllowed, false);
  assert.equal(SBC_CONTROLLED_ARTIFACTS.SOURCE_TRACE_REGISTER.populationStatus, 'REFERENCE_ROWS_POPULATED_NOT_ENGINEERING_QUALIFIED');
});

test('source register states reference-only population and Type-3 quarantine', async () => {
  const text = await readFile(new URL('../docs/vibration/SBC-source-trace-register-v1.md', import.meta.url), 'utf8');
  assert.match(text, /REFERENCE_ROWS_POPULATED_NOT_ENGINEERING_QUALIFIED/u);
  assert.match(text, /automatic classifier/u);
  assert.match(text, /BLOCKED_SOURCE_DATA_CONFLICT/u);
  assert.match(text, /D7 is an oracle, never calibration data/u);
  assert.doesNotMatch(text, /productionExecution\s*=\s*ALLOWED/u);
});
