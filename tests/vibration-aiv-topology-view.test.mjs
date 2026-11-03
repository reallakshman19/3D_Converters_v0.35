import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildVibrationTopologyGraph,
  resolveVibrationTopologyPath,
} from '../converters/vibration/topology/graph.js';
import { buildAivTopologyViewModel } from '../converters/vibration/aiv/aiv-topology-view-model.js';
import { renderAivTopologyPathHtml } from '../tabs/vibration-aiv-path-view.js';
import { AIV_INLINE_SYMBOL_LINEAGE } from '../tabs/vibration-aiv-inline-symbols.js';
import { renderAivQualificationWorkspaceHtml } from '../tabs/vibration-aiv-qualification-view.js';

const ROOT = new URL('../', import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, ROOT), 'utf8');

function exchange(elements, connections) {
  return {
    sourceSchema: 'TopologyEditTableHumanExport.v1',
    sourceFormat: 'XLSX',
    integrityStatus: 'DECLARED_NOT_REVERIFIED',
    authority: {
      canonicalHash: 'canonical-1', projectionHash: 'projection-1', sourceHash: 'source-1',
      datasetId: 'DS-1', datasetVersion: '12', sourceExportHash: 'export-1',
    },
    elements,
    connections,
  };
}

const straight = exchange([
  { canonicalId: 'CAN-PSV-1', tag: 'PSV-101', type: 'RELIEF_VALVE', line: '10-FG-101', sourceStatus: 'CERTIFIED' },
  { canonicalId: 'CAN-P-1', tag: 'P-101', type: 'PIPE', line: '10-FG-101', lengthMm: 800, sourceStatus: 'CERTIFIED' },
  { canonicalId: 'CAN-WO-1', tag: 'WO-103', type: 'OLET', line: '10-FG-101', sourceStatus: 'CERTIFIED' },
], [
  { canonicalId: 'CAN-PSV-1', nodeId: 'N-1' },
  { canonicalId: 'CAN-P-1', nodeId: 'N-1' },
  { canonicalId: 'CAN-P-1', nodeId: 'N-2' },
  { canonicalId: 'CAN-WO-1', nodeId: 'N-2' },
]);

test('certified Connections produce a deterministic source-to-assessment row path', () => {
  const graph = buildVibrationTopologyGraph(straight);
  const path = resolveVibrationTopologyPath(graph, {
    sourceCanonicalId: 'CAN-PSV-1', assessmentCanonicalId: 'CAN-WO-1',
  });
  assert.equal(path.status, 'RESOLVED');
  assert.deepEqual(path.orderedCanonicalIds, ['CAN-PSV-1', 'CAN-P-1', 'CAN-WO-1']);
  assert.deepEqual(path.elements.map((row) => row.role), ['SOURCE', 'PROPAGATION_PATH', 'ASSESSMENT']);
  assert.equal(path.alternateRouteDetected, false);
  assert.equal(path.authority.canonicalHash, 'canonical-1');
});

test('topology visualization never invents physical AIV distance from component length or pixels', () => {
  const model = buildAivTopologyViewModel(straight, {
    sourceCanonicalId: 'CAN-PSV-1', assessmentCanonicalId: 'CAN-WO-1',
  });
  assert.equal(model.pathStatus, 'RESOLVED');
  assert.equal(model.rows[1].declaredLengthMm, 800);
  assert.equal(model.physicalDistanceMm, null);
  assert.equal(model.distanceStatus, 'NOT_DERIVED_BY_TOPOLOGY_VIEW');
  assert(model.notes.some((note) => /not derived/u.test(note)));
});

test('equally short ambiguous certified paths fail closed instead of choosing a convenient branch', () => {
  const input = exchange([
    { canonicalId: 'S', type: 'VALVE' }, { canonicalId: 'P1', type: 'PIPE' },
    { canonicalId: 'P2', type: 'PIPE' }, { canonicalId: 'A', type: 'OLET' },
  ], [
    { canonicalId: 'S', nodeId: 'N0' }, { canonicalId: 'P1', nodeId: 'N0' }, { canonicalId: 'P2', nodeId: 'N0' },
    { canonicalId: 'P1', nodeId: 'N1' }, { canonicalId: 'A', nodeId: 'N1' },
    { canonicalId: 'P2', nodeId: 'N2' }, { canonicalId: 'A', nodeId: 'N2' },
  ]);
  const model = buildAivTopologyViewModel(input, { sourceCanonicalId: 'S', assessmentCanonicalId: 'A' });
  assert.equal(model.pathStatus, 'AMBIGUOUS_SHORTEST_PATH');
  assert.equal(model.shortestPathCount, 2);
  assert.equal(model.rows.length, 0);
  assert.match(model.diagnostics[0].code, /AMBIGUOUS_SHORTEST_PATH/u);
});

test('a longer alternate certified route also fails closed instead of selecting the shortest hop path', () => {
  const input = exchange([
    { canonicalId: 'S', type: 'VALVE' }, { canonicalId: 'P1', type: 'PIPE' },
    { canonicalId: 'P2', type: 'PIPE' }, { canonicalId: 'P3', type: 'PIPE' },
    { canonicalId: 'A', type: 'OLET' },
  ], [
    { canonicalId: 'S', nodeId: 'N0' }, { canonicalId: 'P1', nodeId: 'N0' },
    { canonicalId: 'P1', nodeId: 'N1' }, { canonicalId: 'A', nodeId: 'N1' },
    { canonicalId: 'S', nodeId: 'N2' }, { canonicalId: 'P2', nodeId: 'N2' },
    { canonicalId: 'P2', nodeId: 'N3' }, { canonicalId: 'P3', nodeId: 'N3' },
    { canonicalId: 'P3', nodeId: 'N4' }, { canonicalId: 'A', nodeId: 'N4' },
  ]);
  const model = buildAivTopologyViewModel(input, { sourceCanonicalId: 'S', assessmentCanonicalId: 'A' });
  assert.equal(model.pathStatus, 'AMBIGUOUS_TOPOLOGY_PATH');
  assert.equal(model.alternateRouteDetected, true);
  assert.equal(model.rows.length, 0);
  assert.match(model.diagnostics[0].message, /will not choose a route/u);
});

test('AIV path UI uses inline SVG table glyphs without becoming a geometry/model viewer', () => {
  const model = buildAivTopologyViewModel(straight, {
    sourceCanonicalId: 'CAN-PSV-1', assessmentCanonicalId: 'CAN-WO-1',
  });
  const html = renderAivTopologyPathHtml(model);
  assert.match(html, /<table/u);
  assert.match(html, /<svg/u);
  assert.match(html, /READ ONLY · NOT GEOMETRY AUTHORITY/u);
  assert.match(html, /Physical AIV distance <strong>UNRESOLVED/u);
  assert.match(html, /CAN-PSV-1/u);
  assert.match(html, /CAN-WO-1/u);
  assert.doesNotMatch(html, /<canvas|ISO|\bXY\b|\bXZ\b|\bYZ\b/u);
});

test('Advanced_Analysis reuse is source-pinned and limited to inline presentation lineage', () => {
  assert.equal(AIV_INLINE_SYMBOL_LINEAGE.sourceRepository, 'reallaksh19/Advanced_Analysis');
  assert.equal(AIV_INLINE_SYMBOL_LINEAGE.sourceRevision, '6463b39866f68eb6476bfa41764538eb19f8b9f9');
  assert.equal(AIV_INLINE_SYMBOL_LINEAGE.adaptation, 'INLINE_TABLE_GLYPHS_ONLY');
  assert.equal(AIV_INLINE_SYMBOL_LINEAGE.geometryAuthority, false);
});

test('AIV qualification workspace exposes EI coverage gaps without execution controls', () => {
  const html = renderAivQualificationWorkspaceHtml();
  assert.match(html, /VIB\.AIV\.ACOUSTIC/u);
  assert.match(html, /BLOCKED/u);
  assert.match(html, /#441/u);
  assert.match(html, /fb549185b9b27edc2379734240320a85c5bef9f6/u);
  assert.match(html, /ceee15ed5f7f320045d5f3979024e2e8664613f2/u);
  assert.match(html, /Sonic SFF = 6 branch/u);
  assert.match(html, /GAP/u);
  assert.doesNotMatch(html, /Run AIV benchmark|Run AIV screening|data-action="calculate"/u);
});

test('AIV UI foundation contains no engineering equations, 3D projection or authoring runtime', () => {
  const combined = [
    source('tabs/vibration-aiv-inline-symbols.js'),
    source('tabs/vibration-aiv-path-view.js'),
    source('tabs/vibration-aiv-qualification-view.js'),
    source('converters/vibration/aiv/aiv-topology-view-model.js'),
  ].join('\n');
  assert.doesNotMatch(combined, /calculateEngineering|calculateAiv|PWL\s*=|LOF\s*=|project3DPoint|three\.js/u);
  assert.doesNotMatch(combined, /SequentialCommandGateway|WorkspaceState|EventBus|updateEntityGeometry|executeQuickAction/u);
  assert.doesNotMatch(combined, /<canvas|createElement\(['"]canvas/iu);
});

test('registered AIV placeholder points to dedicated qualification issue 441', () => {
  const pending = source('converters/engineering-calculations/pending-definitions.js');
  assert.match(pending, /\['VIB\.AIV\.ACOUSTIC', 'VIB', 'Acoustic-Induced Vibration Screening', 441\]/u);
  assert.match(pending, /VIBRATION_AIV_QUALIFICATION_WORKSPACE/u);
});
