import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  rankT29NavigationCandidates,
  scoreT29TextPage,
} from '../scripts/locate-vibration-t29-controlled-source.mjs';

const MATRIX = JSON.parse(readFileSync(
  new URL('../ValidationRecords/VibrationMasters/t29-pf01-reconciliation-matrix-v1.json', import.meta.url),
  'utf8',
));
const BENCHMARKS = JSON.parse(readFileSync(
  new URL('../ValidationRecords/VibrationMasters/t29-pf01-benchmark-matrix-v1.json', import.meta.url),
  'utf8',
));
const SOURCE_CONTRACT = JSON.parse(readFileSync(
  new URL('../ValidationRecords/VibrationMasters/t29-pf01-source-contract-v1.json', import.meta.url),
  'utf8',
));
const PROGRESS = JSON.parse(readFileSync(
  new URL('../ValidationRecords/VibrationMasters/t29-pf01-qualification-progress-v2.json', import.meta.url),
  'utf8',
));

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('PF01 keeps controlled source identity pinned and numerical authority blocked', () => {
  assert.equal(MATRIX.controlledSource.gitBlobSha1,
    'sha1:9d3eccc56429411e17c07a579bdebbd13cb0bdc5');
  assert.equal(MATRIX.controlledSource.sizeBytes, 10348594);
  assert.equal(MATRIX.decisions.numericalKernelAuthorized, false);
  assert.equal(MATRIX.decisions.candidateRowsMayBeActivatedAsMaster, false);
  assert.equal(MATRIX.decisions.synthesisMayDriveProductionEquations, false);
  assert.equal(MATRIX.decisions.synthesisMayDriveBranchAcceptance, false);
  assert.equal(MATRIX.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(MATRIX.authority.designAuthority, false);
});

test('T2.9 locator ranks mechanism-specific evidence and rejects generic recovery-only pages', () => {
  const generic = scoreT29TextPage(10, 'Pressure recovery factor for an unrelated assessment.');
  const paired = scoreT29TextPage(11, 'Cavitation and flashing assessment notes.');
  const explicit = scoreT29TextPage(12, 'T2.9.2 Cavitation and flashing pressure recovery factor.');
  assert.equal(generic.navigationCandidate, false);
  assert.equal(generic.selectionReason, null);
  assert.equal(paired.navigationCandidate, true);
  assert.equal(paired.selectionReason, 'CAVITATION_FLASHING_PAIR');
  assert.equal(explicit.navigationCandidate, true);
  assert.equal(explicit.selectionReason, 'EXPLICIT_T2_9_2_IDENTIFIER');
  assert.deepEqual(
    rankT29NavigationCandidates([generic, paired, explicit]).map(({ pdfPageNumber }) => pdfPageNumber),
    [12, 11],
  );
});

test('PF01 preserves the four-row candidate and explicit synthesis conflicts', () => {
  assert.deepEqual(
    MATRIX.candidateEvidence.rows.map(({ valveType, FL }) => [valveType, FL]),
    [['Ball', 0.6], ['Butterfly', 0.62], ['Globe', 0.9], ['Gate', 0.6]],
  );
  const states = new Map(MATRIX.reconciliationItems.map((item) => [item.id, item.state]));
  assert.equal(states.get('T29-REC-FL-BALL'), 'CONFLICT');
  assert.equal(states.get('T29-REC-FL-BUTTERFLY'), 'CONFLICT');
  assert.equal(states.get('T29-REC-FL-GLOBE'), 'PARTIAL_MATCH_TAXONOMY_CONFLICT');
  assert.equal(states.get('T29-REC-FL-GATE'), 'OMISSION_CONFLICT');
  assert.equal(states.get('T29-REC-EQ-PRESSURE-DROP'), 'EQUATION_CONFLICT');
  assert.equal(states.get('T29-REC-BRANCHES'), 'SYNTHESIS_ONLY_UNVERIFIED');
});

test('retained multimechanism benchmark explicitly provides no T2.9 branch oracle', () => {
  assert.deepEqual(BENCHMARKS.workedExampleEvidence, {
    benchmarkSetPath: 'Benchmarks/VibrationIntegrity/ei-aviff-multimechanism-worked-examples-v1.json',
    benchmarkSetGitBlobSha1: 'sha1:cb945296ea86186afc1cbb45f50ee94c017adca4',
    benchmarkSetAuthority: 'WORKED_EXAMPLE_VALIDATION_ONLY',
    caseId: 'EI-NO-EXAMPLE-CAV-FLASH',
    mechanism: 'CAVITATION_FLASHING',
    mode: 'NO_RETAINED_EXAMPLE',
    branchOracleAvailable: false,
    decision: 'DO_NOT_INFER_T29_BRANCH_OR_LOF_FROM_MULTIMECHANISM_BENCHMARK_SET',
  });
  assert.equal(BENCHMARKS.promotionGate.workedExampleBranchOracleAvailable, false);
});

test('independent Globe arithmetic replay and unit-invariance pair stay frozen', () => {
  const pa = BENCHMARKS.arithmeticVectors.find((item) => item.id === 'T29-ARITH-001-GLOBE-PA');
  const bar = BENCHMARKS.arithmeticVectors.find((item) => item.id === 'T29-ARITH-002-GLOBE-BAR');
  const paCalculated = pa.inputs.FL ** 2 * (pa.inputs.P1 - 0.96 * pa.inputs.Pv);
  const barCalculated = bar.inputs.FL ** 2 * (bar.inputs.P1 - 0.96 * bar.inputs.Pv);
  close(paCalculated, 11050579.7424);
  close(barCalculated, 110.505797424);
  close(paCalculated / 100000, barCalculated);
  assert.equal(pa.branchOracle, null);
  assert.equal(bar.branchOracle, null);
});

test('decision and boundary oracles remain unavailable instead of inheriting synthesis rules', () => {
  assert.ok(BENCHMARKS.decisionBranchVectors.length >= 6);
  for (const vector of BENCHMARKS.decisionBranchVectors) {
    assert.equal(vector.state, 'PENDING_CONTROLLED_SOURCE_ORACLE');
    assert.equal(vector.expectedRegime, null);
    assert.equal(vector.expectedLof, null);
  }
  assert.equal(BENCHMARKS.promotionGate.decisionBranchOracleComplete, false);
  assert.equal(BENCHMARKS.promotionGate.boundaryOracleComplete, false);
  assert.equal(BENCHMARKS.promotionGate.candidateKernelAuthorized, false);
  assert.equal(BENCHMARKS.promotionGate.screeningAuthorityAuthorized, false);
});

test('qualification progress improves without crossing the source gate', () => {
  assert.equal(PROGRESS.appendixA.total, 90);
  assert.equal(PROGRESS.appendixA.requiredTotal, 92);
  assert.equal(PROGRESS.appendixA.A1.score, 19);
  assert.equal(PROGRESS.appendixA.A2.score, 15);
  assert.equal(PROGRESS.appendixA.A3.score, 20);
  assert.equal(PROGRESS.appendixA.A4.score, 17);
  assert.equal(PROGRESS.appendixA.A5.score, 19);
  assert.equal(PROGRESS.gateEvaluation.totalPass, false);
  assert.equal(PROGRESS.gateEvaluation.A2Pass, false);
  assert.equal(PROGRESS.gateEvaluation.controlledSourceExecutionPass, false);
  assert.equal(PROGRESS.authority.candidateKernelAuthorized, false);
});

test('source contract and reconciliation package agree on fail-closed authority', () => {
  assert.equal(SOURCE_CONTRACT.authority.engineeringAuthority, 'NONE');
  assert.equal(SOURCE_CONTRACT.authority.screeningAuthority, 'NOT_AUTHORIZED');
  assert.equal(SOURCE_CONTRACT.authority.designAuthority, false);
  assert.equal(SOURCE_CONTRACT.qualification.appendixA.disposition,
    'NOT_QUALIFIED_FOR_T29_NUMERICAL_MUTATION');
});
