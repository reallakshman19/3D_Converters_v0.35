import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  HASH_POLICIES,
  canonicalSemanticJson,
  computeSemanticHash,
  freezeContract,
  validateContract,
} from '../contracts/topo-enriched-xml/contract-core.js';
import { PARITY_BOOLEAN_GATES, PARITY_NUMERIC_GATES } from '../contracts/topo-enriched-xml/contract-rules.js';

const V = (status = 'PASS') => ({ status, blockers: [], reviewItems: [], warnings: [] });
const chain = { projectId: 'P', zoneId: 'Z' };
const paritySide = {
  nodePlanHash: 'sha256:n',
  occurrencePlanHash: 'sha256:o',
  xmlHash: 'sha256:xml',
  traceHash: 'sha256:trace',
  bundleHash: 'sha256:bundle',
  emittedOccurrenceCount: 1,
  reservedOccurrenceCount: 1,
};
const parityGates = {
  ...Object.fromEntries(PARITY_BOOLEAN_GATES.map((gate) => [gate, true])),
  ...PARITY_NUMERIC_GATES,
};
const writerOccurrence = {
  occurrenceId: 'WO-1',
  sourceEntityId: 'SE-1',
  sourceBranch: '/L/B1',
  canonicalMainLine: '/L',
  componentProjectionId: 'CP-1',
  projectionRole: 'ARRIVE',
  endpoint: 1,
  psiComponentType: 'PIPE',
  coordinateRole: 'APOS',
  disposition: 'EMITTED',
};

const fixtures = {
  'TopoSourceInventory.v1': { schema: 'TopoSourceInventory.v1', ...chain, coordinateFrameId: 'F', sourceIdentity: { sourceHash: 'sha256:x' }, branches: [{ sourceBranch: '/L/B1' }], entities: [{ sourceEntityId: 'SE-1' }], ports: [{ sourcePortId: 'SP-1', sourceEntityId: 'SE-1' }], validation: V() },
  'TopoLogicalGraph.v1': { schema: 'TopoLogicalGraph.v1', ...chain, coordinateFrameId: 'F', sourceInventoryHash: 'sha256:a', nodes: [{ logicalNodeId: 'LN-1' }, { logicalNodeId: 'LN-2' }], edges: [{ logicalEdgeId: 'LE-1', fromLogicalNodeId: 'LN-1', toLogicalNodeId: 'LN-2' }], junctions: [], boundaries: [], supports: [], validation: V() },
  'TopoNodeTopologyNormalization.v1': { schema: 'TopoNodeTopologyNormalization.v1', ...chain, sourceInventoryHash: 'sha256:a', inputLogicalTopologyHash: 'sha256:b', outputLogicalTopologyHash: 'sha256:c', rawPortMappings: [{ sourcePortId: 'SP-1', logicalNodeId: 'LN-1' }], actions: [{ actionId: 'A-1', disposition: 'PRESERVE' }], validation: V() },
  'TopoSequencePlan.v1': { schema: 'TopoSequencePlan.v1', ...chain, sourceInventoryHash: 'sha256:a', logicalTopologyHash: 'sha256:b', branches: [{ sourceBranch: '/L/B1', canonicalMainLine: '/L' }], components: [{ sourceEntityId: 'SE-1', sourceBranch: '/L/B1' }], validation: V() },
  'TopoNodeHistoryMatchResult.v1': { schema: 'TopoNodeHistoryMatchResult.v1', ...chain, mainLineKey: '/L', coordinateFrameId: 'F', logicalTopologyHash: 'sha256:b', baseRegistrySnapshotHash: 'sha256:r', matches: [{ logicalNodeId: 'LN-1', historyNodeId: 'HN-1' }], newNodes: [], ambiguous: [], conflicts: [], reactivated: [], retirementCandidates: [], validation: V() },
  'TopoNodeAllocationResult.v1': { schema: 'TopoNodeAllocationResult.v1', ...chain, baseRegistrySnapshotHash: 'sha256:r', historyMatchResultHash: 'sha256:h', leases: [{ leaseId: 'L-1', mainLineKey: '/L', start: 500, end: 590, step: 10 }], allocations: [{ logicalNodeId: 'LN-1', historyNodeId: 'HN-1', engineeringNodeNumber: 500 }], retirements: [], reactivations: [], validation: V() },
  'TopoNodePlan.v1': { schema: 'TopoNodePlan.v1', ...chain, sourceInventoryHash: 'sha256:a', logicalTopologyHash: 'sha256:b', sequencePlanHash: 'sha256:c', baseRegistrySnapshotHash: 'sha256:r', configHash: 'sha256:g', logicalNodes: [{ logicalNodeId: 'LN-1', historyNodeId: 'HN-1' }], emittedOccurrences: [{ occurrenceId: 'WO-1', logicalNodeId: 'LN-1', componentProjectionId: 'CP-1', engineeringNodeNumber: 500 }], reservedOccurrences: [{ occurrenceId: 'WO-2', logicalNodeId: 'LN-1', componentProjectionId: 'CP-1', engineeringNodeNumber: 510 }], rawPortMappings: [{ sourcePortId: 'SP-1', logicalNodeId: 'LN-1' }], componentProjection: [{ componentProjectionId: 'CP-1', sourceEntityId: 'SE-1', emittedOccurrenceIds: ['WO-1'], reservedOccurrenceIds: ['WO-2'] }], validation: V(), nodePlanHash: 'sha256:n' },
  'TopoTopologyIndex.v1': { schema: 'TopoTopologyIndex.v1', ...chain, sourceInventoryHash: 'sha256:a', logicalTopologyHash: 'sha256:b', nodePlanHash: 'sha256:n', sourceToLogical: [{ sourceIdentity: 'SE-1', logicalNodeIds: ['LN-1'] }], logicalToSource: [{ logicalNodeId: 'LN-1', sourceIdentities: ['SE-1'] }], logicalToOccurrences: [{ logicalNodeId: 'LN-1', occurrenceIds: ['WO-1'] }], occurrenceToLogical: [{ occurrenceId: 'WO-1', logicalNodeId: 'LN-1' }], validation: V() },
  'TopoNodeRegistryPatch.v1': { schema: 'TopoNodeRegistryPatch.v1', ...chain, baseRegistryCommit: 'abc', baseRegistrySnapshotHash: 'sha256:r', coverage: { scope: 'PARTIAL_LINE', authoritativeForRetirement: false }, preconditions: [], operations: [{ operationId: 'OP-1', type: 'UPSERT_NODE' }], validation: V(), proposedRegistryHash: 'sha256:p' },
  'TopoPreprocessAudit.v1': { schema: 'TopoPreprocessAudit.v1', runId: 'RUN-1', ...chain, sourceHash: 'sha256:s', configHash: 'sha256:g', baseRegistrySnapshotHash: 'sha256:r', evaluatedAt: '2026-07-19T00:00:00Z', summary: {}, actions: [{ actionId: 'A-1', type: 'PRESERVE' }], validation: V() },
  'TopoEnrichedXmlValidationReport.v1': { schema: 'TopoEnrichedXmlValidationReport.v1', ...chain, operatingMode: 'SHADOW', sourceInventoryHash: 'sha256:a', logicalTopologyHash: 'sha256:b', sequencePlanHash: 'sha256:c', nodePlanHash: 'sha256:n', gates: {}, issues: [], validation: V() },
  'PsiWriterOccurrencePlan.v1': { schema: 'PsiWriterOccurrencePlan.v1', ...chain, sourceInventoryHash: 'sha256:a', logicalTopologyHash: 'sha256:b', sequencePlanHash: 'sha256:c', occurrences: [writerOccurrence], componentProjection: [{ componentProjectionId: 'CP-1', occurrenceIds: ['WO-1'] }], validation: V(), occurrencePlanHash: 'sha256:o' },
  'PsiWriterOccurrence.v1': { schema: 'PsiWriterOccurrence.v1', ...writerOccurrence },
  'PsiSerializationPlan.v1': { schema: 'PsiSerializationPlan.v1', ...chain, nodePlanHash: 'sha256:n', occurrencePlanHash: 'sha256:o', profile: 'STRICT_PSI', branches: [{ sourceBranch: '/L/B1' }], occurrences: [{ occurrenceId: 'WO-1', logicalNodeId: 'LN-1', componentProjectionId: 'CP-1', engineeringNodeNumber: 500, disposition: 'EMITTED' }], validation: V(), serializationPlanHash: 'sha256:z' },
  'PsiWriterParityReport.v2': { schema: 'PsiWriterParityReport.v2', ...chain, nodePlanHash: 'sha256:n', occurrencePlanHash: 'sha256:o', canonical: { ...paritySide }, sequential: { ...paritySide }, differences: [], gates: { ...parityGates }, validation: V() },
};

const clone = structuredClone;
const E = (name, value) => validateContract(name, value);
const has = (errors, token) => errors.some((message) => message.includes(token));
const schemaCatalog = JSON.parse(readFileSync(new URL('../schemas/topo-enriched-xml/topo-enriched-xml-contracts.schema.json', import.meta.url), 'utf8'));
const schemaFor = (name) => JSON.parse(readFileSync(new URL(`../schemas/topo-enriched-xml/${name}.schema.json`, import.meta.url), 'utf8'));

function draft202012Validate(cases) {
  const script = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
results = []
for case in payload['cases']:
    Draft202012Validator.check_schema(case['schema'])
    validator = Draft202012Validator(case['schema'])
    results.append({'id': case['id'], 'valid': not any(validator.iter_errors(case['artifact']))})
json.dump(results, sys.stdout)
`;
  const result = spawnSync('python3', ['-c', script], {
    input: JSON.stringify({ cases }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(JSON.parse(result.stdout).map((row) => [row.id, row.valid]));
}

test('all required contracts have runtime-valid, Draft 2020-12-valid, immutable minimal artifacts', () => {
  assert.equal(Object.keys(fixtures).length, 15);
  assert.equal(Object.keys(schemaCatalog.$defs).length, 15);
  const schemaResults = draft202012Validate(Object.entries(fixtures).map(([name, artifact]) => ({ id: name, name, artifact, schema: schemaFor(name) })));
  for (const [name, artifact] of Object.entries(fixtures)) {
    assert.deepEqual(E(name, artifact), [], name);
    assert.equal(schemaResults[name], true, `${name} must pass Draft 2020-12 instance validation`);
    const frozen = freezeContract(name, artifact);
    assert(Object.isFrozen(frozen));
    for (const child of Object.values(frozen)) if (child && typeof child === 'object') assert(Object.isFrozen(child));
  }
});

test('runtime and Draft 2020-12 reject the same structural and prohibited-field mutations', () => {
  const cases = [];
  const add = (id, name, mutate) => {
    const artifact = clone(fixtures[name]);
    mutate(artifact);
    assert.notDeepEqual(E(name, artifact), [], `${id} runtime rejection`);
    cases.push({ id, name, artifact, schema: schemaFor(name) });
  };
  add('occurrence-number', 'PsiWriterOccurrence.v1', (value) => { value.engineeringNodeNumber = 500; });
  add('node-plan-offset', 'TopoNodePlan.v1', (value) => { value.reservedOccurrences[0].numberOffset = 10; });
  add('nested-occurrence-source', 'PsiWriterOccurrencePlan.v1', (value) => { delete value.occurrences[0].sourceEntityId; });
  add('nested-occurrence-endpoint', 'PsiWriterOccurrencePlan.v1', (value) => { delete value.occurrences[0].endpoint; });
  add('pass-with-blocker', 'TopoSourceInventory.v1', (value) => { value.validation.blockers.push({ code: 'B-1' }); });
  const results = draft202012Validate(cases);
  for (const row of cases) assert.equal(results[row.id], false, `${row.id} must fail Draft 2020-12 instance validation`);
});

test('nested writer occurrences enforce the complete frozen identity and projection shape', () => {
  for (const field of ['sourceEntityId', 'sourceBranch', 'canonicalMainLine', 'componentProjectionId', 'projectionRole', 'endpoint', 'psiComponentType', 'coordinateRole']) {
    const plan = clone(fixtures['PsiWriterOccurrencePlan.v1']);
    delete plan.occurrences[0][field];
    assert(has(E(plan.schema, plan), `${field} is required`), field);
  }
  const extra = clone(fixtures['PsiWriterOccurrencePlan.v1']);
  extra.occurrences[0].writerCounter = 1;
  assert(has(E(extra.schema, extra), 'unapproved field writerCounter'));
});

test('TopoNodePlan requires exact one-owner coverage for emitted and reserved occurrences', () => {
  const orphan = clone(fixtures['TopoNodePlan.v1']);
  orphan.componentProjection[0].reservedOccurrenceIds = [];
  assert(has(E(orphan.schema, orphan), 'WO-2 is orphaned'));
  const unknown = clone(fixtures['TopoNodePlan.v1']);
  unknown.componentProjection[0].reservedOccurrenceIds = ['WO-X'];
  assert(has(E(unknown.schema, unknown), 'unknown reserved occurrence WO-X'));
  const duplicate = clone(fixtures['TopoNodePlan.v1']);
  duplicate.componentProjection.push({ componentProjectionId: 'CP-2', sourceEntityId: 'SE-2', emittedOccurrenceIds: ['WO-1'], reservedOccurrenceIds: [] });
  assert(has(E(duplicate.schema, duplicate), 'owned by multiple component projections'));
  const wrongKind = clone(fixtures['TopoNodePlan.v1']);
  wrongKind.componentProjection[0].emittedOccurrenceIds = ['WO-2'];
  wrongKind.componentProjection[0].reservedOccurrenceIds = ['WO-1'];
  assert(has(E(wrongKind.schema, wrongKind), 'classifies occurrence WO-2 as EMITTED'));
  const wrongOwner = clone(fixtures['TopoNodePlan.v1']);
  wrongOwner.reservedOccurrences[0].componentProjectionId = 'CP-X';
  assert(has(E(wrongOwner.schema, wrongOwner), 'declares componentProjectionId CP-X'));
});

test('allocation ownership is one-to-one in both number-to-owner and owner-to-number directions', () => {
  const numberCollision = clone(fixtures['TopoNodeAllocationResult.v1']);
  numberCollision.allocations.push({ logicalNodeId: 'LN-2', historyNodeId: 'HN-2', engineeringNodeNumber: 500 });
  assert(has(E(numberCollision.schema, numberCollision), 'multiple zone owners'));
  const logicalDuplicate = clone(fixtures['TopoNodeAllocationResult.v1']);
  logicalDuplicate.allocations.push({ logicalNodeId: 'LN-1', historyNodeId: 'HN-2', engineeringNodeNumber: 510 });
  assert(has(E(logicalDuplicate.schema, logicalDuplicate), 'Logical node LN-1 has more than one'));
  const historyDuplicate = clone(fixtures['TopoNodeAllocationResult.v1']);
  historyDuplicate.allocations.push({ logicalNodeId: 'LN-2', historyNodeId: 'HN-1', engineeringNodeNumber: 510 });
  assert(has(E(historyDuplicate.schema, historyDuplicate), 'Historical node HN-1 has more than one'));
});

test('PsiWriterParityReport PASS requires every hash, occurrence, projection, engineering, trace and atomic-bundle gate', () => {
  for (const gate of PARITY_BOOLEAN_GATES) {
    const parity = clone(fixtures['PsiWriterParityReport.v2']);
    parity.gates[gate] = false;
    assert(has(E(parity.schema, parity), gate), gate);
  }
  for (const [gate, expected] of Object.entries(PARITY_NUMERIC_GATES)) {
    const parity = clone(fixtures['PsiWriterParityReport.v2']);
    parity.gates[gate] = expected + 1;
    assert(has(E(parity.schema, parity), gate), gate);
  }
  const occurrenceHash = clone(fixtures['PsiWriterParityReport.v2']);
  occurrenceHash.sequential.occurrencePlanHash = 'sha256:other';
  assert(has(E(occurrenceHash.schema, occurrenceHash), 'sequential occurrencePlanHash'));
  const nodeHash = clone(fixtures['PsiWriterParityReport.v2']);
  nodeHash.canonical.nodePlanHash = 'sha256:other';
  assert(has(E(nodeHash.schema, nodeHash), 'canonical nodePlanHash'));
  const differences = clone(fixtures['PsiWriterParityReport.v2']);
  differences.differences.push({ code: 'DRIFT' });
  assert(has(E(differences.schema, differences), 'cannot contain differences'));
});

test('zone uniqueness, partial retirement and shared occurrence-number semantics remain frozen', () => {
  const shared = clone(fixtures['TopoNodePlan.v1']);
  shared.reservedOccurrences[0].engineeringNodeNumber = 500;
  assert.deepEqual(E(shared.schema, shared), []);
  shared.logicalNodes.push({ logicalNodeId: 'LN-2' });
  shared.reservedOccurrences[0].logicalNodeId = 'LN-2';
  assert(has(E(shared.schema, shared), 'maps to multiple logical nodes'));
  const patch = clone(fixtures['TopoNodeRegistryPatch.v1']);
  patch.operations.push({ operationId: 'OP-2', type: 'RETIRE_NODE' });
  assert(has(E(patch.schema, patch), 'cannot retire'));
  patch.coverage = { scope: 'FULL_LINE', authoritativeForRetirement: true };
  assert.deepEqual(E(patch.schema, patch), []);
});

test('hash policies are reproducible and exclude audit metadata', async () => {
  assert.equal(Object.keys(HASH_POLICIES).length, 10);
  const left = clone(fixtures['TopoNodePlan.v1']);
  const right = Object.fromEntries(Object.entries(left).reverse());
  right.evaluatedAt = '2099-01-01T00:00:00Z';
  assert.equal(canonicalSemanticJson(left), canonicalSemanticJson(right));
  assert.equal(await computeSemanticHash(left, 'nodePlanHash'), await computeSemanticHash(right, 'nodePlanHash'));
  right.logicalNodes = clone(right.logicalNodes);
  right.logicalNodes[0].historyNodeId = 'HN-CHANGED';
  assert.notEqual(await computeSemanticHash(left, 'nodePlanHash'), await computeSemanticHash(right, 'nodePlanHash'));
});

test('operating mode and status semantics cannot be weakened', () => {
  const report = clone(fixtures['TopoEnrichedXmlValidationReport.v1']);
  report.operatingMode = 'ENFORCED';
  report.validation = V('REVIEW_REQUIRED');
  report.validation.reviewItems.push({ code: 'R-1' });
  assert(has(E(report.schema, report), 'ENFORCED output requires validation PASS'));
  report.operatingMode = 'FALLBACK';
  assert(has(E(report.schema, report), 'operatingMode'));
  const review = clone(fixtures['TopoSourceInventory.v1']);
  review.validation.status = 'REVIEW_REQUIRED';
  assert(has(E(review.schema, review), 'requires review evidence'));
  review.validation.reviewItems.push({ code: 'R-1' });
  assert.deepEqual(E(review.schema, review), []);
});
