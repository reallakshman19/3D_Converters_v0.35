import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import {
  MECHANICAL_T23_SOURCE_OPTIONS,
  evaluateMechanicalFacilityCandidate,
  inspectMechanicalFacilityCandidate,
  mechanicalFacilityScopeId,
} from '../converters/vibration/mechanical/facility.js';

const NODE140_BENCHMARK_COMMIT = '432c87e022674822cc4ddaf2faddeffd68fe883e';
const NODE140_BENCHMARK_FILES = [
  ['Benchmarks/css/SYS-0010.xml', '1c6e2d817c9488839d1743da46927e8e104fa824'],
  ['Benchmarks/css/css3_managed_stage.zip', '86da3f48cb53b7cb7f3520072edcf0d3ed0d1806'],
];

function exportExactNode140BenchmarkArtifact() {
  const outDir = 'artifacts/vibration-production-freeze/node140-exact-benchmark';
  mkdirSync(outDir, { recursive: true });
  execFileSync('git', ['fetch', '--depth=1', 'origin', NODE140_BENCHMARK_COMMIT], { stdio: 'inherit' });
  const provenance = [`commit=${NODE140_BENCHMARK_COMMIT}`];
  const sums = [];
  for (const [repoPath, expectedBlob] of NODE140_BENCHMARK_FILES) {
    const bytes = execFileSync('git', ['show', `${NODE140_BENCHMARK_COMMIT}:${repoPath}`], { maxBuffer: 4 * 1024 * 1024 });
    const actualBlob = execFileSync('git', ['hash-object', '--stdin'], { input: bytes, encoding: 'utf8' }).trim();
    assert.equal(actualBlob, expectedBlob, `${repoPath} immutable blob`);
    const name = repoPath.split('/').at(-1);
    writeFileSync(`${outDir}/${name}`, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    sums.push(`${sha256}  ${name}`);
    provenance.push(`${name}.git_blob=${actualBlob}`);
    provenance.push(`${name}.sha256=${sha256}`);
  }
  writeFileSync(`${outDir}/SHA256SUMS`, `${sums.join('\n')}\n`);
  writeFileSync(`${outDir}/PROVENANCE.txt`, `${provenance.join('\n')}\n`);
}

exportExactNode140BenchmarkArtifact();

function row(overrides = {}) {
  return {
    line: '14-GAS-1001', caseId: 'NORMAL', canonicalId: 'CAN-K402',
    ...overrides,
  };
}

test('D2.4 facility candidate reproduces governing Mechanical LOF 0.4', async () => {
  const result = await evaluateMechanicalFacilityCandidate(row(), [
    'CENTRIFUGAL_COMPRESSOR',
    'ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW',
  ]);
  assert.equal(result.schema, 'MechanicalFacilityCandidate.v1');
  assert.equal(result.status, 'CALCULATED_MASTER_CANDIDATE');
  assert.equal(result.governingLof, 0.4);
  assert.equal(result.governingSourceKey, 'ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW');
  assert.deepEqual(result.rows.map((item) => item.baselineLof), [0.2, 0.4]);
  assert.equal(result.authority.engineeringAuthority, 'NONE');
  assert.equal(result.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(result.authority.designAuthority, false);
  assert.equal(result.usagePolicy.automaticFallbackAllowed, false);
});

test('facility scope is deterministic, encoded and candidate inspection is exact-scope only', async () => {
  const target = row({ line: 'L/100', caseId: 'START UP', canonicalId: 'CAN|1' });
  assert.equal(
    mechanicalFacilityScopeId(target),
    'MECHANICAL-FACILITY/L%2F100/START%20UP/CAN%7C1',
  );
  const candidate = await evaluateMechanicalFacilityCandidate(target, ['CENTRIFUGAL_PUMP']);
  assert.equal(inspectMechanicalFacilityCandidate(target, candidate).ok, true);
  const other = row({ line: 'L/101', caseId: 'START UP', canonicalId: 'CAN|1' });
  const inspected = inspectMechanicalFacilityCandidate(other, candidate);
  assert.equal(inspected.ok, false);
  assert.equal(inspected.status, 'FACILITY_SCOPE_MISMATCH');
});

test('source selection is exact, de-duplicated and empty/unknown selections fail closed', async () => {
  const duplicate = await evaluateMechanicalFacilityCandidate(row(), [
    'CENTRIFUGAL_PUMP', 'CENTRIFUGAL_PUMP',
  ]);
  assert.deepEqual(duplicate.sourceKeys, ['CENTRIFUGAL_PUMP']);
  await assert.rejects(
    () => evaluateMechanicalFacilityCandidate(row(), []),
    /MECHANICAL_T23_SOURCE_SELECTION_REQUIRED/u,
  );
  await assert.rejects(
    () => evaluateMechanicalFacilityCandidate(row(), ['NOT_A_SOURCE']),
    /MECHANICAL_T23_SOURCE_UNKNOWN/u,
  );
});

test('shared-support transfer remains blocked from direct numeric baseline evaluation', async () => {
  const shared = MECHANICAL_T23_SOURCE_OPTIONS.find((item) => !item.directBaselineAvailable);
  assert.equal(shared.sourceKey, 'PIPEWORK_SHARING_SUPPORTS_WITH_LINE_LOF_GE_0_50');
  assert.equal(shared.baselineLof, null);
  await assert.rejects(
    () => evaluateMechanicalFacilityCandidate(row(), [shared.sourceKey]),
    /MECHANICAL_T23_SHARED_SUPPORT_REQUIRES_ADJACENT_LOF/u,
  );
});