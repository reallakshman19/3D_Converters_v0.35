import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildExactCandidateIndex } from '../node-history/matching/exact-candidate-index.js';
import { matchExactHistoricalNodes } from '../node-history/matching/exact-history-matcher.js';

const HASH = `sha256:${'1'.repeat(64)}`;
const TOPOLOGY_HASH = `sha256:${'2'.repeat(64)}`;
const FIXTURE_URL = new URL('./fixtures/node-history/exact-matching/adversarial-matrix.json', import.meta.url);

test('stable source-port identity requires explicit port ownership and survives input ordering', async () => {
  const input = baseInput({
    currentLogicalNodes: [current('C1', { sourceEntityId: 'E1' })],
    sourceInventory: inventory({
      entities: [{ sourceEntityId: 'E1', logicalNodeId: 'C1' }],
      ports: [
        { sourcePortId: 'PORT-Z', sourceEntityId: 'E1', logicalNodeId: 'C2' },
        { sourcePortId: 'PORT-10', sourceEntityId: 'E1', logicalNodeId: 'C1' },
      ],
    }),
    previousRegistry: registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'))]),
  });
  const shuffled = structuredClone(input);
  shuffled.sourceInventory.ports.reverse();
  const [first, second] = await Promise.all([
    matchExactHistoricalNodes(input), matchExactHistoricalNodes(shuffled),
  ]);
  assert.equal(first.matches[0].historyNodeId, 'H1');
  assert.equal(first.matches[0].primaryEvidence.kind, 'STABLE_SOURCE_PORT');
  assert.equal(first.historyMatchResultHash, second.historyMatchResultHash);
  const inferred = structuredClone(input);
  delete inferred.sourceInventory.ports[1].logicalNodeId;
  const noInference = await matchExactHistoricalNodes(inferred);
  assert.equal(noInference.newNodes[0].outcome, 'NO_EXACT_MATCH');
});

test('approved REF, reviewed alias and authoritative topology anchor are exact tiers', async () => {
  const cases = [
    ['APPROVED_ALIAS', { kind: 'REF', value: 'REF-101', aliasType: 'REF', namespace: 'SYS', authority: 'SOURCE' }, 2],
    ['REVIEWED_ALIAS', { kind: 'REVIEWED_ALIAS', value: 'OLD-101', aliasType: 'REF', namespace: 'SYS', reviewId: 'R-1' }, 3],
    ['TOPOLOGY_ANCHOR', { kind: 'TOPOLOGY_ANCHOR', value: 'EQ-1:PORT-A', namespace: 'SYS', authority: 'MODEL', approved: true }, 4],
  ];
  for (const [kind, claim, tier] of cases) {
    const input = baseInput({
      currentLogicalNodes: [current('C1', { identityEvidence: [claim] })],
      previousRegistry: registry([history('H1', claim)]),
    });
    const result = await matchExactHistoricalNodes(input);
    assert.equal(result.matches[0].primaryEvidence.kind, kind);
    assert.equal(result.matches[0].primaryEvidence.tier, tier);
  }
});

test('TE-005 sourceAliases are consumed read-only as approved exact aliases', async () => {
  const input = baseInput({
    currentLogicalNodes: [current('C1', { aliases: [{ value: 'SRC-A-100', aliasType: 'ALIAS', namespace: 'SYS', authority: 'SOURCE' }] })],
    previousRegistry: registry([{
      ...history('H1'), sourceAliases: ['SRC-A-100'], identityEvidence: [],
    }]),
  });
  const result = await matchExactHistoricalNodes(input);
  assert.equal(result.matches[0].historyNodeId, 'H1');
  assert.equal(result.matches[0].primaryEvidence.kind, 'APPROVED_ALIAS');
});

test('explicit same-history evidence identifies but does not perform reactivation', async () => {
  const claim = { kind: 'SAME_HISTORY_REACTIVATION', value: 'H1', namespace: 'SYS', authority: 'REVIEW-9', approved: true };
  const input = baseInput({
    currentLogicalNodes: [current('C1', { identityEvidence: [claim] })],
    previousRegistry: registry([history('H1', [], { lifecycleStatus: 'RETIRED' })]),
  });
  const result = await matchExactHistoricalNodes(input);
  assert.equal(result.reactivated[0].historyNodeId, 'H1');
  assert.equal(result.reactivated[0].primaryEvidence.kind, 'SAME_HISTORY_REACTIVATION');
  assert.equal(input.previousRegistry.lineHistories[0].historyNodes[0].lifecycleStatus, 'RETIRED');
});

test('retired same stable identity becomes a reactivation candidate without mutation', async () => {
  const input = baseInput({
    currentLogicalNodes: [current('C1', { stableSourcePortId: 'PORT-10' })],
    previousRegistry: registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'), { lifecycleStatus: 'RETIRED' })]),
  });
  const before = structuredClone(input.previousRegistry);
  const result = await matchExactHistoricalNodes(input);
  assert.equal(result.reactivated[0].outcome, 'REACTIVATION_CANDIDATE');
  assert.equal(result.validation.status, 'REVIEW_REQUIRED');
  assert.deepEqual(input.previousRegistry, before);
});

test('two current nodes claiming one history are globally ambiguous, not precedence-selected', async () => {
  const reviewed = { kind: 'REVIEWED_ALIAS', value: 'REF-X', aliasType: 'REF', namespace: 'SYS', reviewId: 'R-1' };
  const input = baseInput({
    currentLogicalNodes: [
      current('C2', { identityEvidence: [reviewed] }),
      current('C1', { stableSourcePortId: 'PORT-10' }),
    ],
    previousRegistry: registry([history('H1', [evidence('SOURCE_PORT', 'PORT-10'), reviewed])]),
  });
  const result = await matchExactHistoricalNodes(input);
  assert.deepEqual(result.ambiguous.map((row) => row.logicalNodeId), ['C1', 'C2']);
  assert.ok(result.ambiguous.every((row) => row.outcome === 'EXACT_AMBIGUOUS'));
  assert.equal(result.matches.length, 0);
});

test('one current node with two eligible exact histories remains ambiguous', async () => {
  const alias = { kind: 'REF', value: 'REF-X', aliasType: 'REF', namespace: 'SYS', authority: 'SOURCE' };
  const result = await matchExactHistoricalNodes(baseInput({
    currentLogicalNodes: [current('C1', { identityEvidence: [alias] })],
    previousRegistry: registry([history('H2', alias), history('H1', alias)]),
  }));
  assert.equal(result.ambiguous[0].outcome, 'EXACT_AMBIGUOUS');
  assert.deepEqual(result.ambiguous[0].competingHistoryNodeIds, ['H1', 'H2']);
});

test('unapproved exact alias is retained as REVIEW_REQUIRED rather than auto-matched', async () => {
  const input = baseInput({
    currentLogicalNodes: [current('C1', { aliases: [{ value: 'REF-X', aliasType: 'ALIAS', namespace: 'SYS' }] })],
    previousRegistry: registry([{ ...history('H1'), sourceAliases: ['REF-X'], identityEvidence: [] }]),
  });
  const result = await matchExactHistoricalNodes(input);
  assert.equal(result.ambiguous[0].outcome, 'REVIEW_REQUIRED');
  assert.equal(result.matches.length, 0);
});

test('retired alias cannot override a contradictory stable historical identity', async () => {
  const alias = { kind: 'REF', value: 'REF-X', aliasType: 'REF', namespace: 'SYS', authority: 'SOURCE' };
  const input = baseInput({
    currentLogicalNodes: [current('C1', { stableSourcePortId: 'CURRENT-PORT', identityEvidence: [alias] })],
    previousRegistry: registry([history('H1', [evidence('SOURCE_PORT', 'HISTORY-PORT'), alias], { lifecycleStatus: 'RETIRED' })]),
  });
  const result = await matchExactHistoricalNodes(input);
  assert.equal(result.conflicts[0].outcome, 'HARD_CONFLICT');
  assert.ok(result.conflicts[0].rejectedCandidates[0].rejectionReasons.some((row) => row.code === 'STABLE_IDENTITY_CONFLICT'));
});

test('project, zone, line and logical-role mismatches are hard rejections', async () => {
  const scenarios = [
    ['PROJECT_MISMATCH', { projectId: 'P2' }],
    ['ZONE_MISMATCH', { zoneId: 'Z2' }],
    ['UNAPPROVED_MAIN_LINE_RENAME', { mainLineKey: '/B' }],
    ['LOGICAL_ROLE_MISMATCH', { logicalRole: 'SUPPORT' }],
  ];
  for (const [reason, overrides] of scenarios) {
    const result = await matchExactHistoricalNodes(baseInput({
      currentLogicalNodes: [current('C1', { stableSourcePortId: 'PORT-10' })],
      previousRegistry: registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'), overrides)]),
    }));
    assert.ok(result.conflicts[0].rejectedCandidates[0].rejectionReasons.some((row) => row.code === reason));
  }
  const stale = await matchExactHistoricalNodes(baseInput({
    currentLogicalNodes: [],
    sourceInventory: inventory({ projectId: 'P2' }),
  }));
  assert.ok(stale.validation.blockers.some((row) => row.code === 'SOURCE_INVENTORY_PROJECT_MISMATCH'));
});

test('approved immutable line rename permits an otherwise exact claim', async () => {
  const input = baseInput({
    currentLogicalNodes: [current('C1', { stableSourcePortId: 'PORT-10', mainLineKey: '/NEW' })],
    previousRegistry: registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'), { mainLineKey: '/OLD' })], '/OLD'),
    config: config('/NEW', {
      approvedLineRenames: [{ projectId: 'P1', zoneId: 'Z1', fromMainLineKey: '/OLD', toMainLineKey: '/NEW', approved: true, recordId: 'REN-1' }],
    }),
  });
  const result = await matchExactHistoricalNodes(input);
  assert.equal(result.matches[0].historyNodeId, 'H1');
});

test('configured carrier, bore and support-owner conflicts eliminate exact candidates', async () => {
  const input = baseInput({
    currentLogicalNodes: [current('C1', {
      stableSourcePortId: 'PORT-10', carrierId: 'PIPE-A', boreMm: 100,
      logicalRole: 'SUPPORT', supportOwnerId: 'ROUTE-A',
    })],
    previousRegistry: registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'), {
      carrierId: 'PIPE-B', boreMm: 150, logicalRole: 'SUPPORT', supportOwnerId: 'ROUTE-B',
    })]),
    config: config('/A', { hardEligibility: { carrier: true, bore: true, supportOwner: true } }),
  });
  const result = await matchExactHistoricalNodes(input);
  const reasons = result.conflicts[0].rejectedCandidates[0].rejectionReasons.map((row) => row.code);
  assert.deepEqual(reasons, ['BORE_CONFLICT', 'CARRIER_CONFLICT', 'SUPPORT_OWNER_CONFLICT']);
});

test('coordinates alone never generate an exact candidate', async () => {
  const result = await matchExactHistoricalNodes(baseInput({
    currentLogicalNodes: [current('C1', { coordinates: { x: 1, y: 2, z: 3 } })],
    previousRegistry: registry([history('H1', [], { coordinates: { x: 1, y: 2, z: 3 } })]),
  }));
  assert.equal(result.newNodes[0].outcome, 'NO_EXACT_MATCH');
  assert.equal(result.newNodes[0].candidates.length, 0);
});

test('partial coverage never retires and hard-rejected evidence does not hide retirement candidates', async () => {
  const base = baseInput({
    currentLogicalNodes: [],
    previousRegistry: registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'))]),
  });
  const partial = await matchExactHistoricalNodes({ ...base, coverage: { scope: 'PARTIAL_LINE', authoritativeForRetirement: false } });
  const complete = await matchExactHistoricalNodes({ ...base, coverage: { scope: 'FULL_LINE', authoritativeForRetirement: true } });
  assert.deepEqual(partial.retirementCandidates, []);
  assert.equal(complete.retirementCandidates[0].disposition, 'RETIREMENT_CANDIDATE_ONLY');
  const rejected = await matchExactHistoricalNodes(baseInput({
    currentLogicalNodes: [current('C1', { stableSourcePortId: 'PORT-10' })],
    previousRegistry: registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'), { logicalRole: 'SUPPORT' })]),
    coverage: { scope: 'FULL_LINE', authoritativeForRetirement: true },
  }));
  assert.equal(rejected.retirementCandidates[0].historyNodeId, 'H1');
});

test('semantic result hash and evidence order are stable under input shuffles and audit-time changes', async () => {
  const alias = { kind: 'REF', value: 'REF-X', aliasType: 'REF', namespace: 'SYS', authority: 'SOURCE' };
  const firstInput = baseInput({
    currentLogicalNodes: [current('C2', { identityEvidence: [alias] }), current('C1', { stableSourcePortId: 'PORT-10' })],
    previousRegistry: registry([history('H2', alias), history('H1', [alias, evidence('SOURCE_PORT', 'PORT-10')])]),
  });
  const secondInput = structuredClone(firstInput);
  secondInput.currentLogicalNodes.reverse();
  secondInput.previousRegistry.lineHistories[0].historyNodes.reverse();
  secondInput.previousRegistry.lineHistories[0].historyNodes.forEach((row) => row.identityEvidence.reverse());
  secondInput.evaluatedAt = '2030-01-01T00:00:00Z';
  const [first, second] = await Promise.all([matchExactHistoricalNodes(firstInput), matchExactHistoricalNodes(secondInput)]);
  assert.equal(first.historyMatchResultHash, second.historyMatchResultHash);
  assert.deepEqual(first.matches, second.matches);
  assert.deepEqual(first.ambiguous, second.ambiguous);
});

test('inputs and exported candidate index remain deeply immutable with no number allocation', async () => {
  const input = baseInput({
    currentLogicalNodes: [current('C1', { stableSourcePortId: 'PORT-10' })],
    previousRegistry: registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'), { engineeringNodeNumber: 110 })]),
  });
  const before = structuredClone(input);
  const result = await matchExactHistoricalNodes(input);
  const index = buildExactCandidateIndex(input.previousRegistry, { defaultNamespace: 'SYS' });
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(index.histories), true);
  assert.equal(Object.isFrozen(index.lookupToken(index.histories[0].evidence[0] && [
    index.histories[0].evidence[0].kind,
    index.histories[0].evidence[0].namespace,
    index.histories[0].evidence[0].aliasType,
    index.histories[0].evidence[0].value,
  ].join('\u0000'))), true);
  assert.equal(JSON.stringify(result).includes('engineeringNodeNumber'), false);
});

test('adversarial matrix retains global competition, hard conflicts and coordinate non-matches', async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
  const result = await matchExactHistoricalNodes(baseInput(fixture));
  assert.deepEqual(result.ambiguous.map((row) => row.logicalNodeId), ['C1', 'C2']);
  assert.deepEqual(result.conflicts.filter((row) => row.logicalNodeId.startsWith('C')).map((row) => row.logicalNodeId), ['C3', 'C4']);
  assert.deepEqual(result.newNodes.map((row) => row.logicalNodeId), ['C5']);
  assert.equal(result.matches.length, 0);
});

function baseInput(overrides = {}) {
  return {
    currentLogicalNodes: overrides.currentLogicalNodes ?? [current('C1', { stableSourcePortId: 'PORT-10' })],
    sourceInventory: overrides.sourceInventory ?? inventory(),
    previousRegistry: overrides.previousRegistry ?? registry([history('H1', evidence('SOURCE_PORT', 'PORT-10'))]),
    coverage: overrides.coverage ?? { scope: 'PARTIAL_LINE', authoritativeForRetirement: false },
    config: overrides.config ?? config('/A'),
    evaluatedAt: overrides.evaluatedAt ?? '2026-07-20T08:00:00Z',
  };
}
function current(logicalNodeId, overrides = {}) {
  return { logicalNodeId, projectId: 'P1', zoneId: 'Z1', mainLineKey: '/A', logicalRole: 'ROUTE', identityNamespace: 'SYS', ...overrides };
}
function history(historyNodeId, identityEvidence = [], overrides = {}) {
  return { historyNodeId, lifecycleStatus: 'ACTIVE', logicalRole: 'ROUTE', identityEvidence: Array.isArray(identityEvidence) ? identityEvidence : [identityEvidence], ...overrides };
}
function evidence(kind, value, overrides = {}) {
  return { kind, value, namespace: 'SYS', authority: 'SOURCE', approved: true, ...overrides };
}
function registry(historyNodes, mainLineKey = '/A') {
  return { registrySnapshotHash: HASH, lineHistories: [{ projectId: 'P1', zoneId: 'Z1', mainLineKey, historyNodes }] };
}
function inventory(overrides = {}) {
  return { projectId: 'P1', zoneId: 'Z1', coordinateFrameId: 'FRAME-1', sourceIdentity: { systemId: 'SYS' }, entities: [], ports: [], ...overrides };
}
function config(mainLineKey = '/A', overrides = {}) {
  return { projectId: 'P1', zoneId: 'Z1', mainLineKey, coordinateFrameId: 'FRAME-1', logicalTopologyHash: TOPOLOGY_HASH, baseRegistrySnapshotHash: HASH, identityNormalization: { defaultNamespace: 'SYS' }, ...overrides };
}
