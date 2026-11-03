export const AIV_CANVAS_MODE = Object.freeze({
  NAVIGATE: 'NAVIGATE',
  NETWORK: 'NETWORK',
  RELATIONSHIPS: 'RELATIONSHIPS',
  RESULTS: 'RESULTS',
});

function text(value) {
  return String(value ?? '').trim();
}

function validMode(value) {
  return Object.values(AIV_CANVAS_MODE).includes(value) ? value : AIV_CANVAS_MODE.NAVIGATE;
}

export function createAivCanvasRelationshipState(input = {}) {
  const pending = input.pendingSource ?? null;
  return Object.freeze({
    mode: validMode(input.mode),
    pendingSource: pending ? Object.freeze({ ...pending }) : null,
  });
}

export function setAivCanvasRelationshipMode(stateInput, mode) {
  const state = createAivCanvasRelationshipState(stateInput);
  return createAivCanvasRelationshipState({
    mode: validMode(mode),
    pendingSource: null,
  });
}

export function aivCanvasRelationshipEndpoint(element) {
  const nodeKind = text(element?.dataset?.aivCanvasNodeKind);
  const canonicalId = text(element?.dataset?.aivCanvasCanonicalId);
  if (nodeKind === 'SOURCE') {
    const caseId = text(element.dataset.aivCanvasCaseId);
    return canonicalId && caseId
      ? Object.freeze({ nodeKind, canonicalId, caseId, selectionKey: text(element.dataset.aivSelectionKey) })
      : null;
  }
  if (nodeKind === 'ASSESSMENT') {
    return canonicalId
      ? Object.freeze({ nodeKind, canonicalId, caseId: null, selectionKey: text(element.dataset.aivSelectionKey) })
      : null;
  }
  return null;
}

export function advanceAivCanvasRelationshipState(stateInput, endpoint) {
  const state = createAivCanvasRelationshipState(stateInput);
  if (state.mode !== AIV_CANVAS_MODE.RELATIONSHIPS || !endpoint) {
    return Object.freeze({ state, createRequest: null });
  }
  if (endpoint.nodeKind === 'SOURCE') {
    return Object.freeze({
      state: createAivCanvasRelationshipState({ mode: state.mode, pendingSource: endpoint }),
      createRequest: null,
    });
  }
  if (endpoint.nodeKind !== 'ASSESSMENT' || !state.pendingSource) {
    return Object.freeze({ state, createRequest: null });
  }
  return Object.freeze({
    state: createAivCanvasRelationshipState({ mode: state.mode, pendingSource: null }),
    createRequest: Object.freeze({
      sourceCanonicalId: state.pendingSource.canonicalId,
      assessmentCanonicalId: endpoint.canonicalId,
      caseId: state.pendingSource.caseId,
    }),
  });
}

export function aivCanvasRelationshipIdentityFromElement(element) {
  const sourceCanonicalId = text(element?.dataset?.aivSourceCanonicalId);
  const assessmentCanonicalId = text(element?.dataset?.aivAssessmentCanonicalId);
  const caseId = text(element?.dataset?.aivCaseId);
  if (!sourceCanonicalId || !assessmentCanonicalId || !caseId) return null;
  return Object.freeze({ sourceCanonicalId, assessmentCanonicalId, caseId });
}

export function aivCanvasRelationshipSelectionKey(input = {}) {
  const sourceCanonicalId = text(input.sourceCanonicalId);
  const assessmentCanonicalId = text(input.assessmentCanonicalId);
  const caseId = text(input.caseId);
  if (!sourceCanonicalId || !assessmentCanonicalId || !caseId) return null;
  return `REL:${sourceCanonicalId}:${assessmentCanonicalId}:${caseId}`;
}
