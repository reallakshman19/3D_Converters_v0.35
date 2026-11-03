import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SBC_CONTROLLED_ARTIFACTS,
  SBC_CONTROLLED_STRUCTURE_SEQUENCE,
  SBC_METHOD_STAGE_IDS,
  SBC_TYPE_IDS,
  SBC_TYPE_IMPLEMENTATION_SLOTS,
  SBC_VERTICAL_LIFECYCLE,
} from '../converters/vibration/sbc/vertical-manifest.js';

const B1 = Object.freeze({
  TYPE_1: 'EI_APPENDIX_D5',
  TYPE_2: 'EI_APPENDIX_D6',
  TYPE_3: 'EI_APPENDIX_D7',
  TYPE_4: 'EI_APPENDIX_D8',
});

const EXPECTED_SEQUENCE = Object.freeze([
  'METHOD_SPECIFICATION',
  'SOURCE_TRACE_REGISTER',
  'BENCHMARK_REGISTRY',
  'TYPE_INPUT_CONTRACTS',
  'APPLICABILITY_TYPE_CLASSIFICATION',
  'QUALIFIED_MASTER_DEPENDENCIES',
  'PURE_TYPE_KERNELS',
]);

test('SBC controlled structural work is ordered before pure kernels', () => {
  assert.deepEqual(SBC_CONTROLLED_STRUCTURE_SEQUENCE, EXPECTED_SEQUENCE);
  assert.equal(SBC_VERTICAL_LIFECYCLE.state, 'RESERVED');
  assert.equal(SBC_CONTROLLED_ARTIFACTS.METHOD_SPECIFICATION.status, 'SCAFFOLD_PRESENT_NOT_FROZEN');
  assert.equal(SBC_CONTROLLED_ARTIFACTS.SOURCE_TRACE_REGISTER.status, 'SCAFFOLD_PRESENT_NOT_FROZEN');
  assert.equal(SBC_CONTROLLED_ARTIFACTS.BENCHMARK_REGISTRY.status, 'SCAFFOLD_PRESENT_NOT_FROZEN');
  assert.equal(SBC_CONTROLLED_ARTIFACTS.TYPE_INPUT_CONTRACTS.status, 'NOT_FROZEN');
  assert.equal(SBC_CONTROLLED_ARTIFACTS.PURE_TYPE_KERNELS.status, 'NOT_QUALIFIED');
});

test('method stage contract preserves qualified main-line and required-action boundaries', () => {
  assert.deepEqual(SBC_METHOD_STAGE_IDS, [
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
});

test('every Type slot points to controlled artifacts and remains blocked before input contracts', () => {
  for (const typeId of SBC_TYPE_IDS) {
    const slot = SBC_TYPE_IMPLEMENTATION_SLOTS[typeId];
    assert.equal(slot.controlledArtifacts.methodSpecification, SBC_CONTROLLED_ARTIFACTS.METHOD_SPECIFICATION.path);
    assert.equal(slot.controlledArtifacts.sourceTraceRegister, SBC_CONTROLLED_ARTIFACTS.SOURCE_TRACE_REGISTER.path);
    assert.equal(slot.controlledArtifacts.benchmarkRegistry, SBC_CONTROLLED_ARTIFACTS.BENCHMARK_REGISTRY.path);
    assert.equal(slot.controlledArtifacts.b1RegistryId, `SBC-B1-${typeId}-${B1[typeId]}`);
    assert.equal(slot.controlledArtifacts.b2RegistryId, `SBC-B2-${typeId}-INDEPENDENT`);
    assert.equal(slot.controlledArtifacts.inputContractStatus, 'NOT_FROZEN');
    assert.equal(slot.executionAllowed, false);
  }
});

test('benchmark registry reserves B1 and B2 without expected benchmark values', async () => {
  const path = new URL('../Benchmarks/VibrationSBC/sbc-benchmark-registry-v1.json', import.meta.url);
  const text = await readFile(path, 'utf8');
  const registry = JSON.parse(text);
  assert.equal(registry.benchmarkExecutionAllowed, false);
  assert.equal(registry.productionExpectedValueGenerationForbidden, true);
  assert.equal(text.includes('"expectedValues":'), false);
  for (const typeId of SBC_TYPE_IDS) {
    assert.equal(registry.types[typeId].b1.exampleId, B1[typeId]);
    assert.equal(registry.types[typeId].b1.expectedValuesPresent, false);
    assert.equal(registry.types[typeId].b2.status, 'MISSING_INDEPENDENT_ENGINEERING_EVIDENCE');
    assert.equal(registry.types[typeId].b2.expectedValuesPresent, false);
  }
  assert.equal(registry.types.TYPE_3.b1.oracleUseOnly, true);
  assert.equal(registry.types.TYPE_3.b1.calibrationUseForbidden, true);
});

test('method/source scaffolds state non-authority and Type-3 quarantine', async () => {
  const method = await readFile(new URL('../docs/vibration/SBC-Engineering-Method-Specification-v1.md', import.meta.url), 'utf8');
  const source = await readFile(new URL('../docs/vibration/SBC-source-trace-register-v1.md', import.meta.url), 'utf8');
  assert.match(method, /SCAFFOLD_PRESENT_NOT_FROZEN/u);
  assert.match(method, /fitOnlyAccepted\s+= false/u);
  assert.match(method, /METHOD_MANDATED_CONSERVATIVE_ASSUMPTION/u);
  assert.match(source, /sourceQualification\s+= NOT_ESTABLISHED/u);
  assert.match(source, /D7 is an oracle, never calibration data/u);
  assert.match(source, /BLOCKED_SOURCE_DATA_CONFLICT/u);
});
