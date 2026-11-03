import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildDeterministicAivCanvasLayout,
  createAivCanvasLayout,
  moveAivCanvasLayoutNode,
} from '../converters/vibration/aiv/aiv-canvas-layout-contract.js';

function projection() {
  return Object.freeze({
    schema: 'AivCanvasProjection.v1',
    nodes: Object.freeze([
      Object.freeze({ nodeKey: 'ASSESSMENT:A-1', canonicalId: 'A-1', nodeKind: 'ASSESSMENT', caseId: null, line: 'L-1' }),
      Object.freeze({ nodeKey: 'SOURCE:S-1:C-2', canonicalId: 'S-1', nodeKind: 'SOURCE', caseId: 'C-2', line: 'L-1' }),
      Object.freeze({ nodeKey: 'PATH:P-1', canonicalId: 'P-1', nodeKind: 'PATH', caseId: null, line: 'L-1' }),
      Object.freeze({ nodeKey: 'SOURCE:S-1:C-1', canonicalId: 'S-1', nodeKind: 'SOURCE', caseId: 'C-1', line: 'L-1' }),
    ]),
    relationships: Object.freeze([]),
  });
}

test('deterministic layout is stable and uses conceptual lanes rather than engineering scale', () => {
  const first = buildDeterministicAivCanvasLayout(projection());
  const second = buildDeterministicAivCanvasLayout(projection());
  assert.deepEqual(first, second);
  const byKey = new Map(first.nodes.map((node) => [node.nodeKey, node]));
  assert.equal(byKey.get('SOURCE:S-1:C-1').x, 120);
  assert.equal(byKey.get('PATH:P-1').x, 360);
  assert.equal(byKey.get('ASSESSMENT:A-1').x, 620);
});

test('moving a layout node changes presentation coordinates only and leaves projection untouched', () => {
  const input = projection();
  const snapshot = structuredClone(input);
  const layout = buildDeterministicAivCanvasLayout(input);
  const moved = moveAivCanvasLayoutNode(layout, 'ASSESSMENT:A-1', 900, 700);
  const node = moved.nodes.find((item) => item.nodeKey === 'ASSESSMENT:A-1');
  assert.equal(node.x, 900);
  assert.equal(node.y, 700);
  assert.deepEqual(input, snapshot);
});

test('layout validates duplicate presentation node keys and invalid viewport values', () => {
  assert.throws(() => createAivCanvasLayout({
    nodes: [
      { nodeKey: 'SOURCE:S:C', canonicalId: 'S', x: 1, y: 2 },
      { nodeKey: 'SOURCE:S:C', canonicalId: 'S', x: 3, y: 4 },
    ],
  }), /Duplicate AIV canvas layout nodeKey/u);
  assert.throws(() => createAivCanvasLayout({ viewport: { x: 0, y: 0, zoom: 0 } }), /must be positive/u);
});

test('canvas foundation modules remain compact and contain no numerical AIV equations', () => {
  for (const path of [
    '../converters/vibration/aiv/aiv-canvas-layout-contract.js',
    '../converters/vibration/aiv/aiv-canvas-projection.js',
    '../tabs/vibration-aiv-canvas-view.js',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert(source.split(/\r?\n/u).length < 300, `${path} must remain below 300 physical lines.`);
    assert.doesNotMatch(source, /Math\.(?:log10|log|tanh|pow)|calculateAiv|aiv-kernel-candidate/u);
  }
});
