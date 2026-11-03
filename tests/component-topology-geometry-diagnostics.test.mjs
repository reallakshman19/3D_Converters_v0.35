/** Fixed geometry-rule cases for the dedicated canonical diagnostics module. */

import assert from 'node:assert/strict';
import { runTopologyChecks, validateTopologyGeometry } from '../tabs/model-converters/converters/component-topology/topology-geometry-diagnostics.js';
import { buildTopologyFixSuggestions } from '../tabs/model-converters/converters/component-topology/topology-checker-suggestions.js';
import { createTopologyReviewState, setTopologyIssueStatus, topologyReviewSummary } from '../tabs/model-converters/converters/component-topology/topology-checker-review.js';

const node = (id, x, y, z, sourcePortIds = [`PORT-${id}`]) => ({ id, position: { x, y, z }, sourcePortIds, positionAuthority: sourcePortIds.length ? 'SOURCE' : 'DEFAULT' });
const edge = (id, fromNodeId, toNodeId, branchIds = ['BRANCH-1']) => ({ id, fromNodeId, toNodeId, branchIds, sourceTypes: ['PIPE'], segmentRole: 'PIPE' });
const canonical = {
  schema: 'CanonicalTopology.v1', toleranceMm: 0.1,
  nodes: [
    node('N1', 0, 0, 0), node('N2', 5, 0, 0), node('N3', 100, 0, 0), node('N4', 100, 100, 0),
    node('N5', 50, -50, 0), node('N6', 50, 50, 0), node('N7', 20, 0, 0), node('N8', 80, 0, 0),
    node('N9', 999, 999, 999), node('N10', 0, 0, 0, []),
  ],
  edges: [
    edge('E1', 'N1', 'N2'), edge('E2', 'N2', 'N3'), { ...edge('E3', 'N3', 'N4'), diameterMm: 100 },
    edge('E4', 'N5', 'N6', ['BRANCH-2']), edge('E5', 'N7', 'N8', ['BRANCH-3']),
  ],
  junctions: [], supports: [], boundaries: [], rigids: [], pointFeatures: [], buildIssues: [],
};
const report = validateTopologyGeometry(canonical, { shortElementMm: 6, toleranceMm: 0.1, snapToleranceMm: 6, angleToleranceDeg: 5, originToleranceMm: 0.1 });
const codes = new Set(report.findings.map((row) => row.code));
for (const code of ['SHORT_ELEMENT', 'RIGHT_ANGLE_WITHOUT_BEND', 'CENTERLINE_CLASH', 'OVERLAPPING_ELEMENTS', 'ORPHAN_NODE', 'ORIGIN_DEFAULTED']) assert(codes.has(code), `missing ${code}`);
assert.equal(report.findings.every((row) => row.color && row.icon && Object.hasOwn(row, 'canvasFix')), true);
assert.equal(report.summary.findingCount, report.findings.length);
const checker = runTopologyChecks(canonical, { shortElementMm: 6, toleranceMm: 0.1, snapToleranceMm: 25, angleToleranceDeg: 5, originToleranceMm: 0.1, clearanceMm: 0 });
assert.equal(checker.schema, 'TopologyCheckReport.v1');
assert(checker.issues.every((issue) => issue.schema === 'TopologyIssue.v1'));
const suggestions = buildTopologyFixSuggestions(canonical, checker, {});
assert(suggestions.some((row) => row.operations.some((operation) => operation.type === 'ADD_BEND_DEFINITION')));
const review = createTopologyReviewState(checker), issueId = checker.issues[0].id;
const suppressed = setTopologyIssueStatus(checker, review, issueId, 'SUPPRESSED', 'Accepted fixture condition.');
assert.equal(topologyReviewSummary(checker, suppressed).suppressedCount, 1);
assert.throws(() => setTopologyIssueStatus(checker, review, issueId, 'SUPPRESSED', ''), /requires a reason/);
console.log('component topology checker passed: detection, contracts, suggestions, and review state verified.');
