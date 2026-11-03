/** Deterministic three-way topology parity contract and mutation tests. */
import assert from 'node:assert/strict';
import { stampArtifactHash } from '../tabs/model-converters/converters/component-topology/topology-deterministic-hash.js';
import { buildTopologyInputXml } from '../tabs/model-converters/converters/component-topology/topology-inputxml-writer.js';
import { parseTopologyInputXml } from '../tabs/model-converters/converters/component-topology/topology-inputxml-topology-parser.js';
import { buildTopologySvgScene } from '../tabs/model-converters/converters/component-topology/topology-svg-scene-builder.js';
import { buildTopologyParityReport } from '../tabs/model-converters/converters/component-topology/topology-parity-engine.js';

const point = (x, y, z) => ({ x, y, z });
const node = (id, inputId, position, portId) => ({
  id,
  position,
  sourcePortIds: [portId],
  sourceEntityIds: ['SRC-PIPE', 'BRANCH-1'],
  sourcePaths: ['$[0].children[0]', '$[0]'],
  branchIds: ['BRANCH-1'],
  inputXmlNodeIds: [inputId],
  positionAuthority: `$[0].children[0].${portId}`,
  connectionAuthority: [`$[0].children[0].${portId}`],
  connectionResidual: 0,
});

function fixture() {
  const canonical = stampArtifactHash({
    schema: 'CanonicalTopology.v1',
    sourceIdentity: { sourceName: 'parity-fixture.json' },
    coordinateFrame: { schema: 'ManagedStage.XYZ.v1', unit: 'mm', axisFabrication: false },
    toleranceMm: 0.1,
    nodes: [node('CN-000001', '10', point(0, 0, 0), 'PORT-A'), node('CN-000002', '20', point(100, 0, 0), 'PORT-L')],
    edges: [{
      id: 'CE-000001', fromNodeId: 'CN-000001', toNodeId: 'CN-000002',
      sourceEntityIds: ['SRC-PIPE', 'SRC-SUPPORT', 'SRC-RIGID', 'BRANCH-1'],
      sourcePortIds: ['PORT-A', 'PORT-L'], sourcePaths: ['$[0].children[0]'], branchIds: ['BRANCH-1'],
      sourceTypes: ['PIPE', 'SUPPORT', 'VALV', 'BRANCH'], inputXmlElementIds: ['PE-000001'],
      segmentRole: 'PIPE_SUPPORT_SPLIT', topologyOperation: 'PIPE_SUPPORT_SPLIT',
      connectionAuthority: 'SOURCE_COMPONENT_GEOMETRY', connectionResidual: 0,
      projectionCardinality: 'ONE_TO_ONE', projectionMergeAuthority: '', mergeSourceEntityIds: [],
    }],
    pointFeatures: [{ id: 'PF-000001', kind: 'FLANGE', position: point(50, 0, 0), sourceEntityIds: ['SRC-POINT'], sourcePaths: ['$[0].children[3]'], branchIds: ['BRANCH-1'] }],
    junctions: [{ id: 'CJ-000001', kind: 'TEE', nodeId: 'CN-000002', position: point(100, 0, 0), expectedDegree: 1, participatingEdgeIds: ['CE-000001'], sourceEntityIds: ['SRC-JUNCTION'], sourcePaths: ['$[0].children[4]'], branchIds: ['BRANCH-1'] }],
    boundaries: [{ id: 'CB-000001', nodeId: 'CN-000001', position: point(0, 0, 0), relationship: 'HREF:EXTERNAL', participatingEdgeIds: ['CE-000001'], sourceEntityIds: ['BRANCH-1'], sourcePaths: ['$[0]'], branchIds: ['BRANCH-1'] }],
    supports: [{
      id: 'SUP-000001', nodeId: 'CN-000002', inputXmlNodeId: '20', position: point(100, 0, 0),
      sourcePosition: point(100, 200, 0), attachmentPosition: point(100, 0, 0),
      attachmentAuthority: 'ATTACHED_COMPONENT_REF/COMPRE:=CARRIER-1', attachmentReferences: ['=CARRIER-1'],
      attachedComponentEntityIds: ['SRC-PIPE'], attachmentEdgeSourcePath: '$[0].children[0]',
      tag: 'PS-1', sourceEntityIds: ['SRC-SUPPORT'], sourcePaths: ['$[0].children[1]'], branchIds: ['BRANCH-1'],
      restraints: [{ type: '+Y', stiffness: 0, gap: 0, friction: 0 }], connectionResidual: 200,
    }],
    rigids: [{ edgeId: 'CE-000001', sourceEntityId: 'SRC-RIGID', sourceEntityIds: ['SRC-RIGID'], sourcePath: '$[0].children[2]', sourcePaths: ['$[0].children[2]'], branchIds: ['BRANCH-1'], componentType: 'VALV', weightKg: 10, connectionResidual: 0, assignmentAuthority: 'SOURCE_COMPONENT_EDGE' }],
    buildIssues: [],
  }, 'canonicalTopologyHash');
  const ledger = stampArtifactHash({
    schema: 'TopologyTraceLedger.v1', canonicalTopologyHash: canonical.canonicalTopologyHash,
    sourceIdentity: canonical.sourceIdentity,
    records: [
      { id: 'TL-000001', sourceEntityId: 'SRC-PIPE', sourcePath: '$[0].children[0]', sourceType: 'PIPE', sourceRef: 'P-1', primaryDisposition: 'EMIT_ROUTE_EDGE', operation: 'emit-route-edge', canonicalNodeIds: ['CN-000001', 'CN-000002'], canonicalEdgeIds: ['CE-000001'], inputXmlElementIds: ['PE-000001'], inputXmlChildIds: [], affectedSourceEntityIds: [], projectionCardinality: 'ONE_TO_ONE', lossClassification: 'LOSSLESS_TOPOLOGY', status: 'ACCEPTED', branchIds: ['BRANCH-1'], evidence: {} },
      { id: 'TL-000002', sourceEntityId: 'SRC-SUPPORT', sourcePath: '$[0].children[1]', sourceType: 'SUPPORT', sourceRef: 'PS-1', primaryDisposition: 'EMIT_SUPPORT_ATTACHMENT', operation: 'emit-support-attachment', canonicalNodeIds: ['CN-000002'], canonicalEdgeIds: [], inputXmlElementIds: [], inputXmlChildIds: ['RESTRAINT:SUP-000001:1'], affectedSourceEntityIds: ['SRC-PIPE'], projectionCardinality: 'POINT_ONLY', lossClassification: 'LOSSLESS_TOPOLOGY', status: 'ACCEPTED', branchIds: ['BRANCH-1'], evidence: {} },
      { id: 'TL-000003', sourceEntityId: 'SRC-DEFERRED', sourcePath: '$[0].children[5]', sourceType: 'SUPPORT', sourceRef: '=1006649732/53464', primaryDisposition: 'DEFER_SUPPORT', operation: 'defer-support', canonicalNodeIds: [], canonicalEdgeIds: [], inputXmlElementIds: [], inputXmlChildIds: [], affectedSourceEntityIds: [], projectionCardinality: 'DEFERRED', lossClassification: 'DEFERRED_NON_RESTRAINT_ATTACHMENT', status: 'ACCEPTED', branchIds: ['BRANCH-1'], evidence: { sourcePosition: point(40, 30, 0), supportTag: 'ATTA FOR FLOOR OPENING', attachmentAuthority: 'NON_RESTRAINT_ATTACHMENT_DESCRIPTION' } },
    ],
    summary: { routeRecords: 1, blockedRecords: 0 },
  }, 'topologyTraceLedgerHash');
  const engineering = { recordBySourceEntityId: new Map() };
  const canonicalTopologyHashSha256 = 'a'.repeat(64);
  const releaseCanonical = {
    ...canonical,
    schema: 'CanonicalTopology.v2',
    canonicalTopologyHashSha256,
    nodes: canonical.nodes.map(({ inputXmlNodeIds: _numbers, ...row }) => row),
    supports: canonical.supports.map(({ inputXmlNodeId: _number, ...row }) => row),
  };
  const projection = {
    schema: 'NumberedTopologyProjection.v1', canonicalTopologyHashSha256,
    topoNodePlanHashSha256: 'b'.repeat(64), numberedTopologyProjectionHashSha256: 'c'.repeat(64),
    authority: 'TopoNodePlan.v1',
    nodes: canonical.nodes.map((row, index) => ({
      canonicalNodeId: row.id, logicalNodeId: `LN-${index + 1}`,
      engineeringNodeNumber: Number(row.inputXmlNodeIds[0]),
    })),
  };
  const xml = buildTopologyInputXml(releaseCanonical, engineering, projection, {
    jobName: 'Parity Fixture', inputXmlCompatibilityMode: 'CANONICAL_STRICT',
    topologyTraceLedgerHash: ledger.topologyTraceLedgerHash,
    legacyCanonicalTopologyHash: canonical.canonicalTopologyHash,
  });
  const parsed = parseTopologyInputXml(xml);
  const scene = buildTopologySvgScene(canonical, ledger, []);
  return { canonical, ledger, xml, parsed, scene };
}

const clone = (value) => structuredClone(value);
const reportFor = (patch = {}) => {
  const base = fixture();
  return buildTopologyParityReport({
    canonicalTopology: patch.canonical ?? base.canonical,
    traceLedger: patch.ledger ?? base.ledger,
    parsedInputXmlTopology: patch.parsed ?? base.parsed,
    topologySvgScene: patch.scene ?? base.scene,
  });
};
const hasCategory = (report, token) => report.mismatches.some((row) => row.category.includes(token));

const base = fixture();
const pass = reportFor();
assert.equal(pass.ok, true);
assert.equal(pass.status, 'PASS');
for (const key of ['topologyMismatchCount', 'missingInInputXml', 'missingInSvg', 'extraInInputXml', 'extraInSvg', 'incidenceMismatch', 'coordinateMismatch', 'supportMismatch', 'rigidMismatch', 'junctionMismatch']) assert.equal(pass.summary[key], 0, key);
assert.equal(base.parsed.issues.length, 0);
assert.equal(base.scene.deferredSupports[0].topologyBearing, false);
assert.equal(base.parsed.restraints.some((row) => row.sourceEntityIds.includes('SRC-DEFERRED')), false);

{
  const scene = clone(base.scene); scene.edges = [];
  const report = reportFor({ scene }); assert.equal(report.ok, false); assert(hasCategory(report, 'MISSING_IN_SVG_EDGE'));
}
{
  const scene = clone(base.scene); scene.edges.push({ ...scene.edges[0], id: 'SVG-EXTRA', canonicalEdgeId: 'CE-EXTRA' });
  const report = reportFor({ scene }); assert(hasCategory(report, 'EXTRA_IN_SVG_EDGE'));
}
{
  const parsed = clone(base.parsed); parsed.elements = [];
  const report = reportFor({ parsed }); assert(hasCategory(report, 'MISSING_IN_INPUTXML_EDGE'));
}
{
  const parsed = clone(base.parsed); [parsed.elements[0].fromCanonicalNodeId, parsed.elements[0].toCanonicalNodeId] = [parsed.elements[0].toCanonicalNodeId, parsed.elements[0].fromCanonicalNodeId];
  const report = reportFor({ parsed }); assert(hasCategory(report, 'INCIDENCE_MISMATCH_INPUTXML_EDGE'));
}
{
  const parsed = clone(base.parsed); parsed.elements[0].toPosition.x += 0.001;
  const report = reportFor({ parsed }); assert(hasCategory(report, 'COORDINATE_MISMATCH_INPUTXML_EDGE'));
}
{
  const parsed = clone(base.parsed); parsed.restraints[0].canonicalNodeId = 'CN-000001';
  const report = reportFor({ parsed }); assert(hasCategory(report, 'SUPPORT_MISMATCH_INPUTXML'));
}
{
  const parsed = clone(base.parsed); parsed.rigids[0].canonicalEdgeId = 'CE-WRONG';
  const report = reportFor({ parsed }); assert(hasCategory(report, 'RIGID_MISMATCH_INPUTXML'));
}
{
  const scene = clone(base.scene); scene.canonicalTopologyHash = 'fnv1a64:stale';
  const report = reportFor({ scene }); assert(hasCategory(report, 'STALE_HASH_SVG'));
}
{
  const parsed = clone(base.parsed); parsed.restraints.push({ id: 'RESTRAINT:DEFERRED:1', supportId: 'DEFERRED', sourceEntityIds: ['SRC-DEFERRED'], canonicalNodeId: 'CN-000001' });
  const report = reportFor({ parsed }); assert(hasCategory(report, 'SUPPORT_MISMATCH_DEFERRED_INPUTXML'));
}

console.log('component topology parity passed: exact three-way contract and blocking mutations verified.');
