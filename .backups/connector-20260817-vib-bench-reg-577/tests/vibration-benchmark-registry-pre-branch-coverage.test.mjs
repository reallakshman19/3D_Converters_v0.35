import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  VIBRATION_BENCHMARK_REGISTRY,
  VIBRATION_BENCHMARK_REGISTRY_SCHEMA,
  evaluateVibrationBenchmarkRegistry,
  validateVibrationBenchmarkRegistry,
  vibrationBenchmarkRegistryFingerprint,
} from '../converters/vibration/benchmark-registry.js';
import { ACTIVE_ENGINEERING_CALCULATION_DEFINITIONS } from '../converters/engineering-calculations/default-registry.js';
import {
  VIBRATION_MECHANISM_IDS,
  VIBRATION_MECHANISM_REGISTRY,
} from '../converters/vibration/mechanisms/registry.js';
import { AIV_INDEPENDENT_BENCHMARKS } from '../converters/vibration/aiv/aiv-independent-benchmark-evidence.js';

function cloneRegistry() {
  return structuredClone(VIBRATION_BENCHMARK_REGISTRY);
}

function activeVibIds(extra = []) {
  return [
    ...ACTIVE_ENGINEERING_CALCULATION_DEFINITIONS
      .map((definition) => definition.id)
      .filter((id) => id.startsWith('VIB.')),
    ...extra,
  ];
}

function entry(registry, mechanismId) {
  return registry.mechanisms.find((item) => item.mechanismId === mechanismId);
}

function family(registry, mechanismId, familyId) {
  return entry(registry, mechanismId).families.find((item) => item.familyId === familyId);
}

function parseJson(path) {
  return JSON.parse(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
}

test('VIB-BREG-001/002: registry uses governed mechanism universe with deterministic truth-sensitive identity', () => {
  assert.equal(VIBRATION_BENCHMARK_REGISTRY.schema, VIBRATION_BENCHMARK_REGISTRY_SCHEMA);
  assert.equal(VIBRATION_BENCHMARK_REGISTRY.mechanismRegistryRevision, VIBRATION_MECHANISM_REGISTRY.revision);
  assert.equal(VIBRATION_BENCHMARK_REGISTRY.mechanismRegistryFingerprint, VIBRATION_MECHANISM_REGISTRY.fingerprint);
  assert.deepEqual(VIBRATION_BENCHMARK_REGISTRY.mechanisms.map((item) => item.mechanismId), VIBRATION_MECHANISM_IDS);
  const fingerprint = vibrationBenchmarkRegistryFingerprint(VIBRATION_BENCHMARK_REGISTRY.mechanisms);
  assert.equal(VIBRATION_BENCHMARK_REGISTRY.fingerprint, fingerprint);
  const changed = cloneRegistry();
  family(changed, 'fit', 'FIT-INDEPENDENT-HAND-V1').independenceBasis = 'CHANGED';
  assert.notEqual(vibrationBenchmarkRegistryFingerprint(changed.mechanisms), fingerprint);
});

test('VIB-BREG-003: current active VIB capabilities map exactly and are READY', () => {
  const result = evaluateVibrationBenchmarkRegistry({ activeCapabilityIds: activeVibIds() });
  assert.equal(result.state, 'READY');
  assert.deepEqual(
    result.mechanisms.filter((item) => item.executable).map((item) => item.mechanismId),
    ['fit', 'aiv'],
  );
  assert.equal(result.mechanisms.find((item) => item.mechanismId === 'fit').state, 'READY');
  assert.equal(result.mechanisms.find((item) => item.mechanismId === 'aiv').state, 'READY');
});

test('VIB-BREG-004: an active VIB capability without family custody blocks M3', () => {
  const result = evaluateVibrationBenchmarkRegistry({
    activeCapabilityIds: activeVibIds(['VIB.FUTURE.UNMAPPED']),
  });
  assert.equal(result.state, 'BLOCKED');
  assert.deepEqual(result.unmappedActiveCapabilityIds, ['VIB.FUTURE.UNMAPPED']);
  assert.ok(result.reasons.includes('ACTIVE_VIB_CAPABILITY_UNMAPPED'));
});

test('VIB-BREG-005/006/007: executable mechanisms require two countable families including B1 and B2', () => {
  const missingB2 = cloneRegistry();
  entry(missingB2, 'aiv').families = entry(missingB2, 'aiv').families.filter((item) => item.evidenceClass !== 'B2');
  const noB2 = evaluateVibrationBenchmarkRegistry({ registry: missingB2, activeCapabilityIds: activeVibIds() });
  const aivNoB2 = noB2.mechanisms.find((item) => item.mechanismId === 'aiv');
  assert.equal(aivNoB2.state, 'BLOCKED');
  assert.ok(aivNoB2.reasons.includes('B2_INDEPENDENT_FAMILY_MISSING'));

  const missingB1 = cloneRegistry();
  entry(missingB1, 'aiv').families = entry(missingB1, 'aiv').families.filter((item) => item.evidenceClass !== 'B1');
  const noB1 = evaluateVibrationBenchmarkRegistry({ registry: missingB1, activeCapabilityIds: activeVibIds() });
  assert.ok(noB1.mechanisms.find((item) => item.mechanismId === 'aiv').reasons.includes('B1_CONTROLLED_FAMILY_MISSING'));
});

test('VIB-BREG-008/011: B3/B4 cannot count and unknown classes fail closed', () => {
  const falseCount = cloneRegistry();
  entry(falseCount, 'fit').families.push({
    familyId: 'FIT-REGRESSION-ONLY', evidenceClass: 'B3', countsTowardMinimum: true,
    engineeringExampleId: 'FIT-REGRESSION-ONLY', independenceBasis: 'BOUNDARY_REGRESSION',
    artifactRefs: [{ path: 'tests/vibration-fit-independent-benchmarks.test.mjs', role: 'REGRESSION_EVIDENCE' }],
    caseIds: [], oracleCustody: 'REGRESSION_ONLY',
  });
  assert.throws(() => validateVibrationBenchmarkRegistry(falseCount), /REGRESSION_FAMILY_CANNOT_COUNT/u);

  const unknown = cloneRegistry();
  family(unknown, 'fit', 'FIT-INDEPENDENT-HAND-V1').evidenceClass = 'B9';
  assert.throws(() => validateVibrationBenchmarkRegistry(unknown), /UNKNOWN_BENCHMARK_EVIDENCE_CLASS/u);
});

test('VIB-BREG-009: duplicate engineering examples cannot inflate independent-family count', () => {
  const duplicateExample = cloneRegistry();
  const aiv = entry(duplicateExample, 'aiv');
  aiv.families[1].engineeringExampleId = aiv.families[0].engineeringExampleId;
  const result = evaluateVibrationBenchmarkRegistry({
    registry: duplicateExample,
    activeCapabilityIds: activeVibIds(),
  });
  const compliance = result.mechanisms.find((item) => item.mechanismId === 'aiv');
  assert.equal(compliance.state, 'BLOCKED');
  assert.ok(compliance.reasons.includes('DUPLICATE_COUNTABLE_ENGINEERING_EXAMPLE'));
});

test('VIB-BREG-010: duplicate mechanism and family identities fail closed', () => {
  const duplicateMechanism = cloneRegistry();
  duplicateMechanism.mechanisms.push(structuredClone(duplicateMechanism.mechanisms[0]));
  assert.throws(() => validateVibrationBenchmarkRegistry(duplicateMechanism), /DUPLICATE_BENCHMARK_MECHANISM_ID/u);

  const duplicateFamily = cloneRegistry();
  entry(duplicateFamily, 'fit').families.push(structuredClone(entry(duplicateFamily, 'fit').families[0]));
  assert.throws(() => validateVibrationBenchmarkRegistry(duplicateFamily), /DUPLICATE_BENCHMARK_FAMILY_ID/u);
});

test('VIB-BREG-012: FIT D2/D4 and independent-hand custody reference exact frozen sets', () => {
  const published = parseJson('Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json');
  const independent = parseJson('Benchmarks/VibrationFIT/fit-independent-hand-benchmarks-v1.json');
  assert.equal(published.benchmarkSetId, 'FIT-EI-WORKED-EXAMPLES-V1');
  assert.equal(independent.benchmarkSetId, 'FIT-INDEPENDENT-HAND-BENCHMARKS-V1');
  assert.ok(family(VIBRATION_BENCHMARK_REGISTRY, 'fit', 'FIT-EI-D2').caseIds.every((id) => id.startsWith('EI-D2-')));
  assert.deepEqual(family(VIBRATION_BENCHMARK_REGISTRY, 'fit', 'FIT-EI-D4').caseIds, [
    'EI-D4-FIT-SEPARATOR-INLET-20IN', 'EI-D4-FIT-PRODUCED-WATER-10IN',
  ]);
  assert.deepEqual(
    new Set(family(VIBRATION_BENCHMARK_REGISTRY, 'fit', 'FIT-INDEPENDENT-HAND-V1').caseIds),
    new Set(independent.cases.map((item) => item.id)),
  );
});

test('VIB-BREG-013: AIV D2.3 and independent analytical vector custody remain exact', () => {
  const b1 = family(VIBRATION_BENCHMARK_REGISTRY, 'aiv', 'AIV-EI-D2.3');
  const b2 = family(VIBRATION_BENCHMARK_REGISTRY, 'aiv', 'AIV-INDEPENDENT-ANALYTICAL-V1');
  const d23 = fs.readFileSync(new URL('../docs/vibration/AIV-D2.3-Working-Table-Benchmark-v1.md', import.meta.url), 'utf8');
  assert.match(d23, /locator D\.2\.3 High Frequency Acoustic Excitation/u);
  assert.equal(b1.evidenceClass, 'B1');
  assert.equal(b2.evidenceClass, 'B2');
  assert.deepEqual(new Set(b2.caseIds), new Set(AIV_INDEPENDENT_BENCHMARKS.map((item) => item.benchmarkId)));
});

test('VIB-BREG-014/015: registry rejects numerical oracle fields and production-runtime oracle sources', () => {
  const numerical = cloneRegistry();
  family(numerical, 'fit', 'FIT-EI-D2').expected = { lof: 0.1 };
  assert.throws(() => validateVibrationBenchmarkRegistry(numerical), /NUMERICAL_ORACLE_FIELD_FORBIDDEN/u);

  const productionOracle = cloneRegistry();
  family(productionOracle, 'fit', 'FIT-EI-D2').artifactRefs = [{
    path: 'converters/engineering-calculations/adapters/vibration-fit.js', role: 'EXPECTED_VALUE_SOURCE',
  }];
  assert.throws(() => validateVibrationBenchmarkRegistry(productionOracle), /PRODUCTION_ORACLE_SOURCE_FORBIDDEN/u);
});

test('VIB-BREG-016/017/019: non-executable mechanisms stay pending and registry grants no authority or aggregation', () => {
  const result = evaluateVibrationBenchmarkRegistry({ activeCapabilityIds: activeVibIds() });
  for (const item of result.mechanisms.filter((value) => !value.executable)) assert.equal(item.state, 'NOT_REQUIRED');
  assert.deepEqual(VIBRATION_BENCHMARK_REGISTRY.authority, {
    registryAuthority: 'BENCHMARK_CUSTODY_ONLY', engineeringAuthority: 'NONE',
    screeningAuthority: 'NOT_AUTHORIZED', designAuthority: false, codeCompliance: false,
  });
  const source = fs.readFileSync(new URL('../converters/vibration/benchmark-registry.js', import.meta.url), 'utf8');
  assert.equal(source.includes('eiMainLineLOF'), false);
  assert.equal(source.includes('expected:'), false);
  assert.equal(source.includes('tolerance:'), false);
});
