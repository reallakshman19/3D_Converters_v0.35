export const AIV_UNIFIED_CANVAS_EDITOR_TOOL = Object.freeze({
  SELECT: 'SELECT',
  PLACE_NODE: 'PLACE_NODE',
  CONNECT_SEGMENT: 'CONNECT_SEGMENT',
});

const TOOLS = new Set(Object.values(AIV_UNIFIED_CANVAS_EDITOR_TOOL));

function text(value) { return String(value ?? '').trim(); }

export function createAivUnifiedCanvasEditorState() {
  return Object.freeze({ tool: AIV_UNIFIED_CANVAS_EDITOR_TOOL.SELECT, segmentFromNodeId: null });
}

export function setAivUnifiedCanvasEditorTool(state, tool) {
  const next = text(tool).toUpperCase();
  if (!TOOLS.has(next)) throw new RangeError(`Unsupported AIV unified canvas editor tool ${tool}.`);
  return Object.freeze({
    tool: next,
    segmentFromNodeId: next === AIV_UNIFIED_CANVAS_EDITOR_TOOL.CONNECT_SEGMENT
      ? state?.segmentFromNodeId ?? null
      : null,
  });
}

export function advanceAivUnifiedCanvasSegmentConnection(state, canonicalId) {
  const nodeId = text(canonicalId);
  if (state?.tool !== AIV_UNIFIED_CANVAS_EDITOR_TOOL.CONNECT_SEGMENT || !nodeId) {
    return Object.freeze({ state, completed: null });
  }
  if (!state.segmentFromNodeId) {
    return Object.freeze({
      state: Object.freeze({ ...state, segmentFromNodeId: nodeId }),
      completed: null,
    });
  }
  if (state.segmentFromNodeId === nodeId) {
    throw new RangeError('AIV canvas pipe connection requires two different nodes.');
  }
  return Object.freeze({
    state: createAivUnifiedCanvasEditorState(),
    completed: Object.freeze({ fromNodeId: state.segmentFromNodeId, toNodeId: nodeId }),
  });
}

export function aivUnifiedCanvasEditorInstruction(state) {
  if (state?.tool === AIV_UNIFIED_CANVAS_EDITOR_TOOL.PLACE_NODE) {
    return 'Click empty canvas space to place the drafted node.';
  }
  if (state?.tool === AIV_UNIFIED_CANVAS_EDITOR_TOOL.CONNECT_SEGMENT) {
    return state.segmentFromNodeId
      ? `Select the destination node. Start: ${state.segmentFromNodeId}.`
      : 'Select the first node, then the destination node.';
  }
  return 'Select an object to inspect or edit it. Drag network nodes to change presentation only.';
}
