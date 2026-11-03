import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aivCanvasClampPointToWorkspace,
  aivCanvasFitViewport,
  aivCanvasTidyLayout,
  aivCanvasWorkspaceBounds,
} from '../tabs/vibration-aiv-canvas-workspace.js';
import {
  AIV_CANVAS_SEMANTIC_LEVEL,
  aivCanvasSemanticLevel,
  resolveAivCanvasLabelPlacements,
} from '../tabs/vibration-aiv-canvas-label-layout.js';

const nodes = [
  { nodeKey: 'SOURCE:RV-1:C', canonicalId: 'RV-1', nodeKind: 'SOURCE', x: 50, y: 90, displayOrder: 0 },
  { nodeKey: 'NETWORK_NODE:J-1', canonicalId: 'J-1', nodeKind: 'JUNCTION', x: 330, y: 240, displayOrder: 1 },
  { nodeKey: 'ASSESSMENT:WO-1', canonicalId: 'WO-1', nodeKind: 'ASSESSMENT', x: 940, y: 600, displayOrder: 2 },
];

test('workspace expands beyond the SVG viewport and clamps node centers inside a recoverable inset', () => {
  const bounds = aivCanvasWorkspaceBounds(nodes);
  assert.ok(bounds.width >= 1200);
  assert.ok(bounds.height >= 760);
  const point = aivCanvasClampPointToWorkspace({ x: bounds.right + 500, y: bounds.bottom + 500 }, bounds, { inset: 44 });
  assert.equal(point.x, bounds.right - 44);
  assert.equal(point.y, bounds.bottom - 44);
});

test('fit viewport centers content without mutating engineering coordinates', () => {
  const before = structuredClone(nodes);
  const viewport = aivCanvasFitViewport(nodes, { width: 900, height: 520 });
  assert.ok(Number.isFinite(viewport.x) && Number.isFinite(viewport.y));
  assert.ok(viewport.zoom >= 0.35 && viewport.zoom <= 1.4);
  assert.deepEqual(nodes, before);
});

test('auto tidy is deterministic and keeps sources left of routing nodes and assessments', () => {
  const layout = { nodes, viewport: { x: 0, y: 0, zoom: 1 } };
  const edges = [{ from: 'RV-1', to: 'J-1' }, { from: 'J-1', to: 'WO-1' }];
  const first = aivCanvasTidyLayout(layout, edges);
  const second = aivCanvasTidyLayout(layout, edges);
  assert.deepEqual(first, second);
  const byId = new Map(first.nodes.map((node) => [node.canonicalId, node]));
  assert.ok(byId.get('RV-1').x < byId.get('J-1').x);
  assert.ok(byId.get('J-1').x < byId.get('WO-1').x);
});

test('dense flare tidy remains deterministic and expands the workspace instead of pushing nodes out of reach', () => {
  const sources = Array.from({ length: 12 }, (_, index) => ({
    nodeKey: `SOURCE:RV-${index + 1}:C`, canonicalId: `RV-${index + 1}`, nodeKind: 'SOURCE',
    x: 60, y: 60 + index * 20, displayOrder: index,
  }));
  const routing = ['J-A', 'J-B', 'J-C'].map((id, index) => ({
    nodeKey: `NETWORK_NODE:${id}`, canonicalId: id, nodeKind: 'JUNCTION', x: 300, y: 120 + index * 120, displayOrder: 20 + index,
  }));
  const assessment = { nodeKey: 'ASSESSMENT:WO-DENSE', canonicalId: 'WO-DENSE', nodeKind: 'ASSESSMENT', x: 700, y: 250, displayOrder: 30 };
  const dense = [...sources, ...routing, assessment];
  const edges = sources.map((node, index) => ({ from: node.canonicalId, to: routing[Math.floor(index / 4)].canonicalId }))
    .concat(routing.map((node) => ({ from: node.canonicalId, to: assessment.canonicalId })));
  const tidied = aivCanvasTidyLayout({ nodes: dense, viewport: { x: 0, y: 0, zoom: 1 } }, edges);
  assert.deepEqual(tidied, aivCanvasTidyLayout({ nodes: dense, viewport: { x: 0, y: 0, zoom: 1 } }, edges));
  assert.equal(new Set(tidied.nodes.map((node) => `${node.x}:${node.y}`)).size, tidied.nodes.length);
  const bounds = aivCanvasWorkspaceBounds(tidied.nodes);
  assert.ok(bounds.height > 1200, '12 source rows should expand the recoverable workspace vertically');
  assert.ok(tidied.nodes.every((node) => node.x >= 0 && node.y >= 0));
});

test('semantic zoom tiers are stable at the intended thresholds', () => {
  assert.equal(aivCanvasSemanticLevel(1), AIV_CANVAS_SEMANTIC_LEVEL.DETAILED);
  assert.equal(aivCanvasSemanticLevel(0.7), AIV_CANVAS_SEMANTIC_LEVEL.COMPACT);
  assert.equal(aivCanvasSemanticLevel(0.4), AIV_CANVAS_SEMANTIC_LEVEL.OVERVIEW);
});

test('collision solver deterministically moves a lower-priority overlapping label', () => {
  const items = [
    { id: 'selected', priority: 100, rect: { left: 100, top: 100, width: 80, height: 24 } },
    { id: 'other', priority: 10, rect: { left: 100, top: 100, width: 80, height: 24 } },
  ];
  const result = resolveAivCanvasLabelPlacements(items, [], { step: 24 });
  const selected = result.find((item) => item.id === 'selected');
  const other = result.find((item) => item.id === 'other');
  assert.deepEqual([selected.dx, selected.dy], [0, 0]);
  assert.notDeepEqual([other.dx, other.dy], [0, 0]);
  assert.deepEqual(result, resolveAivCanvasLabelPlacements(items, [], { step: 24 }));
});

test('collision solver considers fixed glyph/control obstacles', () => {
  const result = resolveAivCanvasLabelPlacements(
    [{ id: 'label', priority: 1, rect: { left: 20, top: 20, width: 60, height: 20 } }],
    [{ left: 20, top: 20, width: 60, height: 20 }],
    { step: 24 },
  );
  assert.notDeepEqual([result[0].dx, result[0].dy], [0, 0]);
});
