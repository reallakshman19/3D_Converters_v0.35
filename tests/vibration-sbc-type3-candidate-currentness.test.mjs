import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SBC_TYPE3_ENGINEERING_CHANGE_KINDS,
  beginSbcType3CandidateEvaluation,
  commitSbcType3CandidateEvaluation,
  createSbcType3CandidateCurrentnessStore,
  failSbcType3CandidateEvaluation,
  inspectSbcType3CandidateCurrentness,
  readCurrentSbcType3Candidate,
  recordSbcType3EngineeringChange,
  recordSbcType3PresentationChange,
} from '../tabs/vibration-integrity-sbc-candidate-currentness.js';

const PHYSICAL = SBC_TYPE3_ENGINEERING_CHANGE_KINDS.physicalInput;
const CURVE = SBC_TYPE3_ENGINEERING_CHANGE_KINDS.manualCurveEvidence;

function seedEngineeringState(store, scopeId) {
  return recordSbcType3EngineeringChange(store, scopeId, PHYSICAL);
}

function commitCandidate(store, scopeId, marker = scopeId) {
  const started = beginSbcType3CandidateEvaluation(store, scopeId);
  const completed = commitSbcType3CandidateEvaluation(started.store, started.operation, {
    scopeId,
    marker,
    authority: { screeningAuthority: 'NOT_AUTHORIZED' },
  });
  assert.equal(completed.accepted, true);
  return completed.store;
}

test('PF-07 exact facility scope is bound into every current candidate read', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  store = commitCandidate(store, 'FACILITY-A', 'A-CANDIDATE');
  assert.equal(readCurrentSbcType3Candidate(store, 'FACILITY-A').current, true);
  assert.deepEqual(readCurrentSbcType3Candidate(store, 'FACILITY-B'), {
    current: false,
    reason: 'NO_CANDIDATE',
  });

  const aRecord = store.scopes['FACILITY-A'].candidate;
  assert.deepEqual(inspectSbcType3CandidateCurrentness(aRecord, {
    scopeId: 'FACILITY-B', engineeringRevision: 0,
  }), {
    current: false,
    reason: 'CANDIDATE_SCOPE_MISMATCH',
  });
});

test('PF-08 physical input edit invalidates prior candidate synchronously', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  store = commitCandidate(store, 'FACILITY-A');
  const before = store.scopes['FACILITY-A'];
  assert.equal(before.candidate.status, 'CURRENT');

  store = recordSbcType3EngineeringChange(store, 'FACILITY-A', PHYSICAL);
  const after = store.scopes['FACILITY-A'];
  assert.equal(after.engineeringRevision, before.engineeringRevision + 1);
  assert.equal(after.candidate.status, 'STALE');
  assert.equal(after.candidate.staleReason, PHYSICAL);
  assert.equal(readCurrentSbcType3Candidate(store, 'FACILITY-A').current, false);
});

test('PF-09 D/F/G evidence edit invalidates prior candidate synchronously', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  store = commitCandidate(store, 'FACILITY-A');
  store = recordSbcType3EngineeringChange(store, 'FACILITY-A', CURVE);
  assert.equal(store.scopes['FACILITY-A'].candidate.status, 'STALE');
  assert.equal(store.scopes['FACILITY-A'].candidate.staleReason, CURVE);
  assert.equal(readCurrentSbcType3Candidate(store, 'FACILITY-A').reason, 'CANDIDATE_NOT_CURRENT');
});

test('PF-10 stale async completion cannot overwrite a newer engineering revision', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  const oldStart = beginSbcType3CandidateEvaluation(store, 'FACILITY-A');
  store = recordSbcType3EngineeringChange(oldStart.store, 'FACILITY-A', PHYSICAL);
  const newStart = beginSbcType3CandidateEvaluation(store, 'FACILITY-A');

  const stale = commitSbcType3CandidateEvaluation(newStart.store, oldStart.operation, {
    scopeId: 'FACILITY-A', marker: 'STALE',
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'EVALUATION_TOKEN_MISMATCH');
  assert.equal(stale.store.scopes['FACILITY-A'].pendingEvaluation.token, newStart.operation.token);
  assert.equal(readCurrentSbcType3Candidate(stale.store, 'FACILITY-A').current, false);

  const current = commitSbcType3CandidateEvaluation(stale.store, newStart.operation, {
    scopeId: 'FACILITY-A', marker: 'CURRENT',
  });
  assert.equal(current.accepted, true);
  assert.equal(readCurrentSbcType3Candidate(current.store, 'FACILITY-A').result.marker, 'CURRENT');
});

test('a later evaluation supersedes an older evaluation on the same revision', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  const first = beginSbcType3CandidateEvaluation(store, 'FACILITY-A');
  const second = beginSbcType3CandidateEvaluation(first.store, 'FACILITY-A');
  assert.notEqual(first.operation.token, second.operation.token);

  const stale = commitSbcType3CandidateEvaluation(second.store, first.operation, {
    scopeId: 'FACILITY-A', marker: 'FIRST',
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'EVALUATION_TOKEN_MISMATCH');

  const accepted = commitSbcType3CandidateEvaluation(stale.store, second.operation, {
    scopeId: 'FACILITY-A', marker: 'SECOND',
  });
  assert.equal(accepted.accepted, true);
  assert.equal(readCurrentSbcType3Candidate(accepted.store, 'FACILITY-A').result.marker, 'SECOND');
});

test('facility A and B currentness are isolated', () => {
  let store = createSbcType3CandidateCurrentnessStore();
  store = seedEngineeringState(store, 'FACILITY-A');
  store = seedEngineeringState(store, 'FACILITY-B');
  store = commitCandidate(store, 'FACILITY-A', 'A');
  store = commitCandidate(store, 'FACILITY-B', 'B');

  store = recordSbcType3EngineeringChange(store, 'FACILITY-A', CURVE);
  assert.equal(readCurrentSbcType3Candidate(store, 'FACILITY-A').current, false);
  assert.equal(readCurrentSbcType3Candidate(store, 'FACILITY-B').current, true);
  assert.equal(readCurrentSbcType3Candidate(store, 'FACILITY-B').result.marker, 'B');
});

test('presentation/navigation change is engineering-state neutral', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  store = commitCandidate(store, 'FACILITY-A');
  const revision = store.scopes['FACILITY-A'].engineeringRevision;
  const candidate = store.scopes['FACILITY-A'].candidate;
  const afterPresentation = recordSbcType3PresentationChange(store);
  assert.strictEqual(afterPresentation, store);
  assert.equal(afterPresentation.scopes['FACILITY-A'].engineeringRevision, revision);
  assert.strictEqual(afterPresentation.scopes['FACILITY-A'].candidate, candidate);
  assert.equal(readCurrentSbcType3Candidate(afterPresentation, 'FACILITY-A').current, true);
});

test('stale failure completion cannot clear a newer pending evaluation', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  const first = beginSbcType3CandidateEvaluation(store, 'FACILITY-A');
  const second = beginSbcType3CandidateEvaluation(first.store, 'FACILITY-A');
  const staleFailure = failSbcType3CandidateEvaluation(
    second.store, first.operation, 'OLD_OPERATION_FAILED',
  );
  assert.equal(staleFailure.handled, false);
  assert.equal(staleFailure.reason, 'EVALUATION_TOKEN_MISMATCH');
  assert.equal(
    staleFailure.store.scopes['FACILITY-A'].pendingEvaluation.token,
    second.operation.token,
  );
});

test('candidate result with the wrong embedded scope cannot commit', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  const started = beginSbcType3CandidateEvaluation(store, 'FACILITY-A');
  const wrongScope = commitSbcType3CandidateEvaluation(started.store, started.operation, {
    scopeId: 'FACILITY-B', marker: 'WRONG',
  });
  assert.equal(wrongScope.accepted, false);
  assert.equal(wrongScope.reason, 'CANDIDATE_SCOPE_MISMATCH');
  assert.equal(readCurrentSbcType3Candidate(wrongScope.store, 'FACILITY-A').current, false);
});

test('evaluation tokens are deterministic and contain no clock/random input', () => {
  const initialA = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  const initialB = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  const first = beginSbcType3CandidateEvaluation(initialA, 'FACILITY-A');
  const second = beginSbcType3CandidateEvaluation(initialB, 'FACILITY-A');
  assert.equal(first.operation.token, 'SBC-T3-EVAL/FACILITY-A/1/1');
  assert.equal(first.operation.token, second.operation.token);
});

test('returned state and committed candidate are deeply immutable snapshots', () => {
  let store = seedEngineeringState(createSbcType3CandidateCurrentnessStore(), 'FACILITY-A');
  const started = beginSbcType3CandidateEvaluation(store, 'FACILITY-A');
  const input = { scopeId: 'FACILITY-A', nested: { value: 7 } };
  const completed = commitSbcType3CandidateEvaluation(started.store, started.operation, input);
  store = completed.store;
  input.nested.value = 9;
  assert.equal(readCurrentSbcType3Candidate(store, 'FACILITY-A').result.nested.value, 7);
  assert.equal(Object.isFrozen(store), true);
  assert.equal(Object.isFrozen(store.scopes['FACILITY-A'].candidate.result.nested), true);
});
