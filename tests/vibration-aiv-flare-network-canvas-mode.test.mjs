import assert from 'node:assert/strict';
import test from 'node:test';

import { AIV_CANVAS_MODE, createAivCanvasRelationshipState, setAivCanvasRelationshipMode } from '../tabs/vibration-aiv-canvas-relationship.js';

test('AIV canvas exposes dedicated NETWORK authoring mode without changing relationship semantics', () => {
  assert.equal(AIV_CANVAS_MODE.NETWORK, 'NETWORK');
  const network = setAivCanvasRelationshipMode(createAivCanvasRelationshipState(), AIV_CANVAS_MODE.NETWORK);
  assert.equal(network.mode, 'NETWORK');
  assert.equal(network.pendingSource, null);
});
