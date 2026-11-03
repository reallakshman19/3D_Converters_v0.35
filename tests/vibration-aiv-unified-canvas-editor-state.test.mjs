import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIV_UNIFIED_CANVAS_EDITOR_TOOL,
  advanceAivUnifiedCanvasSegmentConnection,
  aivUnifiedCanvasEditorInstruction,
  createAivUnifiedCanvasEditorState,
  setAivUnifiedCanvasEditorTool,
} from '../tabs/vibration-aiv-unified-canvas-editor.js';

test('editor starts in SELECT and explicit tool changes clear stale connection state', () => {
  const initial = createAivUnifiedCanvasEditorState();
  assert.equal(initial.tool, AIV_UNIFIED_CANVAS_EDITOR_TOOL.SELECT);
  assert.match(aivUnifiedCanvasEditorInstruction(initial), /Select an object/u);

  const connect = setAivUnifiedCanvasEditorTool(initial, AIV_UNIFIED_CANVAS_EDITOR_TOOL.CONNECT_SEGMENT);
  const started = advanceAivUnifiedCanvasSegmentConnection(connect, 'RV-101').state;
  assert.equal(started.segmentFromNodeId, 'RV-101');

  const place = setAivUnifiedCanvasEditorTool(started, AIV_UNIFIED_CANVAS_EDITOR_TOOL.PLACE_NODE);
  assert.equal(place.segmentFromNodeId, null);
  assert.match(aivUnifiedCanvasEditorInstruction(place), /Click empty canvas space/u);
});

test('two-node connection gesture emits directed endpoints and resets to SELECT', () => {
  let state = setAivUnifiedCanvasEditorTool(
    createAivUnifiedCanvasEditorState(),
    AIV_UNIFIED_CANVAS_EDITOR_TOOL.CONNECT_SEGMENT,
  );
  const first = advanceAivUnifiedCanvasSegmentConnection(state, 'RV-101');
  assert.equal(first.completed, null);
  assert.equal(first.state.segmentFromNodeId, 'RV-101');

  const second = advanceAivUnifiedCanvasSegmentConnection(first.state, 'J-101');
  assert.deepEqual(second.completed, { fromNodeId: 'RV-101', toNodeId: 'J-101' });
  assert.equal(second.state.tool, AIV_UNIFIED_CANVAS_EDITOR_TOOL.SELECT);
  assert.equal(second.state.segmentFromNodeId, null);
});

test('connection gesture rejects a self-loop before graph mutation', () => {
  const connect = setAivUnifiedCanvasEditorTool(
    createAivUnifiedCanvasEditorState(),
    AIV_UNIFIED_CANVAS_EDITOR_TOOL.CONNECT_SEGMENT,
  );
  const first = advanceAivUnifiedCanvasSegmentConnection(connect, 'J-101').state;
  assert.throws(
    () => advanceAivUnifiedCanvasSegmentConnection(first, 'J-101'),
    /requires two different nodes/u,
  );
});
