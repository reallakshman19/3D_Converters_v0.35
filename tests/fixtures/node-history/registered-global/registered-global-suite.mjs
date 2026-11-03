import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildRegisteredCandidateGraph } from '../../../../node-history/matching/registered-candidate-graph.js';
import { validateCoordinateRegistrationAuthority } from '../../../../node-history/matching/registered-coordinate-evidence.js';
import { matchRegisteredHistoricalNodes } from '../../../../node-history/matching/registered-global-matcher.js';
import {
  HASH, baseInput, current, dimension, history, refreshExactHash, refreshPolicyHash,
  refreshRegistrationHash, registeredPosition, reverseObjectKeys, validation,
} from './registered-global-fixture.mjs';

const MATRIX = new URL('./global-matrix.json', import.meta.url);
const codes = (result) => result.validation.blockers.map((row) => row.code);

test('registered evidence with non-spatial corroboration matches', async () => {
  const result = await matchRegisteredHistoricalNodes(await baseInput());
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.matches[0].historyNodeId, 'H1');
  assert.equal(result.matches[0].selectedCandidate.distanceSquaredQ, '1000000');
  assert.match(result.registeredPolicyHash, /^sha256:[a-f0-9]{64}$/);
});

test('registration authority fails closed across hash, roots, frames and validation', async () => {
  const scenarios = [
    ['COORDINATE_REGISTRATION_HASH_MISMATCH', (i) => { i.coordinateRegistrations[0].coordinateRegistrationHash = HASH; }, false],
    ['COORDINATE_REGISTRATION_ROOT_MISMATCH', (i) => { i.coordinateRegistrations[0].registration.projectId = 'P2'; }, true],
    ['COORDINATE_FRAME_MISMATCH', (i) => { i.coordinateRegistrations[0].registration.sourceCoordinateFrameId = 'HISTORY-FRAME'; }, true],
    ['REGISTERED_POSITION_INVALID', (i) => { i.coordinateRegistrations[0].registration.transform.matrix = [1, 0]; }, true],
    ['COORDINATE_REGISTRATION_NOT_PASS', (i) => { i.coordinateRegistrations[0].validation = validation('REVIEW_REQUIRED', [], [{ code: 'R' }]); }, true],
  ];
  for (const [code, mutate, rehash] of scenarios) {
    const input = await baseInput(); mutate(input);
    if (rehash) await refreshRegistrationHash(input.coordinateRegistrations[0]);
    const result = await matchRegisteredHistoricalNodes(input);
    assert.ok(codes(result).includes(code), code); assert.equal(result.matches.length, 0);
  }
});

test('exact result and complete registry snapshot are independently verified', async () => {
  const stale = await baseInput(); stale.exactMatchResult.historyMatchResultHash = HASH;
  assert.ok(codes(await matchRegisteredHistoricalNodes(stale)).includes('EXACT_MATCH_RESULT_HASH_MISMATCH'));
  const registry = await baseInput();
  registry.previousRegistry.lineHistories[0].historyNodes[0].lifecycleStatus = 'SUPERSEDED';
  const result = await matchRegisteredHistoricalNodes(registry);
  assert.ok(codes(result).includes('BASE_REGISTRY_SNAPSHOT_NOT_PASS'));
  assert.equal(result.conflicts.some((row) => String(row.logicalNodeId).startsWith('AUTHORITY:')), false);
});

test('source inventory and coordinate registration references are mandatory', async () => {
  const inventory = await baseInput(); inventory.sourceInventory.validation = validation('BLOCKED', [{ code: 'X' }]);
  assert.ok(codes(await matchRegisteredHistoricalNodes(inventory)).includes('SOURCE_INVENTORY_NOT_PASS'));
  const missing = await baseInput(); missing.coordinateRegistrations = [];
  assert.ok(codes(await matchRegisteredHistoricalNodes(missing)).includes('COORDINATE_REGISTRATION_REFERENCE_MISSING'));
});

test('policy cannot relabel spatial values as identity evidence', async () => {
  const input = await baseInput({ dimensions: [dimension('FAKE_IDENTITY', 'position.x')] });
  await refreshPolicyHash(input.policy);
  const result = await matchRegisteredHistoricalNodes(input);
  assert.ok(codes(result).includes('SPATIAL_ONLY_REUSE_PROHIBITED')); assert.equal(result.matches.length, 0);
});

test('malformed policy and incomplete rename evidence block without throwing', async () => {
  const malformed = await baseInput(); malformed.policy.assignment.maximumSearchStates = 0;
  await refreshPolicyHash(malformed.policy);
  assert.ok(codes(await matchRegisteredHistoricalNodes(malformed)).includes('REGISTERED_MATCH_POLICY_INVALID'));
  const rename = await baseInput({ histories: [history('H1')], historyLine: '/OLD' });
  rename.policy.approvedLineRenames = [{ projectId: 'P1', zoneId: 'Z1', fromMainLineKey: '/OLD', toMainLineKey: '/A', approved: true, recordId: 'R' }];
  await refreshPolicyHash(rename.policy);
  assert.ok(codes(await matchRegisteredHistoricalNodes(rename)).includes('LINE_RENAME_AUTHORITY_MISSING'));
});

test('hard role, line, carrier, bore and support conflicts precede score', async () => {
  const input = await baseInput({
    currentLogicalNodes: [current('C1', 0, { topologySignature: 'S', carrierId: 'A', boreMm: 100, supportOwnerId: 'S1' })],
    histories: [history('H1'), history('H2')],
    positions: [
      registeredPosition('H1', 0, { topologySignature: 'S', logicalRole: 'SUPPORT', carrierId: 'B', boreMm: 150, supportOwnerId: 'S2' }),
      registeredPosition('H2', 2, { topologySignature: 'S', logicalRole: 'ROUTE', carrierId: 'A', boreMm: 100, supportOwnerId: 'S1' }),
    ], hardEligibility: { carrier: true, bore: true, supportOwner: true },
  });
  const result = await matchRegisteredHistoricalNodes(input);
  assert.equal(result.matches[0].historyNodeId, 'H2');
  assert.deepEqual(result.matches[0].rejectedCandidates[0].rejectionReasons.map((row) => row.code),
    ['BORE_CONFLICT', 'CARRIER_CONFLICT', 'LOGICAL_ROLE_MISMATCH', 'SUPPORT_OWNER_CONFLICT']);
  const renamed = await baseInput({ histories: [history('H1')], historyLine: '/OLD', approvedLineRenames: [{
    projectId: 'P1', zoneId: 'Z1', fromMainLineKey: '/OLD', toMainLineKey: '/A', approved: true, recordId: 'REN-1',
  }] });
  assert.equal((await matchRegisteredHistoricalNodes(renamed)).matches[0].historyNodeId, 'H1');
});

test('spatial-only candidate remains review evidence', async () => {
  const input = await baseInput({ currentLogicalNodes: [current('C1', 0, { topologySignature: 'CURRENT' })],
    positions: [registeredPosition('H1', 0, { topologySignature: 'HISTORY' })] });
  const result = await matchRegisteredHistoricalNodes(input);
  assert.equal(result.ambiguous[0].outcome, 'REVIEW_REQUIRED'); assert.equal(result.matches.length, 0);
});

test('accepted exact claims never enter registered graph', async () => {
  const input = await baseInput({
    currentLogicalNodes: [current('C0', 0, { topologySignature: 'S' }), current('C1', 10, { topologySignature: 'S' })],
    histories: [history('H0'), history('H1')],
    positions: [registeredPosition('H0', 10, { topologySignature: 'S' }), registeredPosition('H1', 11, { topologySignature: 'S' })],
    exactMatches: [{ logicalNodeId: 'C0', historyNodeId: 'H0', outcome: 'EXACT_MATCHED' }], unmatchedIds: ['C1'],
  });
  const authority = await validateCoordinateRegistrationAuthority(input);
  assert.ok(buildRegisteredCandidateGraph({ ...input, registrationAuthority: authority }).candidates.every((row) => row.historyNodeId !== 'H0'));
  assert.deepEqual((await matchRegisteredHistoricalNodes(input)).matches.map((row) => [row.logicalNodeId, row.historyNodeId]), [['C0', 'H0'], ['C1', 'H1']]);
});

test('global assignment beats greedy choice and preserves equal optima', async () => {
  const global = await baseInput({
    currentLogicalNodes: [current('C1', 0, { topologySignature: 'A', branchRole: 'X' }), current('C2', 1.1, { topologySignature: 'C', branchRole: 'B' })],
    histories: [history('H1'), history('H2')],
    positions: [registeredPosition('H1', 1, { topologySignature: 'A', branchRole: 'B' }), registeredPosition('H2', 2, { topologySignature: 'A', branchRole: 'Y' })],
    unmatchedIds: ['C1', 'C2'], dimensions: [dimension('TOPOLOGY', 'topologySignature'), dimension('BRANCH', 'branchRole')],
  });
  assert.deepEqual((await matchRegisteredHistoricalNodes(global)).matches.map((row) => [row.logicalNodeId, row.historyNodeId]), [['C1', 'H2'], ['C2', 'H1']]);
  const equal = await baseInput({ histories: [history('H1'), history('H2')], positions: [
    registeredPosition('H1', 1, { topologySignature: 'SIG-A' }), registeredPosition('H2', 1, { topologySignature: 'SIG-A' }),
  ] });
  assert.deepEqual((await matchRegisteredHistoricalNodes(equal)).ambiguous[0].competingHistoryNodeIds, ['H1', 'H2']);
});

test('retired identity becomes read-only reactivation evidence', async () => {
  const input = await baseInput({ histories: [history('H1', { lifecycleStatus: 'RETIRED' })] });
  const before = structuredClone(input.previousRegistry), result = await matchRegisteredHistoricalNodes(input);
  assert.equal(result.reactivated[0].outcome, 'REACTIVATION_CANDIDATE');
  assert.equal(result.validation.status, 'REVIEW_REQUIRED'); assert.deepEqual(input.previousRegistry, before);
});

test('semantic result is deterministic under ordering and timestamp changes', async () => {
  const fixture = JSON.parse(await readFile(MATRIX, 'utf8'));
  const firstInput = await baseInput(fixture), secondInput = structuredClone(firstInput);
  secondInput.currentLogicalNodes.reverse(); secondInput.previousRegistry.lineHistories[0].historyNodes.reverse();
  secondInput.coordinateRegistrations[0].registration.historyPositions.reverse();
  secondInput.coordinateRegistrations[0].registration.anchors.reverse();
  secondInput.coordinateRegistrations[0].registration = reverseObjectKeys(secondInput.coordinateRegistrations[0].registration);
  secondInput.policy = reverseObjectKeys(secondInput.policy); secondInput.evaluatedAt = '2030-01-01T00:00:00Z';
  await refreshRegistrationHash(secondInput.coordinateRegistrations[0]);
  const [first, second] = await Promise.all([matchRegisteredHistoricalNodes(firstInput), matchRegisteredHistoricalNodes(secondInput)]);
  assert.equal(first.historyMatchResultHash, second.historyMatchResultHash);
  assert.deepEqual(first.matches, second.matches); assert.deepEqual(first.ambiguous, second.ambiguous);
});

test('inputs stay unchanged, output freezes, and partial coverage cannot retire', async () => {
  const input = await baseInput(), before = structuredClone(input), result = await matchRegisteredHistoricalNodes(input);
  assert.deepEqual(result, await matchRegisteredHistoricalNodes(input)); assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result.matches[0].selectedCandidate), true);
  const invalid = await baseInput(); invalid.exactMatchResult.retirementCandidates = [{ historyNodeId: 'H9' }];
  await refreshExactHash(invalid.exactMatchResult);
  const blocked = await matchRegisteredHistoricalNodes(invalid);
  assert.ok(codes(blocked).includes('PARTIAL_COVERAGE_RETIREMENT_PROHIBITED')); assert.deepEqual(blocked.retirementCandidates, []);
});

test('matcher sources remain bounded and free of allocator/topology authority', async () => {
  const files = ['registered-coordinate-evidence.js', 'registered-candidate-graph.js', 'global-history-assignment.js', 'registered-global-matcher.js', 'registered-matcher-policy.js'];
  for (const file of files) {
    const source = await readFile(new URL(`../../../../node-history/matching/${file}`, import.meta.url), 'utf8');
    assert.ok(source.split('\n').length <= 300, `${file} exceeds 300 lines`);
    assert.doesNotMatch(source, /engineeringNodeNumber|allocateNode|nextFree|writeFile|serializeXml|mutateLifecycle/i);
  }
});
