import assert from 'node:assert/strict';
import { buildFbxTopologyBenchmarkReport } from '../../tabs/model-converters/converters/fbx/benchmark/topology-benchmark.js';

const entity = (entityId, kind, options = {}) => ({
  entityId,
  kind,
  sourcePath: `$.${entityId}`,
  zoneId: options.zoneId ?? null,
  flowParticipant: options.flowParticipant === true,
  routeSequence: options.routeSequence ?? [],
  junctionKind: null,
  expectedFlowDegree: null,
  ports: [],
});

const relationship = (relationshipId, kind, sourceEntityId, targetEntityId, options = {}) => ({
  relationshipId,
  kind,
  directed: options.directed === true,
  sourceEntityId,
  sourcePortRole: options.sourcePortRole ?? null,
  targetEntityId,
  targetPortRole: options.targetPortRole ?? null,
  authorityField: options.authorityField ?? kind,
  rawReference: options.rawReference ?? null,
  sourcePath: `$.relationships.${relationshipId}`,
  endpointResidual: null,
});

function graph() {
  return {
    schema: 'FbxBenchmarkTopologyGraph.v1',
    entities: [
      entity('B1', 'BRANCH', { zoneId: 'Z1', routeSequence: ['C1', 'C2', 'C3'] }),
      entity('C1', 'COMPONENT', { zoneId: 'Z1', flowParticipant: true }),
      entity('C2', 'COMPONENT', { zoneId: 'Z1', flowParticipant: true }),
      entity('C3', 'COMPONENT', { zoneId: 'Z2', flowParticipant: true }),
    ],
    relationships: [
      relationship('OWN-C1', 'BRANCH_OWNERSHIP', 'B1', 'C1', { directed: true }),
      relationship('OWN-C2', 'BRANCH_OWNERSHIP', 'B1', 'C2', { directed: true }),
      relationship('OWN-C3', 'BRANCH_OWNERSHIP', 'B1', 'C3', { directed: true }),
      relationship('FLOW-C1-C2', 'FLOW_ADJACENCY', 'C1', 'C2', {
        sourcePortRole: 'L', targetPortRole: 'A',
      }),
      relationship('FLOW-C2-C3', 'FLOW_ADJACENCY', 'C2', 'C3', {
        sourcePortRole: 'L', targetPortRole: 'A',
      }),
      relationship('BOUNDARY-C2-C3', 'ZONE_BOUNDARY', 'C2', 'C3', {
        sourcePortRole: 'L', targetPortRole: 'A', authorityField: 'ZONE_MANIFEST',
      }),
    ],
  };
}

const policy = {
  schema: 'FbxTopologyBenchmarkPolicy.v1',
  policyId: 'topology-review-test',
  branchSequenceAuthority: 'AUTHORITATIVE',
  reciprocalKinds: [],
  approvedOneWayReciprocityKeys: [],
  cyclePolicy: { mode: 'FAIL_ALL', allowedCycleClosingRelationshipIds: [] },
};
const toleranceProfile = {
  schema: 'FbxBenchmarkToleranceProfile.v1',
  profileId: 'topology-review-tolerance',
  endpointTolerance: 0.5,
};

function qualify(actualGraph, referenceGraph = graph()) {
  return buildFbxTopologyBenchmarkReport({
    benchmarkIdentity: { benchmarkId: 'topology-review' },
    executionIdentity: { testedRepositorySha: 'a'.repeat(40) },
    referenceGraph,
    actualGraph,
    policy,
    toleranceProfile,
  });
}

const accepted = qualify(graph());
assert.equal(accepted.status, 'PASS');
const branch = accepted.branches.find((row) => row.branchId === 'B1');
assert.deepEqual(
  branch.route.adjacencyResultIds.map((ledgerId) => (
    accepted.relationships.find((row) => row.ledgerId === ledgerId).relationshipId
  )),
  ['FLOW-C1-C2', 'FLOW-C2-C3'],
);

const referenceWithIsolated = structuredClone(graph());
referenceWithIsolated.entities.push(entity('ISOLATED', 'OTHER'));
const missingEntity = qualify(graph(), referenceWithIsolated);
assert.equal(missingEntity.status, 'FAIL');
assert.deepEqual(missingEntity.coverage.unrepresentedReferenceEntities, ['ISOLATED']);

const reversedBoundary = structuredClone(graph());
const boundary = reversedBoundary.relationships.find((row) => row.relationshipId === 'BOUNDARY-C2-C3');
[boundary.sourceEntityId, boundary.targetEntityId] = [boundary.targetEntityId, boundary.sourceEntityId];
[boundary.sourcePortRole, boundary.targetPortRole] = [boundary.targetPortRole, boundary.sourcePortRole];
assert.equal(qualify(reversedBoundary).status, 'PASS');

const selfReference = structuredClone(graph());
selfReference.relationships.push(relationship('REF-SELF', 'REFERENCE_ADJACENCY', 'C1', 'C1', {
  directed: true,
  sourcePortRole: 'A',
  targetPortRole: 'L',
  authorityField: 'CREF',
  rawReference: 'C1',
}));
const selfReferenceReport = qualify(selfReference, selfReference);
assert.equal(selfReferenceReport.status, 'FAIL');
assert.ok(selfReferenceReport.anomalies.selfConnections.some((row) => row.relationshipId === 'REF-SELF'));

const permuted = graph();
permuted.entities.reverse();
permuted.relationships.reverse();
assert.deepEqual(qualify(permuted), accepted);

console.log('test-benchmark-topology-review: PASS');
