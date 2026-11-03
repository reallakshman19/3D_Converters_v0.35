import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildFbxTopologyBenchmarkReport } from '../../tabs/model-converters/converters/fbx/benchmark/topology-benchmark.js';


function validateSchema(schema, instance) {
  const program = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
Draft202012Validator.check_schema(payload["schema"])
errors = sorted(Draft202012Validator(payload["schema"]).iter_errors(payload["instance"]), key=lambda error: (list(error.absolute_path), error.message))
print(json.dumps([{"path": list(error.absolute_path), "message": error.message} for error in errors]))
`;
  const python = process.env.FBX_SCHEMA_PYTHON || 'python3';
  const result = spawnSync(python, ['-c', program], {
    input: JSON.stringify({ schema, instance }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout);
}

const entity = (entityId, kind, options = {}) => ({
  entityId, kind, sourcePath: options.sourcePath ?? `$.${entityId}`,
  zoneId: options.zoneId ?? null,
  flowParticipant: options.flowParticipant === true,
  routeSequence: options.routeSequence ?? [],
  junctionKind: options.junctionKind ?? null,
  expectedFlowDegree: options.expectedFlowDegree ?? null,
  ports: options.ports ?? [],
});

const relationship = (relationshipId, kind, sourceEntityId, targetEntityId, options = {}) => ({
  relationshipId, kind, sourceEntityId, targetEntityId,
  directed: options.directed === true,
  sourcePortRole: options.sourcePortRole ?? null,
  targetPortRole: options.targetPortRole ?? null,
  authorityField: options.authorityField ?? kind,
  rawReference: options.rawReference ?? null,
  sourcePath: options.sourcePath ?? `$.relationships.${relationshipId}`,
  endpointResidual: options.endpointResidual ?? null,
});

function graph() {
  return {
    schema: 'FbxBenchmarkTopologyGraph.v1',
    entities: [
      entity('B1', 'BRANCH', { zoneId: 'Z1', routeSequence: ['C1', 'C2'] }),
      entity('B2', 'BRANCH', { zoneId: 'Z2', routeSequence: ['C3'] }),
      entity('C1', 'COMPONENT', { zoneId: 'Z1', flowParticipant: true }),
      entity('C2', 'COMPONENT', { zoneId: 'Z1', flowParticipant: true }),
      entity('C3', 'COMPONENT', { zoneId: 'Z2', flowParticipant: true }),
      entity('S1', 'SUPPORT', { zoneId: 'Z1' }),
    ],
    relationships: [
      relationship('OWN-B1-C1', 'BRANCH_OWNERSHIP', 'B1', 'C1', { directed: true }),
      relationship('OWN-B1-C2', 'BRANCH_OWNERSHIP', 'B1', 'C2', { directed: true }),
      relationship('OWN-B2-C3', 'BRANCH_OWNERSHIP', 'B2', 'C3', { directed: true }),
      relationship('FLOW-C1-C2', 'FLOW_ADJACENCY', 'C1', 'C2', { sourcePortRole: 'L', targetPortRole: 'A' }),
      relationship('FLOW-C2-C3', 'FLOW_ADJACENCY', 'C2', 'C3', { sourcePortRole: 'L', targetPortRole: 'A' }),
      relationship('REF-B1-B2-A', 'REFERENCE_ADJACENCY', 'B1', 'B2', {
        directed: true, sourcePortRole: 'T', targetPortRole: 'H', authorityField: 'TREF', rawReference: 'B2',
      }),
      relationship('REF-B1-B2-B', 'REFERENCE_ADJACENCY', 'B2', 'B1', {
        directed: true, sourcePortRole: 'H', targetPortRole: 'T', authorityField: 'HREF', rawReference: 'B1',
      }),
      relationship('BOUNDARY-B1-B2', 'ZONE_BOUNDARY', 'B1', 'B2', {
        sourcePortRole: 'T', targetPortRole: 'H', authorityField: 'ZONE_MANIFEST',
      }),
      relationship('BOUNDARY-C2-C3', 'ZONE_BOUNDARY', 'C2', 'C3', {
        sourcePortRole: 'L', targetPortRole: 'A', authorityField: 'ZONE_MANIFEST',
      }),
      relationship('HOST-S1-C1', 'SUPPORT_HOST', 'S1', 'C1', {
        directed: true, targetPortRole: 'P', authorityField: 'ATTACHED_COMPONENT_REF',
      }),
    ],
  };
}

const policy = Object.freeze({
  schema: 'FbxTopologyBenchmarkPolicy.v1',
  policyId: 'topology-policy-test',
  branchSequenceAuthority: 'AUTHORITATIVE',
  reciprocalKinds: ['REFERENCE_ADJACENCY'],
  approvedOneWayReciprocityKeys: [],
  cyclePolicy: { mode: 'FAIL_ALL', allowedCycleClosingRelationshipIds: [] },
});

const toleranceProfile = Object.freeze({
  schema: 'FbxBenchmarkToleranceProfile.v1',
  profileId: 'tolerance-test',
  endpointTolerance: 0.5,
});

const identity = Object.freeze({ benchmarkId: 'benchmark-test' });
const execution = Object.freeze({ testedRepositorySha: 'a'.repeat(40) });

function qualify(actualGraph, referenceGraph = graph()) {
  return buildFbxTopologyBenchmarkReport({
    benchmarkIdentity: identity,
    executionIdentity: execution,
    referenceGraph,
    actualGraph,
    policy,
    toleranceProfile,
  });
}

function changed(value, mutate) {
  const copy = structuredClone(value);
  mutate(copy);
  return copy;
}

const accepted = qualify(graph());
assert.equal(accepted.schema, 'FbxTopologyBenchmarkReport.v1');
assert.equal(accepted.status, 'PASS');
assert.equal(accepted.summary.topologyStatus, 'PASS');
assert.equal(accepted.relationships.length, graph().relationships.length);
assert.equal(accepted.anomalies.disconnectedIslands.length, 0);
assert.equal(accepted.anomalies.reciprocityMismatches.length, 0);
assert.equal(accepted.boundaries[0].boundaryClass, 'CROSS_ZONE');
assert.equal(accepted.summary.islandCount, 1, 'support-host association must not create a flow island');

const permuted = graph();
permuted.entities.reverse();
permuted.relationships.reverse();
assert.deepEqual(qualify(permuted), accepted, 'non-authoritative input ordering changed evidence');

const missingEdge = changed(graph(), (value) => {
  value.relationships = value.relationships.filter((row) => row.relationshipId !== 'FLOW-C1-C2');
});
const missingEdgeReport = qualify(missingEdge);
assert.equal(missingEdgeReport.status, 'FAIL');
assert.ok(missingEdgeReport.relationships.some((row) => row.relationshipId === 'FLOW-C1-C2' && row.matchState === 'MISSING_ACTUAL'));
assert.equal(missingEdgeReport.anomalies.disconnectedIslands.length, 2);

const duplicateEdge = changed(graph(), (value) => {
  value.relationships.push(structuredClone(value.relationships.find((row) => row.relationshipId === 'FLOW-C1-C2')));
});
const duplicateReport = qualify(duplicateEdge);
assert.equal(duplicateReport.status, 'FAIL');
assert.ok(duplicateReport.relationships.some((row) => row.matchState === 'DUPLICATE_EDGE'));
assert.ok(duplicateReport.anomalies.duplicateEdges.length >= 1);

const selfEdge = changed(graph(), (value) => {
  value.relationships.push(relationship('FLOW-SELF', 'FLOW_ADJACENCY', 'C1', 'C1', {
    sourcePortRole: 'A', targetPortRole: 'A',
  }));
});
const selfReport = qualify(selfEdge);
assert.equal(selfReport.status, 'FAIL');
assert.equal(selfReport.anomalies.selfConnections.length, 1);

const brokenReciprocal = changed(graph(), (value) => {
  value.relationships = value.relationships.filter((row) => row.relationshipId !== 'REF-B1-B2-B');
});
const reciprocalReport = qualify(brokenReciprocal);
assert.equal(reciprocalReport.status, 'FAIL');
assert.equal(reciprocalReport.anomalies.reciprocityMismatches.length, 1);

const missingBoundary = changed(graph(), (value) => {
  value.relationships = value.relationships.filter((row) => row.relationshipId !== 'BOUNDARY-C2-C3');
});
const boundaryReport = qualify(missingBoundary);
assert.equal(boundaryReport.status, 'FAIL');
assert.ok(boundaryReport.anomalies.boundaryDiscontinuities.some((row) => row.code === 'CROSS_ZONE_BOUNDARY_UNDECLARED'));

const movedZone = changed(graph(), (value) => {
  value.entities.find((row) => row.entityId === 'C3').zoneId = 'Z1';
});
const zoneReport = qualify(movedZone);
assert.equal(zoneReport.status, 'FAIL');
assert.ok(zoneReport.relationships.some((row) => row.relationshipId === 'BOUNDARY-C2-C3' && row.matchState === 'ZONE_BOUNDARY_MISMATCH'));

const excessiveResidual = changed(graph(), (value) => {
  value.relationships.find((row) => row.relationshipId === 'FLOW-C1-C2').endpointResidual = 0.500001;
});
const residualReport = qualify(excessiveResidual);
assert.equal(residualReport.status, 'FAIL');
assert.ok(residualReport.relationships.some((row) => row.relationshipId === 'FLOW-C1-C2' && row.matchState === 'ENDPOINT_MISMATCH'));

const reorderedRoute = changed(graph(), (value) => {
  value.entities.find((row) => row.entityId === 'B1').routeSequence.reverse();
});
const routeReport = qualify(reorderedRoute);
assert.equal(routeReport.status, 'FAIL');
assert.equal(routeReport.branches.find((row) => row.branchId === 'B1').route.sequenceMatch, false);

const cycle = changed(graph(), (value) => {
  value.relationships.push(relationship('FLOW-C3-C1', 'FLOW_ADJACENCY', 'C3', 'C1', {
    sourcePortRole: 'L', targetPortRole: 'A',
  }));
});
const cycleReport = qualify(cycle);
assert.equal(cycleReport.status, 'FAIL');
assert.ok(cycleReport.anomalies.unexpectedCycles.some((row) => row.relationshipId === 'FLOW-C3-C1'));

const duplicateReferenceIdentity = changed(graph(), (value) => {
  value.entities.push(structuredClone(value.entities.find((row) => row.entityId === 'C1')));
});
const blocked = qualify(graph(), duplicateReferenceIdentity);
assert.equal(blocked.status, 'BLOCKED');
assert.equal(blocked.anomalies.ambiguousReferences[0].code, 'DUPLICATE_ENTITY_IDENTITY');


const graphSchema = JSON.parse(await readFile(
  new URL('../../contracts/fbx/fbx-topology-benchmark-graph.v1.schema.json', import.meta.url), 'utf8',
));
const policySchema = JSON.parse(await readFile(
  new URL('../../contracts/fbx/fbx-topology-benchmark-policy.v1.schema.json', import.meta.url), 'utf8',
));
const reportSchema = JSON.parse(await readFile(
  new URL('../../contracts/fbx/fbx-topology-benchmark-report.v1.schema.json', import.meta.url), 'utf8',
));
assert.equal(validateSchema(graphSchema, graph()).length, 0, 'topology graph must satisfy executable schema');
assert.equal(validateSchema(policySchema, policy).length, 0, 'topology policy must satisfy executable schema');
assert.equal(validateSchema(reportSchema, accepted).length, 0, 'topology report must satisfy executable schema');
const invalidReport = structuredClone(accepted);
invalidReport.unexpected = true;
assert.notEqual(validateSchema(reportSchema, invalidReport).length, 0, 'report schema must be closed');

console.log('test-benchmark-topology: PASS');
